-- IP12-A2 / 3: pricing (docs/musteri-yonetimi.md §6.6, §6.9).
--
-- 1. private.price_lines(): the only implementation of formula pricing-v1.
--    Per area: billable tenths of a dönüm (rounded up), visit amount, minimum
--    fee, inventory fee in the first year, discount, VAT. Numeric rounding is
--    half up (round on positive numerics).
-- 2. public_package_prices(), price_preview(): anon and authenticated; only the
--    sign-up org's active packages and published prices.
-- 3. ops_preview_quote(): the lines a quote of an application would get
--    (verified areas, the declared one while a garden is not verified).

-- The published list in force on p_on: the highest version with valid_from <= p_on.
create function private.current_price_list(p_org_id uuid, p_on date)
returns public.price_list
language sql
stable
security definer
set search_path = ''
as $$
  select l.* from public.price_list l
  where l.org_id = p_org_id and l.status = 'published' and l.valid_from <= p_on
  order by l.version desc
  limit 1;
$$;

-- One line per area (m², in the order given). Errors: invalid_input (areas,
-- discount_bp), no_price_list, package_not_priced.
create function private.price_lines(
  p_org_id uuid,
  p_package_id uuid,
  p_areas_m2 numeric[],
  p_first_year boolean,
  p_discount_bp integer default 0,
  p_on date default null
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
  v_visits smallint;
  v_area numeric;
  v_n integer := 0;
begin
  if p_areas_m2 is null or cardinality(p_areas_m2) = 0 or cardinality(p_areas_m2) > 10
     or exists (select 1 from unnest(p_areas_m2) a where a is null or a <= 0 or a > 10000000) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'areas';
  end if;
  if p_discount_bp is null or p_discount_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'discount_bp';
  end if;
  l := private.current_price_list(p_org_id, coalesce(p_on, (now() at time zone 'Europe/Istanbul')::date));
  if l.id is null then
    raise exception 'no_price_list' using errcode = 'P0001';
  end if;
  select p.periodic_visits_per_year into v_visits
  from public.service_package p where p.id = p_package_id and p.org_id = p_org_id;
  select * into i from public.price_list_item x where x.price_list_id = l.id and x.package_id = p_package_id;
  if v_visits is null or i.id is null then
    raise exception 'package_not_priced' using errcode = 'P0001';
  end if;

  foreach v_area in array p_areas_m2 loop
    v_n := v_n + 1;
    line_no := v_n;
    area_m2 := round(v_area, 2);
    billable_area_tenths := ceil(round(v_area, 2) / 100);
    visits := v_visits;
    unit_price_kurus := i.unit_price_kurus;
    minimum_fee_kurus := i.minimum_fee_kurus;
    inventory_fee_kurus := case when p_first_year then i.inventory_fee_kurus else 0 end;
    visit_amount_kurus := round(v_visits::numeric * billable_area_tenths * i.unit_price_kurus / 10);
    line_base_kurus := greatest(visit_amount_kurus, i.minimum_fee_kurus) + inventory_fee_kurus;
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
comment on function private.price_lines(uuid, uuid, numeric[], boolean, integer, date) is
  'Formula pricing-v1: one priced line per area with the published list in force (the only implementation).';

-- Active packages of the sign-up org with the prices of the list in force.
create function public.public_package_prices()
returns table (
  package_id uuid,
  code text,
  name text,
  description text,
  periodic_visits_per_year smallint,
  includes_inventory boolean,
  price_list_version integer,
  valid_from date,
  currency text,
  vat_rate_bp integer,
  unit_price_kurus bigint,
  minimum_fee_kurus bigint,
  inventory_fee_kurus bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.code, p.name, p.description, p.periodic_visits_per_year, p.includes_inventory,
         l.version, l.valid_from, l.currency, l.vat_rate_bp, i.unit_price_kurus, i.minimum_fee_kurus,
         i.inventory_fee_kurus
  from (select private.signup_org_id() as org_id) o
  cross join lateral private.current_price_list(o.org_id, (now() at time zone 'Europe/Istanbul')::date) l
  join public.service_package p on p.org_id = o.org_id and p.active
  join public.price_list_item i on i.price_list_id = l.id and i.package_id = p.id
  where o.org_id is not null and l.id is not null
  order by p.sort_order, p.code;
$$;
comment on function public.public_package_prices() is
  'Public: active packages of the org taking sign-ups with the published prices in force.';

-- A non-binding price of the given areas (m²) for a package of the sign-up
-- org. Errors: invalid_input (areas), not_found (package), package_not_priced.
create function public.price_preview(
  p_package_id uuid,
  p_areas_m2 numeric[],
  p_first_year boolean default true
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
  v_org uuid := private.signup_org_id();
begin
  if p_package_id is null or v_org is null or not exists (
    select 1 from public.service_package p where p.id = p_package_id and p.org_id = v_org and p.active
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  begin
    return query select * from private.price_lines(v_org, p_package_id, p_areas_m2, coalesce(p_first_year, true), 0);
  exception
    when raise_exception then
      if sqlerrm = 'no_price_list' then
        raise exception 'package_not_priced' using errcode = 'P0001';
      end if;
      raise;
  end;
end;
$$;
comment on function public.price_preview(uuid, numeric[], boolean) is
  'Public: a non-binding price preview of areas for a package of the org taking sign-ups.';

-- The area a quote line takes for an application garden: verified, or the
-- declared one (estimated) while it is not verified.
create function public.ops_preview_quote(p_application_id uuid, p_discount_bp integer default 0)
returns table (
  line_no integer,
  application_garden_id uuid,
  garden_name text,
  area_m2 numeric,
  area_source text,
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
  vat_rate_bp integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_ids uuid[];
  v_names text[];
  v_areas numeric[];
  v_sources text[];
begin
  select * into a from public.service_application where id = p_application_id;
  if not found or a.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(a.org_id);
  if a.package_id is null then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'package_id';
  end if;
  select array_agg(g.id order by g.sort_order, g.created_at, g.id),
         array_agg(g.name order by g.sort_order, g.created_at, g.id),
         array_agg(coalesce(g.verified_area_m2, g.declared_area_m2) order by g.sort_order, g.created_at, g.id),
         array_agg(case when g.verified_at is not null then 'verified' else 'estimated' end
                   order by g.sort_order, g.created_at, g.id)
  into v_ids, v_names, v_areas, v_sources
  from public.application_garden g where g.application_id = a.id;
  if v_ids is null then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  return query
  select l.line_no, v_ids[l.line_no], v_names[l.line_no], l.area_m2, v_sources[l.line_no], l.billable_area_tenths,
         l.visits, l.unit_price_kurus, l.minimum_fee_kurus, l.inventory_fee_kurus, l.visit_amount_kurus,
         l.line_base_kurus, l.line_discount_kurus, l.line_subtotal_kurus, l.line_vat_kurus, l.line_total_kurus,
         l.price_list_id, l.price_list_version, l.vat_rate_bp
  from private.price_lines(a.org_id, a.package_id, v_areas, true, coalesce(p_discount_bp, 0)) l;
end;
$$;
comment on function public.ops_preview_quote(uuid, integer) is
  'Ops: the quote lines of an application (verified areas; declared while unverified) with an optional discount.';

revoke all on function private.current_price_list(uuid, date) from public;
revoke all on function private.price_lines(uuid, uuid, numeric[], boolean, integer, date) from public;
revoke all on function public.public_package_prices() from public, anon, authenticated;
revoke all on function public.price_preview(uuid, numeric[], boolean) from public, anon, authenticated;
revoke all on function public.ops_preview_quote(uuid, integer) from public, anon, authenticated;
grant execute on function public.public_package_prices() to anon, authenticated;
grant execute on function public.price_preview(uuid, numeric[], boolean) to anon, authenticated;
grant execute on function public.ops_preview_quote(uuid, integer) to authenticated;
