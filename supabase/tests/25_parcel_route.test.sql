-- Grid route versions (20261023160000_parcel_route): field staff stores the route a
-- visit used, a resend changes nothing, a different route is the next version, and
-- the table cannot be written directly or changed.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, lead_user_id)
values ('e2500000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2026-12-10',
        'a0000000-0000-4000-8000-000000000003'),
       ('e2500000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'cancelled', '2026-12-11',
        'a0000000-0000-4000-8000-000000000003');
insert into public.org (id, name) values ('f1000000-0000-4000-8000-000000000025', 'Route test org');
insert into public.parcel (id, org_id, name)
values ('f2000000-0000-4000-8000-000000000025', 'f1000000-0000-4000-8000-000000000025', 'Route test parcel');

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

create function pg_temp.route(p_basis text) returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'format', 1, 'generator', 'grid-route-v1', 'basis', p_basis, 'azimuth_deg', 0,
    'azimuth_source', 'slots', 'row_spacing_m', 8, 'tree_spacing_m', 7, 'start_corner', 'sw',
    'corridors', jsonb_build_array(jsonb_build_object(
      'no', 1, 'kind', 'along', 'label', 'S1 ile S2 arası',
      'points', jsonb_build_array(jsonb_build_array(37.3833, 37.0662), jsonb_build_array(37.3833, 37.0676)),
      'length_m', 154.0)))
$$;

create function pg_temp.save(p_id text, p_basis text, p_hash text,
                             p_session text default 'e2500000-0000-4000-8000-000000000001',
                             p_parcel text default 'c0000000-0000-4000-8000-000000000001')
returns jsonb language sql
as $$ select public.save_parcel_route(p_id::uuid, p_parcel::uuid, p_session::uuid,
                                      pg_temp.route(p_basis), p_hash) $$;

select has_table('public', 'parcel_route', 'parcel_route exists');
select has_function('public', 'save_parcel_route', array['uuid', 'uuid', 'uuid', 'jsonb', 'text'],
                    'save_parcel_route exists');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');

select is(
  pg_temp.save('e2510000-0000-4000-8000-000000000001', 'boundary', repeat('a', 64)),
  '{"id": "e2510000-0000-4000-8000-000000000001", "version": 1, "created": true}'::jsonb,
  'field staff stores the first route of a parcel as version 1');
select is(
  pg_temp.save('e2510000-0000-4000-8000-000000000001', 'boundary', repeat('a', 64)),
  '{"id": "e2510000-0000-4000-8000-000000000001", "version": 1, "created": false}'::jsonb,
  'a resend returns the stored version');
select is(
  (pg_temp.save('e2510000-0000-4000-8000-000000000003', 'boundary', repeat('a', 64)) ->> 'version')::int,
  1,
  'the same content under another id is the same route');
select is(
  pg_temp.save('e2510000-0000-4000-8000-000000000002', 'inventory', repeat('b', 64)),
  '{"id": "e2510000-0000-4000-8000-000000000002", "version": 2, "created": true}'::jsonb,
  'a different route becomes the next version');
select is(
  (select count(*)::int from public.parcel_route where parcel_id = 'c0000000-0000-4000-8000-000000000001'),
  2,
  'two versions, no duplicates');
select is(
  (select route -> 'corridors' -> 0 ->> 'label' from public.parcel_route where version = 2
     and parcel_id = 'c0000000-0000-4000-8000-000000000001'),
  'S1 ile S2 arası',
  'the route is stored as sent');
select is(
  (select row(org_id, generator, basis, session_id, created_by)::text from public.parcel_route
   where id = 'e2510000-0000-4000-8000-000000000002'),
  row('b0000000-0000-4000-8000-000000000001'::uuid, 'grid-route-v1', 'inventory',
      'e2500000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000003'::uuid)::text,
  'org, generator, basis, visit and author are filled in');

select throws_ok(
  $$ select pg_temp.save('e2510000-0000-4000-8000-000000000004', 'boundary', repeat('c', 64),
                         'e2500000-0000-4000-8000-000000000002') $$,
  '22023', 'session_invalid', 'a cancelled visit cannot store a route');
select throws_ok(
  $$ select pg_temp.save('e2510000-0000-4000-8000-000000000004', 'sideways', repeat('c', 64)) $$,
  '22023', 'invalid_input', 'unknown basis is refused');
select throws_ok(
  $$ select pg_temp.save('e2510000-0000-4000-8000-000000000004', 'boundary', 'not-a-hash') $$,
  '22023', 'invalid_input', 'a malformed hash is refused');
select throws_ok(
  $$ select pg_temp.save('e2510000-0000-4000-8000-000000000004', 'boundary', repeat('c', 64), null,
                         'f2000000-0000-4000-8000-000000000025') $$,
  'P0002', 'not_found', 'a parcel of another org is not found');
select throws_ok(
  $$ insert into public.parcel_route (id, org_id, parcel_id, version, route, content_hash, generator, basis)
     values ('e2510000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001',
             'c0000000-0000-4000-8000-000000000001', 9, pg_temp.route('boundary'), repeat('d', 64),
             'grid-route-v1', 'boundary') $$,
  '42501', null, 'no direct insert: only through save_parcel_route');
select throws_ok(
  $$ update public.parcel_route set version = 5 where id = 'e2510000-0000-4000-8000-000000000001' $$,
  '42501', null, 'routes cannot be changed');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  (pg_temp.save('e2510000-0000-4000-8000-000000000006', 'inventory', repeat('e', 64), null) ->> 'version')::int,
  3,
  'ops can store a route too (without a visit)');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select pg_temp.save('e2510000-0000-4000-8000-000000000007', 'inventory', repeat('f', 64)) $$,
  '42501', 'forbidden', 'experts do not store routes');
select is(
  (select count(*)::int from public.parcel_route where parcel_id = 'c0000000-0000-4000-8000-000000000001'),
  3,
  'experts see the routes of their org');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty(
  $$ select id from public.parcel_route $$,
  'owners do not see routes');

reset role;
select throws_ok(
  $$ delete from public.parcel_route where id = 'e2510000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'not even the database owner deletes a route');

select * from finish();
rollback;
