-- IP12-A2 / 4: quotes and orders (docs/musteri-yonetimi.md §4, §5.1–§5.3, §6.9).
--
-- 1. Helpers: order locks (own / ops), billing profile completeness, KVKK
--    notice, live payment attempts.
-- 2. Quotes: ops_issue_quote (application), ops_issue_parcel_quote (existing
--    parcels: first year or renewal). Inputs and amounts are frozen in the
--    quote; an open quote of the same application or order is superseded.
-- 3. Customer: customer_accept_quote (order S-…, consents, active at once when
--    the total is 0), customer_decline_quote, customer_cancel_order,
--    customer_payment_instructions.
-- 4. Ops: ops_cancel_order, ops_extend_payment_due, ops_terminate_order.
-- 5. ops_reject_application (IP12-A1) recreated with the same body plus the
--    application_rejected message.
--
-- Locks are taken application → quote → order → payment → refund with
-- select ... for update; every transition is a conditional update and raises
-- state_changed when the row moved meanwhile. Ops writes refuse the customer
-- themself (forbidden).

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

create function private.lock_own_order(p_order_id uuid)
returns public.service_order
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
begin
  select * into o from public.service_order
  where id = p_order_id and customer_user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return o;
end;
$$;

-- The order locked for ops; not_found, forbidden (not ops, or the caller's own order).
create function private.lock_order_for_ops(p_order_id uuid)
returns public.service_order
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
begin
  select * into o from public.service_order where id = p_order_id for update;
  if not found or o.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(o.org_id);
  if o.customer_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return o;
end;
$$;

-- A billing profile the provider and the receipt can use (the TCKN while the
-- org needs it).
create function private.billing_profile_complete(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.billing_profile b
    left join public.org_billing_setting s on s.org_id = b.org_id
    where b.org_id = p_org_id and b.user_id = p_user_id
      and (not coalesce(s.identity_number_required, false) or b.identity_number is not null)
  );
$$;

-- The latest kvkk_notice record of the user in the org is an acknowledgement.
create function private.kvkk_notice_granted(p_org_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.granted from private.consent_record c
    where c.org_id = p_org_id and c.subject_id = p_user_id and c.kind = 'kvkk_notice'
    order by c.recorded_at desc, c.id desc
    limit 1
  ), false);
$$;

-- A card attempt that may still turn into money (§5.3): pending review, or
-- initiated / expired with a token that is still valid. An initiated attempt
-- whose token is not attached yet counts for 15 minutes (payments/start is
-- between payment_begin and payment_attach_token).
create function private.live_payment_attempt(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payment p
    where p.order_id = p_order_id and p.provider <> 'manual'
      and (p.status = 'pending_review'
           or (p.status in ('initiated', 'expired') and p.token_expires_at > now())
           or (p.status = 'initiated' and p.token_expires_at is null
               and p.initiated_at > now() - interval '15 minutes'))
  );
$$;

create function private.istanbul_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Istanbul')::date;
$$;

-- ---------------------------------------------------------------------------
-- 2. Quotes
-- ---------------------------------------------------------------------------

-- Validates the shared quote arguments; returns the validity in days.
create function private.check_quote_terms(
  p_org_id uuid,
  p_proposed_service_start date,
  p_valid_days integer,
  p_discount_bp integer,
  p_discount_note text,
  p_note_to_customer text
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := coalesce(
    p_valid_days, (select s.quote_valid_days from public.org_billing_setting s where s.org_id = p_org_id), 30);
begin
  if v_days not between 1 and 90 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'valid_days';
  end if;
  if p_discount_bp is null or p_discount_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_bp';
  end if;
  if p_discount_bp > 0 and nullif(btrim(p_discount_note), '') is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_note';
  end if;
  if length(btrim(p_discount_note)) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_note';
  end if;
  if length(btrim(p_note_to_customer)) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note_to_customer';
  end if;
  if p_proposed_service_start is not null
     and p_proposed_service_start not between private.istanbul_today() - 366 and private.istanbul_today() + 366 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'proposed_service_start';
  end if;
  return v_days;
end;
$$;

-- Writes a quote with its lines from priced lines. p_lines: [{area_m2,
-- area_source, garden_name, application_garden_id | parcel_id}] in line
-- order. Returns the quote id; sends quote_ready.
create function private.write_quote(
  p_org_id uuid,
  p_customer_user_id uuid,
  p_application_id uuid,
  p_renewal_of_order_id uuid,
  p_package_id uuid,
  p_first_year boolean,
  p_lines jsonb,
  p_proposed_service_start date,
  p_valid_days integer,
  p_discount_bp integer,
  p_discount_note text,
  p_note_to_customer text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pkg public.service_package;
  v_areas numeric[];
  v_id uuid;
  v_number text;
  v_first record;
  v_base bigint;
  v_discount bigint;
  v_subtotal bigint;
  v_vat bigint;
  v_total bigint;
  v_on date;
begin
  select * into pkg from public.service_package where id = p_package_id and org_id = p_org_id;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'package_id';
  end if;
  select array_agg((x ->> 'area_m2')::numeric order by o) into v_areas
  from jsonb_array_elements(p_lines) with ordinality t(x, o);

  -- Header and lines are priced three times: the price_list lock keeps a
  -- publish out until this transaction ends and v_on keeps the day fixed, so
  -- every call sees the same list.
  perform pg_advisory_xact_lock(hashtextextended('price_list:' || p_org_id::text, 0));
  v_on := private.istanbul_today();
  select * into v_first
  from private.price_lines(p_org_id, p_package_id, v_areas, p_first_year, p_discount_bp, v_on) limit 1;
  select sum(l.line_base_kurus), sum(l.line_discount_kurus), sum(l.line_subtotal_kurus), sum(l.line_vat_kurus),
         sum(l.line_total_kurus)
  into v_base, v_discount, v_subtotal, v_vat, v_total
  from private.price_lines(p_org_id, p_package_id, v_areas, p_first_year, p_discount_bp, v_on) l;

  v_number := private.next_document_number(p_org_id, 'T');
  insert into public.quote (
    org_id, customer_user_id, application_id, renewal_of_order_id, number, price_list_id, price_list_version,
    package_id, package_code, package_name, periodic_visits_per_year, includes_inventory, first_year,
    vat_rate_bp, discount_bp, discount_note, base_kurus, discount_kurus, subtotal_kurus, vat_kurus, total_kurus,
    inputs, proposed_service_start, valid_until, note_to_customer, issued_by
  )
  values (
    p_org_id, p_customer_user_id, p_application_id, p_renewal_of_order_id, v_number, v_first.price_list_id,
    v_first.price_list_version, pkg.id, pkg.code, pkg.name, pkg.periodic_visits_per_year, pkg.includes_inventory,
    p_first_year, v_first.vat_rate_bp, p_discount_bp, nullif(btrim(p_discount_note), ''), v_base, v_discount,
    v_subtotal, v_vat, v_total,
    jsonb_build_object(
      'formula', 'pricing-v1',
      'price_list_id', v_first.price_list_id,
      'version', v_first.price_list_version,
      'valid_from', v_first.valid_from,
      'vat_rate_bp', v_first.vat_rate_bp,
      'package', jsonb_build_object('id', pkg.id, 'code', pkg.code, 'name', pkg.name,
        'periodic_visits_per_year', pkg.periodic_visits_per_year, 'includes_inventory', pkg.includes_inventory),
      'first_year', p_first_year,
      'discount_bp', p_discount_bp,
      'areas', (select jsonb_agg(jsonb_build_object(
          'line_no', o,
          'application_garden_id', x -> 'application_garden_id',
          'parcel_id', x -> 'parcel_id',
          'area_m2', (x ->> 'area_m2')::numeric,
          'source', x ->> 'area_source') order by o)
        from jsonb_array_elements(p_lines) with ordinality t(x, o))
    ),
    p_proposed_service_start, private.istanbul_today() + p_valid_days,
    nullif(btrim(p_note_to_customer), ''), (select auth.uid())
  )
  returning id into v_id;

  insert into public.quote_item (
    org_id, quote_id, customer_user_id, line_no, application_garden_id, parcel_id, garden_name, area_m2,
    billable_area_tenths, visits, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus, visit_amount_kurus,
    line_base_kurus, line_discount_kurus, line_subtotal_kurus, line_vat_kurus, line_total_kurus
  )
  select p_org_id, v_id, p_customer_user_id, l.line_no,
         (p_lines -> (l.line_no - 1) ->> 'application_garden_id')::uuid,
         (p_lines -> (l.line_no - 1) ->> 'parcel_id')::uuid,
         p_lines -> (l.line_no - 1) ->> 'garden_name', l.area_m2, l.billable_area_tenths, l.visits,
         l.unit_price_kurus, l.minimum_fee_kurus, l.inventory_fee_kurus, l.visit_amount_kurus, l.line_base_kurus,
         l.line_discount_kurus, l.line_subtotal_kurus, l.line_vat_kurus, l.line_total_kurus
  from private.price_lines(p_org_id, p_package_id, v_areas, p_first_year, p_discount_bp, v_on) l;

  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'quote.issued', 'quote', v_id,
    jsonb_build_object('number', v_number, 'application_id', p_application_id,
      'renewal_of_order_id', p_renewal_of_order_id, 'lines', cardinality(v_areas), 'total_kurus', v_total,
      'discount_bp', p_discount_bp, 'price_list_version', v_first.price_list_version));
  perform private.enqueue_billing_notification('quote_ready', p_org_id, p_customer_user_id, v_id, v_number,
    '/portal/teklif/' || v_id);
  return v_id;
end;
$$;

-- Supersedes the issued quote of an application or of a renewed order (the
-- quote row locked first).
create function private.supersede_open_quote(p_application_id uuid, p_renewal_of_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
begin
  for q in
    select * from public.quote
    where status = 'issued'
      and ((p_application_id is not null and application_id = p_application_id)
           or (p_renewal_of_order_id is not null and renewal_of_order_id = p_renewal_of_order_id))
    for update
  loop
    update public.quote set status = 'superseded', decided_at = now(), decided_by = (select auth.uid())
    where id = q.id and status = 'issued';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
    perform private.audit(q.org_id, (select auth.uid()), 'ops', 'quote.superseded', 'quote', q.id,
      jsonb_build_object('number', q.number));
  end loop;
end;
$$;

-- submitted → quoted, quoted → quoted (the open quote superseded). Every
-- garden must be verified; the quote takes the verified areas. Errors:
-- not_found, forbidden, application_not_open, application_incomplete,
-- garden_not_verified, invalid_input (detail: argument), no_price_list,
-- package_not_priced.
create function public.ops_issue_quote(
  p_application_id uuid,
  p_proposed_service_start date default null,
  p_valid_days integer default null,
  p_discount_bp integer default 0,
  p_discount_note text default null,
  p_note_to_customer text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_days integer;
  v_lines jsonb;
  v_id uuid;
begin
  a := private.lock_application_for_ops(p_application_id);
  if a.status not in ('submitted', 'quoted') then
    raise exception 'application_not_open' using errcode = 'P0001';
  end if;
  v_days := private.check_quote_terms(a.org_id, p_proposed_service_start, p_valid_days, coalesce(p_discount_bp, 0),
    p_discount_note, p_note_to_customer);
  if a.package_id is null then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'package_id';
  end if;
  if not exists (select 1 from public.application_garden g where g.application_id = a.id) then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  if exists (select 1 from public.application_garden g where g.application_id = a.id and g.verified_at is null) then
    raise exception 'garden_not_verified' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object('application_garden_id', g.id, 'garden_name', g.name,
           'area_m2', g.verified_area_m2, 'area_source', 'verified') order by g.sort_order, g.created_at, g.id)
  into v_lines
  from public.application_garden g where g.application_id = a.id;

  perform private.supersede_open_quote(a.id, null);
  v_id := private.write_quote(a.org_id, a.customer_user_id, a.id, null, a.package_id, true, v_lines,
    p_proposed_service_start, v_days, coalesce(p_discount_bp, 0), p_discount_note, p_note_to_customer);
  update public.service_application set status = 'quoted' where id = a.id and status = a.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;
comment on function public.ops_issue_quote(uuid, date, integer, integer, text, text) is
  'Ops: issues a quote for an application from the verified areas (an open one is superseded); sends quote_ready.';

-- A quote for existing parcels of a customer (owner access): a first order
-- (p_first_year, pilot parcels) or a renewal of an active or completed order,
-- whose service then starts the day after the old one ends. Areas: the latest
-- boundary, or the parcel's estimate. Errors: forbidden, not_found
-- (renewed order), invalid_input (detail: argument), no_price_list,
-- package_not_priced.
create function public.ops_issue_parcel_quote(
  p_org_id uuid,
  p_customer_user_id uuid,
  p_package_id uuid,
  p_parcel_ids uuid[],
  p_first_year boolean,
  p_proposed_service_start date,
  p_renewal_of_order_id uuid default null,
  p_valid_days integer default null,
  p_discount_bp integer default 0,
  p_discount_note text default null,
  p_note_to_customer text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  v_days integer;
  v_start date := p_proposed_service_start;
  v_lines jsonb;
begin
  perform private.require_ops(p_org_id);
  if p_customer_user_id is null or p_customer_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from private.owner_profile op where op.org_id = p_org_id and op.user_id = p_customer_user_id
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'customer_user_id';
  end if;
  if p_first_year is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'first_year';
  end if;
  if p_package_id is null or not exists (
    select 1 from public.service_package p where p.id = p_package_id and p.org_id = p_org_id and p.active
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'package_id';
  end if;
  if p_parcel_ids is null or cardinality(p_parcel_ids) not between 1 and 10
     or (select count(distinct x) from unnest(p_parcel_ids) x) <> cardinality(p_parcel_ids)
     or exists (
       select 1 from unnest(p_parcel_ids) x
       where x is null or not exists (
         select 1 from public.parcel p
         join public.parcel_access pa on pa.parcel_id = p.id and pa.user_id = p_customer_user_id and pa.role = 'owner'
         where p.id = x and p.org_id = p_org_id)
     ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'parcel_ids';
  end if;

  if p_renewal_of_order_id is not null then
    if p_first_year then
      raise exception 'invalid_input' using errcode = '22023', detail = 'first_year';
    end if;
    -- Read without a lock: the open renewal quote is locked (and superseded)
    -- below, before anything is written.
    select * into o from public.service_order where id = p_renewal_of_order_id and org_id = p_org_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if o.customer_user_id <> p_customer_user_id or o.status not in ('active', 'completed') or o.service_end is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'renewal_of_order_id';
    end if;
    v_start := o.service_end + 1;
  end if;
  v_days := private.check_quote_terms(p_org_id, v_start, p_valid_days, coalesce(p_discount_bp, 0),
    p_discount_note, p_note_to_customer);

  select jsonb_agg(jsonb_build_object(
           'parcel_id', p.id, 'garden_name', p.name,
           'area_m2', coalesce(round(b.area_m2::numeric, 2), p.estimated_area_m2),
           'area_source', case when b.area_m2 is not null then 'boundary' else 'estimated' end)
         order by x.o)
  into v_lines
  from unnest(p_parcel_ids) with ordinality x(id, o)
  join public.parcel p on p.id = x.id
  left join lateral (
    select bb.area_m2 from public.boundary bb where bb.parcel_id = p.id order by bb.version desc limit 1
  ) b on true;
  if exists (select 1 from jsonb_array_elements(v_lines) l where coalesce((l ->> 'area_m2')::numeric, 0) <= 0) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'parcel_ids';
  end if;

  perform private.supersede_open_quote(null, p_renewal_of_order_id);
  begin
    return private.write_quote(p_org_id, p_customer_user_id, null, p_renewal_of_order_id, p_package_id,
      p_first_year, v_lines, v_start, v_days, coalesce(p_discount_bp, 0), p_discount_note, p_note_to_customer);
  exception when unique_violation then
    -- Another renewal quote of the order was issued meanwhile.
    raise exception 'state_changed' using errcode = 'P0001';
  end;
end;
$$;
comment on function public.ops_issue_parcel_quote(uuid, uuid, uuid, uuid[], boolean, date, uuid, integer, integer, text, text) is
  'Ops: issues a quote for existing parcels of a customer (first year or renewal of an order); sends quote_ready.';

-- ---------------------------------------------------------------------------
-- 3. Customer
-- ---------------------------------------------------------------------------

-- The caller's quote, locked after its application (application → quote).
create function private.lock_own_quote(p_quote_id uuid)
returns public.quote
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
  v_application uuid;
begin
  select application_id into v_application from public.quote
  where id = p_quote_id and customer_user_id = (select auth.uid());
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_application is not null then
    perform private.lock_own_application(v_application);
  end if;
  select * into q from public.quote where id = p_quote_id for update;
  return q;
end;
$$;

-- p_consents: {distance_sales, pre_information}: the versions of the texts
-- accepted. Opens the order (S-…, due in payment_due_days); a total of 0 is
-- active at once. Errors: not_found, quote_not_open, quote_expired,
-- billing_profile_incomplete, consent_required (detail: kvkk_notice or the
-- kind), state_changed.
create function public.customer_accept_quote(p_quote_id uuid, p_consents jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
  v_user uuid := (select auth.uid());
  v_kind text;
  v_due_days integer;
  v_order uuid;
  v_number text;
begin
  q := private.lock_own_quote(p_quote_id);
  if q.status <> 'issued' then
    raise exception 'quote_not_open' using errcode = 'P0001';
  end if;
  if q.valid_until < private.istanbul_today() then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(q.org_id, v_user) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  if not private.kvkk_notice_granted(q.org_id, v_user) then
    raise exception 'consent_required' using errcode = '22023', detail = 'kvkk_notice';
  end if;
  foreach v_kind in array array['distance_sales', 'pre_information'] loop
    if p_consents is null or jsonb_typeof(p_consents) <> 'object' or jsonb_typeof(p_consents -> v_kind) <> 'string'
       or not private.text_version_ok(p_consents ->> v_kind) then
      raise exception 'consent_required' using errcode = '22023', detail = v_kind;
    end if;
  end loop;

  update public.quote set status = 'accepted', decided_at = now(), decided_by = v_user
  where id = q.id and status = 'issued';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  if q.application_id is not null then
    update public.service_application set status = 'accepted', decided_at = now(), decided_by = v_user
    where id = q.application_id and status = 'quoted';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(s.payment_due_days, 14) into v_due_days
  from (select 1) one left join public.org_billing_setting s on s.org_id = q.org_id;
  v_number := private.next_document_number(q.org_id, 'S');
  insert into public.service_order (org_id, customer_user_id, quote_id, number, total_kurus, payment_due_at,
    renewal_of_order_id)
  values (q.org_id, v_user, q.id, v_number, q.total_kurus, now() + make_interval(days => v_due_days),
    q.renewal_of_order_id)
  returning id into v_order;
  insert into public.service_order_item (org_id, order_id, customer_user_id, quote_item_id, line_no, garden_name,
    amount_kurus)
  select q.org_id, v_order, v_user, i.id, i.line_no, i.garden_name, i.line_total_kurus
  from public.quote_item i where i.quote_id = q.id order by i.line_no;

  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, quote_id,
    order_id)
  select q.org_id, v_user, v_user, k::public.consent_kind, true, p_consents ->> k, 'quote_acceptance', q.id, v_order
  from unnest(array['distance_sales', 'pre_information']) k;

  perform private.audit(q.org_id, v_user, 'customer', 'quote.accepted', 'quote', q.id,
    jsonb_build_object('number', q.number, 'order_id', v_order));
  perform private.audit(q.org_id, v_user, 'customer', 'order.created', 'order', v_order,
    jsonb_build_object('number', v_number, 'quote_id', q.id, 'total_kurus', q.total_kurus));
  perform private.audit(q.org_id, v_user, 'customer', 'consent.granted', 'consent', v_user,
    jsonb_build_object('kinds', jsonb_build_array('distance_sales', 'pre_information'), 'order_id', v_order));
  if q.total_kurus = 0 then
    perform private.activate_order(v_order);
  end if;
  return v_order;
end;
$$;
comment on function public.customer_accept_quote(uuid, jsonb) is
  'Customer: accepts an open quote with the distance sales and pre-information texts; opens the order.';

-- issued → declined. An application quote: back to submitted for a revision,
-- otherwise the application is withdrawn. p_note (a revision wish) becomes the
-- application's customer note. Errors: not_found, quote_not_open,
-- invalid_input (note), state_changed.
create function public.customer_decline_quote(
  p_quote_id uuid,
  p_request_revision boolean default false,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
  v_user uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_revision boolean := coalesce(p_request_revision, false);
begin
  q := private.lock_own_quote(p_quote_id);
  if q.status <> 'issued' then
    raise exception 'quote_not_open' using errcode = 'P0001';
  end if;
  if length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.quote set status = 'declined', decided_at = now(), decided_by = v_user
  where id = q.id and status = 'issued';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  if q.application_id is not null then
    update public.service_application
    set status = case when v_revision then 'submitted' else 'withdrawn' end::public.application_status,
        customer_note = coalesce(v_note, customer_note),
        decided_at = case when v_revision then null else now() end,
        decided_by = case when v_revision then null else v_user end
    where id = q.application_id and status = 'quoted';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
    if not v_revision then
      perform private.audit(q.org_id, v_user, 'customer', 'application.withdrawn', 'application', q.application_id,
        jsonb_build_object('from', 'quoted', 'quote_id', q.id));
    end if;
  end if;
  perform private.audit(q.org_id, v_user, 'customer', 'quote.declined', 'quote', q.id,
    jsonb_build_object('number', q.number, 'revision', v_revision, 'note', v_note is not null));
end;
$$;
comment on function public.customer_decline_quote(uuid, boolean, text) is
  'Customer: declines an open quote, asking for a revision (application back to review) or withdrawing.';

-- awaiting_payment → cancelled, with no money kept (paid_kurus minus
-- refunded_kurus) and no live card attempt. Shared by the customer and ops (order locked by the caller).
create function private.cancel_order(o public.service_order, p_actor uuid, p_role text, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if o.status = 'active' then
    raise exception 'order_active' using errcode = 'P0001';
  end if;
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  -- Money kept: paid and not refunded back (a refund still open counts as kept).
  if o.paid_kurus > o.refunded_kurus then
    raise exception 'has_payments' using errcode = 'P0001';
  end if;
  if private.live_payment_attempt(o.id) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  update public.service_order
  set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason,
      termination_note = coalesce(p_note, termination_note)
  where id = o.id and status = 'awaiting_payment';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, p_actor, p_role, 'order.cancelled', 'order', o.id,
    jsonb_build_object('number', o.number, 'reason', p_reason));
end;
$$;

-- Errors: not_found, order_active, order_not_payable, has_payments,
-- payment_in_progress, state_changed.
create function public.customer_cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
begin
  o := private.lock_own_order(p_order_id);
  perform private.cancel_order(o, o.customer_user_id, 'customer', 'customer_cancelled', null);
end;
$$;
comment on function public.customer_cancel_order(uuid) is
  'Customer: cancels an order awaiting payment (no payment made, no card payment in progress).';

-- Bank transfer details of an own order; the order number is the reference.
create function public.customer_payment_instructions(p_order_id uuid)
returns table (
  bank_name text,
  iban text,
  iban_holder text,
  reference text,
  outstanding_kurus bigint,
  currency text,
  payment_due_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.bank_name, s.iban, s.iban_holder, o.number, greatest(o.total_kurus - (o.paid_kurus - o.refunded_kurus), 0), o.currency,
         o.payment_due_at
  from public.service_order o
  left join public.org_billing_setting s on s.org_id = o.org_id
  where o.id = p_order_id and o.customer_user_id = (select auth.uid());
$$;
comment on function public.customer_payment_instructions(uuid) is
  'Customer: IBAN, holder, reference (order number) and the outstanding amount of an own order.';

-- ---------------------------------------------------------------------------
-- 4. Ops
-- ---------------------------------------------------------------------------

-- The internal note (≤ 2000) is kept in termination_note. Errors: as
-- customer_cancel_order, and forbidden, invalid_input (note).
create function public.ops_cancel_order(p_order_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  v_note text := nullif(btrim(p_note), '');
begin
  o := private.lock_order_for_ops(p_order_id);
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform private.cancel_order(o, (select auth.uid()), 'ops', 'ops_cancelled', v_note);
end;
$$;
comment on function public.ops_cancel_order(uuid, text) is
  'Ops: cancels an order awaiting payment (no payment made, no card payment in progress).';

-- The order is due at the end of p_due_on (Istanbul). Errors: not_found,
-- forbidden, order_not_payable, invalid_input (due_on).
create function public.ops_extend_payment_due(p_order_id uuid, p_due_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  v_due timestamptz;
begin
  o := private.lock_order_for_ops(p_order_id);
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if p_due_on is null or p_due_on < private.istanbul_today() or p_due_on > private.istanbul_today() + 365 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'due_on';
  end if;
  v_due := (p_due_on + 1)::timestamp at time zone 'Europe/Istanbul';
  update public.service_order set payment_due_at = v_due where id = o.id and status = 'awaiting_payment';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, (select auth.uid()), 'ops', 'order.due_extended', 'order', o.id,
    jsonb_build_object('number', o.number, 'due_on', p_due_on));
end;
$$;
comment on function public.ops_extend_payment_due(uuid, date) is
  'Ops: moves the payment due date of an order awaiting payment.';

-- active → terminated with an internal note; refunds are separate
-- (ops_request_refund). Errors: not_found, forbidden, invalid_input (note),
-- state_changed (the order is not active).
create function public.ops_terminate_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  v_note text := nullif(btrim(p_note), '');
begin
  o := private.lock_order_for_ops(p_order_id);
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.service_order set status = 'terminated', terminated_at = now(), termination_note = v_note
  where id = o.id and status = 'active';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, (select auth.uid()), 'ops', 'order.terminated', 'order', o.id,
    jsonb_build_object('number', o.number));
end;
$$;
comment on function public.ops_terminate_order(uuid, text) is
  'Ops: terminates an active order (note required); refunds are requested separately.';

-- ---------------------------------------------------------------------------
-- 5. Rejection message
-- ---------------------------------------------------------------------------

-- As in 20261030100400_catalog_applications.sql, plus application_rejected.
create or replace function public.ops_reject_application(p_application_id uuid, p_reason text, p_note text default null)
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
  perform private.enqueue_billing_notification('application_rejected', a.org_id, a.customer_user_id, a.id, a.number,
    '/portal/basvuru/' || a.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.lock_own_order(uuid) from public;
revoke all on function private.lock_order_for_ops(uuid) from public;
revoke all on function private.billing_profile_complete(uuid, uuid) from public;
revoke all on function private.kvkk_notice_granted(uuid, uuid) from public;
revoke all on function private.live_payment_attempt(uuid) from public;
revoke all on function private.istanbul_today() from public;
revoke all on function private.check_quote_terms(uuid, date, integer, integer, text, text) from public;
revoke all on function private.write_quote(uuid, uuid, uuid, uuid, uuid, boolean, jsonb, date, integer, integer, text, text)
  from public;
revoke all on function private.supersede_open_quote(uuid, uuid) from public;
revoke all on function private.lock_own_quote(uuid) from public;
revoke all on function private.cancel_order(public.service_order, uuid, text, text, text) from public;

revoke all on function public.ops_issue_quote(uuid, date, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.ops_issue_parcel_quote(uuid, uuid, uuid, uuid[], boolean, date, uuid, integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.customer_accept_quote(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.customer_decline_quote(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.customer_cancel_order(uuid) from public, anon, authenticated;
revoke all on function public.customer_payment_instructions(uuid) from public, anon, authenticated;
revoke all on function public.ops_cancel_order(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_extend_payment_due(uuid, date) from public, anon, authenticated;
revoke all on function public.ops_terminate_order(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_reject_application(uuid, text, text) from public, anon, authenticated;

grant execute on function public.ops_issue_quote(uuid, date, integer, integer, text, text) to authenticated;
grant execute on function public.ops_issue_parcel_quote(uuid, uuid, uuid, uuid[], boolean, date, uuid, integer, integer, text, text)
  to authenticated;
grant execute on function public.customer_accept_quote(uuid, jsonb) to authenticated;
grant execute on function public.customer_decline_quote(uuid, boolean, text) to authenticated;
grant execute on function public.customer_cancel_order(uuid) to authenticated;
grant execute on function public.customer_payment_instructions(uuid) to authenticated;
grant execute on function public.ops_cancel_order(uuid, text) to authenticated;
grant execute on function public.ops_extend_payment_due(uuid, date) to authenticated;
grant execute on function public.ops_terminate_order(uuid, text) to authenticated;
grant execute on function public.ops_reject_application(uuid, text, text) to authenticated;
