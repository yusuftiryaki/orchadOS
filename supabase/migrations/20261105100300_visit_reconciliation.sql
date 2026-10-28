-- Legal follow-ups, wave 3 / 4: 8A reconciliation at window and period ends
-- (docs/hukuk/kararlar.md H21; T06; contract Md. 8A/2, 8A/6, 12/3 "Dönemi
-- biten satır").
--
-- 8A/6: "Şirket, her ziyaret penceresinin ve hizmet döneminin sonunda
-- yapılamayan ziyaretleri kendiliğinden tespit eder." A check runs:
--   * when an order becomes completed (billing housekeeping) and when a
--     "dönem sonunda" removal completes (trigger 'period_end', 'removal'):
--     shortfall = entitled − used − refunded (8A) visits;
--   * the day after each contract window (Ek-2, public.contract_visit_windows)
--     ends, for the lines serving that day (trigger 'window_end', daily
--     pg_cron job visit-reconciliation): shortfall = entitled − used −
--     refunded − carried over − windows still ahead in the line's period
--     (a visit is missed once the remaining windows cannot hold it).
-- A positive shortfall with no task for the line and scope yet opens one
-- ops task, due 14 days after the window or period end (8A/2: refund within
-- 14 days). Opening the refund stays manual (ops_request_refund, reason
-- missed_visit); ops resolve the task with the refund, the carry over, a
-- done visit or a note. On for every org (ops only, no customer message).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table private.visit_reconciliation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_user_id uuid not null,
  order_id uuid not null,
  order_item_id uuid not null,
  parcel_id uuid not null,
  trigger text not null check (trigger in ('window_end', 'period_end', 'removal')),
  -- The last day of the window or of the line's period checked.
  scope_end date not null,
  window_label text check (char_length(window_label) <= 40),
  visits_entitled integer not null,
  visits_used integer not null,
  visits_refunded integer not null,
  visits_carried integer not null,
  windows_ahead integer not null,
  shortfall integer not null check (shortfall > 0),
  visit_fee_kurus bigint not null,
  detected_on date not null,
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution in ('refund_opened', 'carried_over', 'visit_done', 'not_needed')),
  -- Internal; personal data possible (KVKK scripts: erase).
  resolution_note text check (char_length(resolution_note) between 1 and 2000),
  refund_id uuid references public.refund (id),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_item_id, scope_end),
  check ((status = 'resolved') = (resolution is not null and resolved_at is not null)),
  check (resolution is distinct from 'not_needed' or resolution_note is not null),
  check (resolution = 'refund_opened' or refund_id is null),
  foreign key (order_item_id, order_id) references public.service_order_item (id, order_id),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id)
);
comment on table private.visit_reconciliation is
  'T06 (8A/6, H21): ops task for a line whose periodic visits fall short at a window or period end; due 14 days after; refund manual.';
create index visit_reconciliation_org_idx on private.visit_reconciliation (org_id, status, due_on);
create index visit_reconciliation_customer_idx on private.visit_reconciliation (customer_user_id);
create index visit_reconciliation_parcel_idx on private.visit_reconciliation (parcel_id);
create index visit_reconciliation_order_idx on private.visit_reconciliation (order_id);
create index visit_reconciliation_refund_idx on private.visit_reconciliation (refund_id);
alter table private.visit_reconciliation enable row level security;
revoke all on private.visit_reconciliation from public, anon, authenticated;
select private.attach_demo_guard('private.visit_reconciliation');
select private.attach_demo_account_guard('private.visit_reconciliation', 'customer_user_id');
create trigger visit_reconciliation_touch_updated_at before update on private.visit_reconciliation
for each row execute function private.touch_updated_at();

-- The figures are frozen; an open task is resolved once.
create function private.visit_reconciliation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE on private.visit_reconciliation is not allowed' using errcode = 'P0001';
  end if;
  if old.status = 'resolved'
     or (to_jsonb(new) - array['status', 'resolution', 'resolution_note', 'refund_id', 'resolved_by', 'resolved_at',
           'updated_at'])
        is distinct from (to_jsonb(old) - array['status', 'resolution', 'resolution_note', 'refund_id', 'resolved_by',
           'resolved_at', 'updated_at']) then
    raise exception 'reconciliation_frozen' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.visit_reconciliation_guard() from public;
create trigger visit_reconciliation_guard before update or delete on private.visit_reconciliation
for each row execute function private.visit_reconciliation_guard();

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------

-- One line checked through p_scope_end; opens a task when visits fall short.
-- Returns 1 when a task was opened, else 0. Lines without visits, demo orgs
-- and lines already checked for the scope give 0.
create function private.reconcile_line(p_order_item_id uuid, p_scope_end date, p_trigger text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  u record;
  w jsonb;
  v_end date;
  v_share bigint;
  v_fee bigint;
  v_refunded integer;
  v_carried integer;
  v_ahead integer := 0;
  v_shortfall integer;
  v_count integer;
begin
  select oi.id, oi.order_id, oi.parcel_id, oi.removed_on, oi.amount_kurus, o.org_id, o.customer_user_id,
         o.service_start, o.service_end, qi.visits, qi.inventory_fee_kurus, qi.line_base_kurus
  into l
  from public.service_order_item oi
  join public.service_order o on o.id = oi.order_id
  join public.quote_item qi on qi.id = oi.quote_item_id
  where oi.id = p_order_item_id;
  if not found or l.parcel_id is null or coalesce(l.visits, 0) = 0 or private.is_demo_org(l.org_id) then
    return 0;
  end if;
  v_end := least(p_scope_end, l.service_end, coalesce(l.removed_on - 1, l.service_end));
  if v_end < l.service_start then
    return 0;
  end if;
  select * into u from private.visit_usage(l.parcel_id, l.service_start, v_end);
  v_share := case when l.line_base_kurus > 0
               then round(l.amount_kurus::numeric * l.inventory_fee_kurus / l.line_base_kurus) else 0 end;
  v_fee := private.removal_visit_fee(l.amount_kurus, v_share, l.visits);
  -- 8A refunds of the line: refunded missed-visit records, or the missed-visit
  -- refunds of the order counted in visit fees, whichever is more.
  select greatest(
    (select count(*) from private.missed_visit m
     where m.parcel_id = l.parcel_id and m.outcome = 'refunded'
       and m.occurred_on between l.service_start and l.service_end)::integer,
    (select case when v_fee > 0 then floor(coalesce(sum(r.amount_kurus), 0)::numeric / v_fee)::integer else 0 end
     from public.refund r
     left join public.payment_item pi on pi.id = r.payment_item_id
     where r.order_id = l.order_id and r.reason = 'missed_visit'
       and r.status in ('requested', 'processing', 'succeeded')
       and (pi.order_item_id = l.id or r.payment_item_id is null or pi.order_item_id is null)))
  into v_refunded;
  select count(*) into v_carried from private.missed_visit m
  where m.parcel_id = l.parcel_id and m.outcome = 'carried_over'
    and m.occurred_on between l.service_start and l.service_end;
  if p_trigger = 'window_end' then
    v_ahead := jsonb_array_length(private.remaining_visit_windows(v_end + 1, l.service_end));
    v_shortfall := l.visits - least(u.used, l.visits) - v_refunded - v_carried - v_ahead;
  else
    v_shortfall := l.visits - least(u.used, l.visits) - v_refunded;
  end if;
  if v_shortfall <= 0 then
    return 0;
  end if;
  w := private.visit_window_of(p_scope_end);
  insert into private.visit_reconciliation (
    org_id, customer_user_id, order_id, order_item_id, parcel_id, trigger, scope_end, window_label,
    visits_entitled, visits_used, visits_refunded, visits_carried, windows_ahead, shortfall, visit_fee_kurus,
    detected_on, due_on
  )
  values (
    l.org_id, l.customer_user_id, l.order_id, l.id, l.parcel_id, p_trigger, v_end,
    case when p_trigger = 'window_end' then w ->> 'label' end,
    l.visits, least(u.used, l.visits), v_refunded, v_carried, v_ahead, v_shortfall, v_fee,
    private.istanbul_today(), v_end + 14
  )
  on conflict (order_item_id, scope_end) do nothing;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.audit(l.org_id, null, 'system', 'visit_reconciliation.opened', 'visit_reconciliation', l.id,
      jsonb_build_object('trigger', p_trigger, 'scope_end', v_end, 'shortfall', v_shortfall));
  end if;
  return v_count;
end;
$$;
comment on function private.reconcile_line(uuid, date, text) is
  'T06 (8A/6): checks a line through a window or period end and opens an ops task for the visits that fell short.';

-- Every line of an order that completed (its period ended).
create function private.reconcile_completed_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oi record;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return null;
  end if;
  for oi in select x.id from public.service_order_item x where x.order_id = new.id and x.parcel_id is not null order by x.line_no loop
    perform private.reconcile_line(oi.id, new.service_end, 'period_end');
  end loop;
  return null;
end;
$$;
revoke all on function private.reconcile_completed_order() from public;
create trigger service_order_reconcile_completed after update of status on public.service_order
for each row execute function private.reconcile_completed_order();

-- A "dönem sonunda" removal completing: the line that ended with its period.
create function private.reconcile_period_end_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oi record;
begin
  if new.status <> 'completed' or old.status = 'completed' or not new.at_period_end or new.order_item_id is null then
    return null;
  end if;
  for oi in
    select x.id, o.service_end from public.service_order_item x join public.service_order o on o.id = x.order_id
    where x.id = new.order_item_id
  loop
    perform private.reconcile_line(oi.id, oi.service_end, 'removal');
  end loop;
  return null;
end;
$$;
revoke all on function private.reconcile_period_end_removal() from public;
create trigger garden_removal_reconcile_period_end after update of status on public.garden_removal
for each row execute function private.reconcile_period_end_removal();

-- Daily: windows that ended the day before p_day; every active line serving
-- that day. Returns the number of tasks opened.
create function private.visit_reconciliation_housekeeping(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, private.istanbul_today());
  w jsonb;
  l record;
  v_opened integer := 0;
  v_windows integer := 0;
begin
  for w in
    select x from jsonb_array_elements(private.remaining_visit_windows(v_day - 1, v_day - 1)) x
    where (x ->> 'end')::date = v_day - 1
  loop
    v_windows := v_windows + 1;
    for l in
      select oi.id from public.service_order_item oi
      join public.service_order o on o.id = oi.order_id
      where o.status = 'active' and oi.parcel_id is not null
        and o.service_start <= v_day - 1 and v_day - 1 <= o.service_end
        and (oi.removed_on is null or oi.removed_on > v_day - 1)
      order by oi.id
    loop
      v_opened := v_opened + private.reconcile_line(l.id, v_day - 1, 'window_end');
    end loop;
  end loop;
  return jsonb_build_object('windows', v_windows, 'opened', v_opened);
end;
$$;
comment on function private.visit_reconciliation_housekeeping(date) is
  'T06: after a contract window ends, checks the lines that served its last day (8A/6).';
revoke all on function private.visit_reconciliation_housekeeping(date) from public;

select cron.schedule('visit-reconciliation', '45 0 * * *', 'select private.visit_reconciliation_housekeeping()');

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------

-- Tasks of an org: open ones (null), all ('all') or one status; overdue when
-- open past the due day.
create function public.ops_visit_reconciliations(p_org_id uuid, p_status text default null)
returns table (
  id uuid,
  customer_user_id uuid,
  customer_name text,
  order_id uuid,
  order_number text,
  order_item_id uuid,
  parcel_id uuid,
  parcel_name text,
  trigger text,
  scope_end date,
  window_label text,
  visits_entitled integer,
  visits_used integer,
  visits_refunded integer,
  visits_carried integer,
  windows_ahead integer,
  shortfall integer,
  visit_fee_kurus bigint,
  detected_on date,
  due_on date,
  overdue boolean,
  status text,
  resolution text,
  resolution_note text,
  refund_id uuid,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and p_status not in ('all', 'open', 'resolved') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select v.id, v.customer_user_id, op.full_name, v.order_id, o.number, v.order_item_id, v.parcel_id, p.name,
         v.trigger, v.scope_end, v.window_label, v.visits_entitled, v.visits_used, v.visits_refunded,
         v.visits_carried, v.windows_ahead, v.shortfall, v.visit_fee_kurus, v.detected_on, v.due_on,
         v.status = 'open' and v.due_on < private.istanbul_today(), v.status, v.resolution, v.resolution_note,
         v.refund_id, v.resolved_at
  from private.visit_reconciliation v
  join public.service_order o on o.id = v.order_id
  join public.parcel p on p.id = v.parcel_id
  left join private.owner_profile op on op.org_id = v.org_id and op.user_id = v.customer_user_id
  where v.org_id = p_org_id
    and (p_status = 'all' or v.status = coalesce(p_status, 'open'))
  order by v.status, v.due_on, v.id
  limit 500;
end;
$$;
comment on function public.ops_visit_reconciliations(uuid, text) is
  'Ops (T06): 8A reconciliation tasks with the due day and the overdue flag.';

-- Resolves a task once: refund_opened (a missed_visit refund of the order),
-- carried_over, visit_done or not_needed (note required). Errors: not_found,
-- forbidden, reconciliation_frozen, invalid_input (resolution, note,
-- refund_id).
create function public.ops_resolve_visit_reconciliation(
  p_id uuid,
  p_resolution text,
  p_note text default null,
  p_refund_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v private.visit_reconciliation;
  v_note text := nullif(btrim(p_note), '');
  v_actor uuid := (select auth.uid());
begin
  select * into v from private.visit_reconciliation x where x.id = p_id for update;
  if not found or v.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(v.org_id);
  if v.status <> 'open' then
    raise exception 'reconciliation_frozen' using errcode = 'P0001';
  end if;
  if p_resolution is null or p_resolution not in ('refund_opened', 'carried_over', 'visit_done', 'not_needed') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'resolution';
  end if;
  if length(v_note) > 2000 or (p_resolution = 'not_needed' and v_note is null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if p_refund_id is not null and (p_resolution <> 'refund_opened' or not exists (
       select 1 from public.refund r where r.id = p_refund_id and r.order_id = v.order_id and r.reason = 'missed_visit')) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'refund_id';
  end if;
  update private.visit_reconciliation
  set status = 'resolved', resolution = p_resolution, resolution_note = v_note, refund_id = p_refund_id,
      resolved_by = v_actor, resolved_at = now()
  where id = v.id;
  perform private.audit(v.org_id, v_actor, 'ops', 'visit_reconciliation.resolved', 'visit_reconciliation', v.id,
    jsonb_build_object('resolution', p_resolution, 'refund_id', p_refund_id, 'overdue',
      v.due_on < private.istanbul_today()));
end;
$$;
comment on function public.ops_resolve_visit_reconciliation(uuid, text, text, uuid) is
  'Ops (T06): resolves an 8A reconciliation task (refund opened, carried over, visit done, not needed with a note).';

-- Ops nav badge: open tasks and overdue ones.
create function public.ops_visit_reconciliation_counts(p_org_id uuid)
returns table (open integer, overdue integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, count(*) filter (where v.due_on < private.istanbul_today())::integer
  from private.visit_reconciliation v
  where v.org_id = p_org_id and v.status = 'open' and p_org_id in (select authz.user_org_ids('{ops}'));
$$;

revoke all on function private.reconcile_line(uuid, date, text) from public;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ops_visit_reconciliations(uuid, text)',
    'public.ops_resolve_visit_reconciliation(uuid, text, text, uuid)',
    'public.ops_visit_reconciliation_counts(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
