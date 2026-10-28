-- Sign-up owner proof (review of PR #93, round 2; docs/musteri-yonetimi.md
-- §7.2, §7.5): the send marker Auth's Send SMS hook needs for a phone
-- confirmation code of an unfinished self sign-up, the owner check of every
-- complete, the quarantine of an account that cannot be deleted, and the
-- housekeeping flag. The functions run as the service role (here: postgres)
-- except signup_code_grant, which anon calls.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select testing.reset_to_seed();

create function pg_temp.h(p_text text) returns text language sql immutable
as $$ select encode(extensions.digest(p_text, 'sha256'), 'hex') $$;
create function pg_temp.consents() returns jsonb language sql immutable
as $$ select '{"kvkk_notice_version": "kvkk-v2-taslak", "explicit_text_version": "riza-v2-taslak",
               "explicit_service_improvement": false, "explicit_marketing": false}'::jsonb $$;

-- Three self sign-ups as customer-signup opens them: a fresh one (phone not
-- confirmed), one whose phone a code confirmed, one written before tickets.
insert into auth.users (instance_id, id, aud, role, email, phone, phone_confirmed_at, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a5700000-0000-4000-8000-000000000001', 'authenticated',
        'authenticated', 'pgtap-proof-1@example.test', '905557000001', null, '{"signup": "self"}', now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'a5700000-0000-4000-8000-000000000002', 'authenticated',
        'authenticated', 'pgtap-proof-2@example.test', '905557000002', now(), '{"signup": "self"}', now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'a5700000-0000-4000-8000-000000000003', 'authenticated',
        'authenticated', 'pgtap-proof-3@example.test', '905557000003', now(), '{"signup": "self"}', now(), now());
select public.signup_prepare(('a5700000-0000-4000-8000-00000000000' || n)::uuid, 'Ad Soyad',
  'pgtap-proof-' || n || '@example.test', '+90555700000' || n, 'sms', pg_temp.consents(), null)
from generate_series(1, 3) n;
select public.signup_set_ticket('a5700000-0000-4000-8000-000000000001', pg_temp.h(repeat('a', 43)));
select public.signup_set_ticket('a5700000-0000-4000-8000-000000000002', pg_temp.h(repeat('b', 43)));
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('a5700000-0000-4000-8000-0000000000f2', 'a5700000-0000-4000-8000-000000000002', now(), now()),
       ('a5700000-0000-4000-8000-0000000000f3', 'a5700000-0000-4000-8000-000000000003', now(), now());

-- 2. The send marker ------------------------------------------------------------------

select is(public.signup_sms_allowed('a5700000-0000-4000-8000-000000000001'), false,
  'no confirmation code for an unfinished self sign-up without a grant (Auth''s public resend)');
set local role anon;
select is(public.signup_code_grant('+905557000001', repeat('x', 43)), false, 'a wrong ticket grants nothing');
select is(public.signup_code_grant('+905557000009', repeat('a', 43)), false, 'the right ticket for another phone grants nothing');
select is(public.signup_code_grant('+905557000001', null), false, 'no ticket grants nothing');
select is(public.signup_code_grant('+905557000001', repeat('a', 43)), true, 'the register''s ticket grants one code');
select throws_ok($$ select public.signup_sms_allowed('a5700000-0000-4000-8000-000000000001') $$, '42501',
  null, 'anon cannot ask the hook''s question');
select throws_ok($$ select public.signup_owner_check('a5700000-0000-4000-8000-000000000001', null, false) $$, '42501',
  null, 'anon cannot run the owner check');
select throws_ok($$ select public.signup_quarantine('a5700000-0000-4000-8000-000000000001') $$, '42501',
  null, 'anon cannot quarantine');
reset role;
select ok((select code_send_until between now() + interval '1 minute' and now() + interval '2 minutes'
           from private.customer_signup where user_id = 'a5700000-0000-4000-8000-000000000001'),
  'the grant lasts two minutes');
select is(public.signup_sms_allowed('a5700000-0000-4000-8000-000000000001'), true, 'the hook sends the granted code');
select is(public.signup_sms_allowed('a5700000-0000-4000-8000-000000000001'), false, 'once: the marker is consumed');
update private.customer_signup set code_send_until = now() - interval '1 second'
where user_id = 'a5700000-0000-4000-8000-000000000001';
select is(public.signup_sms_allowed('a5700000-0000-4000-8000-000000000001'), false, 'an expired marker sends nothing');
select is(public.signup_sms_allowed('a5700000-0000-4000-8000-000000000002'), true,
  'a confirmed phone gets its login code without a marker');
update auth.users set phone_change = '905557000099' where id = 'a5700000-0000-4000-8000-000000000002';
select is(public.signup_sms_allowed('a5700000-0000-4000-8000-000000000002'), false,
  'a phone change of an unfinished self sign-up needs a marker too');
update auth.users set phone_change = '' where id = 'a5700000-0000-4000-8000-000000000002';
select is(public.signup_sms_allowed('a0000000-0000-4000-8000-000000000001'), true, 'invited accounts are not affected');
select is(public.signup_sms_allowed('a0000000-0000-4000-8000-000000000006'), true, 'a completed self sign-up is not affected');

-- 1. The owner check ---------------------------------------------------------------------

select is(public.signup_owner_check('a5700000-0000-4000-8000-000000000002', pg_temp.h(repeat('b', 43)), false), 'ok',
  'the register''s ticket proves the registrant');
select is(public.signup_owner_check('a5700000-0000-4000-8000-000000000002', null, true), 'ok',
  'so does a password session');
select is(public.signup_owner_check('a0000000-0000-4000-8000-000000000001', null, false), 'no_pending',
  'nothing pending: no proof needed');
select is(public.signup_owner_check('a0000000-0000-4000-8000-000000000006', null, false), 'already_completed',
  'a completed sign-up: no proof needed');
select is(public.signup_owner_check('a5700000-0000-4000-8000-000000000001', null, false), 'refused',
  'no ticket never skips the check: an unconfirmed phone is refused');
select is(public.signup_owner_check('a5700000-0000-4000-8000-000000000002', pg_temp.h(repeat('a', 43)), false), 'mismatch',
  'another ticket on a confirmed phone: the caller deletes the account');
select is(public.signup_owner_check('a5700000-0000-4000-8000-000000000002', null, false), 'mismatch',
  'no ticket on a confirmed phone: the same');

select is(public.signup_owner_check('a5700000-0000-4000-8000-000000000003', null, false), 'refused',
  'a row written before tickets is refused');
select is((select phone_confirmed_at from auth.users where id = 'a5700000-0000-4000-8000-000000000003'), null,
  '... and its phone confirmation cleared');
select is((select review_reason from private.customer_signup where user_id = 'a5700000-0000-4000-8000-000000000003'),
  'unproven_code', '... and flagged for review');
select is((select count(*) from auth.sessions where user_id = 'a5700000-0000-4000-8000-000000000003'), 0::bigint,
  '... and its sessions ended');

-- 3. A delete that failed ------------------------------------------------------------------

select lives_ok($$ select public.signup_quarantine('a5700000-0000-4000-8000-000000000002') $$,
  'customer-signup quarantines a hijack candidate it could not delete');
select results_eq(
  $$ select u.phone_confirmed_at is null, s.review_reason,
            (select count(*) from auth.sessions x where x.user_id = u.id)
     from auth.users u join private.customer_signup s on s.user_id = u.id
     where u.id = 'a5700000-0000-4000-8000-000000000002' $$,
  $$ values (true, 'delete_failed', 0::bigint) $$,
  'phone confirmation cleared, flagged delete_failed, sessions ended');
create temp table seed_customer as
  select phone_confirmed_at from auth.users where id = 'a0000000-0000-4000-8000-000000000006';
select lives_ok($$ select public.signup_quarantine('a0000000-0000-4000-8000-000000000006') $$,
  'quarantining a completed customer is harmless');
select is((select phone_confirmed_at from auth.users where id = 'a0000000-0000-4000-8000-000000000006'),
  (select phone_confirmed_at from seed_customer), 'quarantine never touches an account with an owner profile');

-- 3. Housekeeping ---------------------------------------------------------------------------

update auth.users set phone_confirmed_at = now() where id = 'a5700000-0000-4000-8000-000000000001';
update private.customer_signup set created_at = now() - interval '2 days'
where user_id = 'a5700000-0000-4000-8000-000000000001';
select is((private.signup_housekeeping() ->> 'signups_flagged')::int, 1,
  'housekeeping flags a confirmed phone left unfinished for a day');

select * from finish();
rollback;
