-- Adding gardens during a membership (IP14, docs/bahce-yonetimi.md §4, §6,
-- §9.6): pricing-v2 and its parity with v1, add-on quotes (application and
-- parcel paths), acceptance, payment and due caps, activation (same end day,
-- refusal with an order_closed refund, a linked earlier parcel), the period
-- reads with two overlapping base orders and a paid renewal, coverage
-- (parcel_in_service, garden_removal_open, account_garden_limit,
-- parcel_not_reusable), renewal flags, the ops_terminate_order chain,
-- withdrawn gardens, order revision and the duplicate search.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4, 18 000 a
-- visit and dönüm, minimum 1 120 000, inventory 600 000, VAT 20 %); from
-- section 1 on a list of this file is in force. Customers are created here.
-- The whole file is one transaction: now() and the Istanbul day are constant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(101);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id uuid) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.ops() returns void language sql
as $$ select pg_temp.as_user('a0000000-0000-4000-8000-000000000005') $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;
create function pg_temp.today() returns date language sql stable as $$ select private.istanbul_today() $$;
create temporary table ids (k text primary key, v uuid) on commit drop;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.put(p_k text, p_v uuid) returns uuid language sql
as $$ insert into ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v $$;

-- A customer of the seed org with a profile, a billing profile and the KVKK notice.
create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f4500000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c45-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 45-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

-- A submitted application of the customer with verified gardens (m², lon).
create function pg_temp.new_app(p_user uuid, p_areas numeric[], p_lon numeric, p_boundary jsonb default null)
returns uuid language plpgsql
as $$
declare
  a uuid;
  g uuid;
  i integer;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  for i in 1 .. cardinality(p_areas) loop
    g := public.customer_save_application_garden(a,
      jsonb_build_object('name', 'Bahçe ' || p_lon || '-' || i, 'declared_area_m2', p_areas[i],
        'lon', p_lon + i * 0.01, 'lat', 37.1)
        || case when p_boundary is not null then jsonb_build_object('boundary', p_boundary) else '{}'::jsonb end,
      '{"authorization_basis": "title_holder", "entry_permission": true, "deed_block": "45"}');
  end loop;
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2)
  from public.application_garden x where x.application_id = a;
  return a;
end;
$$;

create function pg_temp.accept(p_user uuid, p_quote uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.as_user(p_user);
  return public.customer_accept_quote(p_quote, '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
end;
$$;

-- A transfer of the whole outstanding amount, recorded by ops.
create function pg_temp.pay(p_order uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order),
    current_date, 'EFT-45-' || left(p_order::text, 8));
end;
$$;

-- An active base order from a new application.
create function pg_temp.new_order(p_user uuid, p_areas numeric[], p_lon numeric) returns uuid language plpgsql
as $$
declare
  o uuid;
begin
  o := pg_temp.accept(p_user, public.ops_issue_quote(pg_temp.new_app(p_user, p_areas, p_lon)));
  perform pg_temp.pay(o);
  return o;
end;
$$;

create function pg_temp.parcels_of(p_order uuid) returns uuid[] language sql stable
as $$ select array_agg(parcel_id order by line_no) from public.service_order_item where order_id = p_order $$;

-- 1. pricing-v2 ----------------------------------------------------------------------

select results_eq(
  $$ select private.addon_visits(4::smallint, d::date, '2026-11-01', '2027-10-31')
     from unnest(array['2026-11-01', '2026-10-01', '2027-04-01', '2027-05-01', '2027-10-02', '2027-10-31']) d $$,
  $$ values (4::smallint), (4::smallint), (2::smallint), (2::smallint), (1::smallint), (1::smallint) $$,
  'addon_visits: V × days left / period days, half up, between 1 and V');
select is(private.addon_visits(3::smallint, '2027-03-01', '2026-11-01', '2027-10-31'), 2::smallint,
  '3 × 245 / 365 = 2.01 → 2');

select results_eq(
  $$ select * from private.price_lines('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001',
       array[15000, 20000.5, 999.99, 120000], true, 1500, '2026-12-01') $$,
  $$ select * from private.price_lines_v2('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001',
       array[15000, 20000.5, 999.99, 120000], array[true, true, true, true], 4::smallint, 1500, '2026-12-01') $$,
  'pricing-v2 with V visits and every flag = first_year equals pricing-v1 (first year, discount)');
select results_eq(
  $$ select * from private.price_lines('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000002',
       array[5000, 30000], false, 0) $$,
  $$ select * from private.price_lines_v2('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000002',
       array[5000, 30000], array[false, false], 2::smallint, 0) $$,
  'parity for a renewal of the other package too');
select results_eq(
  $$ select visits, minimum_fee_kurus, visit_amount_kurus, line_base_kurus, line_total_kurus
     from private.price_lines_v2('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001',
       array[15000, 5000], array[true, true], 2::smallint) order by line_no $$,
  $$ values (2::smallint, 560000::bigint, 540000::bigint, 1160000::bigint, 1392000::bigint),
            (2::smallint, 560000::bigint, 180000::bigint, 1160000::bigint, 1392000::bigint) $$,
  'doc §6: 15 dönüm with 2 visits is 1 392 000 kuruş; the minimum is prorated to 560 000, plus the inventory fee');
select is(pg_temp.error_of($$ select * from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001', array[15000], array[true, false], 2::smallint) $$),
  '22023 invalid_input / inventory', 'one inventory flag per area');
select is(pg_temp.error_of($$ select * from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001', array[15000], array[true], 5::smallint) $$),
  '22023 invalid_input / visits', 'no more visits than the package has');
select is(pg_temp.error_of($$ select * from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001', array[15000], array[true], 0::smallint) $$),
  '22023 invalid_input / visits', 'at least one visit');
select is((select count(*)::integer from private.price_lines('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001', array_fill(15000::numeric, array[50]), true)), 50,
  'pricing-v1 takes 50 areas');
select is(pg_temp.error_of($$ select * from private.price_lines('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001', array_fill(15000::numeric, array[51]), true) $$),
  '22023 invalid_input / areas', 'but not 51');
select is(pg_temp.error_of($$ select * from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001', array_fill(15000::numeric, array[51]), array_fill(true, array[51]),
  4::smallint) $$), '22023 invalid_input / areas', 'nor does pricing-v2');

-- A price list v2 in force from today with an inventory fee of 100 000.
insert into public.price_list (id, org_id, status, valid_from, vat_rate_bp)
values ('f4500000-0000-4000-8000-000000000901', 'b0000000-0000-4000-8000-000000000001', 'draft', pg_temp.today(), 2000);
insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus)
values ('b0000000-0000-4000-8000-000000000001', 'f4500000-0000-4000-8000-000000000901',
        '91200000-0000-4000-8000-000000000001', 12500, 500000, 100000),
       ('b0000000-0000-4000-8000-000000000001', 'f4500000-0000-4000-8000-000000000901',
        '91200000-0000-4000-8000-000000000002', 13000, 450000, 0);
update public.price_list set status = 'published', version = 2, published_at = now()
where id = 'f4500000-0000-4000-8000-000000000901';
select results_eq(
  $$ select inventory_fee_kurus, line_base_kurus from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
       '91200000-0000-4000-8000-000000000001', array[15000, 15000], array[true, false], 4::smallint) order by line_no $$,
  $$ values (100000::bigint, 850000::bigint), (0::bigint, 750000::bigint) $$,
  'the inventory fee only on the lines that need an inventory');

-- 2. Base order, add-on quote (application path) --------------------------------------

insert into ids select 'c1', pg_temp.new_customer(1);
insert into ids select 'b1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.20);
select testing.set_order_period(pg_temp.id('b1'), pg_temp.today() - 100, pg_temp.today() + 264);
select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select base_order_id, period_start, period_end, next_base_order_id, addon_base_order_id, addon_until,
            garden_count, garden_changes_enabled, is_primary, period_count
     from public.my_service_period() $$,
  $$ select pg_temp.id('b1'), pg_temp.today() - 100, pg_temp.today() + 264, null::uuid, pg_temp.id('b1'),
            pg_temp.today() + 235, 1, true, true, 1 $$,
  'my_service_period: one period, its add-on base, last add-on day and garden count');
select results_eq(
  $$ select base_order_id, service_start, service_end, visits, line_total_kurus
     from public.customer_addon_preview(array[15000]) $$,
  $$ select pg_temp.id('b1'), pg_temp.today(), pg_temp.today() + 264,
            private.addon_visits(4::smallint, pg_temp.today(), pg_temp.today() - 100, pg_temp.today() + 264),
            (select line_total_kurus from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
              '91200000-0000-4000-8000-000000000001', array[15000], array[true],
              private.addon_visits(4::smallint, pg_temp.today(), pg_temp.today() - 100, pg_temp.today() + 264))) $$,
  'customer_addon_preview: from today to the period end, prorated visits, inventory');
select is((select count(*)::integer from public.my_gardens()), 1, 'my_gardens: the garden in service');

insert into ids select 'a2', pg_temp.new_app(pg_temp.id('c1'), array[15000], 37.30);
select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_issue_addon_quote(pg_temp.id('b1')) $$),
  '22023 invalid_input / application_id', 'exactly one of application and parcels');
select is(pg_temp.error_of(format($$ select public.ops_issue_addon_quote(%L, %L, array[%L]::uuid[]) $$,
  pg_temp.id('b1'), pg_temp.id('a2'), (pg_temp.parcels_of(pg_temp.id('b1')))[1])),
  '22023 invalid_input / application_id', 'not both');
update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(pg_temp.error_of($$ select public.ops_issue_addon_quote(pg_temp.id('b1'), pg_temp.id('a2')) $$),
  'P0001 garden_changes_closed', 'no add-on quote while the switch is off');
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(pg_temp.error_of(format($$ select public.ops_issue_addon_quote(%L, %L, p_proposed_service_start => %L) $$,
  pg_temp.id('b1'), pg_temp.id('a2'), pg_temp.today() + 250)),
  'P0001 addon_period_too_short', 'a start after the last add-on day is refused');
select results_eq(
  $$ select line_no, area_source, inventory, visits, service_start, service_end
     from public.ops_preview_addon_quote(pg_temp.id('b1'), pg_temp.id('a2')) $$,
  $$ select 1, 'verified'::text, true, private.addon_visits(4::smallint, pg_temp.today(), pg_temp.today() - 100,
            pg_temp.today() + 264), pg_temp.today(), pg_temp.today() + 264 $$,
  'ops_preview_addon_quote: the add-on lines');
insert into ids select 'q2', public.ops_issue_addon_quote(pg_temp.id('b1'), pg_temp.id('a2'), p_valid_days => 60);
select results_eq(
  $$ select addon_of_order_id, renewal_of_order_id, first_year, proposed_service_start, valid_until,
            inputs ->> 'formula', inputs -> 'addon' ->> 'base_order_id', (inputs -> 'addon' ->> 'visits')::integer,
            (inputs -> 'addon' ->> 'addon_last_day')::date, (inputs -> 'areas' -> 0 ->> 'inventory')::boolean
     from public.quote where id = pg_temp.id('q2') $$,
  $$ select pg_temp.id('b1'), null::uuid, true, pg_temp.today(), pg_temp.today() + 60, 'pricing-v2'::text,
            pg_temp.id('b1')::text, 3, pg_temp.today() + 235, true $$,
  'the add-on quote: base order, frozen pricing-v2 inputs, validity');
select is((select array_agg(k order by k) from public.quote q, jsonb_object_keys(q.inputs -> 'addon') k
           where q.id = pg_temp.id('q2')),
  array['addon_last_day', 'base_order_id', 'base_order_number', 'lines', 'period_days', 'period_end', 'period_start',
        'price_list_id', 'price_list_name', 'price_list_valid_from', 'price_list_version', 'raw_visits',
        'remaining_days', 'remaining_window_count', 'remaining_windows', 'rounded_visits', 'rounding',
        'service_start', 'vat_rate_bp', 'visits', 'visits_exceed_windows', 'visits_per_year'],
  'inputs.addon keys (with the T18 breakdown)');
select results_eq(
  $$ select visits, inventory_fee_kurus, line_total_kurus from public.quote_item where quote_id = pg_temp.id('q2') $$,
  $$ select 3::smallint, 100000::bigint,
            (select line_total_kurus from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
              '91200000-0000-4000-8000-000000000001', array[15000], array[true], 3::smallint)) $$,
  'the line: prorated visits, the inventory fee of the list in force');
select is((select status::text from public.service_application where id = pg_temp.id('a2')), 'quoted',
  'the application is quoted');
select is((select count(*)::integer from public.notification where template = 'quote_ready' and ref_id = pg_temp.id('q2')),
  1, 'quote_ready is sent');
select is((select (details ->> 'addon_of_order_id')::uuid from public.audit_event
           where action = 'quote.issued' and entity_id = pg_temp.id('q2')), pg_temp.id('b1'),
  'quote.issued names the base order');

-- Acceptance: the base order's period caps the due time.
select testing.set_order_period(pg_temp.id('b1'), pg_temp.today() - 100, pg_temp.today() + 32);
insert into ids select 'o2', pg_temp.accept(pg_temp.id('c1'), pg_temp.id('q2'));
select results_eq(
  $$ select addon_of_order_id, status::text, payment_due_at from public.service_order where id = pg_temp.id('o2') $$,
  $$ select pg_temp.id('b1'), 'awaiting_payment'::text,
            ((pg_temp.today() + 4)::timestamp at time zone 'Europe/Istanbul') $$,
  'the add-on order: base order, due by the end of the last add-on day');
select is((select (details ->> 'addon_of_order_id')::uuid from public.audit_event
           where action = 'order.created' and entity_id = pg_temp.id('o2')), pg_temp.id('b1'),
  'order.created names the base order');
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_extend_payment_due(%L, %L) $$,
  pg_temp.id('o2'), pg_temp.today() + 4)), '22023 invalid_input / due_on',
  'ops_extend_payment_due: not after the last add-on day');
select lives_ok(format($$ select public.ops_extend_payment_due(%L, %L) $$, pg_temp.id('o2'), pg_temp.today() + 3),
  'up to the last add-on day');
select pg_temp.pay(pg_temp.id('o2'));
select results_eq(
  $$ select status::text, service_start, service_end from public.service_order where id = pg_temp.id('o2') $$,
  $$ select 'active'::text, pg_temp.today(), pg_temp.today() + 32 $$,
  'paid: active from today with the base order''s end');
select is((select (details ->> 'addon_of_order_id')::uuid from public.audit_event
           where action = 'order.activated' and entity_id = pg_temp.id('o2')), pg_temp.id('b1'),
  'order.activated names the base order');
select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select is_addon, base_order_id, state, visits_entitled, visits_used, in_next_period, withdrawal_until
     from public.my_gardens() where order_id = pg_temp.id('o2') $$,
  $$ select true, pg_temp.id('b1'), 'in_service'::text, 3::smallint, 0, null::boolean, pg_temp.today() + 14 $$,
  'my_gardens: the add-on garden in service with its withdrawal period');
select is((select garden_count from public.my_service_period()), 2, 'the period counts both gardens');
select is((select count(*)::integer from public.my_service_period()), 1, 'an add-on is no period of its own');

-- Payment and acceptance after the last add-on day; activation refusal.
insert into ids select 'a3', pg_temp.new_app(pg_temp.id('c1'), array[15000], 37.40);
select testing.set_order_period(pg_temp.id('b1'), pg_temp.today() - 100, pg_temp.today() + 264);
select pg_temp.ops();
insert into ids select 'q3', public.ops_issue_addon_quote(pg_temp.id('b1'), pg_temp.id('a3'));
insert into ids select 'o3', pg_temp.accept(pg_temp.id('c1'), pg_temp.id('q3'));
insert into ids select 'a4', pg_temp.new_app(pg_temp.id('c1'), array[16000], 37.50);
select pg_temp.ops();
insert into ids select 'q4', public.ops_issue_addon_quote(pg_temp.id('b1'), pg_temp.id('a4'));
select testing.set_order_period(pg_temp.id('b1'), pg_temp.today() - 100, pg_temp.today() + 20);
select is(pg_temp.error_of($$ select public.payment_begin(pg_temp.id('o3'), pg_temp.id('c1'), 'fake', 'http://127.0.0.1:3100') $$),
  'P0001 addon_base_closed', 'no card payment after the last add-on day');
select pg_temp.as_user(pg_temp.id('c1'));
select is(pg_temp.error_of($$ select public.customer_accept_quote(pg_temp.id('q4'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}') $$),
  'P0001 addon_base_closed', 'no acceptance after the last add-on day');
select pg_temp.pay(pg_temp.id('o3'));
select results_eq(
  $$ select status::text, cancel_reason, service_start from public.service_order where id = pg_temp.id('o3') $$,
  $$ values ('cancelled'::text, 'addon_base_closed'::text, null::date) $$,
  'a transfer after the last add-on day: the add-on is cancelled, not activated');
-- The transfer is spread over the installments (one payment each): every one
-- goes back once the add-on is cancelled.
select results_eq(
  $$ select r.kind::text, r.reason::text, sum(r.amount_kurus)::bigint, r.status::text
     from public.refund r where r.order_id = pg_temp.id('o3') group by 1, 2, 4 $$,
  $$ select 'manual'::text, 'order_closed'::text, (select total_kurus from public.service_order where id = pg_temp.id('o3')),
            'requested'::text $$,
  'the money goes back (order_closed)');
select results_eq(
  $$ select actor_role, details ->> 'reason', (details ->> 'refunds')::integer from public.audit_event
     where action = 'order.activation_refused' and entity_id = pg_temp.id('o3') $$,
  $$ values ('system'::text, 'addon_base_closed'::text, 1) $$, 'order.activation_refused by the system');
select is((select count(*)::integer from public.service_order_item where order_id = pg_temp.id('o3') and parcel_id is not null),
  0, 'no parcel is opened');

-- 3. Two overlapping base orders, a paid renewal ---------------------------------------

insert into ids select 'c2', pg_temp.new_customer(2);
insert into ids select 'x1', pg_temp.new_order(pg_temp.id('c2'), array[20000], 37.60);
insert into ids select 'y1', pg_temp.new_order(pg_temp.id('c2'), array[25000], 37.70);
select testing.set_order_period(pg_temp.id('x1'), pg_temp.today() - 200, pg_temp.today() + 165);
select testing.set_order_period(pg_temp.id('y1'), pg_temp.today() - 30, pg_temp.today() + 335);
select pg_temp.as_user(pg_temp.id('c2'));
select results_eq(
  $$ select base_order_id, is_primary, period_count, addon_base_order_id from public.my_service_period() $$,
  $$ values (pg_temp.id('x1'), false, 2, pg_temp.id('y1')), (pg_temp.id('y1'), true, 2, pg_temp.id('y1')) $$,
  'two periods by their end; the later one is primary and takes add-ons');
select is((select (private.addon_base_order('b0000000-0000-4000-8000-000000000001', pg_temp.id('c2'))).id),
  pg_temp.id('y1'), 'addon_base_order: both start today, the later end wins');
select testing.set_order_period(pg_temp.id('y1'), pg_temp.today() + 10, pg_temp.today() + 374);
select is((select (private.addon_base_order('b0000000-0000-4000-8000-000000000001', pg_temp.id('c2'))).id),
  pg_temp.id('x1'), 'the period that serves today comes before one that starts later');
select testing.set_order_period(pg_temp.id('x1'), pg_temp.today() - 340, pg_temp.today() + 20);
select is((select (private.addon_base_order('b0000000-0000-4000-8000-000000000001', pg_temp.id('c2'))).id),
  pg_temp.id('y1'), 'a period with fewer than addon_min_days left is no add-on base');
select pg_temp.ops();
select results_eq(
  $$ select base_order_id, is_primary from public.ops_customer_service_period('b0000000-0000-4000-8000-000000000001',
       pg_temp.id('c2')) $$,
  $$ values (pg_temp.id('x1'), false), (pg_temp.id('y1'), true) $$, 'ops reads the same periods');

-- Merging (§4.4): X's garden moves to Y from the day after X ends.
select results_eq(
  $$ select id, renewal_due, addon_of_order_id from public.ops_orders('b0000000-0000-4000-8000-000000000001',
       p_customer_user_id => pg_temp.id('c2')) order by number $$,
  $$ values (pg_temp.id('x1'), true, null::uuid), (pg_temp.id('y1'), false, null::uuid) $$,
  'X ends within the notice: renewal due');
insert into ids select 'mq', public.ops_issue_addon_quote(pg_temp.id('y1'), p_parcel_ids => pg_temp.parcels_of(pg_temp.id('x1')),
  p_proposed_service_start => pg_temp.today() + 21);
select results_eq(
  $$ select proposed_service_start, (inputs -> 'areas' -> 0 ->> 'parcel_id')::uuid, (inputs -> 'areas' -> 0 ->> 'source'),
            (inputs -> 'areas' -> 0 ->> 'inventory')::boolean
     from public.quote where id = pg_temp.id('mq') $$,
  $$ select pg_temp.today() + 21, (pg_temp.parcels_of(pg_temp.id('x1')))[1], 'estimated'::text, true $$,
  'the parcel path: the parcel, its estimate, an inventory (none published)');
insert into ids select 'mo', pg_temp.accept(pg_temp.id('c2'), pg_temp.id('mq'));
select pg_temp.ops();
select is((select renewal_due from public.ops_orders('b0000000-0000-4000-8000-000000000001',
  p_customer_user_id => pg_temp.id('c2')) where id = pg_temp.id('x1')), false,
  'covered the day after X ends: no renewal due');
select results_eq(
  $$ select id, addon_of_order_id, renewal_due from public.ops_orders('b0000000-0000-4000-8000-000000000001',
       p_customer_user_id => pg_temp.id('c2')) where id = pg_temp.id('mo') $$,
  $$ values (pg_temp.id('mo'), pg_temp.id('y1'), false) $$, 'ops_orders.addon_of_order_id; an add-on is never due');
select is(pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  %L, '91200000-0000-4000-8000-000000000001', %L, false, null, %L) $$,
  pg_temp.id('c2'), pg_temp.parcels_of(pg_temp.id('x1')), pg_temp.id('mo'))),
  '22023 invalid_input / renewal_of_order_id', 'an add-on order is no renewal target');
select is(pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  %L, '91200000-0000-4000-8000-000000000001', %L, true, null) $$,
  pg_temp.id('c2'), pg_temp.parcels_of(pg_temp.id('y1')))),
  'P0001 parcel_in_service / parcel_ids', 'a parcel in service gets no second first-year quote');
select is(pg_temp.error_of(format($$ select public.ops_issue_addon_quote(%L, p_parcel_ids => %L) $$,
  pg_temp.id('y1'), pg_temp.parcels_of(pg_temp.id('x1')))),
  'P0001 parcel_in_service / parcel_ids', 'nor an add-on quote overlapping the pending one');

-- A paid renewal: one garden row, in the next period.
insert into ids select 'c3', pg_temp.new_customer(3);
insert into ids select 'r0', pg_temp.new_order(pg_temp.id('c3'), array[20000], 37.80);
select testing.set_order_period(pg_temp.id('r0'), pg_temp.today() - 340, pg_temp.today() + 24);
select pg_temp.ops();
insert into ids select 'rq', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c3'),
  '91200000-0000-4000-8000-000000000001', pg_temp.parcels_of(pg_temp.id('r0')), false, null, pg_temp.id('r0'));
select pg_temp.as_user(pg_temp.id('c3'));
select is((select renewal_quote_id from public.my_service_period()), pg_temp.id('rq'), 'the open renewal quote');
insert into ids select 'r1', pg_temp.accept(pg_temp.id('c3'), pg_temp.id('rq'));
select pg_temp.pay(pg_temp.id('r1'));
select pg_temp.as_user(pg_temp.id('c3'));
select results_eq(
  $$ select base_order_id, next_base_order_id, next_period_start, period_count from public.my_service_period() $$,
  $$ select pg_temp.id('r0'), pg_temp.id('r1'), pg_temp.today() + 25, 1 $$,
  'a paid renewal folds into the period it renews');
select results_eq(
  $$ select order_id, state, in_next_period, next_order_item_id from public.my_gardens() $$,
  $$ select pg_temp.id('r0'), 'in_service'::text, true,
            (select id from public.service_order_item where order_id = pg_temp.id('r1')) $$,
  'one garden row, in the next period');

-- 4. Coverage and limits --------------------------------------------------------------

-- An open removal effective by the renewal start refuses the renewal quote.
insert into ids select 'c4', pg_temp.new_customer(4);
insert into ids select 'g0', pg_temp.new_order(pg_temp.id('c4'), array[20000], 37.90);
select testing.set_order_period(pg_temp.id('g0'), pg_temp.today() - 300, pg_temp.today() + 64);
select pg_temp.as_user(pg_temp.id('c4'));
insert into ids select 'rm4', public.customer_request_garden_removal((pg_temp.parcels_of(pg_temp.id('g0')))[1], 'sold');
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  %L, '91200000-0000-4000-8000-000000000001', %L, false, null, %L) $$,
  pg_temp.id('c4'), pg_temp.parcels_of(pg_temp.id('g0')), pg_temp.id('g0'))),
  'P0001 garden_removal_open / parcel_ids', 'a renewal quote leaves out a garden that is leaving');
-- An acceptance after a removal request refuses the quote issued before it.
select pg_temp.as_user(pg_temp.id('c4'));
select public.customer_cancel_garden_removal(pg_temp.id('rm4'));
select pg_temp.ops();
insert into ids select 'rq4', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c4'),
  '91200000-0000-4000-8000-000000000001', pg_temp.parcels_of(pg_temp.id('g0')), false, null, pg_temp.id('g0'));
select pg_temp.as_user(pg_temp.id('c4'));
insert into ids select 'rm4b', public.customer_request_garden_removal((pg_temp.parcels_of(pg_temp.id('g0')))[1], 'sold');
select is(pg_temp.error_of($$ select pg_temp.accept(pg_temp.id('c4'), pg_temp.id('rq4')) $$),
  'P0001 garden_removal_open / parcel_ids', 'a removal requested after the renewal quote blocks its acceptance');

-- Account limit: 49 gardens in service, two quotes of one more each.
insert into ids select 'c5', pg_temp.new_customer(5);
insert into public.parcel (id, org_id, name, estimated_area_m2)
select ('f4500000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'))::uuid, 'b0000000-0000-4000-8000-000000000001',
       'Pilot 45-' || i, 15000
from generate_series(1, 51) i;
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
select 'b0000000-0000-4000-8000-000000000001', ('f4500000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'))::uuid,
       pg_temp.id('c5'), 'owner', null
from generate_series(1, 51) i;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  %L, '91200000-0000-4000-8000-000000000001', %L, true, null) $$, pg_temp.id('c5'),
  array(select ('f4500000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 51) i))),
  '22023 invalid_input / parcel_ids', 'a parcel quote takes at most 50 parcels');
insert into ids select 'l0', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c5'),
  '91200000-0000-4000-8000-000000000001',
  array(select ('f4500000-0000-4000-8000-0000000005' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 49) i),
  true, null);
insert into ids select 'lo', pg_temp.accept(pg_temp.id('c5'), pg_temp.id('l0'));
select pg_temp.pay(pg_temp.id('lo'));
select pg_temp.ops();
insert into ids select 'l1', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c5'),
  '91200000-0000-4000-8000-000000000001', array['f4500000-0000-4000-8000-000000000550'::uuid], true, null);
insert into ids select 'l2', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c5'),
  '91200000-0000-4000-8000-000000000001', array['f4500000-0000-4000-8000-000000000551'::uuid], true, null);
select is(pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  %L, '91200000-0000-4000-8000-000000000001', array['f4500000-0000-4000-8000-000000000550'::uuid,
  'f4500000-0000-4000-8000-000000000551'::uuid], true, null) $$, pg_temp.id('c5'))),
  'P0001 account_garden_limit', '49 + 2 gardens exceed the account limit');
select lives_ok($$ select pg_temp.accept(pg_temp.id('c5'), pg_temp.id('l1')) $$, 'the 50th garden is accepted');
select is(pg_temp.error_of($$ select pg_temp.accept(pg_temp.id('c5'), pg_temp.id('l2')) $$),
  'P0001 account_garden_limit', 'the 51st is refused at acceptance (pending orders count)');

-- 5. ops_terminate_order ----------------------------------------------------------------

insert into ids select 'c6', pg_temp.new_customer(6);
insert into ids select 't0', pg_temp.new_order(pg_temp.id('c6'), array[20000], 38.00);
select pg_temp.ops();
insert into ids select 'tq1', public.ops_issue_addon_quote(pg_temp.id('t0'), pg_temp.new_app(pg_temp.id('c6'), array[15000], 38.10));
insert into ids select 't1', pg_temp.accept(pg_temp.id('c6'), pg_temp.id('tq1'));
select pg_temp.pay(pg_temp.id('t1'));
select pg_temp.ops();
insert into ids select 'tq2', public.ops_issue_addon_quote(pg_temp.id('t0'), pg_temp.new_app(pg_temp.id('c6'), array[15000], 38.20));
insert into ids select 't2', pg_temp.accept(pg_temp.id('c6'), pg_temp.id('tq2'));
select pg_temp.ops();
insert into ids select 'tq3', public.ops_issue_addon_quote(pg_temp.id('t0'), pg_temp.new_app(pg_temp.id('c6'), array[15000], 38.30));
select pg_temp.as_user(pg_temp.id('c6'));
insert into ids select 'trm', public.customer_request_garden_removal((pg_temp.parcels_of(pg_temp.id('t1')))[1], 'cost');
select pg_temp.ops();
select lives_ok($$ select public.ops_terminate_order(pg_temp.id('t0'), 'idari fesih') $$, 'the base order is terminated');
select results_eq(
  $$ select id, status::text, coalesce(cancel_reason, termination_note) from public.service_order
     where id in (pg_temp.id('t0'), pg_temp.id('t1'), pg_temp.id('t2')) order by number $$,
  $$ values (pg_temp.id('t0'), 'terminated'::text, 'idari fesih'::text),
            (pg_temp.id('t1'), 'terminated'::text, 'base_terminated'::text),
            (pg_temp.id('t2'), 'cancelled'::text, 'base_terminated'::text) $$,
  'its active add-on ends, the unpaid add-on is cancelled');
select is((select status::text from public.quote where id = pg_temp.id('tq3')), 'cancelled', 'the open add-on quote is cancelled');
select is((select details ->> 'reason' from public.audit_event where action = 'quote.cancelled' and entity_id = pg_temp.id('tq3')),
  'base_closed', 'quote.cancelled: base_closed');
select results_eq(
  $$ select status::text, cancelled_by from public.garden_removal where id = pg_temp.id('trm') $$,
  $$ values ('cancelled'::text, 'system'::text) $$, 'the open removal on an ended order is cancelled by the system');
select is((select count(*)::integer from public.notification where template = 'garden_removal_cancelled'
           and ref_id = pg_temp.id('trm')), 0, 'no message for a system cancellation');

-- 6. Linked earlier parcel, transfer -----------------------------------------------------

insert into ids select 'c7', pg_temp.new_customer(7);
insert into ids select 'k0', pg_temp.new_order(pg_temp.id('c7'), array[20000], 38.40);
insert into ids select 'kp', (pg_temp.parcels_of(pg_temp.id('k0')))[1];
select pg_temp.ops();
select public.ops_terminate_order(pg_temp.id('k0'), 'eski dönem');
update public.parcel set status = 'passive' where id = pg_temp.id('kp');
delete from public.parcel_access where parcel_id = pg_temp.id('kp');
insert into ids select 'k1', pg_temp.new_order(pg_temp.id('c7'), array[18000], 38.50);
update private.parcel_detail set deed_block = 'eski' where parcel_id = pg_temp.id('kp');
insert into ids select 'ka', pg_temp.new_app(pg_temp.id('c7'), array[21000], 38.40,
  '[[38.4, 37.1], [38.402, 37.1], [38.402, 37.102], [38.4, 37.102]]'::jsonb);
insert into ids select 'kg', id from public.application_garden where application_id = pg_temp.id('ka');
select pg_temp.ops();
select results_eq(
  $$ select parcel_id, same_customer, in_service from public.ops_garden_overlaps(pg_temp.id('kg'))
     where parcel_id = pg_temp.id('kp') $$,
  $$ values (pg_temp.id('kp'), true, false) $$,
  'ops_garden_overlaps: the customer''s earlier parcel meets the rough boundary');
insert into ids select 'kq0', public.ops_issue_addon_quote(pg_temp.id('k1'), pg_temp.id('ka'));
select lives_ok($$ select public.ops_link_application_garden_parcel(pg_temp.id('kg'), pg_temp.id('kp')) $$,
  'the garden is linked to the earlier parcel');
select results_eq(
  $$ select (select status::text from public.quote where id = pg_temp.id('kq0')),
            (select status::text from public.service_application where id = pg_temp.id('ka')),
            (select parcel_id from public.application_garden where id = pg_temp.id('kg')) $$,
  $$ select 'cancelled'::text, 'submitted'::text, pg_temp.id('kp') $$,
  'linking a quoted application: open quote cancelled, back to review');
select is(pg_temp.error_of(format($$ select public.ops_link_application_garden_parcel(pg_temp.id('kg'), %L) $$,
  (pg_temp.parcels_of(pg_temp.id('k1')))[1])),
  'P0001 parcel_in_service', 'a parcel in service is not linked');
select is(pg_temp.error_of($$ select public.ops_link_application_garden_parcel(pg_temp.id('kg'),
  'c0000000-0000-4000-8000-000000000001') $$),
  'P0001 parcel_not_reusable', 'another owner''s parcel is not linked');
insert into ids select 'kq', public.ops_issue_addon_quote(pg_temp.id('k1'), pg_temp.id('ka'));
select is((select (inputs -> 'areas' -> 0 ->> 'inventory')::boolean from public.quote where id = pg_temp.id('kq')),
  true, 'no published inventory: the inventory fee is taken');
insert into ids select 'ko', pg_temp.accept(pg_temp.id('c7'), pg_temp.id('kq'));
select pg_temp.pay(pg_temp.id('ko'));
select results_eq(
  $$ select (select parcel_id from public.service_order_item where order_id = pg_temp.id('ko')),
            (select status::text from public.parcel where id = pg_temp.id('kp')),
            (select role::text from public.parcel_access where parcel_id = pg_temp.id('kp') and user_id = pg_temp.id('c7')),
            (select deed_block from private.parcel_detail where parcel_id = pg_temp.id('kp')),
            (select array_agg(version || ':' || source order by version) from public.boundary where parcel_id = pg_temp.id('kp')) $$,
  $$ select pg_temp.id('kp'), 'registered'::text, 'owner'::text, '45'::text, array['1:owner_declared'] $$,
  're-added: the same parcel out of passive, owner again, detail from the application, the boundary as a version');
-- A field survey boundary is kept: no owner_declared version over it.
insert into ids select 'fo', pg_temp.new_order(pg_temp.id('c7'), array[19000], 38.70);
insert into ids select 'fp', (pg_temp.parcels_of(pg_temp.id('fo')))[1];
insert into public.boundary (org_id, parcel_id, version, geom, source)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('fp'), 1,
  extensions.st_setsrid(extensions.st_geomfromtext('POLYGON((38.7 37.0, 38.701 37.0, 38.701 37.001, 38.7 37.0))'), 4326),
  'field_survey');
select pg_temp.ops();
select public.ops_terminate_order(o.id, 'eski') from public.service_order o
join public.service_order_item i on i.order_id = o.id where i.parcel_id = pg_temp.id('fp');
insert into ids select 'fa', pg_temp.new_app(pg_temp.id('c7'), array[19000], 38.80,
  '[[38.8, 37.1], [38.802, 37.1], [38.802, 37.102], [38.8, 37.102]]'::jsonb);
select pg_temp.ops();
select public.ops_link_application_garden_parcel(g.id, pg_temp.id('fp'))
from public.application_garden g where g.application_id = pg_temp.id('fa');
select pg_temp.pay(pg_temp.accept(pg_temp.id('c7'), public.ops_issue_addon_quote(pg_temp.id('k1'), pg_temp.id('fa'))));
select is((select array_agg(version || ':' || source order by version) from public.boundary where parcel_id = pg_temp.id('fp')),
  array['1:field_survey'], 'a parcel with a field survey keeps it: no new version');

-- Transfer: never linked or quoted again for the customer.
insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name,
  status, initiated_by, reason, requested_effective_on, effective_on, access_days, access_until, scheduled_at,
  completed_at, refund_mode, refund_kurus)
select 'b0000000-0000-4000-8000-000000000001', pg_temp.id('c7'), 'C-2026-945001', i.parcel_id, i.order_id, i.id,
       i.garden_name, 'completed', 'ops', 'transfer', pg_temp.today(), pg_temp.today(), 0, pg_temp.today(), now(), now(),
       'none', 0
from public.service_order_item i where i.parcel_id = pg_temp.id('fp') and i.order_id <> (
  select o.id from public.service_order o join public.service_order_item x on x.order_id = o.id
  where x.parcel_id = pg_temp.id('fp') order by o.created_at desc limit 1);
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_issue_addon_quote(%L, p_parcel_ids => array[%L]::uuid[]) $$,
  pg_temp.id('k1'), pg_temp.id('fp'))), 'P0001 parcel_not_reusable / parcel_ids',
  'a transferred parcel gets no add-on quote');
select is(pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  %L, '91200000-0000-4000-8000-000000000001', array[%L]::uuid[], true, null) $$, pg_temp.id('c7'), pg_temp.id('fp'))),
  'P0001 parcel_not_reusable / parcel_ids', 'nor a parcel quote');
insert into ids select 'ta', pg_temp.new_app(pg_temp.id('c7'), array[19000], 38.90);
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_link_application_garden_parcel(g.id, %L)
  from public.application_garden g where g.application_id = %L $$, pg_temp.id('fp'), pg_temp.id('ta'))),
  'P0001 parcel_not_reusable', 'nor is it linked');

-- 7. Withdrawn gardens, order revision --------------------------------------------------

insert into ids select 'c8', pg_temp.new_customer(8);
insert into ids select 'wa', pg_temp.new_app(pg_temp.id('c8'), array[15000, 16000], 39.00);
select pg_temp.ops();
insert into ids select 'wq', public.ops_issue_quote(pg_temp.id('wa'));
insert into ids select 'wg1', id from public.application_garden where application_id = pg_temp.id('wa') and sort_order = 1;
insert into ids select 'wg2', id from public.application_garden where application_id = pg_temp.id('wa') and sort_order = 2;
select pg_temp.as_user(pg_temp.id('c8'));
select lives_ok($$ select public.customer_withdraw_application_garden(pg_temp.id('wg2')) $$, 'a garden is withdrawn');
select results_eq(
  $$ select (select withdrawn_at is not null from public.application_garden where id = pg_temp.id('wg2')),
            (select status::text from public.quote where id = pg_temp.id('wq')),
            (select status::text from public.service_application where id = pg_temp.id('wa')) $$,
  $$ values (true, 'cancelled'::text, 'submitted'::text) $$,
  'withdrawn; the open quote is cancelled and the application is back in review');
select is(pg_temp.error_of($$ select public.customer_withdraw_application_garden(pg_temp.id('wg2')) $$),
  'P0001 garden_withdrawn', 'once');
select is(pg_temp.error_of($$ select public.customer_withdraw_application_garden(pg_temp.id('wg1')) $$),
  'P0001 last_garden', 'the last garden is not withdrawn alone');
select pg_temp.ops();
select is((select array_agg(application_garden_id) from public.ops_preview_quote(pg_temp.id('wa'))),
  array[pg_temp.id('wg1')], 'previews leave the withdrawn garden out');
select is(pg_temp.error_of($$ select public.ops_verify_application_garden(pg_temp.id('wg2'), 16000) $$),
  'P0001 garden_withdrawn', 'and verification refuses it');
insert into ids select 'wq2', public.ops_issue_quote(pg_temp.id('wa'));
select is((select count(*)::integer from public.quote_item where quote_id = pg_temp.id('wq2')), 1,
  'the new quote has one line');
select is(pg_temp.error_of($$ select public.ops_withdraw_application_garden(pg_temp.id('wg1'), null) $$),
  '22023 invalid_input / note', 'ops withdraws with a note');
insert into ids select 'wo', pg_temp.accept(pg_temp.id('c8'), pg_temp.id('wq2'));
select is(public.customer_revise_order(pg_temp.id('wo'), 'bir bahçe eksik'), pg_temp.id('wa'),
  'customer_revise_order returns the application');
select results_eq(
  $$ select (select status::text || '/' || cancel_reason from public.service_order where id = pg_temp.id('wo')),
            (select status::text from public.service_application where id = pg_temp.id('wa')),
            (select customer_note from public.service_application where id = pg_temp.id('wa')) $$,
  $$ values ('cancelled/customer_revision'::text, 'submitted'::text, 'bir bahçe eksik'::text) $$,
  'the order is cancelled and the application reopened');
select is((select count(*)::integer from public.audit_event where action = 'application.reopened'
           and entity_id = pg_temp.id('wa') and actor_role = 'customer'), 1, 'application.reopened is audited');
select is(pg_temp.error_of($$ select public.customer_revise_order(pg_temp.id('wo')) $$),
  'P0001 order_not_payable', 'a cancelled order is not revised again');
select pg_temp.as_user(pg_temp.id('c5'));
select is(pg_temp.error_of($$ select public.customer_revise_order(pg_temp.id('lo')) $$),
  'P0001 not_revisable', 'an order of a parcel quote has no application to reopen');
select pg_temp.as_user(pg_temp.id('c8'));
select is(pg_temp.error_of($$ select public.customer_revise_order(pg_temp.id('lo')) $$),
  'P0002 not_found', 'only the customer''s own order');

-- 8. Service status -------------------------------------------------------------------------

select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select status from public.parcel_service_status((pg_temp.parcels_of(pg_temp.id('b1')))[1]) $$,
  $$ values ('in_service'::text) $$, 'parcel_service_status: in service');
select is((select count(*)::integer from public.parcel_service_status((pg_temp.parcels_of(pg_temp.id('k1')))[1])), 0,
  'no row for a parcel without access');
select pg_temp.ops();
select is((select status from public.parcel_service_status('c0000000-0000-4000-8000-000000000001')), 'none',
  'a pilot parcel without an order: none');

-- 9. Errors of the reads --------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select * from public.customer_addon_preview(array[15000]) $$),
  'P0001 no_membership', 'customer_addon_preview without a membership');
select pg_temp.as_user(pg_temp.id('c2'));
select testing.set_order_period(pg_temp.id('x1'), pg_temp.today() - 340, pg_temp.today() + 20);
select testing.set_order_period(pg_temp.id('y1'), pg_temp.today() - 340, pg_temp.today() + 10);
select is(pg_temp.error_of($$ select * from public.customer_addon_preview(array[15000]) $$),
  'P0001 addon_period_too_short', 'every period is past its last add-on day');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select * from public.customer_addon_preview(array[15000]) $$),
  'P0001 not_customer', 'a non-customer');
select is((select count(*)::integer from public.my_service_period()) + (select count(*)::integer from public.my_gardens()),
  0, 'my_* are empty without orders');
select pg_temp.ops();
select is(pg_temp.error_of($$ select * from public.ops_customer_gardens('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000005') $$), '42501 forbidden', 'ops never reads their own customer record');

select * from finish();
rollback;
