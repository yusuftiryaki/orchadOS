-- Legal follow-ups, wave 3 / 5: access when a contract ends for a garden in
-- any way, the retention items of the lifecycle and removed gardens in
-- Bahçelerim (docs/hukuk/kararlar.md H22, H23, H25; T08, T09, T23; contract
-- Md. 12/4).
--
-- 1. T08: when an order completes (billing housekeeping), when ops terminate
--    an order (ops_terminate_order) and when ops set a pilot parcel passive
--    (ops_set_parcel_passive), the parcels no other active order of the same
--    customer serves get the access flow of a garden removal: a completed
--    system row of public.garden_removal (initiated_by system, reason
--    period_ended, order_terminated or pilot_ended, no refund) opens the
--    read-only window (questions and co-owner invitations closed), the
--    7-day SMS and the access end after removal_access_days. A renewal paid
--    in the window reopens access (private.activate_order closes the window,
--    as for a re-added garden); a pilot parcel set active again closes its
--    window. Behind org_billing_setting.service_end_access_flow_enabled
--    (false on hosted, true in seed): with it off nothing changes.
-- 2. T09: private.contract_end stores the last service day per parcel and
--    owner for every completed removal or service end (later retention work,
--    T10). At the end of an access window the field contact's phone of the
--    parcel (private.parcel_detail, and the customer's application copy) is
--    cleared when no line serves the parcel any more; the name stays.
-- 3. T23: Hesabım › Bahçelerim lists removed gardens, also after their
--    access ended, with the exit day (private.customer_gardens), and gardens
--    in a service-end window.

-- ---------------------------------------------------------------------------
-- 1. System rows of garden_removal
-- ---------------------------------------------------------------------------

alter table public.garden_removal drop constraint garden_removal_initiated_by_check;
alter table public.garden_removal
  add constraint garden_removal_initiated_by_check check (initiated_by in ('customer', 'ops', 'system')),
  add constraint garden_removal_system_reason_check
    check ((initiated_by = 'system') = (reason::text in ('period_ended', 'order_terminated', 'pilot_ended'))),
  alter column order_id drop not null,
  alter column order_item_id drop not null,
  add constraint garden_removal_order_check
    check ((order_id is null) = (order_item_id is null) and (order_id is not null or reason::text = 'pilot_ended'));
comment on column public.garden_removal.initiated_by is
  'customer, ops, or system (T08: the access window when an order completes or is terminated, or a pilot parcel is set passive).';

-- Opens the access window of one parcel for one user on p_effective_on: a
-- completed system row (no refund), operations stopped when no line serves
-- the parcel that day. Returns the row id.
create function private.open_service_end_window(
  p_org_id uuid,
  p_user_id uuid,
  p_parcel_id uuid,
  p_order_id uuid,
  p_order_item_id uuid,
  p_reason public.garden_removal_reason,
  p_effective_on date,
  p_actor uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.org_billing_setting := private.billing_setting(p_org_id);
  v_id uuid;
  v_number text := private.next_document_number(p_org_id, 'C');
  v_visits integer := 0;
  v_followups integer := 0;
  v_invitations integer := 0;
  v_passive boolean := false;
begin
  insert into public.garden_removal (
    org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by, reason,
    requested_effective_on, effective_on, access_days, access_until, refund_mode, refund_kurus, calculation,
    requested_by, scheduled_at, completed_at
  )
  select p_org_id, p_user_id, v_number, p.id, p_order_id, p_order_item_id, p.name, 'completed', 'system', p_reason,
         p_effective_on, p_effective_on, s.removal_access_days, greatest(p_effective_on, private.istanbul_today())
           + s.removal_access_days,
         'none', 0, jsonb_build_object('formula', 'service-end-v1', 'reason', p_reason, 'order_id', p_order_id,
           'effective_on', p_effective_on, 'refund_kurus', 0, 'lines', '[]'::jsonb),
         p_actor, now(), now()
  from public.parcel p where p.id = p_parcel_id
  returning id into v_id;

  if not private.parcel_served_on(p_parcel_id, greatest(p_effective_on, private.istanbul_today())) then
    update public.session set status = 'cancelled'
    where parcel_id = p_parcel_id and status = 'planned' and kind in ('inventory', 'periodic_scan', 'verification');
    get diagnostics v_visits = row_count;
    update public.followup_request set status = 'cancelled', resolved_at = now(), resolved_by = p_actor
    where parcel_id = p_parcel_id and status in ('open', 'planned');
    get diagnostics v_followups = row_count;
    update private.viewer_invitation set status = 'cancelled', resolved_at = now(), resolved_by = p_actor
    where parcel_id = p_parcel_id and status = 'pending';
    get diagnostics v_invitations = row_count;
    update public.parcel set status = 'passive' where id = p_parcel_id and status <> 'passive';
    v_passive := true;
  end if;
  perform private.audit(p_org_id, p_actor, p_role, 'garden_removal.service_end', 'garden_removal', v_id,
    jsonb_build_object('number', v_number, 'reason', p_reason, 'order_id', p_order_id,
      'effective_on', p_effective_on, 'access_days', s.removal_access_days, 'parcel_passive', v_passive,
      'cancelled_visits', v_visits, 'cancelled_followups', v_followups, 'cancelled_invitations', v_invitations));
  return v_id;
end;
$$;
comment on function private.open_service_end_window(uuid, uuid, uuid, uuid, uuid, public.garden_removal_reason, date, uuid, text) is
  'T08: a completed system garden_removal row (read-only access window, no refund) and stopped operations.';

-- T08 for an order that ended (completed or terminated): every parcel of its
-- lines (not removed) that no other active order of the customer serves from
-- p_effective_on, with no open removal and no open window. With the setting
-- off, nothing. Returns the number of windows opened.
create function private.start_service_end_access(
  p_order_id uuid,
  p_reason public.garden_removal_reason,
  p_effective_on date,
  p_actor uuid,
  p_role text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  l record;
  v_count integer := 0;
begin
  select * into o from public.service_order x where x.id = p_order_id;
  if not found or not (private.billing_setting(o.org_id)).service_end_access_flow_enabled
     or private.is_demo_org(o.org_id) then
    return 0;
  end if;
  for l in
    select oi.id, oi.parcel_id from public.service_order_item oi
    where oi.order_id = o.id and oi.parcel_id is not null and oi.removed_on is null
    order by oi.line_no, oi.id
  loop
    continue when exists (
      select 1 from public.service_order_item x
      join public.service_order y on y.id = x.order_id
      where x.parcel_id = l.parcel_id and y.customer_user_id = o.customer_user_id and y.id <> o.id
        and y.status = 'active' and y.service_end >= p_effective_on and x.removed_on is null);
    continue when exists (
      select 1 from public.garden_removal r
      where r.parcel_id = l.parcel_id and r.customer_user_id = o.customer_user_id
        and (r.status in ('requested', 'scheduled') or (r.status = 'completed' and r.access_revoked_at is null)));
    continue when not exists (
      select 1 from public.parcel_access pa
      where pa.parcel_id = l.parcel_id and pa.user_id = o.customer_user_id and pa.role = 'owner');
    perform private.lock_parcel_coverage(array[l.parcel_id]);
    perform private.open_service_end_window(o.org_id, o.customer_user_id, l.parcel_id, o.id, l.id, p_reason,
      p_effective_on, p_actor, p_role);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
comment on function private.start_service_end_access(uuid, public.garden_removal_reason, date, uuid, text) is
  'T08 (H23): read-only window and access end for the parcels of an ended order no other active order of the customer serves.';

-- Orders completed by the billing housekeeping: the day after their end.
create function private.service_end_on_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status = 'active' then
    perform private.start_service_end_access(new.id, 'period_ended', new.service_end + 1, null, 'system');
  end if;
  return null;
end;
$$;
revoke all on function private.service_end_on_complete() from public;
create trigger service_order_service_end_access after update of status on public.service_order
for each row execute function private.service_end_on_complete();

-- As in 20261102120300_garden_removals.sql, then T08 for the ended orders
-- (after their open removals were cancelled): access window from today.
create or replace function public.ops_terminate_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  x public.service_order;
  v_note text := nullif(btrim(p_note), '');
  v_actor uuid := (select auth.uid());
  v_set uuid[];
  v_ended uuid[];
  v_removal record;
  v_order uuid;
begin
  select * into o from public.service_order where id = p_order_id;
  if not found or o.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(o.org_id);
  if o.customer_user_id = v_actor then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  v_set := array[o.id] || case when o.addon_of_order_id is null then array(
    select y.id from public.service_order y
    where y.addon_of_order_id = o.id and y.status in ('active', 'awaiting_payment')) else '{}'::uuid[] end;
  perform private.lock_parcel_coverage(array(
    select oi.parcel_id from public.service_order_item oi where oi.order_id = any (v_set) and oi.parcel_id is not null));
  perform 1 from public.service_order y where y.id = any (v_set) order by y.id for update;
  select * into o from public.service_order where id = p_order_id;

  update public.service_order set status = 'terminated', terminated_at = now(), termination_note = v_note
  where id = o.id and status = 'active';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, v_actor, 'ops', 'order.terminated', 'order', o.id,
    jsonb_build_object('number', o.number));
  v_ended := array[o.id];

  if o.addon_of_order_id is null then
    for x in
      select * from public.service_order y where y.addon_of_order_id = o.id and y.status = 'active' order by y.id
    loop
      update public.service_order set status = 'terminated', terminated_at = now(), termination_note = 'base_terminated'
      where id = x.id and status = 'active';
      perform private.audit(x.org_id, v_actor, 'ops', 'order.terminated', 'order', x.id,
        jsonb_build_object('number', x.number, 'reason', 'base_terminated', 'base_order_id', o.id));
      v_ended := v_ended || x.id;
    end loop;
    perform private.close_base_addons(o, v_actor, 'ops');
  end if;

  for v_removal in
    select r.id, r.org_id, r.number from public.garden_removal r
    where r.customer_user_id = o.customer_user_id and r.status in ('requested', 'scheduled')
      and r.parcel_id in (select oi.parcel_id from public.service_order_item oi where oi.order_id = any (v_ended))
      and not exists (
        select 1 from public.service_order_item oi
        join public.service_order y on y.id = oi.order_id
        where oi.parcel_id = r.parcel_id and y.status = 'active' and oi.removed_on is null)
    order by r.id
    for update of r
  loop
    update public.garden_removal
    set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', blocked_reason = null,
        ops_note = 'order_terminated'
    where id = v_removal.id and status in ('requested', 'scheduled');
    perform private.audit(v_removal.org_id, null, 'system', 'garden_removal.cancelled', 'garden_removal',
      v_removal.id, jsonb_build_object('number', v_removal.number, 'reason', 'order_terminated'));
  end loop;

  foreach v_order in array v_ended loop
    perform private.start_service_end_access(v_order, 'order_terminated', private.istanbul_today(), v_actor, 'ops');
  end loop;
end;
$$;

-- As in 20261102120300_garden_removals.sql, plus T08 for pilot parcels: set
-- passive while no line serves it, the owners get the access window
-- (pilot_ended); set active again, those windows close.
create or replace function public.ops_set_parcel_passive(p_parcel_id uuid, p_passive boolean)
returns public.parcel_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  v_planned integer;
  v_status public.parcel_status;
  v_owner record;
  v_removal record;
begin
  select * into p from public.parcel where id = p_parcel_id for update;
  if not found or p.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_passive is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_passive';
  end if;

  if p_passive then
    if p.status = 'passive' then
      return p.status;
    end if;
    select count(*) into v_planned from public.session s
    where s.parcel_id = p.id and s.status = 'planned'
      and s.kind in ('inventory', 'periodic_scan', 'verification');
    if v_planned > 0 then
      raise exception 'has_planned_visits' using errcode = 'P0001', detail = v_planned::text;
    end if;
    v_status := 'passive';
  else
    if private.parcel_read_only(p.id) then
      if exists (
        select 1 from public.garden_removal r
        where r.parcel_id = p.id and r.status = 'completed' and r.access_revoked_at is null
          and r.reason <> 'pilot_ended'
      ) then
        raise exception 'parcel_removed' using errcode = 'P0001',
          hint = 'The garden was removed from the service; add it back with an add-on quote.';
      end if;
      for v_removal in
        update public.garden_removal set access_revoked_at = now()
        where parcel_id = p.id and status = 'completed' and access_revoked_at is null and reason = 'pilot_ended'
        returning id, org_id
      loop
        perform private.audit(v_removal.org_id, (select auth.uid()), 'ops', 'garden_removal.access_closed',
          'garden_removal', v_removal.id, jsonb_build_object('reason', 'resumed'));
      end loop;
    end if;
    if p.status <> 'passive' then
      return p.status;
    end if;
    v_status := private.parcel_lifecycle_status(p.id);
  end if;

  update public.parcel set status = v_status where id = p.id;

  if p_passive and (private.billing_setting(p.org_id)).service_end_access_flow_enabled
     and not private.is_demo_org(p.org_id) and not private.parcel_served_on(p.id, private.istanbul_today()) then
    for v_owner in
      select pa.user_id from public.parcel_access pa
      where pa.parcel_id = p.id and pa.role = 'owner'
        and not exists (
          select 1 from public.garden_removal r
          where r.parcel_id = p.id and r.customer_user_id = pa.user_id
            and (r.status in ('requested', 'scheduled') or (r.status = 'completed' and r.access_revoked_at is null)))
      order by pa.user_id
    loop
      perform private.open_service_end_window(p.org_id, v_owner.user_id, p.id, null, null, 'pilot_ended',
        private.istanbul_today(), (select auth.uid()), 'ops');
    end loop;
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Contract end dates and the field contact's phone
-- ---------------------------------------------------------------------------

create table private.contract_end (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  user_id uuid not null,
  -- The last day the garden was served for the user (the exit day − 1).
  last_service_day date not null,
  cause text not null check (cause in ('removal', 'withdrawal', 'period_ended', 'order_terminated', 'pilot_ended')),
  garden_removal_id uuid not null unique references public.garden_removal (id),
  recorded_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id)
);
comment on table private.contract_end is
  'T09 (H25): last service day per parcel and owner of each removal or service end, for the retention periods (T10). Append-only.';
create index contract_end_parcel_idx on private.contract_end (parcel_id, last_service_day desc);
create index contract_end_user_idx on private.contract_end (user_id, last_service_day desc);
alter table private.contract_end enable row level security;
revoke all on private.contract_end from public, anon, authenticated;
select private.attach_demo_guard('private.contract_end');
create trigger contract_end_append_only before update or delete on private.contract_end
for each row execute function private.append_only();

-- The latest contract end of a parcel, and of an owner (any parcel), while
-- no line serves them now; null otherwise.
create function private.parcel_contract_end(p_parcel_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(c.last_service_day) from private.contract_end c
  where c.parcel_id = p_parcel_id and not private.parcel_served_on(p_parcel_id, private.istanbul_today());
$$;
create function private.owner_contract_end(p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(c.last_service_day) from private.contract_end c
  where c.user_id = p_user_id and not exists (
    select 1 from public.service_order o
    where o.customer_user_id = p_user_id and o.status = 'active' and o.service_end >= private.istanbul_today());
$$;
comment on function private.parcel_contract_end(uuid) is 'T09: the latest last service day of a parcel no line serves today.';
comment on function private.owner_contract_end(uuid) is 'T09: the latest last service day of an owner with no active order.';

create function private.record_contract_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    insert into private.contract_end (org_id, parcel_id, user_id, last_service_day, cause, garden_removal_id)
    values (new.org_id, new.parcel_id, new.customer_user_id, new.effective_on - 1,
            case
              when new.reason::text in ('period_ended', 'order_terminated', 'pilot_ended') then new.reason::text
              when new.withdrawal then 'withdrawal'
              else 'removal'
            end, new.id)
    on conflict (garden_removal_id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function private.record_contract_end() from public;
create trigger garden_removal_contract_end after insert or update of status on public.garden_removal
for each row execute function private.record_contract_end();

insert into private.contract_end (org_id, parcel_id, user_id, last_service_day, cause, garden_removal_id)
select r.org_id, r.parcel_id, r.customer_user_id, r.effective_on - 1,
       case when r.withdrawal then 'withdrawal' else 'removal' end, r.id
from public.garden_removal r
where r.status = 'completed'
on conflict (garden_removal_id) do nothing;

-- At the end of an access window (access_revoked_at set), when no line serves
-- the parcel any more: the field contact's phone is cleared (H25: "Erişim
-- sonunda saha kişisi telefonunun silinmesi"); the name stays. The
-- customer's application copies of the garden too.
create function private.clear_site_contact_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parcel integer := 0;
  v_application integer := 0;
begin
  if old.access_revoked_at is not null or new.access_revoked_at is null
     or private.parcel_served_on(new.parcel_id, private.istanbul_today()) then
    return null;
  end if;
  update private.parcel_detail set site_contact_phone = null, updated_at = now()
  where parcel_id = new.parcel_id and site_contact_phone is not null;
  get diagnostics v_parcel = row_count;
  update private.application_garden_detail d set site_contact_phone = null
  where d.site_contact_phone is not null and d.application_garden_id in (
    select g.id from public.application_garden g
    where g.customer_user_id = new.customer_user_id and g.parcel_id = new.parcel_id
    union
    select qi.application_garden_id from public.service_order_item oi
    join public.quote_item qi on qi.id = oi.quote_item_id
    where oi.parcel_id = new.parcel_id and oi.customer_user_id = new.customer_user_id
      and qi.application_garden_id is not null);
  get diagnostics v_application = row_count;
  if v_parcel + v_application > 0 then
    perform private.audit(new.org_id, null, 'system', 'parcel.site_contact_phone_cleared', 'parcel', new.parcel_id,
      jsonb_build_object('garden_removal_id', new.id, 'parcel_detail', v_parcel, 'application', v_application));
  end if;
  return null;
end;
$$;
revoke all on function private.clear_site_contact_phone() from public;
create trigger garden_removal_clear_site_contact after update of access_revoked_at on public.garden_removal
for each row execute function private.clear_site_contact_phone();

-- ---------------------------------------------------------------------------
-- 3. Bahçelerim
-- ---------------------------------------------------------------------------

-- As in 20261103100700_legal_review_fixes.sql, plus: a removed line stays
-- listed as removed after its access ended (prio 4), and a line of an ended
-- order with an open service-end window (T08) is listed as removed.
create or replace function private.customer_gardens(p_org_id uuid, p_user_id uuid)
returns table (
  order_item_id uuid,
  order_id uuid,
  order_number text,
  base_order_id uuid,
  is_addon boolean,
  order_status public.order_status,
  parcel_id uuid,
  garden_name text,
  parcel_status public.parcel_status,
  state text,
  service_start date,
  service_end date,
  removed_on date,
  visits_entitled smallint,
  visits_used integer,
  withdrawal_until date,
  in_next_period boolean,
  next_order_item_id uuid,
  removal_id uuid,
  removal_number text,
  removal_status public.garden_removal_status,
  removal_effective_on date,
  access_until date,
  removal_initiated_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select oi.id as item_id, oi.order_id, oi.line_no, oi.parcel_id, oi.removed_on, oi.quote_item_id,
           coalesce(oi.garden_removal_id, se.id) as garden_removal_id,
           o.number, o.status, o.addon_of_order_id, o.service_start, o.service_end,
           case
             when o.status = 'active' and o.service_start <= private.istanbul_today()
                  and private.istanbul_today() <= o.service_end
                  and (oi.removed_on is null or oi.removed_on > private.istanbul_today()) then 1
             when o.status = 'active' and o.service_start > private.istanbul_today() and oi.removed_on is null then 2
             when exists (
                    select 1 from public.garden_removal gr
                    where gr.id = coalesce(oi.garden_removal_id, se.id) and gr.status = 'completed'
                      and gr.access_until >= private.istanbul_today() and gr.access_revoked_at is null) then 3
             when exists (
                    select 1 from public.garden_removal gr
                    where gr.id = coalesce(oi.garden_removal_id, se.id) and gr.status = 'completed') then 4
           end as prio
    from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    left join lateral (
      select gr.id from public.garden_removal gr
      where gr.order_item_id = oi.id and gr.initiated_by = 'system' and gr.status = 'completed'
        and oi.removed_on is null
      order by gr.completed_at desc, gr.id desc
      limit 1
    ) se on true
    where o.org_id = p_org_id and o.customer_user_id = p_user_id and oi.parcel_id is not null
  ),
  pick as (
    select distinct on (l.parcel_id) l.*
    from lines l
    where l.prio is not null
    order by l.parcel_id, l.prio, case when l.prio < 3 then l.service_start end, l.service_start desc, l.line_no
  )
  select k.item_id, k.order_id, k.number, coalesce(k.addon_of_order_id, k.order_id), k.addon_of_order_id is not null,
         k.status, k.parcel_id, pa.name, pa.status,
         case
           when k.prio >= 3 then 'removed'
           when rm.status in ('requested', 'scheduled') then 'leaving'
           when k.prio = 1 then 'in_service'
           else 'upcoming'
         end,
         k.service_start, k.service_end, coalesce(k.removed_on, case when k.prio >= 3 then rm.effective_on end),
         qi.visits,
         least(qi.visits::integer, bv.used),
         coalesce(case when k.prio < 3 then (
           select w.withdrawal_until from private.withdrawal_target(p_org_id, p_user_id, k.parcel_id) w) end,
           (select private.withdrawal_until(o2) from public.service_order o2 where o2.id = k.order_id)),
         case when exists (
           select 1 from public.service_order rn
           where rn.renewal_of_order_id = coalesce(k.addon_of_order_id, k.order_id) and rn.status = 'active'
         ) then nx.id is not null end,
         nx.id,
         rm.id, rm.number, rm.status, coalesce(rm.effective_on, rm.requested_effective_on),
         rm.access_until,
         rm.initiated_by
  from pick k
  join public.parcel pa on pa.id = k.parcel_id
  join public.quote_item qi on qi.id = k.quote_item_id
  cross join lateral private.billed_visits(k.parcel_id, k.service_start, coalesce(k.removed_on - 1, k.service_end)) bv
  left join lateral (
    select nxi.id from public.service_order_item nxi
    join public.service_order o2 on o2.id = nxi.order_id
    where nxi.parcel_id = k.parcel_id and o2.customer_user_id = p_user_id and o2.status = 'active'
      and o2.service_start > k.service_start and nxi.removed_on is null
    order by o2.service_start, nxi.id
    limit 1
  ) nx on true
  left join lateral (
    select gr.* from public.garden_removal gr
    where gr.parcel_id = k.parcel_id and gr.customer_user_id = p_user_id
    order by gr.id is not distinct from k.garden_removal_id desc, gr.status in ('requested', 'scheduled') desc,
             gr.requested_at desc, gr.id desc
    limit 1
  ) rm on true
  order by k.service_start, k.line_no, k.item_id;
$$;

revoke all on function private.open_service_end_window(uuid, uuid, uuid, uuid, uuid, public.garden_removal_reason, date, uuid, text) from public;
revoke all on function private.start_service_end_access(uuid, public.garden_removal_reason, date, uuid, text) from public;
revoke all on function private.parcel_contract_end(uuid) from public;
revoke all on function private.owner_contract_end(uuid) from public;
