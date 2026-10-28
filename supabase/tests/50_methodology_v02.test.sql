-- methodology-v0.2 registry changes (20261102130000_methodology_v02): wider
-- seasons for the pre-harvest visit and late-March frost, the two summer
-- questions, and the fence question stored on the parcel (no tree).
-- Seed: field_staff a0..03, org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select testing.reset_to_seed();

create function pg_temp.seasons(p_code text) returns text[] language sql stable
as $$ select array(select s::text from unnest((select valid_seasons from public.metric_definition
                                                 where code = p_code)) s order by 1) $$;

select is(pg_temp.seasons('theft_trace'), array['harvest', 'summer'],
  'theft trace is entered in summer (pre-harvest visit) and harvest');
select is(pg_temp.seasons('branch_break'), array['harvest', 'summer'],
  'broken branch is entered in summer and harvest');
select is(pg_temp.seasons('debris_under_tree_present'), array['harvest', 'summer'],
  'heap under the tree is asked in summer and harvest');
select is(pg_temp.seasons('frost_damage_scale'), array['spring', 'winter'],
  'frost damage can be entered in winter (late March under v0.2)');
select results_eq(
  $$ select code, valid_seasons::text, subject_kinds::text, value_type::text, card_visibility::text
     from public.metric_definition
     where code in ('early_emptied_cluster_present', 'fence_breach_present') order by code $$,
  $$ values ('early_emptied_cluster_present', '{summer}', '{tree}', 'boolean', 'hidden'),
            ('fence_breach_present', '{summer}', '{parcel}', 'boolean', 'hidden') $$,
  'summer questions of v0.2 are registered: emptied cluster on the tree, fence gap on the parcel');

-- A planned summer visit led by the field staff user.
insert into public.session (id, org_id, parcel_id, kind, status, planned_date, lead_user_id, methodology_version)
values ('e5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2027-08-05',
        'a0000000-0000-4000-8000-000000000003', 'methodology-v0.2');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-4000-8000-000000000003', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.measurement (id, org_id, parcel_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('e5100000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001',
       (select id from public.metric_definition where code = 'fence_breach_present'), true,
       'field_question', 'summer-v0.2', 'staff', 'e5000000-0000-4000-8000-000000000001',
       '2027-08-05 06:10:00+00') $$,
  'field staff records the fence answer on the parcel');
select throws_ok(
  $$ insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('e5100000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001',
       (select id from public.tree where parcel_id = 'c0000000-0000-4000-8000-000000000001'
          and status = 'active' order by id limit 1),
       (select id from public.metric_definition where code = 'fence_breach_present'), true,
       'field_question', 'summer-v0.2', 'staff', 'e5000000-0000-4000-8000-000000000001',
       '2027-08-05 06:10:00+00') $$,
  '23514', null, 'the fence answer cannot be put on a tree');
select lives_ok(
  $$ insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('e5100000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001',
       (select id from public.tree where parcel_id = 'c0000000-0000-4000-8000-000000000001'
          and status = 'active' order by id limit 1),
       (select id from public.metric_definition where code = 'early_emptied_cluster_present'), false,
       'field_question', 'summer-v0.2', 'staff', 'e5000000-0000-4000-8000-000000000001',
       '2027-08-05 06:12:00+00') $$,
  'field staff records the emptied cluster answer on a tree');

select * from finish();
rollback;
