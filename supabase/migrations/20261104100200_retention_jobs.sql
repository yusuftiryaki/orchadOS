-- T09 (H25, H27; publication condition): short retention jobs.
--
-- pg_cron jobs, named as the deployment checks expect them:
--   notification-purge     daily: notifications older than 12 months and their
--                          outbox rows (outbox rows are dropped after 7 days
--                          anyway by dispatch_notifications)
--   auth-session-purge     daily: ended GoTrue sessions older than 30 days.
--                          Ended: past not_after, or no refresh for 30 days
--                          (an abandoned session; signing out already deletes
--                          the row). Refresh tokens and MFA claims cascade.
--   auth-audit-log-purge   daily: auth.audit_log_entries older than 30 days on
--                          every project (H27: "Giriş sisteminin denetim
--                          kayıtlarındaki IP en fazla 30 gün içinde silinir").
--                          On the shared test project this also covers the demo
--                          (docs/demo-turu.md §15.1).
-- Each purge also runs once here, so the first deploy leaves no older row.
-- A hosted project where the migration role may not touch the auth schema
-- does not fail: the function warns and returns null, like
-- public.demo_purge_audit_log (docs/hukuk/saklama-imha-politikasi.md §5).
--
-- Already in place (checked, unchanged): pending sign-ups 24 hours and
-- sign-up attempts 2 days (signup_housekeeping, hourly), unverified accounts
-- 24 hours (signup-cleanup), the message outbox (login-code send log) 7 days
-- and phone-login attempts 1 day (dispatch_notifications, every minute), demo
-- IP hashes 48 hours (demo_housekeeping).

create function private.purge_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from private.message_outbox o
  where o.notification_id in (
    select x.id from public.notification x where x.created_at < now() - interval '12 months');
  delete from public.notification x where x.created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function private.purge_notifications() is
  'T09 (pg_cron notification-purge): deletes notifications older than 12 months and their outbox rows.';

create function private.purge_auth_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.sessions s
  where (s.not_after is not null and s.not_after < now() - interval '30 days')
     or greatest(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at) < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
exception
  when insufficient_privilege or undefined_table or undefined_column then
    raise warning 'purge_auth_sessions: skipped (%)', sqlstate;
    return null;
end;
$$;
comment on function private.purge_auth_sessions() is
  'T09 (pg_cron auth-session-purge): deletes GoTrue sessions ended (not_after passed or no refresh) more than 30 days ago; null without privilege.';

create function private.purge_auth_audit_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.audit_log_entries e where e.created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
exception
  when insufficient_privilege or undefined_table or undefined_column then
    raise warning 'purge_auth_audit_log: skipped (%)', sqlstate;
    return null;
end;
$$;
comment on function private.purge_auth_audit_log() is
  'T09, H27 (pg_cron auth-audit-log-purge): deletes GoTrue audit log entries (with IP addresses) older than 30 days; null without privilege.';

revoke all on function private.purge_notifications() from public;
revoke all on function private.purge_auth_sessions() from public;
revoke all on function private.purge_auth_audit_log() from public;

select cron.schedule('notification-purge', '41 2 * * *', 'select private.purge_notifications()');
select cron.schedule('auth-session-purge', '47 2 * * *', 'select private.purge_auth_sessions()');
select cron.schedule('auth-audit-log-purge', '53 2 * * *', 'select private.purge_auth_audit_log()');

-- The first deploy leaves nothing older than the limits.
select private.purge_notifications();
select private.purge_auth_sessions();
select private.purge_auth_audit_log();
