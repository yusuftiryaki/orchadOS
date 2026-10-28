-- IP13-A / 1: demo tour access (docs/demo-turu.md §4, §5).
--
-- A prospective customer gets a short-lived, read-only demo account: the
-- demo-start Edge Function opens it with the Admin API (app_metadata.demo =
-- true, no password, no phone, a random undeliverable e-mail), demo_start()
-- gives it owner access to the active parcels of the one enabled demo org,
-- the cleanup action deletes it when its session is over.
--
-- 1. Registry tables in private (no grants to anon or authenticated, RLS on
--    without policies): demo_org, demo_parcel, demo_session, demo_attempt.
-- 2. Claim and account helpers: authz.is_demo_user(), authz.is_demo_account(),
--    authz.is_demo_org(), private.is_demo_org(), private.assert_not_demo().
-- 3. Edge entry points (service_role): demo_admit, demo_start,
--    demo_expired_accounts, demo_undeletable_count, demo_purge_audit_log.
-- 4. Visitor entry points (authenticated): demo_info, demo_end, demo_hit.
-- 5. Cron: demo-cleanup (Edge, every 15 minutes) and demo-housekeeping (SQL,
--    every 5 minutes; 20261101120200_demo_account_lockdown.sql replaces it).
-- 6. Billing guard: a demo org never accepts sign-ups or fake payments.
--
-- Deployed to every project (test, pilot, demo). Without a demo_org row every
-- object here is inert. The public demo runs only on the dedicated demo
-- project (§3.4).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table private.demo_org (
  org_id uuid primary key references public.org (id) on delete cascade,
  enabled boolean not null default false,
  session_ttl interval not null default '3 hours'
    check (session_ttl between interval '15 minutes' and interval '24 hours'),
  max_active_sessions integer not null default 200 check (max_active_sessions > 0),
  max_daily_starts integer not null default 500 check (max_daily_starts > 0),
  ip_hourly_limit integer not null default 10 check (ip_hourly_limit > 0),
  ip_daily_limit integer not null default 40 check (ip_daily_limit > 0),
  max_sign_calls integer not null default 600 check (max_sign_calls > 0),
  max_pdf_renders integer not null default 30 check (max_pdf_renders > 0),
  -- E-mail domain of the visitor accounts (§7).
  visitor_email_domain text not null default 'demo.orchados.invalid'
    check (visitor_email_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  -- Targets of the guided tour; written by the loader (§8.1).
  tour jsonb not null default '{}'::jsonb,
  dataset_version integer,
  dataset_sha256 text,
  dataset_source text not null default 'synthetic' check (dataset_source in ('synthetic', 'showcase')),
  -- null: loading is in progress or was left half done.
  loaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or loaded_at is not null)
);
comment on table private.demo_org is
  'Demo tour (IP13): the org whose parcels demo visitors see, with the limits of the tour. At most one is enabled.';
comment on column private.demo_org.tour is
  'Guided tour targets: parcel_id, tree_id, session_id, previous_session_id, inventory_session_id (uuids; a missing key skips its step).';
-- At most one enabled demo org.
create unique index demo_org_one_enabled on private.demo_org ((true)) where enabled;

create trigger demo_org_touch_updated_at before update on private.demo_org
for each row execute function private.touch_updated_at();

create table private.demo_parcel (
  parcel_id uuid primary key references public.parcel (id) on delete cascade,
  org_id uuid not null references private.demo_org (org_id) on delete cascade,
  sort_order integer not null default 0,
  active boolean not null default true
);
comment on table private.demo_parcel is 'Demo tour (IP13): parcels of the demo org that visitors get owner access to.';
create index demo_parcel_org_id_idx on private.demo_parcel (org_id);

create table private.demo_session (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references private.demo_org (org_id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  sign_calls integer not null default 0,
  pdf_renders integer not null default 0
);
comment on table private.demo_session is
  'Demo tour (IP13): one row per visitor account; access ends at expires_at, cleanup deletes the account afterwards.';
create index demo_session_expires_at_idx on private.demo_session (expires_at);
create index demo_session_org_id_idx on private.demo_session (org_id);

-- One row per bucket, outcome and minute: rejected requests do not pile up rows.
create table private.demo_attempt (
  ip_hash text not null,
  outcome text not null check (outcome in ('admitted', 'rate_limited', 'capacity', 'closed')),
  minute timestamptz not null,  -- date_trunc('minute', now())
  hits integer not null default 1 check (hits > 0),
  primary key (ip_hash, outcome, minute)
);
comment on table private.demo_attempt is
  'Demo tour (IP13): start counters per HMAC of the IP bucket (IPv4 address, IPv6 /64), outcome and minute; kept 48 hours.';
create index demo_attempt_outcome_minute_idx on private.demo_attempt (outcome, minute);

revoke all on private.demo_org, private.demo_parcel, private.demo_session, private.demo_attempt
  from public, anon, authenticated;
grant select, insert, update, delete on private.demo_org, private.demo_parcel, private.demo_session,
  private.demo_attempt to service_role;
alter table private.demo_org enable row level security;
alter table private.demo_parcel enable row level security;
alter table private.demo_session enable row level security;
alter table private.demo_attempt enable row level security;

-- A demo parcel belongs to its demo org.
create function private.demo_parcel_org_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.parcel p where p.id = new.parcel_id and p.org_id = new.org_id) then
    raise exception 'demo_parcel_org_mismatch' using errcode = '23514',
      detail = 'the parcel must belong to the demo org';
  end if;
  return new;
end;
$$;
comment on function private.demo_parcel_org_check() is 'Trigger: a demo_parcel row names a parcel of its own demo org.';

create trigger demo_parcel_org_check before insert or update on private.demo_parcel
for each row execute function private.demo_parcel_org_check();

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- The request comes from a demo visitor (claim set by demo-start's account).
create function authz.is_demo_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'demo', '') = 'true';
$$;
comment on function authz.is_demo_user() is
  'Demo tour: true when the request''s JWT carries app_metadata.demo = true (a demo visitor).';

-- The account is a demo visitor account (read from auth.users, not the claim).
create function authz.is_demo_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id and coalesce(u.raw_app_meta_data ->> 'demo', '') = 'true'
  );
$$;
comment on function authz.is_demo_account(uuid) is
  'Demo tour: true when the auth account has app_metadata.demo = true.';

create function private.is_demo_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.demo_org d where d.org_id = p_org_id);
$$;
comment on function private.is_demo_org(uuid) is 'Demo tour: the org is registered as a demo org (enabled or not).';

-- Same, callable where the caller has no usage on private (policies and
-- security invoker functions run as authenticated).
create function authz.is_demo_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_demo_org(p_org_id);
$$;
comment on function authz.is_demo_org(uuid) is
  'Demo tour: private.is_demo_org for policies and security invoker functions.';

create function private.assert_not_demo()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if authz.is_demo_user() then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
end;
$$;
comment on function private.assert_not_demo() is 'Demo tour: raises demo_read_only (42501) for a demo visitor''s request.';

-- ---------------------------------------------------------------------------
-- 3. Edge entry points (service_role)
-- ---------------------------------------------------------------------------

-- Counts one start request of an IP bucket in its (outcome, minute) row.
create function private.demo_count_attempt(p_ip_hash text, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.demo_attempt (ip_hash, outcome, minute)
  values (p_ip_hash, p_outcome, date_trunc('minute', now()))
  on conflict (ip_hash, outcome, minute) do update set hits = private.demo_attempt.hits + 1;
$$;
comment on function private.demo_count_attempt(text, text) is 'Demo tour: counts a start request in demo_attempt.';

-- Whether a start may go ahead: the limits of §4. Only admitted starts count
-- towards the limits; every outcome is counted in its own row.
create function public.demo_admit(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d private.demo_org;
  v_ip text := coalesce(nullif(btrim(p_ip_hash), ''), 'unknown');
begin
  perform pg_advisory_xact_lock(hashtext('orchados.demo_admit'));

  select * into d from private.demo_org where enabled;
  if not found then
    perform private.demo_count_attempt(v_ip, 'closed');
    return jsonb_build_object('ok', false, 'error', 'demo_closed');
  end if;

  if coalesce((select sum(a.hits) from private.demo_attempt a
               where a.ip_hash = v_ip and a.outcome = 'admitted'
                 and a.minute > now() - interval '1 hour'), 0) >= d.ip_hourly_limit
     or coalesce((select sum(a.hits) from private.demo_attempt a
                  where a.ip_hash = v_ip and a.outcome = 'admitted'
                    and a.minute > now() - interval '1 day'), 0) >= d.ip_daily_limit then
    perform private.demo_count_attempt(v_ip, 'rate_limited');
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if (select count(*) from private.demo_session s
      where s.expires_at > now() and s.ended_at is null) >= d.max_active_sessions
     or coalesce((select sum(a.hits) from private.demo_attempt a
                  where a.outcome = 'admitted' and a.minute > now() - interval '24 hours'), 0)
        >= d.max_daily_starts then
    perform private.demo_count_attempt(v_ip, 'capacity');
    return jsonb_build_object('ok', false, 'error', 'demo_capacity');
  end if;

  perform private.demo_count_attempt(v_ip, 'admitted');
  return jsonb_build_object(
    'ok', true,
    'org_id', d.org_id,
    'ttl_seconds', extract(epoch from d.session_ttl)::integer,
    'email_domain', d.visitor_email_domain
  );
end;
$$;
comment on function public.demo_admit(text) is
  'demo-start (service role): checks the IP and total limits under a lock and counts the request; {ok, org_id, ttl_seconds, email_domain} or {ok: false, error}.';

-- Opens the demo session of an account demo-start has just created and gives
-- it owner access to the active demo parcels. A second call returns the same.
-- Errors: not_demo_account (22023), demo_closed, demo_capacity (P0001).
create function public.demo_start(p_user_id uuid, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d private.demo_org;
  u auth.users;
  s private.demo_session;
begin
  perform pg_advisory_xact_lock(hashtext('orchados.demo_admit'));

  select * into d from private.demo_org where enabled;
  if not found then
    raise exception 'demo_closed' using errcode = 'P0001';
  end if;

  -- GoTrue's Admin API stores a random password hash when it is given none:
  -- a fresh visitor account loses it here (nobody knows it; the account only
  -- signs in with the magic link of demo-start).
  update auth.users au
  set encrypted_password = ''
  where au.id = p_user_id
    and coalesce(au.raw_app_meta_data ->> 'demo', '') = 'true'
    and au.created_at > now() - interval '10 minutes'
    and au.phone is null
    and lower(coalesce(au.email, '')) like '%@' || d.visitor_email_domain
    and coalesce(au.encrypted_password, '') <> ''
    and not exists (select 1 from private.demo_session x where x.user_id = au.id);

  select * into u from auth.users where id = p_user_id;
  if not found
     or coalesce(u.raw_app_meta_data ->> 'demo', '') <> 'true'
     or u.created_at <= now() - interval '10 minutes'
     or u.phone is not null
     or lower(coalesce(u.email, '')) not like '%@' || d.visitor_email_domain
     or coalesce(u.encrypted_password, '') <> ''
     or exists (select 1 from public.membership m where m.user_id = u.id)
     or exists (select 1 from private.owner_profile p where p.user_id = u.id) then
    raise exception 'not_demo_account' using errcode = '22023';
  end if;

  select * into s from private.demo_session where user_id = u.id;
  if not found then
    if (select count(*) from private.demo_session x
        where x.expires_at > now() and x.ended_at is null) >= d.max_active_sessions then
      raise exception 'demo_capacity' using errcode = 'P0001';
    end if;
    insert into private.demo_session (user_id, org_id, ip_hash, expires_at)
    values (u.id, d.org_id, coalesce(nullif(btrim(p_ip_hash), ''), 'unknown'), now() + d.session_ttl)
    on conflict (user_id) do nothing;
    select * into s from private.demo_session where user_id = u.id;
  end if;

  insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
  select dp.org_id, dp.parcel_id, u.id, 'owner', null
  from private.demo_parcel dp
  where dp.org_id = s.org_id and dp.active
    and s.expires_at > now() and s.ended_at is null
  on conflict (parcel_id, user_id) do nothing;

  return jsonb_build_object(
    'org_id', s.org_id,
    'expires_at', s.expires_at,
    'parcel_ids', coalesce((
      select jsonb_agg(dp.parcel_id order by dp.sort_order, dp.parcel_id)
      from private.demo_parcel dp
      where dp.org_id = s.org_id and dp.active), '[]'::jsonb),
    'next', '/portal?tur=bahceler'
  );
end;
$$;
comment on function public.demo_start(uuid, text) is
  'demo-start (service role): validates a fresh demo account, writes its demo_session and owner access to the active demo parcels; idempotent.';

-- Deletable demo accounts (§7): an expired session, or an orphan (no session,
-- older than a day) that also looks exactly like a visitor account. Never an
-- account with a membership, profile, consent or sign-up row.
create function public.demo_expired_accounts(p_limit integer default 200, p_exclude uuid[] default '{}')
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where coalesce(u.raw_app_meta_data ->> 'demo', '') = 'true'
    and not (u.id = any(coalesce(p_exclude, '{}')))
    and not exists (select 1 from public.membership m where m.user_id = u.id)
    and not exists (select 1 from private.owner_profile p where p.user_id = u.id)
    and not exists (select 1 from private.billing_profile b where b.user_id = u.id)
    and not exists (select 1 from private.consent_record c where c.user_id = u.id)
    and not exists (select 1 from private.customer_signup c where c.user_id = u.id)
    and (
      exists (select 1 from private.demo_session s where s.user_id = u.id and s.expires_at <= now())
      or (
        u.created_at < now() - interval '1 day'
        and not exists (select 1 from private.demo_session s where s.user_id = u.id)
        and u.phone is null
        and exists (
          select 1 from private.demo_org d
          where lower(coalesce(u.email, '')) like 'ziyaretci-%@' || d.visitor_email_domain)
        and not exists (
          select 1 from public.parcel_access pa
          where pa.user_id = u.id and not private.is_demo_org(pa.org_id))
      )
    )
  order by u.created_at, u.id
  limit greatest(coalesce(p_limit, 200), 0);
$$;
comment on function public.demo_expired_accounts(integer, uuid[]) is
  'demo-start cleanup (service role): demo accounts that may be deleted (expired session, or a clean orphan older than a day), minus p_exclude.';

-- Demo-flag accounts that are due (expired, or older than a day without a
-- session) but fail the deletion rules: a human looks at them.
create function public.demo_undeletable_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from auth.users u
  where coalesce(u.raw_app_meta_data ->> 'demo', '') = 'true'
    and (
      exists (select 1 from private.demo_session s where s.user_id = u.id and s.expires_at <= now())
      or (u.created_at < now() - interval '1 day'
          and not exists (select 1 from private.demo_session s where s.user_id = u.id))
    )
    and u.id not in (select public.demo_expired_accounts(2147483647, '{}'));
$$;
comment on function public.demo_undeletable_count() is
  'demo-start cleanup (service role): number of due demo accounts the deletion rules keep (logged as a number only).';

-- GoTrue's audit rows of deleted demo accounts (they hold the IP). Best
-- effort: 0 where the table is missing or not ours to delete from.
create function public.demo_purge_audit_log(p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if coalesce(cardinality(p_user_ids), 0) = 0 then
    return 0;
  end if;
  delete from auth.audit_log_entries e
  where e.payload ->> 'actor_id' = any(p_user_ids::text[]);
  get diagnostics n = row_count;
  return n;
exception
  when insufficient_privilege or undefined_table then
    return 0;
end;
$$;
comment on function public.demo_purge_audit_log(uuid[]) is
  'demo-start cleanup (service role): deletes auth.audit_log_entries of these accounts; 0 without privilege or table.';

-- ---------------------------------------------------------------------------
-- 4. Visitor entry points (authenticated)
-- ---------------------------------------------------------------------------

-- The caller's demo tour, or null for anyone without a demo session.
create function public.demo_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'org_id', s.org_id,
    'expires_at', s.expires_at,
    'tour', d.tour,
    'parcels', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by dp.sort_order, p.id)
      from private.demo_parcel dp
      join public.parcel p on p.id = dp.parcel_id
      where dp.org_id = s.org_id and dp.active), '[]'::jsonb)
  )
  from private.demo_session s
  join private.demo_org d on d.org_id = s.org_id
  where s.user_id = (select auth.uid());
$$;
comment on function public.demo_info() is
  'Demo visitor: {org_id, expires_at, tour, parcels: [{id, name}]} of the caller''s demo session; null for anyone else.';

-- "Demodan çık": ends the caller's own demo session now.
create function public.demo_end()
returns void
language sql
security definer
set search_path = ''
as $$
  update private.demo_session
  set expires_at = least(expires_at, now()),
      ended_at = coalesce(ended_at, now())
  where user_id = (select auth.uid());
$$;
comment on function public.demo_end() is 'Demo visitor: ends the caller''s own demo session.';

-- Counts one image signing ('sign') or PDF ('pdf') call of the caller's active
-- demo session; false over the cap or without an active session.
create function public.demo_hit(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_cap integer;
begin
  if p_kind is null or p_kind not in ('sign', 'pdf') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_kind';
  end if;
  update private.demo_session s
  set sign_calls = s.sign_calls + case when p_kind = 'sign' then 1 else 0 end,
      pdf_renders = s.pdf_renders + case when p_kind = 'pdf' then 1 else 0 end
  from private.demo_org d
  where s.user_id = (select auth.uid())
    and d.org_id = s.org_id
    and s.expires_at > now() and s.ended_at is null
  returning case when p_kind = 'sign' then s.sign_calls else s.pdf_renders end,
            case when p_kind = 'sign' then d.max_sign_calls else d.max_pdf_renders end
  into v_used, v_cap;
  if not found then
    return false;
  end if;
  return v_used <= v_cap;
end;
$$;
comment on function public.demo_hit(text) is
  'Demo visitor: counts an image signing (sign) or PDF (pdf) call; false over the session cap or without an active session.';

-- ---------------------------------------------------------------------------
-- 5. Cron
-- ---------------------------------------------------------------------------

-- Asks demo-start to delete the expired demo accounts (Admin API). Needs
-- Vault's demo_cleanup_url and orchados_cron_secret; does nothing without them.
create function private.dispatch_demo_cleanup()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'demo_cleanup_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'orchados_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-orchados-cron-secret', v_secret),
    body := '{"action": "cleanup"}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
comment on function private.dispatch_demo_cleanup() is
  'Every 15 minutes (pg_cron): calls demo-start''s cleanup action when Vault holds its URL and the cron secret.';

-- First version; 20261101120200_demo_account_lockdown.sql replaces it.
create function private.demo_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access integer;
  v_attempts integer;
begin
  delete from public.parcel_access pa
  using private.demo_session s
  where s.user_id = pa.user_id and s.expires_at <= now();
  get diagnostics v_access = row_count;
  delete from private.demo_attempt where minute < now() - interval '48 hours';
  get diagnostics v_attempts = row_count;
  return jsonb_build_object('access_deleted', v_access, 'attempts_deleted', v_attempts);
end;
$$;
comment on function private.demo_housekeeping() is
  'Every 5 minutes (pg_cron): removes the access of expired demo sessions and demo attempts older than 48 hours.';

select cron.schedule('demo-cleanup', '*/15 * * * *', 'select private.dispatch_demo_cleanup()');
select cron.schedule('demo-housekeeping', '*/5 * * * *', 'select private.demo_housekeeping()');

-- ---------------------------------------------------------------------------
-- 6. Billing guard
-- ---------------------------------------------------------------------------

-- A demo org never takes sign-ups or fake payments: on org_billing_setting
-- (insert, update) and on registering a demo org that has such a setting.
create function private.demo_org_billing_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'org_billing_setting' then
    if (new.accepts_signups or new.allow_fake_payments) and private.is_demo_org(new.org_id) then
      raise exception 'demo_billing_forbidden' using errcode = '23514';
    end if;
  elsif exists (
    select 1 from public.org_billing_setting b
    where b.org_id = new.org_id and (b.accepts_signups or b.allow_fake_payments)
  ) then
    raise exception 'demo_billing_forbidden' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function private.demo_org_billing_guard() is
  'Trigger: demo_billing_forbidden (23514) when a demo org would accept sign-ups or fake payments.';

create trigger demo_org_billing_guard before insert or update on public.org_billing_setting
for each row execute function private.demo_org_billing_guard();
create trigger demo_org_billing_guard before insert or update of org_id on private.demo_org
for each row execute function private.demo_org_billing_guard();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function authz.is_demo_user() from public;
revoke all on function authz.is_demo_account(uuid) from public, anon;
revoke all on function authz.is_demo_org(uuid) from public, anon;
grant execute on function authz.is_demo_user() to anon, authenticated, service_role;
grant execute on function authz.is_demo_account(uuid) to authenticated, service_role;
grant execute on function authz.is_demo_org(uuid) to authenticated, service_role;

revoke all on function private.demo_parcel_org_check() from public;
revoke all on function private.is_demo_org(uuid) from public;
revoke all on function private.assert_not_demo() from public;
revoke all on function private.demo_count_attempt(text, text) from public;
revoke all on function private.dispatch_demo_cleanup() from public;
revoke all on function private.demo_housekeeping() from public;
revoke all on function private.demo_org_billing_guard() from public;

revoke all on function public.demo_admit(text) from public, anon, authenticated;
revoke all on function public.demo_start(uuid, text) from public, anon, authenticated;
revoke all on function public.demo_expired_accounts(integer, uuid[]) from public, anon, authenticated;
revoke all on function public.demo_undeletable_count() from public, anon, authenticated;
revoke all on function public.demo_purge_audit_log(uuid[]) from public, anon, authenticated;
revoke all on function public.demo_info() from public, anon;
revoke all on function public.demo_end() from public, anon;
revoke all on function public.demo_hit(text) from public, anon;

grant execute on function public.demo_admit(text) to service_role;
grant execute on function public.demo_start(uuid, text) to service_role;
grant execute on function public.demo_expired_accounts(integer, uuid[]) to service_role;
grant execute on function public.demo_undeletable_count() to service_role;
grant execute on function public.demo_purge_audit_log(uuid[]) to service_role;
grant execute on function public.demo_info() to authenticated;
grant execute on function public.demo_end() to authenticated;
grant execute on function public.demo_hit(text) to authenticated;
