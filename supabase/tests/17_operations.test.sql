-- Operations screens v0.1: private data through ops_* functions, parcel
-- registration with a rough boundary, visit planning rules, parcel life cycle.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05
-- of org b0..01, parcel c0..01. Fixtures add an account ad..01 without a
-- profile (phone +905551230001).
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

-- Message and detail of a failing statement (the reason the web app maps).
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;

-- Ring around 37.40 E 37.02 N, about 90 m x 110 m.
create function pg_temp.ring() returns jsonb language sql immutable
as $$ select '[[37.400, 37.020], [37.401, 37.020], [37.401, 37.021], [37.400, 37.021]]'::jsonb $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (instance_id, id, aud, role, email, phone, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'pgtap-owner@example.test', '905551230001', '', now(), '{}', '{}', now(), now());

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

-- Schema ---------------------------------------------------------------------------

select has_function('public', 'ops_owner_profiles', array['uuid'], 'ops_owner_profiles exists');
select has_function('public', 'register_parcel', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'uuid'], 'register_parcel exists');
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace and proname like 'ops\_%' and not prosecdef),
  null, 'every ops_* function is security definer (private schema)');
select is(
  (select array_agg(prosecdef order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('register_parcel', 'add_owner_declared_boundary')),
  array[false, false], 'register_parcel and add_owner_declared_boundary run as the caller');
select ok(not has_function_privilege('anon', 'public.ops_owner_profiles(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.ops_find_user_id(uuid, text, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.register_parcel(uuid, jsonb, jsonb, jsonb, uuid)', 'EXECUTE'),
  'anon calls none of the operations functions');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'the private schema stays closed to API users');
select has_trigger('public', 'session', 'session_guard_visit_planning', 'visit planning guard');
select has_trigger('public', 'session', 'session_sync_parcel_inventory_status', 'parcel life cycle trigger');

-- Ops: private data ------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

select is((select count(*) from public.ops_owner_profiles()), 2::bigint, 'ops lists the owner profiles of its org');
select is(
  public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'OWNER@example.com'),
  'a0000000-0000-4000-8000-000000000001'::uuid, 'ops finds an account by e-mail (case-insensitive)');
select is(
  public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null, '+905551230001'),
  'ad000000-0000-4000-8000-000000000001'::uuid, 'ops finds an account by phone');
select is(
  public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'nobody@example.test'),
  null, 'unknown e-mail: null');

select is(
  pg_temp.error_of($$ select public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001', 'Yeni Sahip', 'whatsapp', true, p_phone => '05551230001',
    p_kvkk_consent_at => now(), p_kvkk_text_version => 'kvkk-v0') $$),
  'invalid_input / phone', 'a malformed phone is rejected by field name, without its value');
select is(
  pg_temp.error_of($$ select public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001', 'Yeni Sahip', 'whatsapp', true, p_phone => '+905551230001',
    p_kvkk_text_version => 'kvkk-v0') $$),
  'invalid_input / kvkk_consent_at', 'consent needs its date');
insert into ids
select 'profile', public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001', ' Yeni Sahip ', 'sms', true, '+905551230001', 'pgtap-owner@example.test',
  '2026-10-21 09:00:00+00', 'kvkk-v0');
select is(
  (select full_name || '|' || contact_preference from public.ops_owner_profiles((select id from ids where name = 'profile'))),
  'Yeni Sahip|sms', 'ops registers an owner profile');
select is(
  pg_temp.error_of($$ select public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001', 'Again', 'sms', false) $$),
  'exists', 'one profile per account and org');
select lives_ok(
  $$ select public.ops_update_owner_profile((select id from ids where name = 'profile'), 'Yeni Sahip Düzeltildi',
       'whatsapp', true, '+905551230001', null, '2026-10-21 09:00:00+00', 'kvkk-v1') $$,
  'ops corrects a profile');
select is(
  (select full_name || '|' || kvkk_text_version || '|' || coalesce(email, '-')
   from public.ops_owner_profiles((select id from ids where name = 'profile'))),
  'Yeni Sahip Düzeltildi|kvkk-v1|-', 'the correction is stored');
select is((select count(*) from public.ops_parcel_detail('c0000000-0000-4000-8000-000000000001')), 1::bigint,
  'ops reads the private detail of a parcel');
select is((select count(*) from public.ops_org_members('b0000000-0000-4000-8000-000000000001') where role = 'field_staff'),
  1::bigint, 'ops lists the field staff of its org');

-- Ops: parcel registration -----------------------------------------------------------

insert into ids
select 'parcel', public.register_parcel(
  'b0000000-0000-4000-8000-000000000001',
  jsonb_build_object('name', 'Kayıt Bahçesi (test)', 'province', 'Gaziantep', 'district', 'Nizip',
    'village', 'Test Köyü', 'estimated_area_m2', 9500, 'irrigation', 'rainfed', 'estimated_tree_count', 120),
  jsonb_build_object('deed_block', '12', 'deed_parcel', '34', 'is_shared_deed', true,
    'used_portion_note', 'Güney bölüm', 'authorization_basis', 'heir_declaration',
    'entry_permission_at', '2026-10-21T09:00:00Z', 'site_contact_name', 'Komşu', 'site_contact_phone', '+905551230099'),
  pg_temp.ring(),
  'ad000000-0000-4000-8000-000000000001');

select is(
  (select status::text || '|' || irrigation::text || '|' || estimated_tree_count from public.parcel
   where id = (select id from ids where name = 'parcel')),
  'registered|rainfed|120', 'ops registers a parcel');
select is(
  (select version || '|' || source::text from public.boundary where parcel_id = (select id from ids where name = 'parcel')),
  '1|owner_declared', 'the rough boundary is version 1, owner_declared');
select ok(
  (select position is not null and position_uncertainty_m between 50 and 100 from public.parcel
   where id = (select id from ids where name = 'parcel')),
  'without a position the parcel is placed at the boundary centroid');
select is(
  (select deed_block || '|' || authorization_basis || '|' || site_contact_phone
   from public.ops_parcel_detail((select id from ids where name = 'parcel'))),
  '12|heir_declaration|+905551230099', 'the private detail is stored with the parcel');
select is(
  (select role::text || '|' || full_name from public.ops_parcel_access((select id from ids where name = 'parcel'))),
  'owner|Yeni Sahip Düzeltildi', 'the owner gets access, listed with the profile name');
select is(
  (select (public.add_owner_declared_boundary((select id from ids where name = 'parcel'), pg_temp.ring())).version),
  2, 'a new drawing is the next boundary version');
select is(
  pg_temp.error_of($$ select public.add_owner_declared_boundary((select id from ids where name = 'parcel'),
    '[[37.400, 37.020], [37.401, 37.021], [37.401, 37.020], [37.400, 37.021]]') $$),
  'boundary_invalid / self-intersecting or empty', 'a self-intersecting ring is rejected');
select is(
  pg_temp.error_of($$ select public.register_parcel('b0000000-0000-4000-8000-000000000001',
    '{"name": " "}') $$),
  'invalid_input / name', 'a parcel needs a name');
select is(
  pg_temp.error_of($$ select public.ops_save_parcel_detail((select id from ids where name = 'parcel'),
    p_site_contact_phone => 'call me') $$),
  'invalid_input / site_contact_phone', 'a malformed site contact phone is rejected by field name');

-- Ops: visit planning and parcel life cycle ------------------------------------------

select is(
  pg_temp.error_of($$ insert into public.session (org_id, parcel_id, kind, planned_date, lead_user_id)
    values ('b0000000-0000-4000-8000-000000000001', (select id from ids where name = 'parcel'), 'inventory',
            '2026-11-02', 'a0000000-0000-4000-8000-000000000004') $$),
  'lead_not_field_staff', 'the lead must be field staff');
select is(
  pg_temp.error_of($$ insert into public.session (org_id, parcel_id, kind)
    values ('b0000000-0000-4000-8000-000000000001', (select id from ids where name = 'parcel'), 'inventory') $$),
  'planned_date_required', 'a planned visit needs a day');

insert into public.session (id, org_id, parcel_id, kind, planned_date, lead_user_id, notes)
values ('ad000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
        (select id from ids where name = 'parcel'), 'inventory', '2026-11-02',
        'a0000000-0000-4000-8000-000000000003', 'Sahip sınırı gösterecek');
select is((select status::text from public.parcel where id = (select id from ids where name = 'parcel')),
  'inventory_planned', 'planning the first inventory visit: registered -> inventory_planned');

update public.session set planned_date = '2026-11-03' where id = 'ad000000-0000-4000-8000-000000000011';
select is((select planned_date from public.session where id = 'ad000000-0000-4000-8000-000000000011'),
  '2026-11-03'::date, 'ops moves a planned visit');

update public.session set status = 'cancelled' where id = 'ad000000-0000-4000-8000-000000000011';
select is((select status::text from public.parcel where id = (select id from ids where name = 'parcel')),
  'registered', 'cancelling the only inventory visit: back to registered');
select is(
  pg_temp.error_of($$ update public.session set planned_date = '2026-11-04'
    where id = 'ad000000-0000-4000-8000-000000000011' $$),
  'visit_cancelled', 'a cancelled visit is final');

insert into public.session (id, org_id, parcel_id, kind, planned_date, lead_user_id)
values ('ad000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001',
        (select id from ids where name = 'parcel'), 'periodic_scan', '2026-12-15',
        'a0000000-0000-4000-8000-000000000003');
select is((select status::text from public.parcel where id = (select id from ids where name = 'parcel')),
  'registered', 'a scan visit does not change the life cycle');

-- Field staff ------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(
  pg_temp.error_of($$ update public.session set planned_date = '2026-12-16'
    where id = 'ad000000-0000-4000-8000-000000000012' $$),
  'forbidden', 'field staff cannot move a visit');
select is(
  pg_temp.error_of($$ update public.session set status = 'cancelled'
    where id = 'ad000000-0000-4000-8000-000000000012' $$),
  'forbidden', 'field staff cannot cancel a visit');
select throws_ok(
  $$ insert into public.session (org_id, parcel_id, kind, planned_date)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'periodic_scan', '2026-12-20') $$,
  '42501', null, 'field staff cannot plan a visit');
select lives_ok(
  $$ insert into public.session (org_id, parcel_id, kind, status, started_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'manual_entry',
             'captured', now()) $$,
  'field staff still records other session kinds');
select lives_ok(
  $$ update public.session set status = 'captured', started_at = '2026-12-15 07:00:00+00'
     where id = 'ad000000-0000-4000-8000-000000000012' $$,
  'field staff marks the visit captured');
select is((select count(*) from public.ops_parcel_detail('c0000000-0000-4000-8000-000000000001')), 0::bigint,
  'field staff does not read private parcel details');

-- Ops after capture --------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  pg_temp.error_of($$ update public.session set lead_user_id = null
    where id = 'ad000000-0000-4000-8000-000000000012' $$),
  'visit_not_planned', 'a captured visit cannot be changed');
select is(
  pg_temp.error_of($$ update public.session set status = 'cancelled'
    where id = 'ad000000-0000-4000-8000-000000000012' $$),
  'visit_not_planned', 'a captured visit cannot be cancelled');

-- Expert ----------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(
  pg_temp.error_of($$ select public.register_parcel('b0000000-0000-4000-8000-000000000001', '{"name": "x"}') $$),
  'forbidden', 'the expert cannot register a parcel');
select throws_ok(
  $$ insert into public.session (org_id, parcel_id, kind, planned_date)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'verification', '2026-12-20') $$,
  '42501', null, 'the expert cannot plan a visit');
select is((select count(*) from public.ops_owner_profiles()), 0::bigint, 'the expert reads no owner profiles');

-- Owner --------------------------------------------------------------------------------

select pg_temp.as_user('ad000000-0000-4000-8000-000000000001');
select is((select array_agg(name) from public.parcel), array['Kayıt Bahçesi (test)'],
  'the new owner sees only their parcel');
select is((select full_name from public.my_owner_profile()), 'Yeni Sahip Düzeltildi',
  'the owner reads their own profile');
select is((select count(*) from public.ops_owner_profiles()), 0::bigint, 'the owner reads no profiles through ops_*');
select is((select count(*) from public.ops_parcel_detail((select id from ids where name = 'parcel'))), 0::bigint,
  'the owner does not read the private detail of their parcel');
select is((select count(*) from public.ops_parcel_access((select id from ids where name = 'parcel'))), 0::bigint,
  'the owner does not list access through ops_*');
select is(
  pg_temp.error_of($$ select public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'owner@example.com') $$),
  'forbidden', 'the owner cannot look up accounts');
select is(
  pg_temp.error_of($$ select public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000001', 'X', 'sms', false) $$),
  'forbidden', 'the owner cannot register profiles');
select is(
  pg_temp.error_of($$ select public.add_owner_declared_boundary((select id from ids where name = 'parcel'), pg_temp.ring()) $$),
  'forbidden', 'the owner cannot draw a boundary version');

reset role;

select * from finish();
rollback;
