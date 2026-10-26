-- Coverage report of a scan (20261025120000_coverage_report): the pipeline (ops)
-- records the summary; ratio, result and "rescan needed" come from the counts;
-- the same run again adds nothing; owners see it once the visit is published.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.report(p_covered int, p_blind int default 0) returns jsonb language sql
as $$ select jsonb_build_object(
  'pipeline', 'orchados-pipeline', 'pipeline_version', '0.1.0', 'params_hash', 'abc',
  'active_trees', 20, 'covered_trees', p_covered, 'threshold', 0.95, 'blind_spots', p_blind,
  'missing_slot_codes', (select coalesce(jsonb_agg('S1-' || g), '[]') from generate_series(1, 20 - p_covered) g),
  'blind_spot_cells', '[]'::jsonb, 'rule', jsonb_build_object('min_directions', 2)) $$;

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, started_at) values
  ('e2800000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'captured', '2026-10-25', '2026-10-25 08:00+00');

select has_table('public', 'coverage_report', 'coverage_report exists');

set local role authenticated;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.record_coverage_report('e2800000-0000-4000-8000-000000000001', pg_temp.report(20)) $$,
  '42501', 'forbidden', 'the expert does not record coverage');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.record_coverage_report('e2800000-0000-4000-8000-000000000001', pg_temp.report(20)) $$,
  'P0002', 'not_found', 'the owner does not either');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  public.record_coverage_report('e2800000-0000-4000-8000-000000000001', pg_temp.report(19)) - 'report_id',
  '{"created": true, "passed": true, "rescan_needed": false}'::jsonb,
  'ops records it: 19 of 20 is 95%, passed');
select is(
  public.record_coverage_report('e2800000-0000-4000-8000-000000000001', pg_temp.report(19)) - 'report_id',
  '{"created": false, "passed": true, "rescan_needed": false}'::jsonb,
  'the same run again: nothing new');
select is((select count(*)::int from public.coverage_report
           where session_id = 'e2800000-0000-4000-8000-000000000001'), 1, 'one row');
select results_eq(
  $$ select ratio, passed, missing_trees, rescan_needed, missing_slot_codes from public.coverage_report
     where session_id = 'e2800000-0000-4000-8000-000000000001' $$,
  $$ values (0.95::double precision, true, 1, false, array['S1-1']) $$,
  'ratio, result and missing trees from the counts');

select is(
  public.record_coverage_report('e2800000-0000-4000-8000-000000000001', pg_temp.report(19, 1)) - 'report_id',
  '{"created": true, "passed": true, "rescan_needed": true}'::jsonb,
  'a blind spot: passed, but an extra visit is needed');
select is(
  public.record_coverage_report('e2800000-0000-4000-8000-000000000001', pg_temp.report(15)) - 'report_id',
  '{"created": true, "passed": false, "rescan_needed": true}'::jsonb,
  'reprocessed: a new report below the threshold');
select is((select count(*)::int from public.coverage_report
           where session_id = 'e2800000-0000-4000-8000-000000000001'), 3, 'old reports stay');

select throws_ok(
  $$ select public.record_coverage_report('e2800000-0000-4000-8000-000000000001',
       pg_temp.report(19) || '{"active_trees": 0}') $$,
  '22023', 'invalid_input', 'no trees: refused');
select throws_ok(
  $$ select public.record_coverage_report('e2800000-0000-4000-8000-000000000001',
       pg_temp.report(19) || '{"covered_trees": 21}') $$,
  '22023', 'invalid_input', 'more covered than active: refused');
select throws_ok(
  $$ select public.record_coverage_report('e2800000-0000-4000-8000-000000000001',
       pg_temp.report(19) - 'pipeline_version') $$,
  '22023', 'invalid_input', 'without a pipeline version: refused');
select throws_ok(
  $$ insert into public.coverage_report (org_id, parcel_id, session_id, pipeline, pipeline_version,
       params_hash, active_trees, covered_trees, threshold, blind_spots)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e2800000-0000-4000-8000-000000000001', 'x', 'x', 'x', 1, 1, 0.95, 0) $$,
  '42501', null, 'no direct inserts');

-- Owners: not before publication.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.coverage_report
           where session_id = 'e2800000-0000-4000-8000-000000000001'), 0, 'the owner does not see it before publication');
reset role;
update public.session set status = 'published' where id = 'e2800000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::int from public.coverage_report
           where session_id = 'e2800000-0000-4000-8000-000000000001'), 3, 'and does after it');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.coverage_report
           where session_id = 'e2800000-0000-4000-8000-000000000001'), 3, 'field staff see it');

select * from finish();
rollback;
