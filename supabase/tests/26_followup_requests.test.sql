-- Follow-up requests and the close-up list (20261024120200_followup_requests):
-- the expert asks for a close-up, a verification or an extra visit; ops plans
-- them; close-ups are fulfilled by the next visit's photo; closeup_list joins
-- the previous class, a stratified sample, the crew's "problem seen" and the
-- expert's requests.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01 (302 active trees on 136 x 144 m).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.reasons(p_session text, p_code text) returns text[] language sql
as $$ select reasons from public.closeup_list(p_session::uuid) where slot_code = p_code $$;

-- Previous visit (published, expert classes), the visit under review and the next one.
insert into public.session (id, org_id, parcel_id, kind, status, planned_date, started_at) values
  ('e2620000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-12-10', '2026-12-10 08:00+00'),
  ('e2620000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2027-04-20', null),
  ('e2620000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2027-04-21', null);
insert into public.assessment (org_id, parcel_id, session_id, tree_id, source, overall_class, assessed_by)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e2620000-0000-4000-8000-000000000001', pg_temp.tree(v.code), 'expert', v.cls::public.health_class,
       'a0000000-0000-4000-8000-000000000004'
from (values ('S1-1', 'attention'), ('S1-2', 'problem'), ('S1-3', 'dead'), ('S1-4', 'healthy')) as v (code, cls);
update public.session set status = 'published' where id = 'e2620000-0000-4000-8000-000000000001';

select has_table('public', 'followup_request', 'followup_request exists');
select has_function('public', 'closeup_list', array['uuid'], 'closeup_list exists');

set local role authenticated;

-- Close-up list without requests.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select ok('previous_class' = any (pg_temp.reasons('e2620000-0000-4000-8000-000000000002', 'S1-1')),
          'attention in the previous visit: on the list');
select ok('previous_class' = any (pg_temp.reasons('e2620000-0000-4000-8000-000000000002', 'S1-2')),
          'problem in the previous visit: on the list');
select ok('previous_class' = any (pg_temp.reasons('e2620000-0000-4000-8000-000000000002', 'S1-3')),
          'dead in the previous visit: on the list');
select ok(not coalesce('previous_class' = any (pg_temp.reasons('e2620000-0000-4000-8000-000000000002', 'S1-4')), false),
          'healthy in the previous visit: not for that reason');
select is(
  (select count(*)::int from public.closeup_list('e2620000-0000-4000-8000-000000000002') where 'sample' = any (reasons)),
  31, 'the sample is 10% of the 302 active trees, rounded up');
select is(
  (select count(*)::int from (
     select 1 from public.closeup_list('e2620000-0000-4000-8000-000000000002') c
     join public.slot sl on sl.id = c.slot_id where 'sample' = any (c.reasons) and sl.position is not null) x),
  31, 'every sampled tree has a position');
select is(
  (select array_agg(slot_code order by slot_code) from public.closeup_list('e2620000-0000-4000-8000-000000000002')
   where 'sample' = any (reasons)),
  (select array_agg(slot_code order by slot_code) from public.closeup_list('e2620000-0000-4000-8000-000000000002')
   where 'sample' = any (reasons)),
  'the same visit gives the same sample');
select isnt(
  (select array_agg(slot_code order by slot_code) from public.closeup_list('e2620000-0000-4000-8000-000000000002')
   where 'sample' = any (reasons)),
  (select array_agg(slot_code order by slot_code) from public.closeup_list('e2620000-0000-4000-8000-000000000003')
   where 'sample' = any (reasons)),
  'another visit draws another sample');
-- Stratified: no two sampled trees in one 10 x 10 m cell while cells are left.
select is(
  (select count(*)::int from (
     select floor((extensions.st_x(sl.position) - b.west) * pi() / 180 * 6371008.8 * cos(radians(b.south)) / 10) as cx,
            floor((extensions.st_y(sl.position) - b.south) * pi() / 180 * 6371008.8 / 10) as cy
     from public.closeup_list('e2620000-0000-4000-8000-000000000002') c
     join public.slot sl on sl.id = c.slot_id
     cross join (select extensions.st_xmin(geom) as west, extensions.st_ymin(geom) as south from public.boundary
                 where parcel_id = 'c0000000-0000-4000-8000-000000000001' order by version desc limit 1) b
     where 'sample' = any (c.reasons)
     group by 1, 2 having count(*) > 1) d),
  0, 'the sample takes one tree per cell');

-- Owner: no list.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.closeup_list('e2620000-0000-4000-8000-000000000002') $$,
  '42501', 'forbidden', 'the owner cannot read the close-up list');

-- Expert requests.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select isa_ok(
  public.request_followup('e2620000-0000-4000-8000-000000000001', 'closeup', pg_temp.tree('S2-2'), 'Gövdeye bakılsın'),
  'uuid', 'the expert asks for a close-up of a tree');
select is(
  public.request_followup('e2620000-0000-4000-8000-000000000001', 'closeup', pg_temp.tree('S2-2'), 'Dibe de'),
  (select id from public.followup_request where tree_id = pg_temp.tree('S2-2')),
  'asking again returns the open request');
select is((select note from public.followup_request where tree_id = pg_temp.tree('S2-2')),
          E'Gövdeye bakılsın\nDibe de', 'and appends the note');
select throws_ok(
  $$ select public.request_followup('e2620000-0000-4000-8000-000000000001', 'extra_visit') $$,
  '22023', 'invalid_input', 'an extra visit needs a note');
select isa_ok(
  public.request_followup('e2620000-0000-4000-8000-000000000001', 'extra_visit', null, 'Kuzey köşede sulama arızası'),
  'uuid', 'the expert asks for an extra visit');
select isa_ok(
  public.request_followup('e2620000-0000-4000-8000-000000000001', 'verification', pg_temp.tree('S3-3'), 'Ağaç var mı?'),
  'uuid', 'the expert asks for a verification of a tree');
select throws_ok(
  $$ insert into public.followup_request (org_id, parcel_id, source_session_id, kind, note)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'e2620000-0000-4000-8000-000000000001', 'extra_visit', 'x') $$,
  '42501', null, 'no direct writes');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select ok('expert_request' = any (pg_temp.reasons('e2620000-0000-4000-8000-000000000002', 'S2-2')),
          'the requested tree is on the next visit''s list');
select throws_ok(
  $$ select public.request_followup('e2620000-0000-4000-8000-000000000001', 'closeup', md5('orchados-seed:tree:S4-4')::uuid) $$,
  '42501', 'forbidden', 'field staff cannot make requests');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.followup_request), 0, 'the owner sees no requests');

-- Crew "problem seen" on the visit.
reset role;
insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_boolean, method, method_version,
                                source, session_id, measured_at)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S5-5'),
       id, true, 'field_question', 'q-v0', 'staff', 'e2620000-0000-4000-8000-000000000002', now()
from public.metric_definition where code = 'problem_seen';
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select ok('staff_problem' = any (pg_temp.reasons('e2620000-0000-4000-8000-000000000002', 'S5-5')),
          'a tree the crew marked is on the list');

-- Ops plans the verification and the extra visit.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into public.session (id, org_id, parcel_id, kind, status, planned_date)
values ('e2620000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'verification', 'planned', '2027-01-05');
select throws_ok(
  $$ select public.ops_plan_followups(array(select id from public.followup_request where kind = 'verification'),
                                      'e2620000-0000-4000-8000-000000000002') $$,
  '22023', 'invalid_input', 'a verification request needs a verification visit');
select throws_ok(
  $$ select public.ops_plan_followups(array(select id from public.followup_request where kind = 'closeup'),
                                      'e2620000-0000-4000-8000-000000000004') $$,
  '22023', 'invalid_input', 'close-up requests are not planned');
select is(
  public.ops_plan_followups(array(select id from public.followup_request where kind <> 'closeup'),
                            'e2620000-0000-4000-8000-000000000004'),
  2, 'ops links the verification and the extra visit to a verification tour');
select is(
  (select array[reasons::text, note] from public.verification_item
   where session_id = 'e2620000-0000-4000-8000-000000000004' and tree_id = pg_temp.tree('S3-3')),
  array['{other}', 'Ağaç var mı?'], 'the tree became an item of the tour with the note');

-- Done: the tour is captured; a close-up of the tree arrives on the next scan.
update public.session set status = 'captured', started_at = now() where id = 'e2620000-0000-4000-8000-000000000004';
select is(
  (select array_agg(status::text order by kind) from public.followup_request where kind <> 'closeup'),
  array['done', 'done'], 'a captured visit fulfils its requests');
reset role;
insert into public.capture (org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, started_at)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'e2620000-0000-4000-8000-000000000002', 'photo', pg_temp.tree('S2-2'),
        'storage://media/x', repeat('2', 64), now());
select is(
  (select row(status, target_session_id)::text from public.followup_request where kind = 'closeup'),
  row('done'::public.followup_status, 'e2620000-0000-4000-8000-000000000002'::uuid)::text,
  'a close-up photo of the tree on a later visit fulfils the close-up request');

-- Cancel.
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.cancel_followup(
       public.request_followup('e2620000-0000-4000-8000-000000000001', 'closeup', md5('orchados-seed:tree:S6-6')::uuid)) $$,
  'the expert withdraws a request');
select throws_ok(
  $$ select public.cancel_followup((select id from public.followup_request where tree_id = md5('orchados-seed:tree:S6-6')::uuid)) $$,
  'P0002', 'not_found', 'a withdrawn request cannot be withdrawn again');

select * from finish();
rollback;
