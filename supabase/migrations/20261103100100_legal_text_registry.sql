-- Legal follow-ups, wave 1 / 2: legal-text registry, company information
-- from one setting, the production gate (docs/hukuk/kararlar.md H34, T21;
-- docs/musteri-yonetimi.md §9, "Sözleşme belgeleri (T04)").
--
-- 1. private.legal_text_version: the versions of the legal texts the database
--    knows, with the template hash (SHA-256, apps/web/src/lib/legal/
--    text-hash.ts) of the current ones. Every text change or version bump
--    (also the removal of "-taslak" at launch) ships a migration that calls
--    private.register_legal_text() in the same PR; an integration test keeps
--    the rows equal to the web constants.
-- 2. public.org_billing_setting: kep_address, site_domain, kvkk_email (T21),
--    marketing_consent_enabled (T27, SQL only), inventory_reuse_months (T18,
--    SQL only); private.billing_setting() and ops_save_billing_setting
--    replaced.
-- 3. public.public_company_info(): the seller's company fields (never a demo
--    org) and whether they are complete.
-- 4. The production gate: private.legal_gate_reasons(),
--    public.legal_gate_status(). customer_accept_quote raises
--    legal_texts_not_final where the gate is active (20261103100400).

-- ---------------------------------------------------------------------------
-- 1. Registry
-- ---------------------------------------------------------------------------

create table private.legal_text_version (
  kind text not null check (kind in (
    'kvkk_notice', 'explicit_consent', 'privacy', 'distance_sales', 'pre_information', 'refund_policy',
    'field_notice', 'early_performance')),
  version text not null check (version ~ '^[a-z0-9][a-z0-9.-]{1,40}$'),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default false,
  is_final boolean generated always as (version !~ '-taslak$') stored,
  created_at timestamptz not null default now(),
  primary key (kind, version),
  check (not is_current or sha256 is not null)
);
comment on table private.legal_text_version is
  'Registered versions of the legal texts (T21): the current one per kind with its template hash, earlier ones from docs/hukuk/arsiv. Written by migrations only.';
comment on column private.legal_text_version.kind is
  'Key of LEGAL_TEXT_VERSIONS (apps/web/src/lib/legal/versions.ts) or early_performance (the box of the quote acceptance).';
comment on column private.legal_text_version.sha256 is
  'Template hash (text-hash.ts: canonical JSON of the blocks before any placeholder is filled); null for archived versions.';
comment on column private.legal_text_version.is_current is 'The version the site shows and the database accepts now; one per kind.';
comment on column private.legal_text_version.is_final is 'Not a draft: the version does not end in -taslak.';
create unique index legal_text_version_current_uq on private.legal_text_version (kind) where is_current;
alter table private.legal_text_version enable row level security;
revoke all on private.legal_text_version from anon, authenticated;
select private.attach_demo_guard('private.legal_text_version');

-- Makes a version the current one of its kind (inserting it when new).
-- Called by registry migrations only.
create function private.register_legal_text(p_kind text, p_version text, p_sha256 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.legal_text_version set is_current = false
  where kind = p_kind and is_current and version <> p_version;
  insert into private.legal_text_version (kind, version, sha256, is_current)
  values (p_kind, p_version, p_sha256, true)
  on conflict (kind, version) do update set sha256 = excluded.sha256, is_current = true;
end;
$$;
comment on function private.register_legal_text(text, text, text) is
  'Registry migrations: makes (kind, version, sha256) the current legal text of its kind.';

-- The current registered version of a kind (null when none).
create function private.legal_text_current(p_kind text)
returns private.legal_text_version
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from private.legal_text_version v where v.kind = p_kind and v.is_current;
$$;

-- A registered final (non-draft) version of the kind.
create function private.legal_text_final(p_kind text, p_version text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.legal_text_version v
    where v.kind = p_kind and v.version = p_version and v.is_final);
$$;

-- Public: versions are published on the site anyway. The ops forms offer the
-- registered KVKK notice versions; the integration test compares the rows
-- with the web constants.
create function public.registered_legal_text_versions()
returns table (kind text, version text, sha256 text, is_current boolean, is_final boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.kind, v.version, v.sha256, v.is_current, v.is_final
  from private.legal_text_version v
  order by v.kind, v.is_current desc, v.version desc;
$$;
comment on function public.registered_legal_text_versions() is
  'Registered legal text versions (kind, version, template hash, current, final).';

-- Current versions (template hashes from apps/web/src/lib/legal/text-hash.ts)
-- and the earlier versions whose texts are archived in docs/hukuk/arsiv/.
insert into private.legal_text_version (kind, version, sha256, is_current) values
  ('kvkk_notice', 'kvkk-v1-taslak', null, false),
  ('explicit_consent', 'riza-v1-taslak', null, false),
  ('privacy', 'gizlilik-v1-taslak', null, false),
  ('distance_sales', 'mesafeli-v1-taslak', null, false),
  ('distance_sales', 'mesafeli-v2-taslak', null, false),
  ('pre_information', 'onbilgi-v1-taslak', null, false),
  ('pre_information', 'onbilgi-v2-taslak', null, false),
  ('refund_policy', 'iade-v1-taslak', null, false),
  ('refund_policy', 'iade-v2-taslak', null, false),
  ('distance_sales', 'mesafeli-v3-taslak', null, false),
  ('pre_information', 'onbilgi-v3-taslak', null, false),
  ('refund_policy', 'iade-v3-taslak', null, false);
select private.register_legal_text('kvkk_notice', 'kvkk-v2-taslak',
  'b4a873a3d57f02958f0b73662828a13aa0a5fb98c85aa8ffcf75161636f76052');
select private.register_legal_text('explicit_consent', 'riza-v2-taslak',
  '959cc1375322156a375619da78468d51dd6fa0dd165e5b13f1a3ce6f693234c8');
select private.register_legal_text('privacy', 'gizlilik-v2-taslak',
  '94c793947e1ab06819958b19dee39962be914a2821892e0cb13866c311770ad9');
select private.register_legal_text('distance_sales', 'mesafeli-v4-taslak',
  '7edaa9ffa577d0538c1930fcf71a1faf561c282802af76ff9c2b59b6db4b7222');
select private.register_legal_text('pre_information', 'onbilgi-v4-taslak',
  '1a77ee0dda45f72f68d1f628603ecff5d2e2ceb9f83adaa0fc9b5ee6da4c1e33');
select private.register_legal_text('refund_policy', 'iade-v4-taslak',
  '67f4e8a122b12dac851dfd8a95f43698263b8d7f231c25c8be9d2f45613b722b');
select private.register_legal_text('field_notice', 'bahcede-v1-taslak',
  'e993ff6d5a947596108d3246f678b040159f6bd81bb9cb2d11755a1234255a47');
select private.register_legal_text('early_performance', 'mesafeli-v4-taslak',
  '3745a7686d1205ffcd0af3081d3891b345a297c6fdfbdbf37c7028c09b1c5bb2');

-- ---------------------------------------------------------------------------
-- 2. Settings
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting
  add column marketing_consent_enabled boolean not null default false,
  add column kep_address text
    check (kep_address ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(kep_address) <= 254),
  add column site_domain text
    check (site_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' and length(site_domain) <= 253),
  add column kvkk_email text
    check (kvkk_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(kvkk_email) <= 254),
  add column inventory_reuse_months smallint not null default 24 check (inventory_reuse_months between 0 and 120);
comment on column public.org_billing_setting.marketing_consent_enabled is
  'SQL only (ops_save_billing_setting refuses it). The marketing consent may be granted only when true: open it after the İYS registration and integration (kararlar.md H06, T22, T27).';
comment on column public.org_billing_setting.kep_address is 'Seller KEP address (legal texts, footer; H34).';
comment on column public.org_billing_setting.site_domain is
  'Site host name, e.g. orchados.com.tr (legal texts, footer; required for complete company information; H34).';
comment on column public.org_billing_setting.kvkk_email is 'KVKK application e-mail; null: kvkk@ + site_domain.';
comment on column public.org_billing_setting.inventory_reuse_months is
  'SQL only: an add-on garden re-added within this many months of its last published inventory pays no inventory fee (contract 8D/3; changing it changes the contract text and its version).';

-- As in 20261102120200_garden_addons.sql, with the defaults of the new
-- columns.
create or replace function private.billing_setting(p_org_id uuid)
returns public.org_billing_setting
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.org_billing_setting;
begin
  select * into r from public.org_billing_setting s where s.org_id = p_org_id;
  if not found then
    r.org_id := p_org_id;
    r.accepts_signups := false;
    r.allow_fake_payments := false;
    r.identity_number_required := false;
    r.payment_due_days := 14;
    r.quote_valid_days := 30;
    r.renewal_notice_days := 45;
    r.garden_changes_enabled := false;
    r.addon_min_days := 30;
    r.removal_notice_days := 30;
    r.removal_access_days := 90;
    r.removal_refund_mode := 'unused_visits';
    r.marketing_consent_enabled := false;
    r.inventory_reuse_months := 24;
  end if;
  return r;
end;
$$;

-- As in 20261102120300_garden_removals.sql, plus kep_address, site_domain
-- (lower case host name) and kvkk_email. marketing_consent_enabled,
-- inventory_reuse_months and allow_fake_payments stay SQL only.
create or replace function public.ops_save_billing_setting(p_org_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  r public.org_billing_setting;
  v_allowed text[] := array[
    'accepts_signups', 'identity_number_required', 'legal_name', 'tax_office', 'tax_number',
    'mersis_number', 'address', 'phone', 'email', 'bank_name', 'iban', 'iban_holder',
    'payment_due_days', 'quote_valid_days', 'renewal_notice_days',
    'garden_changes_enabled', 'addon_min_days', 'removal_notice_days', 'removal_access_days', 'removal_refund_mode',
    'kep_address', 'site_domain', 'kvkk_email'
  ];
  v_iban text;
  v_n numeric;
begin
  perform private.require_ops(p_org_id);
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'settings';
  end if;
  for k in select jsonb_object_keys(p_settings) loop
    if not k = any (v_allowed) then
      raise exception 'invalid_input' using errcode = '22023', detail = k;
    end if;
  end loop;

  insert into public.org_billing_setting (org_id, updated_by) values (p_org_id, (select auth.uid()))
  on conflict (org_id) do nothing;
  select * into r from public.org_billing_setting s where s.org_id = p_org_id for update;

  if p_settings ? 'accepts_signups' then
    r.accepts_signups := private.input_bool(p_settings, 'accepts_signups');
    if r.accepts_signups is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'accepts_signups';
    end if;
  end if;
  if p_settings ? 'identity_number_required' then
    r.identity_number_required := private.input_bool(p_settings, 'identity_number_required');
    if r.identity_number_required is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'identity_number_required';
    end if;
  end if;
  if p_settings ? 'garden_changes_enabled' then
    r.garden_changes_enabled := private.input_bool(p_settings, 'garden_changes_enabled');
    if r.garden_changes_enabled is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'garden_changes_enabled';
    end if;
  end if;
  if p_settings ? 'legal_name' then r.legal_name := private.input_text(p_settings, 'legal_name', 1, 200); end if;
  if p_settings ? 'tax_office' then r.tax_office := private.input_text(p_settings, 'tax_office', 1, 100); end if;
  if p_settings ? 'tax_number' then
    r.tax_number := private.input_text(p_settings, 'tax_number', 10, 10);
    if r.tax_number !~ '^[0-9]{10}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'tax_number';
    end if;
  end if;
  if p_settings ? 'mersis_number' then
    r.mersis_number := private.input_text(p_settings, 'mersis_number', 16, 16);
    if r.mersis_number !~ '^[0-9]{16}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'mersis_number';
    end if;
  end if;
  if p_settings ? 'address' then r.address := private.input_text(p_settings, 'address', 1, 500); end if;
  if p_settings ? 'phone' then
    r.phone := private.input_text(p_settings, 'phone', 8, 16);
    if r.phone !~ '^\+[1-9][0-9]{6,14}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
    end if;
  end if;
  if p_settings ? 'email' then
    r.email := lower(private.input_text(p_settings, 'email', 3, 254));
    if r.email is not null and not private.is_valid_email(r.email) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'email';
    end if;
  end if;
  if p_settings ? 'kep_address' then
    r.kep_address := lower(private.input_text(p_settings, 'kep_address', 3, 254));
    if r.kep_address is not null and not private.is_valid_email(r.kep_address) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'kep_address';
    end if;
  end if;
  if p_settings ? 'kvkk_email' then
    r.kvkk_email := lower(private.input_text(p_settings, 'kvkk_email', 3, 254));
    if r.kvkk_email is not null and not private.is_valid_email(r.kvkk_email) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'kvkk_email';
    end if;
  end if;
  if p_settings ? 'site_domain' then
    r.site_domain := lower(private.input_text(p_settings, 'site_domain', 4, 253));
    if r.site_domain is not null
       and r.site_domain !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'site_domain';
    end if;
  end if;
  if p_settings ? 'bank_name' then r.bank_name := private.input_text(p_settings, 'bank_name', 1, 100); end if;
  if p_settings ? 'iban' then
    v_iban := upper(replace(private.input_text(p_settings, 'iban', 1, 40), ' ', ''));
    if v_iban !~ '^TR[0-9]{24}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'iban';
    end if;
    r.iban := v_iban;
  end if;
  if p_settings ? 'iban_holder' then r.iban_holder := private.input_text(p_settings, 'iban_holder', 1, 200); end if;
  foreach k in array array['payment_due_days', 'quote_valid_days', 'renewal_notice_days'] loop
    if p_settings ? k then
      v_n := private.input_number(p_settings, k, true);
      if v_n <> trunc(v_n) or v_n < 1 or v_n > 1000 then
        raise exception 'invalid_input' using errcode = '22023', detail = k;
      end if;
      case k
        when 'payment_due_days' then r.payment_due_days := v_n;
        when 'quote_valid_days' then r.quote_valid_days := v_n;
        else r.renewal_notice_days := v_n;
      end case;
    end if;
  end loop;
  foreach k in array array['addon_min_days', 'removal_notice_days', 'removal_access_days'] loop
    if p_settings ? k then
      v_n := private.input_number(p_settings, k, true);
      if v_n <> trunc(v_n)
         or v_n < (case k when 'addon_min_days' then 1 else 0 end)
         or v_n > (case k when 'addon_min_days' then 180 when 'removal_notice_days' then 90 else 365 end) then
        raise exception 'invalid_input' using errcode = '22023', detail = k;
      end if;
      case k
        when 'addon_min_days' then r.addon_min_days := v_n;
        when 'removal_notice_days' then r.removal_notice_days := v_n;
        else r.removal_access_days := v_n;
      end case;
    end if;
  end loop;
  if p_settings ? 'removal_refund_mode' then
    if jsonb_typeof(p_settings -> 'removal_refund_mode') <> 'string'
       or p_settings ->> 'removal_refund_mode' not in ('unused_visits', 'manual') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'removal_refund_mode';
    end if;
    r.removal_refund_mode := p_settings ->> 'removal_refund_mode';
  end if;

  begin
    update public.org_billing_setting
    set accepts_signups = r.accepts_signups, identity_number_required = r.identity_number_required,
        legal_name = r.legal_name, tax_office = r.tax_office, tax_number = r.tax_number,
        mersis_number = r.mersis_number, address = r.address, phone = r.phone, email = r.email,
        kep_address = r.kep_address, site_domain = r.site_domain, kvkk_email = r.kvkk_email,
        bank_name = r.bank_name, iban = r.iban, iban_holder = r.iban_holder,
        payment_due_days = r.payment_due_days, quote_valid_days = r.quote_valid_days,
        renewal_notice_days = r.renewal_notice_days, garden_changes_enabled = r.garden_changes_enabled,
        addon_min_days = r.addon_min_days, removal_notice_days = r.removal_notice_days,
        removal_access_days = r.removal_access_days, removal_refund_mode = r.removal_refund_mode,
        updated_by = (select auth.uid())
    where org_id = p_org_id;
  exception
    when unique_violation then
      raise exception 'exists' using errcode = '23505', detail = 'accepts_signups';
    when check_violation or not_null_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'billing_setting.saved', 'billing_setting', p_org_id,
    jsonb_build_object('fields', (select jsonb_agg(x order by x) from jsonb_object_keys(p_settings) x)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Company information
-- ---------------------------------------------------------------------------

-- Every field the legal texts and the footer need is present (H34): legal
-- name, MERSİS, address, phone, e-mail, KEP, tax office and number, domain.
create function private.company_info_complete(s public.org_billing_setting)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s.legal_name is not null and s.mersis_number is not null and s.address is not null
     and s.phone is not null and s.email is not null and s.kep_address is not null
     and s.tax_office is not null and s.tax_number is not null and s.site_domain is not null;
$$;

-- The seller (docs/musteri-yonetimi.md §9.3): demo orgs never count; the
-- sign-up org when there is one; else the only org with a billing setting;
-- else none.
create function private.seller_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.org_id from public.org_billing_setting s
     where s.accepts_signups and not private.is_demo_org(s.org_id)),
    (select case when count(*) = 1 then (array_agg(s.org_id))[1] end
     from public.org_billing_setting s where not private.is_demo_org(s.org_id)));
$$;
comment on function private.seller_org_id() is
  'The seller org of the public site: the non-demo sign-up org, else the only non-demo org with a billing setting, else null.';

create function public.public_company_info()
returns table (
  legal_name text,
  mersis_number text,
  address text,
  phone text,
  email text,
  kep_address text,
  tax_office text,
  tax_number text,
  site_domain text,
  kvkk_email text,
  complete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.legal_name, s.mersis_number, s.address, s.phone, s.email, s.kep_address, s.tax_office, s.tax_number,
         s.site_domain, coalesce(s.kvkk_email, 'kvkk@' || s.site_domain),
         coalesce(private.company_info_complete(s), false)
  from (select 1) one
  left join public.org_billing_setting s on s.org_id = private.seller_org_id();
$$;
comment on function public.public_company_info() is
  'Public site: the seller''s company fields (H34) and whether they are complete; all null when there is no seller.';

-- ---------------------------------------------------------------------------
-- 4. Production gate
-- ---------------------------------------------------------------------------

-- Active where fake payments are refused (pilot, production); inactive where
-- they are allowed (local, CI, the hosted test project).
create function private.legal_gate_active(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (private.billing_setting(p_org_id)).allow_fake_payments;
$$;

-- Why a quote of the org cannot be accepted by the user while the gate is
-- active (empty when nothing blocks), in this order: distance_sales_draft,
-- pre_information_draft, kvkk_notice_not_final (the user's latest KVKK notice
-- record is not a registered final version), company_info_incomplete.
create function private.legal_gate_reasons(p_org_id uuid, p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when not coalesce((private.legal_text_current('distance_sales')).is_final, false)
      then 'distance_sales_draft' end,
    case when not coalesce((private.legal_text_current('pre_information')).is_final, false)
      then 'pre_information_draft' end,
    case when not coalesce((
      select c.granted and private.legal_text_final('kvkk_notice', c.text_version)
      from private.consent_record c
      where c.org_id = p_org_id and c.subject_id = p_user_id and c.kind = 'kvkk_notice'
      order by c.recorded_at desc, c.id desc
      limit 1), false)
      then 'kvkk_notice_not_final' end,
    case when not private.company_info_complete(private.billing_setting(p_org_id))
      then 'company_info_incomplete' end
  ], null);
$$;

-- The caller's gate in an org: the given one when the caller has a quote
-- there, else their customer org. active false and no reasons when there is
-- none.
create function public.legal_gate_status(p_org_id uuid default null)
returns table (active boolean, reasons text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  v_org := case
    when p_org_id is not null and exists (
      select 1 from public.quote q where q.org_id = p_org_id and q.customer_user_id = v_user) then p_org_id
    when p_org_id is null then private.customer_org_id(v_user)
  end;
  if v_org is null then
    return query select false, array[]::text[];
    return;
  end if;
  return query select private.legal_gate_active(v_org),
    case when private.legal_gate_active(v_org) then private.legal_gate_reasons(v_org, v_user) else array[]::text[] end;
end;
$$;
comment on function public.legal_gate_status(uuid) is
  'Customer: whether quote acceptance is gated in the org (fake payments refused) and what blocks it (legal_texts_not_final reasons).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.register_legal_text(text, text, text) from public;
revoke all on function private.legal_text_current(text) from public;
revoke all on function private.legal_text_final(text, text) from public;
revoke all on function private.company_info_complete(public.org_billing_setting) from public;
revoke all on function private.seller_org_id() from public;
revoke all on function private.legal_gate_active(uuid) from public;
revoke all on function private.legal_gate_reasons(uuid, uuid) from public;

revoke all on function public.registered_legal_text_versions() from public, anon, authenticated;
revoke all on function public.public_company_info() from public, anon, authenticated;
revoke all on function public.legal_gate_status(uuid) from public, anon, authenticated;
grant execute on function public.registered_legal_text_versions() to anon, authenticated, service_role;
grant execute on function public.public_company_info() to anon, authenticated, service_role;
grant execute on function public.legal_gate_status(uuid) to authenticated;
