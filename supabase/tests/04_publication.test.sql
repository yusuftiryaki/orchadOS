-- Publication rule and the latest-value views.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04; parcel c0..01;
-- session e0..01 (inventory, in_review). Fixtures add results to that session, a
-- second unprocessed session e0..02 with a newer expert assessment, and another
-- owner with a parcel of their own.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Fixtures (as postgres) -----------------------------------------------------------

create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.metric(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:metric:' || p_code)::uuid $$;

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000009',
        'authenticated', 'authenticated', 'third-owner@example.com');
insert into public.parcel (id, org_id, name)
values ('f2000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001', 'Third owner parcel');
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000009',
        'f0000000-0000-4000-8000-000000000009', 'owner');

insert into public.session (id, org_id, parcel_id, kind, status)
values ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed');

insert into public.capture (id, org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
values ('97000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'video_360',
        'station://raw/pub.insv', encode(sha256('pub-capture'::bytea), 'hex'), '2026-10-10 06:40:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version)
values ('97000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'tree_crop',
        pg_temp.tree('S1-1'), 'storage://media/x', encode(sha256('pub-asset'::bytea), 'hex'), 'pipeline', '0.1.0');
insert into public.asset_source (org_id, parcel_id, asset_id, source_capture_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '97000000-0000-4000-8000-000000000002', '97000000-0000-4000-8000-000000000001');

insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_numeric, uncertainty,
  method, method_version, source, session_id, measured_at)
values ('97000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'), pg_temp.metric('trunk_diameter_h30'),
        24.5, 0.3, 'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', '2026-10-10 07:10:00+00');
insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '97000000-0000-4000-8000-000000000003', '97000000-0000-4000-8000-000000000002');

insert into public.assessment (id, org_id, parcel_id, session_id, tree_id, source, overall_class, assessed_at)
values ('97000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'),
        'expert', 'problem', '2026-10-11 00:00:00+00');
insert into public.assessment_measurement (org_id, parcel_id, assessment_id, measurement_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '97000000-0000-4000-8000-000000000004', '97000000-0000-4000-8000-000000000003');
insert into public.finding (id, org_id, parcel_id, session_id, tree_id, assessment_id, kind, severity, description)
values ('97000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'),
        '97000000-0000-4000-8000-000000000004', 'dead_branch', 'medium', 'Dead scaffold branch.');
insert into public.finding_evidence (org_id, parcel_id, finding_id, asset_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '97000000-0000-4000-8000-000000000005', '97000000-0000-4000-8000-000000000002');

-- Newer expert assessment of S1-1 in the session that is not published.
insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class, assessed_at)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000002', pg_temp.tree('S1-1'), 'expert', 'dead', '2026-10-20 00:00:00+00');

-- Priority fixtures, all in the seed session.
-- S1-2: expert (oldest) > model > ai (newest).  S1-3: no expert; newest model beats a newer ai.
insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class,
  model_name, model_version, assessed_at)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001', pg_temp.tree(t), s::public.assessment_source,
       c::public.health_class, 'test-model', '1', a::timestamptz
from (values
  ('S1-2', 'expert', 'attention', '2026-10-01'),
  ('S1-2', 'model', 'problem', '2026-10-05'),
  ('S1-2', 'ai', 'dead', '2026-10-09'),
  ('S1-3', 'ai', 'dead', '2026-10-09'),
  ('S1-3', 'model', 'problem', '2026-10-02'),
  ('S1-3', 'model', 'healthy', '2026-10-04')
) as v (t, s, c, a);

-- Measurements: expert > algorithm > staff > ai; newest within the same source.
insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, value_scale,
  uncertainty, method, method_version, source, session_id, measured_at)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       pg_temp.tree(t), pg_temp.metric(m), n, sc, 0.5, 'test', '1', s::public.measurement_source,
       'e0000000-0000-4000-8000-000000000001', a::timestamptz
from (values
  ('S1-2', 'dead_branch_scale', null, 3::smallint, 'ai', '2026-10-09'),
  ('S1-2', 'dead_branch_scale', null, 2::smallint, 'staff', '2026-10-08'),
  ('S1-2', 'dead_branch_scale', null, 1::smallint, 'algorithm', '2026-10-03'),
  ('S1-2', 'dead_branch_scale', null, 0::smallint, 'expert', '2026-10-01'),
  ('S1-3', 'dead_branch_scale', null, 3::smallint, 'ai', '2026-10-09'),
  ('S1-3', 'dead_branch_scale', null, 2::smallint, 'staff', '2026-10-03'),
  ('S1-3', 'dead_branch_scale', null, 1::smallint, 'algorithm', '2026-10-01'),
  ('S1-3', 'trunk_diameter_h30', 24.5::float8, null, 'staff', '2026-10-01'),
  ('S1-3', 'trunk_diameter_h30', 25.0::float8, null, 'staff', '2026-10-05'),
  ('S1-4', 'dead_branch_scale', null, 3::smallint, 'ai', '2026-10-09'),
  ('S1-4', 'dead_branch_scale', null, 1::smallint, 'staff', '2026-10-02')
) as v (t, m, n, sc, s, a);

-- Before publication: owner and viewer see the visit, not its results ------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select is_empty($$ select id from public.assessment $$, 'owner does not see assessments of an unpublished session');
select is_empty($$ select id from public.finding $$, 'owner does not see findings of an unpublished session');
select is_empty($$ select id from public.capture $$, 'owner does not see captures of an unpublished session');
select is_empty($$ select id from public.asset $$, 'owner does not see assets of an unpublished session');
select is_empty($$ select id from public.measurement $$, 'owner does not see measurements of an unpublished session');
select is_empty($$ select asset_id from public.asset_source $$, 'owner does not see lineage of unpublished assets');
select is_empty($$ select asset_id from public.measurement_evidence $$, 'owner does not see unpublished measurement evidence');
select is_empty($$ select measurement_id from public.assessment_measurement $$, 'owner does not see unpublished assessment inputs');
select is_empty($$ select asset_id from public.finding_evidence $$, 'owner does not see unpublished finding evidence');
select is_empty($$ select id from public.tree_latest_assessment $$, 'tree_latest_assessment applies the rule (security_invoker)');
select is_empty($$ select id from public.tree_latest_measurement $$, 'tree_latest_measurement applies the rule (security_invoker)');
select results_eq($$ select count(*) from public.session $$, array[2::bigint], 'owner still sees the sessions themselves');
select results_eq($$ select count(*) from public.tree $$, array[303::bigint], 'trees are not session-bound and stay visible');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is_empty($$ select id from public.assessment $$, 'viewer does not see assessments of an unpublished session');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated"}', true);
select ok(exists (select 1 from public.assessment where id = '97000000-0000-4000-8000-000000000004'),
  'expert sees assessments of an unpublished session');
select results_eq(
  $$ select overall_class::text from public.tree_latest_assessment where tree_id = md5('orchados-seed:tree:S1-1')::uuid $$,
  array['dead'], 'expert sees the newest expert assessment, from the unpublished session');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
select results_eq($$ select count(*) from public.capture $$, array[1::bigint], 'field staff sees captures of an unpublished session');

-- Publish the seed session ---------------------------------------------------------

reset role;
update public.session set status = 'published' where id = 'e0000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select results_eq(
  $$ select overall_class::text from public.assessment where tree_id = md5('orchados-seed:tree:S1-1')::uuid $$,
  array['problem'], 'after publication the owner sees the published assessment, not the unpublished one');
select results_eq($$ select count(*) from public.finding $$, array[1::bigint], 'owner sees the published finding');
select results_eq($$ select count(*) from public.capture $$, array[1::bigint], 'owner sees the published capture');
select results_eq($$ select count(*) from public.asset $$, array[1::bigint], 'owner sees the published asset');
select results_eq($$ select count(*) from public.asset_source $$, array[1::bigint], 'owner sees the asset lineage');
select results_eq($$ select count(*) from public.measurement_evidence $$, array[1::bigint], 'owner sees measurement evidence');
select results_eq($$ select count(*) from public.assessment_measurement $$, array[1::bigint], 'owner sees assessment inputs');
select results_eq($$ select count(*) from public.finding_evidence $$, array[1::bigint], 'owner sees finding evidence');

-- Priority rule (as the owner, all fixtures now published) ------------------------------

select results_eq(
  $$ select overall_class::text from public.tree_latest_assessment where tree_id = md5('orchados-seed:tree:S1-1')::uuid $$,
  array['problem'], 'owner''s latest assessment ignores the unpublished newer one');
select results_eq(
  $$ select overall_class::text from public.tree_latest_assessment where tree_id = md5('orchados-seed:tree:S1-2')::uuid $$,
  array['attention'], 'expert beats newer model and ai assessments');
select results_eq(
  $$ select overall_class::text from public.tree_latest_assessment where tree_id = md5('orchados-seed:tree:S1-3')::uuid $$,
  array['healthy'], 'without an expert, the newest model assessment beats a newer ai one');
select results_eq(
  $$ select count(*) = count(distinct tree_id) from public.tree_latest_assessment $$,
  array[true], 'tree_latest_assessment has one row per tree');
select results_eq(
  $$ select value_scale from public.tree_latest_measurement
     where tree_id = md5('orchados-seed:tree:S1-2')::uuid and metric_definition_id = md5('orchados-seed:metric:dead_branch_scale')::uuid $$,
  array[0::smallint], 'expert measurement beats algorithm, staff and ai');
select results_eq(
  $$ select value_scale from public.tree_latest_measurement
     where tree_id = md5('orchados-seed:tree:S1-3')::uuid and metric_definition_id = md5('orchados-seed:metric:dead_branch_scale')::uuid $$,
  array[1::smallint], 'algorithm measurement beats newer staff and ai');
select results_eq(
  $$ select value_scale from public.tree_latest_measurement
     where tree_id = md5('orchados-seed:tree:S1-4')::uuid and metric_definition_id = md5('orchados-seed:metric:dead_branch_scale')::uuid $$,
  array[1::smallint], 'staff measurement beats a newer ai one');
select results_eq(
  $$ select value_numeric from public.tree_latest_measurement
     where tree_id = md5('orchados-seed:tree:S1-3')::uuid and metric_definition_id = md5('orchados-seed:metric:trunk_diameter_h30')::uuid $$,
  array[25.0::float8], 'the newest measurement wins within the same source');
select results_eq(
  $$ select count(*) from public.tree_latest_measurement where tree_id = md5('orchados-seed:tree:S1-3')::uuid $$,
  array[2::bigint], 'tree_latest_measurement has one row per tree and metric');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select ok(exists (select 1 from public.assessment where id = '97000000-0000-4000-8000-000000000004'),
  'viewer sees the published assessment');

select set_config('request.jwt.claims', '{"sub": "f0000000-0000-4000-8000-000000000009", "role": "authenticated"}', true);
select is_empty($$ select id from public.assessment $$, 'publication does not open results to owners of other parcels');

reset role;
select ok(
  not has_function_privilege('anon', 'authz.user_published_session_ids()', 'EXECUTE'),
  'anon cannot call the publication helper');

select * from finish();
rollback;
