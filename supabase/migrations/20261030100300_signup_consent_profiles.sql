-- IP12 / 4: self sign-up, consents, billing profile, contact details
-- (docs/musteri-yonetimi.md §6.4, §6.9, §7).
--
-- 1. Input helpers and the customer's org.
-- 2. KVKK notice backfill: every owner profile with kvkk_consent gets a
--    consent_record (kvkk_notice, source ops).
-- 3. Sign-up (service role, called by the customer-signup Edge Function):
--    signup_register_attempt (rate limits), signup_find_account (who already
--    holds the e-mail or phone), signup_prepare (pending sign-up),
--    signup_complete (owner profile, three consent records, audit row; only
--    for the account's own confirmed phone).
-- 4. Customer: my_consents, customer_set_consent, my_billing_profile,
--    customer_save_billing_profile, customer_update_contact.
-- 5. Ops: ops_billing_profile (TCKN shown only on request, audited),
--    ops_customer_consents; ops_create_owner_profile and
--    ops_update_owner_profile rewritten with the same signatures to record the
--    KVKK consent and an audit row.
-- 6. Housekeeping: stale pending sign-ups (phone never verified) and old
--    attempts (hourly), and the
--    call to customer-signup's cleanup action (Vault: signup_cleanup_url +
--    orchados_cron_secret; nothing happens while either is missing).
--
-- Personal data rule: every field is validated here before any insert and
-- errors carry the field name (detail), never the value; check and not-null
-- violations are re-raised without Postgres' "Failing row contains" detail.
-- Audit rows carry field names only.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Trimmed text of a json field (null when absent, null or blank), length
-- checked; invalid_input with the key as detail otherwise.
create function private.input_text(p_obj jsonb, p_key text, p_min integer, p_max integer, p_required boolean default false)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := p_obj -> p_key;
  t text;
begin
  if v is not null and jsonb_typeof(v) not in ('string', 'null') then
    raise exception 'invalid_input' using errcode = '22023', detail = p_key;
  end if;
  t := nullif(btrim(v #>> '{}'), '');
  if t is null then
    if p_required then
      raise exception 'invalid_input' using errcode = '22023', detail = p_key;
    end if;
    return null;
  end if;
  if length(t) < p_min or length(t) > p_max then
    raise exception 'invalid_input' using errcode = '22023', detail = p_key;
  end if;
  return t;
end;
$$;

create function private.is_valid_email(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null and length(p_value) <= 254
     and p_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

-- The org whose customer the user is (owner profile), preferring the sign-up org.
create function private.customer_org_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id from private.owner_profile p
  where p.user_id = p_user_id
  order by (p.org_id is not distinct from private.signup_org_id()) desc, p.created_at, p.org_id
  limit 1;
$$;

create function private.text_version_ok(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null and p_value ~ '^[a-z0-9][a-z0-9.-]{1,40}$';
$$;

-- Free-text versions (ops form, profiles before IP12) as a consent record
-- version: lower case, other characters as '-'; 'unknown' when nothing is left.
create function private.normalize_text_version(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when private.text_version_ok(p_value) then p_value
    when private.text_version_ok(left(trim(both '-' from lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9.]+', '-', 'g'))), 41))
      then left(trim(both '-' from lower(regexp_replace(p_value, '[^a-zA-Z0-9.]+', '-', 'g'))), 41)
    else 'unknown'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. KVKK notice backfill
-- ---------------------------------------------------------------------------

-- Idempotent: a profile whose kvkk_notice record exists is skipped. Versions
-- written before the format rule are normalised; the seed calls it again
-- after loading its profiles.
create function private.backfill_kvkk_consents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, recorded_at)
  select p.org_id, p.user_id, p.user_id, 'kvkk_notice', true,
         private.normalize_text_version(p.kvkk_text_version), 'ops', p.kvkk_consent_at
  from private.owner_profile p
  where p.kvkk_consent
    and not exists (
      select 1 from private.consent_record c
      where c.org_id = p.org_id and c.subject_id = p.user_id and c.kind = 'kvkk_notice'
    );
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function private.backfill_kvkk_consents() is
  'Writes the kvkk_notice consent record of owner profiles recorded before IP12 (once per profile).';
revoke all on function private.backfill_kvkk_consents() from public;

select private.backfill_kvkk_consents();

-- ---------------------------------------------------------------------------
-- 3. Sign-up (service role)
-- ---------------------------------------------------------------------------

-- ok, too_many (10 per IP an hour, 3 per phone a day) or closed. Hashes are
-- HMAC-SHA256 hex made by the Edge Function; an attempt is counted when ok.
create function public.signup_register_attempt(p_ip_hash text, p_phone_hash text, p_email_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'ip_hash';
  end if;
  if p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phone_hash';
  end if;
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'email_hash';
  end if;
  if private.signup_org_id() is null then
    return 'closed';
  end if;
  -- Serialise attempts of one number (the per-phone count).
  perform pg_advisory_xact_lock(hashtextextended('signup_attempt:' || p_phone_hash, 0));
  if (select count(*) from private.signup_attempt a
      where a.ip_hash = p_ip_hash and a.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from private.signup_attempt a
         where a.phone_hash = p_phone_hash and a.created_at > now() - interval '24 hours') >= 3
     -- Per e-mail too: rotating phones must not reach someone's pending sign-up.
     or (select count(*) from private.signup_attempt a
         where a.email_hash = p_email_hash and a.created_at > now() - interval '24 hours') >= 5 then
    return 'too_many';
  end if;
  insert into private.signup_attempt (ip_hash, phone_hash, email_hash) values (p_ip_hash, p_phone_hash, p_email_hash);
  return 'ok';
end;
$$;
comment on function public.signup_register_attempt(text, text, text) is
  'customer-signup (service role): ok, too_many (10 per IP an hour, 3 per phone and 5 per e-mail a day) or closed; counts the attempt.';

-- Accounts that already hold the e-mail or the phone: email / phone (Auth;
-- the phone without '+'), or profile_phone (another user's owner profile in
-- the sign-up org carries the phone). started_at: when the pending sign-up was
-- written (else when the account was created).
create function public.signup_find_account(p_email text, p_phone text)
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
    union all
    select u.id, 'phone' from auth.users u
    where nullif(btrim(p_phone), '') is not null and u.phone = ltrim(btrim(p_phone), '+')
    union all
    select p.user_id, 'profile_phone' from private.owner_profile p
    where nullif(btrim(p_phone), '') is not null
      and p.org_id = private.signup_org_id()
      and p.phone = '+' || ltrim(btrim(p_phone), '+')
      and not exists (select 1 from auth.users u where u.id = p.user_id and u.phone = ltrim(btrim(p_phone), '+'))
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
comment on function public.signup_find_account(text, text) is
  'customer-signup (service role): accounts matching the e-mail or phone, with how they matched, their sign-up state and when the sign-up started.';

-- The pending sign-up of a new account (replaced while not completed).
-- Errors: signup_closed, invalid_input (detail: field), exists (completed).
create function public.signup_prepare(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_contact_preference text,
  p_consents jsonb,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.signup_org_id();
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_consents jsonb;
begin
  if v_org is null then
    raise exception 'signup_closed' using errcode = 'P0001';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'user_id';
  end if;
  if length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if not private.is_valid_email(v_email) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'email';
  end if;
  if p_phone is null or p_phone !~ '^\+905[0-9]{9}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
  end if;
  if p_contact_preference is null or p_contact_preference not in ('whatsapp', 'sms') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'contact_preference';
  end if;
  if p_consents is null or jsonb_typeof(p_consents) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'consents';
  end if;
  if not private.text_version_ok(p_consents ->> 'kvkk_notice_version') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kvkk_notice_version';
  end if;
  if not private.text_version_ok(p_consents ->> 'explicit_text_version') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'explicit_text_version';
  end if;
  if jsonb_typeof(p_consents -> 'explicit_service_improvement') is distinct from 'boolean' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'explicit_service_improvement';
  end if;
  if jsonb_typeof(p_consents -> 'explicit_marketing') is distinct from 'boolean' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'explicit_marketing';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'ip_hash';
  end if;
  v_consents := jsonb_build_object(
    'kvkk_notice_version', p_consents ->> 'kvkk_notice_version',
    'explicit_text_version', p_consents ->> 'explicit_text_version',
    'explicit_service_improvement', (p_consents ->> 'explicit_service_improvement')::boolean,
    'explicit_marketing', (p_consents ->> 'explicit_marketing')::boolean
  );

  begin
    insert into private.customer_signup (user_id, org_id, full_name, email, phone, contact_preference, consents, ip_hash)
    values (p_user_id, v_org, v_name, v_email, p_phone, p_contact_preference::private.contact_preference, v_consents, p_ip_hash)
    on conflict (user_id) do update
    set org_id = excluded.org_id, full_name = excluded.full_name, email = excluded.email,
        phone = excluded.phone, contact_preference = excluded.contact_preference,
        consents = excluded.consents, ip_hash = excluded.ip_hash, created_at = now()
    where private.customer_signup.completed_at is null;
    if not found then
      raise exception 'exists' using errcode = '23505';
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
end;
$$;
comment on function public.signup_prepare(uuid, text, text, text, text, jsonb, text) is
  'customer-signup (service role): stores the pending sign-up of a new account until its phone is verified.';

-- completed (owner profile, consent records, audit row), already_completed,
-- no_pending or phone_mismatch. p_code_at is when the session's phone code was
-- verified (JWT amr). The profile only takes the pending phone when that is the
-- self sign-up account's own confirmed phone and the code came after the
-- pending sign-up was written (§7.2); otherwise phone_mismatch.
create function public.signup_complete(p_user_id uuid, p_code_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.customer_signup;
begin
  select * into s from private.customer_signup where user_id = p_user_id for update;
  if not found then
    return 'no_pending';
  end if;
  if s.completed_at is not null then
    return 'already_completed';
  end if;
  -- amr timestamps are whole seconds.
  if p_code_at is null
     or p_code_at < date_trunc('second', s.created_at)
     or not exists (
       select 1 from auth.users u
       where u.id = s.user_id
         and u.raw_app_meta_data ->> 'signup' = 'self'
         and u.phone_confirmed_at is not null
         and u.phone = ltrim(s.phone, '+')
     ) then
    return 'phone_mismatch';
  end if;

  begin
    insert into private.owner_profile (
      org_id, user_id, full_name, phone, email, contact_preference,
      kvkk_consent, kvkk_consent_at, kvkk_text_version
    )
    values (
      s.org_id, s.user_id, s.full_name, s.phone, s.email, s.contact_preference,
      true, now(), s.consents ->> 'kvkk_notice_version'
    )
    on conflict (org_id, user_id) do nothing;
  exception
    when check_violation or not_null_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;

  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, ip_hash)
  values
    (s.org_id, s.user_id, s.user_id, 'kvkk_notice', true, s.consents ->> 'kvkk_notice_version', 'signup', s.ip_hash),
    (s.org_id, s.user_id, s.user_id, 'explicit_service_improvement',
     coalesce((s.consents ->> 'explicit_service_improvement')::boolean, false),
     s.consents ->> 'explicit_text_version', 'signup', s.ip_hash),
    (s.org_id, s.user_id, s.user_id, 'explicit_marketing',
     coalesce((s.consents ->> 'explicit_marketing')::boolean, false),
     s.consents ->> 'explicit_text_version', 'signup', s.ip_hash);

  update private.customer_signup set completed_at = now()
  where user_id = s.user_id and completed_at is null;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;

  perform private.audit(s.org_id, s.user_id, 'customer', 'signup.completed', 'signup', s.user_id,
    jsonb_build_object(
      'explicit_service_improvement', coalesce((s.consents ->> 'explicit_service_improvement')::boolean, false),
      'explicit_marketing', coalesce((s.consents ->> 'explicit_marketing')::boolean, false)));
  return 'completed';
end;
$$;
comment on function public.signup_complete(uuid, timestamptz) is
  'customer-signup (service role), after the phone code: creates the owner profile and the three consent records when the confirmed phone is the pending one.';

-- ---------------------------------------------------------------------------
-- 4. Customer
-- ---------------------------------------------------------------------------

-- The latest record per kind (and org) of the caller.
create function public.my_consents()
returns table (
  org_id uuid,
  kind text,
  granted boolean,
  text_version text,
  source text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (c.org_id, c.kind)
         c.org_id, c.kind::text, c.granted, c.text_version, c.source::text, c.recorded_at
  from private.consent_record c
  where c.subject_id = (select auth.uid())
  order by c.org_id, c.kind, c.recorded_at desc, c.id;
$$;
comment on function public.my_consents() is
  'Customer: the current consent per kind (latest record). Any processing for an explicit_* purpose must check it.';

-- Errors: not_customer, invalid_input (detail: kind, granted, text_version).
create function public.customer_set_consent(p_kind text, p_granted boolean, p_text_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
begin
  if v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  if p_kind is null or p_kind not in ('kvkk_notice', 'explicit_service_improvement', 'explicit_marketing') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  if p_granted is null or (p_kind = 'kvkk_notice' and not p_granted) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'granted';
  end if;
  if not private.text_version_ok(p_text_version) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_version';
  end if;

  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values (v_org, v_user, v_user, p_kind::public.consent_kind, p_granted, p_text_version, 'portal');
  if p_kind = 'kvkk_notice' then
    update private.owner_profile
    set kvkk_consent = true, kvkk_consent_at = now(), kvkk_text_version = p_text_version
    where org_id = v_org and user_id = v_user;
  end if;
  perform private.audit(v_org, v_user, 'customer',
    case when p_granted then 'consent.granted' else 'consent.withdrawn' end, 'consent', v_user,
    jsonb_build_object('kind', p_kind, 'text_version', p_text_version));
end;
$$;
comment on function public.customer_set_consent(text, boolean, text) is
  'Customer: grants or withdraws an explicit consent, or acknowledges the KVKK notice (granted only).';

create function private.mask_identity_number(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_value is null then null else '*******' || right(p_value, 4) end;
$$;

-- One row for a customer (all profile fields null and has_profile false while
-- none is saved), none for anyone else. The TCKN is masked.
create function public.my_billing_profile()
returns table (
  org_id uuid,
  has_profile boolean,
  kind text,
  first_name text,
  last_name text,
  identity_number_masked text,
  company_title text,
  tax_office text,
  tax_number text,
  address text,
  district text,
  city text,
  postal_code text,
  country text,
  email text,
  identity_number_required boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.org_id, b.id is not null, b.kind::text, b.first_name, b.last_name,
         private.mask_identity_number(b.identity_number), b.company_title, b.tax_office, b.tax_number,
         b.address, b.district, b.city, b.postal_code, b.country, b.email,
         coalesce(s.identity_number_required, false), b.updated_at
  from (select private.customer_org_id((select auth.uid())) as org_id) o
  left join private.billing_profile b on b.org_id = o.org_id and b.user_id = (select auth.uid())
  left join public.org_billing_setting s on s.org_id = o.org_id
  where o.org_id is not null;
$$;
comment on function public.my_billing_profile() is
  'Customer: own billing profile (TCKN masked) and whether the org needs the TCKN.';

-- p_profile: {kind, first_name, last_name, identity_number, company_title,
--   tax_office, tax_number, address, district, city, postal_code, country, email}
-- The TCKN is stored only while the org needs it (an omitted one is kept);
-- the company fields only for kind = company.
-- Errors: not_customer, invalid_input (detail: field).
create function public.customer_save_billing_profile(p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  v_required boolean;
  v_kind text;
  v_first text;
  v_last text;
  v_tckn text;
  v_company text;
  v_tax_office text;
  v_tax_number text;
  v_address text;
  v_district text;
  v_city text;
  v_postal text;
  v_country text;
  v_email text;
begin
  if v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'profile';
  end if;
  select coalesce(s.identity_number_required, false) into v_required
  from (select 1) x left join public.org_billing_setting s on s.org_id = v_org;

  v_kind := private.input_text(p_profile, 'kind', 1, 20, true);
  if v_kind not in ('individual', 'company') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  v_first := private.input_text(p_profile, 'first_name', 1, 60, true);
  v_last := private.input_text(p_profile, 'last_name', 1, 60, true);
  v_address := private.input_text(p_profile, 'address', 1, 500, true);
  v_district := private.input_text(p_profile, 'district', 1, 100);
  v_city := private.input_text(p_profile, 'city', 1, 100, true);
  v_postal := private.input_text(p_profile, 'postal_code', 5, 5);
  if v_postal is not null and v_postal !~ '^[0-9]{5}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'postal_code';
  end if;
  v_country := coalesce(private.input_text(p_profile, 'country', 1, 100), 'Türkiye');
  v_email := lower(private.input_text(p_profile, 'email', 3, 254));
  if v_email is not null and not private.is_valid_email(v_email) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'email';
  end if;
  if v_kind = 'company' then
    v_company := private.input_text(p_profile, 'company_title', 1, 200, true);
    v_tax_office := private.input_text(p_profile, 'tax_office', 1, 100, true);
    v_tax_number := private.input_text(p_profile, 'tax_number', 10, 10, true);
    if v_tax_number !~ '^[0-9]{10}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'tax_number';
    end if;
  end if;
  if v_required then
    v_tckn := private.input_text(p_profile, 'identity_number', 11, 11);
    if v_tckn is null then
      select b.identity_number into v_tckn from private.billing_profile b
      where b.org_id = v_org and b.user_id = v_user;
    end if;
    if not private.is_valid_tckn(v_tckn) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'identity_number';
    end if;
  end if;

  begin
    insert into private.billing_profile (
      org_id, user_id, kind, first_name, last_name, identity_number, company_title, tax_office,
      tax_number, address, district, city, postal_code, country, email
    )
    values (
      v_org, v_user, v_kind::public.billing_party_kind, v_first, v_last, v_tckn, v_company, v_tax_office,
      v_tax_number, v_address, v_district, v_city, v_postal, v_country, v_email
    )
    on conflict (org_id, user_id) do update
    set kind = excluded.kind, first_name = excluded.first_name, last_name = excluded.last_name,
        identity_number = excluded.identity_number, company_title = excluded.company_title,
        tax_office = excluded.tax_office, tax_number = excluded.tax_number, address = excluded.address,
        district = excluded.district, city = excluded.city, postal_code = excluded.postal_code,
        country = excluded.country, email = excluded.email;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform private.audit(v_org, v_user, 'customer', 'billing_profile.saved', 'billing_profile', v_user,
    jsonb_build_object('kind', v_kind, 'identity_number', v_tckn is not null));
end;
$$;
comment on function public.customer_save_billing_profile(jsonb) is
  'Customer: saves the billing profile; TCKN only when the org needs it.';

-- The contact e-mail of the profile; the login e-mail does not change.
-- Errors: not_customer, invalid_input (detail: field).
create function public.customer_update_contact(p_full_name text, p_email text, p_contact_preference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_email text := lower(nullif(btrim(p_email), ''));
  p private.owner_profile;
  v_fields text[] := '{}';
begin
  if v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if v_email is not null and not private.is_valid_email(v_email) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'email';
  end if;
  if p_contact_preference is null or p_contact_preference not in ('whatsapp', 'sms', 'phone_call') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'contact_preference';
  end if;

  select * into p from private.owner_profile where org_id = v_org and user_id = v_user for update;
  if p.full_name is distinct from v_name then v_fields := array_append(v_fields, 'full_name'); end if;
  if p.email is distinct from v_email then v_fields := array_append(v_fields, 'email'); end if;
  if p.contact_preference::text is distinct from p_contact_preference then
    v_fields := array_append(v_fields, 'contact_preference');
  end if;
  if cardinality(v_fields) = 0 then
    return;
  end if;

  begin
    update private.owner_profile
    set full_name = v_name, email = v_email,
        contact_preference = p_contact_preference::private.contact_preference, updated_at = now()
    where id = p.id;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform private.audit(v_org, v_user, 'customer', 'owner_profile.updated', 'owner_profile', p.id,
    jsonb_build_object('fields', to_jsonb(v_fields)));
end;
$$;
comment on function public.customer_update_contact(text, text, text) is
  'Customer: name, contact e-mail and contact preference of the own profile. The login e-mail and the phone stay.';

-- ---------------------------------------------------------------------------
-- 5. Ops
-- ---------------------------------------------------------------------------

-- The TCKN is returned only with p_reveal (and then audited).
create function public.ops_billing_profile(p_org_id uuid, p_user_id uuid, p_reveal boolean default false)
returns table (
  user_id uuid,
  kind text,
  first_name text,
  last_name text,
  identity_number_masked text,
  identity_number text,
  company_title text,
  tax_office text,
  tax_number text,
  address text,
  district text,
  city text,
  postal_code text,
  country text,
  email text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  b private.billing_profile;
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into b from private.billing_profile x where x.org_id = p_org_id and x.user_id = p_user_id;
  if not found then
    return;
  end if;
  if coalesce(p_reveal, false) and b.identity_number is not null then
    perform private.audit(p_org_id, (select auth.uid()), 'ops', 'billing_profile.revealed', 'billing_profile',
      p_user_id, jsonb_build_object('field', 'identity_number'));
  end if;
  return query select b.user_id, b.kind::text, b.first_name, b.last_name,
    private.mask_identity_number(b.identity_number),
    case when coalesce(p_reveal, false) then b.identity_number end,
    b.company_title, b.tax_office, b.tax_number, b.address, b.district, b.city, b.postal_code,
    b.country, b.email, b.updated_at;
end;
$$;
comment on function public.ops_billing_profile(uuid, uuid, boolean) is
  'Ops: a customer''s billing profile; the full TCKN only with p_reveal, which is audited.';

create function public.ops_customer_consents(p_org_id uuid, p_user_id uuid)
returns table (
  id uuid,
  kind text,
  granted boolean,
  text_version text,
  source text,
  quote_id uuid,
  order_id uuid,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.kind::text, c.granted, c.text_version, c.source::text, c.quote_id, c.order_id, c.recorded_at
  from private.consent_record c
  where c.org_id = p_org_id and c.subject_id = p_user_id
    and p_org_id in (select authz.user_org_ids('{ops}'))
  order by c.recorded_at desc, c.id;
$$;
comment on function public.ops_customer_consents(uuid, uuid) is 'Ops: consent history of a customer (newest first).';

create or replace function public.ops_create_owner_profile(
  p_org_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_contact_preference text,
  p_kvkk_consent boolean,
  p_phone text default null,
  p_email text default null,
  p_kvkk_consent_at timestamptz default null,
  p_kvkk_text_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version text := nullif(btrim(p_kvkk_text_version), '');
  v_fields text[];
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'user_id';
  end if;
  -- Nobody records their own customer profile.
  if p_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_owner_profile_input(
    p_full_name, p_phone, p_contact_preference, p_kvkk_consent, p_kvkk_consent_at, p_kvkk_text_version
  );
  if exists (select 1 from private.owner_profile p where p.org_id = p_org_id and p.user_id = p_user_id) then
    raise exception 'exists' using errcode = '23505';
  end if;

  begin
    insert into private.owner_profile (
      org_id, user_id, full_name, phone, email, contact_preference,
      kvkk_consent, kvkk_consent_at, kvkk_text_version
    )
    values (
      p_org_id, p_user_id, btrim(p_full_name), p_phone, nullif(btrim(p_email), ''),
      p_contact_preference::private.contact_preference,
      coalesce(p_kvkk_consent, false), p_kvkk_consent_at, v_version
    )
    returning id into v_id;
  exception
    -- The default messages quote the failing row; replace them.
    when unique_violation then
      raise exception 'exists' using errcode = '23505';
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;

  -- recorded_at is when the record is written (now()), never the declared
  -- consent date, which stays in the profile: the latest record must win.
  if coalesce(p_kvkk_consent, false) then
    insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
    values (p_org_id, p_user_id, p_user_id, 'kvkk_notice', true, private.normalize_text_version(v_version), 'ops');
  end if;
  v_fields := array_remove(array[
    'full_name', 'contact_preference',
    case when p_phone is not null then 'phone' end,
    case when nullif(btrim(p_email), '') is not null then 'email' end,
    case when coalesce(p_kvkk_consent, false) then 'kvkk_consent' end
  ], null);
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'owner_profile.created', 'owner_profile', v_id,
    jsonb_build_object('fields', to_jsonb(v_fields)));
  return v_id;
end;
$$;
comment on function public.ops_create_owner_profile(uuid, uuid, text, text, boolean, text, text, timestamptz, text) is
  'Ops registers an owner (private.owner_profile) for an existing account, with the KVKK consent record. Returns the profile id.';

-- Replaces every field: an omitted optional field is cleared. A changed KVKK
-- consent (given, withdrawn or a new version) gets a consent record.
create or replace function public.ops_update_owner_profile(
  p_profile_id uuid,
  p_full_name text,
  p_contact_preference text,
  p_kvkk_consent boolean,
  p_phone text default null,
  p_email text default null,
  p_kvkk_consent_at timestamptz default null,
  p_kvkk_text_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p private.owner_profile;
  v_version text := nullif(btrim(p_kvkk_text_version), '');
  v_email text := nullif(btrim(p_email), '');
  v_consent boolean := coalesce(p_kvkk_consent, false);
  v_fields text[] := '{}';
begin
  select * into p from private.owner_profile x
  where x.id = p_profile_id and x.org_id in (select authz.user_org_ids('{ops}'))
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.check_owner_profile_input(
    p_full_name, p_phone, p_contact_preference, p_kvkk_consent, p_kvkk_consent_at, p_kvkk_text_version
  );
  if p.full_name is distinct from btrim(p_full_name) then v_fields := array_append(v_fields, 'full_name'); end if;
  if p.phone is distinct from p_phone then v_fields := array_append(v_fields, 'phone'); end if;
  if p.email is distinct from v_email then v_fields := array_append(v_fields, 'email'); end if;
  if p.contact_preference::text is distinct from p_contact_preference then
    v_fields := array_append(v_fields, 'contact_preference');
  end if;
  if (p.kvkk_consent, p.kvkk_consent_at, p.kvkk_text_version) is distinct from (v_consent, p_kvkk_consent_at, v_version) then
    v_fields := array_append(v_fields, 'kvkk_consent');
  end if;

  begin
    update private.owner_profile
    set full_name = btrim(p_full_name),
        phone = p_phone,
        email = v_email,
        contact_preference = p_contact_preference::private.contact_preference,
        kvkk_consent = v_consent,
        kvkk_consent_at = p_kvkk_consent_at,
        kvkk_text_version = v_version,
        updated_at = now()
    where id = p_profile_id;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;

  if 'kvkk_consent' = any (v_fields) and (v_consent or p.kvkk_consent) then
    -- recorded_at = now(), not the declared date (see ops_create_owner_profile).
    insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
    values (p.org_id, p.user_id, p.user_id, 'kvkk_notice', v_consent,
            private.normalize_text_version(coalesce(v_version, p.kvkk_text_version)), 'ops');
  end if;
  if cardinality(v_fields) > 0 then
    perform private.audit(p.org_id, (select auth.uid()), 'ops', 'owner_profile.updated', 'owner_profile', p.id,
      jsonb_build_object('fields', to_jsonb(v_fields)));
  end if;
end;
$$;
comment on function public.ops_update_owner_profile(uuid, text, text, boolean, text, text, timestamptz, text) is
  'Ops corrects an owner profile; the account and org do not change. KVKK changes are recorded as consent records.';

-- ---------------------------------------------------------------------------
-- 6. Housekeeping
-- ---------------------------------------------------------------------------

create function private.signup_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signups integer;
  v_attempts integer;
begin
  -- A verified phone keeps its pending sign-up: cleanup no longer removes that
  -- account, and complete (after a phone code login) still needs the row.
  delete from private.customer_signup s
  where s.completed_at is null and s.created_at < now() - interval '24 hours'
    and not exists (select 1 from auth.users u where u.id = s.user_id and u.phone_confirmed_at is not null);
  get diagnostics v_signups = row_count;
  delete from private.signup_attempt where created_at < now() - interval '2 days';
  get diagnostics v_attempts = row_count;
  return jsonb_build_object('signups_deleted', v_signups, 'attempts_deleted', v_attempts);
end;
$$;
comment on function private.signup_housekeeping() is
  'Hourly (pg_cron): drops pending sign-ups older than 24 hours whose phone was never verified, and sign-up attempts older than two days.';

-- Asks customer-signup to delete self sign-up accounts whose phone was never
-- verified within 24 hours (Admin API). Needs Vault's signup_cleanup_url and
-- orchados_cron_secret; does nothing without them.
create function private.dispatch_signup_cleanup()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'signup_cleanup_url';
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
comment on function private.dispatch_signup_cleanup() is
  'Hourly (pg_cron): calls customer-signup''s cleanup action when Vault holds its URL and the cron secret.';

select cron.schedule('signup-housekeeping', '17 * * * *', 'select private.signup_housekeeping()');
select cron.schedule('signup-cleanup', '23 * * * *', 'select private.dispatch_signup_cleanup()');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.input_text(jsonb, text, integer, integer, boolean) from public;
revoke all on function private.is_valid_email(text) from public;
revoke all on function private.customer_org_id(uuid) from public;
revoke all on function private.text_version_ok(text) from public;
revoke all on function private.normalize_text_version(text) from public;
revoke all on function private.mask_identity_number(text) from public;
revoke all on function private.signup_housekeeping() from public;
revoke all on function private.dispatch_signup_cleanup() from public;

revoke all on function public.signup_register_attempt(text, text, text) from public, anon, authenticated;
revoke all on function public.signup_find_account(text, text) from public, anon, authenticated;
revoke all on function public.signup_prepare(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.signup_complete(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.my_consents() from public, anon, authenticated;
revoke all on function public.customer_set_consent(text, boolean, text) from public, anon, authenticated;
revoke all on function public.my_billing_profile() from public, anon, authenticated;
revoke all on function public.customer_save_billing_profile(jsonb) from public, anon, authenticated;
revoke all on function public.customer_update_contact(text, text, text) from public, anon, authenticated;
revoke all on function public.ops_billing_profile(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.ops_customer_consents(uuid, uuid) from public, anon, authenticated;

grant execute on function public.signup_register_attempt(text, text, text) to service_role;
grant execute on function public.signup_find_account(text, text) to service_role;
grant execute on function public.signup_prepare(uuid, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.signup_complete(uuid, timestamptz) to service_role;
grant execute on function public.my_consents() to authenticated;
grant execute on function public.customer_set_consent(text, boolean, text) to authenticated;
grant execute on function public.my_billing_profile() to authenticated;
grant execute on function public.customer_save_billing_profile(jsonb) to authenticated;
grant execute on function public.customer_update_contact(text, text, text) to authenticated;
grant execute on function public.ops_billing_profile(uuid, uuid, boolean) to authenticated;
grant execute on function public.ops_customer_consents(uuid, uuid) to authenticated;
