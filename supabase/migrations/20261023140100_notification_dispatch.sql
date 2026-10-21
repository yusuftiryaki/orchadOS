-- Notifications v0.1: sending the queue (supabase/functions/send-notifications).
--
-- 1. notification_claim(): the sender takes due pending rows (oldest first,
--    skipping rows another run holds), counts the attempt, holds them for
--    5 minutes and gets each row's phone number from private.owner_profile.
--    This is the only place the phone joins the queue; it is not stored.
-- 2. notification_report(): the sender writes the outcome: sent, retry at a
--    given time (backoff is computed by the sender), or failed.
-- 3. private.message_outbox: what the record provider "sends" (development,
--    tests, the hosted test project). Integration tests read login codes from
--    it. Personal data (phone, message): service role only, kept 7 days.
-- 4. Schedule: pg_cron runs private.dispatch_notifications() every minute. It
--    posts to the Edge Function only when something is due and when the
--    function URL and a service role key are in Vault
--    (notifications_dispatch_url, notifications_service_key). Without them
--    (local stack, CI) it does nothing; tests call the function directly.
--    pg_cron and pg_net are available on the free plan.
-- All functions here are for the service role only.

-- ---------------------------------------------------------------------------
-- 1-2. Claim and report
-- ---------------------------------------------------------------------------

create function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid,
  channel text,
  template text,
  vars jsonb,
  attempts integer,
  phone text
)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select n.id
    from public.notification n
    where n.status = 'pending'
      and n.next_attempt_at <= now()
      and (n.locked_until is null or n.locked_until < now())
    order by n.next_attempt_at, n.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  ),
  claimed as (
    update public.notification n
    set attempts = n.attempts + 1,
        locked_until = now() + interval '5 minutes'
    from due
    where n.id = due.id
    returning n.id, n.org_id, n.recipient_user_id, n.channel, n.template, n.vars, n.attempts, n.created_at
  )
  select c.id, c.channel::text, c.template::text, c.vars, c.attempts, op.phone
  from claimed c
  left join private.owner_profile op on op.org_id = c.org_id and op.user_id = c.recipient_user_id
  order by c.created_at;
$$;
comment on function public.notification_claim(integer) is
  'Sender only (service role): takes due notifications with the recipient''s phone, counting the attempt.';

create function public.notification_report(
  p_id uuid,
  p_outcome text,
  p_error text default null,
  p_retry_at timestamptz default null,
  p_sent_via text default null,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('sent', 'retry', 'failed') or (p_outcome = 'retry' and p_retry_at is null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'outcome';
  end if;
  update public.notification n
  set status = case p_outcome when 'sent' then 'sent' when 'retry' then 'pending' else 'failed' end::public.notification_status,
      sent_at = case when p_outcome = 'sent' then now() end,
      last_error = case when p_outcome = 'sent' then null else p_error end,
      next_attempt_at = case when p_outcome = 'retry' then p_retry_at else n.next_attempt_at end,
      sent_via = coalesce(p_sent_via, n.sent_via),
      provider_message_id = case when p_outcome = 'sent' then p_provider_message_id else n.provider_message_id end,
      locked_until = null
  where n.id = p_id and n.status = 'pending';
  if not found then
    raise exception 'not_pending' using errcode = '55000';
  end if;
end;
$$;
comment on function public.notification_report(uuid, text, text, timestamptz, text, text) is
  'Sender only (service role): outcome of one attempt (sent / retry at / failed with a reason code).';

-- ---------------------------------------------------------------------------
-- 3. Record provider outbox
-- ---------------------------------------------------------------------------

create table private.message_outbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'record',
  channel public.notification_channel not null,
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{6,14}$'),
  body text not null check (length(body) between 1 and 1000),
  purpose text not null check (purpose in ('notification', 'login_code')),
  notification_id uuid,
  created_at timestamptz not null default now()
);
comment on table private.message_outbox is
  'Messages the record provider kept instead of sending (development, tests, test project). Personal data; 7 days.';
create index message_outbox_recipient_idx on private.message_outbox (recipient, created_at desc);
alter table private.message_outbox enable row level security;
revoke all on private.message_outbox from public, anon, authenticated;
grant select, insert, delete on private.message_outbox to service_role;

create function public.message_outbox_record(
  p_channel text,
  p_recipient text,
  p_body text,
  p_purpose text,
  p_notification_id uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into private.message_outbox (channel, recipient, body, purpose, notification_id)
  values (p_channel::public.notification_channel, p_recipient, p_body, p_purpose, p_notification_id)
  returning id;
$$;
comment on function public.message_outbox_record(text, text, text, text, uuid) is
  'Record provider (service role): keeps a message instead of sending it.';

create function public.message_outbox_list(p_recipient text, p_limit integer default 20)
returns table (
  id uuid,
  channel text,
  recipient text,
  body text,
  purpose text,
  notification_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.channel::text, o.recipient, o.body, o.purpose, o.notification_id, o.created_at
  from private.message_outbox o
  where o.recipient = p_recipient
  order by o.created_at desc, o.id
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
comment on function public.message_outbox_list(text, integer) is
  'Service role (tests, test project): latest recorded messages for one number.';

revoke all on function public.notification_claim(integer) from public, anon, authenticated;
revoke all on function public.notification_report(uuid, text, text, timestamptz, text, text)
  from public, anon, authenticated;
revoke all on function public.message_outbox_record(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.message_outbox_list(text, integer) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;
grant execute on function public.notification_report(uuid, text, text, timestamptz, text, text) to service_role;
grant execute on function public.message_outbox_record(text, text, text, text, uuid) to service_role;
grant execute on function public.message_outbox_list(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Schedule
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function private.dispatch_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  delete from private.message_outbox where created_at < now() - interval '7 days';

  if not exists (
    select 1 from public.notification n
    where n.status = 'pending' and n.next_attempt_at <= now()
      and (n.locked_until is null or n.locked_until < now())
  ) then
    return null;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'notifications_dispatch_url';
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'notifications_service_key';
  if coalesce(v_url, '') = '' or coalesce(v_key, '') = '' then
    return null;
  end if;

  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
comment on function private.dispatch_notifications() is
  'Every minute (pg_cron): calls send-notifications when something is due and Vault holds its URL and key.';
revoke all on function private.dispatch_notifications() from public;

select cron.schedule('dispatch-notifications', '* * * * *', 'select private.dispatch_notifications()');
