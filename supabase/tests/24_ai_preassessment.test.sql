-- AI pre-assessment rows (20261023150000_ai_preassessment): save_ai_assessment,
-- ai_assessment_detail, and AI rows hidden from owners and viewers.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05,
-- org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.tree(p_code text) returns uuid language sql
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.metric(p_code text) returns uuid language sql
as $$ select md5('orchados-seed:metric:' || p_code)::uuid $$;

-- A processed scan with two crops of S1-1 and one of S1-2, and an older published one.
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('a9000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2027-01-10 08:00:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash,
                          pose, pipeline, pipeline_version)
select v.id::uuid, 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'a9000000-0000-4000-8000-000000000001', 'tree_crop', pg_temp.tree(v.code), 'storage://media/x',
       repeat(v.h, 64), jsonb_build_object('direction', v.dir, 'filters_applied', '["face_blur"]'::jsonb),
       'orchados-pipeline', '0.1.0'
from (values
  ('a9000000-0000-4000-8000-0000000000a1', 'S1-1', 'N', '1'),
  ('a9000000-0000-4000-8000-0000000000a2', 'S1-1', 'S', '2'),
  ('a9000000-0000-4000-8000-0000000000a3', 'S1-2', 'N', '3')
) as v (id, code, dir, h);

create function pg_temp.save(p_tree text, p_prompt text, p_evidence uuid[]) returns uuid language sql
as $$
  select public.save_ai_assessment(
    'a9000000-0000-4000-8000-000000000001', pg_temp.tree(p_tree), 'attention', 0.82,
    'claude-sonnet-5-5', 'claude-sonnet-5-5', 'methodology-v0', 'Kuzeyde kuru dal.',
    jsonb_build_array(
      jsonb_build_object('metric_definition_id', pg_temp.metric('dead_branch_scale'),
                         'value_scale', 2, 'confidence', 0.8, 'uncertainty', 0.3),
      jsonb_build_object('metric_definition_id', pg_temp.metric('pruning_status'),
                         'value_category', 'done', 'confidence', 0.9, 'uncertainty', null)
    ),
    p_evidence,
    jsonb_build_object(
      'prompt_version', p_prompt, 'config_key', 'claude-haiku-5-5>claude-sonnet-5-5',
      'final_stage', 2, 'models', array['claude-haiku-5-5', 'claude-sonnet-5-5'],
      'review_reasons', array['low_confidence'], 'tree_visible', 'yes',
      'flags', array['staff_answer_conflict'], 'input_tokens', 4200, 'output_tokens', 900,
      'cache_read_input_tokens', 2500, 'cache_creation_input_tokens', 0, 'cost_usd', 0.0071,
      'batch_ids', array['msgbatch_1', 'msgbatch_2'], 'params_hash', 'abc123')
  )
$$;

select has_table('public', 'ai_assessment_detail', 'ai_assessment_detail exists');
select has_function('public', 'save_ai_assessment', 'save_ai_assessment exists');

-- Ops writes an AI result ------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

create temp table saved (name text primary key, id uuid);
grant all on saved to authenticated;
insert into saved values
  ('first', pg_temp.save('S1-1', 'ai-v0.1/methodology-v0',
     array['a9000000-0000-4000-8000-0000000000a1', 'a9000000-0000-4000-8000-0000000000a2']::uuid[]));

select results_eq(
  $$ select source::text, overall_class::text, confidence, model_name, model_version, methodology_version, notes
     from public.assessment where id = (select id from saved where name = 'first') $$,
  $$ values ('ai', 'attention', 0.82::real, 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'methodology-v0',
             'Kuzeyde kuru dal.') $$,
  'the AI assessment carries class, confidence, model and methodology version');
select results_eq(
  $$ select m.source::text, m.method, m.method_version, m.params_hash, m.value_scale, m.value_category,
            m.confidence, m.uncertainty
     from public.measurement m
     join public.assessment_measurement am on am.measurement_id = m.id
     where am.assessment_id = (select id from saved where name = 'first')
     order by m.value_scale nulls last $$,
  $$ values ('ai', 'ai_preassessment', 'ai-v0.1/methodology-v0', 'abc123', 2::smallint, null::text, 0.8::real, 0.3::float8),
            ('ai', 'ai_preassessment', 'ai-v0.1/methodology-v0', 'abc123', null::smallint, 'done', 0.9::real, null::float8) $$,
  'AI measurements are linked to the assessment, with method, prompt version and confidence');
select results_eq(
  $$ select count(*) from public.measurement_evidence me
     join public.assessment_measurement am on am.measurement_id = me.measurement_id
     where am.assessment_id = (select id from saved where name = 'first') $$,
  array[4::bigint], 'every AI measurement has both crops as evidence');
select results_eq(
  $$ select prompt_version, config_key, final_model, final_stage, models, review_reasons, tree_visible, flags,
            input_tokens, output_tokens, cache_read_input_tokens, cost_usd, batch_ids
     from public.ai_assessment_detail where assessment_id = (select id from saved where name = 'first') $$,
  $$ values ('ai-v0.1/methodology-v0', 'claude-haiku-5-5>claude-sonnet-5-5', 'claude-sonnet-5-5', 2::smallint,
             array['claude-haiku-5-5', 'claude-sonnet-5-5'], array['low_confidence'], 'yes',
             array['staff_answer_conflict'], 4200, 900, 2500, 0.0071::numeric(12, 6),
             array['msgbatch_1', 'msgbatch_2']) $$,
  'the detail row records triage, flags and cost');

-- Same prompt version and cascade: nothing new.
select is(pg_temp.save('S1-1', 'ai-v0.1/methodology-v0', array['a9000000-0000-4000-8000-0000000000a1']::uuid[]),
          (select id from saved where name = 'first'), 'a rerun returns the existing assessment');
select results_eq(
  $$ select (select count(*) from public.assessment where session_id = 'a9000000-0000-4000-8000-000000000001'),
            (select count(*) from public.measurement where session_id = 'a9000000-0000-4000-8000-000000000001'),
            (select count(*) from public.ai_assessment_detail where session_id = 'a9000000-0000-4000-8000-000000000001') $$,
  $$ values (1::bigint, 2::bigint, 1::bigint) $$,
  'a rerun writes no rows');

-- A new prompt version is a new result.
insert into saved values ('v2', pg_temp.save('S1-1', 'ai-v0.2/methodology-v0', '{}'));
select isnt((select id from saved where name = 'v2'), (select id from saved where name = 'first'),
  'a new prompt version adds a new assessment');

select throws_ok(
  $$ select pg_temp.save('S1-1', 'ai-v0.3/methodology-v0', array['a9000000-0000-4000-8000-0000000000a3']::uuid[]) $$,
  '23514', null, 'evidence must be a crop of the same tree');
select throws_ok(
  $$ select public.save_ai_assessment('a9000000-0000-4000-8000-000000000001', md5('orchados-seed:tree:S1-1')::uuid,
       'healthy', 0.9, 'm', 'm', 'methodology-v0', null, '{}', '{}', '{"prompt_version": "p"}') $$,
  '22023', null, 'the detail needs a prompt version and a config key');
select throws_ok(
  $$ update public.ai_assessment_detail set flags = '{}' $$,
  '42501', null, 'details cannot be updated (no UPDATE privilege)');

-- Who may write --------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select pg_temp.save('S1-2', 'ai-v0.1/methodology-v0', '{}') $$,
  '42501', null, 'field staff cannot write AI results');
select results_eq($$ select count(*) from public.ai_assessment_detail $$, array[2::bigint],
  'field staff, as an org member, may read the details');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select pg_temp.save('S1-2', 'ai-v0.1/methodology-v0', '{}') $$,
  '42501', null, 'the owner cannot write AI results');


-- Expert reads what the panel reads ------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select count(*) from public.ai_assessment_detail where session_id = 'a9000000-0000-4000-8000-000000000001' $$,
  array[2::bigint], 'the expert sees the AI details');
select results_eq(
  $$ select count(*) from public.assessment a
     join public.assessment_measurement am on am.assessment_id = a.id
     where a.session_id = 'a9000000-0000-4000-8000-000000000001' and a.source = 'ai' $$,
  array[4::bigint], 'the expert sees AI assessments with their measurement links');

-- Owners and viewers never see AI rows ------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty($$ select 1 from public.assessment where session_id = 'a9000000-0000-4000-8000-000000000001' $$,
  'owner: no AI assessment before publication');

-- The expert accepts S1-1; the session is published (as a trusted role, like the demo data).
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select lives_ok(
  format($$ select public.save_expert_assessment('a9000000-0000-4000-8000-000000000001', %L, 'attention',
       '[{"metric_definition_id": "%s", "value_scale": 2, "uncertainty": 0.5}]',
       array['a9000000-0000-4000-8000-0000000000a1']::uuid[], 'methodology-v0') $$,
    pg_temp.tree('S1-1'), pg_temp.metric('dead_branch_scale')),
  'the expert accepts the AI class');
reset role;
update public.session set status = 'published' where id = 'a9000000-0000-4000-8000-000000000001';

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select source::text from public.assessment where session_id = 'a9000000-0000-4000-8000-000000000001' $$,
  array['expert'], 'owner: after publication only the expert assessment');
select results_eq(
  $$ select source::text from public.measurement where session_id = 'a9000000-0000-4000-8000-000000000001' $$,
  array['expert'], 'owner: after publication only the expert measurement');
select is_empty($$ select 1 from public.ai_assessment_detail $$, 'owner never sees AI details');
select results_eq(
  $$ select count(*) from public.assessment_measurement am
     join public.assessment a on a.id = am.assessment_id
     where a.session_id = 'a9000000-0000-4000-8000-000000000001' $$,
  array[1::bigint], 'owner: only the expert assessment''s inputs');
select results_eq(
  $$ select count(*) from public.measurement_evidence me
     where me.asset_id in ('a9000000-0000-4000-8000-0000000000a1', 'a9000000-0000-4000-8000-0000000000a2') $$,
  array[1::bigint], 'owner: only the expert measurement''s evidence');
select results_eq(
  $$ select source::text from public.tree_latest_assessment where tree_id = md5('orchados-seed:tree:S1-1')::uuid $$,
  array['expert'], 'owner: the latest assessment is the expert''s');
select is_empty(
  $$ select 1 from public.tree_latest_measurement where source = 'ai' $$,
  'owner: no AI value in the latest measurements');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.assessment where source = 'ai' $$, 'viewer never sees AI assessments');
select is_empty($$ select 1 from public.measurement where source = 'ai' $$, 'viewer never sees AI measurements');

-- A published session takes no new AI rows.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select pg_temp.save('S1-2', 'ai-v0.1/methodology-v0', '{}') $$,
  '55000', null, 'no AI results for a published session');
select results_eq(
  $$ select count(*) from public.assessment where session_id = 'a9000000-0000-4000-8000-000000000001' and source = 'ai' $$,
  array[2::bigint], 'ops still sees the AI assessments of the published session');

reset role;
select throws_ok(
  $$ delete from public.ai_assessment_detail $$,
  'P0001', null, 'details are insert-only, also for trusted roles');
select ok(
  not has_function_privilege('anon', 'public.save_ai_assessment(uuid, uuid, public.health_class, real, text, text, text, text, jsonb, uuid[], jsonb)', 'EXECUTE'),
  'anon cannot call save_ai_assessment');

select * from finish();
rollback;
