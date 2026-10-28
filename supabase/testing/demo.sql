-- Demo tour test helpers (IP13, docs/demo-turu.md §14): local and CI
-- databases only, like the rest of this folder (see purge.sql and README.md).
-- The registry tables (private.demo_*) have no API grants; tests register a
-- fixture org through these functions with the service role. Tests restore
-- the registry they found: register_demo_org returns the demo org that was
-- enabled before, to be registered again in afterAll.

create schema if not exists testing;
revoke all on schema testing from public;
grant usage on schema testing to service_role;

-- Registers (or updates) a demo org with these parcels, in this order, as
-- loaded now. With p_enabled every other demo org is disabled first. A null
-- p_parcel_ids or p_tour keeps what the org has (restoring a registry a test
-- found). Returns the demo org that was enabled before the call, or null.
create or replace function testing.register_demo_org(
  p_org_id uuid,
  p_parcel_ids uuid[],
  p_enabled boolean default true,
  p_tour jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous uuid;
begin
  select org_id into v_previous from private.demo_org where enabled;
  if p_enabled then
    update private.demo_org set enabled = false where enabled and org_id <> p_org_id;
  end if;
  insert into private.demo_org (org_id, enabled, tour, loaded_at)
  values (p_org_id, p_enabled, coalesce(p_tour, '{}'), now())
  on conflict (org_id) do update
    set enabled = excluded.enabled,
        tour = case when p_tour is null then private.demo_org.tour else excluded.tour end,
        loaded_at = excluded.loaded_at;
  if p_parcel_ids is null then
    return v_previous;
  end if;
  delete from private.demo_parcel
  where org_id = p_org_id and not (parcel_id = any(p_parcel_ids));
  insert into private.demo_parcel (parcel_id, org_id, sort_order, active)
  select p.id, p_org_id, p.ord::integer, true
  from unnest(p_parcel_ids) with ordinality as p(id, ord)
  on conflict (parcel_id) do update
    set org_id = excluded.org_id, sort_order = excluded.sort_order, active = true;
  return v_previous;
end;
$$;

-- Moves the demo sessions of these users back in time (created_at and
-- expires_at), e.g. past their end without waiting.
create or replace function testing.age_demo_sessions(p_user_ids uuid[], p_minutes integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  update private.demo_session
  set created_at = created_at - make_interval(mins => p_minutes),
      expires_at = expires_at - make_interval(mins => p_minutes)
  where user_id = any(p_user_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Clears the start counters (rate limits), so that demo tests can run again
-- within the hour.
create or replace function testing.purge_demo_attempts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from private.demo_attempt where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Runs the 5-minute housekeeping job now.
create or replace function testing.run_demo_housekeeping()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.demo_housekeeping();
$$;

-- Uses up the image signing and PDF caps of these users' demo sessions, so the
-- next demo_hit() returns false.
create or replace function testing.exhaust_demo_caps(p_user_ids uuid[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  update private.demo_session s
  set sign_calls = d.max_sign_calls,
      pdf_renders = d.max_pdf_renders
  from private.demo_org d
  where d.org_id = s.org_id and s.user_id = any(p_user_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function testing.register_demo_org(uuid, uuid[], boolean, jsonb) from public;
revoke all on function testing.exhaust_demo_caps(uuid[]) from public;
revoke all on function testing.age_demo_sessions(uuid[], integer) from public;
revoke all on function testing.purge_demo_attempts() from public;
revoke all on function testing.run_demo_housekeeping() from public;
grant execute on function
  testing.register_demo_org(uuid, uuid[], boolean, jsonb), testing.age_demo_sessions(uuid[], integer),
  testing.purge_demo_attempts(), testing.run_demo_housekeeping(),
  testing.exhaust_demo_caps(uuid[])
  to service_role;
