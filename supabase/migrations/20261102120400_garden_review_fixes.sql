-- IP14 review fixes (PR #71), fix-forward over 20261102120200_garden_addons.sql
-- and 20261102120300_garden_removals.sql (docs/bahce-yonetimi.md §2, §7, §20):
--
-- 1. removal-v1 counts failed refunds as already refunded: IP12 can still
--    retry them (payment_refund_claim) or settle them (ops_resolve_refund).
-- 2. The customer withdraws only a removal they asked for, not one ops opened.
-- 3. A visit or inventory captured on the effective day (or later, up to the
--    completion day) counts as done: done work is never refunded.
-- 4. An add-on line is prorated with the yearly visits frozen in the base
--    order's quote, in the previews and in the issued quote alike
--    (price_lines_v2 takes the membership's V).
-- 5. The housekeeping takes parcel locks in parcel order and runs each
--    removal and each end of access in its own subtransaction: one failure
--    no longer rolls back the others (counted as failed, audited).
-- 6. Refunds opened by a removal belong to that removal's line, not to the
--    order's unattributed refunds of a later removal.
-- 7. A removal effective the day after the line's period ends (at the period
--    end, or in 30 days with fewer days left) marks that line removed, so the
--    garden shows as removed during the read-only window.

-- ---------------------------------------------------------------------------
-- 4. Pricing with the membership's yearly visits
-- ---------------------------------------------------------------------------

-- As in 20261102120200_garden_addons.sql, plus p_year_visits: the yearly
-- visits the line is prorated against (the membership's frozen V; the
-- package's current V when null).
drop function private.price_lines_v2(uuid, uuid, numeric[], boolean[], smallint, integer, date);
create function private.price_lines_v2(
  p_org_id uuid,
  p_package_id uuid,
  p_areas_m2 numeric[],
  p_inventory boolean[],
  p_visits smallint,
  p_discount_bp integer default 0,
  p_on date default null,
  p_year_visits smallint default null
)
returns table (
  line_no integer,
  area_m2 numeric,
  billable_area_tenths integer,
  visits smallint,
  unit_price_kurus bigint,
  minimum_fee_kurus bigint,
  inventory_fee_kurus bigint,
  visit_amount_kurus bigint,
  line_base_kurus bigint,
  line_discount_kurus bigint,
  line_subtotal_kurus bigint,
  line_vat_kurus bigint,
  line_total_kurus bigint,
  price_list_id uuid,
  price_list_version integer,
  valid_from date,
  vat_rate_bp integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.price_list;
  i public.price_list_item;
  v_year_visits smallint;
  v_min bigint;
  v_n integer;
begin
  if p_areas_m2 is null or cardinality(p_areas_m2) = 0 or cardinality(p_areas_m2) > 50
     or exists (select 1 from unnest(p_areas_m2) a where a is null or a <= 0 or a > 10000000) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'areas';
  end if;
  if p_inventory is null or cardinality(p_inventory) <> cardinality(p_areas_m2)
     or exists (select 1 from unnest(p_inventory) x where x is null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'inventory';
  end if;
  if p_discount_bp is null or p_discount_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_bp';
  end if;
  l := private.current_price_list(p_org_id, coalesce(p_on, private.istanbul_today()));
  if l.id is null then
    raise exception 'no_price_list' using errcode = 'P0001';
  end if;
  select p.periodic_visits_per_year into v_year_visits
  from public.service_package p where p.id = p_package_id and p.org_id = p_org_id;
  select * into i from public.price_list_item x where x.price_list_id = l.id and x.package_id = p_package_id;
  if v_year_visits is null or i.id is null then
    raise exception 'package_not_priced' using errcode = 'P0001';
  end if;
  if p_year_visits is not null then
    if p_year_visits < 1 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'visits';
    end if;
    v_year_visits := p_year_visits;
  end if;
  if p_visits is null or p_visits < 1 or p_visits > v_year_visits then
    raise exception 'invalid_input' using errcode = '22023', detail = 'visits';
  end if;
  v_min := round(i.minimum_fee_kurus::numeric * p_visits / v_year_visits);

  for v_n in 1 .. cardinality(p_areas_m2) loop
    line_no := v_n;
    area_m2 := round(p_areas_m2[v_n], 2);
    billable_area_tenths := ceil(round(p_areas_m2[v_n], 2) / 100);
    visits := p_visits;
    unit_price_kurus := i.unit_price_kurus;
    minimum_fee_kurus := v_min;
    inventory_fee_kurus := case when p_inventory[v_n] then i.inventory_fee_kurus else 0 end;
    visit_amount_kurus := round(p_visits::numeric * billable_area_tenths * i.unit_price_kurus / 10);
    line_base_kurus := greatest(visit_amount_kurus, v_min) + inventory_fee_kurus;
    line_discount_kurus := round(line_base_kurus::numeric * p_discount_bp / 10000);
    line_subtotal_kurus := line_base_kurus - line_discount_kurus;
    line_vat_kurus := round(line_subtotal_kurus::numeric * l.vat_rate_bp / 10000);
    line_total_kurus := line_subtotal_kurus + line_vat_kurus;
    price_list_id := l.id;
    price_list_version := l.version;
    valid_from := l.valid_from;
    vat_rate_bp := l.vat_rate_bp;
    return next;
  end loop;
end;
$$;
comment on function private.price_lines_v2(uuid, uuid, numeric[], boolean[], smallint, integer, date, smallint) is
  'Formula pricing-v2: add-on lines with prorated visits and minimum fee against the membership''s yearly visits, inventory fee per line.';
revoke all on function private.price_lines_v2(uuid, uuid, numeric[], boolean[], smallint, integer, date, smallint) from public;

create or replace function public.customer_addon_preview(p_areas_m2 numeric[])
returns table (
  line_no integer,
  area_m2 numeric,
  billable_area_tenths integer,
  visits smallint,
  unit_price_kurus bigint,
  minimum_fee_kurus bigint,
  inventory_fee_kurus bigint,
  visit_amount_kurus bigint,
  line_base_kurus bigint,
  line_discount_kurus bigint,
  line_subtotal_kurus bigint,
  line_vat_kurus bigint,
  line_total_kurus bigint,
  price_list_id uuid,
  price_list_version integer,
  valid_from date,
  vat_rate_bp integer,
  base_order_id uuid,
  service_start date,
  service_end date,
  periodic_visits_per_year smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  b public.service_order;
  q public.quote;
  v_start date;
  v_visits smallint;
begin
  if v_user is null or v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  b := private.addon_base_order(v_org, v_user);
  if b.id is null then
    if exists (
      select 1 from public.service_order o
      where o.org_id = v_org and o.customer_user_id = v_user and o.status = 'active'
        and o.addon_of_order_id is null and o.service_end >= private.istanbul_today()
    ) then
      raise exception 'addon_period_too_short' using errcode = 'P0001';
    end if;
    raise exception 'no_membership' using errcode = 'P0001';
  end if;
  if p_areas_m2 is null or cardinality(p_areas_m2) = 0 or cardinality(p_areas_m2) > 50 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'areas';
  end if;
  select * into q from public.quote x where x.id = b.quote_id;
  v_start := greatest(private.istanbul_today(), b.service_start);
  v_visits := private.addon_visits(q.periodic_visits_per_year, v_start, b.service_start, b.service_end);
  return query
  select l.*, b.id, v_start, b.service_end, q.periodic_visits_per_year
  from private.price_lines_v2(v_org, q.package_id, p_areas_m2, array_fill(true, array[cardinality(p_areas_m2)]),
    v_visits, 0, null, q.periodic_visits_per_year) l;
end;
$$;
comment on function public.customer_addon_preview(numeric[]) is
  'Customer: a non-binding add-on price of new gardens (pricing-v2) for the current membership.';

create or replace function private.write_addon_quote(
  p_org_id uuid,
  p_customer_user_id uuid,
  p_application_id uuid,
  b public.service_order,
  p_package_id uuid,
  p_lines jsonb,
  p_start date,
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
  bq public.quote;
  v_areas numeric[];
  v_inventory boolean[];
  v_visits smallint;
  v_last date := private.addon_last_day(b);
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
  -- The membership's package as frozen in the base order's quote (V of the
  -- previews and of the removal's visit fee), not the package's current row.
  select * into bq from public.quote where id = b.quote_id;
  select array_agg((x ->> 'area_m2')::numeric order by o), array_agg((x ->> 'inventory')::boolean order by o)
  into v_areas, v_inventory
  from jsonb_array_elements(p_lines) with ordinality t(x, o);
  v_visits := private.addon_visits(bq.periodic_visits_per_year, p_start, b.service_start, b.service_end);

  perform pg_advisory_xact_lock(hashtextextended('price_list:' || p_org_id::text, 0));
  v_on := private.istanbul_today();
  select * into v_first
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, p_discount_bp, v_on,
    bq.periodic_visits_per_year) limit 1;
  select sum(l.line_base_kurus), sum(l.line_discount_kurus), sum(l.line_subtotal_kurus), sum(l.line_vat_kurus),
         sum(l.line_total_kurus)
  into v_base, v_discount, v_subtotal, v_vat, v_total
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, p_discount_bp, v_on,
    bq.periodic_visits_per_year) l;

  v_number := private.next_document_number(p_org_id, 'T');
  insert into public.quote (
    org_id, customer_user_id, application_id, renewal_of_order_id, addon_of_order_id, number, price_list_id,
    price_list_version, package_id, package_code, package_name, periodic_visits_per_year, includes_inventory,
    first_year, vat_rate_bp, discount_bp, discount_note, base_kurus, discount_kurus, subtotal_kurus, vat_kurus,
    total_kurus, inputs, proposed_service_start, valid_until, note_to_customer, issued_by
  )
  values (
    p_org_id, p_customer_user_id, p_application_id, null, b.id, v_number, v_first.price_list_id,
    v_first.price_list_version, pkg.id, bq.package_code, bq.package_name, bq.periodic_visits_per_year,
    bq.includes_inventory,
    coalesce((select bool_or(x) from unnest(v_inventory) x), false), v_first.vat_rate_bp, p_discount_bp,
    nullif(btrim(p_discount_note), ''), v_base, v_discount, v_subtotal, v_vat, v_total,
    jsonb_build_object(
      'formula', 'pricing-v2',
      'price_list_id', v_first.price_list_id,
      'version', v_first.price_list_version,
      'valid_from', v_first.valid_from,
      'vat_rate_bp', v_first.vat_rate_bp,
      'package', jsonb_build_object('id', pkg.id, 'code', bq.package_code, 'name', bq.package_name,
        'periodic_visits_per_year', bq.periodic_visits_per_year, 'includes_inventory', bq.includes_inventory),
      'first_year', coalesce((select bool_or(x) from unnest(v_inventory) x), false),
      'discount_bp', p_discount_bp,
      'addon', jsonb_build_object(
        'base_order_id', b.id,
        'base_order_number', b.number,
        'period_start', b.service_start,
        'period_end', b.service_end,
        'service_start', p_start,
        'remaining_days', b.service_end - p_start + 1,
        'period_days', b.service_end - b.service_start + 1,
        'visits_per_year', bq.periodic_visits_per_year,
        'visits', v_visits,
        'addon_last_day', v_last),
      'areas', (select jsonb_agg(jsonb_build_object(
          'line_no', o,
          'application_garden_id', x -> 'application_garden_id',
          'parcel_id', x -> 'parcel_id',
          'area_m2', (x ->> 'area_m2')::numeric,
          'source', x ->> 'area_source',
          'inventory', (x ->> 'inventory')::boolean) order by o)
        from jsonb_array_elements(p_lines) with ordinality t(x, o))
    ),
    p_start, least(private.istanbul_today() + p_valid_days, v_last),
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
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, p_discount_bp, v_on,
    bq.periodic_visits_per_year) l;

  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'quote.issued', 'quote', v_id,
    jsonb_build_object('number', v_number, 'application_id', p_application_id, 'addon_of_order_id', b.id,
      'lines', cardinality(v_areas), 'total_kurus', v_total, 'discount_bp', p_discount_bp,
      'price_list_version', v_first.price_list_version, 'visits', v_visits));
  perform private.enqueue_billing_notification('quote_ready', p_org_id, p_customer_user_id, v_id, v_number,
    '/portal/teklif/' || v_id);
  return v_id;
end;
$$;
comment on function private.write_addon_quote(uuid, uuid, uuid, public.service_order, uuid, jsonb, date, integer, integer, text, text) is
  'Writes an add-on quote (pricing-v2, inputs.addon, valid until the last add-on day at most); sends quote_ready.';


create or replace function public.ops_preview_addon_quote(
  p_base_order_id uuid,
  p_application_id uuid default null,
  p_parcel_ids uuid[] default null,
  p_proposed_service_start date default null,
  p_discount_bp integer default 0
)
returns table (
  line_no integer,
  application_garden_id uuid,
  parcel_id uuid,
  garden_name text,
  area_m2 numeric,
  area_source text,
  inventory boolean,
  billable_area_tenths integer,
  visits smallint,
  unit_price_kurus bigint,
  minimum_fee_kurus bigint,
  inventory_fee_kurus bigint,
  visit_amount_kurus bigint,
  line_base_kurus bigint,
  line_discount_kurus bigint,
  line_subtotal_kurus bigint,
  line_vat_kurus bigint,
  line_total_kurus bigint,
  price_list_id uuid,
  price_list_version integer,
  vat_rate_bp integer,
  service_start date,
  service_end date,
  periodic_visits_per_year smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.service_order;
  q public.quote;
  a public.service_application;
  v_lines jsonb;
  v_start date;
  v_visits smallint;
begin
  if num_nonnulls(p_application_id, p_parcel_ids) <> 1 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'application_id';
  end if;
  b := private.addon_base_for_ops(p_base_order_id);
  if p_application_id is not null then
    select * into a from public.service_application x where x.id = p_application_id;
    if not found or a.org_id <> b.org_id or a.customer_user_id <> b.customer_user_id then
      raise exception 'invalid_input' using errcode = '22023', detail = 'application_id';
    end if;
  else
    perform private.check_addon_parcels(b.org_id, b.customer_user_id, p_parcel_ids);
  end if;
  v_lines := private.addon_lines(p_application_id, p_parcel_ids);
  if v_lines is null then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  v_start := private.addon_start(b, p_proposed_service_start);
  if v_start > private.addon_last_day(b) then
    raise exception 'addon_period_too_short' using errcode = 'P0001';
  end if;
  select * into q from public.quote x where x.id = b.quote_id;
  v_visits := private.addon_visits(q.periodic_visits_per_year, v_start, b.service_start, b.service_end);
  return query
  select l.line_no, (v_lines -> (l.line_no - 1) ->> 'application_garden_id')::uuid,
         (v_lines -> (l.line_no - 1) ->> 'parcel_id')::uuid, v_lines -> (l.line_no - 1) ->> 'garden_name',
         l.area_m2, v_lines -> (l.line_no - 1) ->> 'area_source', (v_lines -> (l.line_no - 1) ->> 'inventory')::boolean,
         l.billable_area_tenths, l.visits, l.unit_price_kurus, l.minimum_fee_kurus, l.inventory_fee_kurus,
         l.visit_amount_kurus, l.line_base_kurus, l.line_discount_kurus, l.line_subtotal_kurus, l.line_vat_kurus,
         l.line_total_kurus, l.price_list_id, l.price_list_version, l.vat_rate_bp, v_start, b.service_end,
         q.periodic_visits_per_year
  from private.price_lines_v2(b.org_id, q.package_id,
    (select array_agg((x ->> 'area_m2')::numeric order by o) from jsonb_array_elements(v_lines) with ordinality t(x, o)),
    (select array_agg((x ->> 'inventory')::boolean order by o) from jsonb_array_elements(v_lines) with ordinality t(x, o)),
    v_visits, coalesce(p_discount_bp, 0), null, q.periodic_visits_per_year) l;
end;
$$;
comment on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer) is
  'Ops: the lines of an add-on quote (pricing-v2) for an application or existing parcels of the base order''s customer.';

-- ---------------------------------------------------------------------------
-- 1, 3, 6. Refund calculation
-- ---------------------------------------------------------------------------

-- Refund calculation removal-v1 (§7.1–§7.2) of the customer's lines on the
-- parcel affected by an effective day: lines of active or completed orders,
-- not removed, ending on or after the day. Writes nothing; no personal data.
-- As in 20261102120300_garden_removals.sql, except: visits and the inventory
-- count through the calculation day when it is on or after the effective day
-- (done work is never refunded, §2); a failed refund counts as refunded
-- (IP12 can still retry or settle it); a refund opened by another removal
-- belongs to that removal's line, never to the order's unattributed ones.
create or replace function private.removal_calc(
  p_org_id uuid,
  p_user_id uuid,
  p_parcel_id uuid,
  p_order_item_id uuid,
  p_effective_on date,
  p_withdrawal boolean,
  p_reason public.garden_removal_reason
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l record;
  bv record;
  v_lines jsonb := '[]'::jsonb;
  v_removed date;
  v_used integer;
  v_share bigint;
  v_service bigint;
  v_fee bigint;
  v_mode text;
  v_gross bigint;
  v_item_refunds bigint;
  v_loose bigint;
  v_already bigint;
  v_unattributed boolean;
  v_refund bigint;
  v_vat bigint;
  v_total_amount bigint := 0;
  v_total_refund bigint := 0;
  v_total_vat bigint := 0;
  v_any_unattributed boolean := false;
  v_requested_mode text;
  v_first_mode text;
  v_overall text;
begin
  for l in
    select oi.id, oi.order_id, oi.amount_kurus, o.number, o.service_start, o.service_end, o.total_kurus,
           qi.visits, qi.inventory_fee_kurus, qi.line_base_kurus, q.vat_rate_bp,
           (select count(*) from public.service_order_item x where x.order_id = o.id) as order_lines
    from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    join public.quote_item qi on qi.id = oi.quote_item_id
    join public.quote q on q.id = o.quote_id
    where oi.parcel_id = p_parcel_id and oi.customer_user_id = p_user_id and o.org_id = p_org_id
      and o.status in ('active', 'completed') and oi.removed_on is null and o.service_end >= p_effective_on
    order by o.service_start, oi.line_no, oi.id
  loop
    v_removed := greatest(p_effective_on, l.service_start);
    select * into bv from private.billed_visits(p_parcel_id, l.service_start,
      greatest(v_removed - 1, least(private.istanbul_today(), l.service_end)));
    v_used := least(bv.used, l.visits);
    v_share := case when l.line_base_kurus > 0
                 then round(l.amount_kurus::numeric * l.inventory_fee_kurus / l.line_base_kurus) else 0 end;
    v_service := l.amount_kurus - v_share;
    v_fee := floor(v_service::numeric / l.visits);
    v_mode := case
      when p_withdrawal and l.id = p_order_item_id then 'withdrawal'
      when p_reason = 'duplicate' then 'duplicate'
      else 'unused_visits'
    end;
    v_gross := case v_mode
      when 'withdrawal' then l.amount_kurus - case when bv.inventory_done then v_share else 0 end - v_used * v_fee
      when 'duplicate' then l.amount_kurus - v_used * v_fee
      else case when v_used = 0 then v_service else (l.visits - v_used) * v_fee end
           + case when bv.inventory_done then 0 else v_share end
    end;
    v_gross := greatest(v_gross, 0);

    -- Refunds on the line's payment items or opened by a removal of the line,
    -- and refunds of the order with no line (no item, or the balance item)
    -- except overpayment, mismatch and other removals' refunds. A failed
    -- refund counts: it can still be retried or settled as succeeded.
    select coalesce(sum(r.amount_kurus), 0) into v_item_refunds
    from public.refund r
    left join public.payment_item pi on pi.id = r.payment_item_id
    where r.order_id = l.order_id and r.status in ('requested', 'processing', 'succeeded', 'failed')
      and (pi.order_item_id = l.id
           or (r.garden_removal_id is not null and pi.order_item_id is null and exists (
                 select 1 from public.garden_removal g, jsonb_array_elements(g.calculation -> 'lines') x
                 where g.id = r.garden_removal_id and x ->> 'order_item_id' = l.id::text)));
    select coalesce(sum(r.amount_kurus), 0) into v_loose
    from public.refund r
    left join public.payment_item pi on pi.id = r.payment_item_id
    where r.order_id = l.order_id and r.status in ('requested', 'processing', 'succeeded', 'failed')
      and (r.payment_item_id is null or pi.order_item_id is null)
      and r.garden_removal_id is null
      and r.reason not in ('overpayment', 'provider_mismatch');
    if l.order_lines = 1 then
      v_already := v_item_refunds + v_loose;
      v_unattributed := false;
    else
      v_already := v_item_refunds
        + case when l.total_kurus > 0 then round(v_loose::numeric * l.amount_kurus / l.total_kurus) else 0 end;
      v_unattributed := v_loose > 0;
    end if;
    v_refund := greatest(0, v_gross - v_already);
    v_vat := round(v_refund::numeric * l.vat_rate_bp / (10000 + l.vat_rate_bp));

    v_lines := v_lines || jsonb_build_object(
      'order_item_id', l.id, 'order_id', l.order_id, 'order_number', l.number, 'removed_on', v_removed,
      'amount_kurus', l.amount_kurus, 'vat_rate_bp', l.vat_rate_bp, 'inventory_share_kurus', v_share,
      'inventory_done', bv.inventory_done, 'visits_entitled', l.visits, 'visits_used', v_used,
      'visits_excluded', bv.excluded, 'visit_fee_kurus', v_fee, 'gross_kurus', v_gross,
      'already_refunded_kurus', v_already, 'unattributed', v_unattributed, 'refund_kurus', v_refund,
      'refund_vat_kurus', v_vat, 'mode', v_mode);
    v_total_amount := v_total_amount + l.amount_kurus;
    v_total_refund := v_total_refund + v_refund;
    v_total_vat := v_total_vat + v_vat;
    v_any_unattributed := v_any_unattributed or v_unattributed;
    if l.id = p_order_item_id then
      v_requested_mode := v_mode;
    end if;
    v_first_mode := coalesce(v_first_mode, v_mode);
  end loop;

  v_overall := case
    when jsonb_array_length(v_lines) = 0 or v_total_amount = 0 then 'none'
    when (private.billing_setting(p_org_id)).removal_refund_mode = 'manual' or v_any_unattributed then 'manual'
    else coalesce(v_requested_mode, v_first_mode)
  end;
  return jsonb_build_object(
    'formula', 'removal-v1',
    'as_of', private.istanbul_today(),
    'effective_on', p_effective_on,
    'mode', v_overall,
    'refund_kurus', v_total_refund,
    'refund_vat_kurus', v_total_vat,
    'unallocated_kurus', 0,
    'unattributed_refunds', v_any_unattributed,
    'lines', v_lines
  );
end;
$$;


-- Completes an open removal that is due (§5.3), in one transaction; true when
-- this call completed it. As in 20261102120300_garden_removals.sql, plus: the
-- requested line whose period ends the day before the effective day is
-- marked removed on that day (no refund), so the garden reads as removed. Idempotent: anything else returns false. A pending
-- order holding money or a live card attempt blocks it (blocked_reason
-- pending_order, audited once). Ops (ops_complete_garden_removal) and the
-- daily housekeeping call it.
create or replace function private.complete_garden_removal(p_removal_id uuid, p_actor uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  o public.service_order;
  b public.service_order;
  v_today date := private.istanbul_today();
  v_eff date;
  v_affected uuid[];
  v_pending uuid[];
  v_lock uuid[];
  v_calc jsonb;
  v_requested_status public.order_status;
  v_lines integer;
  v_visits integer := 0;
  v_followups integer := 0;
  v_invitations integer := 0;
  v_cancelled_orders integer := 0;
  v_passive boolean := false;
  v_refunds integer := 0;
  v_base uuid;
begin
  select * into r from public.garden_removal where id = p_removal_id;
  if not found then
    return false;
  end if;
  perform private.lock_parcel_coverage(array[r.parcel_id]);
  -- Every writer of a removal holds the parcel lock: the row read now stays.
  select * into r from public.garden_removal where id = p_removal_id;
  if r.status not in ('requested', 'scheduled') or coalesce(r.effective_on, r.requested_effective_on) > v_today then
    return false;
  end if;
  v_eff := coalesce(r.effective_on, r.requested_effective_on);

  v_affected := array(
    select distinct oi.order_id from public.service_order_item oi
    join public.service_order x on x.id = oi.order_id
    where oi.parcel_id = r.parcel_id and oi.customer_user_id = r.customer_user_id
      and x.status in ('active', 'completed') and oi.removed_on is null and x.service_end >= v_eff);
  v_pending := array(
    select x.id from public.service_order x
    where x.customer_user_id = r.customer_user_id and x.org_id = r.org_id and x.status = 'awaiting_payment'
      and r.parcel_id = any (private.order_line_parcels(x.id)));
  v_lock := array(
    select y from unnest(v_affected || v_pending) y
    union
    select coalesce(x.addon_of_order_id, x.id) from public.service_order x where x.id = any (v_affected)
    union
    select x.id from public.service_order x
    where x.addon_of_order_id in (
      select coalesce(z.addon_of_order_id, z.id) from public.service_order z where z.id = any (v_affected))
      and x.status in ('active', 'awaiting_payment'));
  perform 1 from public.service_order x where x.id = any (v_lock) order by x.id for update;
  select * into r from public.garden_removal where id = p_removal_id for update;
  if r.status not in ('requested', 'scheduled') then
    return false;
  end if;

  if r.status = 'requested' then
    update public.garden_removal
    set status = 'scheduled', effective_on = v_eff, access_until = v_eff + r.access_days, scheduled_at = now()
    where id = r.id and status = 'requested'
    returning * into r;
    perform private.audit(r.org_id, p_actor, p_role, 'garden_removal.scheduled', 'garden_removal', r.id,
      jsonb_build_object('from_effective_on', null, 'to_effective_on', v_eff, 'from_access_days', r.access_days,
        'to_access_days', r.access_days, 'revoke_all_access', r.revoke_all_access, 'change_id', null));
  end if;

  -- Pending orders: all or nothing.
  if exists (
    select 1 from public.service_order x
    where x.id = any (v_pending) and x.status = 'awaiting_payment'
      and (x.paid_kurus > x.refunded_kurus or private.live_payment_attempt(x.id))
  ) then
    if r.blocked_reason is distinct from 'pending_order' then
      update public.garden_removal set blocked_reason = 'pending_order' where id = r.id;
      perform private.audit(r.org_id, null, 'system', 'garden_removal.blocked', 'garden_removal', r.id,
        jsonb_build_object('reason', 'pending_order'));
    end if;
    return false;
  end if;
  for o in select * from public.service_order x where x.id = any (v_pending) and x.status = 'awaiting_payment' order by x.id loop
    perform private.cancel_order(o, null, 'system', 'garden_removed', null);
    v_cancelled_orders := v_cancelled_orders + 1;
  end loop;

  v_calc := private.removal_calc(r.org_id, r.customer_user_id, r.parcel_id, r.order_item_id, v_eff, r.withdrawal,
    r.reason);
  v_lines := jsonb_array_length(v_calc -> 'lines');
  if v_lines = 0 then
    select x.status into v_requested_status from public.service_order x where x.id = r.order_id;
    if v_requested_status in ('terminated', 'cancelled') then
      update public.garden_removal
      set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', blocked_reason = null,
          ops_note = 'order_terminated'
      where id = r.id and status = 'scheduled';
      perform private.audit(r.org_id, null, 'system', 'garden_removal.cancelled', 'garden_removal', r.id,
        jsonb_build_object('reason', 'order_terminated'));
      return false;
    end if;
  end if;

  -- Lines leave the service on the effective day (a paid future line whole).
  update public.service_order_item oi
  set removed_on = greatest(v_eff, x.service_start), garden_removal_id = r.id
  from public.service_order x
  where x.id = oi.order_id and oi.parcel_id = r.parcel_id and oi.customer_user_id = r.customer_user_id
    and x.status in ('active', 'completed') and oi.removed_on is null and x.service_end >= v_eff;
  update public.service_order_item oi
  set removed_on = v_eff, garden_removal_id = r.id
  from public.service_order x
  where oi.id = r.order_item_id and x.id = oi.order_id and x.status in ('active', 'completed')
    and oi.removed_on is null and x.service_end = v_eff - 1;

  -- Operations, unless another line serves the parcel on the day.
  if not private.parcel_served_on(r.parcel_id, v_eff) then
    update public.session set status = 'cancelled'
    where parcel_id = r.parcel_id and status = 'planned' and kind in ('inventory', 'periodic_scan', 'verification');
    get diagnostics v_visits = row_count;
    update public.followup_request set status = 'cancelled', resolved_at = now(), resolved_by = p_actor
    where parcel_id = r.parcel_id and status in ('open', 'planned');
    get diagnostics v_followups = row_count;
    update private.viewer_invitation set status = 'cancelled', resolved_at = now(), resolved_by = p_actor
    where parcel_id = r.parcel_id and status = 'pending';
    get diagnostics v_invitations = row_count;
    update public.parcel set status = 'passive' where id = r.parcel_id and status <> 'passive';
    v_passive := true;
  end if;

  update public.garden_removal
  set calculation = v_calc, refund_mode = v_calc ->> 'mode', refund_kurus = (v_calc ->> 'refund_kurus')::bigint
  where id = r.id;
  if v_calc ->> 'mode' not in ('manual', 'none') and (v_calc ->> 'refund_kurus')::bigint > 0 then
    v_refunds := private.open_removal_refunds(r.id);
  end if;
  update public.garden_removal set status = 'completed', completed_at = now(), blocked_reason = null
  where id = r.id and status = 'scheduled'
  returning * into r;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;

  -- Emptied orders end: an add-on with every line removed; a base order once
  -- its lines and those of its active add-ons are all removed (with them).
  for v_base in
    select distinct coalesce(x.addon_of_order_id, x.id) from public.service_order x where x.id = any (v_affected)
  loop
    for o in
      select * from public.service_order x
      where x.addon_of_order_id = v_base and x.id = any (v_affected) and x.status = 'active'
        and not exists (select 1 from public.service_order_item i where i.order_id = x.id and i.removed_on is null)
      order by x.id
    loop
      perform private.terminate_emptied_order(o.id, 'all_gardens_removed');
    end loop;
    select * into b from public.service_order x where x.id = v_base;
    if b.status = 'active'
       and not exists (
         select 1 from public.service_order_item i
         join public.service_order x on x.id = i.order_id
         where (x.id = b.id or (x.addon_of_order_id = b.id and x.status = 'active')) and i.removed_on is null) then
      perform private.terminate_emptied_order(b.id, 'all_gardens_removed');
      for o in select * from public.service_order x where x.addon_of_order_id = b.id and x.status = 'active' order by x.id loop
        perform private.terminate_emptied_order(o.id, 'all_gardens_removed');
      end loop;
      v_cancelled_orders := v_cancelled_orders + private.close_base_addons(b, null, 'system');
    end if;
  end loop;

  perform private.audit(r.org_id, p_actor, p_role, 'garden_removal.completed', 'garden_removal', r.id,
    jsonb_build_object('effective_on', v_eff, 'refund_mode', r.refund_mode, 'refund_kurus', r.refund_kurus,
      'lines', v_lines, 'refunds', v_refunds, 'parcel_passive', v_passive, 'cancelled_visits', v_visits,
      'cancelled_followups', v_followups, 'cancelled_invitations', v_invitations,
      'cancelled_orders', v_cancelled_orders));
  perform private.enqueue_garden_notification('garden_removal_completed', r.org_id, r.customer_user_id, r.id, r.number,
    case when r.access_days > 0 then '/portal/parsel/' || r.parcel_id else '/portal' end, r.parcel_id);
  return true;
end;
$$;
comment on function private.complete_garden_removal(uuid, uuid, text) is
  'Completes a due removal (§5.3): lines, refund calculation and rows, visits cancelled, parcel passive, emptied orders ended.';


-- Daily (pg_cron, after billing-housekeeping): completes due removals, sends
-- garden_access_ending once (7 days before the end of a window of at least
-- 14 days), and ends the access of windows that are over (§5.4). As in
-- 20261102120300_garden_removals.sql, except: rows are taken in parcel order
-- (the order every multi-parcel caller locks in), and each completion and
-- each end of access runs in its own subtransaction; a failure rolls back
-- only that row (its locks released), is audited (garden_removal.
-- housekeeping_failed) and counted in failed, and is retried the next night.
create or replace function private.garden_removal_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.istanbul_today();
  r public.garden_removal;
  v record;
  v_scheduled integer := 0;
  v_completed integer := 0;
  v_blocked integer := 0;
  v_cancelled integer := 0;
  v_notices integer := 0;
  v_revoked integer := 0;
  v_resumed integer := 0;
  v_failed integer := 0;
  v_removed uuid[];
  v_kept integer;
  v_state text;
  v_message text;
begin
  for r in
    select * from public.garden_removal x
    where x.status in ('requested', 'scheduled') and coalesce(x.effective_on, x.requested_effective_on) <= v_today
    order by x.parcel_id, coalesce(x.effective_on, x.requested_effective_on), x.id
  loop
    begin
      if private.complete_garden_removal(r.id, null, 'system') then
        v_completed := v_completed + 1;
      end if;
      select * into v from public.garden_removal x where x.id = r.id;
      if r.status = 'requested' and v.status <> 'requested' then
        v_scheduled := v_scheduled + 1;
      end if;
      if v.status = 'cancelled' then
        v_cancelled := v_cancelled + 1;
      elsif v.blocked_reason is not null then
        v_blocked := v_blocked + 1;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      perform private.audit(r.org_id, null, 'system', 'garden_removal.housekeeping_failed', 'garden_removal', r.id,
        jsonb_build_object('step', 'complete', 'sqlstate', v_state, 'message', left(v_message, 200)));
      raise warning 'garden_removal_housekeeping: completing % failed: % %', r.number, v_state, v_message;
      v_failed := v_failed + 1;
    end;
  end loop;

  for v in
    update public.garden_removal set access_notice_sent_at = now()
    where status = 'completed' and access_notice_sent_at is null and access_revoked_at is null
      and access_days >= 14 and access_until - 7 <= v_today and v_today < access_until
    returning id, org_id, customer_user_id, number, parcel_id
  loop
    v_notices := v_notices + private.enqueue_garden_notification('garden_access_ending', v.org_id,
      v.customer_user_id, v.id, v.number, '/portal/parsel/' || v.parcel_id, v.parcel_id);
  end loop;

  for r in
    select * from public.garden_removal x
    where x.status = 'completed' and x.access_revoked_at is null and x.access_until <= v_today
    order by x.parcel_id, x.access_until, x.id
  loop
    begin
      perform private.lock_parcel_coverage(array[r.parcel_id]);
      select * into r from public.garden_removal x where x.id = r.id for update;
      continue when r.access_revoked_at is not null;
      if exists (
        select 1 from public.service_order_item oi
        join public.service_order o on o.id = oi.order_id
        where oi.parcel_id = r.parcel_id and o.customer_user_id = r.customer_user_id and o.status = 'active'
          and o.service_start <= v_today and v_today <= o.service_end
          and (oi.removed_on is null or oi.removed_on > v_today)
      ) then
        update public.garden_removal set access_revoked_at = now() where id = r.id;
        perform private.audit(r.org_id, null, 'system', 'garden_removal.access_revoked', 'garden_removal', r.id,
          jsonb_build_object('removed', 0, 'reason', 'resumed'));
        v_resumed := v_resumed + 1;
        continue;
      end if;
      v_removed := array(select s.user_id from private.removal_access_scope(r.id) s where s.removed order by s.user_id);
      delete from public.parcel_access pa
      where pa.id in (select s.access_id from private.removal_access_scope(r.id) s where s.removed);
      select count(*) into v_kept from public.parcel_access pa where pa.parcel_id = r.parcel_id;
      update public.garden_removal set access_revoked_at = now() where id = r.id;
      perform private.audit(r.org_id, null, 'system', 'garden_removal.access_revoked', 'garden_removal', r.id,
        jsonb_build_object('removed_user_ids', to_jsonb(v_removed), 'kept', v_kept, 'reason', 'expired'));
      v_revoked := v_revoked + 1;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      perform private.audit(r.org_id, null, 'system', 'garden_removal.housekeeping_failed', 'garden_removal', r.id,
        jsonb_build_object('step', 'access_revoke', 'sqlstate', v_state, 'message', left(v_message, 200)));
      raise warning 'garden_removal_housekeeping: ending access of % failed: % %', r.number, v_state, v_message;
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object('scheduled', v_scheduled, 'completed', v_completed, 'blocked', v_blocked,
    'cancelled', v_cancelled, 'access_notices', v_notices, 'access_revoked', v_revoked,
    'access_resumed', v_resumed, 'failed', v_failed);
end;
$$;
comment on function private.garden_removal_housekeeping() is
  'Daily (pg_cron): completes due garden removals, sends the access notice once, ends access windows that are over; one subtransaction a row.';

-- requested or scheduled → cancelled by the customer (no message), only a
-- removal the customer asked for: one ops opened (transfer, duplicate, a date
-- agreed by ops) is ops' to cancel (removal_not_open). As in
-- 20261102120300_garden_removals.sql plus that rule. Errors: demo_read_only,
-- not_found, removal_not_open, state_changed.
create or replace function public.customer_cancel_garden_removal(p_removal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  v_user uuid := (select auth.uid());
begin
  perform private.assert_not_demo();
  select * into r from public.garden_removal x where x.id = p_removal_id and x.customer_user_id = v_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.lock_parcel_coverage(array[r.parcel_id]);
  select * into r from public.garden_removal x where x.id = p_removal_id for update;
  if r.status not in ('requested', 'scheduled') or r.initiated_by <> 'customer' then
    raise exception 'removal_not_open' using errcode = 'P0001';
  end if;
  update public.garden_removal
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', blocked_reason = null
  where id = r.id and status = r.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(r.org_id, v_user, 'customer', 'garden_removal.cancelled', 'garden_removal', r.id,
    jsonb_build_object('number', r.number, 'from', r.status));
end;
$$;
comment on function public.customer_cancel_garden_removal(uuid) is
  'Customer: withdraws an open garden removal they asked for (not one ops opened).';

