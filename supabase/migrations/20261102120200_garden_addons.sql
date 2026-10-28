-- IP14 / 3: membership period, add-on gardens and coverage
-- (docs/bahce-yonetimi.md §4, §6, §9.6).
--
-- 1. Helpers: settings with defaults, pricing-v2 (private.price_lines_v2;
--    private.price_lines now takes up to 50 areas), coverage of a parcel
--    (served on a day, in service over a window, account garden count),
--    period helpers (add-on base order, last add-on day, withdrawal period,
--    renewal due), billed visits.
-- 2. Reads: my_service_period, my_gardens, parcel_service_status,
--    customer_addon_preview; ops_customer_service_period,
--    ops_customer_gardens, ops_garden_overlaps.
-- 3. Add-on quotes: ops_preview_addon_quote, ops_issue_addon_quote (an
--    application or existing parcels), private.write_addon_quote.
-- 4. Application gardens: ops_link_application_garden_parcel,
--    customer_withdraw_application_garden, ops_withdraw_application_garden,
--    customer_revise_order.
-- 5. Replaced with the same signature (copied from their latest body on main
--    and changed only as docs/bahce-yonetimi.md §9.6 lists): ops_preview_quote,
--    ops_issue_quote, ops_verify_application_garden, ops_issue_parcel_quote,
--    customer_accept_quote, payment_begin (20261101100000),
--    ops_record_manual_payment, ops_extend_payment_due, activate_order;
--    ops_orders dropped and created with addon_of_order_id.
--
-- Lock order: application → quote → customer_gardens:<user> (advisory) →
-- parcel_coverage:<parcel> (advisory, parcel id order) → order(s) (id order)
-- → garden_removal → payment(s) → refund.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- The org's billing settings, or the defaults while none are saved.
create function private.billing_setting(p_org_id uuid)
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
  end if;
  return r;
end;
$$;
comment on function private.billing_setting(uuid) is 'Billing settings of an org, with the defaults while none are saved.';

-- Visits of an add-on garden: the yearly visits in proportion to the days
-- left of the period, half up, at least one (pricing-v2).
create function private.addon_visits(p_visits_per_year smallint, p_start date, p_period_start date, p_period_end date)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select least(
    p_visits_per_year,
    greatest(1, round(p_visits_per_year::numeric * (p_period_end - greatest(p_start, p_period_start) + 1)
                      / (p_period_end - p_period_start + 1)))
  )::smallint;
$$;
comment on function private.addon_visits(smallint, date, date, date) is
  'pricing-v2: visits of an add-on line, V × days left / period days, half up, between 1 and V.';

-- As in 20261030105200_pricing.sql; the area cap is 50 (was 10).
create or replace function private.price_lines(
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
  if p_areas_m2 is null or cardinality(p_areas_m2) = 0 or cardinality(p_areas_m2) > 50
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

-- Formula pricing-v2 (docs/bahce-yonetimi.md §6): p_visits visits a line
-- (1..V), the minimum fee in the same proportion, the inventory fee on the
-- lines flagged in p_inventory. With p_visits = V and every flag equal to
-- first_year it equals pricing-v1. Errors: invalid_input (areas, inventory,
-- visits, discount_bp), no_price_list, package_not_priced.
create function private.price_lines_v2(
  p_org_id uuid,
  p_package_id uuid,
  p_areas_m2 numeric[],
  p_inventory boolean[],
  p_visits smallint,
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
comment on function private.price_lines_v2(uuid, uuid, numeric[], boolean[], smallint, integer, date) is
  'Formula pricing-v2: add-on lines with prorated visits and minimum fee, inventory fee per line (the only implementation).';

-- A line of an active order serves the parcel on the day: inside the
-- order's period and not removed by then.
create function private.parcel_served_on(p_parcel_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    where oi.parcel_id = p_parcel_id and o.status = 'active'
      and o.service_start <= p_day and p_day <= o.service_end
      and (oi.removed_on is null or oi.removed_on > p_day)
  );
$$;
comment on function private.parcel_served_on(uuid, date) is 'A line of an active order serves the parcel on the day.';

-- Lines that cover (or will cover) a parcel, with their days:
--   active orders: [service_start, removed_on - 1 or service_end];
--   orders awaiting payment (parcel from the quote line or a linked
--   application garden; null for a new garden): the intended period, an
--   add-on [max(quote start, today), base end], otherwise [quote start or
--   today, + 1 year - 1 day].
create function private.coverage_lines(p_parcel_id uuid, p_org_id uuid default null, p_user_id uuid default null)
returns table (
  order_id uuid,
  order_status public.order_status,
  customer_user_id uuid,
  parcel_id uuid,
  from_day date,
  to_day date
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.status, o.customer_user_id, oi.parcel_id, o.service_start, coalesce(oi.removed_on - 1, o.service_end)
  from public.service_order o
  join public.service_order_item oi on oi.order_id = o.id
  where o.status = 'active' and oi.parcel_id is not null
    and coalesce(oi.removed_on - 1, o.service_end) >= o.service_start
    and (p_parcel_id is null or oi.parcel_id = p_parcel_id)
    and (p_org_id is null or o.org_id = p_org_id)
    and (p_user_id is null or o.customer_user_id = p_user_id)
  union all
  select o.id, o.status, o.customer_user_id, coalesce(qi.parcel_id, g.parcel_id), w.from_day,
         case when o.addon_of_order_id is not null then b.service_end
              else (w.from_day + interval '1 year' - interval '1 day')::date end
  from public.service_order o
  join public.quote q on q.id = o.quote_id
  join public.service_order_item oi on oi.order_id = o.id
  join public.quote_item qi on qi.id = oi.quote_item_id
  left join public.application_garden g on g.id = qi.application_garden_id
  left join public.service_order b on b.id = o.addon_of_order_id
  cross join lateral (
    select case when o.addon_of_order_id is not null
             then greatest(coalesce(q.proposed_service_start, private.istanbul_today()), private.istanbul_today())
             else coalesce(q.proposed_service_start, private.istanbul_today()) end as from_day
  ) w
  where o.status = 'awaiting_payment'
    and (p_parcel_id is null or coalesce(qi.parcel_id, g.parcel_id) = p_parcel_id)
    and (p_org_id is null or o.org_id = p_org_id)
    and (p_user_id is null or o.customer_user_id = p_user_id);
$$;

-- The parcel is covered by a line of another order in [p_from, p_to]: an
-- active line or the intended period of an order awaiting payment.
create function private.parcel_in_service(p_parcel_id uuid, p_from date, p_to date, p_exclude_order_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_parcel_id is not null and exists (
    select 1 from private.coverage_lines(p_parcel_id) c
    where c.from_day <= p_to and c.to_day >= p_from
      and c.order_id is distinct from p_exclude_order_id
  );
$$;
comment on function private.parcel_in_service(uuid, date, date, uuid) is
  'The parcel is on an active line or an order awaiting payment whose period overlaps the window (no double coverage).';

-- parcel_coverage:<parcel> advisory locks, in parcel id order.
create function private.lock_parcel_coverage(p_parcel_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  for v in select distinct x from unnest(p_parcel_ids) x where x is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('parcel_coverage:' || v::text, 0));
  end loop;
end;
$$;

-- customer_gardens:<user> advisory lock (the account garden limit).
create function private.lock_customer_gardens(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('customer_gardens:' || p_user_id::text, 0));
$$;

-- Gardens of an account in a window: distinct parcels on active lines or on
-- orders awaiting payment, plus the new (unlinked) gardens of orders awaiting
-- payment.
create function private.account_garden_count(p_org_id uuid, p_user_id uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select count(distinct c.parcel_id)
    from private.coverage_lines(null, p_org_id, p_user_id) c
    where c.parcel_id is not null and c.from_day <= p_to and c.to_day >= p_from
  )::integer + (
    select count(*)
    from private.coverage_lines(null, p_org_id, p_user_id) c
    where c.parcel_id is null and c.order_status = 'awaiting_payment'
  )::integer;
$$;

-- Parcels of an order's lines (activated, quoted or linked) and of a quote.
create function private.order_line_parcels(p_order_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.id) filter (where x.id is not null), '{}')
  from (
    select coalesce(oi.parcel_id, qi.parcel_id, g.parcel_id) as id
    from public.service_order_item oi
    join public.quote_item qi on qi.id = oi.quote_item_id
    left join public.application_garden g on g.id = qi.application_garden_id
    where oi.order_id = p_order_id
  ) x;
$$;

create function private.quote_line_parcels(p_quote_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.id) filter (where x.id is not null), '{}')
  from (
    select coalesce(qi.parcel_id, g.parcel_id) as id
    from public.quote_item qi
    left join public.application_garden g on g.id = qi.application_garden_id
    where qi.quote_id = p_quote_id
  ) x;
$$;

-- An open (requested or scheduled) removal of one of the parcels for the customer.
create function private.has_open_removal(p_parcel_ids uuid[], p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.garden_removal r
    where r.parcel_id = any (p_parcel_ids) and r.customer_user_id = p_user_id
      and r.status in ('requested', 'scheduled')
  );
$$;

-- The customer's latest completed removal of the parcel was a transfer: the
-- parcel is never linked or quoted for them again.
create function private.parcel_transferred(p_parcel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.reason = 'transfer' from public.garden_removal r
    where r.parcel_id = p_parcel_id and r.customer_user_id = p_user_id and r.status = 'completed'
    order by r.completed_at desc, r.id desc
    limit 1
  ), false);
$$;

-- Last day an add-on of the base order can be accepted or paid.
create function private.addon_last_day(o public.service_order)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select o.service_end - (private.billing_setting(o.org_id)).addon_min_days + 1;
$$;
comment on function private.addon_last_day(public.service_order) is
  'service_end - addon_min_days + 1: the last day an add-on of the base order is accepted or paid.';

-- Last day of the withdrawal period of an order (activation day + 14).
create function private.withdrawal_until(o public.service_order)
returns date
language sql
stable
set search_path = ''
as $$
  select (o.activated_at at time zone 'Europe/Istanbul')::date + 14;
$$;
comment on function private.withdrawal_until(public.service_order) is
  'Last day (inclusive) of the withdrawal period: the Istanbul day of activation + 14.';

-- The base order an add-on joins (§4.4): among active base orders with at
-- least addon_min_days left, the one whose service can start first, then the
-- latest end, then the id.
create function private.addon_base_order(p_org_id uuid, p_user_id uuid)
returns public.service_order
language sql
stable
security definer
set search_path = ''
as $$
  select o.* from public.service_order o
  where o.org_id = p_org_id and o.customer_user_id = p_user_id and o.status = 'active'
    and o.addon_of_order_id is null and o.service_end is not null
    and o.service_end - greatest(private.istanbul_today(), o.service_start) + 1
        >= (private.billing_setting(p_org_id)).addon_min_days
  order by greatest(private.istanbul_today(), o.service_start), o.service_end desc, o.id
  limit 1;
$$;
comment on function private.addon_base_order(uuid, uuid) is
  'The base order an add-on of the customer joins (§4.4), or null.';

-- The base order of an add-on is still open for it: active and today is not
-- after its last add-on day.
create function private.addon_base_open(p_base_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.status = 'active' and private.istanbul_today() <= private.addon_last_day(o)
    from public.service_order o where o.id = p_base_order_id
  ), false);
$$;

-- A base order due for renewal: active, ending within the notice, no renewal
-- order, and at least one parcel it (or an active add-on) serves on its last
-- day that has no open removal and is not covered the day after.
create function private.renewal_due(o public.service_order, p_notice integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select o.status = 'active' and o.addon_of_order_id is null
    and o.service_end < private.istanbul_today() + p_notice
    and not exists (
      select 1 from public.service_order n
      where n.renewal_of_order_id = o.id and n.status in ('awaiting_payment', 'active', 'completed'))
    and exists (
      select 1 from public.service_order_item oi
      join public.service_order x on x.id = oi.order_id
      where (x.id = o.id or (x.addon_of_order_id = o.id and x.status = 'active'))
        and oi.parcel_id is not null
        and x.service_start <= o.service_end and o.service_end <= x.service_end
        and (oi.removed_on is null or oi.removed_on > o.service_end)
        and not private.has_open_removal(array[oi.parcel_id], o.customer_user_id)
        and not private.parcel_in_service(oi.parcel_id, o.service_end + 1, o.service_end + 1));
$$;
comment on function private.renewal_due(public.service_order, integer) is
  'A base order to renew: ending within the notice, not renewed, with a garden that stays and is not covered afterwards.';

-- Billed visits of a parcel between two days (§7.1): distinct Istanbul days
-- of captured (or later) periodic scans that no extra_visit request targets;
-- the excluded ones; whether an inventory visit was captured.
create function private.billed_visits(p_parcel_id uuid, p_from date, p_to date)
returns table (used integer, excluded integer, inventory_done boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select s.id, s.kind,
           coalesce((s.started_at at time zone 'Europe/Istanbul')::date, s.planned_date) as day,
           exists (
             select 1 from public.followup_request f
             where f.target_session_id = s.id and f.kind = 'extra_visit' and f.status in ('planned', 'done')
           ) as extra
    from public.session s
    where s.parcel_id = p_parcel_id and s.kind in ('periodic_scan', 'inventory')
      and s.status in ('captured', 'processed', 'in_review', 'published')
  )
  select
    (select count(distinct v.day) from v
     where v.kind = 'periodic_scan' and not v.extra and v.day between p_from and p_to)::integer,
    (select count(*) from v
     where v.kind = 'periodic_scan' and v.extra and v.day between p_from and p_to)::integer,
    exists (select 1 from v where v.kind = 'inventory' and v.day between p_from and p_to);
$$;
comment on function private.billed_visits(uuid, date, date) is
  'Billed visits of a parcel in a range (distinct days, extra_visit targets excluded) and whether an inventory was captured.';

-- A published inventory visit exists: an add-on line of the parcel carries
-- no inventory fee.
create function private.parcel_has_inventory(p_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_parcel_id is not null and exists (
    select 1 from public.session s
    where s.parcel_id = p_parcel_id and s.kind = 'inventory' and s.status = 'published'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Reads
-- ---------------------------------------------------------------------------

-- Current periods of a customer (§4.4): one row per active base order that
-- has not ended, a paid renewal folded into the row it renews.
create function private.service_periods(p_org_id uuid, p_user_id uuid)
returns table (
  org_id uuid,
  base_order_id uuid,
  base_order_number text,
  package_id uuid,
  package_name text,
  periodic_visits_per_year smallint,
  period_start date,
  period_end date,
  next_base_order_id uuid,
  next_period_start date,
  next_period_end date,
  renewal_quote_id uuid,
  addon_base_order_id uuid,
  addon_until date,
  garden_count integer,
  garden_changes_enabled boolean,
  is_primary boolean,
  period_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select o.id, o.number, o.quote_id, o.service_start, o.service_end, o.renewal_of_order_id
    from public.service_order o
    where o.org_id = p_org_id and o.customer_user_id = p_user_id and o.status = 'active'
      and o.addon_of_order_id is null and o.service_end >= private.istanbul_today()
  ),
  periods as (
    select c.*, n.id as next_id, n.service_start as next_start, n.service_end as next_end
    from cur c
    left join lateral (
      select y.id, y.service_start, y.service_end from cur y
      where y.renewal_of_order_id = c.id order by y.service_start, y.id limit 1
    ) n on true
    where c.renewal_of_order_id is null or c.renewal_of_order_id not in (select z.id from cur z)
  ),
  ab as (
    select a.id, private.addon_last_day(a) as last_day
    from private.addon_base_order(p_org_id, p_user_id) a
    where a.id is not null
  ),
  prim as (
    select coalesce(
      (select p.id from periods p join ab on ab.id in (p.id, p.next_id) order by p.service_end, p.id limit 1),
      (select p.id from periods p order by p.service_end desc, p.id limit 1)
    ) as id
  )
  select p_org_id, p.id, p.number, q.package_id, q.package_name, q.periodic_visits_per_year,
         p.service_start, p.service_end, p.next_id, p.next_start, p.next_end,
         (select rq.id from public.quote rq
          where rq.renewal_of_order_id = p.id and rq.status = 'issued' order by rq.issued_at desc limit 1),
         (select ab.id from ab), (select ab.last_day from ab),
         (select count(distinct oi.parcel_id)::integer
          from public.service_order_item oi
          join public.service_order x on x.id = oi.order_id
          where (x.id = p.id or x.addon_of_order_id = p.id) and x.status = 'active' and oi.parcel_id is not null
            and x.service_start <= private.istanbul_today() and private.istanbul_today() <= x.service_end
            and (oi.removed_on is null or oi.removed_on > private.istanbul_today())),
         (private.billing_setting(p_org_id)).garden_changes_enabled,
         p.id = (select prim.id from prim),
         (select count(*)::integer from periods)
  from periods p
  join public.quote q on q.id = p.quote_id
  order by p.service_end, p.id;
$$;

-- One row per parcel of the customer (§9.6 my_gardens): the line serving
-- today, else the earliest paid future line, else the latest line closed by
-- a removal whose access is still open.
create function private.customer_gardens(p_org_id uuid, p_user_id uuid)
returns table (
  order_item_id uuid,
  order_id uuid,
  order_number text,
  base_order_id uuid,
  is_addon boolean,
  order_status public.order_status,
  parcel_id uuid,
  garden_name text,
  parcel_status public.parcel_status,
  state text,
  service_start date,
  service_end date,
  removed_on date,
  visits_entitled smallint,
  visits_used integer,
  withdrawal_until date,
  in_next_period boolean,
  next_order_item_id uuid,
  removal_id uuid,
  removal_number text,
  removal_status public.garden_removal_status,
  removal_effective_on date,
  access_until date
)
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select oi.id as item_id, oi.order_id, oi.line_no, oi.parcel_id, oi.removed_on, oi.quote_item_id, oi.garden_removal_id,
           o.number, o.status, o.addon_of_order_id, o.service_start, o.service_end,
           case
             when o.status = 'active' and o.service_start <= private.istanbul_today()
                  and private.istanbul_today() <= o.service_end
                  and (oi.removed_on is null or oi.removed_on > private.istanbul_today()) then 1
             when o.status = 'active' and o.service_start > private.istanbul_today() and oi.removed_on is null then 2
             when oi.removed_on is not null and exists (
                    select 1 from public.garden_removal gr
                    where gr.id = oi.garden_removal_id and gr.status = 'completed'
                      and gr.access_until >= private.istanbul_today() and gr.access_revoked_at is null) then 3
           end as prio
    from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    where o.org_id = p_org_id and o.customer_user_id = p_user_id and oi.parcel_id is not null
  ),
  pick as (
    select distinct on (l.parcel_id) l.*
    from lines l
    where l.prio is not null
    order by l.parcel_id, l.prio, case when l.prio < 3 then l.service_start end, l.service_start desc, l.line_no
  )
  select k.item_id, k.order_id, k.number, coalesce(k.addon_of_order_id, k.order_id), k.addon_of_order_id is not null,
         k.status, k.parcel_id, pa.name, pa.status,
         case
           when k.prio = 3 then 'removed'
           when rm.status in ('requested', 'scheduled') then 'leaving'
           when k.prio = 1 then 'in_service'
           else 'upcoming'
         end,
         k.service_start, k.service_end, k.removed_on, qi.visits,
         least(qi.visits::integer, bv.used),
         (select private.withdrawal_until(o2) from public.service_order o2 where o2.id = k.order_id),
         case when exists (
           select 1 from public.service_order rn
           where rn.renewal_of_order_id = coalesce(k.addon_of_order_id, k.order_id) and rn.status = 'active'
         ) then nx.id is not null end,
         nx.id,
         rm.id, rm.number, rm.status, coalesce(rm.effective_on, rm.requested_effective_on), rm.access_until
  from pick k
  join public.parcel pa on pa.id = k.parcel_id
  join public.quote_item qi on qi.id = k.quote_item_id
  cross join lateral private.billed_visits(k.parcel_id, k.service_start, coalesce(k.removed_on - 1, k.service_end)) bv
  left join lateral (
    select oi2.id from public.service_order_item oi2
    join public.service_order o2 on o2.id = oi2.order_id
    where oi2.parcel_id = k.parcel_id and o2.customer_user_id = p_user_id and o2.status = 'active'
      and o2.service_start > k.service_start and oi2.removed_on is null
    order by o2.service_start, oi2.id
    limit 1
  ) nx on true
  left join lateral (
    select gr.* from public.garden_removal gr
    where gr.parcel_id = k.parcel_id and gr.customer_user_id = p_user_id
    order by gr.id is not distinct from k.garden_removal_id desc, gr.status in ('requested', 'scheduled') desc,
             gr.requested_at desc, gr.id desc
    limit 1
  ) rm on true
  order by k.service_start, k.line_no, k.item_id;
$$;

-- The caller's periods (empty for anyone without an active base order, a
-- viewer or a demo visitor).
create function public.my_service_period()
returns table (
  org_id uuid,
  base_order_id uuid,
  base_order_number text,
  package_id uuid,
  package_name text,
  periodic_visits_per_year smallint,
  period_start date,
  period_end date,
  next_base_order_id uuid,
  next_period_start date,
  next_period_end date,
  renewal_quote_id uuid,
  addon_base_order_id uuid,
  addon_until date,
  garden_count integer,
  garden_changes_enabled boolean,
  is_primary boolean,
  period_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from private.service_periods(private.customer_org_id((select auth.uid())), (select auth.uid())) p
  where (select auth.uid()) is not null;
$$;
comment on function public.my_service_period() is
  'Customer: the current membership period(s): base order, package, end, paid renewal, add-on base and garden count.';

create function public.my_gardens()
returns table (
  order_item_id uuid,
  order_id uuid,
  order_number text,
  base_order_id uuid,
  is_addon boolean,
  order_status public.order_status,
  parcel_id uuid,
  garden_name text,
  parcel_status public.parcel_status,
  state text,
  service_start date,
  service_end date,
  removed_on date,
  visits_entitled smallint,
  visits_used integer,
  withdrawal_until date,
  in_next_period boolean,
  next_order_item_id uuid,
  removal_id uuid,
  removal_number text,
  removal_status public.garden_removal_status,
  removal_effective_on date,
  access_until date
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from private.customer_gardens(private.customer_org_id((select auth.uid())), (select auth.uid())) g
  where (select auth.uid()) is not null;
$$;
comment on function public.my_gardens() is
  'Customer: one row per garden (in service, upcoming, leaving or removed with access open) with visits and removal.';

-- The customer, checked for ops: ops of the org and not the caller.
create function private.require_ops_customer(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_user_id is null or p_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create function public.ops_customer_service_period(p_org_id uuid, p_user_id uuid)
returns table (
  org_id uuid,
  base_order_id uuid,
  base_order_number text,
  package_id uuid,
  package_name text,
  periodic_visits_per_year smallint,
  period_start date,
  period_end date,
  next_base_order_id uuid,
  next_period_start date,
  next_period_end date,
  renewal_quote_id uuid,
  addon_base_order_id uuid,
  addon_until date,
  garden_count integer,
  garden_changes_enabled boolean,
  is_primary boolean,
  period_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops_customer(p_org_id, p_user_id);
  return query select * from private.service_periods(p_org_id, p_user_id);
end;
$$;
comment on function public.ops_customer_service_period(uuid, uuid) is
  'Ops: the membership period(s) of a customer (columns of my_service_period).';

create function public.ops_customer_gardens(p_org_id uuid, p_user_id uuid)
returns table (
  order_item_id uuid,
  order_id uuid,
  order_number text,
  base_order_id uuid,
  is_addon boolean,
  order_status public.order_status,
  parcel_id uuid,
  garden_name text,
  parcel_status public.parcel_status,
  state text,
  service_start date,
  service_end date,
  removed_on date,
  visits_entitled smallint,
  visits_used integer,
  withdrawal_until date,
  in_next_period boolean,
  next_order_item_id uuid,
  removal_id uuid,
  removal_number text,
  removal_status public.garden_removal_status,
  removal_effective_on date,
  access_until date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops_customer(p_org_id, p_user_id);
  return query select * from private.customer_gardens(p_org_id, p_user_id);
end;
$$;
comment on function public.ops_customer_gardens(uuid, uuid) is 'Ops: the gardens of a customer (columns of my_gardens).';

-- The service state of a parcel, for anyone with access to it (owner,
-- viewer) and ops of its org; no billing data. none: no line serves it and
-- no removal keeps its access window open (pilot parcel, ended period, demo).
create function public.parcel_service_status(p_parcel_id uuid)
returns table (status text, leaving_on date, removed_on date, access_until date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  r public.garden_removal;
  v_today date := private.istanbul_today();
begin
  select * into p from public.parcel x where x.id = p_parcel_id;
  if not found
     or not (p.id in (select authz.user_parcel_ids()) or p.org_id in (select authz.user_org_ids('{ops}'))) then
    return;
  end if;
  if private.is_demo_org(p.org_id) then
    return query select 'none'::text, null::date, null::date, null::date;
    return;
  end if;
  if private.parcel_served_on(p.id, v_today) then
    select * into r from public.garden_removal x
    where x.parcel_id = p.id and x.status in ('requested', 'scheduled')
    order by coalesce(x.effective_on, x.requested_effective_on), x.id
    limit 1;
    if found then
      return query select 'leaving'::text, coalesce(r.effective_on, r.requested_effective_on), null::date, null::date;
    else
      return query select 'in_service'::text, null::date, null::date, null::date;
    end if;
    return;
  end if;
  select * into r from public.garden_removal x
  where x.parcel_id = p.id and x.status = 'completed'
  order by x.completed_at desc, x.id desc
  limit 1;
  if found and r.access_revoked_at is null and r.access_until >= v_today then
    return query select 'removed'::text, null::date, r.effective_on, r.access_until;
  else
    return query select 'none'::text, null::date, null::date, null::date;
  end if;
end;
$$;
comment on function public.parcel_service_status(uuid) is
  'Owner, viewer or ops: in_service, leaving (with the day), removed (with the access end) or none; no billing data.';

-- A non-binding add-on price of new gardens for the caller's membership:
-- the base order of private.addon_base_order, start today (or the period
-- start), inventory on every line, no discount. Errors: not_customer,
-- no_membership, addon_period_too_short, invalid_input (areas),
-- no_price_list, package_not_priced.
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
    v_visits, 0) l;
end;
$$;
comment on function public.customer_addon_preview(numeric[]) is
  'Customer: a non-binding add-on price of new gardens (pricing-v2) for the current membership.';

-- Parcels of the org near an application garden (§4.1): the latest boundary
-- contains its position or meets its rough boundary, or the parcel's
-- position is within 200 m. same_customer: the applicant owns the parcel or
-- had an order line on it.
create function public.ops_garden_overlaps(p_garden_id uuid)
returns table (
  parcel_id uuid,
  parcel_name text,
  parcel_status public.parcel_status,
  same_customer boolean,
  in_service boolean,
  inside_boundary boolean,
  distance_m numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  g public.application_garden;
begin
  select * into g from public.application_garden x where x.id = p_garden_id;
  if not found or g.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(g.org_id);
  return query
  select p.id, p.name, p.status,
         exists (select 1 from public.parcel_access pa
                 where pa.parcel_id = p.id and pa.user_id = g.customer_user_id and pa.role = 'owner')
           or exists (select 1 from public.service_order_item oi
                      where oi.parcel_id = p.id and oi.customer_user_id = g.customer_user_id),
         private.parcel_served_on(p.id, private.istanbul_today()),
         coalesce(extensions.st_covers(b.geom, g.position), false),
         case when p.position is not null then
           round(extensions.st_distance(p.position::extensions.geography, g.position::extensions.geography)::numeric, 1)
         end
  from public.parcel p
  left join lateral (
    select bb.geom from public.boundary bb where bb.parcel_id = p.id order by bb.version desc limit 1
  ) b on true
  where p.org_id = g.org_id
    and (coalesce(extensions.st_covers(b.geom, g.position), false)
         or (g.boundary is not null and coalesce(extensions.st_intersects(b.geom, g.boundary), false))
         or (p.position is not null
             and extensions.st_dwithin(p.position::extensions.geography, g.position::extensions.geography, 200)))
  order by 7 nulls last, p.name, p.id;
end;
$$;
comment on function public.ops_garden_overlaps(uuid) is
  'Ops: parcels whose boundary contains or meets an application garden, or within 200 m (duplicate check).';

-- ---------------------------------------------------------------------------
-- 3. Add-on quotes
-- ---------------------------------------------------------------------------

-- The lines of an add-on quote as json ([{application_garden_id |
-- parcel_id, garden_name, area_m2, area_source, inventory}], in line order):
-- the application's gardens that are not withdrawn (verified area, the
-- declared one while unverified), or the given parcels (latest boundary or
-- estimate). Inventory: a new garden, or a parcel without a published inventory.
create function private.addon_lines(p_application_id uuid, p_parcel_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_application_id is not null then (
    select jsonb_agg(jsonb_build_object(
             'application_garden_id', g.id, 'garden_name', g.name,
             'area_m2', coalesce(g.verified_area_m2, g.declared_area_m2),
             'area_source', case when g.verified_at is not null then 'verified' else 'estimated' end,
             'inventory', not private.parcel_has_inventory(g.parcel_id))
           order by g.sort_order, g.created_at, g.id)
    from public.application_garden g
    where g.application_id = p_application_id and g.withdrawn_at is null
  ) else (
    select jsonb_agg(jsonb_build_object(
             'parcel_id', p.id, 'garden_name', p.name,
             'area_m2', coalesce(round(b.area_m2::numeric, 2), p.estimated_area_m2),
             'area_source', case when b.area_m2 is not null then 'boundary' else 'estimated' end,
             'inventory', not private.parcel_has_inventory(p.id))
           order by x.o)
    from unnest(p_parcel_ids) with ordinality x(id, o)
    join public.parcel p on p.id = x.id
    left join lateral (
      select bb.area_m2 from public.boundary bb where bb.parcel_id = p.id order by bb.version desc limit 1
    ) b on true
  ) end;
$$;

-- Start of an add-on: the proposed day (or today), never before today or the period.
create function private.addon_start(b public.service_order, p_proposed date)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest(coalesce(p_proposed, private.istanbul_today()), private.istanbul_today(), b.service_start);
$$;

-- The checked base order of an add-on for ops (read without a lock):
-- invalid_input (base_order_id) unless an active base order of the org.
create function private.addon_base_for_ops(p_base_order_id uuid)
returns public.service_order
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.service_order;
begin
  select * into b from public.service_order o where o.id = p_base_order_id;
  if not found or b.org_id not in (select authz.user_org_ids()) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'base_order_id';
  end if;
  perform private.require_ops_customer(b.org_id, b.customer_user_id);
  if b.addon_of_order_id is not null or b.status <> 'active' or b.service_end is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'base_order_id';
  end if;
  return b;
end;
$$;

-- The parcels of the parcel path: 1–50 distinct parcels of the org that the
-- customer owns, or invalid_input (parcel_ids).
create function private.check_addon_parcels(p_org_id uuid, p_user_id uuid, p_parcel_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_parcel_ids is null or cardinality(p_parcel_ids) not between 1 and 50
     or (select count(distinct x) from unnest(p_parcel_ids) x) <> cardinality(p_parcel_ids)
     or exists (
       select 1 from unnest(p_parcel_ids) x
       where x is null or not exists (
         select 1 from public.parcel p
         join public.parcel_access pa on pa.parcel_id = p.id and pa.user_id = p_user_id and pa.role = 'owner'
         where p.id = x and p.org_id = p_org_id)
     ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'parcel_ids';
  end if;
end;
$$;

-- Writes an add-on quote (pricing-v2) from add-on lines. The price_list lock
-- and one fixed day keep every pricing call on the same list. Returns the
-- quote id; sends quote_ready.
create function private.write_addon_quote(
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
  select array_agg((x ->> 'area_m2')::numeric order by o), array_agg((x ->> 'inventory')::boolean order by o)
  into v_areas, v_inventory
  from jsonb_array_elements(p_lines) with ordinality t(x, o);
  v_visits := private.addon_visits(pkg.periodic_visits_per_year, p_start, b.service_start, b.service_end);

  perform pg_advisory_xact_lock(hashtextextended('price_list:' || p_org_id::text, 0));
  v_on := private.istanbul_today();
  select * into v_first
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, p_discount_bp, v_on) limit 1;
  select sum(l.line_base_kurus), sum(l.line_discount_kurus), sum(l.line_subtotal_kurus), sum(l.line_vat_kurus),
         sum(l.line_total_kurus)
  into v_base, v_discount, v_subtotal, v_vat, v_total
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, p_discount_bp, v_on) l;

  v_number := private.next_document_number(p_org_id, 'T');
  insert into public.quote (
    org_id, customer_user_id, application_id, renewal_of_order_id, addon_of_order_id, number, price_list_id,
    price_list_version, package_id, package_code, package_name, periodic_visits_per_year, includes_inventory,
    first_year, vat_rate_bp, discount_bp, discount_note, base_kurus, discount_kurus, subtotal_kurus, vat_kurus,
    total_kurus, inputs, proposed_service_start, valid_until, note_to_customer, issued_by
  )
  values (
    p_org_id, p_customer_user_id, p_application_id, null, b.id, v_number, v_first.price_list_id,
    v_first.price_list_version, pkg.id, pkg.code, pkg.name, pkg.periodic_visits_per_year, pkg.includes_inventory,
    coalesce((select bool_or(x) from unnest(v_inventory) x), false), v_first.vat_rate_bp, p_discount_bp,
    nullif(btrim(p_discount_note), ''), v_base, v_discount, v_subtotal, v_vat, v_total,
    jsonb_build_object(
      'formula', 'pricing-v2',
      'price_list_id', v_first.price_list_id,
      'version', v_first.price_list_version,
      'valid_from', v_first.valid_from,
      'vat_rate_bp', v_first.vat_rate_bp,
      'package', jsonb_build_object('id', pkg.id, 'code', pkg.code, 'name', pkg.name,
        'periodic_visits_per_year', pkg.periodic_visits_per_year, 'includes_inventory', pkg.includes_inventory),
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
        'visits_per_year', pkg.periodic_visits_per_year,
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
  from private.price_lines_v2(p_org_id, p_package_id, v_areas, v_inventory, v_visits, p_discount_bp, v_on) l;

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

-- The lines an add-on quote would get (unverified gardens with the declared
-- area, estimated). Exactly one of p_application_id and p_parcel_ids.
-- Errors: invalid_input (application_id, base_order_id, parcel_ids, areas,
-- discount_bp), forbidden, application_incomplete (gardens),
-- addon_period_too_short, no_price_list, package_not_priced.
create function public.ops_preview_addon_quote(
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
    v_visits, coalesce(p_discount_bp, 0)) l;
end;
$$;
comment on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer) is
  'Ops: the lines of an add-on quote (pricing-v2) for an application or existing parcels of the base order''s customer.';

-- An add-on quote joining a base order (§4.1 step 5, §4.3). Application
-- path: submitted → quoted, quoted → quoted (the open quote superseded).
-- Parcel path: owned parcels without an application; issued add-on quotes
-- of the base order with one of the parcels are superseded. Errors:
-- invalid_input (application_id, base_order_id, parcel_ids, valid_days,
-- discount_bp, discount_note, note_to_customer, proposed_service_start),
-- forbidden, not_found, garden_changes_closed, application_not_open,
-- application_incomplete (gardens), garden_not_verified, parcel_not_reusable,
-- addon_period_too_short, parcel_in_service (detail parcel_ids),
-- account_garden_limit, no_price_list, package_not_priced, state_changed.
create function public.ops_issue_addon_quote(
  p_base_order_id uuid,
  p_application_id uuid default null,
  p_parcel_ids uuid[] default null,
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
  v_lines := private.addon_lines(a.id, case when a.id is null then v_parcels end);
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
comment on function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text) is
  'Ops: issues an add-on quote (pricing-v2) joining a base order, for an application or owned parcels; sends quote_ready.';

-- ---------------------------------------------------------------------------
-- 4. Application gardens
-- ---------------------------------------------------------------------------

-- Links a garden of a submitted or quoted application to an earlier parcel
-- of the same customer (a re-added garden), or unlinks it (p_parcel_id
-- null). A quoted application goes back to submitted (open quote
-- cancelled). Errors: not_found, forbidden, application_not_open,
-- garden_withdrawn, parcel_not_reusable, parcel_in_service, state_changed.
create function public.ops_link_application_garden_parcel(p_garden_id uuid, p_parcel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  g public.application_garden;
  p public.parcel;
  v_actor uuid := (select auth.uid());
begin
  a := private.lock_application_for_ops(
    (select x.application_id from public.application_garden x where x.id = p_garden_id));
  select * into g from public.application_garden x where x.id = p_garden_id for update;
  if a.status not in ('submitted', 'quoted') then
    raise exception 'application_not_open' using errcode = 'P0001';
  end if;
  if g.withdrawn_at is not null then
    raise exception 'garden_withdrawn' using errcode = 'P0001';
  end if;
  if p_parcel_id is not null then
    select * into p from public.parcel x where x.id = p_parcel_id;
    if not found or p.org_id <> a.org_id then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not (exists (select 1 from public.parcel_access pa
                    where pa.parcel_id = p.id and pa.user_id = a.customer_user_id and pa.role = 'owner')
            or exists (select 1 from public.service_order_item oi
                       where oi.parcel_id = p.id and oi.customer_user_id = a.customer_user_id))
       or private.parcel_transferred(p.id, a.customer_user_id) then
      raise exception 'parcel_not_reusable' using errcode = 'P0001';
    end if;
  end if;
  if a.status = 'quoted' then
    perform private.cancel_open_quote(a, v_actor, 'ops');
  end if;
  if p_parcel_id is not null then
    perform private.lock_parcel_coverage(array[p_parcel_id]);
    if private.parcel_in_service(p_parcel_id, private.istanbul_today(), private.istanbul_today() + 365) then
      raise exception 'parcel_in_service' using errcode = 'P0001';
    end if;
  end if;
  update public.application_garden set parcel_id = p_parcel_id where id = g.id and withdrawn_at is null;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  if a.status = 'quoted' then
    update public.service_application set status = 'submitted' where id = a.id and status = 'quoted';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;
  perform private.audit(a.org_id, v_actor, 'ops', 'application_garden.linked', 'application_garden', g.id,
    jsonb_build_object('application_id', a.id, 'parcel_id', p_parcel_id, 'quote_cancelled', a.status = 'quoted'));
end;
$$;
comment on function public.ops_link_application_garden_parcel(uuid, uuid) is
  'Ops: links an application garden to an earlier parcel of the same customer (or unlinks it); a quoted application returns to review.';

-- Withdraws one garden of a submitted or quoted application (shared by the
-- customer and ops; application locked by the caller). The open quote is
-- cancelled and the application goes back to submitted.
create function private.withdraw_application_garden(
  a public.service_application,
  p_garden_id uuid,
  p_actor uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.application_garden;
begin
  select * into g from public.application_garden x where x.id = p_garden_id and x.application_id = a.id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.status not in ('submitted', 'quoted') then
    raise exception 'application_not_open' using errcode = 'P0001';
  end if;
  if g.withdrawn_at is not null then
    raise exception 'garden_withdrawn' using errcode = 'P0001';
  end if;
  if (select count(*) from public.application_garden x where x.application_id = a.id and x.withdrawn_at is null) <= 1 then
    raise exception 'last_garden' using errcode = 'P0001';
  end if;
  if a.status = 'quoted' then
    perform private.cancel_open_quote(a, p_actor, p_role);
    update public.service_application set status = 'submitted' where id = a.id and status = 'quoted';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;
  update public.application_garden set withdrawn_at = now() where id = g.id and withdrawn_at is null;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(a.org_id, p_actor, p_role, 'application_garden.withdrawn', 'application_garden', g.id,
    jsonb_build_object('application_id', a.id, 'from', a.status, 'quote_cancelled', a.status = 'quoted'));
end;
$$;

-- Errors: demo_read_only, not_found, application_not_open, garden_withdrawn,
-- last_garden, state_changed.
create function public.customer_withdraw_application_garden(p_garden_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
begin
  perform private.assert_not_demo();
  a := private.lock_own_application(
    (select g.application_id from public.application_garden g
     where g.id = p_garden_id and g.customer_user_id = (select auth.uid())));
  perform private.withdraw_application_garden(a, p_garden_id, a.customer_user_id, 'customer');
end;
$$;
comment on function public.customer_withdraw_application_garden(uuid) is
  'Customer: withdraws one garden of a submitted or quoted application (open quote cancelled; back to review).';

-- As the customer's, with a required note (kept as the garden's
-- verification note). Errors: not_found, forbidden, invalid_input (note),
-- application_not_open, garden_withdrawn, last_garden, state_changed.
create function public.ops_withdraw_application_garden(p_garden_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_note text := nullif(btrim(p_note), '');
begin
  a := private.lock_application_for_ops(
    (select g.application_id from public.application_garden g where g.id = p_garden_id));
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform private.withdraw_application_garden(a, p_garden_id, (select auth.uid()), 'ops');
  update public.application_garden set verification_note = v_note where id = p_garden_id;
end;
$$;
comment on function public.ops_withdraw_application_garden(uuid, text) is
  'Ops: withdraws one garden of a submitted or quoted application with a note (open quote cancelled).';

-- Reopens the application of an order awaiting payment: the order is
-- cancelled (customer_revision) and the application goes accepted →
-- submitted for a new quote. Returns the application id. Errors:
-- demo_read_only, not_found, not_revisable (no application), order_active,
-- order_not_payable, has_payments, payment_in_progress, invalid_input (note),
-- state_changed.
create function public.customer_revise_order(p_order_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  a public.service_application;
  v_user uuid := (select auth.uid());
  v_application uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  perform private.assert_not_demo();
  select q.application_id into v_application
  from public.service_order x join public.quote q on q.id = x.quote_id
  where x.id = p_order_id and x.customer_user_id = v_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_application is null then
    raise exception 'not_revisable' using errcode = 'P0001';
  end if;
  if length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  a := private.lock_own_application(v_application);
  perform 1 from public.quote q join public.service_order x on x.quote_id = q.id where x.id = p_order_id for update of q;
  o := private.lock_own_order(p_order_id);
  perform private.cancel_order(o, v_user, 'customer', 'customer_revision', null);
  update public.service_application
  set status = 'submitted', customer_note = coalesce(v_note, customer_note), decided_at = null, decided_by = null
  where id = a.id and status = 'accepted';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(a.org_id, v_user, 'customer', 'application.reopened', 'application', a.id,
    jsonb_build_object('order_id', o.id, 'note', v_note is not null));
  return a.id;
end;
$$;
comment on function public.customer_revise_order(uuid, text) is
  'Customer: cancels an unpaid order from an application and reopens the application for a new quote.';

-- ---------------------------------------------------------------------------
-- 5. Replaced functions
-- ---------------------------------------------------------------------------

-- As in 20261030105200_pricing.sql; withdrawn gardens are left out.
create or replace function public.ops_preview_quote(p_application_id uuid, p_discount_bp integer default 0)
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
  from public.application_garden g where g.application_id = a.id and g.withdrawn_at is null;
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

-- As in 20261030105300_quotes_orders.sql; withdrawn gardens are left out;
-- customer and parcel locks, then parcel_in_service (linked gardens) and
-- account_garden_limit over [start, + 1 year - 1 day].
create or replace function public.ops_issue_quote(
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
  v_parcels uuid[];
  v_start date := coalesce(p_proposed_service_start, private.istanbul_today());
  v_end date;
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
  if not exists (select 1 from public.application_garden g where g.application_id = a.id and g.withdrawn_at is null) then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  if exists (select 1 from public.application_garden g
             where g.application_id = a.id and g.withdrawn_at is null and g.verified_at is null) then
    raise exception 'garden_not_verified' using errcode = 'P0001';
  end if;
  select jsonb_agg(jsonb_build_object('application_garden_id', g.id, 'garden_name', g.name,
           'area_m2', g.verified_area_m2, 'area_source', 'verified') order by g.sort_order, g.created_at, g.id),
         coalesce(array_agg(g.parcel_id) filter (where g.parcel_id is not null), '{}')
  into v_lines, v_parcels
  from public.application_garden g where g.application_id = a.id and g.withdrawn_at is null;

  perform private.supersede_open_quote(a.id, null);
  perform private.lock_customer_gardens(a.customer_user_id);
  perform private.lock_parcel_coverage(v_parcels);
  v_end := (v_start + interval '1 year' - interval '1 day')::date;
  if exists (select 1 from unnest(v_parcels) p where private.parcel_in_service(p, v_start, v_end)) then
    raise exception 'parcel_in_service' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  if private.account_garden_count(a.org_id, a.customer_user_id, v_start, v_end) + jsonb_array_length(v_lines) > 50 then
    raise exception 'account_garden_limit' using errcode = 'P0001';
  end if;
  v_id := private.write_quote(a.org_id, a.customer_user_id, a.id, null, a.package_id, true, v_lines,
    p_proposed_service_start, v_days, coalesce(p_discount_bp, 0), p_discount_note, p_note_to_customer);
  update public.service_application set status = 'quoted' where id = a.id and status = a.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- As in 20261030100400_catalog_applications.sql, plus garden_withdrawn.
create or replace function public.ops_verify_application_garden(
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
  if exists (select 1 from public.application_garden g where g.id = p_garden_id and g.withdrawn_at is not null) then
    raise exception 'garden_withdrawn' using errcode = 'P0001';
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

-- As in 20261030105300_quotes_orders.sql, and: at most 50 parcels; an add-on
-- order is no renewal target; customer and parcel locks; parcel_in_service
-- over [start, + 1 year - 1 day]; garden_removal_open for an open removal
-- effective by the start; parcel_not_reusable after a transfer;
-- account_garden_limit.
create or replace function public.ops_issue_parcel_quote(
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
  v_from date;
  v_to date;
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
  if p_parcel_ids is null or cardinality(p_parcel_ids) not between 1 and 50
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
    if o.customer_user_id <> p_customer_user_id or o.status not in ('active', 'completed') or o.service_end is null
       or o.addon_of_order_id is not null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'renewal_of_order_id';
    end if;
    v_start := o.service_end + 1;
  end if;
  v_days := private.check_quote_terms(p_org_id, v_start, p_valid_days, coalesce(p_discount_bp, 0),
    p_discount_note, p_note_to_customer);
  if exists (select 1 from unnest(p_parcel_ids) x where private.parcel_transferred(x, p_customer_user_id)) then
    raise exception 'parcel_not_reusable' using errcode = 'P0001', detail = 'parcel_ids';
  end if;

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
  perform private.lock_customer_gardens(p_customer_user_id);
  perform private.lock_parcel_coverage(p_parcel_ids);
  v_from := coalesce(v_start, private.istanbul_today());
  v_to := (v_from + interval '1 year' - interval '1 day')::date;
  if exists (select 1 from unnest(p_parcel_ids) x where private.parcel_in_service(x, v_from, v_to)) then
    raise exception 'parcel_in_service' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  if exists (
    select 1 from public.garden_removal r
    where r.parcel_id = any (p_parcel_ids) and r.customer_user_id = p_customer_user_id
      and r.status in ('requested', 'scheduled')
      and coalesce(r.effective_on, r.requested_effective_on) <= v_from
  ) then
    raise exception 'garden_removal_open' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  if private.account_garden_count(p_org_id, p_customer_user_id, v_from, v_to) + cardinality(p_parcel_ids) > 50 then
    raise exception 'account_garden_limit' using errcode = 'P0001';
  end if;
  begin
    return private.write_quote(p_org_id, p_customer_user_id, null, p_renewal_of_order_id, p_package_id,
      p_first_year, v_lines, v_start, v_days, coalesce(p_discount_bp, 0), p_discount_note, p_note_to_customer);
  exception when unique_violation then
    -- Another renewal quote of the order was issued meanwhile.
    raise exception 'state_changed' using errcode = 'P0001';
  end;
end;
$$;

-- As in 20261030105300_quotes_orders.sql, and: customer and parcel locks,
-- then parcel_in_service and account_garden_limit over the intended period;
-- garden_removal_open for a quoted parcel with an open removal of the
-- customer, or one requested after the quote was issued; an add-on needs
-- its base order active up to the last add-on day (addon_base_closed), takes
-- addon_of_order_id and is due by the end of that day at the latest.
create or replace function public.customer_accept_quote(p_quote_id uuid, p_consents jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
  b public.service_order;
  v_user uuid := (select auth.uid());
  v_kind text;
  v_due_days integer;
  v_due timestamptz;
  v_order uuid;
  v_number text;
  v_parcels uuid[];
  v_from date;
  v_to date;
  v_lines integer;
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

  v_parcels := private.quote_line_parcels(q.id);
  perform private.lock_customer_gardens(v_user);
  perform private.lock_parcel_coverage(v_parcels);
  select coalesce(s.payment_due_days, 14) into v_due_days
  from (select 1) one left join public.org_billing_setting s on s.org_id = q.org_id;
  v_due := now() + make_interval(days => v_due_days);
  if q.addon_of_order_id is not null then
    select * into b from public.service_order where id = q.addon_of_order_id for update;
    if b.status is distinct from 'active' or private.istanbul_today() > private.addon_last_day(b) then
      raise exception 'addon_base_closed' using errcode = 'P0001';
    end if;
    v_from := greatest(coalesce(q.proposed_service_start, private.istanbul_today()), private.istanbul_today());
    v_to := b.service_end;
    v_due := least(v_due, (private.addon_last_day(b) + 1)::timestamp at time zone 'Europe/Istanbul');
  else
    v_from := coalesce(q.proposed_service_start, private.istanbul_today());
    v_to := (v_from + interval '1 year' - interval '1 day')::date;
  end if;
  if exists (select 1 from unnest(v_parcels) x where private.parcel_in_service(x, v_from, v_to)) then
    raise exception 'parcel_in_service' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  select count(*) into v_lines from public.quote_item i where i.quote_id = q.id;
  if private.account_garden_count(q.org_id, v_user, v_from, v_to) + v_lines > 50 then
    raise exception 'account_garden_limit' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.garden_removal r
    where r.parcel_id = any (v_parcels) and r.customer_user_id = v_user
      and (r.status in ('requested', 'scheduled') or (r.status <> 'cancelled' and r.requested_at > q.issued_at))
  ) then
    raise exception 'garden_removal_open' using errcode = 'P0001', detail = 'parcel_ids';
  end if;

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

  v_number := private.next_document_number(q.org_id, 'S');
  insert into public.service_order (org_id, customer_user_id, quote_id, number, total_kurus, payment_due_at,
    renewal_of_order_id, addon_of_order_id)
  values (q.org_id, v_user, q.id, v_number, q.total_kurus, v_due, q.renewal_of_order_id, q.addon_of_order_id)
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
    jsonb_build_object('number', v_number, 'quote_id', q.id, 'total_kurus', q.total_kurus,
      'addon_of_order_id', q.addon_of_order_id));
  perform private.audit(q.org_id, v_user, 'customer', 'consent.granted', 'consent', v_user,
    jsonb_build_object('kinds', jsonb_build_array('distance_sales', 'pre_information'), 'order_id', v_order));
  if q.total_kurus = 0 then
    perform private.activate_order(v_order);
  end if;
  return v_order;
end;
$$;

-- As in 20261101100000_payment_begin_buyer_email.sql, and:
-- garden_removal_open when a line's parcel has an open removal of the
-- customer; addon_base_closed for an add-on whose base order is closed or
-- past its last add-on day.
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
      'identity_number', case when v_required and b.identity_number is not null then b.identity_number
                              else '11111111111' end,
      'email', v_email,
      'phone', coalesce(op.phone, case when u.phone is not null and u.phone <> '' then '+' || u.phone end),
      'address', b.address,
      'district', b.district,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code,
      'registered_at', coalesce(u.created_at, op.created_at)
    ),
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

-- As in 20261030105400_payments.sql, plus garden_removal_open. No add-on
-- period check: a received transfer is always recorded; activation decides.
create or replace function public.ops_record_manual_payment(
  p_order_id uuid,
  p_amount_kurus bigint,
  p_value_date date,
  p_bank_reference text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  v_reference text := nullif(btrim(p_bank_reference), '');
  v_note text := nullif(btrim(p_note), '');
begin
  o := private.lock_order_for_ops(p_order_id);
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if private.has_open_removal(private.order_line_parcels(o.id), o.customer_user_id) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if private.live_payment_attempt(o.id) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  if p_amount_kurus is null or p_amount_kurus <= 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount_kurus';
  end if;
  if p_amount_kurus > o.total_kurus - (o.paid_kurus - o.refunded_kurus) then
    raise exception 'amount_exceeds_balance' using errcode = 'P0001';
  end if;
  if p_value_date is null or p_value_date > private.istanbul_today() or p_value_date < private.istanbul_today() - 366 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'value_date';
  end if;
  if v_reference is null or length(v_reference) > 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'bank_reference';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if not private.billing_profile_complete(o.org_id, o.customer_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;

  insert into public.payment (org_id, order_id, customer_user_id, provider, status, amount_kurus,
    provider_amount_kurus, paid_kurus, receipt_number, bank_reference, value_date, recorded_by, manual_note,
    succeeded_at)
  values (o.org_id, o.id, o.customer_user_id, 'manual', 'succeeded', p_amount_kurus, p_amount_kurus, p_amount_kurus,
    private.next_document_number(o.org_id, 'M'), v_reference, p_value_date, (select auth.uid()), v_note, now())
  returning * into p;
  perform private.write_payment_items(o, p.id, p_amount_kurus);
  perform private.write_payment_snapshot(p.id, p.org_id, p.customer_user_id);
  perform private.complete_payment(o, p, (select auth.uid()), 'ops', 'payment.manual_recorded');
  return p.id;
end;
$$;

-- As in 20261030105300_quotes_orders.sql; an add-on is due by its base
-- order's last add-on day at the latest (invalid_input due_on).
create or replace function public.ops_extend_payment_due(p_order_id uuid, p_due_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  b public.service_order;
  v_due timestamptz;
begin
  o := private.lock_order_for_ops(p_order_id);
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if p_due_on is null or p_due_on < private.istanbul_today() or p_due_on > private.istanbul_today() + 365 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'due_on';
  end if;
  if o.addon_of_order_id is not null then
    select * into b from public.service_order where id = o.addon_of_order_id;
    if p_due_on > private.addon_last_day(b) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'due_on';
    end if;
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

-- As in 20261030105600_order_activation.sql, and:
-- - an add-on whose base order is closed or past its last add-on day is not
--   activated: cancelled (addon_base_closed) with an order_closed refund of
--   every succeeded payment; otherwise it serves from max(start, today) to
--   the base order's end;
-- - every line: the customer's open access windows of earlier removals of the
--   parcel are closed (resumed), owner access is added when missing, a
--   passive parcel returns to the step its visits show;
-- - a linked application garden (an earlier parcel): the parcel detail from
--   the application, and a new owner_declared boundary version when the
--   parcel has no field survey and the rough boundary differs.
create or replace function private.activate_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  q public.quote;
  b public.service_order;
  v_item record;
  v_parcel uuid;
  v_start date;
  v_end date;
  v_payment record;
  v_refunds integer := 0;
  v_removal record;
  v_geom extensions.geometry;
  v_latest extensions.geometry;
  d private.application_garden_detail;
begin
  select * into o from public.service_order where id = p_order_id for update;
  if not found or o.status <> 'awaiting_payment' or o.paid_kurus - o.refunded_kurus < o.total_kurus then
    return false;
  end if;
  select * into q from public.quote where id = o.quote_id;

  if o.addon_of_order_id is not null then
    select * into b from public.service_order where id = o.addon_of_order_id;
    if b.status is distinct from 'active' or private.istanbul_today() > private.addon_last_day(b) then
      update public.service_order set status = 'cancelled', cancelled_at = now(), cancel_reason = 'addon_base_closed'
      where id = o.id and status = 'awaiting_payment';
      if not found then
        raise exception 'state_changed' using errcode = 'P0001';
      end if;
      for v_payment in
        select p.id, coalesce(p.provider_amount_kurus, p.amount_kurus) as amount
        from public.payment p where p.order_id = o.id and p.status = 'succeeded'
        order by p.id
        for update
      loop
        v_refunds := v_refunds + coalesce(cardinality(
          private.open_system_refund(v_payment.id, v_payment.amount, 'order_closed')), 0);
      end loop;
      perform private.audit(o.org_id, null, 'system', 'order.cancelled', 'order', o.id,
        jsonb_build_object('number', o.number, 'reason', 'addon_base_closed'));
      perform private.audit(o.org_id, null, 'system', 'order.activation_refused', 'order', o.id,
        jsonb_build_object('number', o.number, 'reason', 'addon_base_closed', 'refunds', v_refunds,
          'addon_of_order_id', o.addon_of_order_id));
      return false;
    end if;
    v_start := greatest(coalesce(q.proposed_service_start, private.istanbul_today()), private.istanbul_today());
    v_end := b.service_end;
  else
    v_start := coalesce(q.proposed_service_start, private.istanbul_today());
    v_end := (v_start + interval '1 year' - interval '1 day')::date;
  end if;

  for v_item in
    select oi.id, qi.application_garden_id, qi.parcel_id, g.parcel_id as linked_parcel_id
    from public.service_order_item oi
    join public.quote_item qi on qi.id = oi.quote_item_id
    left join public.application_garden g on g.id = qi.application_garden_id
    where oi.order_id = o.id
    order by oi.line_no
  loop
    if v_item.application_garden_id is not null and v_item.linked_parcel_id is null then
      v_parcel := private.create_customer_parcel(v_item.application_garden_id);
    else
      v_parcel := coalesce(v_item.parcel_id, v_item.linked_parcel_id);
      -- The re-added garden closes the customer's open access windows first
      -- (the read-only guard would refuse the owner access otherwise).
      for v_removal in
        update public.garden_removal set access_revoked_at = now()
        where parcel_id = v_parcel and customer_user_id = o.customer_user_id and status = 'completed'
          and access_revoked_at is null
        returning id, org_id
      loop
        perform private.audit(v_removal.org_id, null, 'system', 'garden_removal.access_closed', 'garden_removal',
          v_removal.id, jsonb_build_object('reason', 'resumed', 'order_id', o.id));
      end loop;
      insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
      select o.org_id, v_parcel, o.customer_user_id, 'owner', null
      where not exists (
        select 1 from public.parcel_access pa where pa.parcel_id = v_parcel and pa.user_id = o.customer_user_id
      );
      if v_item.linked_parcel_id is not null then
        select * into d from private.application_garden_detail x
        where x.application_garden_id = v_item.application_garden_id;
        if found then
          insert into private.parcel_detail (
            parcel_id, org_id, deed_block, deed_parcel, is_shared_deed, used_portion_note, authorization_basis,
            entry_permission_at, access_note, site_contact_name, site_contact_phone
          )
          values (
            v_parcel, o.org_id, d.deed_block, d.deed_parcel, d.is_shared_deed, d.used_portion_note,
            d.authorization_basis, d.entry_permission_at, d.access_note, d.site_contact_name, d.site_contact_phone
          )
          on conflict (parcel_id) do update
          set deed_block = excluded.deed_block, deed_parcel = excluded.deed_parcel,
              is_shared_deed = excluded.is_shared_deed, used_portion_note = excluded.used_portion_note,
              authorization_basis = excluded.authorization_basis, entry_permission_at = excluded.entry_permission_at,
              access_note = excluded.access_note, site_contact_name = excluded.site_contact_name,
              site_contact_phone = excluded.site_contact_phone, updated_at = now();
        end if;
        select g.boundary into v_geom from public.application_garden g where g.id = v_item.application_garden_id;
        if v_geom is not null and not exists (
          select 1 from public.boundary bb where bb.parcel_id = v_parcel and bb.source = 'field_survey'
        ) then
          perform pg_advisory_xact_lock(hashtextextended('boundary:' || v_parcel::text, 0));
          select bb.geom into v_latest from public.boundary bb where bb.parcel_id = v_parcel
          order by bb.version desc limit 1;
          if v_latest is null or not extensions.st_equals(v_latest, v_geom) then
            insert into public.boundary (org_id, parcel_id, version, geom, source)
            values (o.org_id, v_parcel,
              coalesce((select max(bb.version) from public.boundary bb where bb.parcel_id = v_parcel), 0) + 1,
              v_geom, 'owner_declared');
          end if;
        end if;
      end if;
      update public.parcel set status = private.parcel_lifecycle_status(id)
      where id = v_parcel and status = 'passive';
    end if;
    update public.service_order_item set parcel_id = v_parcel where id = v_item.id and parcel_id is null;
  end loop;

  update public.service_order
  set status = 'active', activated_at = now(), service_start = v_start, service_end = v_end
  where id = o.id and status = 'awaiting_payment';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, null, 'system', 'order.activated', 'order', o.id,
    jsonb_build_object('number', o.number, 'service_start', v_start,
      'lines', (select count(*) from public.service_order_item oi where oi.order_id = o.id),
      'addon_of_order_id', o.addon_of_order_id));
  return true;
end;
$$;

-- As in 20261030105700_ops_billing_views.sql; renewal_due by
-- private.renewal_due (never an add-on) and addon_of_order_id appended.
drop function public.ops_orders(uuid, text, uuid, integer);
create function public.ops_orders(
  p_org_id uuid,
  p_status text default null,
  p_customer_user_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  number text,
  status text,
  customer_user_id uuid,
  customer_name text,
  quote_id uuid,
  quote_number text,
  application_id uuid,
  package_name text,
  total_kurus bigint,
  paid_kurus bigint,
  refunded_kurus bigint,
  currency text,
  payment_due_at timestamptz,
  overdue boolean,
  live_payment boolean,
  service_start date,
  service_end date,
  renewal_due boolean,
  renewal_of_order_id uuid,
  activated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  terminated_at timestamptz,
  created_at timestamptz,
  addon_of_order_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_notice integer := coalesce(
    (select s.renewal_notice_days from public.org_billing_setting s where s.org_id = p_org_id), 45);
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and not p_status = any (enum_range(null::public.order_status)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select o.id, o.number, o.status::text, o.customer_user_id, op.full_name, o.quote_id, q.number, q.application_id,
         q.package_name, o.total_kurus, o.paid_kurus, o.refunded_kurus, o.currency, o.payment_due_at,
         o.status = 'awaiting_payment' and o.payment_due_at < now(),
         private.live_payment_attempt(o.id),
         o.service_start, o.service_end,
         private.renewal_due(o, v_notice),
         o.renewal_of_order_id, o.activated_at, o.completed_at, o.cancelled_at, o.cancel_reason, o.terminated_at,
         o.created_at, o.addon_of_order_id
  from public.service_order o
  join public.quote q on q.id = o.quote_id
  left join private.owner_profile op on op.org_id = o.org_id and op.user_id = o.customer_user_id
  where o.org_id = p_org_id
    and (p_status is null or o.status::text = p_status)
    and (p_customer_user_id is null or o.customer_user_id = p_customer_user_id)
  order by o.created_at desc, o.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_orders(uuid, text, uuid, integer) is
  'Ops: orders of the org with amounts, due and renewal flags, whether a card payment is in progress and the add-on base.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.billing_setting(uuid) from public;
revoke all on function private.addon_visits(smallint, date, date, date) from public;
revoke all on function private.price_lines_v2(uuid, uuid, numeric[], boolean[], smallint, integer, date) from public;
revoke all on function private.parcel_served_on(uuid, date) from public;
revoke all on function private.coverage_lines(uuid, uuid, uuid) from public;
revoke all on function private.parcel_in_service(uuid, date, date, uuid) from public;
revoke all on function private.lock_parcel_coverage(uuid[]) from public;
revoke all on function private.lock_customer_gardens(uuid) from public;
revoke all on function private.account_garden_count(uuid, uuid, date, date) from public;
revoke all on function private.order_line_parcels(uuid) from public;
revoke all on function private.quote_line_parcels(uuid) from public;
revoke all on function private.has_open_removal(uuid[], uuid) from public;
revoke all on function private.parcel_transferred(uuid, uuid) from public;
revoke all on function private.addon_last_day(public.service_order) from public;
revoke all on function private.withdrawal_until(public.service_order) from public;
revoke all on function private.addon_base_order(uuid, uuid) from public;
revoke all on function private.addon_base_open(uuid) from public;
revoke all on function private.renewal_due(public.service_order, integer) from public;
revoke all on function private.billed_visits(uuid, date, date) from public;
revoke all on function private.parcel_has_inventory(uuid) from public;
revoke all on function private.service_periods(uuid, uuid) from public;
revoke all on function private.customer_gardens(uuid, uuid) from public;
revoke all on function private.require_ops_customer(uuid, uuid) from public;
revoke all on function private.addon_lines(uuid, uuid[]) from public;
revoke all on function private.addon_start(public.service_order, date) from public;
revoke all on function private.addon_base_for_ops(uuid) from public;
revoke all on function private.check_addon_parcels(uuid, uuid, uuid[]) from public;
revoke all on function private.write_addon_quote(uuid, uuid, uuid, public.service_order, uuid, jsonb, date, integer, integer, text, text)
  from public;
revoke all on function private.withdraw_application_garden(public.service_application, uuid, uuid, text) from public;

revoke all on function public.my_service_period() from public, anon, authenticated;
revoke all on function public.my_gardens() from public, anon, authenticated;
revoke all on function public.ops_customer_service_period(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ops_customer_gardens(uuid, uuid) from public, anon, authenticated;
revoke all on function public.parcel_service_status(uuid) from public, anon, authenticated;
revoke all on function public.customer_addon_preview(numeric[]) from public, anon, authenticated;
revoke all on function public.ops_garden_overlaps(uuid) from public, anon, authenticated;
revoke all on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer) from public, anon, authenticated;
revoke all on function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.ops_link_application_garden_parcel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.customer_withdraw_application_garden(uuid) from public, anon, authenticated;
revoke all on function public.ops_withdraw_application_garden(uuid, text) from public, anon, authenticated;
revoke all on function public.customer_revise_order(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_orders(uuid, text, uuid, integer) from public, anon, authenticated;

grant execute on function public.my_service_period() to authenticated;
grant execute on function public.my_gardens() to authenticated;
grant execute on function public.ops_customer_service_period(uuid, uuid) to authenticated;
grant execute on function public.ops_customer_gardens(uuid, uuid) to authenticated;
grant execute on function public.parcel_service_status(uuid) to authenticated;
grant execute on function public.customer_addon_preview(numeric[]) to authenticated;
grant execute on function public.ops_garden_overlaps(uuid) to authenticated;
grant execute on function public.ops_preview_addon_quote(uuid, uuid, uuid[], date, integer) to authenticated;
grant execute on function public.ops_issue_addon_quote(uuid, uuid, uuid[], date, integer, integer, text, text)
  to authenticated;
grant execute on function public.ops_link_application_garden_parcel(uuid, uuid) to authenticated;
grant execute on function public.customer_withdraw_application_garden(uuid) to authenticated;
grant execute on function public.ops_withdraw_application_garden(uuid, text) to authenticated;
grant execute on function public.customer_revise_order(uuid, text) to authenticated;
grant execute on function public.ops_orders(uuid, text, uuid, integer) to authenticated;
