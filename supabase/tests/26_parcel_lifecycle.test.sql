-- Parcel life cycle (20261024120000_parcel_lifecycle): the first published
-- periodic scan makes an inventoried parcel active_monitoring; ops sets a
-- parcel passive (only without planned visits) and resumes it; a passive
-- parcel gets no new visit.
-- Seed: owner a0..01, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01 (inventory_done).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

create function pg_temp.status() returns text language sql
as $$ select status::text from public.parcel where id = 'c0000000-0000-4000-8000-000000000001' $$;

select has_function('public', 'ops_set_parcel_passive', array['uuid', 'boolean'], 'ops_set_parcel_passive exists');

-- An unpublished scan changes nothing; publishing the first one does.
insert into public.session (id, org_id, parcel_id, kind, status, planned_date)
values ('e2600000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'processed', '2026-12-10');
select is(pg_temp.status(), 'inventory_done', 'a processed scan leaves the parcel inventory_done');
update public.session set status = 'published' where id = 'e2600000-0000-4000-8000-000000000001';
select is(pg_temp.status(), 'active_monitoring', 'the first published scan starts active monitoring');

-- A parcel that is still being registered is not lifted by a published scan.
insert into public.org (id, name) values ('f1000000-0000-4000-8000-000000000026', 'Lifecycle org');
insert into public.parcel (id, org_id, name, status)
values ('f2000000-0000-4000-8000-000000000026', 'f1000000-0000-4000-8000-000000000026', 'Lifecycle parcel', 'registered');
insert into public.session (org_id, parcel_id, kind, status, planned_date)
values ('f1000000-0000-4000-8000-000000000026', 'f2000000-0000-4000-8000-000000000026', 'periodic_scan', 'published', '2026-12-10');
select is((select status::text from public.parcel where id = 'f2000000-0000-4000-8000-000000000026'),
          'registered', 'only an inventoried parcel moves to active monitoring');

set local role authenticated;

-- Ops: passive needs the planned visits cancelled first.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into public.session (id, org_id, parcel_id, kind, status, planned_date)
values ('e2600000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2027-02-20');
select throws_ok(
  $$ select public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', true) $$,
  'P0001', 'has_planned_visits', 'a parcel with a planned visit cannot go passive');
update public.session set status = 'cancelled' where id = 'e2600000-0000-4000-8000-000000000002';
select is(public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', true)::text, 'passive',
          'ops sets the parcel passive');
select is(public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', true)::text, 'passive',
          'setting it passive again changes nothing');
select throws_ok(
  $$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'periodic_scan', 'planned', '2027-03-01') $$,
  'P0001', 'parcel_passive', 'no new visit on a passive parcel');
select lives_ok(
  $$ insert into public.session (org_id, parcel_id, kind, status, started_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'manual_entry', 'captured', now()) $$,
  'other sessions (manual entry) are still allowed');

-- Other roles.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', false) $$,
  '42501', 'forbidden', 'an expert cannot resume a parcel');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', false) $$,
  'P0002', 'not_found', 'the owner cannot change the life cycle');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.ops_set_parcel_passive('f2000000-0000-4000-8000-000000000026', true) $$,
  'P0002', 'not_found', 'a parcel of another org is not found');

-- Resume: back to the step the visits show.
select is(public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', false)::text,
          'active_monitoring', 'resuming a parcel with a published scan returns to active monitoring');
select is(pg_temp.status(), 'active_monitoring', 'the status is stored');
select lives_ok(
  $$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'periodic_scan', 'planned', '2027-03-01') $$,
  'visits can be planned again');

select * from finish();
rollback;
