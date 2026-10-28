-- Legal follow-ups, wave 1 / 7: the add-on quote breakdown, the remaining
-- visit windows, 24-month inventory reuse and the addon_order_closed message
-- (docs/hukuk/kararlar.md H19, T18; contract 8D/2, 8D/3, 8D/6, Ek-2;
-- docs/bahce-yonetimi.md §4). The pricing formula pricing-v2 is unchanged.
--
-- 1. Visit windows of contract Ek-2 (Kış Aralık–Şubat, İlkbahar Nisan–Mayıs,
--    Yaz Haziran–Temmuz, Hasat Ağustos–Ekim): public.contract_visit_windows()
--    (mirrored in apps/web/src/lib/billing/visit-windows.ts) and
--    private.remaining_visit_windows(from, to): a window counts when any of
--    its days falls between the two days (inclusive).
-- 2. Inventory reuse (8D/3): an add-on line pays no inventory fee when its
--    parcel's last published inventory is within
--    org_billing_setting.inventory_reuse_months (SQL only, default 24) of the
--    add-on's start and ops did not mark a new inventory as needed (with a
--    reason). Only private.addon_lines applies it; parcel_has_inventory keeps
--    its meaning for its other callers.
-- 3. private.addon_breakdown: the H19 breakdown (raw and rounded visits, visit
--    amount, prorated minimum and the basis charged, inventory fee and its
--    reason, VAT, total, the same garden's full-year price, the price list
--    name, the remaining windows). write_addon_quote stores it in
--    quote.inputs.addon; customer_addon_preview and ops_preview_addon_quote
--    return it; ops_issue_addon_quote and ops_preview_addon_quote take
--    p_new_inventory.
-- 4. An add-on order holding money that is cancelled because its period
--    closed (addon_base_closed, base_terminated; order_closed refunds)
--    queues addon_order_closed once.

-- ---------------------------------------------------------------------------
-- 1. Visit windows
-- ---------------------------------------------------------------------------

create function public.contract_visit_windows()
returns table (code text, name text, start_month integer, end_month integer)
language sql
immutable
set search_path = ''
as $$
  values ('winter', 'Kış', 12, 2), ('spring', 'İlkbahar', 4, 5), ('summer', 'Yaz', 6, 7), ('harvest', 'Hasat', 8, 10);
$$;
comment on function public.contract_visit_windows() is
  'Visit windows of contract Ek-2 (T18): code, Turkish name, first and last month (winter spans the new year).';

-- The window occurrences with a day between p_from and p_to (inclusive), in
-- order: [{code, name, label, start, end}]; label "Kış 2026–2027" for winter,
-- else "<name> <year>".
create function private.remaining_visit_windows(p_from date, p_to date)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', o.code, 'name', o.name,
           'label', o.name || ' ' || case when o.end_month < o.start_month
                                       then o.y::text || '–' || (o.y + 1)::text else o.y::text end,
           'start', o.w_start, 'end', o.w_end) order by o.w_start), '[]'::jsonb)
  from (
    select w.code, w.name, w.start_month, w.end_month, y,
           make_date(y, w.start_month, 1) as w_start,
           (make_date(case when w.end_month < w.start_month then y + 1 else y end, w.end_month, 1)
             + interval '1 month' - interval '1 day')::date as w_end
    from public.contract_visit_windows() w
    cross join generate_series(extract(year from p_from)::integer - 1, extract(year from p_to)::integer) y
  ) o
  where p_from is not null and p_to is not null and o.w_start <= p_to and o.w_end >= p_from;
$$;
comment on function private.remaining_visit_windows(date, date) is
  'T18: occurrences of the contract visit windows with a day between the two days (inclusive).';

-- ---------------------------------------------------------------------------
-- 2. Inventory reuse
-- ---------------------------------------------------------------------------

-- Istanbul day of the parcel's latest published inventory visit, or null.
create function private.parcel_last_inventory_on(p_parcel_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(coalesce((s.started_at at time zone 'Europe/Istanbul')::date, s.planned_date))
  from public.session s
  where p_parcel_id is not null and s.parcel_id = p_parcel_id and s.kind = 'inventory' and s.status = 'published';
$$;

-- As in 20261102120200_garden_addons.sql, plus the add-on's start day and
-- ops' marks: {"<parcel_id or application_garden_id>": "<reason>"} for lines
-- that need a new inventory. Each line also carries inventory_reason
-- (new_garden: no parcel yet; no_inventory: never inventoried;
-- inventory_expired: last inventory older than inventory_reuse_months;
-- ops_required: marked by ops, inventory_note the reason; inventory_reused:
-- no fee) and last_inventory_on. Errors: invalid_input (new_inventory).
drop function private.addon_lines(uuid, uuid[]);
create function private.addon_lines(
  p_application_id uuid,
  p_parcel_ids uuid[],
  p_start date default null,
  p_new_inventory jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_months integer;
  v_start date := coalesce(p_start, private.istanbul_today());
  v_raw jsonb;
  v_out jsonb := '[]'::jsonb;
  x jsonb;
  k text;
  v_key text;
  v_parcel uuid;
  v_last date;
  v_reason text;
begin
  if p_application_id is not null then
    select a.org_id into v_org from public.service_application a where a.id = p_application_id;
    select jsonb_agg(jsonb_build_object(
             'application_garden_id', g.id, 'garden_name', g.name,
             'area_m2', coalesce(g.verified_area_m2, g.declared_area_m2),
             'area_source', case when g.verified_at is not null then 'verified' else 'estimated' end,
             '_parcel', g.parcel_id, '_key', g.id::text)
           order by g.sort_order, g.created_at, g.id)
    into v_raw
    from public.application_garden g
    where g.application_id = p_application_id and g.withdrawn_at is null;
  else
    select p.org_id into v_org from public.parcel p where p.id = p_parcel_ids[1];
    select jsonb_agg(jsonb_build_object(
             'parcel_id', p.id, 'garden_name', p.name,
             'area_m2', coalesce(round(b.area_m2::numeric, 2), p.estimated_area_m2),
             'area_source', case when b.area_m2 is not null then 'boundary' else 'estimated' end,
             '_parcel', p.id, '_key', p.id::text)
           order by x.o)
    into v_raw
    from unnest(p_parcel_ids) with ordinality x(id, o)
    join public.parcel p on p.id = x.id
    left join lateral (
      select bb.area_m2 from public.boundary bb where bb.parcel_id = p.id order by bb.version desc limit 1
    ) b on true;
  end if;
  if v_raw is null then
    return null;
  end if;
  v_months := (private.billing_setting(v_org)).inventory_reuse_months;

  if p_new_inventory is not null then
    if jsonb_typeof(p_new_inventory) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'new_inventory';
    end if;
    for k in select jsonb_object_keys(p_new_inventory) loop
      if not exists (select 1 from jsonb_array_elements(v_raw) y where y ->> '_key' = k)
         or jsonb_typeof(p_new_inventory -> k) <> 'string'
         or length(btrim(p_new_inventory ->> k)) not between 1 and 300 then
        raise exception 'invalid_input' using errcode = '22023', detail = 'new_inventory';
      end if;
    end loop;
  end if;

  for x in select y from jsonb_array_elements(v_raw) y loop
    v_key := x ->> '_key';
    v_parcel := (x ->> '_parcel')::uuid;
    v_last := private.parcel_last_inventory_on(v_parcel);
    v_reason := case
      when p_new_inventory ? v_key then 'ops_required'
      when v_parcel is null then 'new_garden'
      when v_last is null then 'no_inventory'
      when v_last < (v_start - make_interval(months => v_months))::date then 'inventory_expired'
      else 'inventory_reused'
    end;
    v_out := v_out || jsonb_build_array((x - '_parcel' - '_key') || jsonb_build_object(
      'inventory', v_reason <> 'inventory_reused',
      'inventory_reason', v_reason,
      'inventory_note', case when v_reason = 'ops_required' then btrim(p_new_inventory ->> v_key) end,
      'last_inventory_on', v_last));
  end loop;
  return v_out;
end;
$$;
comment on function private.addon_lines(uuid, uuid[], date, jsonb) is
  'Lines of an add-on quote with the inventory decision (8D/3: reuse within inventory_reuse_months unless ops marks a new inventory).';

-- ---------------------------------------------------------------------------
-- 3. Breakdown
-- ---------------------------------------------------------------------------

-- The H19 breakdown of add-on lines ([{garden_name, area_m2, inventory,
-- inventory_reason?, inventory_note?, last_inventory_on?}]) starting on
-- p_start in the period: raw_visits (V × days left / period days, 4
-- decimals), rounded_visits (half up, 1..V), the price list, the remaining
-- windows and their count, visits_exceed_windows, the lines with the visit
-- amount, the prorated minimum and the basis charged (visits or minimum),
-- inventory fee and reason, VAT, total and the same garden's full-year total
-- (V visits, same inventory and discount), and the totals.
create function private.addon_breakdown(
  p_org_id uuid,
  p_package_id uuid,
  p_lines jsonb,
  p_start date,
  p_period_start date,
  p_period_end date,
  p_year_visits smallint,
  p_discount_bp integer,
  p_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_areas numeric[];
  v_inventory boolean[];
  v_visits smallint := private.addon_visits(p_year_visits, p_start, p_period_start, p_period_end);
  v_windows jsonb := private.remaining_visit_windows(greatest(p_start, p_period_start), p_period_end);
  v_lines jsonb;
  v_first record;
begin
  select array_agg((x ->> 'area_m2')::numeric order by o), array_agg(coalesce((x ->> 'inventory')::boolean, true) order by o)
  into v_areas, v_inventory
  from jsonb_array_elements(p_lines) with ordinality t(x, o);
  select * into v_first
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, coalesce(p_discount_bp, 0),
    p_on, p_year_visits) limit 1;
  select jsonb_agg(jsonb_build_object(
           'line_no', l.line_no,
           'garden_name', p_lines -> (l.line_no - 1) ->> 'garden_name',
           'area_m2', l.area_m2,
           'billable_area_tenths', l.billable_area_tenths,
           'visits', l.visits,
           'unit_price_kurus', l.unit_price_kurus,
           'visit_amount_kurus', l.visit_amount_kurus,
           'minimum_fee_kurus', l.minimum_fee_kurus,
           'basis', case when l.visit_amount_kurus >= l.minimum_fee_kurus then 'visits' else 'minimum' end,
           'inventory_fee_kurus', l.inventory_fee_kurus,
           'inventory_reason', coalesce(p_lines -> (l.line_no - 1) ->> 'inventory_reason',
             case when l.inventory_fee_kurus > 0 then 'new_garden' else 'inventory_reused' end),
           'inventory_note', p_lines -> (l.line_no - 1) ->> 'inventory_note',
           'last_inventory_on', p_lines -> (l.line_no - 1) ->> 'last_inventory_on',
           'line_base_kurus', l.line_base_kurus,
           'line_discount_kurus', l.line_discount_kurus,
           'line_subtotal_kurus', l.line_subtotal_kurus,
           'line_vat_kurus', l.line_vat_kurus,
           'line_total_kurus', l.line_total_kurus,
           'full_year_total_kurus', f.line_total_kurus) order by l.line_no)
  into v_lines
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, coalesce(p_discount_bp, 0),
    p_on, p_year_visits) l
  join private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, p_year_visits,
    coalesce(p_discount_bp, 0), p_on, p_year_visits) f on f.line_no = l.line_no;
  return jsonb_build_object(
    'raw_visits', round(p_year_visits::numeric * (p_period_end - greatest(p_start, p_period_start) + 1)
                        / (p_period_end - p_period_start + 1), 4),
    'rounded_visits', v_visits,
    'rounding', 'half_up',
    'price_list_id', v_first.price_list_id,
    'price_list_version', v_first.price_list_version,
    'price_list_valid_from', v_first.valid_from,
    'price_list_name', 'Fiyat listesi v' || v_first.price_list_version,
    'vat_rate_bp', v_first.vat_rate_bp,
    'remaining_windows', v_windows,
    'remaining_window_count', jsonb_array_length(v_windows),
    'visits_exceed_windows', v_visits > jsonb_array_length(v_windows),
    'lines', v_lines,
    'totals', (select jsonb_build_object(
        'base_kurus', sum((y ->> 'line_base_kurus')::bigint),
        'discount_kurus', sum((y ->> 'line_discount_kurus')::bigint),
        'subtotal_kurus', sum((y ->> 'line_subtotal_kurus')::bigint),
        'vat_kurus', sum((y ->> 'line_vat_kurus')::bigint),
        'total_kurus', sum((y ->> 'line_total_kurus')::bigint))
      from jsonb_array_elements(v_lines) y));
end;
$$;
comment on function private.addon_breakdown(uuid, uuid, jsonb, date, date, date, smallint, integer, date) is
  'T18 / H19: the breakdown of add-on lines (visits raw and rounded, minimum basis, inventory reason, full-year price, windows).';

-- As in 20261102120400_garden_review_fixes.sql, plus the breakdown in
-- inputs.addon (private.addon_breakdown: its keys, and lines) and each area's
-- inventory_reason.
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
  v_breakdown jsonb;
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
  v_breakdown := private.addon_breakdown(p_org_id, p_package_id, p_lines, p_start, b.service_start, b.service_end,
    bq.periodic_visits_per_year, p_discount_bp, v_on);
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
        'addon_last_day', v_last)
        || (v_breakdown - 'lines' - 'totals')
        || jsonb_build_object('lines', v_breakdown -> 'lines'),
      'areas', (select jsonb_agg(jsonb_build_object(
          'line_no', o,
          'application_garden_id', x -> 'application_garden_id',
          'parcel_id', x -> 'parcel_id',
          'area_m2', (x ->> 'area_m2')::numeric,
          'source', x ->> 'area_source',
          'inventory', (x ->> 'inventory')::boolean,
          'inventory_reason', x ->> 'inventory_reason') order by o)
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
-- As in 20261102120500_garden_integration_fixes.sql, plus the breakdown
-- columns: raw_visits, basis, full_year_total_kurus, price_list_name and the
-- remaining windows (the same for every line). Every line is a new garden
-- (inventory fee).
drop function public.customer_addon_preview(numeric[]);
create function public.customer_addon_preview(p_areas_m2 numeric[])
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
  periodic_visits_per_year smallint,
  raw_visits numeric,
  basis text,
  full_year_total_kurus bigint,
  price_list_name text,
  remaining_windows jsonb
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
  v_breakdown jsonb;
begin
  if v_user is null or v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  if not (private.billing_setting(v_org)).garden_changes_enabled then
    raise exception 'garden_changes_closed' using errcode = 'P0001';
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
  if p_areas_m2 is null or cardinality(p_areas_m2) = 0 or cardinality(p_areas_m2) > 50
     or exists (select 1 from unnest(p_areas_m2) a where a is null or a <= 0 or a > 10000000) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'areas';
  end if;
  select * into q from public.quote x where x.id = b.quote_id;
  v_start := greatest(private.istanbul_today(), b.service_start);
  v_visits := private.addon_visits(q.periodic_visits_per_year, v_start, b.service_start, b.service_end);
  v_breakdown := private.addon_breakdown(v_org, q.package_id,
    (select jsonb_agg(jsonb_build_object('area_m2', a, 'inventory', true, 'inventory_reason', 'new_garden') order by o)
     from unnest(p_areas_m2) with ordinality u(a, o)),
    v_start, b.service_start, b.service_end, q.periodic_visits_per_year, 0, null);
  return query
  select l.*, b.id, v_start, b.service_end, q.periodic_visits_per_year,
         (v_breakdown ->> 'raw_visits')::numeric,
         v_breakdown -> 'lines' -> (l.line_no - 1) ->> 'basis',
         (v_breakdown -> 'lines' -> (l.line_no - 1) ->> 'full_year_total_kurus')::bigint,
         v_breakdown ->> 'price_list_name',
         v_breakdown -> 'remaining_windows'
  from private.price_lines_v2(v_org, q.package_id, p_areas_m2, array_fill(true, array[cardinality(p_areas_m2)]),
    v_visits, 0, null, q.periodic_visits_per_year) l;
end;
$$;
comment on function public.customer_addon_preview(numeric[]) is
  'Customer: a non-binding add-on price of new gardens (pricing-v2) for the current membership, with the H19 breakdown.';

-- As in 20261102120400_garden_review_fixes.sql, plus p_new_inventory (see
-- private.addon_lines) and the breakdown columns: inventory_reason,
-- inventory_note, last_inventory_on, raw_visits, basis, full_year_total_kurus,
-- price_list_name, remaining_windows (the same on every line).
drop function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer);
create function public.ops_preview_addon_quote(
  p_base_order_id uuid,
  p_application_id uuid default null,
  p_parcel_ids uuid[] default null,
  p_proposed_service_start date default null,
  p_discount_bp integer default 0,
  p_new_inventory jsonb default null
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
  periodic_visits_per_year smallint,
  inventory_reason text,
  inventory_note text,
  last_inventory_on date,
  raw_visits numeric,
  basis text,
  full_year_total_kurus bigint,
  price_list_name text,
  remaining_windows jsonb
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
  v_breakdown jsonb;
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
  v_start := private.addon_start(b, p_proposed_service_start);
  if v_start > private.addon_last_day(b) then
    raise exception 'addon_period_too_short' using errcode = 'P0001';
  end if;
  v_lines := private.addon_lines(p_application_id, p_parcel_ids, v_start, p_new_inventory);
  if v_lines is null then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  select * into q from public.quote x where x.id = b.quote_id;
  v_breakdown := private.addon_breakdown(b.org_id, q.package_id, v_lines, v_start, b.service_start, b.service_end,
    q.periodic_visits_per_year, coalesce(p_discount_bp, 0), null);
  return query
  select (y ->> 'line_no')::integer, (v_lines -> (o::integer - 1) ->> 'application_garden_id')::uuid,
         (v_lines -> (o::integer - 1) ->> 'parcel_id')::uuid, y ->> 'garden_name',
         (y ->> 'area_m2')::numeric, v_lines -> (o::integer - 1) ->> 'area_source',
         (v_lines -> (o::integer - 1) ->> 'inventory')::boolean,
         (y ->> 'billable_area_tenths')::integer, (y ->> 'visits')::smallint, (y ->> 'unit_price_kurus')::bigint,
         (y ->> 'minimum_fee_kurus')::bigint, (y ->> 'inventory_fee_kurus')::bigint,
         (y ->> 'visit_amount_kurus')::bigint, (y ->> 'line_base_kurus')::bigint,
         (y ->> 'line_discount_kurus')::bigint, (y ->> 'line_subtotal_kurus')::bigint,
         (y ->> 'line_vat_kurus')::bigint, (y ->> 'line_total_kurus')::bigint,
         (v_breakdown ->> 'price_list_id')::uuid, (v_breakdown ->> 'price_list_version')::integer,
         (v_breakdown ->> 'vat_rate_bp')::integer,
         v_start, b.service_end, q.periodic_visits_per_year,
         y ->> 'inventory_reason', y ->> 'inventory_note', (y ->> 'last_inventory_on')::date,
         (v_breakdown ->> 'raw_visits')::numeric, y ->> 'basis', (y ->> 'full_year_total_kurus')::bigint,
         v_breakdown ->> 'price_list_name', v_breakdown -> 'remaining_windows'
  from jsonb_array_elements(v_breakdown -> 'lines') with ordinality t(y, o)
  order by o;
end;
$$;
comment on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer, jsonb) is
  'Ops: the lines of an add-on quote (pricing-v2) with the H19 breakdown, for an application or owned parcels of the base order''s customer.';

-- As in 20261102120200_garden_addons.sql, plus p_new_inventory (see
-- private.addon_lines); the lines are built for the add-on's start day.
drop function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text);
create function public.ops_issue_addon_quote(
  p_base_order_id uuid,
  p_application_id uuid default null,
  p_parcel_ids uuid[] default null,
  p_proposed_service_start date default null,
  p_valid_days integer default null,
  p_discount_bp integer default 0,
  p_discount_note text default null,
  p_note_to_customer text default null,
  p_new_inventory jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  b public.service_order;
  q public.quote;
  x public.quote;
  v_days integer;
  v_lines jsonb;
  v_parcels uuid[];
  v_start date;
  v_id uuid;
  v_actor uuid := (select auth.uid());
begin
  if num_nonnulls(p_application_id, p_parcel_ids) <> 1 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'application_id';
  end if;
  if p_application_id is not null then
    a := private.lock_application_for_ops(p_application_id);
  end if;
  b := private.addon_base_for_ops(p_base_order_id);
  if not (private.billing_setting(b.org_id)).garden_changes_enabled then
    raise exception 'garden_changes_closed' using errcode = 'P0001';
  end if;
  v_days := private.check_quote_terms(b.org_id, p_proposed_service_start, p_valid_days, coalesce(p_discount_bp, 0),
    p_discount_note, p_note_to_customer);

  if a.id is not null then
    if a.org_id <> b.org_id or a.customer_user_id <> b.customer_user_id then
      raise exception 'invalid_input' using errcode = '22023', detail = 'application_id';
    end if;
    if a.status not in ('submitted', 'quoted') then
      raise exception 'application_not_open' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.application_garden g where g.application_id = a.id and g.withdrawn_at is null) then
      raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
    end if;
    if exists (select 1 from public.application_garden g
               where g.application_id = a.id and g.withdrawn_at is null and g.verified_at is null) then
      raise exception 'garden_not_verified' using errcode = 'P0001';
    end if;
    select array_agg(g.parcel_id) into v_parcels from public.application_garden g
    where g.application_id = a.id and g.withdrawn_at is null and g.parcel_id is not null;
    perform private.supersede_open_quote(a.id, null);
  else
    perform private.check_addon_parcels(b.org_id, b.customer_user_id, p_parcel_ids);
    v_parcels := p_parcel_ids;
    if exists (select 1 from unnest(v_parcels) p where private.parcel_transferred(p, b.customer_user_id)) then
      raise exception 'parcel_not_reusable' using errcode = 'P0001', detail = 'parcel_ids';
    end if;
    for x in
      select * from public.quote qq
      where qq.addon_of_order_id = b.id and qq.status = 'issued'
        and exists (select 1 from public.quote_item qi where qi.quote_id = qq.id and qi.parcel_id = any (v_parcels))
      order by qq.id
      for update
    loop
      update public.quote set status = 'superseded', decided_at = now(), decided_by = v_actor
      where id = x.id and status = 'issued';
      if not found then
        raise exception 'state_changed' using errcode = 'P0001';
      end if;
      perform private.audit(x.org_id, v_actor, 'ops', 'quote.superseded', 'quote', x.id,
        jsonb_build_object('number', x.number));
    end loop;
  end if;
  v_parcels := coalesce(v_parcels, '{}');

  perform private.lock_customer_gardens(b.customer_user_id);
  perform private.lock_parcel_coverage(v_parcels);
  select * into b from public.service_order o where o.id = b.id for update;
  if b.status <> 'active' then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  v_start := private.addon_start(b, p_proposed_service_start);
  if v_start > private.addon_last_day(b) then
    raise exception 'addon_period_too_short' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_parcels) p where private.parcel_in_service(p, v_start, b.service_end)) then
    raise exception 'parcel_in_service' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  v_lines := private.addon_lines(a.id, case when a.id is null then v_parcels end, v_start, p_new_inventory);
  if private.account_garden_count(b.org_id, b.customer_user_id, v_start, b.service_end)
     + jsonb_array_length(v_lines) > 50 then
    raise exception 'account_garden_limit' using errcode = 'P0001';
  end if;

  select * into q from public.quote qq where qq.id = b.quote_id;
  begin
    v_id := private.write_addon_quote(b.org_id, b.customer_user_id, a.id, b, q.package_id, v_lines, v_start, v_days,
      coalesce(p_discount_bp, 0), p_discount_note, p_note_to_customer);
  exception when unique_violation then
    raise exception 'state_changed' using errcode = 'P0001';
  end;
  if a.id is not null then
    update public.service_application set status = 'quoted' where id = a.id and status = a.status;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text, jsonb) is
  'Ops: issues an add-on quote (pricing-v2, H19 breakdown in inputs.addon) joining a base order, for an application or owned parcels; sends quote_ready.';

-- ---------------------------------------------------------------------------
-- 4. addon_order_closed
-- ---------------------------------------------------------------------------

-- An add-on awaiting payment that holds money and is cancelled because its
-- period closed (activation refused: addon_base_closed; base ended:
-- base_terminated) gets its order_closed refunds from the caller; the owner
-- is told once (8D/6).
create function private.notify_addon_order_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.addon_of_order_id is not null and old.status = 'awaiting_payment' and new.status = 'cancelled'
     and new.cancel_reason in ('addon_base_closed', 'base_terminated') and new.paid_kurus > 0 then
    perform private.enqueue_billing_notification('addon_order_closed', new.org_id, new.customer_user_id, new.id,
      new.number, '/portal/siparis/' || new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.notify_addon_order_closed() from public;

create trigger service_order_addon_closed_notice after update of status on public.service_order
for each row execute function private.notify_addon_order_closed();

revoke all on function private.remaining_visit_windows(date, date) from public;
revoke all on function private.parcel_last_inventory_on(uuid) from public;
revoke all on function private.addon_lines(uuid, uuid[], date, jsonb) from public;
revoke all on function private.addon_breakdown(uuid, uuid, jsonb, date, date, date, smallint, integer, date) from public;
revoke all on function public.contract_visit_windows() from public, anon, authenticated;
grant execute on function public.contract_visit_windows() to anon, authenticated, service_role;
revoke all on function public.customer_addon_preview(numeric[]) from public, anon, authenticated;
grant execute on function public.customer_addon_preview(numeric[]) to authenticated;
revoke all on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer, jsonb) to authenticated;
revoke all on function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text, jsonb)
  to authenticated;
