-- Shared demo host (docs/demo-turu.md §15.1): while the test project hosts the
-- public demo, an enabled demo org sits next to the test site's real orgs,
-- staff and self-service customers. The demo must not reach them: a visitor
-- sees only the demo parcels, demo_start refuses any other account, and
-- cleanup (demo_expired_accounts) never names a user without the demo flag,
-- nor a flagged one with a membership, whatever demo_session says.
-- Seed: owner a0..01, viewer a0..02, field a0..03, expert a0..04, ops a0..05
-- of org b0..01, self-service customer a0..06.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select testing.reset_to_seed();

create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
grant execute on all functions in schema pg_temp to authenticated;

-- The test project's people before the demo arrives: every account without the
-- demo flag (visitor accounts other suites left behind are not theirs).
create temp table seed_user as
  select id from auth.users where coalesce(raw_app_meta_data ->> 'demo', '') <> 'true';
create temp table seed_access as
  select 'm' as kind, user_id, org_id, null::uuid as parcel_id, role::text from public.membership
  union all
  select 'p', user_id, org_id, parcel_id, role::text from public.parcel_access;
grant select on seed_user, seed_access to authenticated;

-- Fixtures: an enabled demo org with one parcel, a visitor -------------------------------

insert into public.org (id, name, kind) values ('d1400000-0000-4000-8000-000000000001', 'pgTAP shared demo', 'other');
insert into public.parcel (id, org_id, name) values
  ('d1410000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000001', 'Demo Ortak');
insert into private.demo_org (org_id, enabled, loaded_at) values ('d1400000-0000-4000-8000-000000000001', true, now());
insert into private.demo_parcel (parcel_id, org_id) values
  ('d1410000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000001');
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd14a0000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'ziyaretci-shared@demo.orchados.invalid', '{"demo": true}', '{}', now(), now());

select ok(not private.is_demo_org('b0000000-0000-4000-8000-000000000001'), 'the test site''s org is not a demo org');

select throws_ok($$ select public.demo_start('a0000000-0000-4000-8000-000000000001', 'h') $$,
  '22023', 'not_demo_account', 'demo_start refuses a test site owner');
select throws_ok($$ select public.demo_start('a0000000-0000-4000-8000-000000000006', 'h') $$,
  '22023', 'not_demo_account', 'demo_start refuses a self-service customer');
select lives_ok($$ select public.demo_start('d14a0000-0000-4000-8000-000000000001', 'h') $$, 'a visitor starts');

-- What the visitor reaches ------------------------------------------------------------------

select pg_temp.as_demo('d14a0000-0000-4000-8000-000000000001');
set local role authenticated;
select results_eq($$ select id from public.parcel order by id $$,
  $$ values ('d1410000-0000-4000-8000-000000000001'::uuid) $$, 'the visitor sees the demo parcel only');
select is((select count(*)::int from public.org where id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'the visitor does not see the test site''s org');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from (
     select 'm' as kind, user_id, org_id, null::uuid, role::text from public.membership
     union all
     select 'p', user_id, org_id, parcel_id, role::text from public.parcel_access) now_access
   where user_id in (select id from seed_user)),
  (select count(*)::int from seed_access where user_id in (select id from seed_user)),
  'the test site''s memberships and parcel access are unchanged');

-- Cleanup ------------------------------------------------------------------------------------

-- The worst case: every seed user carries an expired demo session and is old
-- enough to be an orphan; one staff member even carries the demo flag. A
-- look-alike account (visitor e-mail, no flag) is old and has no session.
set local session_replication_role = replica;
insert into private.demo_session (user_id, org_id, ip_hash, expires_at)
select id, 'd1400000-0000-4000-8000-000000000001', 'h', now() - interval '1 hour' from seed_user;
update auth.users set created_at = now() - interval '2 days' where id in (select id from seed_user);
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"demo": true}'
where id = 'a0000000-0000-4000-8000-000000000005';
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd14b0000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'ziyaretci-lookalike@demo.orchados.invalid', '{}', '{}', now() - interval '2 days', now());
update private.demo_session set expires_at = now() - interval '1 minute'
where user_id = 'd14a0000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

select ok('d14a0000-0000-4000-8000-000000000001'::uuid in (select public.demo_expired_accounts(2147483647, '{}')),
  'cleanup names the expired visitor');
select is(
  (select count(*)::int from public.demo_expired_accounts(2147483647, '{}') e
   where e in (select id from seed_user) or e = 'd14b0000-0000-4000-8000-000000000001'),
  0, 'no seed user and no unflagged look-alike is ever deletable');
select ok(
  'a0000000-0000-4000-8000-000000000005'::uuid not in (select public.demo_expired_accounts(2147483647, '{}')),
  'a flagged staff member with a membership is kept');
select ok('a0000000-0000-4000-8000-000000000005'::uuid in (
    select u.id from auth.users u
    where u.id not in (select public.demo_expired_accounts(2147483647, '{}'))
      and exists (select 1 from private.demo_session s where s.user_id = u.id and s.expires_at <= now())
      and u.raw_app_meta_data ->> 'demo' = 'true'),
  'the flagged staff member is among the due accounts the rules keep');
select ok(public.demo_undeletable_count() >= 1, 'demo_undeletable_count reports it for a human to look at');

select * from finish();
rollback;
