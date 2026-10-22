-- Row level security per role. Seed users:
--   owner  a0..01   viewer a0..02   field_staff a0..03   expert a0..04   ops a0..05
-- Seed org b0..01 with parcel c0..01 (303 tree rows), session e0..01.
-- Fixtures below add: a second owner with a second parcel in the same org, and a
-- second org with its own parcel that nobody from the seed may see.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

-- Fixtures (as postgres) -----------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'other-owner@example.com');

insert into public.parcel (id, org_id, name)
values ('f2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Other owner parcel');
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002',
        'f0000000-0000-4000-8000-000000000001', 'owner');
insert into public.slot (id, org_id, parcel_id, row_no, position_no)
values ('f3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'f2000000-0000-4000-8000-000000000002', 1, 1);
insert into public.tree (org_id, parcel_id, slot_id)
values ('b0000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002',
        'f3000000-0000-4000-8000-000000000001');

insert into public.org (id, name) values ('f1000000-0000-4000-8000-000000000001', 'Second org');
insert into public.parcel (id, org_id, name)
values ('f2000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'Second org parcel');
insert into public.session (id, org_id, parcel_id, kind)
values ('f5000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001',
        'f2000000-0000-4000-8000-000000000003', 'periodic_scan');

insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, uncertainty,
  method, method_version, source, session_id, measured_at)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 24.5, 0.3,
        'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', '2026-10-10 07:10:00+00');

-- Owner ----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select results_eq($$ select id from public.parcel $$,
  array['c0000000-0000-4000-8000-000000000001'::uuid], 'owner sees only their own parcel');
select results_eq($$ select count(*) from public.tree $$, array[303::bigint], 'owner sees all trees of their parcel');
select results_eq($$ select count(*) from public.slot $$, array[310::bigint], 'owner sees all slots of their parcel');
-- The seed session is in_review; its results stay hidden until it is published (04_publication).
select is_empty($$ select id from public.measurement $$, 'owner does not see measurements of an unpublished session');
select results_eq($$ select count(*) from public.session $$, array[1::bigint], 'owner sees sessions of their parcel');
select results_eq($$ select count(*) from public.org $$, array[1::bigint], 'owner sees the org of their parcel');
select is_empty($$ select id from public.device $$, 'owner does not see the org kit');
select is_empty($$ select id from public.membership $$, 'owner does not see org memberships');
select throws_ok(
  $$ insert into public.tree (org_id, parcel_id, slot_id)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:slot:S2-7')::uuid) $$,
  '42501', null, 'owner cannot write trees');
select lives_ok(
  $$ insert into public.parcel_access (org_id, parcel_id, user_id, role)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'f0000000-0000-4000-8000-000000000001', 'viewer') $$,
  'owner can add a viewer to their parcel');
select throws_ok(
  $$ insert into public.parcel_access (org_id, parcel_id, user_id, role)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000003', 'owner') $$,
  '42501', null, 'owner cannot grant the owner role');
select lives_ok($$ select public.approve_boundary('c1000000-0000-4000-8000-000000000001') $$,
  'owner can approve a boundary version of their parcel');
select results_eq($$ select full_name from public.my_owner_profile() $$, array['Örnek Sahip'],
  'owner reads their own profile through my_owner_profile()');

-- Undo the viewer grant so the other-owner checks below are clean.
reset role;
delete from public.parcel_access where user_id = 'f0000000-0000-4000-8000-000000000001' and role = 'viewer';

-- Owner of another parcel -------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "f0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select results_eq($$ select id from public.parcel $$,
  array['f2000000-0000-4000-8000-000000000002'::uuid], 'other owner sees only their own parcel');
select is_empty($$ select id from public.tree where parcel_id = 'c0000000-0000-4000-8000-000000000001' $$,
  'other owner sees no trees of the seed parcel');
select is_empty($$ select id from public.measurement $$, 'other owner sees no measurements of the seed parcel');
select is_empty($$ select id from public.boundary $$, 'other owner sees no boundary of the seed parcel');
select is_empty($$ select * from public.my_owner_profile() $$, 'other owner cannot read someone else''s profile');

-- Viewer ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

select results_eq($$ select count(*) from public.tree $$, array[303::bigint], 'viewer reads the trees of the parcel');
select is_empty(
  $$ update public.tree set cultivar = 'changed' where parcel_id = 'c0000000-0000-4000-8000-000000000001' returning id $$,
  'viewer cannot update trees');
select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, uncertainty,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-2')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 20, 0.3,
       'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '42501', null, 'viewer cannot insert measurements');
select throws_ok(
  $$ insert into public.parcel_access (org_id, parcel_id, user_id, role)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'f0000000-0000-4000-8000-000000000001', 'viewer') $$,
  '42501', null, 'viewer cannot add other viewers');
select throws_ok($$ select public.approve_boundary('c1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'viewer cannot approve a boundary');

-- Expert ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated"}', true);

select set_eq($$ select id from public.parcel $$,
  array['c0000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002']::uuid[],
  'expert sees every parcel of their org and none of other orgs');
select results_eq($$ select count(*) from public.tree $$, array[304::bigint], 'expert sees trees of all org parcels');
select lives_ok(
  $$ insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001', md5('orchados-seed:tree:S1-1')::uuid, 'expert', 'attention') $$,
  'expert can insert an assessment');
select lives_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale, uncertainty,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:dead_branch_scale')::uuid, 2, 0,
       'expert_review', '1', 'expert', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  'expert can insert an expert measurement');
select throws_ok(
  $$ insert into public.assessment (org_id, parcel_id, session_id, source, overall_class)
     values ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000003',
       'f5000000-0000-4000-8000-000000000003', 'expert', 'healthy') $$,
  '42501', null, 'expert cannot write into another org');
select throws_ok(
  $$ insert into public.capture (org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001', 'photo', 'x', encode(sha256('expert-photo'::bytea), 'hex'), now()) $$,
  '42501', null, 'expert cannot insert raw captures');

-- Field staff -----------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);

select results_eq($$ select count(*) from public.parcel $$, array[2::bigint], 'field staff sees every parcel of their org');
select lives_ok(
  $$ insert into public.capture (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, started_at)
     values ('98000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'photo',
       md5('orchados-seed:tree:S1-1')::uuid, 'storage://media/closeup.jpg',
       encode(sha256('closeup-1'::bytea), 'hex'), now()) $$,
  'field staff can insert a capture');
select lives_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale, uncertainty,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:dead_branch_scale')::uuid, 1, 0.5,
       'staff_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  'field staff can insert a staff measurement');
select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale, uncertainty,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:dead_branch_scale')::uuid, 1, 0.5,
       'expert_review', '1', 'expert', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '42501', null, 'field staff cannot insert a measurement claiming expert source');
select throws_ok(
  $$ insert into public.assessment (org_id, parcel_id, session_id, source, overall_class, model_name, model_version)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001', 'ai', 'healthy', 'vlm', '1') $$,
  '42501', null, 'field staff cannot insert assessments');
select throws_ok(
  $$ update public.measurement set uncertainty = 0 where parcel_id = 'c0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'field staff cannot update measurements (no UPDATE privilege)');
select throws_ok(
  $$ delete from public.capture where id = '98000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'field staff cannot delete captures (no DELETE privilege)');

-- Ops ------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated"}', true);

select results_eq($$ select count(*) from public.membership $$, array[3::bigint], 'ops sees all memberships of the org');
select lives_ok(
  $$ insert into public.parcel (org_id, name) values ('b0000000-0000-4000-8000-000000000001', 'New parcel') $$,
  'ops can register a parcel');
select throws_ok(
  $$ insert into public.parcel (org_id, name) values ('f1000000-0000-4000-8000-000000000001', 'Foreign parcel') $$,
  '42501', null, 'ops cannot register a parcel in another org');

-- Private schema and anon ---------------------------------------------------------------

select throws_ok($$ select * from private.owner_profile $$, '42501', null,
  'authenticated cannot read private.owner_profile');
select throws_ok($$ select * from private.parcel_detail $$, '42501', null,
  'authenticated cannot read private.parcel_detail');

reset role;
set local role anon;

select throws_ok($$ select * from public.tree $$, '42501', null, 'anon cannot read trees');
select throws_ok($$ select * from private.owner_profile $$, '42501', null, 'anon cannot read private data');
select throws_ok($$ select * from public.my_owner_profile() $$, '42501', null, 'anon cannot call my_owner_profile()');

reset role;
set local role service_role;

select results_eq($$ select count(*) from private.owner_profile $$, array[2::bigint],
  'service_role (backend) reads private data');

reset role;

select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE')
  and not has_schema_privilege('anon', 'private', 'USAGE'),
  'API roles have no USAGE on the private schema');

select * from finish();
rollback;
