-- IP14 / 2: schema of adding and removing gardens during a membership
-- (docs/bahce-yonetimi.md §9.2–§9.5, §9.10).
--
-- 1. Enums: garden_removal_status, garden_removal_reason.
-- 2. Changed tables: five org_billing_setting columns; add-on links on quote
--    and service_order (addon_of_order_id: the base order whose period the
--    add-on shares); withdrawn application gardens; the removal of an order
--    line (removed_on, garden_removal_id, set once and together); the removal
--    a refund was opened for.
-- 3. public.garden_removal (C-YYYY-NNNNNN): a parcel leaving the service of
--    one customer. Guards: no delete, fixed identity columns, a final row only
--    records the access notice and the revocation.
-- 4. service_order_item_guard recreated; document kind C; audit entity
--    garden_removal.
-- 5. RLS and column grants (internal columns: ops_note, requested_by,
--    decided_by, blocked_reason, revoke_all_access); demo guards.
--
-- Functions are in 20261102120200 (add-ons) and 20261102120300 (removals).

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

create type public.garden_removal_status as enum ('requested', 'scheduled', 'completed', 'cancelled');
create type public.garden_removal_reason as enum (
  'sold', 'not_needed', 'dissatisfied', 'cost', 'transfer', 'duplicate', 'other'
);

-- ---------------------------------------------------------------------------
-- 2. Changed tables
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting
  add column garden_changes_enabled boolean not null default false,
  add column addon_min_days smallint not null default 30 check (addon_min_days between 1 and 180),
  add column removal_notice_days smallint not null default 30 check (removal_notice_days between 0 and 90),
  add column removal_access_days smallint not null default 90 check (removal_access_days between 0 and 365),
  add column removal_refund_mode text not null default 'unused_visits'
    check (removal_refund_mode in ('unused_visits', 'manual'));
comment on column public.org_billing_setting.garden_changes_enabled is
  'IP14 switch: new garden removals and add-on quotes (open records keep running while it is off).';

alter table public.quote
  add column addon_of_order_id uuid references public.service_order (id),
  add constraint quote_addon_not_renewal check (addon_of_order_id is null or renewal_of_order_id is null);
create index quote_addon_idx on public.quote (addon_of_order_id);
comment on column public.quote.addon_of_order_id is 'Add-on quote: the base order whose period the new gardens join.';

alter table public.service_order
  add column addon_of_order_id uuid references public.service_order (id),
  add constraint service_order_addon_check
    check (addon_of_order_id is null or (addon_of_order_id <> id and renewal_of_order_id is null));
create index service_order_addon_idx on public.service_order (addon_of_order_id);
comment on column public.service_order.addon_of_order_id is
  'Add-on order: the base order it belongs to; it ends on the base order''s service_end.';

alter table public.application_garden add column withdrawn_at timestamptz;
comment on column public.application_garden.withdrawn_at is
  'Withdrawn from a submitted or quoted application: left out of previews, quotes and verification.';

alter table public.service_order_item
  add column removed_on date,
  add column garden_removal_id uuid,
  add constraint service_order_item_removed_check check ((removed_on is null) = (garden_removal_id is null)),
  add constraint service_order_item_id_order_uq unique (id, order_id);
create index service_order_item_removal_idx on public.service_order_item (garden_removal_id);
comment on column public.service_order_item.removed_on is
  'First day the garden is no longer served by this line (a garden removal); set once with garden_removal_id.';

alter table public.refund add column garden_removal_id uuid;
create index refund_garden_removal_idx on public.refund (garden_removal_id);
comment on column public.refund.garden_removal_id is 'The garden removal this system refund was opened for.';

-- ---------------------------------------------------------------------------
-- 3. public.garden_removal
-- ---------------------------------------------------------------------------

create table public.garden_removal (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  number text not null unique check (number ~ '^C-[0-9]{4}-[0-9]{6}$'),
  parcel_id uuid not null references public.parcel (id),
  -- The order and line serving the garden when the removal was requested.
  order_id uuid not null,
  order_item_id uuid not null,
  -- Kept so the history still names the garden after the access is gone.
  garden_name text not null,
  status public.garden_removal_status not null default 'requested',
  initiated_by text not null check (initiated_by in ('customer', 'ops')),
  reason public.garden_removal_reason not null,
  customer_note text check (length(customer_note) <= 1000),
  ops_note text check (length(ops_note) <= 2000),
  at_period_end boolean not null default false,
  withdrawal boolean not null default false,
  requested_effective_on date not null,
  effective_on date,
  access_days smallint not null check (access_days between 0 and 365),
  access_until date,
  revoke_all_access boolean not null default false,
  blocked_reason text check (blocked_reason in ('pending_order')),
  refund_mode text check (refund_mode in ('unused_visits', 'withdrawal', 'duplicate', 'manual', 'none')),
  refund_kurus bigint check (refund_kurus >= 0),
  calculation jsonb check (calculation is null or jsonb_typeof(calculation) = 'object'),
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'ops', 'system')),
  access_notice_sent_at timestamptz,
  access_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_user_id, org_id),
  foreign key (order_id, customer_user_id, org_id) references public.service_order (id, customer_user_id, org_id),
  foreign key (order_item_id, order_id) references public.service_order_item (id, order_id),
  check (not (withdrawal and at_period_end)),
  check (initiated_by = 'customer' or not withdrawal),
  check (status not in ('scheduled', 'completed')
         or (effective_on is not null and access_until is not null and scheduled_at is not null)),
  check ((status = 'completed') = (completed_at is not null and refund_mode is not null and refund_kurus is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null)),
  check (status in ('requested', 'scheduled') or blocked_reason is null),
  check (access_until is null or access_until >= effective_on)
);
comment on table public.garden_removal is
  'A garden (parcel) leaving the service of a customer: date, refund calculation (removal-v1), read-only access window.';
create unique index garden_removal_open_uq on public.garden_removal (parcel_id, customer_user_id)
  where status in ('requested', 'scheduled');
create index garden_removal_org_status_idx on public.garden_removal (org_id, status, effective_on);
create index garden_removal_customer_idx on public.garden_removal (customer_user_id);
create index garden_removal_order_item_idx on public.garden_removal (order_item_id);
create index garden_removal_order_idx on public.garden_removal (order_id);
create index garden_removal_parcel_idx on public.garden_removal (parcel_id);
create index garden_removal_requested_by_idx on public.garden_removal (requested_by);
create index garden_removal_decided_by_idx on public.garden_removal (decided_by);

alter table public.service_order_item
  add constraint service_order_item_garden_removal_fk
  foreign key (garden_removal_id) references public.garden_removal (id);
alter table public.refund
  add constraint refund_garden_removal_fk
  foreign key (garden_removal_id) references public.garden_removal (id);

-- No delete; the identity columns never change; a completed or cancelled row
-- only records the access notice and the revocation. requested_by and
-- decided_by are cleared when that user is deleted.
create function private.garden_removal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE on public.garden_removal is not allowed' using errcode = 'P0001';
  end if;
  if private.only_unlinks_users(to_jsonb(old), to_jsonb(new), array['requested_by', 'decided_by']) then
    return new;
  end if;
  if (new.id, new.org_id, new.customer_user_id, new.number, new.parcel_id, new.order_id, new.order_item_id,
      new.garden_name, new.initiated_by, new.reason, new.at_period_end, new.withdrawal,
      new.requested_effective_on, new.requested_at)
     is distinct from
     (old.id, old.org_id, old.customer_user_id, old.number, old.parcel_id, old.order_id, old.order_item_id,
      old.garden_name, old.initiated_by, old.reason, old.at_period_end, old.withdrawal,
      old.requested_effective_on, old.requested_at) then
    raise exception 'garden_removal_frozen' using errcode = 'P0001', hint = 'The identity of a removal never changes.';
  end if;
  if old.status in ('completed', 'cancelled')
     and (to_jsonb(new) - array['access_notice_sent_at', 'access_revoked_at', 'updated_at'])
         is distinct from (to_jsonb(old) - array['access_notice_sent_at', 'access_revoked_at', 'updated_at']) then
    raise exception 'removal_not_open' using errcode = 'P0001',
      hint = 'A final removal only records the access notice and the revocation.';
  end if;
  return new;
end;
$$;
revoke all on function private.garden_removal_guard() from public;

create trigger garden_removal_guard before update or delete on public.garden_removal
for each row execute function private.garden_removal_guard();
create trigger garden_removal_touch_updated_at before update on public.garden_removal
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Order line guard, document numbers, audit entity
-- ---------------------------------------------------------------------------

-- An order line gets its parcel once (activation) and its removal once
-- (removed_on with garden_removal_id, together); nothing else changes.
create or replace function private.service_order_item_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or (to_jsonb(new) - array['parcel_id', 'removed_on', 'garden_removal_id', 'updated_at'])
        is distinct from (to_jsonb(old) - array['parcel_id', 'removed_on', 'garden_removal_id', 'updated_at'])
     or (new.parcel_id is distinct from old.parcel_id and old.parcel_id is not null)
     or ((new.removed_on, new.garden_removal_id) is distinct from (old.removed_on, old.garden_removal_id)
         and (old.removed_on is not null or old.garden_removal_id is not null
              or new.removed_on is null or new.garden_removal_id is null)) then
    raise exception '% on public.service_order_item is not allowed', tg_op using errcode = 'P0001',
      hint = 'Only parcel_id is set once, and removed_on with garden_removal_id once.';
  end if;
  return new;
end;
$$;

alter table private.document_sequence drop constraint document_sequence_kind_check;
alter table private.document_sequence add constraint document_sequence_kind_check
  check (kind in ('B', 'T', 'S', 'M', 'I', 'C'));
comment on table private.document_sequence is
  'Counters of document numbers per org, kind and year (B, T, S, M, I, C).';

-- As in 20261030100100_billing_tables.sql, plus C (garden removal).
create or replace function private.next_document_number(p_org_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Istanbul'))::integer;
  v_value integer;
begin
  if p_kind is null or p_kind not in ('B', 'T', 'S', 'M', 'I', 'C') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  insert into private.document_sequence as s (org_id, kind, year, last_value)
  values (p_org_id, p_kind, v_year, 1)
  on conflict (org_id, kind, year) do update set last_value = s.last_value + 1
  returning s.last_value into v_value;
  return p_kind || '-' || v_year || '-' || lpad(v_value::text, 6, '0');
end;
$$;
comment on function private.next_document_number(uuid, text) is
  'Next document number of the org: B (application), T (quote), S (order), M (receipt), I (refund), C (garden removal).';

alter table public.audit_event drop constraint audit_event_entity_type_check;
alter table public.audit_event add constraint audit_event_entity_type_check
  check (entity_type in (
    'signup', 'consent', 'billing_profile', 'owner_profile', 'application', 'application_garden',
    'quote', 'order', 'payment', 'refund', 'price_list', 'package', 'billing_setting', 'garden_removal'
  ));

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.garden_removal enable row level security;
revoke all on public.garden_removal from public, anon, authenticated;
grant select, insert, update, delete on public.garden_removal to service_role;

create policy garden_removal_select on public.garden_removal for select to authenticated
  using (customer_user_id = (select auth.uid()) or org_id in (select authz.user_org_ids('{ops}')));

-- Internal columns (ops_note, requested_by, decided_by, blocked_reason,
-- revoke_all_access) are read by ops through ops_garden_removals and
-- ops_garden_removal_preview. The list equals BILLING_COLUMNS.garden_removal
-- in apps/web/src/lib/billing/columns.ts.
grant select (
  id, org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
  reason, customer_note, at_period_end, withdrawal, requested_effective_on, effective_on, access_days,
  access_until, refund_mode, refund_kurus, calculation, requested_at, scheduled_at, completed_at, cancelled_at,
  cancelled_by, access_notice_sent_at, access_revoked_at, created_at, updated_at
) on public.garden_removal to authenticated;

grant select (addon_of_order_id) on public.quote to authenticated;
grant select (addon_of_order_id) on public.service_order to authenticated;
grant select (withdrawn_at) on public.application_garden to authenticated;
grant select (garden_removal_id) on public.refund to authenticated;

-- Demo guards (docs/demo-turu.md §6.1–§6.2).
select private.attach_demo_guard('public.garden_removal');
select private.attach_demo_account_guard('public.garden_removal', 'customer_user_id');
