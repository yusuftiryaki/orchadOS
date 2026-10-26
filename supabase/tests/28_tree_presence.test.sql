-- Tree presence (20261025120200_tree_presence): the tree_visible metric and
-- record_tree_presence() of the pipeline (ops): measurements with their crops as
-- evidence, idempotent for one run; empty slots for a possible new planting;
-- only ops writes; owners see the results once the visit is published.
-- Seed: owner a0..01, field_staff a0..03, expert a0..04, ops a0..05; org b0..01,
-- parcel c0..01; S2-7 is an empty slot.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.slot(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:slot:' || p_code)::uuid $$;
create function pg_temp.payload(p_items jsonb, p_version text default '0.1.0') returns jsonb language sql
as $$ select jsonb_build_object('method', 'crop_greenness', 'method_version', p_version,
  'params_hash', 'abc', 'measured_at', '2026-10-25T08:00:00Z', 'items', p_items) $$;

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, started_at) values
  ('e2820000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-10-25', '2026-10-25 08:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version)
values
  ('e2820000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'e2820000-0000-4000-8000-000000000001', 'tree_crop',
   md5('orchados-seed:tree:S1-1')::uuid, 'storage://media/x1', repeat('a', 64), 'p', '0.1.0'),
  ('e2820000-0000-4000-8000-0000000000a2', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'e2820000-0000-4000-8000-000000000001', 'tree_crop',
   md5('orchados-seed:tree:S1-1')::uuid, 'storage://media/x2', repeat('b', 64), 'p', '0.1.0'),
  ('e2820000-0000-4000-8000-0000000000a3', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'e2820000-0000-4000-8000-000000000001', 'trajectory',
   null, 'storage://media/x3', repeat('c', 64), 'p', '0.1.0');

select is((select array_to_string(categories, ',') from public.metric_definition where code = 'tree_visible'),
  'yes,no,unsure', 'tree_visible: yes, no, unsure');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.record_tree_presence('e2820000-0000-4000-8000-000000000001',
       pg_temp.payload(jsonb_build_array(jsonb_build_object('tree_id', pg_temp.tree('S1-1'), 'value', 'no')))) $$,
  '42501', 'forbidden', 'the expert does not write algorithm results');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(public.record_tree_presence('e2820000-0000-4000-8000-000000000001', pg_temp.payload(jsonb_build_array(
    jsonb_build_object('tree_id', pg_temp.tree('S1-1'), 'value', 'no',
      'evidence_asset_ids', jsonb_build_array('e2820000-0000-4000-8000-0000000000a1', 'e2820000-0000-4000-8000-0000000000a2')),
    jsonb_build_object('tree_id', pg_temp.tree('S1-2'), 'value', 'yes'),
    jsonb_build_object('slot_id', pg_temp.slot('S2-7'), 'value', 'yes')))),
  '{"created": 3, "existing": 0}'::jsonb, 'ops records a run');
select results_eq(
  $$ select value_category, source::text, method, method_version, subject::text,
            (select count(*)::int from public.measurement_evidence e where e.measurement_id = m.id)
     from public.measurement m
     where session_id = 'e2820000-0000-4000-8000-000000000001' and tree_id = md5('orchados-seed:tree:S1-1')::uuid $$,
  $$ values ('no', 'algorithm', 'crop_greenness', '0.1.0', 'tree', 2) $$,
  'a tree measurement of the algorithm, with its crops as evidence');
select is((select value_category from public.measurement
           where session_id = 'e2820000-0000-4000-8000-000000000001' and slot_id = pg_temp.slot('S2-7')),
  'yes', 'an empty slot: possible new planting');

select is(public.record_tree_presence('e2820000-0000-4000-8000-000000000001', pg_temp.payload(jsonb_build_array(
    jsonb_build_object('tree_id', pg_temp.tree('S1-1'), 'value', 'no'),
    jsonb_build_object('slot_id', pg_temp.slot('S2-7'), 'value', 'yes')))),
  '{"created": 0, "existing": 2}'::jsonb, 'the same run again adds nothing');
select is(public.record_tree_presence('e2820000-0000-4000-8000-000000000001', pg_temp.payload(jsonb_build_array(
    jsonb_build_object('tree_id', pg_temp.tree('S1-1'), 'value', 'unsure')), '0.2.0')),
  '{"created": 1, "existing": 0}'::jsonb, 'a new method version adds its own row');

select throws_ok(
  $$ select public.record_tree_presence('e2820000-0000-4000-8000-000000000001',
       pg_temp.payload(jsonb_build_array(jsonb_build_object('tree_id', pg_temp.tree('S1-3'), 'value', 'maybe')))) $$,
  '22023', 'invalid_input', 'unknown value: refused');
select throws_ok(
  $$ select public.record_tree_presence('e2820000-0000-4000-8000-000000000001',
       pg_temp.payload(jsonb_build_array(jsonb_build_object('slot_id', pg_temp.slot('S1-3'), 'value', 'yes')))) $$,
  '22023', 'invalid_input', 'a slot with a tree is not an empty slot');
select throws_ok(
  $$ select public.record_tree_presence('e2820000-0000-4000-8000-000000000001',
       pg_temp.payload(jsonb_build_array(jsonb_build_object('tree_id', pg_temp.tree('S8-9'), 'value', 'no')))) $$,
  '22023', 'invalid_input', 'a lost tree is not measured');
select throws_ok(
  $$ select public.record_tree_presence('e2820000-0000-4000-8000-000000000001',
       pg_temp.payload(jsonb_build_array(jsonb_build_object('tree_id', pg_temp.tree('S1-3'), 'value', 'no',
         'evidence_asset_ids', jsonb_build_array('e2820000-0000-4000-8000-0000000000a3'))))) $$,
  '22023', 'invalid_input', 'evidence must be a crop of the visit');
select throws_ok(
  $$ select public.record_tree_presence('e2820000-0000-4000-8000-000000000001',
       pg_temp.payload(jsonb_build_array(jsonb_build_object('tree_id', pg_temp.tree('S1-3'), 'value', 'no'))) - 'method') $$,
  '22023', 'invalid_input', 'without a method: refused');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.measurement
           where session_id = 'e2820000-0000-4000-8000-000000000001'), 0, 'owners do not see it before publication');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.measurement
           where session_id = 'e2820000-0000-4000-8000-000000000001'), 4, 'the expert sees the results');

select * from finish();
rollback;
