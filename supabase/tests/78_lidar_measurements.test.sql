-- LiDAR measurements (20261107300000_lidar_measurements, owner display in
-- 20261107400000_lidar_owner_display): the new metrics and
-- record_lidar_measurements() of the pipeline (ops): crown, skeleton and pruning
-- stage results as algorithm measurements, idempotent for one run, a new method
-- version adds its own rows; only ops writes, never a demo visitor.
-- Seed: owner a0..01, expert a0..04, ops a0..05; org b0..01, parcel c0..01;
-- S8-9 is a lost tree.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
-- One stage measurement; numeric unless p_category is given.
create function pg_temp.item(
  p_tree uuid, p_metric text, p_numeric double precision, p_uncertainty double precision default 0.1,
  p_category text default null, p_method text default 'lidar_crown', p_version text default '0.1.0'
) returns jsonb language sql
as $$ select jsonb_strip_nulls(jsonb_build_object(
  'tree_id', p_tree, 'metric', p_metric, 'value_numeric', p_numeric, 'value_category', p_category,
  'uncertainty', p_uncertainty, 'confidence', 0.8, 'method', p_method, 'method_version', p_version,
  'params_hash', 'abc')) $$;
create function pg_temp.record(variadic p_items jsonb[]) returns jsonb language sql
as $$ select public.record_lidar_measurements('e7800000-0000-4000-8000-000000000001',
  jsonb_build_object('items', to_jsonb(p_items))) $$;
create function pg_temp.n() returns int language sql
as $$ select count(*)::int from public.measurement where session_id = 'e7800000-0000-4000-8000-000000000001' $$;

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, started_at) values
  ('e7800000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-11-20', '2026-11-20 08:00+00');
-- A tree of another parcel of the same org.
insert into public.parcel (id, org_id, name)
values ('e7800000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000001', 'Other parcel');
insert into public.slot (id, org_id, parcel_id, row_no, position_no)
values ('e7800000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-000000000001',
        'e7800000-0000-4000-8000-0000000000b1', 1, 1);
insert into public.tree (id, org_id, parcel_id, slot_id)
values ('e7800000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-000000000001',
        'e7800000-0000-4000-8000-0000000000b1', 'e7800000-0000-4000-8000-0000000000c1');
grant execute on all functions in schema pg_temp to authenticated;

-- Registry ------------------------------------------------------------------------------

select results_eq(
  $$ select code, coalesce(unit, '-'), value_type::text, array_to_string(valid_seasons, ','),
            card_visibility::text, array_to_string(subject_kinds, ',')
     from public.metric_definition
     where code in ('tree_height', 'size_class', 'wood_volume', 'pruned_wood_volume',
                    'pruned_wood_fraction', 'pruning_cut_count', 'crown_base_height')
       and id = md5('orchados-seed:metric:' || code)::uuid
     order by code $$,
  $$ values ('crown_base_height', 'm', 'numeric', 'winter,spring,summer,harvest', 'hidden', 'tree'),
            ('pruned_wood_fraction', 'ratio', 'numeric', 'winter', 'under_evaluation', 'tree'),
            ('pruned_wood_volume', 'm3', 'numeric', 'winter', 'under_evaluation', 'tree'),
            ('pruning_cut_count', 'count', 'numeric', 'winter', 'shown', 'tree'),
            ('size_class', '-', 'category', 'winter,spring,summer,harvest', 'hidden', 'tree'),
            ('tree_height', 'm', 'numeric', 'winter,spring,summer,harvest', 'shown', 'tree'),
            ('wood_volume', 'm3', 'numeric', 'winter', 'hidden', 'tree') $$,
  'the LiDAR metrics are registered with the seed id rule');
select results_eq(
  $$ select code, card_visibility::text from public.metric_definition
     where code in ('crown_diameter', 'crown_volume', 'scaffold_branch_count', 'pruning_status')
     order by code $$,
  $$ values ('crown_diameter', 'shown'), ('crown_volume', 'shown'),
            ('pruning_status', 'shown'), ('scaffold_branch_count', 'shown') $$,
  'owner display: the other crown and pruning card metrics are shown');
select is((select array_to_string(categories, ',') from public.metric_definition where code = 'size_class'),
  'sapling,young,productive,old', 'size_class: the age_class codes without unknown');

-- Who may write -------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-1'), 'tree_height', 3.2)) $$,
  '42501', 'forbidden', 'the expert does not write algorithm results');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-1'), 'tree_height', 3.2)) $$,
  'P0002', 'not_found', 'the owner is not a member of the org: the session is not found');
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-1'), 'tree_height', 3.2)) $$,
  '42501', 'demo_read_only', 'a request with the demo claim is refused, even for an ops account');

-- Recording -----------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.record(
    pg_temp.item(pg_temp.tree('S1-1'), 'tree_height', 3.2, 0.05),
    pg_temp.item(pg_temp.tree('S1-1'), 'crown_diameter', 2.9, 0.1),
    pg_temp.item(pg_temp.tree('S1-1'), 'size_class', null, null, 'productive'),
    pg_temp.item(pg_temp.tree('S1-2'), 'tree_height', null, null)),
  jsonb_build_object('created', 3, 'existing', 0, 'skipped', jsonb_build_array(jsonb_build_object(
    'tree_id', pg_temp.tree('S1-2'), 'metric', 'tree_height', 'method', 'lidar_crown', 'reason', 'no_value'))),
  'ops records a crown run; a tree the stage could not measure is skipped');
select results_eq(
  $$ select d.code, m.value_numeric, m.value_category, m.unit, m.uncertainty, m.source::text, m.method,
            m.method_version, m.params_hash, m.subject::text, m.measured_at = '2026-11-20 08:00+00'
     from public.measurement m join public.metric_definition d on d.id = m.metric_definition_id
     where m.session_id = 'e7800000-0000-4000-8000-000000000001' order by d.code $$,
  $$ values ('crown_diameter', 2.9::float8, null::text, 'm', 0.1::float8, 'algorithm', 'lidar_crown', '0.1.0', 'abc', 'tree', true),
            ('size_class', null, 'productive', null, null, 'algorithm', 'lidar_crown', '0.1.0', 'abc', 'tree', true),
            ('tree_height', 3.2, null, 'm', 0.05, 'algorithm', 'lidar_crown', '0.1.0', 'abc', 'tree', true) $$,
  'algorithm measurements with method, version, parameters, the unit of the metric and the session start');

select is(pg_temp.record(
    pg_temp.item(pg_temp.tree('S1-1'), 'tree_height', 3.2, 0.05),
    pg_temp.item(pg_temp.tree('S1-1'), 'crown_diameter', 2.9, 0.1),
    pg_temp.item(pg_temp.tree('S1-1'), 'size_class', null, null, 'productive')),
  '{"created": 0, "existing": 3, "skipped": []}'::jsonb, 'the same run again adds nothing');
select is(pg_temp.record(
    pg_temp.item(pg_temp.tree('S1-1'), 'tree_height', 3.3, 0.05, p_version => '0.2.0')),
  '{"created": 1, "existing": 0, "skipped": []}'::jsonb, 'a new method version adds its own row');
select is((select array_agg(value_numeric order by method_version) from public.measurement m
           where m.session_id = 'e7800000-0000-4000-8000-000000000001'
             and m.metric_definition_id = md5('orchados-seed:metric:tree_height')::uuid),
  array[3.2, 3.3]::float8[], 'the old version''s row stays');

select is(pg_temp.record(
    pg_temp.item(pg_temp.tree('S1-1'), 'scaffold_branch_count', 4, 0.5, p_method => 'lidar_qsm'),
    pg_temp.item(pg_temp.tree('S1-1'), 'wood_volume', 0.21, 0.04, p_method => 'lidar_qsm'),
    pg_temp.item(pg_temp.tree('S1-2'), 'pruned_wood_fraction', 0.18, 0.03, p_method => 'lidar_pruning'),
    pg_temp.item(pg_temp.tree('S1-2'), 'pruning_cut_count', 7, 1, p_method => 'lidar_pruning'),
    pg_temp.item(pg_temp.tree('S1-2'), 'pruning_status', null, null, 'partial', 'lidar_pruning')),
  '{"created": 5, "existing": 0, "skipped": []}'::jsonb, 'skeleton and pruning results are recorded');
select is((select unit from public.measurement m
           where m.session_id = 'e7800000-0000-4000-8000-000000000001'
             and m.metric_definition_id = md5('orchados-seed:metric:pruned_wood_fraction')::uuid),
  'ratio', 'the pruned fraction is stored as a ratio');

-- Refusals (all or nothing) -----------------------------------------------------------

select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_height', 2.0),
                           pg_temp.item('e7800000-0000-4000-8000-0000000000d1', 'tree_height', 2.0)) $$,
  '22023', 'invalid_input', 'a tree of another parcel is refused');
select is(pg_temp.n(), 9, 'and nothing of the payload is written');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S8-9'), 'tree_height', 2.0)) $$,
  '22023', 'invalid_input', 'a lost tree is not measured');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'leaf_area', 2.0)) $$,
  '22023', 'invalid_input', 'an unknown metric is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_visible', null, null, 'yes')) $$,
  '22023', 'invalid_input', 'a registered metric that is not a LiDAR metric is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'wood_volume', 0.2)) $$,
  '22023', 'invalid_input', 'a metric of another LiDAR method is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_height', 2.0, p_method => 'photogrammetry')) $$,
  '22023', 'invalid_input', 'an unknown method is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_height', 2.0, null)) $$,
  '22023', 'invalid_input', 'a numeric value without uncertainty is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'size_class', null, null, 'giant')) $$,
  '22023', 'invalid_input', 'a category outside the metric''s list is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_height', null, null, 'tall')) $$,
  '22023', 'invalid_input', 'a numeric metric does not take a category');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_height', 2.0) || '{"unit": "cm"}') $$,
  '22023', 'invalid_input', 'a value in another unit is refused');
select throws_ok(
  $$ select pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'tree_height', 2.0) - 'method_version') $$,
  '22023', 'invalid_input', 'without a method version: refused');

select is(pg_temp.record(pg_temp.item(pg_temp.tree('S1-3'), 'crown_base_height', 0.8))->>'created', '1',
  'the crown stage records the crown base height (drawing on photos and in the tour)');

-- Who sees it ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.measurement
           where session_id = 'e7800000-0000-4000-8000-000000000001'), 0, 'owners do not see it before publication');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.measurement
           where session_id = 'e7800000-0000-4000-8000-000000000001'), 10, 'the expert sees the results');

select * from finish();
rollback;
