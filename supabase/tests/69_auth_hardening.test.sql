-- Auth hardening after PR #93 (docs/gorevler/auth-sertlestirme.md): phone
-- changes of customer and owner accounts, e-mail codes of self sign-ups, the
-- service-role code grant and its rate limits, the hook's marker, quarantined
-- rows kept for ops, and the registrant's wrong codes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

select testing.reset_to_seed();

create function pg_temp.h(p_text text) returns text language sql immutable
as $$ select encode(extensions.digest(p_text, 'sha256'), 'hex') $$;
create function pg_temp.consents() returns jsonb language sql immutable
as $$ select '{"kvkk_notice_version": "kvkk-v2-taslak", "explicit_text_version": "riza-v2-taslak",
               "explicit_service_improvement": false, "explicit_marketing": false}'::jsonb $$;

-- A pending self sign-up (phone not confirmed) with ticket 'a…'.
insert into auth.users (instance_id, id, aud, role, email, phone, phone_confirmed_at, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a5800000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'pgtap-hard-1@example.test', '905558000001', null, '{"signup": "self"}', now(), now());
select public.signup_prepare('a5800000-0000-4000-8000-000000000001', 'Ad Soyad', 'pgtap-hard-1@example.test',
  '+905558000001', 'sms', pg_temp.consents(), null);
select public.signup_set_ticket('a5800000-0000-4000-8000-000000000001', pg_temp.h(repeat('a', 43)));

-- 1. Phone changes ------------------------------------------------------------------------

select throws_ok($$ update auth.users set phone = '905558000099' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501', 'phone_change_locked', 'a completed self sign-up never changes its phone through Auth');
select throws_ok($$ update auth.users set phone_change = '905558000099' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501', 'phone_change_locked', '... nor starts a phone change');
select throws_ok($$ update auth.users set phone = '905558000099' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', 'phone_change_locked', 'an invited owner neither');
select throws_ok($$ update auth.users set phone = '905558000099' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', 'phone_change_locked', 'a viewer neither');
select throws_ok($$ update auth.users set phone = '905558000099' where id = 'a5800000-0000-4000-8000-000000000001' $$,
  '42501', 'phone_change_locked', 'a pending self sign-up neither');
select throws_ok($$ update auth.users set phone = null where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501', 'phone_change_locked', 'removing the phone is a change too');
select lives_ok($$ update auth.users set phone = '905558000098' where id = 'a0000000-0000-4000-8000-000000000003' $$,
  'staff accounts are not affected');
select lives_ok($$ update auth.users set phone_confirmed_at = now(), last_sign_in_at = now(), confirmation_token = 'tok'
                   where id = 'a0000000-0000-4000-8000-000000000006' $$,
  'a phone code (confirmation, login) still works');

-- A pending change written before the trigger can still be cleared.
select set_config('orchados.account_phone_change', 'on', true);
update auth.users set phone_change = '905558000097' where id = 'a0000000-0000-4000-8000-000000000006';
select set_config('orchados.account_phone_change', '', true);
select lives_ok($$ update auth.users set phone_change = '' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  'clearing a pending phone change is allowed');

select lives_ok($$ select private.change_account_phone('a0000000-0000-4000-8000-000000000006', '+905558000096') $$,
  'ops changes a customer''s phone');
select results_eq(
  $$ select phone, phone_confirmed_at is not null, coalesce(phone_change, '')
     from auth.users where id = 'a0000000-0000-4000-8000-000000000006' $$,
  $$ values ('905558000096'::text, true, ''::text) $$,
  '... confirmed, without a pending change');
select throws_ok($$ update auth.users set phone = '905558000095' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501', 'phone_change_locked', 'the ops switch does not outlive the call');
select throws_ok($$ select private.change_account_phone('a0000000-0000-4000-8000-000000000006', '0532') $$,
  '22023', 'invalid_input', 'a malformed number is refused');
select throws_ok($$ select private.change_account_phone('a5899999-0000-4000-8000-000000000000', '+905558000094') $$,
  'P0002', 'not_found', 'an unknown account is refused');

select is(public.account_phone_change_allowed('a0000000-0000-4000-8000-000000000006'), false,
  'the hook sends no phone change code to a customer');
select is(public.account_phone_change_allowed('a0000000-0000-4000-8000-000000000001'), false, '... nor an owner');
select is(public.account_phone_change_allowed('a0000000-0000-4000-8000-000000000003'), true, '... but to staff');

set local role anon;
select throws_ok($$ select private.change_account_phone('a0000000-0000-4000-8000-000000000006', '+905558000093') $$,
  '42501', null, 'anon cannot change a phone');
select throws_ok($$ select public.account_phone_change_allowed('a0000000-0000-4000-8000-000000000006') $$,
  '42501', null, 'anon cannot ask the hook''s question');
reset role;
set local role service_role;
select throws_ok($$ select private.change_account_phone('a0000000-0000-4000-8000-000000000006', '+905558000093') $$,
  '42501', null, 'neither can the service role: ops only');
reset role;

-- 2. E-mail codes of self sign-ups -----------------------------------------------------------

select throws_ok($$ update auth.users set recovery_token = 'magic', recovery_sent_at = now()
                    where id = 'a5800000-0000-4000-8000-000000000001' $$,
  '42501', 'email_code_locked', 'no magic link or e-mail login code for a pending self sign-up');
select throws_ok($$ update auth.users set recovery_token = 'magic' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '42501', 'email_code_locked', '... nor for a completed one');
select throws_ok($$ update auth.users set email_change = 'other@example.test', email_change_token_new = 'x'
                    where id = 'a5800000-0000-4000-8000-000000000001' $$,
  '42501', 'email_code_locked', 'no e-mail change');
select lives_ok($$ update auth.users set recovery_token = 'magic' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'invited accounts are not affected');
select lives_ok($$ update auth.users set recovery_token = '' where id = 'a0000000-0000-4000-8000-000000000006' $$,
  'clearing a token is allowed');

-- 3, 4. Code grant and marker ------------------------------------------------------------------

set local role anon;
select throws_ok($$ select public.signup_code_grant('+905558000001', repeat('a', 43)) $$, '42501', null,
  'anon cannot grant a code');
reset role;
set local role authenticated;
select throws_ok($$ select public.signup_code_grant('+905558000001', repeat('a', 43)) $$, '42501', null,
  'neither can a signed-in user');
reset role;

select is(public.signup_code_grant('+905558000001', repeat('a', 43)), 'granted', 'customer-signup grants one code');
select is(public.signup_code_grant('+905558000001', repeat('a', 43)), 'too_soon', 'one a minute');
select is(public.signup_sms_allowed('a5800000-0000-4000-8000-000000000001'), true, 'the hook may send it');
select is(public.signup_sms_allowed('a5800000-0000-4000-8000-000000000001'), true,
  'asking again (a failed send, Auth''s retry) keeps the marker');
select public.signup_code_release('+905558000001');
select is(public.signup_sms_allowed('a5800000-0000-4000-8000-000000000001'), false,
  'released once Auth answered: nothing left for a public resend');
update private.customer_signup set code_granted_at = now() - interval '1 minute', code_grants = 5
where user_id = 'a5800000-0000-4000-8000-000000000001';
select is(public.signup_code_grant('+905558000001', repeat('a', 43)), 'granted', 'the sixth code');
update private.customer_signup set code_granted_at = now() - interval '1 minute'
where user_id = 'a5800000-0000-4000-8000-000000000001';
select is(public.signup_code_grant('+905558000001', repeat('a', 43)), 'too_many', 'six per sign-up');
select is(public.signup_code_grant('+905558000001', repeat('b', 43)), 'refused', 'another ticket gets nothing');

-- 6. Wrong codes ------------------------------------------------------------------------------

delete from private.phone_login_attempt;
set local role anon;
select results_eq(
  $$ select public.phone_login_record_failure('+905558000001', repeat('a', 43)) from generate_series(1, 6) $$,
  $$ values (5), (5), (5), (5), (5), (5) $$,
  'the registrant''s wrong codes on their pending sign-up do not count');
select is(public.phone_login_allowed('+905558000001'), true, '... and do not lock the number');
select results_eq(
  $$ select public.phone_login_record_failure('+905558000001', repeat('b', 43)) from generate_series(1, 2) $$,
  $$ values (4), (3) $$,
  'with another ticket they count');
select is(public.phone_login_record_failure('+905558000001'), 2, 'without one too');
reset role;

-- 5. Quarantined rows stay for ops ---------------------------------------------------------------

select private.signup_quarantine('a5800000-0000-4000-8000-000000000001', 'delete_failed');
update private.customer_signup set created_at = now() - interval '2 days'
where user_id = 'a5800000-0000-4000-8000-000000000001';
select is((private.signup_housekeeping() ->> 'signups_deleted')::int, 0,
  'housekeeping keeps a quarantined sign-up older than a day');
select ok(exists (select 1 from private.customer_signup where user_id = 'a5800000-0000-4000-8000-000000000001'
                  and review_reason = 'delete_failed'), '... with its review flag');
select ok('a5800000-0000-4000-8000-000000000001'::uuid in (select public.signup_review_user_ids()),
  'the unverified-account cleanup is told to leave it alone');

select * from finish();
rollback;
