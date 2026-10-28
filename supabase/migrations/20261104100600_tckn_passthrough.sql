-- T13 (H16; before identity_number_required is opened): the TCKN is not
-- stored. H16: "TCKN saklanmaz, ödeme anında alınıp yalnızca iyzico'ya
-- iletilir. Şirket'te yalnızca son dört hane kalır. ... TCKN'nin hiçbir log,
-- olay yükü ya da hata mesajına girmemesi şarttır."
--
-- 1. private.billing_profile.identity_number is emptied and may no longer
--    hold a value (check constraint); the column stays for the old readers,
--    which now always see null (my_billing_profile, ops_billing_profile).
-- 2. customer_save_billing_profile ignores an identity_number key;
--    billing_profile_complete no longer needs a TCKN.
-- 3. payment_begin returns identity_number_required and the placeholder
--    11111111111 as the buyer's TCKN; the payments Edge Function puts the
--    TCKN the customer typed in for this payment (from the web server action,
--    in the request body only) into the iyzico request when it is required.
-- 4. payment_attach_token takes the last four digits
--    (p_identity_number_last4); payment_billing_snapshot.identity_number_last4
--    is the only trace. Required but missing: invalid_input (detail
--    identity_number_last4), never the value.
-- identity_number_required stays false by default.

-- 1.
update private.billing_profile set identity_number = null where identity_number is not null;
alter table private.billing_profile
  add constraint billing_profile_no_identity_number check (identity_number is null);
comment on column private.billing_profile.identity_number is
  'T13 (H16): always null; the TCKN is asked at payment time, sent to the provider only, and only its last four digits are kept (payment_billing_snapshot).';

-- 2.
create or replace function private.billing_profile_complete(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.billing_profile b
    where b.org_id = p_org_id and b.user_id = p_user_id
  );
$$;

-- As in 20261030100300_signup_consent_profiles.sql, without the TCKN.
create or replace function public.customer_save_billing_profile(p_profile jsonb)
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
  -- T13: the TCKN is never stored; an identity_number key is ignored (it
  -- is asked at payment time and goes to the payment provider only).

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
    jsonb_build_object('kind', v_kind));
end;
$$;

-- 3. As in 20261102120200_garden_addons.sql, with identity_number_required
-- and no stored TCKN.
create or replace function public.payment_begin(p_order_id uuid, p_user_id uuid, p_provider text, p_return_origin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  b private.billing_profile;
  op private.owner_profile;
  u auth.users;
  v_required boolean;
  v_amount bigint;
  v_id uuid;
  v_email text;
begin
  if p_provider is null or p_provider not in ('iyzico', 'fake') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider';
  end if;
  if p_return_origin is null or length(p_return_origin) > 200 or p_return_origin !~ '^https?://[^/?#[:space:]]+$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'return_origin';
  end if;
  select * into o from public.service_order where id = p_order_id and customer_user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_amount := o.total_kurus - (o.paid_kurus - o.refunded_kurus);
  if o.status <> 'awaiting_payment' or v_amount <= 0 then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if private.has_open_removal(private.order_line_parcels(o.id), o.customer_user_id) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if o.addon_of_order_id is not null and not private.addon_base_open(o.addon_of_order_id) then
    raise exception 'addon_base_closed' using errcode = 'P0001';
  end if;
  if p_provider = 'fake' and not private.fake_payments_allowed(o.org_id) then
    raise exception 'fake_payments_disabled' using errcode = 'P0001';
  end if;
  -- A card attempt in review may still become a success: a second one could
  -- charge the customer twice (live initiated attempts are superseded below).
  if exists (select 1 from public.payment p
             where p.order_id = o.id and p.provider <> 'manual' and p.status = 'pending_review'
               and coalesce(p.failure_code, '') not in ('amount_mismatch', 'reference_mismatch')) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(o.org_id, p_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  select * into b from private.billing_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into op from private.owner_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into u from auth.users x where x.id = p_user_id;
  v_email := coalesce(nullif(btrim(b.email), ''), nullif(btrim(op.email), ''), nullif(btrim(u.email), ''));
  if v_email is null then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001', detail = 'email';
  end if;
  v_required := coalesce((select s.identity_number_required from public.org_billing_setting s where s.org_id = o.org_id), false);

  update public.payment
  set status = 'expired', failure_code = 'superseded'
  where order_id = o.id and provider <> 'manual' and status = 'initiated'
    and (token_expires_at is null or token_expires_at > now());

  insert into public.payment (org_id, order_id, customer_user_id, provider, amount_kurus, return_origin)
  values (o.org_id, o.id, p_user_id, p_provider::public.payment_provider, v_amount, p_return_origin)
  returning id into v_id;
  perform private.write_payment_items(o, v_id, v_amount);
  perform private.audit(o.org_id, p_user_id, 'customer', 'payment.initiated', 'payment', v_id,
    jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount_kurus', v_amount));

  return jsonb_build_object(
    'payment_id', v_id,
    'order_id', o.id,
    'order_number', o.number,
    'amount_kurus', v_amount,
    'currency', o.currency,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object('payment_item_id', i.id, 'line_no', i.line_no, 'name', i.name,
        'amount_kurus', i.amount_kurus) order by i.line_no), '[]'::jsonb)
      from public.payment_item i where i.payment_id = v_id),
    'buyer', jsonb_build_object(
      'id', p_user_id,
      'first_name', b.first_name,
      'last_name', b.last_name,
      -- The database holds no TCKN (T13): the payments function puts the one
      -- the customer typed in for this payment when identity_number_required.
      'identity_number', '11111111111',
      'email', v_email,
      'phone', coalesce(op.phone, case when u.phone is not null and u.phone <> '' then '+' || u.phone end),
      'address', b.address,
      'district', b.district,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code,
      'registered_at', coalesce(u.created_at, op.created_at)
    ),
    'identity_number_required', v_required,
    'billing', jsonb_build_object(
      'contact_name', case when b.kind = 'company' then b.company_title else b.first_name || ' ' || b.last_name end,
      'address', b.address,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code
    )
  );
end;
$$;

-- 4.
drop function public.payment_attach_token(uuid, text, timestamptz);

create function private.write_payment_snapshot(
  p_payment_id uuid, p_org_id uuid, p_user_id uuid, p_identity_number_last4 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.payment_billing_snapshot (
    payment_id, org_id, kind, first_name, last_name, identity_number_last4, company_title, tax_office, tax_number,
    address, district, city, postal_code, country, email, phone
  )
  select p_payment_id, b.org_id, b.kind, b.first_name, b.last_name,
         case when s.identity_number_required then p_identity_number_last4 end,
         b.company_title, b.tax_office, b.tax_number, b.address, b.district, b.city, b.postal_code, b.country,
         coalesce(b.email, op.email), op.phone
  from private.billing_profile b
  left join public.org_billing_setting s on s.org_id = b.org_id
  left join private.owner_profile op on op.org_id = b.org_id and op.user_id = b.user_id
  where b.org_id = p_org_id and b.user_id = p_user_id
  on conflict (payment_id) do nothing;
  if not found and not exists (select 1 from private.payment_billing_snapshot x where x.payment_id = p_payment_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.write_payment_snapshot(uuid, uuid, uuid, text) from public;

-- The manual transfer path (ops_record_manual_payment) has no TCKN: the
-- three-argument form keeps it working with no digits.
create or replace function private.write_payment_snapshot(p_payment_id uuid, p_org_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.write_payment_snapshot(p_payment_id, p_org_id, p_user_id, null::text);
$$;

-- As in 20261030105400_payments.sql, plus the last four TCKN digits (required
-- while the org needs a TCKN).
create function public.payment_attach_token(
  p_payment_id uuid, p_token text, p_expires_at timestamptz, p_identity_number_last4 text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
begin
  if p_token is null or length(p_token) not between 1 and 200 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'token';
  end if;
  if p_expires_at is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'expires_at';
  end if;
  if p_identity_number_last4 is not null and p_identity_number_last4 !~ '^[0-9]{4}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'identity_number_last4';
  end if;
  p := private.lock_payment(p_payment_id);
  select * into o from public.service_order where id = p.order_id;
  if p.provider = 'manual' or p.status <> 'initiated' or p.provider_token is not null then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if p_identity_number_last4 is null
     and coalesce((select s.identity_number_required from public.org_billing_setting s where s.org_id = p.org_id), false) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'identity_number_last4';
  end if;
  begin
    update public.payment set provider_token = p_token, token_expires_at = p_expires_at
    where id = p.id and status = 'initiated' and provider_token is null;
  exception when unique_violation then
    raise exception 'invalid_input' using errcode = '22023', detail = 'token';
  end;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.write_payment_snapshot(p.id, p.org_id, p.customer_user_id, p_identity_number_last4);
end;
$$;
comment on function public.payment_attach_token(uuid, text, timestamptz, text) is
  'Service role: stores the provider token of an initiated attempt and the masked buyer snapshot (last four TCKN digits only, T13).';
revoke all on function public.payment_attach_token(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.payment_attach_token(uuid, text, timestamptz, text) to service_role;
