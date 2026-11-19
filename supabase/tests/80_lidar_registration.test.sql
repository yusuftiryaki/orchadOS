-- LiDAR registration and its reader gate (20261118100000_lidar_registration;
-- spec docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md §5.8, §5.11):
-- ops records register runs (status recording), uploads their measurements and
-- world cloud, then activates them; ops decides pending ones once; parcel readers
-- (owner, shareholder, viewer, demo visitor) see LiDAR measurements and the
-- world cloud of a run only while it is the session's accepted run; org roles
-- see all; rows without a run keep today's visibility.
-- Seed: org b0..01, owner a0..01 and viewer a0..02 of parcel c0..01,
-- field_staff a0..03, expert a0..04, ops a0..05. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(88);

select testing.reset_to_seed();

-- Registration ids by run number, recorded as ops.
create temp table regs (n int primary key, id uuid not null);
create temp view reg_status as
  select g.n, r.status from pg_temp.regs g join public.lidar_registration r on r.id = g.id;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.run(p_n int) returns uuid language sql immutable
as $$ select ('80000000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid $$;
-- registration.json subset of run p_n.
create function pg_temp.payload(p_n int, p_verdict text, p_reasons text[] default '{}') returns jsonb language sql
as $$ select jsonb_build_object(
  'run_id', pg_temp.run(p_n), 'session_id', '80000000-0000-4000-8000-000000000010',
  'method', 'fake+gtsam_ppk', 'method_version', '0.1.0', 'params_hash', 'ph' || p_n, 'ppk_status', 'ppk',
  'metrics', jsonb_build_object('gnss_residual_p95_m', 0.05, 'lio_coverage', 0.97, 'trunk_spread_p95_m', 0.08,
                                'trees_checked', 14),
  'verdict', p_verdict, 'reasons', to_jsonb(p_reasons)) $$;
create function pg_temp.record(p_n int, p_verdict text) returns uuid language sql
as $$ select public.record_lidar_registration('80000000-0000-4000-8000-000000000010', pg_temp.payload(p_n, p_verdict)) $$;
create function pg_temp.reg(p_n int) returns uuid language sql
as $$ select id from pg_temp.regs where n = p_n $$;
-- Activates run p_n (after its uploads); returns its new status.
create function pg_temp.activate(p_n int) returns text language sql
as $$ select status from public.activate_lidar_registration(pg_temp.reg(p_n)) $$;
create function pg_temp.status(p_n int) returns text language sql
as $$ select status from pg_temp.reg_status where n = p_n $$;
-- One crown measurement of run p_n on S1-1 (tree_height p_value) and crown_diameter.
create function pg_temp.measure(p_n int, p_value double precision default 3.2) returns jsonb language sql
as $$ select public.record_lidar_measurements('80000000-0000-4000-8000-000000000010', jsonb_build_object(
  'registration_id', pg_temp.reg(p_n),
  'items', jsonb_build_array(
    jsonb_build_object('tree_id', pg_temp.tree('S1-1'), 'metric', 'tree_height', 'value_numeric', p_value,
                       'uncertainty', 0.05, 'method', 'lidar_crown', 'method_version', '0.1.0', 'params_hash', 'c'),
    jsonb_build_object('tree_id', pg_temp.tree('S1-1'), 'metric', 'crown_diameter', 'value_numeric', 2.9,
                       'uncertainty', 0.1, 'method', 'lidar_crown', 'method_version', '0.1.0', 'params_hash', 'c')))) $$;
-- Tree heights of S1-1 the caller reads in the registered session.
create function pg_temp.heights() returns float8[] language sql
as $$ select coalesce(array_agg(m.value_numeric order by m.value_numeric), '{}')
      from public.measurement m
      where m.session_id = '80000000-0000-4000-8000-000000000010'
        and m.metric_definition_id = md5('orchados-seed:metric:tree_height')::uuid $$;
-- World clouds (asset ids' last two digits) the caller reads in the parcel.
create function pg_temp.clouds() returns text[] language sql
as $$ select coalesce(array_agg(right(id::text, 2) order by id), '{}') from public.asset
      where kind = 'world_cloud' and id::text like '80000000-%' $$;
create function pg_temp.signable(p_n text) returns boolean language sql
as $$
  select authz.parcel_reader_media_object('b0000000-0000-4000-8000-000000000001',
                                          'c0000000-0000-4000-8000-000000000001',
                                          encode(sha256(('w80-' || p_n)::bytea), 'hex'))
$$;
create function pg_temp.cloud(p_id text, p_session text, p_registration text) returns void language sql
as $$
  insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, mime_type, pipeline,
                            pipeline_version, position, position_uncertainty_m, pose)
  values (('80000000-0000-4000-8000-0000000002' || p_id)::uuid, 'b0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-000000000001', p_session::uuid, 'world_cloud', 'storage://media/w80-' || p_id,
          encode(sha256(('w80-' || p_id)::bytea), 'hex'), 'application/vnd.orchados.world-cloud',
          'orchados-pipeline', '0.1.0', 'SRID=4326;POINT(37.38 37.07)', 0.1,
          jsonb_strip_nulls(jsonb_build_object('schema', 'orchados.world_cloud/1', 'point_count', 1000,
                                               'crs', 'local_enu', 'registration_id', p_registration)));
$$;

grant all on pg_temp.regs, pg_temp.reg_status to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixtures (as postgres) -----------------------------------------------------------------

-- The registered visit (published) and an older visit with unregistered rows.
insert into public.session (id, org_id, parcel_id, kind, status, started_at) values
  ('80000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-11-10 07:00:00+00'),
  ('80000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-10-10 07:00:00+00');
-- Legacy (unregistered) LiDAR measurement and world cloud.
insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, uncertainty,
                                method, method_version, params_hash, source, session_id, measured_at)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'),
        md5('orchados-seed:metric:tree_height')::uuid, 2.5, 0.05, 'lidar_crown', '0.1.0', 'c', 'algorithm',
        '80000000-0000-4000-8000-000000000011', '2026-10-10 07:00:00+00');
select pg_temp.cloud('00', '80000000-0000-4000-8000-000000000011', null);

-- A shareholder: a second owner of the parcel.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '80000000-0000-4000-8000-0000000000a1',
        'authenticated', 'authenticated', 'shareholder-80@example.test', now(), now());
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '80000000-0000-4000-8000-0000000000a1', 'owner');

-- Demo org: a published visit with a pending run, its measurement and world cloud.
insert into public.org (id, name, kind) values ('80000000-0000-4000-8000-0000000000d0', 'pgTAP demo 80', 'other');
insert into public.parcel (id, org_id, name)
values ('80000000-0000-4000-8000-0000000000d1', '80000000-0000-4000-8000-0000000000d0', 'Demo 80');
insert into private.demo_org (org_id, enabled, loaded_at) values ('80000000-0000-4000-8000-0000000000d0', false, now());
insert into private.demo_parcel (parcel_id, org_id)
values ('80000000-0000-4000-8000-0000000000d1', '80000000-0000-4000-8000-0000000000d0');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_change, phone_change,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '80000000-0000-4000-8000-0000000000d9', 'authenticated',
        'authenticated', 'ziyaretci-80@demo.orchados.invalid', '', '', '', '{"demo": true}',
        '{"email_verified": true}', now(), now());
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('80000000-0000-4000-8000-0000000000d0', '80000000-0000-4000-8000-0000000000d1',
        '80000000-0000-4000-8000-0000000000d9', 'owner');
insert into public.slot (id, org_id, parcel_id, row_no, position_no)
values ('80000000-0000-4000-8000-0000000000d2', '80000000-0000-4000-8000-0000000000d0',
        '80000000-0000-4000-8000-0000000000d1', 1, 1);
insert into public.tree (id, org_id, parcel_id, slot_id)
values ('80000000-0000-4000-8000-0000000000d3', '80000000-0000-4000-8000-0000000000d0',
        '80000000-0000-4000-8000-0000000000d1', '80000000-0000-4000-8000-0000000000d2');
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('80000000-0000-4000-8000-0000000000d4', '80000000-0000-4000-8000-0000000000d0',
        '80000000-0000-4000-8000-0000000000d1', 'periodic_scan', 'published', '2026-11-10 07:00:00+00');
insert into public.lidar_registration (id, run_id, org_id, parcel_id, session_id, method, method_version,
                                       params_hash, ppk_status, auto_verdict, reasons, status)
values ('80000000-0000-4000-8000-0000000000d5', '80000000-0000-4000-8000-0000000000d6',
        '80000000-0000-4000-8000-0000000000d0', '80000000-0000-4000-8000-0000000000d1',
        '80000000-0000-4000-8000-0000000000d4', 'fake+gtsam_ppk', '0.1.0', 'ph', 'ppk', 'review', '{}', 'pending_review');
insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, uncertainty,
                                method, method_version, params_hash, source, session_id, measured_at, registration_id)
values ('80000000-0000-4000-8000-0000000000d0', '80000000-0000-4000-8000-0000000000d1',
        '80000000-0000-4000-8000-0000000000d3', md5('orchados-seed:metric:tree_height')::uuid, 4.1, 0.05,
        'lidar_crown', '0.1.0', 'c', 'algorithm', '80000000-0000-4000-8000-0000000000d4', '2026-11-10 07:00:00+00',
        '80000000-0000-4000-8000-0000000000d5');
insert into public.asset (org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version, pose)
values ('80000000-0000-4000-8000-0000000000d0', '80000000-0000-4000-8000-0000000000d1',
        '80000000-0000-4000-8000-0000000000d4', 'world_cloud', 'storage://media/w80-demo',
        encode(sha256('w80-demo'::bytea), 'hex'), 'orchados-pipeline', '0.1.0',
        '{"schema": "orchados.world_cloud/1", "registration_id": "80000000-0000-4000-8000-0000000000d5"}');

select has_trigger('public', 'lidar_registration', 'zz_demo_read_only', 'demo write guard attached');

set local role authenticated;

-- Who may record ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok($$ select pg_temp.record(1, 'review') $$, '42501', 'forbidden', 'the expert does not record runs');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok($$ select pg_temp.record(1, 'review') $$, 'P0002', 'not_found', 'the owner does not either');
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ select pg_temp.record(1, 'review') $$, '42501', 'demo_read_only',
  'a request with the demo claim is refused, even for an ops account');

-- Recording -----------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into pg_temp.regs select 1, pg_temp.record(1, 'review');
select results_eq(
  $$ select r.run_id, r.status, r.auto_verdict, r.ppk_status, r.method, r.metrics ->> 'trees_checked',
            r.decided_by, r.decided_at, r.recorded_by, r.org_id, r.parcel_id
     from public.lidar_registration r where r.id = pg_temp.reg(1) $$,
  $$ values (pg_temp.run(1), 'recording', 'review', 'ppk', 'fake+gtsam_ppk', '14', null::uuid,
             null::timestamptz, 'a0000000-0000-4000-8000-000000000005'::uuid,
             'b0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) $$,
  'ops records a run as recording: not yet in review until it is activated');
select is_empty($$ select id from public.lidar_registration where status = 'pending_review' $$,
  'ops: a recording run is not waiting for review');
select is(pg_temp.record(1, 'review'), pg_temp.reg(1), 'the same run again returns the same row');
select is((select count(*)::int from public.lidar_registration where run_id = pg_temp.run(1)), 1, 'and adds none');
select throws_ok($$ select pg_temp.record(1, 'accepted_auto') $$, '22023', 'invalid_input',
  'the same run_id with another verdict is refused');
select throws_ok(
  $$ select public.record_lidar_registration('80000000-0000-4000-8000-000000000011', pg_temp.payload(9, 'review')) $$,
  '22023', 'invalid_input', 'a payload naming another session is refused');
select throws_ok(
  $$ select public.record_lidar_registration('80000000-0000-4000-8000-000000000010',
       pg_temp.payload(9, 'review') || '{"ppk_status": "rtk"}') $$,
  '22023', 'invalid_input', 'an unknown ppk_status is refused');
select throws_ok(
  $$ select public.record_lidar_registration('80000000-0000-4000-8000-000000000010',
       pg_temp.payload(9, 'maybe')) $$,
  '22023', 'invalid_input', 'an unknown verdict is refused');

-- Measurements and the world cloud of the pending run.
select is(pg_temp.measure(1), '{"created": 2, "existing": 0, "skipped": []}'::jsonb,
  'measurements of a recording run are recorded (uploads come before activation)');
select is(pg_temp.measure(1), '{"created": 0, "existing": 2, "skipped": []}'::jsonb, 'idempotent per run');
select throws_ok(
  $$ select public.record_lidar_measurements('80000000-0000-4000-8000-000000000011', jsonb_build_object(
       'registration_id', pg_temp.reg(1), 'items', '[]'::jsonb)) $$,
  '22023', 'invalid_input', 'a run of another session is refused');
select throws_ok(
  $$ select public.record_lidar_measurements('80000000-0000-4000-8000-000000000010', jsonb_build_object(
       'registration_id', 'nope', 'items', '[]'::jsonb)) $$,
  '22023', 'invalid_input', 'a registration_id that is not a uuid is refused');
select lives_ok($$ select pg_temp.cloud('01', '80000000-0000-4000-8000-000000000010', upper(pg_temp.reg(1)::text)) $$,
  'ops uploads the world cloud of the recording run');
select is((select pose ->> 'registration_id' from public.asset where id = '80000000-0000-4000-8000-000000000201'),
  pg_temp.reg(1)::text, 'its pose.registration_id is stored in canonical form');
select throws_ok($$ select pg_temp.cloud('02', '80000000-0000-4000-8000-000000000011', pg_temp.reg(1)::text) $$,
  '22023', 'invalid_input', 'a world cloud cannot name a run of another session');
select throws_ok($$ select pg_temp.cloud('02', '80000000-0000-4000-8000-000000000010', 'x') $$,
  '22023', 'invalid_input', 'nor a registration_id that is not a uuid');

-- Gate while recording ----------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.heights(), '{}'::float8[], 'owner: no measurement of the recording run');
select is(pg_temp.clouds(), array['00'], 'owner: no world cloud of the recording run');
select ok(not pg_temp.signable('01'), 'owner: the recording run''s world cloud file is not signed');

-- Activating ---------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok($$ select pg_temp.activate(1) $$, '42501', 'forbidden', 'the expert does not activate runs');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok($$ select pg_temp.activate(1) $$, 'P0002', 'not_found', 'the owner does not either');
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ select pg_temp.activate(1) $$, '42501', 'demo_read_only',
  'nor a request with the demo claim');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ select public.activate_lidar_registration('80000000-0000-4000-8000-0000000009ff') $$,
  'P0002', 'not_found', 'an unknown run is not found');
select results_eq(
  $$ select status, decided_at from public.activate_lidar_registration(pg_temp.reg(1)) $$,
  $$ values ('pending_review', null::timestamptz) $$,
  'activating a review run puts it in review');
select is(pg_temp.activate(1), 'pending_review', 'activating it again changes nothing');
select is((select count(*)::int from public.lidar_registration where status = 'pending_review'), 1,
  'ops: the activated run is waiting for review');

-- Gate while pending ------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.heights(), '{}'::float8[], 'owner: no measurement of the pending run');
select is(pg_temp.clouds(), array['00'], 'owner: only the unregistered world cloud, not the pending one');
select ok(not pg_temp.signable('01'), 'owner: the pending world cloud file is not signed');
select ok(pg_temp.signable('00'), 'owner: the unregistered one still is');
select is((select array_agg(value_numeric) from public.tree_latest_measurement
           where tree_id = pg_temp.tree('S1-1') and metric_definition_id = md5('orchados-seed:metric:tree_height')::uuid),
  array[2.5::float8], 'owner: the latest-measurement view falls back to the unregistered visit');
select is_empty($$ select id from public.lidar_registration $$, 'owner: reads no registration row');
select pg_temp.as_user('80000000-0000-4000-8000-0000000000a1');
select is(pg_temp.heights(), '{}'::float8[], 'shareholder: no measurement of the pending run');
select is(pg_temp.clouds(), array['00'], 'shareholder: no pending world cloud');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.heights(), '{}'::float8[], 'viewer: no measurement of the pending run');
select is(pg_temp.clouds(), array['00'], 'viewer: no pending world cloud');
select pg_temp.as_demo('80000000-0000-4000-8000-0000000000d9');
select is_empty($$ select id from public.measurement where registration_id is not null $$,
  'demo visitor: no measurement of a pending run');
select is_empty($$ select id from public.asset where kind = 'world_cloud' $$,
  'demo visitor: no world cloud of a pending run');
select is_empty($$ select id from public.lidar_registration $$, 'demo visitor: reads no registration row');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.heights(), array[3.2::float8], 'expert: reads the pending run''s measurement');
select is(pg_temp.clouds(), array['00', '01'], 'expert: and its world cloud');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.lidar_registration where id = pg_temp.reg(1)), 1,
  'field staff read the registration row');

-- Deciding ---------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok($$ select public.decide_lidar_registration(pg_temp.reg(1), true, null) $$,
  '42501', 'forbidden', 'the expert does not decide');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.decide_lidar_registration(pg_temp.reg(1), true, null) $$,
  'P0002', 'not_found', 'the owner does not either');
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ select public.decide_lidar_registration(pg_temp.reg(1), true, null) $$,
  '42501', 'demo_read_only', 'nor a request with the demo claim');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ select public.decide_lidar_registration(pg_temp.reg(1), false, '  ') $$,
  '22023', 'invalid_input', 'a rejection needs a note');
select throws_ok($$ update public.lidar_registration set status = 'accepted' where id = pg_temp.reg(1) $$,
  '42501', null, 'ops cannot change the row directly');
select results_eq(
  $$ select status, decided_by, decided_at is not null, decision_note
     from public.decide_lidar_registration(pg_temp.reg(1), true, ' looks good ') $$,
  $$ values ('accepted', 'a0000000-0000-4000-8000-000000000005'::uuid, true, 'looks good') $$,
  'ops accepts the pending run');
select throws_ok($$ select public.decide_lidar_registration(pg_temp.reg(1), false, 'changed my mind') $$,
  '55000', 'not_pending', 'a second decision fails');

-- accept_reveals_measurements ---------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.heights(), array[3.2::float8], 'owner: the accepted run''s measurement is visible without re-upload');
select is(pg_temp.clouds(), array['00', '01'], 'owner: and its world cloud');
select ok(pg_temp.signable('01'), 'owner: whose file is signed');
select is((select array_agg(value_numeric) from public.tree_latest_measurement
           where tree_id = pg_temp.tree('S1-1') and metric_definition_id = md5('orchados-seed:metric:tree_height')::uuid),
  array[3.2::float8], 'owner: the latest-measurement view shows the accepted run');
select pg_temp.as_user('80000000-0000-4000-8000-0000000000a1');
select is(pg_temp.heights(), array[3.2::float8], 'shareholder: visible too');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.clouds(), array['00', '01'], 'viewer: visible too');

-- accept_supersedes_previous ------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into pg_temp.regs select 2, pg_temp.record(2, 'accepted_auto');
select results_eq($$ select pg_temp.status(1), pg_temp.status(2) $$, $$ values ('accepted', 'recording') $$,
  'an auto-accepted run being recorded supersedes nothing yet');
select is(pg_temp.measure(2, 3.4), '{"created": 2, "existing": 0, "skipped": []}'::jsonb,
  'the same items of a new run are added next to the old ones');
-- The upload of the world cloud fails: the run is never activated.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.heights(), array[3.2::float8],
  'owner: a run recorded but never activated (failed upload) leaves the accepted run''s values visible');
select is(pg_temp.clouds(), array['00', '01'], 'owner: and its world cloud');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.activate(2), 'accepted', 'activating an auto-accepted run accepts it');
select results_eq($$ select pg_temp.status(1), pg_temp.status(2) $$, $$ values ('superseded', 'accepted') $$,
  'and supersedes the session''s accepted run');
select is((select (decided_by, decided_at, decision_note) is null
           from public.lidar_registration where id = pg_temp.reg(2)), true,
  'an automatic verdict carries no decision');
select is(pg_temp.activate(2), 'accepted', 'activating it again changes nothing');
select results_eq($$ select pg_temp.status(1), pg_temp.status(2) $$, $$ values ('superseded', 'accepted') $$,
  'and leaves the earlier run superseded');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.heights(), array[3.4::float8], 'owner: only the current accepted run''s measurement');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.heights(), array[3.2::float8, 3.4::float8], 'expert: both runs');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into pg_temp.regs select 3, pg_temp.record(3, 'review');
select is(pg_temp.activate(3), 'pending_review', 'another review run is activated');
select lives_ok($$ select public.decide_lidar_registration(pg_temp.reg(3), true, null) $$,
  'ops accepts another pending run');
select results_eq($$ select pg_temp.status(1), pg_temp.status(2), pg_temp.status(3) $$,
  $$ values ('superseded', 'superseded', 'accepted') $$, 'it supersedes the auto-accepted one');
select is((select decided_at from public.lidar_registration where id = pg_temp.reg(1)) is not null, true,
  'a superseded run keeps its decision');

-- reject_keeps_hidden -------------------------------------------------------------------------

insert into pg_temp.regs select 4, pg_temp.record(4, 'review');
select is(pg_temp.measure(4, 3.6), '{"created": 2, "existing": 0, "skipped": []}'::jsonb,
  'measurements uploaded before the decision');
select is(pg_temp.activate(4), 'pending_review', 'the run is activated into review');
select results_eq(
  $$ select status, decision_note from public.decide_lidar_registration(pg_temp.reg(4), false, 'double trunks in row 3') $$,
  $$ values ('rejected', 'double trunks in row 3') $$, 'ops rejects with a note');
select throws_ok($$ select pg_temp.measure(4) $$, '22023', 'registration_rejected',
  'a rejected run takes no more measurements');
select throws_ok($$ select pg_temp.cloud('04', '80000000-0000-4000-8000-000000000010', pg_temp.reg(4)::text) $$,
  '22023', 'registration_rejected', 'nor a world cloud');
insert into pg_temp.regs select 5, pg_temp.record(5, 'rejected_auto');
select is(pg_temp.activate(5), 'rejected', 'activating an auto-rejected run rejects it');
select results_eq($$ select pg_temp.status(3), pg_temp.status(5) $$, $$ values ('accepted', 'rejected') $$,
  'and leaves the accepted run alone');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.heights(), '{}'::float8[], 'owner: the rejected run stays hidden (the accepted one has none)');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into pg_temp.regs select 15, pg_temp.record(15, 'review');

-- Rows are never deleted; terminal states stay -------------------------------------------------

reset role;
select throws_ok($$ delete from public.lidar_registration where id = pg_temp.reg(1) $$,
  '42501', null, 'a registration row is not deleted');
select throws_ok($$ update public.lidar_registration set status = 'accepted' where id = pg_temp.reg(1) $$,
  '42501', null, 'a superseded run does not come back');
select throws_ok($$ update public.lidar_registration set metrics = '{}' where id = pg_temp.reg(3) $$,
  '42501', null, 'only the decision changes');
select throws_ok($$ update public.lidar_registration set status = 'accepted' where id = pg_temp.reg(15) $$,
  '42501', null, 'a recording run leaves only for the status its verdict gives');

-- The demo visitor sees the demo run once it is accepted (the hiding above was the gate).
update public.lidar_registration set status = 'accepted', decided_at = now()
where id = '80000000-0000-4000-8000-0000000000d5';
set local role authenticated;
select pg_temp.as_demo('80000000-0000-4000-8000-0000000000d9');
select isnt_empty($$ select id from public.measurement where registration_id is not null $$,
  'demo visitor: the accepted run''s measurement is visible');
select isnt_empty($$ select id from public.asset where kind = 'world_cloud' $$,
  'demo visitor: and its world cloud');

select * from finish();
rollback;
