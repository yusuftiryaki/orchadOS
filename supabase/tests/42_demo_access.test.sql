-- Demo tour access (20261101120000_demo_access): registry, demo_admit limits,
-- demo_start, what a visitor reads, demo_info / demo_end / demo_hit, cleanup
-- selection, notifications, AI and billing guards, cron.
-- Seed: owner a0..01, ops a0..05 of org b0..01 (accepts sign-ups locally),
-- parcel c0..01. Fixtures: demo org d1..01 with an active parcel (published
-- visit, visit in review) and an inactive one; visitor accounts d13a.. built
-- in-test (Edge's Admin API is not involved here).
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
create function pg_temp.no_claims() returns void language sql
as $$ select set_config('request.jwt.claims', '', true) $$;
-- A visitor account as demo-start opens it (no password: GoTrue's random hash
-- stands in), created p_age ago.
create function pg_temp.visitor(p_id uuid, p_email text, p_age interval default '0', p_phone text default null,
  p_meta jsonb default '{"demo": true}')
returns void language sql
as $$
  insert into auth.users (instance_id, id, aud, role, email, phone, encrypted_password, raw_app_meta_data,
                          raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, p_phone,
          '$2a$10$randomhashrandomhashrandomhashrandomhashrandomhashra', p_meta, '{}', now() - p_age, now());
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Fixtures (as postgres) --------------------------------------------------------------

insert into public.org (id, name, kind) values ('d1300000-0000-4000-8000-000000000001', 'pgTAP demo', 'other');
insert into public.parcel (id, org_id, name) values
  ('d1310000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001', 'Demo Kuzey'),
  ('d1310000-0000-4000-8000-000000000002', 'd1300000-0000-4000-8000-000000000001', 'Demo Pasif');
insert into public.session (id, org_id, parcel_id, kind, status, started_at) values
  ('d1320000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001',
   'd1310000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-07-14 07:00:00+00'),
  ('d1320000-0000-4000-8000-000000000002', 'd1300000-0000-4000-8000-000000000001',
   'd1310000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-07-20 07:00:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version) values
  ('d1330000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001',
   'd1310000-0000-4000-8000-000000000001', 'd1320000-0000-4000-8000-000000000001', 'panorama',
   'storage://media/x', encode(sha256('demo-pub'::bytea), 'hex'), 'pipeline', '0.1.0'),
  ('d1330000-0000-4000-8000-000000000002', 'd1300000-0000-4000-8000-000000000001',
   'd1310000-0000-4000-8000-000000000001', 'd1320000-0000-4000-8000-000000000002', 'panorama',
   'storage://media/y', encode(sha256('demo-rev'::bytea), 'hex'), 'pipeline', '0.1.0');
insert into storage.objects (bucket_id, name) values
  ('media', 'org/d1300000-0000-4000-8000-000000000001/parcel/d1310000-0000-4000-8000-000000000001/'
            || encode(sha256('demo-pub'::bytea), 'hex')),
  ('media', 'org/d1300000-0000-4000-8000-000000000001/parcel/d1310000-0000-4000-8000-000000000001/'
            || encode(sha256('demo-rev'::bytea), 'hex'));
-- The fictional owner of the demo data (a persona, not a visitor).
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd13f0000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'pgtap-persona@demo.orchados.invalid', '{"demo_persona": true}', now(), now());
insert into public.parcel_access (org_id, parcel_id, user_id, role) values
  ('d1300000-0000-4000-8000-000000000001', 'd1310000-0000-4000-8000-000000000001',
   'd13f0000-0000-4000-8000-000000000001', 'owner');

-- Privileges --------------------------------------------------------------------------

select is(
  (select count(*)::int from unnest(array[
     'public.demo_admit(text)', 'public.demo_start(uuid, text)', 'public.demo_expired_accounts(integer, uuid[])',
     'public.demo_undeletable_count()', 'public.demo_purge_audit_log(uuid[])']) f
   where has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE')
      or not has_function_privilege('service_role', f, 'EXECUTE')),
  0, 'the Edge entry points are for the service role only');
select is(
  (select count(*)::int from unnest(array['public.demo_info()', 'public.demo_end()', 'public.demo_hit(text)']) f
   where not has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE')),
  0, 'the visitor entry points are for authenticated only');
select ok(has_function_privilege('anon', 'authz.is_demo_user()', 'EXECUTE')
          and has_function_privilege('authenticated', 'authz.is_demo_user()', 'EXECUTE'),
          'is_demo_user is callable from policies of anon and authenticated');
select ok(has_function_privilege('authenticated', 'authz.is_demo_account(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'authz.is_demo_account(uuid)', 'EXECUTE'),
          'is_demo_account is for authenticated');
select is(
  (select count(*)::int from unnest(array['private.demo_org', 'private.demo_parcel', 'private.demo_session',
     'private.demo_attempt']) t
   where has_table_privilege('authenticated', t, 'SELECT') or has_table_privilege('anon', t, 'SELECT')),
  0, 'the registry tables are not readable from the API');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname like 'demo\_%' and c.relkind = 'r' and c.relrowsecurity),
  4, 'row level security is on for the four registry tables');

-- demo_admit: closed --------------------------------------------------------------------

select is(public.demo_admit('h-closed'), '{"ok": false, "error": "demo_closed"}'::jsonb,
          'without an enabled demo org the demo is closed');
select is(public.demo_admit('h-closed') ->> 'error', 'demo_closed', 'still closed');
select is(
  (select array_agg(hits) from private.demo_attempt where ip_hash = 'h-closed' and outcome = 'closed'),
  array[2], 'repeated rejections in one minute leave one row with a counter');

select is(
  testing.register_demo_org('d1300000-0000-4000-8000-000000000001',
    array['d1310000-0000-4000-8000-000000000001', 'd1310000-0000-4000-8000-000000000002']::uuid[], true,
    '{"parcel_id": "d1310000-0000-4000-8000-000000000001"}'),
  null::uuid, 'registering the fixture org: no demo org was enabled before');
update private.demo_parcel set active = false where parcel_id = 'd1310000-0000-4000-8000-000000000002';
update private.demo_org set ip_hourly_limit = 2, ip_daily_limit = 3 where org_id = 'd1300000-0000-4000-8000-000000000001';

select throws_ok(
  $$ insert into private.demo_parcel (parcel_id, org_id) values
       ('c0000000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001') $$,
  '23514', null, 'a demo parcel must belong to its demo org');
select throws_ok(
  $$ update private.demo_org set loaded_at = null where org_id = 'd1300000-0000-4000-8000-000000000001' $$,
  '23514', null, 'an enabled demo org has a loaded_at');
select throws_ok(
  $$ insert into private.demo_org (org_id, enabled, loaded_at) values ('b0000000-0000-4000-8000-000000000001', true, now()) $$,
  '23514', null, 'the seed org accepts sign-ups, so it cannot become a demo org (demo_billing_forbidden)');

-- demo_admit: limits ---------------------------------------------------------------------

select is(public.demo_admit('h1'),
  jsonb_build_object('ok', true, 'org_id', 'd1300000-0000-4000-8000-000000000001', 'ttl_seconds', 10800,
                     'email_domain', 'demo.orchados.invalid'),
  'admitted: org, ttl and the visitor e-mail domain');
select is(public.demo_admit('h1') ->> 'ok', 'true', 'second start of the bucket is admitted');
select is(public.demo_admit('h1') ->> 'error', 'rate_limited', 'the hourly limit (2) is reached');
select is(public.demo_admit('h1') ->> 'error', 'rate_limited', 'still limited');
select is(
  (select array_agg(hits order by outcome) from private.demo_attempt where ip_hash = 'h1'),
  array[2, 2], 'one admitted row and one rate_limited row, each with two hits');
update private.demo_org set ip_hourly_limit = 3 where org_id = 'd1300000-0000-4000-8000-000000000001';
select is(public.demo_admit('h1') ->> 'ok', 'true', 'only admitted hits count: the rejections do not');
-- An IP bucket with three admitted starts two hours ago: the daily limit (3).
insert into private.demo_attempt (ip_hash, outcome, minute, hits)
values ('h2', 'admitted', date_trunc('minute', now() - interval '2 hours'), 3);
select is(public.demo_admit('h2') ->> 'error', 'rate_limited', 'the daily limit counts the last 24 hours');
update private.demo_org set max_daily_starts = 6 where org_id = 'd1300000-0000-4000-8000-000000000001';
select is(public.demo_admit('h3'), '{"ok": false, "error": "demo_capacity"}'::jsonb,
          'all buckets'' admitted starts in 24 hours reach max_daily_starts');
update private.demo_org set max_daily_starts = 500 where org_id = 'd1300000-0000-4000-8000-000000000001';

-- demo_start ----------------------------------------------------------------------------

select pg_temp.visitor('d13a0000-0000-4000-8000-000000000001', 'ziyaretci-v1@demo.orchados.invalid');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000002', 'ziyaretci-v2@demo.orchados.invalid');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000003', 'ziyaretci-v3@demo.orchados.invalid', '0', '905550013001');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000004', 'ziyaretci-v4@example.com');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000005', 'ziyaretci-v5@demo.orchados.invalid', '20 minutes');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000006', 'ziyaretci-v6@demo.orchados.invalid', '0', null, '{}');
select pg_temp.visitor('d13a0000-0000-4000-8000-000000000007', 'ziyaretci-v7@demo.orchados.invalid');
-- A membership the scope guard would refuse (as if the guard were missing).
set local session_replication_role = replica;
insert into public.membership (org_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'd13a0000-0000-4000-8000-000000000007', 'ops');
set local session_replication_role = origin;

select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000003', 'h') $$,
  '22023', 'not_demo_account', 'an account with a phone is refused');
select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000004', 'h') $$,
  '22023', 'not_demo_account', 'an e-mail outside the visitor domain is refused');
select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000005', 'h') $$,
  '22023', 'not_demo_account', 'an account older than ten minutes is refused');
select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000006', 'h') $$,
  '22023', 'not_demo_account', 'an account without the demo flag is refused');
select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000007', 'h') $$,
  '22023', 'not_demo_account', 'an account with a membership is refused');
select throws_ok($$ select public.demo_start(gen_random_uuid(), 'h') $$,
  '22023', 'not_demo_account', 'an unknown account is refused');
select is((select encrypted_password from auth.users where id = 'd13a0000-0000-4000-8000-000000000003'),
  '$2a$10$randomhashrandomhashrandomhashrandomhashrandomhashra', 'a refused account keeps its row as it was');

select is(
  public.demo_start('d13a0000-0000-4000-8000-000000000001', 'h1') - 'expires_at',
  jsonb_build_object('org_id', 'd1300000-0000-4000-8000-000000000001',
    'parcel_ids', jsonb_build_array('d1310000-0000-4000-8000-000000000001'), 'next', '/portal?tur=bahceler'),
  'demo_start: org, the active demo parcels and the first page');
select is((select expires_at from private.demo_session where user_id = 'd13a0000-0000-4000-8000-000000000001'),
  now() + interval '3 hours', 'the session lasts session_ttl');
select is((select encrypted_password from auth.users where id = 'd13a0000-0000-4000-8000-000000000001'), '',
  'the random password hash of the Admin API is blanked');
select results_eq(
  $$ select parcel_id, role::text, granted_by from public.parcel_access
     where user_id = 'd13a0000-0000-4000-8000-000000000001' $$,
  $$ values ('d1310000-0000-4000-8000-000000000001'::uuid, 'owner', null::uuid) $$,
  'owner access to the active demo parcel only, granted by nobody');
select is(
  public.demo_start('d13a0000-0000-4000-8000-000000000001', 'h1'),
  (select jsonb_build_object('org_id', s.org_id, 'expires_at', s.expires_at,
     'parcel_ids', jsonb_build_array('d1310000-0000-4000-8000-000000000001'), 'next', '/portal?tur=bahceler')
   from private.demo_session s where s.user_id = 'd13a0000-0000-4000-8000-000000000001'),
  'a second call returns the same result');
select is((select count(*)::int from public.parcel_access where user_id = 'd13a0000-0000-4000-8000-000000000001'), 1,
  'and adds nothing');

update private.demo_org set max_active_sessions = 1 where org_id = 'd1300000-0000-4000-8000-000000000001';
select is(public.demo_admit('h4') ->> 'error', 'demo_capacity', 'demo_admit: active sessions reach the limit');
select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000002', 'h4') $$,
  'P0001', 'demo_capacity', 'demo_start re-checks the active sessions');
update private.demo_org set max_active_sessions = 200 where org_id = 'd1300000-0000-4000-8000-000000000001';
update private.demo_org set enabled = false where org_id = 'd1300000-0000-4000-8000-000000000001';
select throws_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000002', 'h4') $$,
  'P0001', 'demo_closed', 'demo_start needs an enabled demo org');
update private.demo_org set enabled = true where org_id = 'd1300000-0000-4000-8000-000000000001';
select lives_ok($$ select public.demo_start('d13a0000-0000-4000-8000-000000000002', 'h4') $$,
  'a second visitor starts');

-- What a visitor reads --------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_demo('d13a0000-0000-4000-8000-000000000001');
select ok(authz.is_demo_user(), 'the claim makes the request a demo request');
-- Visit rows are visible to parcel roles in any status (as for every owner);
-- their results only once published.
select results_eq($$ select id, status::text from public.session order by id $$,
  $$ values ('d1320000-0000-4000-8000-000000000001'::uuid, 'published'),
            ('d1320000-0000-4000-8000-000000000002'::uuid, 'in_review') $$,
  'the visitor sees the visits of the demo parcel, nothing of the seed org');
select results_eq($$ select id from public.asset $$,
  $$ values ('d1330000-0000-4000-8000-000000000001'::uuid) $$,
  'and only the published visit''s assets');
select results_eq($$ select storage.filename(name) from storage.objects where bucket_id = 'media' $$,
  $$ values (encode(sha256('demo-pub'::bytea), 'hex')) $$,
  'and only the published media object');
select results_eq($$ select id from public.parcel order by id $$,
  $$ values ('d1310000-0000-4000-8000-000000000001'::uuid) $$,
  'no parcel of the seed org, not the inactive demo parcel');
select results_eq(
  $$ select user_id from public.parcel_access order by user_id $$,
  $$ values ('d13a0000-0000-4000-8000-000000000001'::uuid), ('d13f0000-0000-4000-8000-000000000001'::uuid) $$,
  'own access row and the persona''s; the other visitor''s row is invisible');

select is(
  public.demo_info() - 'expires_at',
  jsonb_build_object('org_id', 'd1300000-0000-4000-8000-000000000001',
     'tour', '{"parcel_id": "d1310000-0000-4000-8000-000000000001"}'::jsonb,
     'parcels', '[{"id": "d1310000-0000-4000-8000-000000000001", "name": "Demo Kuzey"}]'::jsonb),
  'demo_info: org, tour and the active parcels');
select is((public.demo_info() ->> 'expires_at')::timestamptz, now() + interval '3 hours', 'and the end');

reset role;
select pg_temp.no_claims();
update private.demo_org set max_sign_calls = 2, max_pdf_renders = 1 where org_id = 'd1300000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_demo('d13a0000-0000-4000-8000-000000000001');
select ok(public.demo_hit('sign'), 'first image signing call');
select ok(public.demo_hit('sign'), 'second (the cap)');
select ok(not public.demo_hit('sign'), 'third is over the cap');
select ok(public.demo_hit('pdf'), 'first PDF');
select ok(not public.demo_hit('pdf'), 'second PDF is over the cap');
select throws_ok($$ select public.demo_hit('video') $$, '22023', 'invalid_input', 'unknown kind');

select pg_temp.as_demo('d13a0000-0000-4000-8000-000000000002');
select lives_ok($$ select public.demo_end() $$, 'the second visitor ends the demo');
select ok(not public.demo_hit('sign'), 'no counting after the end');
select is((public.demo_info() ->> 'expires_at')::timestamptz, now(), 'demo_info shows the end');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.demo_info(), null, 'demo_info is null for a real owner');
select ok(not public.demo_hit('sign'), 'demo_hit is false without a demo session');
select lives_ok($$ select public.demo_end() $$, 'demo_end does nothing for a real owner');
reset role;
select pg_temp.no_claims();

select is(
  (select array[sign_calls, pdf_renders] from private.demo_session where user_id = 'd13a0000-0000-4000-8000-000000000001'),
  array[3, 2], 'the counters');
select is(
  (select count(*)::int from private.demo_session where ended_at is null and expires_at > now()), 1,
  'demo_end closed only the caller''s session');

-- Cleanup selection ---------------------------------------------------------------------

-- Orphans (no session, older than a day) and due accounts that must stay.
select pg_temp.visitor('d13b0000-0000-4000-8000-000000000001', 'ziyaretci-o1@demo.orchados.invalid', '2 days');
select pg_temp.visitor('d13b0000-0000-4000-8000-000000000002', 'ziyaretci-o2@demo.orchados.invalid', '2 days', '905550013002');
select pg_temp.visitor('d13b0000-0000-4000-8000-000000000003', 'other-o3@demo.orchados.invalid', '2 days');
select pg_temp.visitor('d13b0000-0000-4000-8000-000000000004', 'ziyaretci-o4@demo.orchados.invalid');
select pg_temp.visitor('d13b0000-0000-4000-8000-000000000005', 'ziyaretci-o5@demo.orchados.invalid', '2 days');
set local session_replication_role = replica;
insert into public.parcel_access (org_id, parcel_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'd13b0000-0000-4000-8000-000000000005', 'viewer');
-- The member visitor of above with an expired session.
insert into private.demo_session (user_id, org_id, ip_hash, expires_at)
values ('d13a0000-0000-4000-8000-000000000007', 'd1300000-0000-4000-8000-000000000001', 'h', now() - interval '1 minute');
set local session_replication_role = origin;

select results_eq(
  $$ select * from public.demo_expired_accounts() order by 1 $$,
  $$ values ('d13a0000-0000-4000-8000-000000000002'::uuid), ('d13b0000-0000-4000-8000-000000000001'::uuid) $$,
  'deletable: the ended session and the clean orphan');
select results_eq(
  $$ select * from public.demo_expired_accounts(200, array['d13a0000-0000-4000-8000-000000000002']::uuid[]) $$,
  $$ values ('d13b0000-0000-4000-8000-000000000001'::uuid) $$,
  'p_exclude leaves out ids that failed to delete');
select is((select count(*)::int from public.demo_expired_accounts(1)), 1, 'p_limit');
select is(public.demo_undeletable_count(), 4,
  'due but kept: orphan with a phone, orphan with another e-mail, orphan with foreign access, expired member');

-- Notifications, AI, billing --------------------------------------------------------------

insert into public.session (id, org_id, parcel_id, kind, status, started_at) values
  ('d1320000-0000-4000-8000-000000000003', 'd1300000-0000-4000-8000-000000000001',
   'd1310000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-08-01 07:00:00+00'),
  ('d1320000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-08-01 07:00:00+00');
update public.session set status = 'published' where id = 'd1320000-0000-4000-8000-000000000003';
update public.session set status = 'published' where id = 'd1320000-0000-4000-8000-000000000004';
select is((select count(*)::int from public.notification where org_id = 'd1300000-0000-4000-8000-000000000001'), 0,
  'publishing a demo org visit enqueues no notification');
select ok((select count(*) from public.notification where session_id = 'd1320000-0000-4000-8000-000000000004') > 0,
  'publishing a real org visit still does');
select is(private.enqueue_billing_notification('quote_ready', 'd1300000-0000-4000-8000-000000000001',
  'd13f0000-0000-4000-8000-000000000001', gen_random_uuid(), 'T-1', '/portal'), 0,
  'account messages skip demo orgs too');

select throws_ok(
  $$ select public.save_ai_assessment('d1320000-0000-4000-8000-000000000002', null, 'healthy', 0.9, 'm', '1', '0.1',
       null, '[]', '{}', '{"prompt_version": "p", "config_key": "c"}') $$,
  '42501', 'demo_org_no_ai', 'no AI result is written to a demo org visit');

select throws_ok(
  $$ insert into public.org_billing_setting (org_id, accepts_signups) values ('d1300000-0000-4000-8000-000000000001', true) $$,
  '23514', 'demo_billing_forbidden', 'a demo org cannot accept sign-ups');
select lives_ok(
  $$ insert into public.org_billing_setting (org_id) values ('d1300000-0000-4000-8000-000000000001') $$,
  'a plain billing setting is allowed');
select throws_ok(
  $$ update public.org_billing_setting set allow_fake_payments = true where org_id = 'd1300000-0000-4000-8000-000000000001' $$,
  '23514', 'demo_billing_forbidden', 'nor fake payments');

-- Housekeeping (first steps; more in 44) and cron ---------------------------------------------

select lives_ok($$ select private.demo_housekeeping() $$, 'housekeeping runs');
select is((select count(*)::int from public.parcel_access where user_id = 'd13a0000-0000-4000-8000-000000000002'), 0,
  'the ended session lost its access');
select is((select count(*)::int from public.parcel_access where user_id = 'd13a0000-0000-4000-8000-000000000001'), 1,
  'the active one keeps it');
insert into private.demo_attempt (ip_hash, outcome, minute) values ('h-old', 'closed', now() - interval '49 hours');
select private.demo_housekeeping();
select is((select count(*)::int from private.demo_attempt where ip_hash = 'h-old'), 0, 'attempts older than 48 h go');

select is((select schedule from cron.job where jobname = 'demo-cleanup'), '*/15 * * * *', 'demo-cleanup every 15 minutes');
select is((select command from cron.job where jobname = 'demo-cleanup'), 'select private.dispatch_demo_cleanup()',
  'demo-cleanup calls the dispatcher');
select is((select schedule from cron.job where jobname = 'demo-housekeeping'), '*/5 * * * *',
  'demo-housekeeping every 5 minutes');
select is(private.dispatch_demo_cleanup(), null, 'without the Vault secrets the dispatcher does nothing');
select is(public.demo_purge_audit_log(array['d13a0000-0000-4000-8000-000000000002']::uuid[]), 0,
  'audit purge of an account without audit rows');

select * from finish();
rollback;
