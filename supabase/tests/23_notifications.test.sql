-- Notifications: the queue table, its access rules and the triggers that fill it.
-- Seed: owner a0..01 (contact whatsapp), viewer a0..02 (contact sms), field_staff
-- a0..03, expert a0..04, ops a0..05 of org b0..01, parcel c0..01.
-- The whole file is one transaction, so now() is constant: each scenario uses
-- its own visit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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
select enum_has_labels('public', 'notification_template', array['report_ready', 'critical_finding'], 'templates');
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

select * from finish();
rollback;
