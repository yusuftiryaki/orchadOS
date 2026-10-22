-- Expert measurements are frozen once a session is published; staff ones are not.
-- Seed: field_staff a0..03, expert a0..04; parcel c0..01. Fixtures: published scan
-- session ac..01, processed scan session ac..02, a tree crop in ac..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
-- Inserts a dead-branch measurement and returns its id.
create function pg_temp.measure(p_session uuid, p_source public.measurement_source) returns uuid language sql
as $$
  insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale, uncertainty,
    method, method_version, source, session_id, measured_at)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'),
    md5('orchados-seed:metric:dead_branch_scale')::uuid, 1, 0.5, 'test', '1', p_source, p_session, now())
  returning id
$$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.session (id, org_id, parcel_id, kind, status, started_at) values
  ('ac000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-11-20 07:00:00+00'),
  ('ac000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-11-25 07:00:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version)
values ('ac000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'tree_crop',
        pg_temp.tree('S1-1'), 'storage://media/x', encode(sha256('lock-crop'::bytea), 'hex'), 'pipeline', '0.1.0');
-- A staff measurement of the published session, written by a trusted role.
create temp table staff_m on commit drop as
  select pg_temp.measure('ac000000-0000-4000-8000-000000000001', 'staff') as id;
grant select on staff_m to authenticated;

set local role authenticated;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select pg_temp.measure('ac000000-0000-4000-8000-000000000001', 'expert') $$,
  '42501', null, 'expert cannot add an expert measurement to a published session');
select lives_ok(
  $$ select pg_temp.measure('ac000000-0000-4000-8000-000000000002', 'expert') $$,
  'expert can still add expert measurements to an unpublished session');
select lives_ok(
  $$ insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
     select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', id,
            'ac000000-0000-4000-8000-000000000003' from staff_m $$,
  'evidence for a staff measurement of a published session can be added');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select pg_temp.measure('ac000000-0000-4000-8000-000000000001', 'staff') $$,
  'field staff can still add late staff measurements to a published session');

reset role;
-- An expert measurement in the published session, written by a trusted role.
create temp table expert_m on commit drop as
  select pg_temp.measure('ac000000-0000-4000-8000-000000000001', 'expert') as id;
grant select on expert_m to authenticated;
select pass('trusted roles may still write expert measurements of a published session');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
     select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', id,
            'ac000000-0000-4000-8000-000000000003' from expert_m $$,
  '42501', null, 'expert cannot add evidence to an expert measurement of a published session');

select * from finish();
rollback;
