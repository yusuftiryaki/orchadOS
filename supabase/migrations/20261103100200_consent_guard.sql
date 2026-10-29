-- Legal follow-ups, wave 1 / 3: consents the site does not ask are refused in
-- the database (docs/hukuk/kararlar.md H06, H31, T27), and KVKK notice
-- versions must be registered (T21).
--
-- explicit_service_improvement is never asked (in-house improvement rests on
-- legitimate interest); explicit_marketing only once
-- org_billing_setting.marketing_consent_enabled is on (after İYS). Granting
-- either otherwise raises consent_not_asked (customer_set_consent) or is
-- stored as false (sign-up). Withdrawing (granted = false) is never refused.
-- Rows with granted = true written before this migration are kept as
-- evidence and are no basis for any processing (docs/musteri-yonetimi.md §6.9).
--
-- Replaced with the same signatures: customer_set_consent, signup_prepare,
-- signup_complete (20261030100300_signup_consent_profiles.sql).

-- The org asks this explicit consent kind.
create function private.explicit_consent_asked(p_org_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'explicit_marketing' then (private.billing_setting(p_org_id)).marketing_consent_enabled
    else false
  end;
$$;
comment on function private.explicit_consent_asked(uuid, text) is
  'T27: explicit_marketing only while marketing_consent_enabled is on; explicit_service_improvement never.';

-- As in 20261030100300, plus: granting a kind that is not asked raises
-- consent_not_asked (P0001, detail: kind); the KVKK notice takes only the
-- current registered version (invalid_input text_version). Errors:
-- not_customer, invalid_input (kind, granted, text_version), consent_not_asked.
create or replace function public.customer_set_consent(p_kind text, p_granted boolean, p_text_version text)
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
  if p_kind = 'kvkk_notice' and p_text_version is distinct from (private.legal_text_current('kvkk_notice')).version then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_version';
  end if;
  if p_granted and p_kind <> 'kvkk_notice' and not private.explicit_consent_asked(v_org, p_kind) then
    raise exception 'consent_not_asked' using errcode = 'P0001', detail = p_kind;
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

-- As in 20261030100300, plus: kvkk_notice_version must be the current
-- registered version (invalid_input kvkk_notice_version). The explicit flags
-- are still validated as booleans and stored as sent; signup_complete decides
-- what is recorded.
create or replace function public.signup_prepare(
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
  if not private.text_version_ok(p_consents ->> 'kvkk_notice_version')
     or p_consents ->> 'kvkk_notice_version' is distinct from (private.legal_text_current('kvkk_notice')).version then
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

-- As in 20261030100300, except that an explicit consent the org does not ask
-- (private.explicit_consent_asked, evaluated now) is recorded as false
-- whatever the pending sign-up holds: old clients keep working and nothing
-- unasked is granted.
create or replace function public.signup_complete(p_user_id uuid, p_code_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.customer_signup;
  v_improvement boolean;
  v_marketing boolean;
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
  v_improvement := coalesce((s.consents ->> 'explicit_service_improvement')::boolean, false)
    and private.explicit_consent_asked(s.org_id, 'explicit_service_improvement');
  v_marketing := coalesce((s.consents ->> 'explicit_marketing')::boolean, false)
    and private.explicit_consent_asked(s.org_id, 'explicit_marketing');

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
    (s.org_id, s.user_id, s.user_id, 'explicit_service_improvement', v_improvement,
     s.consents ->> 'explicit_text_version', 'signup', s.ip_hash),
    (s.org_id, s.user_id, s.user_id, 'explicit_marketing', v_marketing,
     s.consents ->> 'explicit_text_version', 'signup', s.ip_hash);

  update private.customer_signup set completed_at = now()
  where user_id = s.user_id and completed_at is null;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;

  perform private.audit(s.org_id, s.user_id, 'customer', 'signup.completed', 'signup', s.user_id,
    jsonb_build_object('explicit_service_improvement', v_improvement, 'explicit_marketing', v_marketing));
  return 'completed';
end;
$$;

revoke all on function private.explicit_consent_asked(uuid, text) from public;
