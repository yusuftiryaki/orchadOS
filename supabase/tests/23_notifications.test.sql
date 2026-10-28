-- Notifications: the queue table, its access rules and the triggers that fill it.
-- Seed: owner a0..01 (contact whatsapp), viewer a0..02 (contact sms), field_staff
-- a0..03, expert a0..04, ops a0..05 of org b0..01, parcel c0..01.
-- The whole file is one transaction, so now() is constant: each scenario uses
-- its own visit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Visits: s1 critical finding, s2 report, s3 critical finding approved while publishing.
insert into public.session (id, org_id, parcel_id, kind, status, started_at) values
  ('e3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-10-13 22:30:00+00'),
  ('e3000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-10-14 07:00:00+00'),
  ('e3000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-10-15 07:00:00+00'),
  ('e3000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'inventory', 'in_review', '2026-10-16 07:00:00+00');

insert into public.finding (id, org_id, parcel_id, session_id, kind, severity, description) values
  ('e3f00000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'theft_trace', 'high',
   'Kesilmiş dallar'),
  ('e3f00000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'dead_branch', 'medium',
   'Kuru dal'),
  ('e3f00000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000003', 'pest_sign', 'high',
   'Zararlı belirtisi');

-- Schema ---------------------------------------------------------------------------

select has_table('public', 'notification', 'notification table exists');
select hasnt_column('public', 'notification', 'phone', 'no phone number in the queue');
select enum_has_labels('public', 'notification_channel', array['sms', 'whatsapp'], 'channels');
select enum_has_labels('public', 'notification_status', array['pending', 'sent', 'failed'], 'statuses');
select enum_has_labels('public', 'notification_template',
  array['report_ready', 'critical_finding', 'quote_ready', 'application_rejected', 'payment_received',
        'refund_completed', 'payment_reminder', 'garden_removal_scheduled', 'garden_removal_rescheduled',
        'garden_removal_cancelled', 'garden_removal_completed', 'garden_access_ending',
        'contract_ready', 'withdrawal_received', 'addon_order_closed', 'viewer_invited'],
  'templates (reports, account and garden messages)');
select has_trigger('public', 'session', 'session_notify_published', 'report trigger');
select has_trigger('public', 'finding', 'finding_notify_critical', 'critical finding trigger');
select ok(not has_table_privilege('authenticated', 'public.notification', 'INSERT')
  and not has_table_privilege('authenticated', 'public.notification', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notification', 'DELETE')
  and not has_table_privilege('anon', 'public.notification', 'SELECT'),
  'API users only read the queue; anon not even that');
select throws_ok(
  $$ insert into public.notification (org_id, parcel_id, session_id, recipient_user_id, channel, template, vars)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'sms', 'report_ready',
       '{"parcel_name": "x", "full_name": "Örnek Sahip"}') $$,
  '23514', null, 'template variables beyond parcel name, date and path are rejected');

-- Critical finding -------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(
  pg_temp.error_of($$ select public.approve_finding('e3f00000-0000-4000-8000-000000000001') $$),
  'forbidden', 'field staff cannot approve a finding');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(
  pg_temp.error_of($$ select public.approve_finding('e3f00000-0000-4000-8000-000000000001') $$),
  'forbidden', 'the owner cannot approve a finding');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select isnt((public.approve_finding('e3f00000-0000-4000-8000-000000000001')).approved_at, null,
  'the expert approves a finding ahead of the report');
select lives_ok($$ select public.approve_finding('e3f00000-0000-4000-8000-000000000001') $$,
  'approving twice is a no-op');
select lives_ok($$ select public.approve_finding('e3f00000-0000-4000-8000-000000000002') $$,
  'a medium finding is approved too');
reset role;

select results_eq(
  $$ select recipient_user_id::text, channel::text, status::text, attempts from public.notification
     where template = 'critical_finding' order by recipient_user_id $$,
  $$ values ('a0000000-0000-4000-8000-000000000001', 'whatsapp', 'pending', 0),
            ('a0000000-0000-4000-8000-000000000002', 'sms', 'pending', 0) $$,
  'a high finding: one message for the owner (whatsapp) and one for the viewer (sms)');
select is(
  (select array_agg(distinct finding_id::text) from public.notification where template = 'critical_finding'),
  array['e3f00000-0000-4000-8000-000000000001'], 'only the high finding is notified');
select is(
  (select vars from public.notification
   where template = 'critical_finding' and recipient_user_id = 'a0000000-0000-4000-8000-000000000001'),
  '{"date": "2026-10-14", "path": "/portal/parsel/c0000000-0000-4000-8000-000000000001", "parcel_name": "Örnek Bahçe 1"}'::jsonb,
  'variables: parcel name, visit day in Turkey (01:30 local), portal path');

update public.finding set approved_at = approved_at, severity = 'high'
where id = 'e3f00000-0000-4000-8000-000000000001';
select is((select count(*) from public.notification where template = 'critical_finding'), 2::bigint,
  'touching the approved finding again adds nothing');

-- Report ready -------------------------------------------------------------------------

update public.session set status = 'published' where id = 'e3000000-0000-4000-8000-000000000002';
select results_eq(
  $$ select recipient_user_id::text, channel::text, vars ->> 'date' from public.notification
     where template = 'report_ready' and session_id = 'e3000000-0000-4000-8000-000000000002'
     order by recipient_user_id $$,
  $$ values ('a0000000-0000-4000-8000-000000000001', 'whatsapp', '2026-10-14'),
            ('a0000000-0000-4000-8000-000000000002', 'sms', '2026-10-14') $$,
  'publishing a visit: one report message per owner and viewer');

select is(private.enqueue_notifications('report_ready', 'e3000000-0000-4000-8000-000000000002'), 0,
  'enqueueing the same event again adds nothing');
update public.session set notes = 'after' where id = 'e3000000-0000-4000-8000-000000000002';
select is((select count(*) from public.notification where template = 'report_ready'), 2::bigint,
  'updating a published visit adds nothing');

update public.session set status = 'published' where id = 'e3000000-0000-4000-8000-000000000004';
select is((select count(*) from public.notification where session_id = 'e3000000-0000-4000-8000-000000000004'),
  0::bigint, 'an inventory approval is not a report');

-- Published with a high finding approved in the same transaction (publish_session).
update public.finding set approved_at = now(), approved_by = 'a0000000-0000-4000-8000-000000000004'
where id = 'e3f00000-0000-4000-8000-000000000003';
select is((select count(*) from public.notification where finding_id = 'e3f00000-0000-4000-8000-000000000003'),
  2::bigint, 'approving the high finding enqueues it');
update public.session set status = 'published' where id = 'e3000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select template::text, count(*) from public.notification
     where session_id = 'e3000000-0000-4000-8000-000000000003' group by template $$,
  $$ values ('report_ready', 2::bigint) $$,
  'signing the report with it: the report message covers the critical finding');

-- Sending: claim, report, outbox, schedule ------------------------------------------

select ok(not has_function_privilege('authenticated', 'public.notification_claim(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.notification_report(uuid, text, text, timestamptz, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.message_outbox_list(text, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.message_outbox_record(text, text, text, text, uuid)', 'EXECUTE'),
  'only the service role claims, reports and reads the outbox');

set local role service_role;
create temporary table claimed on commit drop as
  select * from public.notification_claim(2);
select is((select count(*) from claimed), 2::bigint, 'the sender claims up to the limit');
select is(
  (select array_agg(phone order by phone) from claimed),
  array['+905550000001', '+905550000002'],
  'the phone comes from the owner profile at claim time');
select is((select array_agg(distinct attempts) from claimed), array[1], 'the claim counts the attempt');
select is((select count(*) from public.notification_claim(100)), 4::bigint, 'held rows are not claimed twice');

select lives_ok(
  format($$ select public.notification_report(%L, 'sent', p_sent_via => 'record/sms', p_provider_message_id => 'x1') $$,
    (select id from claimed order by phone limit 1)),
  'report: sent');
select throws_ok(
  format($$ select public.notification_report(%L, 'sent') $$, (select id from claimed order by phone limit 1)),
  '55000', 'not_pending', 'a sent message cannot be reported again');
select throws_ok(
  format($$ select public.notification_report(%L, 'retry', 'provider_error:30') $$,
    (select id from claimed order by phone desc limit 1)),
  '22023', 'invalid_input', 'a retry needs a time');
select lives_ok(
  format($$ select public.notification_report(%L, 'retry', 'provider_unreachable', now() + interval '1 minute') $$,
    (select id from claimed order by phone desc limit 1)),
  'report: retry later');
select is((select count(*) from public.notification_claim(100)), 0::bigint, 'a message waiting for its retry is not due');
reset role;

select results_eq(
  $$ select n.status::text, n.sent_via, n.last_error, n.sent_at is not null, n.locked_until is null
     from public.notification n join claimed c on c.id = n.id order by c.phone $$,
  $$ values ('sent', 'record/sms', null::text, true, true),
            ('pending', null::text, 'provider_unreachable', false, true) $$,
  'outcomes are written');
select throws_ok(
  $$ update public.notification set last_error = 'Numara +905550000001 hatalı' where status = 'pending' $$,
  '23514', null, 'errors are reason codes, not free text');

set local role service_role;
select lives_ok(
  $$ select public.notification_report(id, 'failed', 'no_phone') from public.notification
     where status = 'pending' and attempts = 1 and last_error is null $$,
  'report: failed');
select isnt(public.message_outbox_record('sms', '+905550000009', 'Kod 123456', 'login_code'), null,
  'the record provider keeps a message');
select is((select body from public.message_outbox_list('+905550000009')), 'Kod 123456',
  'and tests read it back');
reset role;
select is((select count(*) from public.notification where status = 'failed'), 4::bigint, 'failed messages stay listed');

select is(private.dispatch_notifications(), null, 'without the function URL in Vault the schedule does nothing');
select is((select schedule from cron.job where jobname = 'dispatch-notifications'), '* * * * *',
  'the queue is dispatched every minute');

-- Operations list and retry --------------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.ops_notifications(integer, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.ops_retry_notification(uuid)', 'EXECUTE'),
  'anon has no operations functions');
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('ops_notifications', 'ops_retry_notification')
     and prosecdef),
  array['ops_notifications', 'ops_retry_notification'], 'both are security definer (private schema)');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select count(*) from public.ops_notifications()), 6::bigint, 'ops lists the org''s notifications');
select is((select count(*) from public.ops_notifications(p_status => 'failed')), 4::bigint, 'filtered by status');
select results_eq(
  $$ select distinct recipient_name, recipient_role, recipient_phone from public.ops_notifications()
     order by recipient_phone $$,
  $$ values ('Örnek Sahip', 'owner', '+905550000001'), ('Örnek Hissedar', 'viewer', '+905550000002') $$,
  'with the recipient from the owner profile (masked by the web app)');
select is(
  pg_temp.error_of(format($$ select public.ops_retry_notification(%L) $$,
    (select id from public.notification where status = 'sent' limit 1))),
  'not_failed', 'only a failed message can be retried');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.ops_notifications()), 0::bigint, 'the owner lists nothing');
select is(
  pg_temp.error_of(format($$ select public.ops_retry_notification(%L) $$,
    (select id from public.notification where status = 'failed'
       and recipient_user_id = 'a0000000-0000-4000-8000-000000000001' limit 1))),
  'forbidden', 'the owner cannot retry');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok(
  format($$ select public.ops_retry_notification(%L) $$,
    (select id from public.notification where status = 'failed' order by id limit 1)),
  'ops retries a failed message');
reset role;
select results_eq(
  $$ select status::text, attempts, next_attempt_at <= now() from public.notification
     where id = (select id from public.notification where last_error is not null and status = 'pending'
                 and attempts = 0) $$,
  $$ values ('pending', 0, true) $$,
  'it is due again with a fresh attempt count');

-- Who sees what --------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(
  (select count(*) from public.notification where recipient_user_id <> 'a0000000-0000-4000-8000-000000000001'),
  0::bigint, 'the owner does not see the viewer''s messages');
select is((select count(*) from public.notification), 3::bigint, 'the owner sees their own messages');
select is(pg_temp.error_of($$ update public.notification set status = 'sent', sent_at = now() $$),
  'permission denied for table notification', 'the owner cannot change a message');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is((select count(*) from public.notification), 3::bigint, 'the viewer sees their own messages');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select count(*) from public.notification), 6::bigint, 'ops sees every message of its org');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is((select count(*) from public.notification), 0::bigint, 'field staff sees none');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*) from public.notification), 0::bigint, 'the expert sees none');
reset role;

set local role anon;
select is(pg_temp.error_of($$ select count(*) from public.notification $$),
  'permission denied for table notification', 'anon reads nothing');
reset role;

delete from auth.users where id = 'a0000000-0000-4000-8000-000000000002';
select is((select count(*) from public.notification where recipient_user_id = 'a0000000-0000-4000-8000-000000000002'),
  0::bigint, 'deleting an account removes its messages');

-- Phone login limits -------------------------------------------------------------------

-- Start from no attempts (rolled back with the rest).
delete from private.phone_login_attempt;

select hasnt_column('private', 'phone_login_attempt', 'phone', 'login attempts keep a hash, not the number');
select ok(has_function_privilege('anon', 'public.phone_login_allowed(text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.phone_login_record_failure(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.phone_login_code_requested(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.phone_login_code_requested(text)', 'EXECUTE'),
  'the login page checks and reports wrong codes; only the SMS hook counts codes');

set local role service_role;
select results_eq(
  $$ select public.phone_login_code_requested(case when i % 2 = 0 then '+905559990001' else '905559990001' end)
     from generate_series(1, 6) i $$,
  $$ values ('ok'), ('ok'), ('ok'), ('ok'), ('ok'), ('too_many_codes') $$,
  'five codes an hour per number, with or without the plus sign');
select is(public.phone_login_code_requested('+905559990002'), 'ok', 'other numbers are not affected');
select throws_ok($$ select public.phone_login_code_requested('0532 123') $$, '22023', 'invalid_input',
  'a malformed number is rejected');
reset role;

set local role anon;
select results_eq(
  $$ select public.phone_login_record_failure('+905559990002') from generate_series(1, 5) $$,
  $$ values (4), (3), (2), (1), (0) $$,
  'wrong codes count down the attempts left');
select is(public.phone_login_allowed('+905559990002'), false, 'after five wrong codes the number is locked');
select is(public.phone_login_allowed('+905559990003'), true, 'other numbers may still verify');
reset role;
set local role service_role;
select is(public.phone_login_code_requested('+905559990002'), 'locked', 'a locked number gets no new code');
reset role;
select is((select count(*) from private.phone_login_attempt), 11::bigint, 'codes sent and wrong codes are counted; refused requests are not');

select * from finish();
rollback;
