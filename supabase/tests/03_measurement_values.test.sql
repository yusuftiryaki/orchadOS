-- Value columns and uncertainty: category and yes/no values may leave uncertainty empty,
-- numeric and scale values may not. Run as the migration owner (postgres).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

insert into public.metric_definition (code, name, unit, value_type, categories, valid_seasons, card_visibility)
values ('test_bark_colour', 'Test bark colour', null, 'category', '{grey,brown}', '{winter}', 'hidden');
insert into public.metric_definition (code, name, unit, value_type, valid_seasons, card_visibility)
values ('test_gum_present', 'Test gum present', null, 'boolean', '{winter}', 'hidden');

select lives_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_category,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, (select id from public.metric_definition where code = 'test_bark_colour'),
       'grey', 'field_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  'a category value without uncertainty is accepted'
);

select lives_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, (select id from public.metric_definition where code = 'test_gum_present'),
       true, 'field_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  'a yes/no value without uncertainty is accepted'
);

select is(
  (select value_boolean from public.measurement
   where metric_definition_id = (select id from public.metric_definition where code = 'test_gum_present')),
  true,
  'the yes/no answer is stored in value_boolean'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:dead_branch_scale')::uuid, 1,
       'staff_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a scale value without uncertainty is still rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale, uncertainty,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, (select id from public.metric_definition where code = 'test_gum_present'),
       1, 0, 'field_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a 0/1 scale value for a yes/no metric is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid,
       true, 'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a yes/no value for a numeric metric is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_boolean, value_category,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, (select id from public.metric_definition where code = 'test_gum_present'),
       true, 'grey', 'field_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a measurement with a yes/no and a category value is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_category, uncertainty,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, (select id from public.metric_definition where code = 'test_bark_colour'),
       'grey', -1, 'field_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'an optional uncertainty must still be non-negative'
);

select throws_ok(
  $$ insert into public.metric_definition (code, name, unit, value_type, valid_seasons, card_visibility)
     values ('test_bool_with_unit', 'Test', 'cm', 'boolean', '{winter}', 'hidden') $$,
  '23514', null,
  'a yes/no metric has no unit'
);

select * from finish();
rollback;
