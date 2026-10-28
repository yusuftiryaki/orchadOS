-- IP13-A / 3: demo account lockdown (docs/demo-turu.md §6.2).
--
-- A demo visitor holds a real GoTrue session and may call PUT /auth/v1/user.
-- With confirmations off (local stack; not documented on hosted projects)
-- GoTrue applies a phone or e-mail change at once, confirmed, without any
-- SMS or mail. A visitor could then hold the phone or e-mail of a person ops
-- is about to invite, ops_find_user_id would return the demo account and
-- invite-user or the co-owner approval would link it to a real parcel. None
-- of the controls below depends on Auth confirmations.
--
-- (a) Account freeze: demo_account_freeze, BEFORE UPDATE ON auth.users, for
--     demo accounts: e-mail, phone, pending changes, password and user
--     metadata never change (demo_account_locked, 42501); only clearing the
--     password is allowed (demo_start blanks GoTrue's random hash). Skipped with a
--     warning where the project forbids triggers on auth.users; (b)-(e)
--     hold without it.
-- (b) Account scope: row triggers demo_account_scope_<column>, for every
--     caller including the service role: a demo account is linked to demo
--     orgs only and never gets a membership, profile, consent, sign-up,
--     billing or notification row (demo_account_scope, 42501).
--     A NEW TABLE THAT GRANTS ACCESS TO, OR HOLDS THE IDENTITY OF, A USER
--     calls private.attach_demo_account_guard('<table>', '<user column>').
-- (c) ops_find_user_id and signup_find_account never return a demo account.
-- (d) demo-media: public bucket of the demo org's files; only the demo org's
--     ops member uploads, nothing is updated or deleted.
-- (e) private.demo_housekeeping(), final version.

-- ---------------------------------------------------------------------------
-- (a) Account freeze
-- ---------------------------------------------------------------------------

create function private.demo_account_freeze()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- GoTrue maintains these four metadata keys itself (magic link verification).
  if coalesce(new.email, '') is distinct from coalesce(old.email, '')
     or coalesce(new.phone, '') is distinct from coalesce(old.phone, '')
     or coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '')
     or coalesce(new.phone_change, '') is distinct from coalesce(old.phone_change, '')
     -- Clearing the password is allowed: demo_start blanks the random hash
     -- GoTrue's Admin API stores, and an empty password never signs in.
     or (coalesce(new.encrypted_password, '') is distinct from coalesce(old.encrypted_password, '')
         and coalesce(new.encrypted_password, '') <> '')
     or (coalesce(new.raw_user_meta_data, '{}'::jsonb) - array['email_verified', 'phone_verified', 'email', 'sub'])
        is distinct from
        (coalesce(old.raw_user_meta_data, '{}'::jsonb) - array['email_verified', 'phone_verified', 'email', 'sub']) then
    raise exception 'demo_account_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function private.demo_account_freeze() is
  'Trigger on auth.users: a demo account''s e-mail, phone, pending changes, password and user metadata never change (demo_account_locked).';
revoke all on function private.demo_account_freeze() from public;

do $$
begin
  drop trigger if exists demo_account_freeze on auth.users;
  create trigger demo_account_freeze
  before update on auth.users
  for each row
  when (old.raw_app_meta_data ->> 'demo' = 'true')
  execute function private.demo_account_freeze();
exception
  when insufficient_privilege then
    raise warning 'demo_account_freeze: no trigger on auth.users (insufficient privilege); housekeeping ends changed demo accounts instead';
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) Account scope
-- ---------------------------------------------------------------------------

-- Row trigger; args: the user column, and 'true' when rows of a demo org are
-- allowed (parcel_access).
create function private.demo_account_scope_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_user uuid := (v_row ->> tg_argv[0])::uuid;
  v_allow_demo_org boolean := coalesce(tg_argv[1], 'false')::boolean;
begin
  if v_user is null or not authz.is_demo_account(v_user) then
    return new;
  end if;
  if v_allow_demo_org and private.is_demo_org((v_row ->> 'org_id')::uuid) then
    return new;
  end if;
  raise exception 'demo_account_scope' using errcode = '42501',
    detail = format('%I.%I', tg_table_schema, tg_table_name);
end;
$$;
comment on function private.demo_account_scope_guard() is
  'Row trigger: demo_account_scope (42501) when a row names a demo account (outside a demo org where allowed).';
revoke all on function private.demo_account_scope_guard() from public;

-- Idempotent: (re)creates demo_account_scope_<column> on the table.
create function private.attach_demo_account_guard(
  p_table regclass,
  p_user_column text default 'user_id',
  p_allow_demo_org boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := 'demo_account_scope_' || p_user_column;
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = p_table and a.attname = p_user_column and a.attnum > 0 and not a.attisdropped
  ) then
    raise exception 'column % not found on %', p_user_column, p_table using errcode = '42703';
  end if;
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before insert or update on %s for each row '
    'execute function private.demo_account_scope_guard(%L, %L)',
    v_name, p_table, p_user_column, p_allow_demo_org::text);
end;
$$;
comment on function private.attach_demo_account_guard(regclass, text, boolean) is
  'Attaches the demo account scope guard to a user-keyed table; every new table granting access to or holding the identity of a user calls it.';
revoke all on function private.attach_demo_account_guard(regclass, text, boolean) from public;

-- Access and identity: the access rows (demo orgs allowed), memberships,
-- profiles, consents, pending sign-ups, approved co-owner invitations,
-- notifications, and every billing row of a customer.
select private.attach_demo_account_guard('public.parcel_access', 'user_id', true);
select private.attach_demo_account_guard('public.membership');
select private.attach_demo_account_guard('private.owner_profile');
select private.attach_demo_account_guard('private.billing_profile');
select private.attach_demo_account_guard('private.consent_record');
select private.attach_demo_account_guard('private.consent_record', 'subject_id');
select private.attach_demo_account_guard('private.customer_signup');
select private.attach_demo_account_guard('private.viewer_invitation');
select private.attach_demo_account_guard('public.notification', 'recipient_user_id');
select private.attach_demo_account_guard('public.service_application', 'customer_user_id');
select private.attach_demo_account_guard('public.application_garden', 'customer_user_id');
select private.attach_demo_account_guard('public.quote', 'customer_user_id');
select private.attach_demo_account_guard('public.quote_item', 'customer_user_id');
select private.attach_demo_account_guard('public.service_order', 'customer_user_id');
select private.attach_demo_account_guard('public.service_order_item', 'customer_user_id');
select private.attach_demo_account_guard('public.payment', 'customer_user_id');
select private.attach_demo_account_guard('public.payment_item', 'customer_user_id');
select private.attach_demo_account_guard('public.refund', 'customer_user_id');

-- ---------------------------------------------------------------------------
-- (c) Lookups: never a demo account (definitions as in
--     20261030100200_account_lookup_hardening.sql and
--     20261030100300_signup_consent_profiles.sql, plus the demo filter)
-- ---------------------------------------------------------------------------

create or replace function public.ops_find_user_id(p_org_id uuid, p_email text default null, p_phone text default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(p_email), '') is not null then
    select u.id into v_id from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and coalesce(u.raw_app_meta_data ->> 'signup', '') <> 'self'
      and coalesce(u.raw_app_meta_data ->> 'demo', '') <> 'true';
  elsif nullif(btrim(p_phone), '') is not null then
    -- Auth stores phone numbers without the leading +.
    select u.id into v_id from auth.users u
    where u.phone = ltrim(btrim(p_phone), '+')
      and u.phone_confirmed_at is not null
      and coalesce(u.raw_app_meta_data ->> 'demo', '') <> 'true'
      and (
        coalesce(u.raw_app_meta_data ->> 'signup', '') <> 'self'
        or exists (
          select 1 from private.customer_signup s
          where s.user_id = u.id and s.completed_at is not null
        )
      );
  end if;
  return v_id;
end;
$$;

create or replace function public.signup_find_account(p_email text, p_phone text)
returns table (
  user_id uuid,
  matched_by text,
  self_signup boolean,
  phone_confirmed boolean,
  signup_completed boolean,
  started_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select u.id, 'email' as matched_by from auth.users u
    where nullif(btrim(p_email), '') is not null and lower(u.email) = lower(btrim(p_email))
      and coalesce(u.raw_app_meta_data ->> 'demo', '') <> 'true'
    union all
    select u.id, 'phone' from auth.users u
    where nullif(btrim(p_phone), '') is not null and u.phone = ltrim(btrim(p_phone), '+')
      and coalesce(u.raw_app_meta_data ->> 'demo', '') <> 'true'
    union all
    select p.user_id, 'profile_phone' from private.owner_profile p
    where nullif(btrim(p_phone), '') is not null
      and p.org_id = private.signup_org_id()
      and p.phone = '+' || ltrim(btrim(p_phone), '+')
      and not exists (select 1 from auth.users u where u.id = p.user_id and u.phone = ltrim(btrim(p_phone), '+'))
      and not exists (select 1 from auth.users u
                      where u.id = p.user_id and coalesce(u.raw_app_meta_data ->> 'demo', '') = 'true')
  )
  select m.id, m.matched_by,
         coalesce(u.raw_app_meta_data ->> 'signup', '') = 'self',
         u.phone_confirmed_at is not null,
         exists (select 1 from private.customer_signup s where s.user_id = m.id and s.completed_at is not null),
         coalesce((select s.created_at from private.customer_signup s where s.user_id = m.id), u.created_at)
  from matched m
  join auth.users u on u.id = m.id
  order by m.matched_by, m.id;
$$;

-- ---------------------------------------------------------------------------
-- (d) demo-media bucket (media sets no size or type limits either)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('demo-media', 'demo-media', true)
on conflict (id) do nothing;

-- Same path rule as media_insert; reads go through /object/public (no select
-- policy), and objects are immutable (no update or delete policy).
create policy demo_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'demo-media'
    and objects.name ~ '^org/[0-9a-f-]{36}/parcel/[0-9a-f-]{36}/[0-9a-f]{64}$'
    and authz.is_demo_org(authz.uuid_or_null((storage.foldername(objects.name))[2]))
    and authz.uuid_or_null((storage.foldername(objects.name))[2]) in (select authz.user_org_ids('{ops}'))
    and not (select authz.is_demo_user())
  );

-- ---------------------------------------------------------------------------
-- (e) Final housekeeping (every 5 minutes; cron job from 20261101120000)
-- ---------------------------------------------------------------------------

create or replace function private.demo_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '{}'::jsonb;
  n integer;
begin
  -- 1. Access of expired demo sessions.
  begin
    delete from public.parcel_access pa
    using private.demo_session s
    where s.user_id = pa.user_id and s.expires_at <= now();
    get diagnostics n = row_count;
    v_result := v_result || jsonb_build_object('expired_access_deleted', n);
  exception when others then
    raise warning 'demo_housekeeping: expired access step failed (%)', sqlstate;
  end;

  -- 2. Demo accounts' access outside demo orgs: must never exist.
  begin
    delete from public.parcel_access pa
    where authz.is_demo_account(pa.user_id) and not private.is_demo_org(pa.org_id);
    get diagnostics n = row_count;
    if n > 0 then
      raise warning 'demo_housekeeping: removed % demo access rows outside demo orgs', n;
    end if;
    v_result := v_result || jsonb_build_object('foreign_access_deleted', n);
  exception when others then
    raise warning 'demo_housekeeping: foreign access step failed (%)', sqlstate;
  end;

  -- 3. Demo accounts whose details changed (only possible without the freeze
  --    trigger): the session ends, access goes, cleanup deletes the account.
  begin
    with changed as (
      select u.id from auth.users u
      where coalesce(u.raw_app_meta_data ->> 'demo', '') = 'true'
        and (
          not exists (
            select 1 from private.demo_org d
            where lower(coalesce(u.email, '')) like 'ziyaretci-%@' || d.visitor_email_domain)
          or nullif(u.phone, '') is not null
          or coalesce(u.phone_change, '') <> ''
          or coalesce(u.email_change, '') <> ''
          or coalesce(u.encrypted_password, '') <> ''
        )
    ),
    ended as (
      update private.demo_session s
      set expires_at = least(s.expires_at, now())
      where s.user_id in (select id from changed)
      returning s.user_id
    )
    delete from public.parcel_access pa
    where pa.user_id in (select id from changed);
    get diagnostics n = row_count;
    v_result := v_result || jsonb_build_object('changed_access_deleted', n);
  exception when others then
    raise warning 'demo_housekeeping: changed account step failed (%)', sqlstate;
  end;

  -- 4. Personas (fictional owner, co-owner, expert, field, ops of the demo
  --    data) are banned again an hour after a loader run left one open.
  begin
    update auth.users
    set banned_until = '2999-01-01 00:00:00+00', encrypted_password = ''
    where raw_app_meta_data ->> 'demo_persona' = 'true'
      and (banned_until is null or banned_until <= now())
      and updated_at < now() - interval '1 hour';
    get diagnostics n = row_count;
    v_result := v_result || jsonb_build_object('personas_banned', n);
  exception when others then
    raise warning 'demo_housekeeping: persona step failed (%)', sqlstate;
  end;

  -- 5. Start counters older than 48 hours.
  begin
    delete from private.demo_attempt where minute < now() - interval '48 hours';
    get diagnostics n = row_count;
    v_result := v_result || jsonb_build_object('attempts_deleted', n);
  exception when others then
    raise warning 'demo_housekeeping: attempt step failed (%)', sqlstate;
  end;

  return v_result;
end;
$$;
comment on function private.demo_housekeeping() is
  'Every 5 minutes (pg_cron): ends expired and changed demo access, removes demo access outside demo orgs, re-bans personas, drops attempts older than 48 hours.';
