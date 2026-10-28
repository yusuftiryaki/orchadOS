-- T15 (H30, H32): the owner's declaration on a co-owner invitation, the
-- viewer_invited SMS on approval, and the first-login KVKK notice
-- acknowledgement; all behind org_billing_setting.coowner_notice_flow_enabled
-- (on in seed). Seed: org b0..01, owner a0..01 (acknowledged in the portal),
-- viewer a0..02, ops a0..05 of parcel c0..01. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
create temporary table inv (phone text primary key, id uuid) on commit drop;
grant select on inv to authenticated;
create function pg_temp.inv(p text) returns uuid language sql stable as $$ select id from inv where phone = p $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (instance_id, id, aud, role, email, phone, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '64000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   null, '905550006401', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '64000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'ops-owner-64@example.test', null, now(), now());

-- Declaration ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Yeni Hissedar', '+905550006401') $$),
  'P0001 declaration_required', 'without the declaration the invitation is refused');
select lives_ok($$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Yeni Hissedar', '+905550006401', true) $$,
  'with the declaration it is recorded');
reset role;
select is((select declaration_version from private.viewer_invitation where phone = '+905550006401'), 'davet-beyani-v1-taslak',
  'with the declaration''s version');
select is((select declaration_sha256 from private.viewer_invitation where phone = '+905550006401'),
  encode(sha256(convert_to('Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim.', 'UTF8')), 'hex'),
  'and the SHA-256 of its exact text');
select isnt((select declared_at from private.viewer_invitation where phone = '+905550006401'), null, 'and the time');
insert into inv select phone, id from private.viewer_invitation where phone = '+905550006401';

-- Approval queues the SMS -----------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok(format($$ select public.ops_resolve_viewer_invitation(%L, true, '64000000-0000-4000-8000-000000000001') $$,
  pg_temp.inv('+905550006401')), 'ops approves the invitation');
reset role;
select results_eq(
  $$ select template::text, channel::text, vars from public.notification where recipient_user_id = '64000000-0000-4000-8000-000000000001' $$,
  $$ values ('viewer_invited', 'sms', '{"parcel_name": "Örnek Bahçe 1", "path": "/portal"}'::jsonb) $$,
  'one viewer_invited SMS with the parcel name and the portal path only');

-- First-login notice ------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('64000000-0000-4000-8000-000000000001');
select is(public.portal_notice_status() ->> 'required', 'true', 'the invited co-owner must read the notice first');
select is(public.portal_notice_status() ->> 'version', 'kvkk-v2-taslak', 'the current registered version');
select is(pg_temp.error_of($$ select public.portal_acknowledge_kvkk_notice('kvkk-v1-taslak') $$),
  '22023 invalid_input', 'an outdated version is refused');
select is(public.portal_acknowledge_kvkk_notice('kvkk-v2-taslak'), 1, 'the acknowledgement is recorded');
select is(public.portal_notice_status() ->> 'required', 'false', 'and is not asked again');
reset role;
select results_eq(
  $$ select kind::text, granted, text_version, source::text from private.consent_record
     where user_id = '64000000-0000-4000-8000-000000000001' $$,
  $$ values ('kvkk_notice', true, 'kvkk-v2-taslak', 'portal') $$, 'as a portal kvkk_notice record');
select is((select action from public.audit_event where actor_user_id = '64000000-0000-4000-8000-000000000001'),
  'consent.acknowledged', 'audited');

-- An owner opened by ops: the paper notice is not the portal acknowledgement.
insert into private.owner_profile (org_id, user_id, full_name, phone, email, contact_preference, kvkk_consent, kvkk_consent_at, kvkk_text_version)
values ('b0000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000002', 'Ops Sahibi', '+905550006402',
        'ops-owner-64@example.test', 'sms', true, now(), 'kvkk-v2-taslak');
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
values ('b0000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000002',
        'kvkk_notice', true, 'kvkk-v2-taslak', 'ops');
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000002', 'owner');
set local role authenticated;
select pg_temp.as_user('64000000-0000-4000-8000-000000000002');
select is(public.portal_notice_status() ->> 'required', 'true', 'an owner opened by ops reads the notice on first login');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.portal_notice_status() ->> 'required', 'false', 'the seed owner acknowledged it already');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(public.portal_notice_status() ->> 'required', 'false', 'staff without parcels are never asked');
select set_config('request.jwt.claims', json_build_object('sub', '64000000-0000-4000-8000-000000000002', 'role', 'authenticated',
  'app_metadata', json_build_object('demo', true))::text, true);
select is(public.portal_notice_status() ->> 'required', 'false', 'never with a demo claim');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

-- Switch off: today's behaviour ------------------------------------------------------------

reset role;
update public.org_billing_setting set coowner_notice_flow_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('64000000-0000-4000-8000-000000000002');
select is(public.portal_notice_status() ->> 'required', 'false', 'switch off: no notice screen');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Eski Usul', '+905550006403') $$,
  'switch off: the invitation needs no declaration');
reset role;
select is((select declared_at from private.viewer_invitation where phone = '+905550006403'), null, 'and records none');
insert into inv select phone, id from private.viewer_invitation where phone = '+905550006403';
insert into auth.users (instance_id, id, aud, role, phone, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '64000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
        '905550006403', now(), now());
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok(format($$ select public.ops_resolve_viewer_invitation(%L, true, '64000000-0000-4000-8000-000000000003') $$,
  pg_temp.inv('+905550006403')), 'ops approves');
reset role;
select is((select count(*)::int from public.notification where recipient_user_id = '64000000-0000-4000-8000-000000000003'), 0,
  'switch off: no SMS');
select ok(not has_function_privilege('anon', 'public.portal_acknowledge_kvkk_notice(text)', 'EXECUTE'),
  'anon cannot acknowledge');

select * from finish();
rollback;
