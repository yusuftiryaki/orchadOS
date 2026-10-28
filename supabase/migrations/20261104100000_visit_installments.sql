-- Per-visit payment plan (docs/musteri-yonetimi.md §5.6, §6.13; product owner
-- decisions of 28 October 2026; docs/hukuk/kararlar.md H35).
--
-- 1. org_billing_setting.installment_lead_days (SQL only, default 14): how many
--    days before its visit window a visit installment is due. New quotes
--    freeze it in quote.inputs.installments (formula installments-v1).
-- 2. public.order_installment and public.order_installment_item: the schedule
--    of an order and each installment's share per order line. payment gets
--    order_installment_id: a payment pays exactly one installment.
-- 3. The package visit calendar (docs/fiyatlandirma.md §1), the schedule of a
--    quote (private.installment_schedule; public.quote_installment_plan for the
--    quote page) and its creation on acceptance (customer_accept_quote).
--    The inventory (net + VAT) is installment 1, due within the payment
--    period; the rest is split per line into as many installments as the
--    order has visits, equally in kuruş with the remainder on the last one;
--    visit installment k is due installment_lead_days before the window start
--    of visit k, not before acceptance.
-- 4. Payments: payment_begin charges the earliest open installment; a bank
--    transfer is recorded against one installment, or spread over the open
--    installments in order (one payment row and receipt per installment);
--    complete_payment credits the installment and refunds what it cannot
--    take (overpayment, order_closed). The order activates when its first
--    installment is paid (private.order_activatable); zero-total orders as
--    before. Lock order: order → payment → installment.
-- 5. Existing orders get one 'single' installment of their total, paid as far
--    as the order is (backfill), so every payment references an installment.
--
-- Orders that end (cancelled, terminated, completed) cancel their unpaid
-- installments, except those whose visit ops let go ahead unpaid
-- (20261104100100_installment_visits_removals.sql).

-- ---------------------------------------------------------------------------
-- 1. Setting
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting
  add column installment_lead_days integer not null default 14 check (installment_lead_days between 0 and 60);
comment on column public.org_billing_setting.installment_lead_days is
  'SQL only: a visit installment is due this many days before its visit window starts (installments-v1; changing it changes the contract text and its version). New quotes freeze it in inputs.installments.';

-- As in 20261103100100_legal_text_registry.sql, with the default of
-- installment_lead_days.
create or replace function private.billing_setting(p_org_id uuid)
returns public.org_billing_setting
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.org_billing_setting;
begin
  select * into r from public.org_billing_setting s where s.org_id = p_org_id;
  if not found then
    r.org_id := p_org_id;
    r.accepts_signups := false;
    r.allow_fake_payments := false;
    r.identity_number_required := false;
    r.payment_due_days := 14;
    r.quote_valid_days := 30;
    r.renewal_notice_days := 45;
    r.garden_changes_enabled := false;
    r.addon_min_days := 30;
    r.removal_notice_days := 30;
    r.removal_access_days := 90;
    r.removal_refund_mode := 'unused_visits';
    r.marketing_consent_enabled := false;
    r.inventory_reuse_months := 24;
    r.installment_lead_days := 14;
  end if;
  return r;
end;
$$;

-- New quotes carry the plan's terms: inputs.installments = {formula, lead_days}.
create function private.quote_installment_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.inputs := coalesce(new.inputs, '{}'::jsonb) || jsonb_build_object('installments', jsonb_build_object(
    'formula', 'installments-v1',
    'lead_days', (private.billing_setting(new.org_id)).installment_lead_days));
  return new;
end;
$$;
revoke all on function private.quote_installment_terms() from public;

create trigger quote_installment_terms before insert on public.quote
for each row execute function private.quote_installment_terms();

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create type public.installment_kind as enum ('inventory', 'visit', 'single');
create type public.installment_status as enum ('pending', 'paid', 'cancelled');

create table public.order_installment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  order_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  seq smallint not null check (seq between 1 and 13),
  kind public.installment_kind not null,
  visit_no smallint check (visit_no between 1 and 12),
  window_code text check (window_code ~ '^[a-z][a-z_]{1,31}$'),
  window_name text check (length(window_name) <= 40),
  window_start date,
  window_end date check (window_end >= window_start),
  amount_kurus bigint not null check (amount_kurus > 0),
  vat_kurus bigint not null check (vat_kurus >= 0 and vat_kurus <= amount_kurus),
  paid_kurus bigint not null default 0 check (paid_kurus >= 0),
  cancelled_kurus bigint not null default 0 check (cancelled_kurus >= 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  due_on date not null,
  status public.installment_status not null default 'pending',
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason ~ '^[a-z][a-z0-9_]*$'),
  reminder_sent_at timestamptz,
  due_reminder_sent_at timestamptz,
  visit_override_at timestamptz,
  visit_override_by uuid references auth.users (id) on delete set null,
  visit_override_note text check (length(visit_override_note) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seq),
  unique (order_id, visit_no),
  unique (id, order_id),
  foreign key (order_id, customer_user_id, org_id) references public.service_order (id, customer_user_id, org_id),
  check ((kind = 'visit') = (visit_no is not null)),
  check (paid_kurus + cancelled_kurus <= amount_kurus),
  check (status <> 'pending' or paid_kurus + cancelled_kurus < amount_kurus),
  check (status = 'pending' or paid_kurus + cancelled_kurus = amount_kurus),
  check ((status = 'paid') = (paid_at is not null)),
  check (status <> 'paid' or paid_kurus > 0),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((visit_override_at is null) = (visit_override_note is null))
);
comment on table public.order_installment is
  'Payment plan of an order (installments-v1): inventory, visit or single (orders before the plan). due = amount - cancelled - paid.';
comment on column public.order_installment.cancelled_kurus is
  'Taken off the installment: a garden removal or withdrawal (its unpaid share), or the end of the order (the rest).';
comment on column public.order_installment.visit_override_at is
  'Ops let the visit of this unpaid installment be planned (note required, audited).';
create index order_installment_customer_idx on public.order_installment (customer_user_id);
create index order_installment_open_idx on public.order_installment (due_on) where status = 'pending';

create table public.order_installment_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  installment_id uuid not null,
  order_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  order_item_id uuid not null references public.service_order_item (id),
  amount_kurus bigint not null check (amount_kurus > 0),
  vat_kurus bigint not null check (vat_kurus >= 0 and vat_kurus <= amount_kurus),
  paid_kurus bigint not null default 0 check (paid_kurus >= 0),
  cancelled_kurus bigint not null default 0 check (cancelled_kurus >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installment_id, order_item_id),
  foreign key (installment_id, order_id) references public.order_installment (id, order_id),
  check (paid_kurus + cancelled_kurus <= amount_kurus)
);
comment on table public.order_installment_item is
  'Share of an order line in an installment; paid and cancelled amounts per line (removal refunds and cuts are per line).';
create index order_installment_item_line_idx on public.order_installment_item (order_item_id);
create index order_installment_item_customer_idx on public.order_installment_item (customer_user_id);

-- The amounts and identity of a plan row never change; a row is never deleted.
create function private.order_installment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE on % is not allowed', tg_table_name using errcode = 'P0001';
  end if;
  if private.only_unlinks_users(to_jsonb(old), to_jsonb(new), array['visit_override_by']) then
    return new;
  end if;
  if tg_table_name = 'order_installment' then
    if (new.id, new.org_id, new.order_id, new.customer_user_id, new.seq, new.kind, new.visit_no, new.amount_kurus,
        new.vat_kurus, new.currency)
       is distinct from
       (old.id, old.org_id, old.order_id, old.customer_user_id, old.seq, old.kind, old.visit_no, old.amount_kurus,
        old.vat_kurus, old.currency) then
      raise exception 'installment_frozen' using errcode = 'P0001',
        hint = 'The amount and identity of an installment never change.';
    end if;
    -- A paid or cancelled row stays so; a paid one opens again only when
    -- its credit is taken back (a voided bank transfer).
    if old.status <> 'pending' and new.status is distinct from old.status
       and not (old.status = 'paid' and new.status = 'pending' and new.paid_kurus < old.paid_kurus) then
      raise exception 'installment_frozen' using errcode = 'P0001', hint = 'A paid or cancelled installment stays so.';
    end if;
  else
    if (to_jsonb(new) - array['paid_kurus', 'cancelled_kurus', 'updated_at'])
       is distinct from (to_jsonb(old) - array['paid_kurus', 'cancelled_kurus', 'updated_at']) then
      raise exception 'installment_frozen' using errcode = 'P0001',
        hint = 'The share of a line in an installment never changes.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.order_installment_guard() from public;

create trigger order_installment_guard before update or delete on public.order_installment
for each row execute function private.order_installment_guard();
create trigger order_installment_item_guard before update or delete on public.order_installment_item
for each row execute function private.order_installment_guard();
create trigger order_installment_touch_updated_at before update on public.order_installment
for each row execute function private.touch_updated_at();
create trigger order_installment_item_touch_updated_at before update on public.order_installment_item
for each row execute function private.touch_updated_at();

select private.attach_demo_guard('public.order_installment');
select private.attach_demo_account_guard('public.order_installment', 'customer_user_id');
select private.attach_demo_guard('public.order_installment_item');
select private.attach_demo_account_guard('public.order_installment_item', 'customer_user_id');

alter table public.order_installment enable row level security;
alter table public.order_installment_item enable row level security;
revoke all on public.order_installment, public.order_installment_item from public, anon, authenticated;
grant select, insert, update, delete on public.order_installment, public.order_installment_item to service_role;

create policy order_installment_select on public.order_installment for select to authenticated
  using (customer_user_id = (select auth.uid()) or org_id in (select authz.user_org_ids('{ops}')));
create policy order_installment_item_select on public.order_installment_item for select to authenticated
  using (customer_user_id = (select auth.uid()) or org_id in (select authz.user_org_ids('{ops}')));

-- Internal columns (visit_override_by, visit_override_note) are read by ops
-- through ops_order_installments. The list equals BILLING_COLUMNS.
grant select (
  id, org_id, order_id, customer_user_id, seq, kind, visit_no, window_code, window_name, window_start, window_end,
  amount_kurus, vat_kurus, paid_kurus, cancelled_kurus, currency, due_on, status, paid_at, cancelled_at,
  cancel_reason, reminder_sent_at, due_reminder_sent_at, visit_override_at, created_at, updated_at
) on public.order_installment to authenticated;
grant select on public.order_installment_item to authenticated;

alter table public.payment add column order_installment_id uuid;
comment on column public.payment.order_installment_id is
  'The installment the payment pays (exactly one; installments-v1). Not the card installment count (installment).';
alter table public.payment
  add constraint payment_installment_fk foreign key (order_installment_id, order_id)
    references public.order_installment (id, order_id);
create index payment_installment_idx on public.payment (order_installment_id);
grant select (order_installment_id) on public.payment to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Backfill: one single installment per existing order with a total
-- ---------------------------------------------------------------------------

with o as (
  select x.*, least(x.paid_kurus, x.total_kurus) as credited, q.vat_kurus as quote_vat
  from public.service_order x join public.quote q on q.id = x.quote_id
  where x.total_kurus > 0
)
insert into public.order_installment (org_id, order_id, customer_user_id, seq, kind, amount_kurus, vat_kurus,
  paid_kurus, cancelled_kurus, due_on, status, paid_at, cancelled_at, cancel_reason)
select o.org_id, o.id, o.customer_user_id, 1, 'single', o.total_kurus, least(o.quote_vat, o.total_kurus),
       case when o.status = 'cancelled' then 0 else o.credited end,
       case when o.status = 'cancelled' then o.total_kurus
            when o.status in ('terminated', 'completed') and o.credited < o.total_kurus then o.total_kurus - o.credited
            else 0 end,
       coalesce(((o.payment_due_at at time zone 'Europe/Istanbul') - interval '1 microsecond')::date,
                (o.created_at at time zone 'Europe/Istanbul')::date),
       case when o.status = 'cancelled' then 'cancelled'
            when o.credited >= o.total_kurus then 'paid'
            when o.status in ('terminated', 'completed') then 'cancelled'
            else 'pending' end::public.installment_status,
       case when o.status <> 'cancelled' and o.credited >= o.total_kurus then coalesce(o.activated_at, now()) end,
       case when o.status = 'cancelled' or (o.status in ('terminated', 'completed') and o.credited < o.total_kurus)
            then coalesce(o.cancelled_at, o.terminated_at, o.completed_at, now()) end,
       case when o.status = 'cancelled' or (o.status in ('terminated', 'completed') and o.credited < o.total_kurus)
            then 'order_' || o.status::text end
from o;

-- Line shares; the paid amount goes to the lines in their order.
insert into public.order_installment_item (org_id, installment_id, order_id, customer_user_id, order_item_id,
  amount_kurus, vat_kurus, paid_kurus, cancelled_kurus)
select i.org_id, i.id, i.order_id, i.customer_user_id, oi.id, oi.amount_kurus,
       least(qi.line_vat_kurus, oi.amount_kurus),
       greatest(0, least(oi.amount_kurus, i.paid_kurus - coalesce(sum(oi.amount_kurus) over w - oi.amount_kurus, 0))),
       oi.amount_kurus - greatest(0, least(oi.amount_kurus,
         i.paid_kurus - coalesce(sum(oi.amount_kurus) over w - oi.amount_kurus, 0)))
         - case when i.status = 'pending' then oi.amount_kurus - greatest(0, least(oi.amount_kurus,
             i.paid_kurus - coalesce(sum(oi.amount_kurus) over w - oi.amount_kurus, 0))) else 0 end
from public.order_installment i
join public.service_order_item oi on oi.order_id = i.order_id
join public.quote_item qi on qi.id = oi.quote_item_id
where i.kind = 'single' and oi.amount_kurus > 0
window w as (partition by i.id order by oi.line_no, oi.id rows between unbounded preceding and current row);

update public.payment p set order_installment_id = i.id
from public.order_installment i
where i.order_id = p.order_id and i.kind = 'single' and p.order_installment_id is null;


alter table public.payment alter column order_installment_id set not null;

-- ---------------------------------------------------------------------------
-- 3. Calendar and schedule
-- ---------------------------------------------------------------------------

-- Visit windows of a package by its yearly visits (docs/fiyatlandirma.md §1,
-- contract Ek-2 from mesafeli-v5-taslak): first and last day of each window.
-- Temel (2): Kış, Hasat; Standart (4): Kış, İlkbahar, Yaz, Hasat; Kapsamlı
-- (6): Kış, Uyanma, İlkbahar, Yaz, Hasat öncesi, Hasat sonrası. Kış ends in
-- the next year. No rows for another count.
create function public.package_visit_windows(p_year_visits integer)
returns table (code text, name text, start_month integer, start_day integer, end_month integer, end_day integer)
language sql
immutable
set search_path = ''
as $$
  select w.code, case when w.code = 'harvest' and p_year_visits = 6 then 'Hasat sonrası' else w.name end,
         w.m, w.d, w.em, w.ed
  from (values
    (1, 'winter', 'Kış', 12, 15, 2, 15, array[2, 4, 6]),
    (2, 'awakening', 'Uyanma', 3, 10, 3, 31, array[6]),
    (3, 'spring', 'İlkbahar', 4, 15, 5, 15, array[4, 6]),
    (4, 'summer', 'Yaz', 7, 1, 7, 25, array[4, 6]),
    (5, 'pre_harvest', 'Hasat öncesi', 8, 1, 8, 20, array[6]),
    (6, 'harvest', 'Hasat', 9, 15, 10, 31, array[2, 4, 6])
  ) w(o, code, name, m, d, em, ed, packages)
  where p_year_visits = any (w.packages)
  order by w.o;
$$;
comment on function public.package_visit_windows(integer) is
  'installments-v1: the visit windows of a package by its yearly visits (code, name, first and last month and day); mirrored in apps/web/src/lib/billing/installments.ts.';

-- The windows of p_visits visits between p_start and p_end (inclusive) for a
-- package of p_year_visits, by date: the first p_visits windows starting in
-- the range; when the range holds fewer, the missing ones come first, start
-- on p_start and have no window (no end). A count without a calendar spreads
-- the visits evenly over the range, without windows.
create function private.installment_windows(p_visits integer, p_year_visits integer, p_start date, p_end date)
returns table (visit_no integer, code text, name text, window_start date, window_end date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_found integer;
begin
  if p_visits is null or p_visits < 1 or p_start is null or p_end is null or p_end < p_start then
    return;
  end if;
  if not exists (select 1 from public.package_visit_windows(p_year_visits)) then
    return query
    select k, null::text, null::text, p_start + floor((k - 1) * (p_end - p_start + 1)::numeric / p_visits)::integer,
           null::date
    from generate_series(1, p_visits) k;
    return;
  end if;
  select count(*) into v_found
  from public.package_visit_windows(p_year_visits) w
  cross join generate_series(extract(year from p_start)::integer, extract(year from p_end)::integer) y
  where make_date(y, w.start_month, w.start_day) between p_start and p_end;
  return query
  select (row_number() over (order by x.o, x.d))::integer, x.code, x.name, x.d, x.e
  from (
    select 0 as o, null::text as code, null::text as name, p_start as d, null::date as e
    from generate_series(1, greatest(p_visits - v_found, 0))
    union all
    select 1, f.code, f.name, f.d, f.e
    from (
      select w.code, w.name, make_date(y, w.start_month, w.start_day) as d,
             make_date(case when w.end_month < w.start_month then y + 1 else y end, w.end_month, w.end_day) as e
      from public.package_visit_windows(p_year_visits) w
      cross join generate_series(extract(year from p_start)::integer, extract(year from p_end)::integer) y
      where make_date(y, w.start_month, w.start_day) between p_start and p_end
      order by 3
      limit p_visits
    ) f
  ) x;
end;
$$;
comment on function private.installment_windows(integer, integer, date, date) is
  'installments-v1: window starts of the visits of a period (the first ones in the range; missing ones on its first day).';

-- The service period an order of the quote would have if accepted (and
-- activated) on p_on: a renewal or first order from its proposed start (or
-- p_on) for a year, an add-on from max(proposed start, p_on) to its base
-- order's end.
create function private.quote_plan_period(q public.quote, p_on date, out period_start date, out period_end date)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if q.addon_of_order_id is not null then
    period_start := greatest(coalesce(q.proposed_service_start, p_on), p_on);
    select x.service_end into period_end from public.service_order x where x.id = q.addon_of_order_id;
  else
    period_start := coalesce(q.proposed_service_start, p_on);
    period_end := (period_start + interval '1 year' - interval '1 day')::date;
  end if;
end;
$$;

-- installments-v1: the payment plan of a quote accepted on p_accept_on with
-- its payment period ending on p_payment_due_on. Per line: the inventory
-- share = inventory fee less its discount, plus its VAT (at most the line);
-- the rest of the line is split into n parts (n = the line's visits),
-- floor(rest / n) each and the remainder on the last; VAT the same way.
-- Installment 1 is the inventory (when any line has one), due on
-- p_payment_due_on; visit installment k sums the k-th parts and is due
-- lead_days before the window start of visit k, not before p_accept_on; the
-- first installment of an order without inventory is due by the payment
-- period at the latest for an add-on, else not before it. Due days never go
-- back. Installments of 0 are left out. items: [{quote_item_id, amount_kurus,
-- vat_kurus}]. due_rule: payment_period, window or acceptance.
create function private.installment_schedule(p_quote_id uuid, p_accept_on date, p_payment_due_on date)
returns table (
  seq integer,
  kind public.installment_kind,
  visit_no integer,
  window_code text,
  window_name text,
  window_start date,
  window_end date,
  amount_kurus bigint,
  vat_kurus bigint,
  due_on date,
  due_rule text,
  items jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q public.quote;
  v_period record;
  v_lead integer;
  v_n integer;
  v_seq integer := 0;
  v_prev date;
  v_due date;
  v_rule text;
  v_nominal date;
  v_first boolean := true;
  v_lines jsonb;
  v_inv jsonb;
  w record;
  k integer;
begin
  select * into q from public.quote x where x.id = p_quote_id;
  if not found or q.total_kurus = 0 then
    return;
  end if;
  v_lead := coalesce((q.inputs -> 'installments' ->> 'lead_days')::integer,
    (private.billing_setting(q.org_id)).installment_lead_days, 14);
  select * into v_period from private.quote_plan_period(q, p_accept_on);
  select max(i.visits) into v_n from public.quote_item i where i.quote_id = q.id;

  -- Per line: inventory share and the rest.
  select jsonb_agg(jsonb_build_object('id', l.id, 'inv', l.inv, 'inv_vat', l.inv_vat,
           'rest', l.line_total_kurus - l.inv, 'rest_vat', l.line_vat_kurus - l.inv_vat) order by l.line_no)
  into v_lines
  from (
    select i.id, i.line_no, i.line_total_kurus, i.line_vat_kurus,
           least(n.net + round(n.net::numeric * q.vat_rate_bp / 10000), i.line_total_kurus) as inv,
           least(round(n.net::numeric * q.vat_rate_bp / 10000)::bigint, i.line_vat_kurus,
             least(n.net + round(n.net::numeric * q.vat_rate_bp / 10000), i.line_total_kurus)) as inv_vat
    from public.quote_item i
    cross join lateral (
      select (i.inventory_fee_kurus - round(i.inventory_fee_kurus::numeric * q.discount_bp / 10000))::bigint as net
    ) n
    where i.quote_id = q.id
  ) l;

  select jsonb_agg(jsonb_build_object('quote_item_id', x ->> 'id', 'amount_kurus', (x ->> 'inv')::bigint,
           'vat_kurus', (x ->> 'inv_vat')::bigint))
  into v_inv
  from jsonb_array_elements(v_lines) x where (x ->> 'inv')::bigint > 0;
  if v_inv is not null then
    v_seq := 1;
    v_first := false;
    v_prev := p_payment_due_on;
    return query select 1, 'inventory'::public.installment_kind, null::integer, null::text, null::text, null::date,
      null::date,
      (select sum((y ->> 'amount_kurus')::bigint) from jsonb_array_elements(v_inv) y)::bigint,
      (select sum((y ->> 'vat_kurus')::bigint) from jsonb_array_elements(v_inv) y)::bigint,
      p_payment_due_on, 'payment_period', v_inv;
  end if;

  for w in select * from private.installment_windows(v_n, q.periodic_visits_per_year, v_period.period_start,
      v_period.period_end) order by 1 loop
    k := w.visit_no;
    select jsonb_agg(jsonb_build_object('quote_item_id', x ->> 'id',
             'amount_kurus', case when k < v_n then floor((x ->> 'rest')::numeric / v_n)
                                  else (x ->> 'rest')::bigint - (v_n - 1) * floor((x ->> 'rest')::numeric / v_n) end,
             'vat_kurus', case when k < v_n then floor((x ->> 'rest_vat')::numeric / v_n)
                               else (x ->> 'rest_vat')::bigint - (v_n - 1) * floor((x ->> 'rest_vat')::numeric / v_n) end))
    into v_inv
    from jsonb_array_elements(v_lines) x;
    select coalesce(jsonb_agg(y), '[]'::jsonb) into v_inv from jsonb_array_elements(v_inv) y
    where (y ->> 'amount_kurus')::bigint > 0;
    continue when jsonb_array_length(v_inv) = 0;

    v_nominal := w.window_start - v_lead;
    if v_first then
      if q.addon_of_order_id is not null or v_nominal <= p_payment_due_on then
        v_due := p_payment_due_on;
        v_rule := 'payment_period';
      else
        v_due := v_nominal;
        v_rule := 'window';
      end if;
    elsif v_nominal < p_accept_on then
      v_due := p_accept_on;
      v_rule := 'acceptance';
    else
      v_due := v_nominal;
      v_rule := 'window';
    end if;
    if v_prev is not null and v_due < v_prev then
      v_due := v_prev;
    end if;
    v_prev := v_due;
    v_first := false;
    v_seq := v_seq + 1;
    return query select v_seq, 'visit'::public.installment_kind, k, w.code, w.name, w.window_start, w.window_end,
      (select sum((y ->> 'amount_kurus')::bigint) from jsonb_array_elements(v_inv) y)::bigint,
      (select sum((y ->> 'vat_kurus')::bigint) from jsonb_array_elements(v_inv) y)::bigint,
      v_due, v_rule, v_inv;
  end loop;
end;
$$;
comment on function private.installment_schedule(uuid, date, date) is
  'installments-v1: the payment plan of a quote accepted on a day with a payment period (inventory first, visits split equally per line, due before each window).';

-- The last day of the payment period of a quote accepted today: today +
-- payment_due_days, an add-on's last add-on day at the latest.
create function private.quote_payment_due_on(q public.quote)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_due date := private.istanbul_today() + coalesce((private.billing_setting(q.org_id)).payment_due_days, 14);
  b public.service_order;
begin
  if q.addon_of_order_id is not null then
    select * into b from public.service_order where id = q.addon_of_order_id;
    if found and b.service_end is not null then
      v_due := least(v_due, private.addon_last_day(b));
    end if;
  end if;
  return v_due;
end;
$$;

-- The plan of a quote as if accepted today (the quote page shows it before
-- acceptance): its customer or the org's ops; nothing for anyone else.
create function public.quote_installment_plan(p_quote_id uuid)
returns table (
  seq integer,
  kind text,
  visit_no integer,
  window_code text,
  window_name text,
  window_start date,
  window_end date,
  amount_kurus bigint,
  vat_kurus bigint,
  due_on date,
  due_rule text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q public.quote;
begin
  select * into q from public.quote x
  where x.id = p_quote_id
    and (x.customer_user_id = (select auth.uid()) or x.org_id in (select authz.user_org_ids('{ops}')));
  if not found then
    return;
  end if;
  return query
  select s.seq, s.kind::text, s.visit_no, s.window_code, s.window_name, s.window_start, s.window_end, s.amount_kurus,
         s.vat_kurus,
         s.due_on, s.due_rule
  from private.installment_schedule(q.id, private.istanbul_today(), private.quote_payment_due_on(q)) s
  order by s.seq;
end;
$$;
comment on function public.quote_installment_plan(uuid) is
  'The payment plan of a quote if accepted today (installments-v1), for its customer or the org''s ops.';

-- Writes the plan of a new order (the caller holds the order). The first
-- installment's due day becomes the order's payment due time when later.
create function private.create_order_installments(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  s record;
  v_id uuid;
  v_count integer := 0;
  v_first date;
begin
  select * into o from public.service_order where id = p_order_id;
  if not found or o.total_kurus = 0 or exists (select 1 from public.order_installment i where i.order_id = o.id) then
    return 0;
  end if;
  for s in
    select * from private.installment_schedule(o.quote_id, private.istanbul_today(),
      ((o.payment_due_at at time zone 'Europe/Istanbul') - interval '1 microsecond')::date)
    order by 1
  loop
    insert into public.order_installment (org_id, order_id, customer_user_id, seq, kind, visit_no, window_code,
      window_name, window_start, window_end, amount_kurus, vat_kurus, due_on)
    values (o.org_id, o.id, o.customer_user_id, s.seq, s.kind, s.visit_no, s.window_code, s.window_name,
      s.window_start, s.window_end, s.amount_kurus, s.vat_kurus, s.due_on)
    returning id into v_id;
    insert into public.order_installment_item (org_id, installment_id, order_id, customer_user_id, order_item_id,
      amount_kurus, vat_kurus)
    select o.org_id, v_id, o.id, o.customer_user_id, oi.id, (x ->> 'amount_kurus')::bigint, (x ->> 'vat_kurus')::bigint
    from jsonb_array_elements(s.items) x
    join public.service_order_item oi on oi.order_id = o.id and oi.quote_item_id = (x ->> 'quote_item_id')::uuid;
    v_first := coalesce(v_first, s.due_on);
    v_count := v_count + 1;
  end loop;
  if (select coalesce(sum(i.amount_kurus), 0) from public.order_installment i where i.order_id = o.id) <> o.total_kurus
     or exists (
       select 1 from public.order_installment i
       where i.order_id = o.id
         and i.amount_kurus <> (select sum(x.amount_kurus) from public.order_installment_item x where x.installment_id = i.id))
  then
    raise exception 'installment_plan_mismatch' using errcode = 'P0001';
  end if;
  if v_first > ((o.payment_due_at at time zone 'Europe/Istanbul') - interval '1 microsecond')::date then
    update public.service_order
    set payment_due_at = (v_first + 1)::timestamp at time zone 'Europe/Istanbul'
    where id = o.id;
  end if;
  perform private.audit(o.org_id, null, 'system', 'order.installments_created', 'order', o.id,
    jsonb_build_object('number', o.number, 'formula', 'installments-v1', 'installments', v_count,
      'first_due_on', v_first));
  return v_count;
end;
$$;

-- The order's first installment that has not lapsed (window_passed) is paid
-- (a zero-total order needs none).
create function private.order_activatable(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select o.total_kurus from public.service_order o where o.id = p_order_id) = 0 then true
    else coalesce((
      select i.status = 'paid' from public.order_installment i
      where i.order_id = p_order_id and i.cancel_reason is distinct from 'window_passed'
      order by i.seq limit 1
    ), false)
  end;
$$;

-- The open amount of an installment.
create function private.installment_due(i public.order_installment)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when i.status = 'pending' then i.amount_kurus - i.cancelled_kurus - i.paid_kurus else 0 end;
$$;

-- Credits an amount (at most its open amount) to a locked pending
-- installment: to its lines in line order, and paid when nothing stays open.
create function private.credit_installment(p_installment_id uuid, p_amount bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  v_left bigint := p_amount;
  v_take bigint;
begin
  for x in
    select ii.id, ii.amount_kurus - ii.cancelled_kurus - ii.paid_kurus as open
    from public.order_installment_item ii
    join public.service_order_item oi on oi.id = ii.order_item_id
    where ii.installment_id = p_installment_id
    order by oi.line_no, oi.id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, x.open);
    continue when v_take <= 0;
    update public.order_installment_item set paid_kurus = paid_kurus + v_take where id = x.id;
    v_left := v_left - v_take;
  end loop;
  update public.order_installment
  set paid_kurus = paid_kurus + p_amount - v_left,
      status = case when paid_kurus + p_amount - v_left + cancelled_kurus = amount_kurus
                    then 'paid'::public.installment_status else status end,
      paid_at = case when paid_kurus + p_amount - v_left + cancelled_kurus = amount_kurus then now() else paid_at end
  where id = p_installment_id and status = 'pending';
end;
$$;

-- Takes back a credit (a voided bank transfer of an order awaiting payment):
-- from the lines in reverse order; the installment is open again.
create function private.uncredit_installment(p_installment_id uuid, p_amount bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  v_left bigint := p_amount;
  v_take bigint;
begin
  for x in
    select ii.id, ii.paid_kurus
    from public.order_installment_item ii
    join public.service_order_item oi on oi.id = ii.order_item_id
    where ii.installment_id = p_installment_id
    order by oi.line_no desc, oi.id desc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, x.paid_kurus);
    continue when v_take <= 0;
    update public.order_installment_item set paid_kurus = paid_kurus - v_take where id = x.id;
    v_left := v_left - v_take;
  end loop;
  -- paid → pending only with less paid (the guard's correction rule).
  update public.order_installment
  set paid_kurus = paid_kurus - (p_amount - v_left),
      status = case when status = 'paid' then 'pending'::public.installment_status else status end,
      paid_at = case when status = 'paid' then null else paid_at end
  where id = p_installment_id;
end;
$$;

-- The earliest open installment of an order, or null.
create function private.next_open_installment(p_order_id uuid)
returns public.order_installment
language sql
stable
security definer
set search_path = ''
as $$
  select i.* from public.order_installment i
  where i.order_id = p_order_id and i.status = 'pending'
  order by i.seq limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Payments
-- ---------------------------------------------------------------------------

-- As in 20261030105400_payments.sql, for the payment's installment: one
-- payment line per line share when the installment's whole open amount is
-- paid at once and nothing of it was paid before, otherwise one balance line.
create or replace function private.write_payment_items(o public.service_order, p_payment_id uuid, p_amount_kurus bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.order_installment;
begin
  select x.* into i from public.order_installment x
  join public.payment p on p.order_installment_id = x.id
  where p.id = p_payment_id;
  if i.paid_kurus = 0 and p_amount_kurus = private.installment_due(i) then
    insert into public.payment_item (org_id, payment_id, customer_user_id, line_no, order_item_id, name, amount_kurus)
    select o.org_id, p_payment_id, o.customer_user_id, row_number() over (order by oi.line_no, oi.id), oi.id,
           left(oi.garden_name, 200), ii.amount_kurus - ii.cancelled_kurus
    from public.order_installment_item ii
    join public.service_order_item oi on oi.id = ii.order_item_id
    where ii.installment_id = i.id and ii.amount_kurus - ii.cancelled_kurus > 0;
  else
    insert into public.payment_item (org_id, payment_id, customer_user_id, line_no, order_item_id, name, amount_kurus)
    values (o.org_id, p_payment_id, o.customer_user_id, 1, null, o.number || ' taksit ' || i.seq || ' bakiye',
      p_amount_kurus);
  end if;
end;
$$;

-- As in 20261030105400_payments.sql, per installment (the order and the
-- payment are locked; the installment is locked here): the order's paid
-- amount; the installment takes what it still owes, the rest is refunded
-- (order_closed when it took nothing and the order or the installment is
-- closed, else overpayment); activation once the first installment is paid;
-- the payment_received message and the audit row.
create or replace function private.complete_payment(
  o public.service_order,
  p public.payment,
  p_actor uuid,
  p_role text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.order_installment;
  v_credit bigint := 0;
begin
  update public.service_order set paid_kurus = paid_kurus + p.amount_kurus where id = o.id;
  select * into i from public.order_installment where id = p.order_installment_id for update;
  v_credit := least(p.amount_kurus, private.installment_due(i));
  perform private.audit(p.org_id, p_actor, p_role, p_action, 'payment', p.id,
    jsonb_build_object('order_id', o.id, 'receipt_number', p.receipt_number, 'provider', p.provider,
      'amount_kurus', p.amount_kurus, 'paid_kurus', p.paid_kurus, 'installment_id', i.id,
      'installment_seq', i.seq, 'credited_kurus', v_credit));
  if v_credit > 0 then
    perform private.credit_installment(i.id, v_credit);
  end if;
  if p.amount_kurus > v_credit then
    perform private.open_system_refund(p.id, p.amount_kurus - v_credit,
      case when v_credit = 0 and (o.status in ('cancelled', 'terminated', 'completed') or i.status = 'cancelled')
           then 'order_closed' else 'overpayment' end::public.refund_reason);
  end if;
  if o.status = 'awaiting_payment' and private.order_activatable(o.id) then
    perform private.activate_order(o.id);
  end if;
  perform private.enqueue_billing_notification('payment_received', p.org_id, p.customer_user_id, p.id,
    p.receipt_number, '/portal/odeme/' || p.id);
end;
$$;

-- As in 20261102120200_garden_addons.sql, for the earliest open installment:
-- the attempt carries it and charges its open amount. Payable: an order
-- awaiting payment or active with an open installment (order_not_payable
-- otherwise). The add-on period check applies while the order awaits
-- payment.
create or replace function public.payment_begin(p_order_id uuid, p_user_id uuid, p_provider text, p_return_origin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  b private.billing_profile;
  op private.owner_profile;
  u auth.users;
  i public.order_installment;
  v_required boolean;
  v_amount bigint;
  v_id uuid;
  v_email text;
begin
  if p_provider is null or p_provider not in ('iyzico', 'fake') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider';
  end if;
  if p_return_origin is null or length(p_return_origin) > 200 or p_return_origin !~ '^https?://[^/?#[:space:]]+$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'return_origin';
  end if;
  select * into o from public.service_order where id = p_order_id and customer_user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  i := private.next_open_installment(o.id);
  v_amount := coalesce(private.installment_due(i), 0);
  if o.status not in ('awaiting_payment', 'active') or i.id is null or v_amount <= 0 then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if private.has_open_removal(private.order_line_parcels(o.id), o.customer_user_id) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if o.status = 'awaiting_payment' and o.addon_of_order_id is not null
     and not private.addon_base_open(o.addon_of_order_id) then
    raise exception 'addon_base_closed' using errcode = 'P0001';
  end if;
  if p_provider = 'fake' and not private.fake_payments_allowed(o.org_id) then
    raise exception 'fake_payments_disabled' using errcode = 'P0001';
  end if;
  -- A card attempt in review may still become a success: a second one could
  -- charge the customer twice (live initiated attempts are superseded below).
  if exists (select 1 from public.payment p
             where p.order_id = o.id and p.provider <> 'manual' and p.status = 'pending_review'
               and coalesce(p.failure_code, '') not in ('amount_mismatch', 'reference_mismatch')) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(o.org_id, p_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  select * into b from private.billing_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into op from private.owner_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into u from auth.users x where x.id = p_user_id;
  v_email := coalesce(nullif(btrim(b.email), ''), nullif(btrim(op.email), ''), nullif(btrim(u.email), ''));
  if v_email is null then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001', detail = 'email';
  end if;
  v_required := coalesce((select s.identity_number_required from public.org_billing_setting s where s.org_id = o.org_id), false);

  update public.payment
  set status = 'expired', failure_code = 'superseded'
  where order_id = o.id and provider <> 'manual' and status = 'initiated'
    and (token_expires_at is null or token_expires_at > now());

  insert into public.payment (org_id, order_id, customer_user_id, provider, amount_kurus, return_origin,
    order_installment_id)
  values (o.org_id, o.id, p_user_id, p_provider::public.payment_provider, v_amount, p_return_origin, i.id)
  returning id into v_id;
  perform private.write_payment_items(o, v_id, v_amount);
  perform private.audit(o.org_id, p_user_id, 'customer', 'payment.initiated', 'payment', v_id,
    jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount_kurus', v_amount, 'installment_id', i.id,
      'installment_seq', i.seq));

  return jsonb_build_object(
    'payment_id', v_id,
    'order_id', o.id,
    'order_number', o.number,
    'amount_kurus', v_amount,
    'currency', o.currency,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object('payment_item_id', pi.id, 'line_no', pi.line_no, 'name', pi.name,
        'amount_kurus', pi.amount_kurus) order by pi.line_no), '[]'::jsonb)
      from public.payment_item pi where pi.payment_id = v_id),
    'buyer', jsonb_build_object(
      'id', p_user_id,
      'first_name', b.first_name,
      'last_name', b.last_name,
      'identity_number', case when v_required and b.identity_number is not null then b.identity_number
                              else '11111111111' end,
      'email', v_email,
      'phone', coalesce(op.phone, case when u.phone is not null and u.phone <> '' then '+' || u.phone end),
      'address', b.address,
      'district', b.district,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code,
      'registered_at', coalesce(u.created_at, op.created_at)
    ),
    'billing', jsonb_build_object(
      'contact_name', case when b.kind = 'company' then b.company_title else b.first_name || ' ' || b.last_name end,
      'address', b.address,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code
    )
  );
end;
$$;

-- A bank transfer (docs/musteri-yonetimi.md §5.6). With p_installment_id:
-- for (part of) that open installment. Without: spread over the open
-- installments in order, one payment row (and receipt) per installment, the
-- last one possibly partial; returns the first payment. Payable: an order
-- with an open installment that is not cancelled. Errors: as before, and
-- invalid_input (installment_id: not one of the order's), installment_not_open
-- (paid or cancelled meanwhile).
drop function public.ops_record_manual_payment(uuid, bigint, date, text, text);
create function public.ops_record_manual_payment(
  p_order_id uuid,
  p_amount_kurus bigint,
  p_value_date date,
  p_bank_reference text,
  p_note text default null,
  p_installment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  i public.order_installment;
  v_reference text := nullif(btrim(p_bank_reference), '');
  v_note text := nullif(btrim(p_note), '');
  v_open bigint;
  v_left bigint;
  v_take bigint;
  v_first uuid;
begin
  o := private.lock_order_for_ops(p_order_id);
  if o.status = 'cancelled' or not exists (
    select 1 from public.order_installment x where x.order_id = o.id and x.status = 'pending'
  ) then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if private.has_open_removal(private.order_line_parcels(o.id), o.customer_user_id) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if private.live_payment_attempt(o.id) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  if p_amount_kurus is null or p_amount_kurus <= 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount_kurus';
  end if;
  if p_installment_id is not null then
    select * into i from public.order_installment x where x.id = p_installment_id and x.order_id = o.id;
    if not found then
      raise exception 'invalid_input' using errcode = '22023', detail = 'installment_id';
    end if;
    if i.status <> 'pending' then
      raise exception 'installment_not_open' using errcode = 'P0001';
    end if;
    v_open := private.installment_due(i);
  else
    select coalesce(sum(x.amount_kurus - x.cancelled_kurus - x.paid_kurus), 0) into v_open
    from public.order_installment x where x.order_id = o.id and x.status = 'pending';
  end if;
  if p_amount_kurus > v_open then
    raise exception 'amount_exceeds_balance' using errcode = 'P0001';
  end if;
  if p_value_date is null or p_value_date > private.istanbul_today() or p_value_date < private.istanbul_today() - 366 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'value_date';
  end if;
  if v_reference is null or length(v_reference) > 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'bank_reference';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if not private.billing_profile_complete(o.org_id, o.customer_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;

  v_left := p_amount_kurus;
  for i in
    select * from public.order_installment x
    where x.order_id = o.id and x.status = 'pending' and (p_installment_id is null or x.id = p_installment_id)
    order by x.seq
  loop
    exit when v_left <= 0;
    v_take := least(v_left, private.installment_due(i));
    continue when v_take <= 0;
    select * into o from public.service_order where id = o.id;
    insert into public.payment (org_id, order_id, customer_user_id, provider, status, amount_kurus,
      provider_amount_kurus, paid_kurus, receipt_number, bank_reference, value_date, recorded_by, manual_note,
      succeeded_at, order_installment_id)
    values (o.org_id, o.id, o.customer_user_id, 'manual', 'succeeded', v_take, v_take, v_take,
      private.next_document_number(o.org_id, 'M'), v_reference, p_value_date, (select auth.uid()), v_note, now(), i.id)
    returning * into p;
    perform private.write_payment_items(o, p.id, v_take);
    perform private.write_payment_snapshot(p.id, p.org_id, p.customer_user_id);
    perform private.complete_payment(o, p, (select auth.uid()), 'ops', 'payment.manual_recorded');
    v_first := coalesce(v_first, p.id);
    v_left := v_left - v_take;
  end loop;
  return v_first;
end;
$$;
comment on function public.ops_record_manual_payment(uuid, bigint, date, text, text, uuid) is
  'Ops: records a bank transfer with a receipt per installment (one installment, or spread over the open ones in order); activates the order once its first installment is paid.';

-- As in 20261030105500_refunds.sql, plus: money refunded from a payment of
-- an order still awaiting payment no longer pays its installment (the
-- installment opens again by the refunded amount, at most what it took);
-- refunds of what an installment never took (overpayment, order_closed,
-- provider_mismatch) change nothing. Refunds of an active order (a missed
-- visit, a removal, goodwill) never reopen an installment.
create or replace function private.refund_completed(r public.refund, p_actor uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  i public.order_installment;
begin
  select * into p from public.payment where id = r.payment_id;
  update public.payment
  set refunded_kurus = refunded_kurus + r.amount_kurus,
      status = case when r.kind = 'void' and status in ('succeeded', 'pending_review') then 'voided' else status end,
      voided_at = case when r.kind = 'void' and status in ('succeeded', 'pending_review') then now() else voided_at end
  where id = p.id;
  if r.payment_item_id is not null then
    update public.payment_item set refunded_kurus = refunded_kurus + r.amount_kurus where id = r.payment_item_id;
  end if;
  if p.status = 'succeeded' then
    update public.service_order set refunded_kurus = refunded_kurus + r.amount_kurus where id = r.order_id;
    if r.reason not in ('overpayment', 'order_closed', 'provider_mismatch')
       and (select o.status from public.service_order o where o.id = r.order_id) = 'awaiting_payment' then
      select * into i from public.order_installment where id = p.order_installment_id for update;
      if i.paid_kurus > 0 then
        perform private.uncredit_installment(i.id, least(r.amount_kurus, i.paid_kurus));
      end if;
    end if;
  end if;
  perform private.audit(r.org_id, p_actor, p_role, 'refund.succeeded', 'refund', r.id,
    jsonb_build_object('number', r.number, 'payment_id', p.id, 'kind', r.kind, 'amount_kurus', r.amount_kurus));
  if r.kind = 'void' and p.status in ('succeeded', 'pending_review') then
    perform private.audit(r.org_id, p_actor, p_role, 'payment.voided', 'payment', p.id,
      jsonb_build_object('refund_id', r.id, 'from', p.status));
  end if;
  perform private.enqueue_billing_notification('refund_completed', r.org_id, r.customer_user_id, r.id, r.number,
    '/portal/odeme/' || p.id);
end;
$$;

-- As in 20261030105400_payments.sql; the credit is taken off its installment.
create or replace function public.ops_void_manual_payment(p_payment_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  v_note text := nullif(btrim(p_note), '');
begin
  p := private.lock_payment_for_ops(p_payment_id);
  select * into o from public.service_order where id = p.order_id;
  if p.provider <> 'manual' or p.status <> 'succeeded'
     or exists (select 1 from public.refund r where r.payment_id = p.id and r.status <> 'cancelled') then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if o.status = 'active' then
    raise exception 'order_active' using errcode = 'P0001';
  end if;
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if o.paid_kurus - p.amount_kurus < o.refunded_kurus then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.payment set status = 'voided', voided_at = now(), manual_note = v_note
  where id = p.id and status = 'succeeded';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  update public.service_order set paid_kurus = paid_kurus - p.amount_kurus where id = o.id;
  perform 1 from public.order_installment where id = p.order_installment_id for update;
  perform private.uncredit_installment(p.order_installment_id, p.amount_kurus);
  perform private.audit(p.org_id, (select auth.uid()), 'ops', 'payment.voided', 'payment', p.id,
    jsonb_build_object('order_id', o.id, 'receipt_number', p.receipt_number, 'amount_kurus', p.amount_kurus,
      'installment_id', p.order_installment_id));
end;
$$;

-- As in 20261030105300_quotes_orders.sql: the bank details, the order number
-- as reference, and the earliest open installment (its open amount and the
-- end of its due day); 0 and null when none is open.
create or replace function public.customer_payment_instructions(p_order_id uuid)
returns table (
  bank_name text,
  iban text,
  iban_holder text,
  reference text,
  outstanding_kurus bigint,
  currency text,
  payment_due_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.bank_name, s.iban, s.iban_holder, o.number,
         coalesce((select i.amount_kurus - i.cancelled_kurus - i.paid_kurus from public.order_installment i
                   where i.order_id = o.id and i.status = 'pending' order by i.seq limit 1), 0)::bigint,
         o.currency,
         (select (i.due_on + 1)::timestamp at time zone 'Europe/Istanbul' from public.order_installment i
          where i.order_id = o.id and i.status = 'pending' order by i.seq limit 1)
  from public.service_order o
  left join public.org_billing_setting s on s.org_id = o.org_id
  where o.id = p_order_id and o.customer_user_id = (select auth.uid());
$$;
comment on function public.customer_payment_instructions(uuid) is
  'Customer: IBAN, holder, reference (order number) and the open amount and due time of the earliest open installment of an own order.';

-- As in 20261102120200_garden_addons.sql; the first open installment of an
-- order awaiting payment moves with the due day.
create or replace function public.ops_extend_payment_due(p_order_id uuid, p_due_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  b public.service_order;
  v_due timestamptz;
begin
  o := private.lock_order_for_ops(p_order_id);
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if p_due_on is null or p_due_on < private.istanbul_today() or p_due_on > private.istanbul_today() + 365 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'due_on';
  end if;
  if o.addon_of_order_id is not null then
    select * into b from public.service_order where id = o.addon_of_order_id;
    if p_due_on > private.addon_last_day(b) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'due_on';
    end if;
  end if;
  v_due := (p_due_on + 1)::timestamp at time zone 'Europe/Istanbul';
  update public.service_order set payment_due_at = v_due where id = o.id and status = 'awaiting_payment';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  update public.order_installment
  set due_on = p_due_on, reminder_sent_at = null, due_reminder_sent_at = null
  where id = (select x.id from public.order_installment x where x.order_id = o.id and x.status = 'pending'
              order by x.seq limit 1 for update);
  perform private.audit(o.org_id, (select auth.uid()), 'ops', 'order.due_extended', 'order', o.id,
    jsonb_build_object('number', o.number, 'due_on', p_due_on));
end;
$$;

-- Window starts and due days of the open visit installments follow the
-- service period of an activated order (its start may differ from the
-- acceptance day); paid ones keep theirs. Due days are not before today.
create function private.reschedule_installments(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  q public.quote;
  v_n integer;
  v_lead integer;
  w record;
  v_count integer := 0;
begin
  select * into o from public.service_order where id = p_order_id;
  select * into q from public.quote where id = o.quote_id;
  if o.service_start is null or o.service_end is null then
    return 0;
  end if;
  v_lead := coalesce((q.inputs -> 'installments' ->> 'lead_days')::integer,
    (private.billing_setting(o.org_id)).installment_lead_days, 14);
  select max(i.visit_no) into v_n from public.order_installment i where i.order_id = o.id and i.kind = 'visit';
  if v_n is null then
    return 0;
  end if;
  v_n := greatest(v_n, (select max(x.visits) from public.quote_item x where x.quote_id = q.id));
  for w in select * from private.installment_windows(v_n, q.periodic_visits_per_year, o.service_start, o.service_end) loop
    update public.order_installment
    set window_code = w.code, window_name = w.name, window_start = w.window_start, window_end = w.window_end,
        due_on = greatest(w.window_start - v_lead, private.istanbul_today(), due_on)
    where order_id = o.id and kind = 'visit' and visit_no = w.visit_no and status = 'pending'
      and window_start is distinct from w.window_start;
    v_count := v_count + case when found then 1 else 0 end;
  end loop;
  if v_count > 0 then
    perform private.audit(o.org_id, null, 'system', 'order.installments_rescheduled', 'order', o.id,
      jsonb_build_object('number', o.number, 'installments', v_count, 'service_start', o.service_start));
  end if;
  return v_count;
end;
$$;

-- As in 20261102120200_garden_addons.sql, except that the order activates
-- when its first installment is paid (private.order_activatable; a
-- zero-total order at once), and the open visit installments follow the
-- service period afterwards.
create or replace function private.activate_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  q public.quote;
  b public.service_order;
  v_item record;
  v_parcel uuid;
  v_start date;
  v_end date;
  v_payment record;
  v_refunds integer := 0;
  v_removal record;
  v_geom extensions.geometry;
  v_latest extensions.geometry;
  d private.application_garden_detail;
begin
  select * into o from public.service_order where id = p_order_id for update;
  if not found or o.status <> 'awaiting_payment' or not private.order_activatable(o.id) then
    return false;
  end if;
  select * into q from public.quote where id = o.quote_id;

  if o.addon_of_order_id is not null then
    select * into b from public.service_order where id = o.addon_of_order_id;
    if b.status is distinct from 'active' or private.istanbul_today() > private.addon_last_day(b) then
      update public.service_order set status = 'cancelled', cancelled_at = now(), cancel_reason = 'addon_base_closed'
      where id = o.id and status = 'awaiting_payment';
      if not found then
        raise exception 'state_changed' using errcode = 'P0001';
      end if;
      for v_payment in
        select p.id, coalesce(p.provider_amount_kurus, p.amount_kurus) as amount
        from public.payment p where p.order_id = o.id and p.status = 'succeeded'
        order by p.id
        for update
      loop
        v_refunds := v_refunds + coalesce(cardinality(
          private.open_system_refund(v_payment.id, v_payment.amount, 'order_closed')), 0);
      end loop;
      perform private.audit(o.org_id, null, 'system', 'order.cancelled', 'order', o.id,
        jsonb_build_object('number', o.number, 'reason', 'addon_base_closed'));
      perform private.audit(o.org_id, null, 'system', 'order.activation_refused', 'order', o.id,
        jsonb_build_object('number', o.number, 'reason', 'addon_base_closed', 'refunds', v_refunds,
          'addon_of_order_id', o.addon_of_order_id));
      return false;
    end if;
    v_start := greatest(coalesce(q.proposed_service_start, private.istanbul_today()), private.istanbul_today());
    v_end := b.service_end;
  else
    v_start := coalesce(q.proposed_service_start, private.istanbul_today());
    v_end := (v_start + interval '1 year' - interval '1 day')::date;
  end if;

  for v_item in
    select oi.id, qi.application_garden_id, qi.parcel_id, g.parcel_id as linked_parcel_id
    from public.service_order_item oi
    join public.quote_item qi on qi.id = oi.quote_item_id
    left join public.application_garden g on g.id = qi.application_garden_id
    where oi.order_id = o.id
    order by oi.line_no
  loop
    if v_item.application_garden_id is not null and v_item.linked_parcel_id is null then
      v_parcel := private.create_customer_parcel(v_item.application_garden_id);
    else
      v_parcel := coalesce(v_item.parcel_id, v_item.linked_parcel_id);
      -- The re-added garden closes the customer's open access windows first
      -- (the read-only guard would refuse the owner access otherwise).
      for v_removal in
        update public.garden_removal set access_revoked_at = now()
        where parcel_id = v_parcel and customer_user_id = o.customer_user_id and status = 'completed'
          and access_revoked_at is null
        returning id, org_id
      loop
        perform private.audit(v_removal.org_id, null, 'system', 'garden_removal.access_closed', 'garden_removal',
          v_removal.id, jsonb_build_object('reason', 'resumed', 'order_id', o.id));
      end loop;
      insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
      select o.org_id, v_parcel, o.customer_user_id, 'owner', null
      where not exists (
        select 1 from public.parcel_access pa where pa.parcel_id = v_parcel and pa.user_id = o.customer_user_id
      );
      if v_item.linked_parcel_id is not null then
        select * into d from private.application_garden_detail x
        where x.application_garden_id = v_item.application_garden_id;
        if found then
          insert into private.parcel_detail (
            parcel_id, org_id, deed_block, deed_parcel, is_shared_deed, used_portion_note, authorization_basis,
            entry_permission_at, access_note, site_contact_name, site_contact_phone
          )
          values (
            v_parcel, o.org_id, d.deed_block, d.deed_parcel, d.is_shared_deed, d.used_portion_note,
            d.authorization_basis, d.entry_permission_at, d.access_note, d.site_contact_name, d.site_contact_phone
          )
          on conflict (parcel_id) do update
          set deed_block = excluded.deed_block, deed_parcel = excluded.deed_parcel,
              is_shared_deed = excluded.is_shared_deed, used_portion_note = excluded.used_portion_note,
              authorization_basis = excluded.authorization_basis, entry_permission_at = excluded.entry_permission_at,
              access_note = excluded.access_note, site_contact_name = excluded.site_contact_name,
              site_contact_phone = excluded.site_contact_phone, updated_at = now();
        end if;
        select g.boundary into v_geom from public.application_garden g where g.id = v_item.application_garden_id;
        if v_geom is not null and not exists (
          select 1 from public.boundary bb where bb.parcel_id = v_parcel and bb.source = 'field_survey'
        ) then
          perform pg_advisory_xact_lock(hashtextextended('boundary:' || v_parcel::text, 0));
          select bb.geom into v_latest from public.boundary bb where bb.parcel_id = v_parcel
          order by bb.version desc limit 1;
          if v_latest is null or not extensions.st_equals(v_latest, v_geom) then
            insert into public.boundary (org_id, parcel_id, version, geom, source)
            values (o.org_id, v_parcel,
              coalesce((select max(bb.version) from public.boundary bb where bb.parcel_id = v_parcel), 0) + 1,
              v_geom, 'owner_declared');
          end if;
        end if;
      end if;
      update public.parcel set status = private.parcel_lifecycle_status(id)
      where id = v_parcel and status = 'passive';
    end if;
    update public.service_order_item set parcel_id = v_parcel where id = v_item.id and parcel_id is null;
  end loop;

  update public.service_order
  set status = 'active', activated_at = now(), service_start = v_start, service_end = v_end
  where id = o.id and status = 'awaiting_payment';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, null, 'system', 'order.activated', 'order', o.id,
    jsonb_build_object('number', o.number, 'service_start', v_start,
      'lines', (select count(*) from public.service_order_item oi where oi.order_id = o.id),
      'addon_of_order_id', o.addon_of_order_id));
  perform private.reschedule_installments(o.id);
  return true;
end;
$$;

-- As in 20261103100400_accept_quote_consents.sql, plus the payment plan of
-- the new order (private.create_order_installments).
create or replace function public.customer_accept_quote(p_quote_id uuid, p_consents jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
  b public.service_order;
  v_user uuid := (select auth.uid());
  v_due_days integer;
  v_due timestamptz;
  v_order uuid;
  v_number text;
  v_parcels uuid[];
  v_from date;
  v_to date;
  v_lines integer;
  v_distance record;
  v_pre record;
  v_early record;
  v_reasons text[];
  v_kinds jsonb := jsonb_build_array('distance_sales', 'pre_information');
begin
  q := private.lock_own_quote(p_quote_id);
  if q.status <> 'issued' then
    raise exception 'quote_not_open' using errcode = 'P0001';
  end if;
  if q.valid_until < private.istanbul_today() then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(q.org_id, v_user) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  if not private.kvkk_notice_granted(q.org_id, v_user) then
    raise exception 'consent_required' using errcode = '22023', detail = 'kvkk_notice';
  end if;
  select * into v_distance from private.accept_consent_entry(p_consents, 'distance_sales', true);
  select * into v_pre from private.accept_consent_entry(p_consents, 'pre_information', true);
  select * into v_early from private.accept_consent_entry(p_consents, 'early_performance', false);
  if private.legal_gate_active(q.org_id) then
    v_reasons := private.legal_gate_reasons(q.org_id, v_user);
    if cardinality(v_reasons) > 0 then
      raise exception 'legal_texts_not_final' using errcode = 'P0001', detail = v_reasons[1];
    end if;
  end if;

  v_parcels := private.quote_line_parcels(q.id);
  perform private.lock_customer_gardens(v_user);
  perform private.lock_parcel_coverage(v_parcels);
  select coalesce(s.payment_due_days, 14) into v_due_days
  from (select 1) one left join public.org_billing_setting s on s.org_id = q.org_id;
  v_due := now() + make_interval(days => v_due_days);
  if q.addon_of_order_id is not null then
    select * into b from public.service_order where id = q.addon_of_order_id for update;
    if b.status is distinct from 'active' or private.istanbul_today() > private.addon_last_day(b) then
      raise exception 'addon_base_closed' using errcode = 'P0001';
    end if;
    v_from := greatest(coalesce(q.proposed_service_start, private.istanbul_today()), private.istanbul_today());
    v_to := b.service_end;
    v_due := least(v_due, (private.addon_last_day(b) + 1)::timestamp at time zone 'Europe/Istanbul');
  else
    v_from := coalesce(q.proposed_service_start, private.istanbul_today());
    v_to := (v_from + interval '1 year' - interval '1 day')::date;
  end if;
  if exists (select 1 from unnest(v_parcels) x where private.parcel_in_service(x, v_from, v_to)) then
    raise exception 'parcel_in_service' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  select count(*) into v_lines from public.quote_item i where i.quote_id = q.id;
  if private.account_garden_count(q.org_id, v_user, v_from, v_to) + v_lines > 50 then
    raise exception 'account_garden_limit' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.garden_removal r
    where r.parcel_id = any (v_parcels) and r.customer_user_id = v_user
      and (r.status in ('requested', 'scheduled') or (r.status <> 'cancelled' and r.requested_at > q.issued_at))
  ) then
    raise exception 'garden_removal_open' using errcode = 'P0001', detail = 'parcel_ids';
  end if;

  update public.quote set status = 'accepted', decided_at = now(), decided_by = v_user
  where id = q.id and status = 'issued';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  if q.application_id is not null then
    update public.service_application set status = 'accepted', decided_at = now(), decided_by = v_user
    where id = q.application_id and status = 'quoted';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;

  v_number := private.next_document_number(q.org_id, 'S');
  insert into public.service_order (org_id, customer_user_id, quote_id, number, total_kurus, payment_due_at,
    renewal_of_order_id, addon_of_order_id)
  values (q.org_id, v_user, q.id, v_number, q.total_kurus, v_due, q.renewal_of_order_id, q.addon_of_order_id)
  returning id into v_order;
  insert into public.service_order_item (org_id, order_id, customer_user_id, quote_item_id, line_no, garden_name,
    amount_kurus)
  select q.org_id, v_order, v_user, i.id, i.line_no, i.garden_name, i.line_total_kurus
  from public.quote_item i where i.quote_id = q.id order by i.line_no;

  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, quote_id,
    order_id, text_sha256, display_sha256)
  values
    (q.org_id, v_user, v_user, 'distance_sales', true, v_distance.version, 'quote_acceptance', q.id, v_order,
     v_distance.sha256, v_distance.display_sha256),
    (q.org_id, v_user, v_user, 'pre_information', true, v_pre.version, 'quote_acceptance', q.id, v_order,
     v_pre.sha256, v_pre.display_sha256);
  if v_early.version is not null then
    insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, quote_id,
      order_id, text_sha256, display_sha256)
    values (q.org_id, v_user, v_user, 'early_performance', true, v_early.version, 'quote_acceptance', q.id, v_order,
      v_early.sha256, v_early.display_sha256);
    v_kinds := v_kinds || jsonb_build_array('early_performance');
  end if;

  perform private.audit(q.org_id, v_user, 'customer', 'quote.accepted', 'quote', q.id,
    jsonb_build_object('number', q.number, 'order_id', v_order));
  perform private.audit(q.org_id, v_user, 'customer', 'order.created', 'order', v_order,
    jsonb_build_object('number', v_number, 'quote_id', q.id, 'total_kurus', q.total_kurus,
      'addon_of_order_id', q.addon_of_order_id));
  perform private.audit(q.org_id, v_user, 'customer', 'consent.granted', 'consent', v_user,
    jsonb_build_object('kinds', v_kinds, 'order_id', v_order));
  perform private.create_order_installments(v_order);
  if q.total_kurus = 0 then
    perform private.activate_order(v_order);
  end if;
  return v_order;
end;
$$;

-- As in 20261030105400_payments.sql, plus the installment the payment paid:
-- plan_installment {seq, count, kind, visit_no, window_name, due_on}.
create or replace function public.receipt_data(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'receipt_number', p.receipt_number,
    'status', p.status,
    'issued_at', p.succeeded_at,
    'provider', p.provider,
    'amount_kurus', p.amount_kurus,
    'paid_kurus', coalesce(p.paid_kurus, p.amount_kurus),
    'refunded_kurus', p.refunded_kurus,
    'currency', p.currency,
    'installment', p.installment,
    'card_association', p.card_association,
    'card_last4', p.card_last4,
    'bank_reference', p.bank_reference,
    'value_date', p.value_date,
    'order_number', o.number,
    'package_name', q.package_name,
    'service_start', o.service_start,
    'service_end', o.service_end,
    'plan_installment', (select jsonb_build_object('seq', i.seq,
        'count', (select count(*) from public.order_installment c where c.order_id = i.order_id),
        'kind', i.kind, 'visit_no', i.visit_no, 'window_name', i.window_name, 'due_on', i.due_on)
      from public.order_installment i where i.id = p.order_installment_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('line_no', i.line_no, 'name', i.name,
                'amount_kurus', i.amount_kurus) order by i.line_no), '[]'::jsonb)
              from public.payment_item i where i.payment_id = p.id),
    'buyer', jsonb_build_object(
      'name', sn.first_name || ' ' || sn.last_name,
      'identity_number_masked', case when sn.identity_number_last4 is not null
                                     then '*******' || sn.identity_number_last4 end,
      'company_title', sn.company_title,
      'tax_office', sn.tax_office,
      'tax_number', sn.tax_number,
      'address', sn.address,
      'district', sn.district,
      'city', sn.city
    ),
    'seller', jsonb_build_object(
      'legal_name', s.legal_name,
      'tax_office', s.tax_office,
      'tax_number', s.tax_number,
      'mersis_number', s.mersis_number,
      'address', s.address,
      'phone', s.phone,
      'email', s.email
    ),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'amount_kurus', r.amount_kurus,
                  'processed_at', r.processed_at) order by r.processed_at, r.number), '[]'::jsonb)
                from public.refund r where r.payment_id = p.id and r.status = 'succeeded')
  )
  from public.payment p
  join public.service_order o on o.id = p.order_id
  join public.quote q on q.id = o.quote_id
  left join private.payment_billing_snapshot sn on sn.payment_id = p.id
  left join public.org_billing_setting s on s.org_id = p.org_id
  where p.id = p_payment_id
    and p.receipt_number is not null
    and (p.customer_user_id = (select auth.uid()) or p.org_id in (select authz.user_org_ids('{ops}')));
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.package_visit_windows(integer) from public;
revoke all on function private.installment_windows(integer, integer, date, date) from public;
revoke all on function private.quote_plan_period(public.quote, date) from public;
revoke all on function private.installment_schedule(uuid, date, date) from public;
revoke all on function private.quote_payment_due_on(public.quote) from public;
revoke all on function private.create_order_installments(uuid) from public;
revoke all on function private.order_activatable(uuid) from public;
revoke all on function private.installment_due(public.order_installment) from public;
revoke all on function private.credit_installment(uuid, bigint) from public;
revoke all on function private.uncredit_installment(uuid, bigint) from public;
revoke all on function private.next_open_installment(uuid) from public;
revoke all on function private.reschedule_installments(uuid) from public;
revoke all on function public.quote_installment_plan(uuid) from public, anon, authenticated;
revoke all on function public.ops_record_manual_payment(uuid, bigint, date, text, text, uuid)
  from public, anon, authenticated;

grant execute on function public.package_visit_windows(integer) to anon, authenticated, service_role;
grant execute on function public.quote_installment_plan(uuid) to authenticated;
grant execute on function public.ops_record_manual_payment(uuid, bigint, date, text, text, uuid) to authenticated;
