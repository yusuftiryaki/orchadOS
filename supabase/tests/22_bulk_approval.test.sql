-- Bulk approval (expert panel v0.2): bulk_approve_trees() and the problem_seen metric.
-- Seed: owner a0..01, field_staff a0..03, expert a0..04, ops a0..05; parcel c0..01
-- with 302 active trees. Fixtures add a processed scan session ab..21 with AI
-- suggestions for S1-1 (healthy, with a dead-branch measurement), S1-2 (an
-- older ai row and a newer one) and S1-3; S1-4 has none. Every other active
-- tree gets a plain expert assessment, so publication only waits on S1-1..S1-4.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.metric(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:metric:' || p_code)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
-- One bulk item: the tree, optional measurements and evidence.
create function pg_temp.item(p_code text, p_measurements jsonb default '[]', p_evidence uuid[] default '{}')
returns jsonb language sql immutable
as $$ select jsonb_build_object('tree_id', pg_temp.tree(p_code), 'measurements', p_measurements,
                                'evidence_asset_ids', to_jsonb(p_evidence)) $$;
-- Error detail of a failing bulk_approve_trees() call.
create function pg_temp.bulk_detail(p_items jsonb) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  perform public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', p_items, 'methodology-v0');
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Schema ---------------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.bulk_approve_trees(uuid, jsonb, text)', 'EXECUTE'),
  'anon cannot call bulk_approve_trees');
select results_eq(
  $$ select value_type::text, card_visibility::text, subject_kinds::text[] from public.metric_definition
     where code = 'problem_seen' $$,
  $$ values ('boolean', 'hidden', array['tree']) $$,
  'problem_seen is a hidden yes/no tree metric');
select is(
  (select id from public.metric_definition where code = 'problem_seen'), pg_temp.metric('problem_seen'),
  'problem_seen follows the registry id rule');

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.session (id, org_id, parcel_id, kind, status, started_at, methodology_version)
values ('ab000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-11-25 07:00:00+00',
        'methodology-v0');

insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version)
values ('ab000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000021', 'tree_crop',
        pg_temp.tree('S1-1'), 'storage://media/bulk', encode(sha256('bulk-crop'::bytea), 'hex'), 'pipeline', '0.1.0');

insert into public.assessment (id, org_id, parcel_id, session_id, tree_id, source, overall_class, confidence,
  model_name, model_version, assessed_at)
values
  ('ab000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000021', pg_temp.tree('S1-1'),
   'ai', 'healthy', 0.9, 'test-model', '1', '2026-11-25 08:00:00+00'),
  ('ab000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000021', pg_temp.tree('S1-2'),
   'ai', 'problem', 0.9, 'test-model', '1', '2026-11-25 08:00:00+00'),
  ('ab000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000021', pg_temp.tree('S1-2'),
   'ai', 'attention', 0.9, 'test-model', '2', '2026-11-25 09:00:00+00'),
  ('ab000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000021', pg_temp.tree('S1-3'),
   'ai', 'healthy', 0.95, 'test-model', '1', '2026-11-25 08:00:00+00');

insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class)
select t.org_id, t.parcel_id, 'ab000000-0000-4000-8000-000000000021', t.id, 'expert', 'healthy'
from public.tree t
where t.parcel_id = 'c0000000-0000-4000-8000-000000000001' and t.status = 'active'
  and t.id not in (pg_temp.tree('S1-1'), pg_temp.tree('S1-2'), pg_temp.tree('S1-3'), pg_temp.tree('S1-4'));

-- Other roles cannot bulk approve ----------------------------------------------------

set local role authenticated;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-1'))),
  '42501', null, 'field staff cannot bulk approve');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-1'))),
  '42501', null, 'ops cannot bulk approve');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-1'))),
  '42501', null, 'the owner cannot bulk approve');

-- Expert -----------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');

select throws_ok(
  $$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', '{}', 'methodology-v0') $$,
  '22023', null, 'items must be a json array');
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-4'))),
  'P0001', null, 'a tree without an AI suggestion is refused');
select is(pg_temp.bulk_detail(jsonb_build_array(pg_temp.item('S1-4'))), 'no_ai: S1-4',
  'the error names the tree without AI');
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-5'))),
  'P0001', null, 'a tree with an expert decision is refused');
select is(pg_temp.bulk_detail(jsonb_build_array(pg_temp.item('S1-5'))), 'decided: S1-5',
  'the error names the decided tree');
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(jsonb_build_object('tree_id', 'ab000000-0000-4000-8000-000000000099'))),
  '22023', null, 'a tree of another parcel is refused');

-- All or nothing: S1-1 is fine, S1-4 is not.
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-1'), pg_temp.item('S1-4'))),
  'P0001', null, 'one refused tree refuses the call');
select is_empty(
  format($$ select id from public.assessment
     where session_id = 'ab000000-0000-4000-8000-000000000021' and tree_id = %L and source = 'expert' $$,
    pg_temp.tree('S1-1')),
  'nothing is left of the refused call');

-- An out-of-range copied value rolls back too.
select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-1',
      jsonb_build_array(jsonb_build_object('metric_definition_id', pg_temp.metric('dead_branch_scale'), 'value_scale', 9))))),
  '23514', null, 'a value outside the metric''s range is refused');

select is(
  public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021',
    jsonb_build_array(
      pg_temp.item('S1-1',
        jsonb_build_array(jsonb_build_object('metric_definition_id', pg_temp.metric('dead_branch_scale'),
                                             'value_scale', 0, 'uncertainty', 0.4)),
        array['ab000000-0000-4000-8000-000000000022']::uuid[]),
      pg_temp.item('S1-2'),
      pg_temp.item('S1-3')),
    'methodology-v0'),
  3, 'the expert bulk approves three trees');

select results_eq(
  format($$ select t.code, a.overall_class::text, a.auto_approved, a.methodology_version, a.assessed_by
     from public.assessment a join public.slot t on t.id = (select slot_id from public.tree where id = a.tree_id)
     where a.session_id = 'ab000000-0000-4000-8000-000000000021' and a.source = 'expert'
       and a.tree_id in (%L, %L, %L) order by t.code $$,
    pg_temp.tree('S1-1'), pg_temp.tree('S1-2'), pg_temp.tree('S1-3')),
  $$ values ('S1-1', 'healthy', true, 'methodology-v0', 'a0000000-0000-4000-8000-000000000004'::uuid),
            ('S1-2', 'attention', true, 'methodology-v0', 'a0000000-0000-4000-8000-000000000004'::uuid),
            ('S1-3', 'healthy', true, 'methodology-v0', 'a0000000-0000-4000-8000-000000000004'::uuid) $$,
  'auto approved expert assessments carry the newest AI class and the approving expert');
select results_eq(
  $$ select id, overall_class::text, auto_approved from public.assessment
     where session_id = 'ab000000-0000-4000-8000-000000000021' and source = 'ai' order by id $$,
  $$ values ('ab000000-0000-4000-8000-000000000023'::uuid, 'healthy', false),
            ('ab000000-0000-4000-8000-000000000024'::uuid, 'problem', false),
            ('ab000000-0000-4000-8000-000000000025'::uuid, 'attention', false),
            ('ab000000-0000-4000-8000-000000000026'::uuid, 'healthy', false) $$,
  'the AI rows are unchanged');
select results_eq(
  format($$ select m.source::text, m.method, m.value_scale, m.uncertainty, e.asset_id
     from public.measurement m
     join public.assessment_measurement am on am.measurement_id = m.id
     join public.assessment a on a.id = am.assessment_id and a.auto_approved
     join public.measurement_evidence e on e.measurement_id = m.id
     where m.session_id = 'ab000000-0000-4000-8000-000000000021' and m.tree_id = %L $$, pg_temp.tree('S1-1')),
  $$ values ('expert', 'expert_review', 0::smallint, 0.4::float8, 'ab000000-0000-4000-8000-000000000022'::uuid) $$,
  'copied values become linked expert measurements with evidence');
select results_eq(
  format($$ select auto_approved from public.tree_latest_assessment where tree_id = %L $$, pg_temp.tree('S1-2')),
  array[true],
  'the latest view shows the auto approved row');

select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-3'))),
  'P0001', null, 'a bulk approved tree cannot be bulk approved again');
select lives_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000021', %L, 'problem', '[]', '{}',
       'methodology-v0') $$, pg_temp.tree('S1-3')),
  'the expert can still override a bulk approved tree');

-- Publication counts bulk approved rows as expert decisions.
select throws_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000021') $$,
  'P0001', null, 'publication still waits on S1-4');
select lives_ok(
  format($$ select public.save_expert_assessment('ab000000-0000-4000-8000-000000000021', %L, 'healthy', '[]', '{}',
       'methodology-v0') $$, pg_temp.tree('S1-4')),
  'expert decides the tree without AI');
select lives_ok(
  $$ select public.publish_session('ab000000-0000-4000-8000-000000000021') $$,
  'with bulk approved trees the visit can be published');
select results_eq(
  $$ select count(*) filter (where approved_by is null) from public.assessment
     where session_id = 'ab000000-0000-4000-8000-000000000021' and auto_approved $$,
  array[0::bigint],
  'publication approves the bulk approved rows in the signer''s name');

select throws_ok(
  format($$ select public.bulk_approve_trees('ab000000-0000-4000-8000-000000000021', %L, 'methodology-v0') $$,
    jsonb_build_array(pg_temp.item('S1-1'))),
  '55000', null, 'bulk approval of a published visit is refused');

-- The owner sees the result as an automatic approval.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq(
  format($$ select source::text, auto_approved from public.tree_latest_assessment where tree_id = %L $$,
    pg_temp.tree('S1-2')),
  $$ values ('expert', true) $$,
  'the owner sees the bulk approved class after publication');

select * from finish();
rollback;
