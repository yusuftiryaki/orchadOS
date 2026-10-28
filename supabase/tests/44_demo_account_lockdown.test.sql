-- Demo account lockdown (20261101120200_demo_account_lockdown): the account
-- freeze on auth.users, the account scope guards (for every caller, postgres
-- included), lookups that never return a demo account, the final
-- housekeeping steps and the demo-media bucket.
-- Seed: owner a0..01, ops a0..05 of org b0..01, parcel c0..01, sign-up org b0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
create function pg_temp.visitor(p_id uuid, p_email text, p_meta jsonb default '{"demo": true}')
returns void language sql
as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_change, phone_change,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '', '', '',
          p_meta, '{"email_verified": true}', now(), now());
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

insert into public.org (id, name, kind) values ('d1300000-0000-4000-8000-000000000021', 'pgTAP demo 44', 'other');
insert into public.parcel (id, org_id, name)
values ('d1310000-0000-4000-8000-000000000021', 'd1300000-0000-4000-8000-000000000021', 'Demo 44');
insert into private.demo_org (org_id, enabled, loaded_at) values ('d1300000-0000-4000-8000-000000000021', true, now());
insert into private.demo_parcel (parcel_id, org_id)
values ('d1310000-0000-4000-8000-000000000021', 'd1300000-0000-4000-8000-000000000021');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000021', 'ziyaretci-44a@demo.orchados.invalid');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000022', 'ziyaretci-44b@demo.orchados.invalid');
select pg_temp.visitor('d13c0000-0000-4000-8000-000000000021', 'pgtap-real-44@example.test', '{}');

-- (a) Account freeze ------------------------------------------------------------------------

select has_trigger('auth', 'users', 'demo_account_freeze', 'the freeze trigger is installed locally');
select throws_ok($$ update auth.users set email = 'x44@example.test' where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  '42501', 'demo_account_locked', 'the e-mail of a demo account does not change');
select throws_ok($$ update auth.users set phone = '905550044001' where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  '42501', 'demo_account_locked', 'nor its phone');
select throws_ok($$ update auth.users set phone_change = '905550044001' where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  '42501', 'demo_account_locked', 'nor a pending phone change');
select throws_ok($$ update auth.users set email_change = 'x44@example.test' where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  '42501', 'demo_account_locked', 'nor a pending e-mail change');
select throws_ok($$ update auth.users set encrypted_password = '$2a$10$abc' where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  '42501', 'demo_account_locked', 'nor its password');
select throws_ok(
  $$ update auth.users set raw_user_meta_data = raw_user_meta_data || '{"x": 1}' where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  '42501', 'demo_account_locked', 'nor its user metadata');
select lives_ok($$ update auth.users set last_sign_in_at = now(), confirmation_token = 'tok'
                   where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  'sign-in and token columns change');
select lives_ok(
  $$ update auth.users set raw_user_meta_data = '{"email_verified": false, "sub": "s", "email": "e"}'
     where id = 'd13a0000-0000-4000-8000-000000000021' $$,
  'GoTrue''s own metadata keys change');
select lives_ok($$ update auth.users set email = 'other-44@example.test', phone = '905550044002',
                   raw_user_meta_data = '{"x": 1}' where id = 'd13c0000-0000-4000-8000-000000000021' $$,
  'other accounts are unaffected');
select lives_ok($$ delete from auth.users where id = 'd13a0000-0000-4000-8000-000000000022' $$,
  'a demo account can be deleted');

-- (b) Account scope (as postgres, no claims) --------------------------------------------------

select throws_ok(
  $$ insert into public.parcel_access (org_id, parcel_id, user_id, role) values
       ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'd13a0000-0000-4000-8000-000000000021', 'viewer') $$,
  '42501', 'demo_account_scope', 'a demo account gets no access to a real org''s parcel');
select lives_ok(
  $$ insert into public.parcel_access (org_id, parcel_id, user_id, role) values
       ('d1300000-0000-4000-8000-000000000021', 'd1310000-0000-4000-8000-000000000021',
        'd13a0000-0000-4000-8000-000000000021', 'owner') $$,
  'access to a demo org''s parcel is allowed');
select throws_ok(
  $$ update public.parcel_access set user_id = 'd13a0000-0000-4000-8000-000000000021'
     where parcel_id = 'c0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', 'demo_account_scope', 'an existing real access row cannot be moved to a demo account');
select throws_ok(
  $$ insert into public.membership (org_id, user_id, role)
     values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000021', 'ops') $$,
  '42501', 'demo_account_scope', 'no membership');
select throws_ok(
  $$ insert into public.membership (org_id, user_id, role)
     values ('d1300000-0000-4000-8000-000000000021', 'd13a0000-0000-4000-8000-000000000021', 'ops') $$,
  '42501', 'demo_account_scope', 'not even in the demo org');
select throws_ok(
  $$ insert into private.owner_profile (org_id, user_id, full_name)
     values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000021', 'Ad') $$,
  '42501', 'demo_account_scope', 'no owner profile');
select throws_ok(
  $$ insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
     values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000021', 'individual',
             'Ad', 'Soyad', 'Adres', 'Gaziantep') $$,
  '42501', 'demo_account_scope', 'no billing profile');
select throws_ok(
  $$ insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
     values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000021',
             'd13a0000-0000-4000-8000-000000000021', 'kvkk_notice', true, 'v1', 'signup') $$,
  '42501', 'demo_account_scope', 'no consent record');
select throws_ok(
  $$ insert into private.customer_signup (user_id, org_id, full_name, email, phone, contact_preference, consents)
     values ('d13a0000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001', 'Ad',
             'ziyaretci-44a@demo.orchados.invalid', '+905550044003', 'sms', '{}') $$,
  '42501', 'demo_account_scope', 'no pending sign-up');
select throws_ok(
  $$ insert into public.service_application (org_id, customer_user_id)
     values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000021') $$,
  '42501', 'demo_account_scope', 'no billing row');
select set_config('role', 'service_role', true);
select throws_ok(
  $$ insert into public.membership (org_id, user_id, role)
     values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000021', 'ops') $$,
  '42501', 'demo_account_scope', 'the service role is refused too');
reset role;
select lives_ok(
  $$ insert into public.membership (org_id, user_id, role)
     values ('b0000000-0000-4000-8000-000000000001', 'd13c0000-0000-4000-8000-000000000021', 'field_staff') $$,
  'real accounts are unaffected');
select is(
  (select array_agg(tgrelid::regclass::text order by tgrelid::regclass::text) from pg_trigger where tgname like 'demo\_account\_scope\_%'),
  array['application_garden', 'garden_removal', 'membership', 'notification', 'parcel_access', 'payment', 'payment_item',
        'private.billing_profile', 'private.consent_record', 'private.consent_record', 'private.contract_document',
        'private.customer_signup', 'private.kvkk_request',
        'private.owner_profile', 'private.staff_profile', 'private.viewer_invitation',
        'private.visit_reconciliation', 'quote', 'quote_item', 'refund',
        'service_application', 'service_order', 'service_order_item'],
  'the tables with an account scope guard');

-- (c) Lookups -------------------------------------------------------------------------------

-- A confirmed phone on a demo account, as if the freeze were missing.
set local session_replication_role = replica;
update auth.users set phone = '905550044010', phone_confirmed_at = now()
where id = 'd13a0000-0000-4000-8000-000000000021';
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null, '+905550044010'), null,
  'ops_find_user_id: no demo account by confirmed phone');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'ziyaretci-44a@demo.orchados.invalid'), null,
  'nor by e-mail');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'other-44@example.test'),
  'd13c0000-0000-4000-8000-000000000021'::uuid, 'real accounts are still found');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.signup_find_account('ziyaretci-44a@demo.orchados.invalid', '+905550044010')), 0,
  'signup_find_account: no demo account by e-mail or phone');
select is((select count(*)::int from public.signup_find_account('other-44@example.test', null)), 1,
  'real accounts are still found');

-- (e) Housekeeping steps 2-4 -------------------------------------------------------------------

select pg_temp.visitor('d13a0000-0000-4000-8000-000000000023', 'ziyaretci-44c@demo.orchados.invalid');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000024', 'ziyaretci-44d@demo.orchados.invalid');
insert into private.demo_session (user_id, org_id, ip_hash, expires_at) values
  ('d13a0000-0000-4000-8000-000000000021', 'd1300000-0000-4000-8000-000000000021', 'h', now() + interval '1 hour'),
  ('d13a0000-0000-4000-8000-000000000023', 'd1300000-0000-4000-8000-000000000021', 'h', now() + interval '1 hour'),
  ('d13a0000-0000-4000-8000-000000000024', 'd1300000-0000-4000-8000-000000000021', 'h', now() + interval '1 hour');
insert into public.parcel_access (org_id, parcel_id, user_id, role) values
  ('d1300000-0000-4000-8000-000000000021', 'd1310000-0000-4000-8000-000000000021',
   'd13a0000-0000-4000-8000-000000000023', 'owner'),
  ('d1300000-0000-4000-8000-000000000021', 'd1310000-0000-4000-8000-000000000021',
   'd13a0000-0000-4000-8000-000000000024', 'owner');
-- As if the guards were missing: real access for 23, a password for 24.
set local session_replication_role = replica;
insert into public.parcel_access (org_id, parcel_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'd13a0000-0000-4000-8000-000000000023', 'viewer');
update auth.users set encrypted_password = '$2a$10$known' where id = 'd13a0000-0000-4000-8000-000000000024';
set local session_replication_role = origin;
-- Personas: one left open by a loader run two hours ago, one being loaded now.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd13f0000-0000-4000-8000-000000000021', 'authenticated', 'authenticated',
        'pgtap-persona-44a@demo.orchados.invalid', '$2a$10$tmp', '{"demo_persona": true}', now(), now() - interval '2 hours'),
       ('00000000-0000-0000-0000-000000000000', 'd13f0000-0000-4000-8000-000000000022', 'authenticated', 'authenticated',
        'pgtap-persona-44b@demo.orchados.invalid', '$2a$10$tmp', '{"demo_persona": true}', now(), now());

select lives_ok($$ select private.demo_housekeeping() $$, 'housekeeping runs');
select is((select count(*)::int from public.parcel_access where user_id = 'd13a0000-0000-4000-8000-000000000023'
           and org_id = 'b0000000-0000-4000-8000-000000000001'), 0,
  'step 2: a demo account''s access outside demo orgs is removed');
select is((select count(*)::int from public.parcel_access where user_id = 'd13a0000-0000-4000-8000-000000000023'), 1,
  'its demo access stays (its details are unchanged)');
select is((select expires_at from private.demo_session where user_id = 'd13a0000-0000-4000-8000-000000000021'), now(),
  'step 3: the account with a phone has its session ended');
select is((select expires_at from private.demo_session where user_id = 'd13a0000-0000-4000-8000-000000000024'), now(),
  'step 3: so has the account with a password');
select is((select count(*)::int from public.parcel_access
           where user_id in ('d13a0000-0000-4000-8000-000000000021', 'd13a0000-0000-4000-8000-000000000024')), 0,
  'step 3: and their access is gone');
select ok((select expires_at > now() from private.demo_session where user_id = 'd13a0000-0000-4000-8000-000000000023'),
  'an unchanged account keeps its session');
select is((select array[banned_until::text, encrypted_password] from auth.users where id = 'd13f0000-0000-4000-8000-000000000021'),
  array['2999-01-01 00:00:00+00', ''], 'step 4: a persona left open is banned again, without a password');
select is((select banned_until from auth.users where id = 'd13f0000-0000-4000-8000-000000000022'), null,
  'step 4: a persona updated within the hour is left to the loader');

-- (d) demo-media ---------------------------------------------------------------------------------

select is((select public from storage.buckets where id = 'demo-media'), true, 'demo-media is a public bucket');
-- An ops person of the demo org (the loader's persona).
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd13f0000-0000-4000-8000-000000000025', 'authenticated', 'authenticated',
        'pgtap-ops-44@demo.orchados.invalid', now(), now());
insert into public.membership (org_id, user_id, role)
values ('d1300000-0000-4000-8000-000000000021', 'd13f0000-0000-4000-8000-000000000025', 'ops');
create function pg_temp.demo_obj(p_org text, p_tag text) returns text language sql immutable
as $$ select 'org/' || p_org || '/parcel/d1310000-0000-4000-8000-000000000021/' || encode(sha256(p_tag::bytea), 'hex') $$;
grant execute on function pg_temp.demo_obj(text, text) to authenticated;

set local role authenticated;
select pg_temp.as_user('d13f0000-0000-4000-8000-000000000025');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('demo-media', pg_temp.demo_obj('d1300000-0000-4000-8000-000000000021', 'a')) $$,
  'the demo org''s ops member uploads to demo-media');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('demo-media', 'org/d1300000-0000-4000-8000-000000000021/other/' || encode(sha256('b'::bytea), 'hex')) $$,
  '42501', null, 'only content-addressed parcel paths');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('demo-media', pg_temp.demo_obj('d1300000-0000-4000-8000-000000000021', 'c')) $$,
  '42501', null, 'ops of another org cannot upload to the demo org');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('demo-media', pg_temp.demo_obj('b0000000-0000-4000-8000-000000000001', 'd')) $$,
  '42501', null, 'demo-media holds demo orgs only');
select pg_temp.as_demo('d13f0000-0000-4000-8000-000000000025');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('demo-media', pg_temp.demo_obj('d1300000-0000-4000-8000-000000000021', 'e')) $$,
  '42501', null, 'never under a demo claim');
reset role;

select * from finish();
rollback;
