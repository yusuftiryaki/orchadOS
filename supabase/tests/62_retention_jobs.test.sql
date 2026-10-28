-- T09 (H25, H27): the three named purge jobs exist and delete only expired
-- rows (notifications 12 months, ended auth sessions 30 days, auth audit log
-- 30 days). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select testing.reset_to_seed();

select set_eq($$ select jobname from cron.job where jobname in ('notification-purge', 'auth-session-purge', 'auth-audit-log-purge') $$,
  array['notification-purge', 'auth-session-purge', 'auth-audit-log-purge'], 'the three purge jobs are scheduled');
select set_eq($$ select command from cron.job where jobname in ('notification-purge', 'auth-session-purge', 'auth-audit-log-purge') $$,
  array['select private.purge_notifications()', 'select private.purge_auth_sessions()', 'select private.purge_auth_audit_log()'],
  'they call the purge functions');
select ok(not has_function_privilege('authenticated', 'private.purge_auth_audit_log()', 'EXECUTE'),
  'API users cannot run a purge');

-- Notifications: one 13 months old (with an outbox row), one 11 months old.
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('62000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2025-09-01 07:00:00+00'),
       ('62000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2025-11-01 07:00:00+00');
delete from public.notification where session_id in ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002');
insert into public.notification (id, org_id, parcel_id, session_id, recipient_user_id, channel, template, vars, created_at)
values ('62000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'sms', 'report_ready', '{}',
        now() - interval '13 months'),
       ('62000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '62000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'sms', 'report_ready', '{}',
        now() - interval '11 months');
insert into private.message_outbox (channel, recipient, body, purpose, notification_id)
values ('sms', '+905550000001', 'x', 'notification', '62000000-0000-4000-8000-000000000011'),
       ('sms', '+905550000001', 'y', 'notification', '62000000-0000-4000-8000-000000000012');

select is(private.purge_notifications(), 1, 'one notification is past 12 months');
select set_eq($$ select id from public.notification where id::text like '62000000%' $$,
  array['62000000-0000-4000-8000-000000000012'::uuid], 'the 11-month-old notification stays');
select is((select count(*)::int from private.message_outbox where notification_id::text like '62000000%'), 1,
  'the old one''s outbox row is gone, the newer one''s stays');

-- Auth sessions: ended 45 days ago, idle 40 days (not ended: stays, T09),
-- active, ended 10 days ago.
insert into auth.sessions (id, user_id, created_at, updated_at, not_after, refreshed_at) values
  ('62000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000001',
   now() - interval '90 days', now() - interval '90 days', now() - interval '45 days', null),
  ('62000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000001',
   now() - interval '60 days', now() - interval '40 days', null, (now() - interval '40 days') at time zone 'UTC'),
  ('62000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000001',
   now() - interval '60 days', now() - interval '2 days', null, (now() - interval '2 days') at time zone 'UTC'),
  ('62000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000001',
   now() - interval '20 days', now() - interval '20 days', now() - interval '10 days', null);
select is(private.purge_auth_sessions(), 1, 'one session ended more than 30 days ago');
select set_eq($$ select id from auth.sessions where id::text like '62000000%' $$,
  array['62000000-0000-4000-8000-000000000022'::uuid, '62000000-0000-4000-8000-000000000023'::uuid,
        '62000000-0000-4000-8000-000000000024'::uuid],
  'an idle session, an active one and one ended 10 days ago stay');

-- Auth audit log: 31 and 29 days.
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-4000-8000-000000000031', '{}', now() - interval '31 days', '203.0.113.1'),
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-4000-8000-000000000032', '{}', now() - interval '29 days', '203.0.113.2');
select cmp_ok(private.purge_auth_audit_log(), '>=', 1, 'the purge deletes old entries');
select is_empty($$ select id from auth.audit_log_entries where created_at < now() - interval '30 days' $$,
  'no audit entry older than 30 days remains');
select set_eq($$ select id from auth.audit_log_entries where id::text like '62000000%' $$,
  array['62000000-0000-4000-8000-000000000032'::uuid], 'the 29-day-old entry stays');

-- Missing privilege on a hosted project: the purge warns and returns null.
select ok(pg_get_functiondef('private.purge_auth_audit_log()'::regprocedure) like '%when insufficient_privilege%',
  'the audit log purge tolerates a missing privilege');
select ok(pg_get_functiondef('private.purge_auth_sessions()'::regprocedure) like '%when insufficient_privilege%',
  'so does the session purge');

select * from finish();
rollback;
