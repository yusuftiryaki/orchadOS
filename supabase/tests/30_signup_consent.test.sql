-- Self sign-up, consents, billing profile and contact details (IP12,
-- docs/musteri-yonetimi.md §6.4, §6.9, §7). The signup_* functions run as the
-- service role (here: postgres); the customer functions as the signed-in user.
-- Seed: owner a0..01 (profile phone +905550000001), viewer a0..02, field a0..03,
-- ops a0..05, customer a0..06 (+905550000006, completed sign-up).
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
-- Code, message and detail of a failing statement.
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;
create function pg_temp.h(p_text text) returns text language sql immutable
as $$ select encode(extensions.digest(p_text, 'sha256'), 'hex') $$;
create function pg_temp.consents() returns jsonb language sql immutable
as $$ select '{"kvkk_notice_version": "kvkk-v2-taslak", "explicit_text_version": "riza-v2-taslak",
               "explicit_service_improvement": true, "explicit_marketing": true}'::jsonb $$;
grant execute on all functions in schema pg_temp to authenticated;

-- A fresh self sign-up account (as customer-signup opens it).
insert into auth.users (instance_id, id, aud, role, email, phone, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'pgtap-signup@example.test', '905559990001', '{"signup": "self"}', now(), now());

-- Rate limits ----------------------------------------------------------------------

select is(pg_temp.error_of($$ select public.signup_register_attempt('nothex', 'x', 'y') $$),
  '22023 invalid_input / ip_hash', 'hashes are hex');
select is(public.signup_register_attempt(pg_temp.h('ip-1'), pg_temp.h('phone-1'), pg_temp.h('mail-1')), 'ok', 'an attempt is counted');
select is(public.signup_register_attempt(pg_temp.h('ip-2'), pg_temp.h('phone-1'), pg_temp.h('mail-2')), 'ok', 'a second for the phone');
select is(public.signup_register_attempt(pg_temp.h('ip-3'), pg_temp.h('phone-1'), pg_temp.h('mail-3')), 'ok', 'a third for the phone');
select is(public.signup_register_attempt(pg_temp.h('ip-4'), pg_temp.h('phone-1'), pg_temp.h('mail-4')), 'too_many',
  'the fourth for a phone within a day is refused');
select is(
  (select array_agg(public.signup_register_attempt(pg_temp.h('ip-5'), pg_temp.h('phone-x' || i), pg_temp.h('mail-x' || i)) order by i)
   from generate_series(1, 11) i),
  array['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'too_many'],
  'ten per IP an hour');
select is(
  (select array_agg(public.signup_register_attempt(pg_temp.h('ip-m' || i), pg_temp.h('phone-m' || i), pg_temp.h('mail-m'))
     order by i)
   from generate_series(1, 6) i),
  array['ok', 'ok', 'ok', 'ok', 'ok', 'too_many'],
  'five per e-mail a day, whatever the phone');
select is((select count(*) from private.signup_attempt where ip_hash = pg_temp.h('ip-5')), 10::bigint,
  'refused attempts are not counted');
update private.signup_attempt set created_at = now() - interval '3 days' where ip_hash = pg_temp.h('ip-5');
select is((private.signup_housekeeping() ->> 'attempts_deleted')::int, 10, 'housekeeping drops attempts after two days');
update public.org_billing_setting set accepts_signups = false;
select is(public.signup_register_attempt(pg_temp.h('ip-6'), pg_temp.h('phone-6'), pg_temp.h('mail-6')), 'closed', 'closed sign-ups');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+905559990001', 'sms', pg_temp.consents(), null) $$),
  'P0001 signup_closed', 'no pending sign-up while closed');
update public.org_billing_setting set accepts_signups = true;

-- Finding accounts -------------------------------------------------------------------

select results_eq(
  $$ select user_id, matched_by, self_signup, phone_confirmed, signup_completed
     from public.signup_find_account('OWNER@example.com', '+905550000001') $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, 'email', false, false, false),
            ('a0000000-0000-4000-8000-000000000001'::uuid, 'profile_phone', false, false, false) $$,
  'the e-mail (any case) and another user''s profile phone are found');
select results_eq(
  $$ select user_id, matched_by, self_signup, phone_confirmed, signup_completed
     from public.signup_find_account('new@example.test', '+905550000006') $$,
  $$ values ('a0000000-0000-4000-8000-000000000006'::uuid, 'phone', true, true, true) $$,
  'a verified self sign-up is found by its phone (not again as a profile phone)');
select is((select count(*) from public.signup_find_account('nobody@example.test', '+905559999999')), 0::bigint,
  'nothing for new details');

-- Pending sign-up ------------------------------------------------------------------

select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+15551234567', 'sms', pg_temp.consents(), null) $$),
  '22023 invalid_input / phone', 'a non-Turkish mobile is refused, naming the field only');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'secret-address-at-example', '+905559990001', 'sms', pg_temp.consents(), null) $$),
  '22023 invalid_input / email', 'a bad e-mail is refused without its value');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'A',
  'pgtap-signup@example.test', '+905559990001', 'sms', pg_temp.consents(), null) $$),
  '22023 invalid_input / full_name', 'a name needs two characters');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+905559990001', 'phone_call', pg_temp.consents(), null) $$),
  '22023 invalid_input / contact_preference', 'sign-up offers WhatsApp or SMS');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+905559990001', 'sms', pg_temp.consents() || '{"kvkk_notice_version": "KVKK 1"}', null) $$),
  '22023 invalid_input / kvkk_notice_version', 'consent text versions have a format');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+905559990001', 'sms', pg_temp.consents() || '{"kvkk_notice_version": "kvkk-v1-taslak"}', null) $$),
  '22023 invalid_input / kvkk_notice_version', 'T21: only the current registered KVKK notice version is taken');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+905559990001', 'sms', pg_temp.consents() - 'explicit_marketing', null) $$),
  '22023 invalid_input / explicit_marketing', 'both explicit consents are answered');
select lives_ok($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', ' Ayşe  Kaya ',
  'PGTAP-signup@example.test', '+905559990001', 'sms', pg_temp.consents(), $$ || quote_literal(pg_temp.h('ip-1')) || ')',
  'a valid pending sign-up is stored');
select results_eq(
  $$ select full_name, email, completed_at is null from private.customer_signup
     where user_id = 'a3000000-0000-4000-8000-000000000001' $$,
  $$ values ('Ayşe  Kaya', 'pgtap-signup@example.test', true) $$,
  'trimmed and with a lower-case e-mail, not completed');
select is(public.signup_complete('a3000000-0000-4000-8000-000000000099', now()), 'no_pending', 'no pending sign-up');

-- Completing -----------------------------------------------------------------------

select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', now()), 'phone_mismatch',
  'not before the phone is confirmed');
update auth.users set phone = '905559990009', phone_confirmed_at = now()
where id = 'a3000000-0000-4000-8000-000000000001';
select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', now()), 'phone_mismatch',
  'not when the confirmed phone is another number than the pending one');
update auth.users set phone = '905559990001' where id = 'a3000000-0000-4000-8000-000000000001';
select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', now() - interval '1 minute'), 'phone_mismatch',
  'not with a phone code older than the pending sign-up');
select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', null), 'phone_mismatch',
  'not without a phone code');
update auth.users set raw_app_meta_data = '{}' where id = 'a3000000-0000-4000-8000-000000000001';
select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', now()), 'phone_mismatch',
  'only for a self sign-up account');
update auth.users set raw_app_meta_data = '{"signup": "self"}' where id = 'a3000000-0000-4000-8000-000000000001';
select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', now()), 'completed', 'the sign-up completes');
select results_eq(
  $$ select full_name, phone, contact_preference::text, kvkk_consent, kvkk_text_version
     from private.owner_profile where user_id = 'a3000000-0000-4000-8000-000000000001' $$,
  $$ values ('Ayşe  Kaya', '+905559990001', 'sms', true, 'kvkk-v2-taslak') $$,
  'the owner profile carries the KVKK acknowledgement');
select results_eq(
  $$ select kind::text, granted, text_version, source::text, ip_hash is not null from private.consent_record
     where subject_id = 'a3000000-0000-4000-8000-000000000001' order by kind::text $$,
  $$ values ('explicit_marketing', false, 'riza-v2-taslak', 'signup', true),
            ('explicit_service_improvement', false, 'riza-v2-taslak', 'signup', true),
            ('kvkk_notice', true, 'kvkk-v2-taslak', 'signup', true) $$,
  'three consent records; T27: both explicit kinds sent true are stored false (not asked)');
select results_eq(
  $$ select actor_role, action, details from public.audit_event
     where actor_user_id = 'a3000000-0000-4000-8000-000000000001' $$,
  $$ values ('customer', 'signup.completed', '{"explicit_marketing": false, "explicit_service_improvement": false}'::jsonb) $$,
  'one audit row, without personal data');
select is(public.signup_complete('a3000000-0000-4000-8000-000000000001', now()), 'already_completed', 'completing twice');
select is(pg_temp.error_of($$ select public.signup_prepare('a3000000-0000-4000-8000-000000000001', 'Ad Soyad',
  'pgtap-signup@example.test', '+905559990001', 'sms', pg_temp.consents(), null) $$),
  '23505 exists', 'a completed sign-up is not replaced');
select is((private.signup_housekeeping() ->> 'signups_deleted')::int, 0, 'completed sign-ups stay');
-- Two pending sign-ups older than a day: one verified its phone, one did not.
insert into auth.users (instance_id, id, aud, role, email, phone, phone_confirmed_at, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000004', 'authenticated',
        'authenticated', 'pgtap-verified@example.test', '905559990004', now(), '{"signup": "self"}', now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000005', 'authenticated',
        'authenticated', 'pgtap-unverified@example.test', '905559990005', null, '{"signup": "self"}', now(), now());
select public.signup_prepare('a3000000-0000-4000-8000-000000000004', 'Ad Soyad', 'pgtap-verified@example.test',
  '+905559990004', 'sms', pg_temp.consents(), null);
select public.signup_prepare('a3000000-0000-4000-8000-000000000005', 'Ad Soyad', 'pgtap-unverified@example.test',
  '+905559990005', 'sms', pg_temp.consents(), null);
update private.customer_signup set created_at = now() - interval '2 days'
where user_id in ('a3000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000005');
select is((private.signup_housekeeping() ->> 'signups_deleted')::int, 1,
  'housekeeping drops an old pending sign-up whose phone was never verified');
select is(
  (select array_agg(user_id) from private.customer_signup
   where user_id in ('a3000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000005')),
  array['a3000000-0000-4000-8000-000000000004'::uuid],
  'a verified phone keeps its pending sign-up, so it can still complete');

-- KVKK notice backfill ---------------------------------------------------------------

select results_eq(
  $$ select user_id, text_version, source::text, recorded_at from private.consent_record
     where kind = 'kvkk_notice' and user_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002')
     order by user_id $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, 'kvkk-v0', 'ops', '2026-10-01 09:00:00+00'::timestamptz),
            ('a0000000-0000-4000-8000-000000000002'::uuid, 'kvkk-v0', 'ops', '2026-10-02 09:00:00+00'::timestamptz) $$,
  'profiles recorded before IP12 have their kvkk_notice record');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000002', 'authenticated',
        'authenticated', 'pgtap-legacy@example.test', now(), now());
insert into private.owner_profile (org_id, user_id, full_name, contact_preference, kvkk_consent, kvkk_consent_at, kvkk_text_version)
values ('b0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'Eski Sahip', 'sms',
        true, '2026-09-01 09:00:00+00', 'KVKK Metni v2');
select is(private.backfill_kvkk_consents(), 1, 'the backfill writes the missing record only');
select is((select text_version from private.consent_record where subject_id = 'a3000000-0000-4000-8000-000000000002'),
  'kvkk-metni-v2', 'a free-text version is normalised');
select is(private.backfill_kvkk_consents(), 0, 'the backfill is idempotent');

-- Consents (customer) ----------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');

select results_eq(
  $$ select kind, granted from public.my_consents() order by kind $$,
  $$ values ('explicit_marketing', false), ('explicit_service_improvement', true), ('kvkk_notice', true) $$,
  'the customer reads their current consents');
-- T27: a kind that is not asked is never granted; withdrawing always works.
select is(pg_temp.error_of($$ select public.customer_set_consent('explicit_marketing', true, 'riza-v2-taslak') $$),
  'P0001 consent_not_asked / explicit_marketing', 'T27: marketing is not granted while the İYS switch is off');
select is(pg_temp.error_of($$ select public.customer_set_consent('explicit_service_improvement', true, 'riza-v2-taslak') $$),
  'P0001 consent_not_asked / explicit_service_improvement', 'T27: service improvement is never granted');
select lives_ok($$ select public.customer_set_consent('explicit_service_improvement', false, 'riza-v2-taslak') $$,
  'an old consent is withdrawn');
reset role;
update public.org_billing_setting set marketing_consent_enabled = true
where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$ select public.customer_set_consent('explicit_marketing', true, 'riza-v2-taslak') $$,
  'T27: with the switch on (after İYS) marketing is granted');
select is(pg_temp.error_of($$ select public.customer_set_consent('explicit_service_improvement', true, 'riza-v2-taslak') $$),
  'P0001 consent_not_asked / explicit_service_improvement', 'T27: service improvement stays refused with the switch on');
reset role;
update public.org_billing_setting set marketing_consent_enabled = false
where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq(
  $$ select kind, granted, source from public.my_consents() where kind like 'explicit%' order by kind $$,
  $$ values ('explicit_marketing', true, 'portal'), ('explicit_service_improvement', false, 'portal') $$,
  'the latest record counts');
select is(pg_temp.error_of($$ select public.customer_set_consent('kvkk_notice', false, 'kvkk-v1-taslak') $$),
  '22023 invalid_input / granted', 'the KVKK notice is only acknowledged');
select is(pg_temp.error_of($$ select public.customer_set_consent('distance_sales', true, 'mesafeli-v1') $$),
  '22023 invalid_input / kind', 'contract consents come with the quote');
select is(pg_temp.error_of($$ select public.customer_set_consent('explicit_marketing', false, 'Bad Version') $$),
  '22023 invalid_input / text_version', 'text versions have a format');
select is(pg_temp.error_of($$ select public.customer_set_consent('kvkk_notice', true, 'kvkk-v1-taslak') $$),
  '22023 invalid_input / text_version', 'T21: an earlier KVKK notice version is not acknowledged');
select is(pg_temp.error_of($$ select public.customer_set_consent('kvkk_notice', true, 'kvkk-v2') $$),
  '22023 invalid_input / text_version', 'T21: an unregistered version is refused, also without -taslak');
select lives_ok($$ select public.customer_set_consent('kvkk_notice', true, 'kvkk-v2-taslak') $$,
  'a new KVKK notice version is acknowledged');
reset role;
select results_eq(
  $$ select kvkk_consent, kvkk_text_version from private.owner_profile
     where user_id = 'a0000000-0000-4000-8000-000000000006' $$,
  $$ values (true, 'kvkk-v2-taslak') $$,
  'the profile carries the acknowledged version');
set local role authenticated;

-- Contact details -------------------------------------------------------------------

select is(pg_temp.error_of($$ select public.customer_update_contact('Örnek Müşteri', 'not-an-email', 'sms') $$),
  '22023 invalid_input / email', 'a bad contact e-mail is refused without its value');
select lives_ok($$ select public.customer_update_contact(' Örnek Müşteri ', 'Yeni@Example.com', 'phone_call') $$,
  'the customer updates their contact details');
select results_eq(
  $$ select full_name, email, contact_preference from public.my_owner_profile() $$,
  $$ values ('Örnek Müşteri', 'yeni@example.com', 'phone_call') $$,
  'name, contact e-mail and preference change; the phone stays');

-- Billing profile ---------------------------------------------------------------------

select results_eq(
  $$ select has_profile, kind, identity_number_masked, identity_number_required from public.my_billing_profile() $$,
  $$ values (true, 'individual', null::text, false) $$,
  'the seed customer has an individual profile; no TCKN asked');
select lives_ok($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Yeni adres 2", "city": "Gaziantep", "identity_number": "10000000146"}') $$,
  'saving without the TCKN requirement');
reset role;
select is((select identity_number from private.billing_profile where user_id = 'a0000000-0000-4000-8000-000000000006'),
  null, 'the TCKN is not stored unless the org needs it');
update public.org_billing_setting set identity_number_required = true;
set local role authenticated;
select is(pg_temp.error_of($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Yeni adres 2", "city": "Gaziantep"}') $$),
  '22023 invalid_input / identity_number', 'a required TCKN is missing');
select is(pg_temp.error_of($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Yeni adres 2", "city": "Gaziantep", "identity_number": "10000000147"}') $$),
  '22023 invalid_input / identity_number', 'a wrong TCKN is refused without its value');
select is(pg_temp.error_of($$ select public.customer_save_billing_profile('{"kind": "company", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Yeni adres 2", "city": "Gaziantep", "identity_number": "10000000146"}') $$),
  '22023 invalid_input / company_title', 'a company needs its title, tax office and number');
select lives_ok($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Yeni adres 2", "city": "Gaziantep", "identity_number": "10000000146"}') $$,
  'a valid TCKN is saved');
select is((select identity_number_masked from public.my_billing_profile()), '*******0146',
  'the customer sees it masked');
select lives_ok($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Yeni adres 3", "city": "Gaziantep"}') $$,
  'a saved TCKN is kept when the form leaves it out');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select public.customer_save_billing_profile('{"kind": "individual"}') $$),
  'P0001 not_customer', 'field staff has no customer profile');
select is((select count(*) from public.my_billing_profile()), 0::bigint, 'and no billing profile row');

-- Ops ---------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select results_eq(
  $$ select identity_number_masked, identity_number, address from public.ops_billing_profile(
       'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') $$,
  $$ values ('*******0146', null::text, 'Yeni adres 3') $$,
  'ops reads the profile with the TCKN masked');
select is(
  (select identity_number from public.ops_billing_profile('b0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000006', true)),
  '10000000146', 'and reveals it on request');
select is((select count(*) from public.ops_customer_consents('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006')), 6::bigint, 'ops reads the consent history');
select is((select count(*) from public.audit_event where action = 'billing_profile.revealed'), 1::bigint,
  'revealing the TCKN is audited');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select * from public.ops_billing_profile('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006') $$), '42501 forbidden', 'the expert may not');
select is((select count(*) from public.ops_customer_consents('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006')), 0::bigint, 'nor read consents');

-- Owner profiles by ops record the KVKK consent.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
reset role;
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000003', 'authenticated',
        'authenticated', 'pgtap-ops-owner@example.test', now(), now());
set local role authenticated;
select is(pg_temp.error_of($$ select public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000005', 'Kendim', 'sms', false) $$), '42501 forbidden',
  'ops does not record their own profile');
select lives_ok($$ select public.ops_create_owner_profile('b0000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000003', 'Yeni Sahip', 'sms', true, '+905559990003', null,
  '2026-10-27 09:00:00+00', 'kvkk-v1') $$, 'ops records an owner with consent');
select lives_ok($$ select public.ops_update_owner_profile(
  (select id from public.ops_owner_profiles() where user_id = 'a3000000-0000-4000-8000-000000000003'),
  'Yeni Sahip', 'sms', false, '+905559990003') $$, 'and withdraws the consent');
reset role;
select results_eq(
  $$ select kind::text, granted, text_version, source::text from private.consent_record
     where subject_id = 'a3000000-0000-4000-8000-000000000003' order by recorded_at, granted desc $$,
  $$ values ('kvkk_notice', true, 'kvkk-v1', 'ops'), ('kvkk_notice', false, 'kvkk-v1', 'ops') $$,
  'both changes are consent records');
select is(
  (select count(*) from private.consent_record
   where subject_id = 'a3000000-0000-4000-8000-000000000003' and recorded_at <> now()),
  0::bigint, 'ops consent records carry the time they were written, not the declared consent date');
select results_eq(
  $$ select action, details from public.audit_event
     where entity_type = 'owner_profile' and actor_user_id = 'a0000000-0000-4000-8000-000000000005' order by created_at, action $$,
  $$ values ('owner_profile.created', '{"fields": ["full_name", "contact_preference", "phone", "kvkk_consent"]}'::jsonb),
            ('owner_profile.updated', '{"fields": ["kvkk_consent"]}'::jsonb) $$,
  'audit rows carry field names only');
select is(
  (select count(*) from public.audit_event
   where details::text ~ '(\+90555|@example|10000000146|Ayşe|Örnek)'),
  0::bigint, 'no audit row carries a phone, e-mail, TCKN or name');

select * from finish();
rollback;
