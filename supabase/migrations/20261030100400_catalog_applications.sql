-- IP12 / 5: billing settings, packages, price lists and applications
-- (docs/musteri-yonetimi.md §5.1, §6.9). Quotes, orders and payments are
-- IP12-A2's.
--
-- 1. Ops settings: ops_billing_setting, ops_save_billing_setting (never
--    allow_fake_payments: SQL only).
-- 2. Packages and price lists: ops_save_package, ops_create_price_list_draft,
--    ops_save_price_list_draft, ops_publish_price_list (advisory lock
--    price_list:<org>), ops_delete_price_list_draft.
-- 3. Customer applications: create (one draft per customer and org, advisory
--    lock service_application:<user>), package, gardens with their private
--    detail, submit (number B-YYYY-NNNNNN), withdraw.
-- 4. Ops review: list, garden detail, area verification, rejection.
--
-- Every state change is a conditional update (state_changed when the row moved
-- meanwhile) with an audit row; locks are taken application → quote. Ops
-- writes on a customer's records refuse the customer themself (forbidden).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.require_ops(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- A json ring of [lon, lat] pairs (at least three points; closed here) as a
-- valid polygon, or boundary_invalid. Same rules as add_owner_declared_boundary.
create function private.ring_polygon(p_ring jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ring jsonb := p_ring;
  v_point jsonb;
  v_geom extensions.geometry;
begin
  if v_ring is null or jsonb_typeof(v_ring) <> 'array' or jsonb_array_length(v_ring) < 3
     or jsonb_array_length(v_ring) > 500 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'at least three points';
  end if;
  for v_point in select value from jsonb_array_elements(v_ring) loop
    if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
       or jsonb_typeof(v_point -> 0) <> 'number' or jsonb_typeof(v_point -> 1) <> 'number'
       or abs((v_point ->> 0)::double precision) > 180 or abs((v_point ->> 1)::double precision) > 90 then
      raise exception 'boundary_invalid' using errcode = '22023', detail = 'points are [lon, lat]';
    end if;
  end loop;
  if v_ring -> 0 <> v_ring -> -1 then
    v_ring := v_ring || jsonb_build_array(v_ring -> 0);
  end if;
  if jsonb_array_length(v_ring) < 4 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'at least three points';
  end if;
  v_geom := extensions.st_setsrid(
    extensions.st_geomfromgeojson(
      jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(v_ring))::text
    ),
    4326
  );
  -- st_isvaliddetail, unlike st_isvalid, raises no notice quoting a coordinate.
  if not (extensions.st_isvaliddetail(v_geom)).valid or extensions.st_area(v_geom) = 0 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'self-intersecting or empty';
  end if;
  return v_geom;
end;
$$;

-- A json number field as numeric (null when absent), or invalid_input.
create function private.input_number(p_obj jsonb, p_key text, p_required boolean default false)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_obj -> p_key is null or jsonb_typeof(p_obj -> p_key) = 'null' then
    if p_required then
      raise exception 'invalid_input' using errcode = '22023', detail = p_key;
    end if;
    return null;
  end if;
  if jsonb_typeof(p_obj -> p_key) <> 'number' then
    raise exception 'invalid_input' using errcode = '22023', detail = p_key;
  end if;
  return (p_obj ->> p_key)::numeric;
end;
$$;

create function private.input_bool(p_obj jsonb, p_key text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_obj -> p_key is null or jsonb_typeof(p_obj -> p_key) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_obj -> p_key) <> 'boolean' then
    raise exception 'invalid_input' using errcode = '22023', detail = p_key;
  end if;
  return (p_obj ->> p_key)::boolean;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

-- The org's settings, or the defaults while none are saved.
create function public.ops_billing_setting(p_org_id uuid)
returns setof public.org_billing_setting
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.org_billing_setting;
begin
  perform private.require_ops(p_org_id);
  select * into r from public.org_billing_setting s where s.org_id = p_org_id;
  if not found then
    r.org_id := p_org_id;
    r.accepts_signups := false;
    r.allow_fake_payments := false;
    r.identity_number_required := false;
    r.payment_due_days := 14;
    r.quote_valid_days := 30;
    r.renewal_notice_days := 45;
  end if;
  return next r;
end;
$$;
comment on function public.ops_billing_setting(uuid) is 'Ops: billing settings of the org (defaults while none are saved).';

-- p_settings: any of accepts_signups, identity_number_required, legal_name,
-- tax_office, tax_number, mersis_number, address, phone, email, bank_name,
-- iban, iban_holder, payment_due_days, quote_valid_days, renewal_notice_days.
-- Keys present are written (null clears a text field); others stay.
-- Errors: forbidden, invalid_input (detail: key; also allow_fake_payments,
-- which only SQL sets), exists (another org already takes sign-ups).
create function public.ops_save_billing_setting(p_org_id uuid, p_settings jsonb)
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
    'payment_due_days', 'quote_valid_days', 'renewal_notice_days'
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

  begin
    update public.org_billing_setting
    set accepts_signups = r.accepts_signups, identity_number_required = r.identity_number_required,
        legal_name = r.legal_name, tax_office = r.tax_office, tax_number = r.tax_number,
        mersis_number = r.mersis_number, address = r.address, phone = r.phone, email = r.email,
        bank_name = r.bank_name, iban = r.iban, iban_holder = r.iban_holder,
        payment_due_days = r.payment_due_days, quote_valid_days = r.quote_valid_days,
        renewal_notice_days = r.renewal_notice_days, updated_by = (select auth.uid())
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
comment on function public.ops_save_billing_setting(uuid, jsonb) is
  'Ops: saves billing settings (the keys given). allow_fake_payments is set with SQL only.';

-- ---------------------------------------------------------------------------
-- 2. Packages and price lists
-- ---------------------------------------------------------------------------

-- p_package: {id?, code, name, description?, periodic_visits_per_year,
--   includes_inventory?, active?, sort_order?}. Without id a new package.
-- Errors: forbidden, not_found (id), invalid_input (detail: field), exists (code).
create function public.ops_save_package(p_org_id uuid, p_package jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_name text;
  v_description text;
  v_visits numeric;
  v_inventory boolean;
  v_active boolean;
  v_sort numeric;
begin
  perform private.require_ops(p_org_id);
  if p_package is null or jsonb_typeof(p_package) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'package';
  end if;
  if private.input_text(p_package, 'id', 36, 36) is not null then
    begin
      v_id := (p_package ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'id';
    end;
    if not exists (select 1 from public.service_package p where p.id = v_id and p.org_id = p_org_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  v_code := lower(private.input_text(p_package, 'code', 2, 32, true));
  if v_code !~ '^[a-z][a-z0-9_-]{1,31}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'code';
  end if;
  v_name := private.input_text(p_package, 'name', 1, 100, true);
  v_description := private.input_text(p_package, 'description', 1, 2000);
  v_visits := private.input_number(p_package, 'periodic_visits_per_year', true);
  if v_visits <> trunc(v_visits) or v_visits not between 1 and 12 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'periodic_visits_per_year';
  end if;
  v_inventory := coalesce(private.input_bool(p_package, 'includes_inventory'), true);
  v_active := coalesce(private.input_bool(p_package, 'active'), true);
  v_sort := coalesce(private.input_number(p_package, 'sort_order'), 0);
  if v_sort <> trunc(v_sort) or abs(v_sort) > 1000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'sort_order';
  end if;

  begin
    if v_id is null then
      insert into public.service_package (org_id, code, name, description, periodic_visits_per_year,
        includes_inventory, active, sort_order)
      values (p_org_id, v_code, v_name, v_description, v_visits, v_inventory, v_active, v_sort)
      returning id into v_id;
    else
      update public.service_package
      set code = v_code, name = v_name, description = v_description, periodic_visits_per_year = v_visits,
          includes_inventory = v_inventory, active = v_active, sort_order = v_sort
      where id = v_id;
    end if;
  exception
    when unique_violation then
      raise exception 'exists' using errcode = '23505', detail = 'code';
    when check_violation or not_null_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'package.saved', 'package', v_id,
    jsonb_build_object('code', v_code, 'active', v_active));
  return v_id;
end;
$$;
comment on function public.ops_save_package(uuid, jsonb) is 'Ops: creates or updates a service package.';

-- The price list row locked for a draft change, or not_found / forbidden /
-- price_list_not_draft.
create function private.lock_price_list_draft(p_price_list_id uuid)
returns public.price_list
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.price_list;
begin
  select * into l from public.price_list where id = p_price_list_id for update;
  if not found or l.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(l.org_id);
  if l.status <> 'draft' then
    raise exception 'price_list_not_draft' using errcode = 'P0001';
  end if;
  return l;
end;
$$;

-- A new draft, empty or a copy (VAT, note, items; valid_from only when still
-- ahead) of another list of the org.
create function public.ops_create_price_list_draft(p_org_id uuid, p_copy_from_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  src public.price_list;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform private.require_ops(p_org_id);
  if p_copy_from_id is not null then
    select * into src from public.price_list where id = p_copy_from_id and org_id = p_org_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  insert into public.price_list (org_id, status, valid_from, vat_rate_bp, note, created_by)
  values (
    p_org_id, 'draft',
    case when src.valid_from >= v_today then src.valid_from end,
    coalesce(src.vat_rate_bp, 2000), src.note, (select auth.uid())
  )
  returning id into v_id;
  if src.id is not null then
    insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus)
    select p_org_id, v_id, i.package_id, i.unit_price_kurus, i.minimum_fee_kurus, i.inventory_fee_kurus
    from public.price_list_item i where i.price_list_id = src.id;
  end if;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'price_list.draft_created', 'price_list', v_id,
    jsonb_build_object('copy_from', p_copy_from_id));
  return v_id;
end;
$$;
comment on function public.ops_create_price_list_draft(uuid, uuid) is
  'Ops: a new price list draft, empty or copied from another list of the org.';

-- p_items: [{package_id, unit_price_kurus, minimum_fee_kurus?, inventory_fee_kurus?}]
-- replaces the items. Errors: not_found, forbidden, price_list_not_draft,
-- invalid_input (detail: field or items).
create function public.ops_save_price_list_draft(
  p_price_list_id uuid,
  p_valid_from date,
  p_vat_rate_bp integer,
  p_note text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.price_list;
  v_item jsonb;
  v_package uuid;
  v_unit numeric;
  v_min numeric;
  v_inv numeric;
  v_seen uuid[] := '{}';
begin
  l := private.lock_price_list_draft(p_price_list_id);
  if p_vat_rate_bp is null or p_vat_rate_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'vat_rate_bp';
  end if;
  if length(p_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;

  delete from public.price_list_item where price_list_id = l.id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'items';
    end if;
    begin
      v_package := (v_item ->> 'package_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'package_id';
    end;
    if v_package is null or v_package = any (v_seen)
       or not exists (select 1 from public.service_package p where p.id = v_package and p.org_id = l.org_id) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'package_id';
    end if;
    v_seen := v_seen || v_package;
    v_unit := private.input_number(v_item, 'unit_price_kurus', true);
    v_min := coalesce(private.input_number(v_item, 'minimum_fee_kurus'), 0);
    v_inv := coalesce(private.input_number(v_item, 'inventory_fee_kurus'), 0);
    if v_unit <> trunc(v_unit) or v_unit <= 0 or v_unit > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'unit_price_kurus';
    end if;
    if v_min <> trunc(v_min) or v_min < 0 or v_min > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'minimum_fee_kurus';
    end if;
    if v_inv <> trunc(v_inv) or v_inv < 0 or v_inv > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'inventory_fee_kurus';
    end if;
    insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus)
    values (l.org_id, l.id, v_package, v_unit, v_min, v_inv);
  end loop;

  update public.price_list
  set valid_from = p_valid_from, vat_rate_bp = p_vat_rate_bp, note = nullif(btrim(p_note), '')
  where id = l.id;
  perform private.audit(l.org_id, (select auth.uid()), 'ops', 'price_list.draft_saved', 'price_list', l.id,
    jsonb_build_object('items', jsonb_array_length(p_items), 'vat_rate_bp', p_vat_rate_bp));
end;
$$;
comment on function public.ops_save_price_list_draft(uuid, date, integer, text, jsonb) is
  'Ops: saves a price list draft (validity date, VAT, note, items).';

-- Publishes a draft as the org's next version. Errors: not_found, forbidden,
-- price_list_not_draft, valid_from_in_past (or none set),
-- price_list_incomplete (an active package without an item, or no item).
create function public.ops_publish_price_list(p_price_list_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.price_list;
  v_org uuid;
  v_version integer;
begin
  select org_id into v_org from public.price_list where id = p_price_list_id;
  if v_org is not null then
    perform pg_advisory_xact_lock(hashtextextended('price_list:' || v_org::text, 0));
  end if;
  l := private.lock_price_list_draft(p_price_list_id);
  if l.valid_from is null or l.valid_from < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'valid_from_in_past' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.price_list_item i where i.price_list_id = l.id)
     or exists (
       select 1 from public.service_package p
       where p.org_id = l.org_id and p.active
         and not exists (select 1 from public.price_list_item i where i.price_list_id = l.id and i.package_id = p.id)
     ) then
    raise exception 'price_list_incomplete' using errcode = 'P0001';
  end if;

  select coalesce(max(x.version), 0) + 1 into v_version from public.price_list x where x.org_id = l.org_id;
  update public.price_list
  set status = 'published', version = v_version, published_at = now(), published_by = (select auth.uid())
  where id = l.id and status = 'draft'
  returning version into v_version;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(l.org_id, (select auth.uid()), 'ops', 'price_list.published', 'price_list', l.id,
    jsonb_build_object('version', v_version, 'valid_from', l.valid_from));
  return v_version;
end;
$$;
comment on function public.ops_publish_price_list(uuid) is
  'Ops: publishes a draft as the next version; a published version never changes.';

create function public.ops_delete_price_list_draft(p_price_list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.price_list;
begin
  l := private.lock_price_list_draft(p_price_list_id);
  delete from public.price_list where id = l.id and status = 'draft';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(l.org_id, (select auth.uid()), 'ops', 'price_list.draft_deleted', 'price_list', l.id, '{}');
end;
$$;
comment on function public.ops_delete_price_list_draft(uuid) is 'Ops: deletes a price list draft with its items.';

-- ---------------------------------------------------------------------------
-- 3. Customer applications
-- ---------------------------------------------------------------------------

-- The caller's application, locked; not_found for anyone else's.
create function private.lock_own_application(p_application_id uuid)
returns public.service_application
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
begin
  select * into a from public.service_application
  where id = p_application_id and customer_user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return a;
end;
$$;

create function private.check_application_package(p_org_id uuid, p_package_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_package_id is not null and not exists (
    select 1 from public.service_package p where p.id = p_package_id and p.org_id = p_org_id and p.active
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'package_id';
  end if;
end;
$$;

-- The caller's draft in their org (created when there is none). Errors:
-- not_customer, invalid_input (package_id).
create function public.customer_create_application(p_package_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  v_id uuid;
begin
  if v_user is null or v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  perform private.check_application_package(v_org, p_package_id);
  perform pg_advisory_xact_lock(hashtextextended('service_application:' || v_user::text, 0));
  select id into v_id from public.service_application
  where customer_user_id = v_user and org_id = v_org and status = 'draft';
  if found then
    return v_id;
  end if;
  insert into public.service_application (org_id, customer_user_id, package_id)
  values (v_org, v_user, p_package_id)
  returning id into v_id;
  perform private.audit(v_org, v_user, 'customer', 'application.created', 'application', v_id,
    jsonb_build_object('package_id', p_package_id));
  return v_id;
end;
$$;
comment on function public.customer_create_application(uuid) is
  'Customer: the open application draft (one per customer and org), created when there is none.';

create function public.customer_set_application_package(
  p_application_id uuid,
  p_package_id uuid,
  p_customer_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_note text := nullif(btrim(p_customer_note), '');
begin
  a := private.lock_own_application(p_application_id);
  if a.status <> 'draft' then
    raise exception 'application_not_draft' using errcode = 'P0001';
  end if;
  if p_package_id is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'package_id';
  end if;
  perform private.check_application_package(a.org_id, p_package_id);
  if length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'customer_note';
  end if;
  update public.service_application set package_id = p_package_id, customer_note = v_note
  where id = a.id and status = 'draft';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
end;
$$;
comment on function public.customer_set_application_package(uuid, uuid, text) is
  'Customer: package and note of the application draft.';

-- p_garden: {name, province, district, village, declared_area_m2, irrigation,
--   estimated_tree_count, lon, lat, position_uncertainty_m, boundary [[lon, lat], ...]}
-- p_detail: {authorization_basis, deed_block, deed_parcel, is_shared_deed,
--   used_portion_note, entry_permission (true), access_note, site_contact_name,
--   site_contact_phone}
-- A new garden without p_garden_id (at most 10 per application), otherwise
-- that garden is replaced. Errors: not_found, application_not_draft,
-- too_many_gardens, invalid_input (detail: field), boundary_invalid.
create function public.customer_save_application_garden(
  p_application_id uuid,
  p_garden jsonb,
  p_detail jsonb,
  p_garden_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_id uuid := p_garden_id;
  v_name text;
  v_province text;
  v_district text;
  v_village text;
  v_area numeric;
  v_irrigation text;
  v_trees numeric;
  v_lon numeric;
  v_lat numeric;
  v_uncertainty numeric;
  v_boundary extensions.geometry;
  v_basis text;
  v_shared boolean;
  v_entry boolean;
  v_contact_phone text;
begin
  a := private.lock_own_application(p_application_id);
  if a.status <> 'draft' then
    raise exception 'application_not_draft' using errcode = 'P0001';
  end if;
  if v_id is not null and not exists (
    select 1 from public.application_garden g where g.id = v_id and g.application_id = a.id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_id is null and (select count(*) from public.application_garden g where g.application_id = a.id) >= 10 then
    raise exception 'too_many_gardens' using errcode = 'P0001';
  end if;
  if p_garden is null or jsonb_typeof(p_garden) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'garden';
  end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'detail';
  end if;

  v_name := private.input_text(p_garden, 'name', 1, 120, true);
  v_province := private.input_text(p_garden, 'province', 1, 100);
  v_district := private.input_text(p_garden, 'district', 1, 100);
  v_village := private.input_text(p_garden, 'village', 1, 100);
  v_area := private.input_number(p_garden, 'declared_area_m2', true);
  if v_area not between 500 and 10000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'declared_area_m2';
  end if;
  v_irrigation := coalesce(private.input_text(p_garden, 'irrigation', 1, 20), 'unknown');
  if v_irrigation not in ('irrigated', 'rainfed', 'unknown') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'irrigation';
  end if;
  v_trees := private.input_number(p_garden, 'estimated_tree_count');
  if v_trees is not null and (v_trees <> trunc(v_trees) or v_trees not between 0 and 1000000) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'estimated_tree_count';
  end if;
  v_lon := private.input_number(p_garden, 'lon', true);
  v_lat := private.input_number(p_garden, 'lat', true);
  if abs(v_lon) > 180 or abs(v_lat) > 90 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'position';
  end if;
  v_uncertainty := coalesce(private.input_number(p_garden, 'position_uncertainty_m'), 100);
  if v_uncertainty <= 0 or v_uncertainty > 100000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'position_uncertainty_m';
  end if;
  if p_garden -> 'boundary' is not null and jsonb_typeof(p_garden -> 'boundary') <> 'null' then
    v_boundary := private.ring_polygon(p_garden -> 'boundary');
  end if;

  v_basis := private.input_text(p_detail, 'authorization_basis', 1, 40);
  if v_basis is not null and v_basis not in ('title_holder', 'power_of_attorney', 'heir_declaration') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'authorization_basis';
  end if;
  v_entry := private.input_bool(p_detail, 'entry_permission');
  if v_entry is distinct from true then
    raise exception 'invalid_input' using errcode = '22023', detail = 'entry_permission';
  end if;
  v_shared := private.input_bool(p_detail, 'is_shared_deed');
  v_contact_phone := private.input_text(p_detail, 'site_contact_phone', 8, 16);
  if v_contact_phone is not null and v_contact_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'site_contact_phone';
  end if;

  begin
    if v_id is null then
      insert into public.application_garden (
        org_id, application_id, customer_user_id, sort_order, name, province, district, village,
        declared_area_m2, irrigation, estimated_tree_count, position, position_uncertainty_m, boundary
      )
      values (
        a.org_id, a.id, a.customer_user_id,
        coalesce((select max(g.sort_order) + 1 from public.application_garden g where g.application_id = a.id), 1),
        v_name, v_province, v_district, v_village, v_area, v_irrigation::public.irrigation_type, v_trees,
        extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326), v_uncertainty, v_boundary
      )
      returning id into v_id;
    else
      update public.application_garden
      set name = v_name, province = v_province, district = v_district, village = v_village,
          declared_area_m2 = v_area, irrigation = v_irrigation::public.irrigation_type,
          estimated_tree_count = v_trees,
          position = extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326),
          position_uncertainty_m = v_uncertainty, boundary = v_boundary
      where id = v_id;
    end if;

    insert into private.application_garden_detail (
      application_garden_id, org_id, authorization_basis, deed_block, deed_parcel, is_shared_deed,
      used_portion_note, entry_permission_at, access_note, site_contact_name, site_contact_phone
    )
    values (
      v_id, a.org_id, v_basis::private.authorization_basis,
      private.input_text(p_detail, 'deed_block', 1, 50), private.input_text(p_detail, 'deed_parcel', 1, 50),
      v_shared, private.input_text(p_detail, 'used_portion_note', 1, 1000), now(),
      private.input_text(p_detail, 'access_note', 1, 1000), private.input_text(p_detail, 'site_contact_name', 1, 120),
      v_contact_phone
    )
    on conflict (application_garden_id) do update
    set authorization_basis = excluded.authorization_basis, deed_block = excluded.deed_block,
        deed_parcel = excluded.deed_parcel, is_shared_deed = excluded.is_shared_deed,
        used_portion_note = excluded.used_portion_note, access_note = excluded.access_note,
        site_contact_name = excluded.site_contact_name, site_contact_phone = excluded.site_contact_phone;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end;
$$;
comment on function public.customer_save_application_garden(uuid, jsonb, jsonb, uuid) is
  'Customer: adds or replaces a garden (with its private detail) of the application draft.';

create function public.customer_remove_application_garden(p_garden_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
begin
  a := private.lock_own_application(
    (select g.application_id from public.application_garden g
     where g.id = p_garden_id and g.customer_user_id = (select auth.uid())));
  if a.status <> 'draft' then
    raise exception 'application_not_draft' using errcode = 'P0001';
  end if;
  delete from public.application_garden where id = p_garden_id and application_id = a.id;
end;
$$;
comment on function public.customer_remove_application_garden(uuid) is 'Customer: removes a garden from the application draft.';

create function public.customer_application_garden_detail(p_garden_id uuid)
returns table (
  application_garden_id uuid,
  authorization_basis text,
  deed_block text,
  deed_parcel text,
  is_shared_deed boolean,
  used_portion_note text,
  entry_permission_at timestamptz,
  access_note text,
  site_contact_name text,
  site_contact_phone text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.application_garden_id, d.authorization_basis::text, d.deed_block, d.deed_parcel, d.is_shared_deed,
         d.used_portion_note, d.entry_permission_at, d.access_note, d.site_contact_name, d.site_contact_phone,
         d.updated_at
  from private.application_garden_detail d
  join public.application_garden g on g.id = d.application_garden_id
  where d.application_garden_id = p_garden_id and g.customer_user_id = (select auth.uid());
$$;
comment on function public.customer_application_garden_detail(uuid) is
  'Customer: the private detail (deed, access, site contact) of an own application garden.';

-- Returns the application number. Errors: not_found, application_not_draft,
-- application_incomplete (detail: package_id, gardens, authorization_basis).
create function public.customer_submit_application(p_application_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_number text;
  v_gardens integer;
begin
  a := private.lock_own_application(p_application_id);
  if a.status <> 'draft' then
    raise exception 'application_not_draft' using errcode = 'P0001';
  end if;
  if a.package_id is null or not exists (
    select 1 from public.service_package p where p.id = a.package_id and p.active
  ) then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'package_id';
  end if;
  select count(*) into v_gardens from public.application_garden g where g.application_id = a.id;
  if v_gardens = 0 then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  if exists (
    select 1 from public.application_garden g
    left join private.application_garden_detail d on d.application_garden_id = g.id
    where g.application_id = a.id and d.authorization_basis is null
  ) then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'authorization_basis';
  end if;

  v_number := private.next_document_number(a.org_id, 'B');
  update public.service_application
  set status = 'submitted', number = v_number, submitted_at = now()
  where id = a.id and status = 'draft';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(a.org_id, a.customer_user_id, 'customer', 'application.submitted', 'application', a.id,
    jsonb_build_object('number', v_number, 'gardens', v_gardens));
  return v_number;
end;
$$;
comment on function public.customer_submit_application(uuid) is
  'Customer: submits the draft for review; returns its number (B-YYYY-NNNNNN).';

-- Cancels the application's open quote (application already locked).
create function private.cancel_open_quote(p_application public.service_application, p_actor uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid;
begin
  for v_quote in
    update public.quote set status = 'cancelled', decided_at = now(), decided_by = p_actor
    where application_id = p_application.id and status = 'issued'
    returning id
  loop
    perform private.audit(p_application.org_id, p_actor, p_role, 'quote.cancelled', 'quote', v_quote,
      jsonb_build_object('application_id', p_application.id));
  end loop;
end;
$$;

-- draft, submitted or quoted → withdrawn; an open quote is cancelled.
-- Errors: not_found, application_not_open.
create function public.customer_withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
begin
  a := private.lock_own_application(p_application_id);
  if a.status not in ('draft', 'submitted', 'quoted') then
    raise exception 'application_not_open' using errcode = 'P0001';
  end if;
  perform private.cancel_open_quote(a, a.customer_user_id, 'customer');
  update public.service_application
  set status = 'withdrawn', decided_at = now(), decided_by = a.customer_user_id
  where id = a.id and status = a.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(a.org_id, a.customer_user_id, 'customer', 'application.withdrawn', 'application', a.id,
    jsonb_build_object('from', a.status));
end;
$$;
comment on function public.customer_withdraw_application(uuid) is
  'Customer: withdraws the application (draft, submitted or quoted); an open quote is cancelled.';

-- ---------------------------------------------------------------------------
-- 4. Ops review
-- ---------------------------------------------------------------------------

-- Applications of the org, newest first; without p_status all but drafts.
create function public.ops_applications(p_org_id uuid, p_status text default null, p_limit integer default 200)
returns table (
  id uuid,
  number text,
  status text,
  customer_user_id uuid,
  customer_name text,
  package_id uuid,
  package_name text,
  garden_count integer,
  declared_area_m2 numeric,
  verified_garden_count integer,
  open_quote_id uuid,
  rejection_reason text,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and not p_status = any (enum_range(null::public.application_status)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select a.id, a.number, a.status::text, a.customer_user_id, op.full_name, a.package_id, sp.name,
         coalesce(g.n, 0)::integer, coalesce(g.area, 0), coalesce(g.verified, 0)::integer,
         q.id, a.rejection_reason::text, a.submitted_at, a.decided_at, a.created_at
  from public.service_application a
  left join private.owner_profile op on op.user_id = a.customer_user_id and op.org_id = a.org_id
  left join public.service_package sp on sp.id = a.package_id
  left join lateral (
    select count(*) as n, sum(x.declared_area_m2) as area, count(x.verified_at) as verified
    from public.application_garden x where x.application_id = a.id
  ) g on true
  left join public.quote q on q.application_id = a.id and q.status = 'issued'
  where a.org_id = p_org_id
    and (case when p_status is null then a.status <> 'draft' else a.status::text = p_status end)
  order by coalesce(a.submitted_at, a.created_at) desc, a.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_applications(uuid, text, integer) is
  'Ops: applications of the org with garden counts and areas (all but drafts unless a status is given).';

create function public.ops_application_garden_detail(p_garden_id uuid)
returns table (
  application_garden_id uuid,
  authorization_basis text,
  deed_block text,
  deed_parcel text,
  is_shared_deed boolean,
  used_portion_note text,
  entry_permission_at timestamptz,
  access_note text,
  site_contact_name text,
  site_contact_phone text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.application_garden_id, d.authorization_basis::text, d.deed_block, d.deed_parcel, d.is_shared_deed,
         d.used_portion_note, d.entry_permission_at, d.access_note, d.site_contact_name, d.site_contact_phone,
         d.updated_at
  from private.application_garden_detail d
  where d.application_garden_id = p_garden_id
    and d.org_id in (select authz.user_org_ids('{ops}'));
$$;
comment on function public.ops_application_garden_detail(uuid) is
  'Ops: deed reference, authorization, access note and site contact of an application garden.';

-- The application of a garden or of an id, locked for ops; not_found,
-- forbidden (not ops, or the caller's own application).
create function private.lock_application_for_ops(p_application_id uuid)
returns public.service_application
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
begin
  select * into a from public.service_application where id = p_application_id for update;
  if not found or a.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(a.org_id);
  if a.customer_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return a;
end;
$$;

-- Errors: not_found, forbidden, application_not_open (only submitted or
-- quoted), invalid_input (verified_area_m2, note), boundary_invalid.
create function public.ops_verify_application_garden(
  p_garden_id uuid,
  p_verified_area_m2 numeric,
  p_boundary jsonb default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_boundary extensions.geometry;
  v_note text := nullif(btrim(p_note), '');
begin
  a := private.lock_application_for_ops(
    (select g.application_id from public.application_garden g where g.id = p_garden_id));
  if a.status not in ('submitted', 'quoted') then
    raise exception 'application_not_open' using errcode = 'P0001';
  end if;
  if p_verified_area_m2 is null or p_verified_area_m2 <= 0 or p_verified_area_m2 > 10000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'verified_area_m2';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if p_boundary is not null and jsonb_typeof(p_boundary) <> 'null' then
    v_boundary := private.ring_polygon(p_boundary);
  end if;
  update public.application_garden
  set verified_area_m2 = round(p_verified_area_m2, 2), verified_at = now(), verified_by = (select auth.uid()),
      verification_note = v_note, boundary = coalesce(v_boundary, boundary)
  where id = p_garden_id;
  perform private.audit(a.org_id, (select auth.uid()), 'ops', 'application_garden.verified', 'application_garden',
    p_garden_id, jsonb_build_object('application_id', a.id, 'verified_area_m2', round(p_verified_area_m2, 2),
      'boundary', v_boundary is not null));
end;
$$;
comment on function public.ops_verify_application_garden(uuid, numeric, jsonb, text) is
  'Ops: verified area (and optionally a redrawn boundary) of an application garden.';

-- submitted or quoted → rejected (open quote cancelled). Errors: not_found,
-- forbidden, application_not_open, invalid_input (reason, note).
create function public.ops_reject_application(p_application_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_note text := nullif(btrim(p_note), '');
begin
  a := private.lock_application_for_ops(p_application_id);
  if a.status not in ('submitted', 'quoted') then
    raise exception 'application_not_open' using errcode = 'P0001';
  end if;
  if p_reason is null or not p_reason = any (enum_range(null::public.application_rejection_reason)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform private.cancel_open_quote(a, (select auth.uid()), 'ops');
  update public.service_application
  set status = 'rejected', rejection_reason = p_reason::public.application_rejection_reason, ops_note = v_note,
      decided_at = now(), decided_by = (select auth.uid())
  where id = a.id and status = a.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(a.org_id, (select auth.uid()), 'ops', 'application.rejected', 'application', a.id,
    jsonb_build_object('reason', p_reason, 'from', a.status));
end;
$$;
comment on function public.ops_reject_application(uuid, text, text) is
  'Ops: rejects a submitted or quoted application with a reason; an open quote is cancelled.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.require_ops(uuid) from public;
revoke all on function private.ring_polygon(jsonb) from public;
revoke all on function private.input_number(jsonb, text, boolean) from public;
revoke all on function private.input_bool(jsonb, text) from public;
revoke all on function private.lock_price_list_draft(uuid) from public;
revoke all on function private.lock_own_application(uuid) from public;
revoke all on function private.check_application_package(uuid, uuid) from public;
revoke all on function private.cancel_open_quote(public.service_application, uuid, text) from public;
revoke all on function private.lock_application_for_ops(uuid) from public;

revoke all on function public.ops_billing_setting(uuid) from public, anon, authenticated;
revoke all on function public.ops_save_billing_setting(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ops_save_package(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ops_create_price_list_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ops_save_price_list_draft(uuid, date, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.ops_publish_price_list(uuid) from public, anon, authenticated;
revoke all on function public.ops_delete_price_list_draft(uuid) from public, anon, authenticated;
revoke all on function public.customer_create_application(uuid) from public, anon, authenticated;
revoke all on function public.customer_set_application_package(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.customer_save_application_garden(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.customer_remove_application_garden(uuid) from public, anon, authenticated;
revoke all on function public.customer_application_garden_detail(uuid) from public, anon, authenticated;
revoke all on function public.customer_submit_application(uuid) from public, anon, authenticated;
revoke all on function public.customer_withdraw_application(uuid) from public, anon, authenticated;
revoke all on function public.ops_applications(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.ops_application_garden_detail(uuid) from public, anon, authenticated;
revoke all on function public.ops_verify_application_garden(uuid, numeric, jsonb, text) from public, anon, authenticated;
revoke all on function public.ops_reject_application(uuid, text, text) from public, anon, authenticated;

grant execute on function public.ops_billing_setting(uuid) to authenticated;
grant execute on function public.ops_save_billing_setting(uuid, jsonb) to authenticated;
grant execute on function public.ops_save_package(uuid, jsonb) to authenticated;
grant execute on function public.ops_create_price_list_draft(uuid, uuid) to authenticated;
grant execute on function public.ops_save_price_list_draft(uuid, date, integer, text, jsonb) to authenticated;
grant execute on function public.ops_publish_price_list(uuid) to authenticated;
grant execute on function public.ops_delete_price_list_draft(uuid) to authenticated;
grant execute on function public.customer_create_application(uuid) to authenticated;
grant execute on function public.customer_set_application_package(uuid, uuid, text) to authenticated;
grant execute on function public.customer_save_application_garden(uuid, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.customer_remove_application_garden(uuid) to authenticated;
grant execute on function public.customer_application_garden_detail(uuid) to authenticated;
grant execute on function public.customer_submit_application(uuid) to authenticated;
grant execute on function public.customer_withdraw_application(uuid) to authenticated;
grant execute on function public.ops_applications(uuid, text, integer) to authenticated;
grant execute on function public.ops_application_garden_detail(uuid) to authenticated;
grant execute on function public.ops_verify_application_garden(uuid, numeric, jsonb, text) to authenticated;
grant execute on function public.ops_reject_application(uuid, text, text) to authenticated;
