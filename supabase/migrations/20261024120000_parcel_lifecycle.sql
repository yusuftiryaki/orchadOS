-- Parcel life cycle, second half (docs/MVP.md Module 1):
-- registered -> inventory_planned -> inventory_done -> active_monitoring -> passive.
--
-- The first two steps follow the inventory visit
-- (20261021220000_operations_screens.sql), inventory_done is set by the
-- expert's inventory approval (20261021210000_inventory_approval.sql). Here:
--
-- 1. inventory_done -> active_monitoring when the first periodic scan of the
--    parcel is published (the owner has a report from then on).
-- 2. passive: ops ends monitoring (service ended, owner left) and can resume it.
--    ops_set_parcel_passive(parcel, passive). Resuming returns the parcel to
--    the step its visits show.
-- 3. A passive parcel gets no new inventory, scan or verification visit; ops
--    resumes it first. Planned visits must be cancelled before the parcel
--    goes passive, so the crew has no task on it.

-- ---------------------------------------------------------------------------
-- 1. Active monitoring after the first published periodic scan
-- ---------------------------------------------------------------------------

-- Security definer: the status follows the publication whoever publishes.
create function private.sync_parcel_monitoring_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'periodic_scan' and new.status = 'published'
     and old.status is distinct from 'published' then
    update public.parcel set status = 'active_monitoring'
    where id = new.parcel_id and status = 'inventory_done';
  end if;
  return null;
end;
$$;

create trigger session_sync_parcel_monitoring_status
after update of status on public.session
for each row execute function private.sync_parcel_monitoring_status();

-- Inserted already published (pipeline, tests with the service key).
create trigger session_sync_parcel_monitoring_status_insert
after insert on public.session
for each row when (new.status = 'published')
execute function private.sync_parcel_monitoring_status();

-- ---------------------------------------------------------------------------
-- 2. Passive and back
-- ---------------------------------------------------------------------------

-- Where a resumed parcel stands, from its visits.
create function private.parcel_lifecycle_status(p_parcel_id uuid)
returns public.parcel_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.session s
                 where s.parcel_id = p_parcel_id and s.kind = 'periodic_scan' and s.status = 'published')
      then 'active_monitoring'::public.parcel_status
    when exists (select 1 from public.session s
                 where s.parcel_id = p_parcel_id and s.kind = 'inventory' and s.status = 'published')
      then 'inventory_done'::public.parcel_status
    when exists (select 1 from public.session s
                 where s.parcel_id = p_parcel_id and s.kind = 'inventory' and s.status <> 'cancelled')
      then 'inventory_planned'::public.parcel_status
    else 'registered'::public.parcel_status
  end;
$$;

-- Returns the new status. Errors: not_found (P0002), forbidden (42501),
-- has_planned_visits (P0001; detail: number of planned visits).
create function public.ops_set_parcel_passive(p_parcel_id uuid, p_passive boolean)
returns public.parcel_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  v_planned integer;
  v_status public.parcel_status;
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
    if p.status <> 'passive' then
      return p.status;
    end if;
    v_status := private.parcel_lifecycle_status(p.id);
  end if;

  update public.parcel set status = v_status where id = p.id;
  return v_status;
end;
$$;
comment on function public.ops_set_parcel_passive(uuid, boolean) is
  'Ops: end (passive) or resume monitoring of a parcel. Resuming returns it to the step its visits show.';

-- ---------------------------------------------------------------------------
-- 3. No new visits on a passive parcel
-- ---------------------------------------------------------------------------

-- API users only, like guard_visit_planning; trusted roles are not restricted.
create function private.guard_passive_parcel_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.kind in ('inventory', 'periodic_scan', 'verification') and new.status = 'planned'
     and exists (select 1 from public.parcel p where p.id = new.parcel_id and p.status = 'passive') then
    raise exception 'parcel_passive' using errcode = 'P0001',
      hint = 'Resume monitoring of the parcel before planning a visit.';
  end if;
  return new;
end;
$$;

create trigger session_guard_passive_parcel
before insert on public.session
for each row execute function private.guard_passive_parcel_visit();

revoke all on function public.ops_set_parcel_passive(uuid, boolean) from public, anon;
grant execute on function public.ops_set_parcel_passive(uuid, boolean) to authenticated;
