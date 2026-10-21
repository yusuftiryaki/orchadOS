-- Phone (SMS code) login: limits per number.
--
-- Supabase Auth sends the code through our own provider: the Send SMS hook
-- (supabase/functions/send-sms). Auth itself limits resends per user
-- (auth.sms.max_frequency) and SMS per hour project-wide; these functions add
-- limits per number:
-- - at most 5 codes per number per hour (checked and counted by the hook);
-- - after 5 wrong codes within 15 minutes the number is locked for the rest of
--   those 15 minutes: no new code, no verification (the login page asks
--   phone_login_allowed() before verifying and reports wrong codes).
-- Only accounts that exist get a code at all: sign-ups are off and the login
-- page asks Auth not to create users (invite-user opens the accounts).
--
-- Numbers are kept as SHA-256 hashes, only for an hour's window, and the
-- rows are removed after a day by the notification schedule.

create table private.phone_login_attempt (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('code_sent', 'code_failed')),
  created_at timestamptz not null default now()
);
comment on table private.phone_login_attempt is
  'Login codes sent and wrong codes per number (hashed), for the per-number limits. Kept one day.';
create index phone_login_attempt_idx on private.phone_login_attempt (phone_hash, kind, created_at desc);
alter table private.phone_login_attempt enable row level security;
revoke all on private.phone_login_attempt from public, anon, authenticated;

-- E.164 with or without '+' (Auth hands the hook the number without it).
create function private.phone_hash(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone text := '+' || regexp_replace(coalesce(p_phone, ''), '^\+', '');
begin
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
  end if;
  return encode(extensions.digest(v_phone, 'sha256'), 'hex');
end;
$$;

create function private.phone_login_locked(p_hash text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 5 from private.phone_login_attempt a
  where a.phone_hash = p_hash and a.kind = 'code_failed' and a.created_at > now() - interval '15 minutes';
$$;

-- Hook (service role): may a code go to this number now? Counts it when yes.
create function public.phone_login_code_requested(p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := private.phone_hash(p_phone);
begin
  -- Serialise requests for the same number.
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));
  if private.phone_login_locked(v_hash) then
    return 'locked';
  end if;
  if (select count(*) from private.phone_login_attempt a
      where a.phone_hash = v_hash and a.kind = 'code_sent' and a.created_at > now() - interval '1 hour') >= 5 then
    return 'too_many_codes';
  end if;
  insert into private.phone_login_attempt (phone_hash, kind) values (v_hash, 'code_sent');
  return 'ok';
end;
$$;
comment on function public.phone_login_code_requested(text) is
  'Send SMS hook (service role): ok, too_many_codes (5 per hour) or locked (5 wrong codes in 15 minutes).';

-- Login page (before sign-in, so anon too): may this number verify a code now?
create function public.phone_login_allowed(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.phone_login_locked(private.phone_hash(p_phone));
$$;
comment on function public.phone_login_allowed(text) is
  'Login page: false while the number is locked after 5 wrong codes in 15 minutes.';

-- Login page: a wrong code for this number; returns the attempts left.
create function public.phone_login_record_failure(p_phone text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := private.phone_hash(p_phone);
  v_failed integer;
begin
  insert into private.phone_login_attempt (phone_hash, kind) values (v_hash, 'code_failed');
  select count(*) into v_failed from private.phone_login_attempt a
  where a.phone_hash = v_hash and a.kind = 'code_failed' and a.created_at > now() - interval '15 minutes';
  return greatest(0, 5 - v_failed);
end;
$$;
comment on function public.phone_login_record_failure(text) is
  'Login page: counts a wrong code for the number; returns the attempts left (0: locked for 15 minutes).';

revoke all on function private.phone_hash(text) from public;
revoke all on function private.phone_login_locked(text) from public;
revoke all on function public.phone_login_code_requested(text) from public, anon, authenticated;
revoke all on function public.phone_login_allowed(text) from public;
revoke all on function public.phone_login_record_failure(text) from public;
grant execute on function public.phone_login_code_requested(text) to service_role;
grant execute on function public.phone_login_allowed(text) to anon, authenticated, service_role;
grant execute on function public.phone_login_record_failure(text) to anon, authenticated, service_role;

-- The every-minute schedule also drops old attempts.
create or replace function private.dispatch_notifications()
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
  delete from private.phone_login_attempt where created_at < now() - interval '1 day';

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
