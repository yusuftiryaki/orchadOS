-- Field survey boundary (20261023120000_field_survey_boundary): the pipeline
-- (ops) records the corners of a session as the next boundary version,
-- idempotently per session and vertex list; the owner approves it.
-- Seed: owner a0..01, field_staff a0..03, ops a0..05, org b0..01, parcel c0..01
-- (boundary versions 1 and 2).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, lead_user_id)
values ('e2100000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'inventory', 'captured', '2026-12-10',
        'a0000000-0000-4000-8000-000000000003'),
       ('e2100000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'inventory', 'cancelled', '2026-12-11',
        'a0000000-0000-4000-8000-000000000003');

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

create function pg_temp.add(p_session text, p_ring jsonb, p_unc real default 0.05) returns jsonb language sql
as $$ select public.add_field_survey_boundary(p_session::uuid, p_ring, p_unc, '2026-12-10 07:10:00+00') $$;

-- About 30 x 40 m, walking order, open ring.
create temp table ring as select
  '[[37.3800, 37.0600], [37.3800, 37.06036], [37.38034, 37.06036], [37.38034, 37.0600]]'::jsonb as r,
  '[[37.3800, 37.0600], [37.3800, 37.06036], [37.38034, 37.06037], [37.38034, 37.0600]]'::jsonb as moved,
  '[[37.3800, 37.0600], [37.38034, 37.06036], [37.3800, 37.06036], [37.38034, 37.0600]]'::jsonb as bowtie;
grant select on ring to authenticated;
create temp table result (k text, v jsonb);
grant select, insert on result to authenticated;

set local role authenticated;

-- Field staff and owners cannot add a survey boundary.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000001', (select r from ring)) $$,
  '42501', 'forbidden', 'field staff cannot add a survey boundary');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000001', (select r from ring)) $$,
  '42501', 'forbidden', 'owners cannot add a survey boundary');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-0000000000ff', (select r from ring)) $$,
  'P0002', 'not_found', 'unknown session');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000002', (select r from ring)) $$,
  'P0001', 'session_cancelled', 'cancelled session');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000001',
       '[[37.38, 37.06], [37.38, 37.0601]]') $$,
  '22023', 'boundary_invalid', 'two corners are not a polygon');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000001', (select bowtie from ring)) $$,
  '22023', 'boundary_invalid', 'self-intersecting ring');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000001', '[[37.06, 37.38, 1], [1, 2], [3, 4]]') $$,
  '22023', 'boundary_invalid', 'points are [lon, lat]');
select throws_ok(
  $$ select pg_temp.add('e2100000-0000-4000-8000-000000000001', (select r from ring), -1) $$,
  '22023', 'invalid_input', 'negative uncertainty');

insert into result
select 'first', pg_temp.add('e2100000-0000-4000-8000-000000000001', (select r from ring), 4.5);
select is((select (v ->> 'created')::boolean from result where k = 'first'), true, 'first call creates');
select is((select (v ->> 'version')::int from result where k = 'first'), 3,
          'next version after the seed versions 1 and 2');
select is(
  (select row(source::text, session_id::text, vertex_uncertainty_m, surveyed_at, owner_approved_at)
   from public.boundary where id = (select (v ->> 'id')::uuid from result where k = 'first')),
  row('field_survey'::text, 'e2100000-0000-4000-8000-000000000001'::text, 4.5::real,
      '2026-12-10 07:10:00+00'::timestamptz, null::timestamptz),
  'source, session, uncertainty, survey time; not approved');
select ok(
  (select abs((v ->> 'area_m2')::double precision - 1200) < 30 from result where k = 'first'),
  'area of a ~30 x 40 m ring');

insert into result
select 'again', pg_temp.add('e2100000-0000-4000-8000-000000000001', (select r from ring), 4.5);
select is((select v from result where k = 'again') - 'created',
          (select v from result where k = 'first') - 'created',
          'same corners again: the same version');
select is((select (v ->> 'created')::boolean from result where k = 'again'), false, 'nothing created');

insert into result
select 'moved', pg_temp.add('e2100000-0000-4000-8000-000000000001', (select moved from ring), 0.03);
select is((select (v ->> 'version')::int from result where k = 'moved'), 4,
          'moved corners (e.g. now PPK): a new version');
select is((select count(*)::int from public.boundary where parcel_id = 'c0000000-0000-4000-8000-000000000001'),
          4, 'four versions of the seed parcel');

-- The owner sees and approves it.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(
  (select max(version) from public.boundary where parcel_id = 'c0000000-0000-4000-8000-000000000001'),
  4, 'owner sees the new version');
select lives_ok(
  $$ select public.approve_boundary((select (v ->> 'id')::uuid from result where k = 'moved'), true) $$,
  'owner approves the survey boundary');

-- An approved version is still found as the same version on a re-run.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  (pg_temp.add('e2100000-0000-4000-8000-000000000001', (select moved from ring), 0.03) ->> 'version')::int,
  4, 're-run after approval: no new version');

select * from finish();
rollback;
