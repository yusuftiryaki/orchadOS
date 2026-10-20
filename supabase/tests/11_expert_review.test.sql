-- Expert review and publication (IP7): save_expert_assessment(), publish_session(),
-- the session status rule and the frozen judgement of a published session.
-- Seed: owner a0..01, field_staff a0..03, expert a0..04, ops a0..05; parcel c0..01
-- with 302 active trees. Fixtures add a processed scan session ab..01 with an AI
-- assessment of S1-1, a tree crop, a finding, and expert assessments for every
-- active tree except S1-1 and S1-2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.metric(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:metric:' || p_code)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

-- Error detail of a failing publish_session() call (the list of missing trees).
create function pg_temp.publish_detail(p_session_id uuid) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  perform public.publish_session(p_session_id);
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Schema ---------------------------------------------------------------------------

select has_column('public', 'session', 'published_at', 'session has published_at');
select has_column('public', 'session', 'published_by', 'session has published_by');
select ok(not has_function_privilege('anon', 'public.publish_session(uuid)', 'EXECUTE'),
  'anon cannot call publish_session');
select ok(not has_function_privilege('anon',
  'public.save_expert_assessment(uuid, uuid, public.health_class, jsonb, uuid[], text, text)', 'EXECUTE'),
  'anon cannot call save_expert_assessment');

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.session (id, org_id, parcel_id, kind, status, started_at, methodology_version)
values ('ab000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-11-20 07:00:00+00',
        'methodology-v0');

insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version)
values ('ab000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'tree_crop',
        pg_temp.tree('S1-1'), 'storage://media/x', encode(sha256('expert-crop'::bytea), 'hex'), 'pipeline', '0.1.0');

insert into public.assessment (id, org_id, parcel_id, session_id, tree_id, source, overall_class, confidence,
  model_name, model_version)
values ('ab000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'),
        'ai', 'healthy', 0.4, 'test-model', '1');

insert into public.finding (id, org_id, parcel_id, session_id, tree_id, kind, severity, description)
values ('ab000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'),
        'dead_branch', 'medium', 'Dead scaffold branch.');

insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class)
select t.org_id, t.parcel_id, 'ab000000-0000-4000-8000-000000000001', t.id, 'expert', 'healthy'
from public.tree t
where t.parcel_id = 'c0000000-0000-4000-8000-000000000001' and t.status = 'active'
  and t.id not in (pg_temp.tree('S1-1'), pg_temp.tree('S1-2'));

-- Field staff and ops cannot publish ---------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');

select throws_ok(
  $$ update public.session set status = 'published' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'field staff cannot set a session to published directly');
select throws_ok(
  $$ insert into public.session (org_id, parcel_id, kind, status)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published') $$,
  '42501', null, 'field staff cannot insert a published session');
select throws_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'field staff cannot call publish_session');
select lives_ok(
  $$ update public.session set notes = 'field note' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  'field staff can still update an unpublished session');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ update public.session set status = 'published' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'ops cannot set a session to published directly');
select throws_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'ops cannot call publish_session');
select throws_ok(
  $$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000001', md5('orchados-seed:tree:S1-1')::uuid,
       'healthy', '[]', '{}', 'methodology-v0') $$,
  '42501', null, 'ops cannot write an expert assessment');

-- Expert review ---------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');

select lives_ok(
  $$ update public.session set status = 'in_review' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  'expert opens the session for review');
select throws_ok(
  $$ update public.session set status = 'published' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'expert cannot publish by updating the status either');

select throws_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'session ab000000-0000-4000-8000-000000000001 cannot be published: 2 active trees have no expert assessment',
  'publishing with unreviewed trees is refused');
select is(pg_temp.publish_detail('ab000000-0000-4000-8000-000000000001'), 'missing: S1-1, S1-2',
  'the error lists the unreviewed trees');

-- Accept the AI class with a dead-branch scale.
select lives_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000001', %L, 'healthy',
       '[{"metric_definition_id": "%s", "value_scale": 0, "uncertainty": 0.5}]',
       array['ab000000-0000-4000-8000-000000000002']::uuid[], 'methodology-v0') $$,
    pg_temp.tree('S1-1'), pg_temp.metric('dead_branch_scale')),
  'expert accepts the AI class of S1-1');
select results_eq(
  $$ select source::text, overall_class::text, confidence from public.assessment
     where id = 'ab000000-0000-4000-8000-000000000003' $$,
  $$ values ('ai', 'healthy', 0.4::real) $$,
  'the AI row is unchanged');
select results_eq(
  format($$ select m.source::text, m.method, m.method_version, m.value_scale, m.uncertainty
     from public.measurement m
     where m.session_id = 'ab000000-0000-4000-8000-000000000001' and m.tree_id = %L $$, pg_temp.tree('S1-1')),
  $$ values ('expert', 'expert_review', 'methodology-v0', 0::smallint, 0.5::float8) $$,
  'an expert measurement with method and version is written');
select results_eq(
  format($$ select e.asset_id from public.measurement_evidence e
     join public.measurement m on m.id = e.measurement_id
     where m.session_id = 'ab000000-0000-4000-8000-000000000001' and m.tree_id = %L $$, pg_temp.tree('S1-1')),
  $$ values ('ab000000-0000-4000-8000-000000000002'::uuid) $$,
  'the crop the expert looked at is the measurement''s evidence');
select results_eq(
  format($$ select count(*) from public.assessment_measurement am
     join public.assessment a on a.id = am.assessment_id
     where a.session_id = 'ab000000-0000-4000-8000-000000000001' and a.tree_id = %L and a.source = 'expert' $$,
    pg_temp.tree('S1-1')),
  array[1::bigint],
  'the measurement is linked to the expert assessment');

-- Correct the decision: a new row, the old one stays.
select lives_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000001', %L, 'problem',
       '[{"metric_definition_id": "%s", "value_scale": 3, "uncertainty": 0.5}]', '{}', 'methodology-v0', 'Kuru dal fazla.') $$,
    pg_temp.tree('S1-1'), pg_temp.metric('dead_branch_scale')),
  'expert corrects S1-1');
select results_eq(
  format($$ select count(*) from public.assessment
     where session_id = 'ab000000-0000-4000-8000-000000000001' and tree_id = %L and source = 'expert' $$,
    pg_temp.tree('S1-1')),
  array[2::bigint],
  'the earlier decision is kept');
select results_eq(
  format($$ select overall_class::text, notes from public.tree_latest_assessment where tree_id = %L $$,
    pg_temp.tree('S1-1')),
  $$ values ('problem', 'Kuru dal fazla.') $$,
  'the newest decision counts');

-- Atomic: an invalid scale leaves no assessment behind.
select throws_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000001', %L, 'problem',
       '[{"metric_definition_id": "%s", "value_scale": 7, "uncertainty": 0.5}]', '{}', 'methodology-v0') $$,
    pg_temp.tree('S1-2'), pg_temp.metric('dead_branch_scale')),
  '23514', null, 'a scale value outside the metric''s range is refused');
select is_empty(
  format($$ select id from public.assessment
     where session_id = 'ab000000-0000-4000-8000-000000000001' and tree_id = %L $$, pg_temp.tree('S1-2')),
  'nothing is left of the refused decision');

-- Owner does not see the review yet.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty(
  $$ select id from public.assessment where session_id = 'ab000000-0000-4000-8000-000000000001' $$,
  'owner does not see assessments before publication');
select is_empty(
  $$ select id from public.finding where session_id = 'ab000000-0000-4000-8000-000000000001' $$,
  'owner does not see findings before publication');

-- Publish ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select lives_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000001', %L, 'healthy', '[]', '{}',
       'methodology-v0') $$, pg_temp.tree('S1-2')),
  'expert reviews the last tree');
select lives_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000001') $$,
  'expert signs and publishes');
select results_eq(
  $$ select status::text, published_by, published_at is not null from public.session
     where id = 'ab000000-0000-4000-8000-000000000001' $$,
  $$ values ('published', 'a0000000-0000-4000-8000-000000000004'::uuid, true) $$,
  'status, signer and time are recorded');
select results_eq(
  $$ select approved_by, approved_at is not null from public.finding
     where id = 'ab000000-0000-4000-8000-000000000005' $$,
  $$ values ('a0000000-0000-4000-8000-000000000004'::uuid, true) $$,
  'the finding is approved in the signer''s name');
select is_empty(
  $$ select id from public.assessment
     where session_id = 'ab000000-0000-4000-8000-000000000001' and source = 'expert' and approved_by is null $$,
  'expert assessments are approved too');
select throws_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000001') $$,
  '55000', null, 'a published session cannot be published again');

-- Frozen after publication ------------------------------------------------------------

select throws_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000001', %L, 'dead', '[]', '{}',
       'methodology-v0') $$, pg_temp.tree('S1-2')),
  '55000', null, 'no new decisions after publication');
select throws_ok(
  format($$ insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'ab000000-0000-4000-8000-000000000001', %L, 'expert', 'dead') $$, pg_temp.tree('S1-2')),
  '42501', null, 'no direct assessment inserts after publication');
select throws_ok(
  $$ update public.finding set description = 'changed' where id = 'ab000000-0000-4000-8000-000000000005' $$,
  '42501', null, 'findings cannot be edited after publication');
select throws_ok(
  $$ delete from public.finding where id = 'ab000000-0000-4000-8000-000000000005' $$,
  '42501', null, 'findings cannot be deleted after publication');
select throws_ok(
  $$ insert into public.finding_evidence (org_id, parcel_id, finding_id, asset_id)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'ab000000-0000-4000-8000-000000000005', 'ab000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'no new finding evidence after publication');

select lives_ok(
  $$ update public.session set status = 'in_review' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  'an update of a published session by an API user touches no row');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ delete from public.finding where id = 'ab000000-0000-4000-8000-000000000005' $$,
  '42501', null, 'ops cannot delete findings of a published session either');
select lives_ok(
  $$ delete from public.session where id = 'ab000000-0000-4000-8000-000000000001' $$,
  'ops delete of a published session touches no row');

-- Owner sees the results now.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select count(*) from public.assessment where session_id = 'ab000000-0000-4000-8000-000000000001' and source = 'expert' $$,
  array[303::bigint],
  'owner sees the expert assessments after publication');
select results_eq(
  $$ select count(*) from public.finding where session_id = 'ab000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'owner sees the finding after publication');

reset role;
select results_eq(
  $$ select status::text from public.session where id = 'ab000000-0000-4000-8000-000000000001' $$,
  array['published'],
  'the session is still published');
select throws_ok(
  $$ update public.session set status = 'in_review' where id = 'ab000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'publication is final, even for trusted roles');

select * from finish();
rollback;
