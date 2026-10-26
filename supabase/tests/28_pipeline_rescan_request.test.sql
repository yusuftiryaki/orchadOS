-- Rescan request from the pipeline (20261025120100_pipeline_rescan_request): a
-- coverage report below its threshold or with a blind spot opens one extra
-- visit request (origin pipeline) listing the missing trees; processing again
-- opens no second one; ops plans it as any request; a passing newer report
-- cancels an open one.
-- Seed: owner a0..01, field_staff a0..03, expert a0..04, ops a0..05; org b0..01,
-- parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.report(p_covered int, p_blind int default 0, p_hash text default 'abc') returns jsonb language sql
as $$ select jsonb_build_object(
  'pipeline', 'orchados-pipeline', 'pipeline_version', '0.1.0', 'params_hash', p_hash,
  'active_trees', 20, 'covered_trees', p_covered, 'threshold', 0.95, 'blind_spots', p_blind,
  'missing_slot_codes', (select coalesce(jsonb_agg('S1-' || g), '[]') from generate_series(1, 20 - p_covered) g),
  'blind_spot_cells', case when p_blind > 0 then
    '[{"cell": [3, 4], "trees": 4, "uncovered": 3, "slot_codes": ["S1-1", "S1-2", "S1-3"]}]'::jsonb
    else '[]'::jsonb end,
  'rule', '{}'::jsonb) $$;
create function pg_temp.requests(p_session text) returns int language sql
as $$ select count(*)::int from public.followup_request where source_session_id = p_session::uuid $$;

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, started_at) values
  ('e2810000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-10-25', '2026-10-25 08:00+00'),
  ('e2810000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-10-26', '2026-10-26 08:00+00'),
  ('e2810000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2026-11-02', null);

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

-- Passing report: no request.
select public.record_coverage_report('e2810000-0000-4000-8000-000000000002', pg_temp.report(20));
select is(pg_temp.requests('e2810000-0000-4000-8000-000000000002'), 0, 'passed, no blind spot: no request');

-- Below the threshold: one extra visit request from the pipeline.
select public.record_coverage_report('e2810000-0000-4000-8000-000000000001', pg_temp.report(15, 1));
select results_eq(
  $$ select kind::text, origin::text, status::text, tree_id is null,
            coverage_report_id = (select id from public.coverage_report
                                  where session_id = 'e2810000-0000-4000-8000-000000000001')
     from public.followup_request where source_session_id = 'e2810000-0000-4000-8000-000000000001' $$,
  $$ values ('extra_visit', 'pipeline', 'open', true, true) $$,
  'an open extra visit request of the pipeline, bound to the report');
select matches(
  (select note from public.followup_request where source_session_id = 'e2810000-0000-4000-8000-000000000001'),
  '^İşleme hattı: kapsama %75,0 \(eşik %95,0\), 15/20 ağaç',
  'the note gives the ratio and the threshold');
select matches(
  (select note from public.followup_request where source_session_id = 'e2810000-0000-4000-8000-000000000001'),
  'Eksik ağaçlar \(5\): S1-1, S1-2, S1-3, S1-4, S1-5',
  'and lists the missing trees');
select matches(
  (select note from public.followup_request where source_session_id = 'e2810000-0000-4000-8000-000000000001'),
  'Kör nokta hücreleri \(1\): \(3,4\): S1-1, S1-2, S1-3',
  'and the blind spot cells');
select is(public.pipeline_rescan_request('e2810000-0000-4000-8000-000000000001') ->> 'status', 'open',
  'pipeline_rescan_request finds it');

-- The same run again, and another run: still one request.
select public.record_coverage_report('e2810000-0000-4000-8000-000000000001', pg_temp.report(15, 1));
select public.record_coverage_report('e2810000-0000-4000-8000-000000000001', pg_temp.report(14, 1, 'def'));
select is(pg_temp.requests('e2810000-0000-4000-8000-000000000001'), 1, 'processing again opens no second request');
select is((select count(*)::int from public.coverage_report
           where session_id = 'e2810000-0000-4000-8000-000000000001'), 2, 'the second run is a report all the same');

-- Ops sees it with the other requests and plans it like any extra visit.
select is((select count(*)::int from public.followup_request
           where origin = 'pipeline' and status = 'open'), 1, 'ops sees the open request');
select is(public.ops_plan_followups(
  array(select id from public.followup_request where source_session_id = 'e2810000-0000-4000-8000-000000000001'),
  'e2810000-0000-4000-8000-000000000003'), 1, 'ops links it to a planned visit');
select is((select status::text from public.followup_request
           where source_session_id = 'e2810000-0000-4000-8000-000000000001'), 'planned', 'planned');

-- Cancelled by ops: processing again still opens no new one.
select public.cancel_followup((select id from public.followup_request
                               where source_session_id = 'e2810000-0000-4000-8000-000000000001'));
select public.record_coverage_report('e2810000-0000-4000-8000-000000000001', pg_temp.report(13, 1, 'ghi'));
select is(pg_temp.requests('e2810000-0000-4000-8000-000000000001'), 1, 'cancelled stays cancelled; no second request');

-- A newer passing report cancels an open pipeline request.
select public.record_coverage_report('e2810000-0000-4000-8000-000000000002', pg_temp.report(10, 0, 'v2'));
select is((select status::text from public.followup_request
           where source_session_id = 'e2810000-0000-4000-8000-000000000002'), 'open', 'a later run below the threshold opens one');
select public.record_coverage_report('e2810000-0000-4000-8000-000000000002', pg_temp.report(20, 0, 'v3'));
select results_eq(
  $$ select status::text, resolved_at is not null from public.followup_request
     where source_session_id = 'e2810000-0000-4000-8000-000000000002' $$,
  $$ values ('cancelled', true) $$,
  'a newer passing report cancels it');

-- Expert requests are unchanged; a pipeline request needs its report.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select public.request_followup('e2810000-0000-4000-8000-000000000001', 'extra_visit', null, 'tekrar');
select is((select origin::text from public.followup_request where note = 'tekrar'),
  'expert', 'the expert''s requests are origin expert');
reset role;
select throws_ok(
  $$ insert into public.followup_request (org_id, parcel_id, source_session_id, kind, note, origin)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'e2810000-0000-4000-8000-000000000003', 'extra_visit', 'x', 'pipeline') $$,
  '23514', null, 'a pipeline request names its coverage report');

select * from finish();
rollback;
