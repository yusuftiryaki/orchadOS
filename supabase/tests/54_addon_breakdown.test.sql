-- Add-on quote breakdown, visit windows, inventory reuse and the
-- addon_order_closed message (docs/hukuk/kararlar.md H19, T18; contract 8D/2,
-- 8D/3, 8D/6, Ek-2).
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4, 12 500 a
-- visit and dönüm, minimum 500 000). A price list v2 with an inventory fee of
-- 100 000 is published here. One transaction: the Istanbul day is constant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
create temporary table tday on commit drop as select private.istanbul_today() as d;
create function pg_temp.today() returns date language sql stable as $$ select d from tday $$;
create temporary table ids (k text primary key, v uuid) on commit drop;
grant select, insert on tday, ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
grant execute on all functions in schema pg_temp to authenticated;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f5400000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c54-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 54-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;
create function pg_temp.accept(p_user uuid, p_quote uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.as_user(p_user);
  return public.customer_accept_quote(p_quote,
    '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak", "early_performance": "mesafeli-v5-taslak"}');
end;
$$;
create function pg_temp.pay(p_order uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  perform testing.use_single_installment(p_order);
  return public.ops_record_manual_payment(p_order,
    (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order),
    current_date, 'EFT-54-' || left(p_order::text, 8));
end;
$$;
-- An active base order of one new garden.
create function pg_temp.new_order(p_user uuid, p_area numeric, p_lon numeric) returns uuid language plpgsql
as $$
declare
  a uuid;
  o uuid;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  perform public.customer_save_application_garden(a,
    jsonb_build_object('name', 'Bahçe ' || p_lon, 'declared_area_m2', p_area, 'lon', p_lon, 'lat', 37.2),
    '{"authorization_basis": "title_holder", "entry_permission": true}');
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2)
  from public.application_garden x where x.application_id = a;
  o := pg_temp.accept(p_user, public.ops_issue_quote(a));
  perform pg_temp.pay(o);
  return o;
end;
$$;
create function pg_temp.parcel_of(p_order uuid) returns uuid language sql stable
as $$ select parcel_id from public.service_order_item where order_id = p_order and line_no = 1 $$;

-- 1. Visit windows (Ek-2) ----------------------------------------------------------------------

select results_eq($$ select code, name, start_month, end_month from public.contract_visit_windows() $$,
  $$ values ('winter', 'Kış', 12, 2), ('spring', 'İlkbahar', 4, 5), ('summer', 'Yaz', 6, 7), ('harvest', 'Hasat', 8, 10) $$,
  'the four windows of Ek-2 (no March, no November)');
select is((select jsonb_agg(x ->> 'label') from jsonb_array_elements(private.remaining_visit_windows('2026-05-15', '2027-01-10')) x),
  '["İlkbahar 2026", "Yaz 2026", "Hasat 2026", "Kış 2026–2027"]'::jsonb,
  'a partly elapsed window counts while one of its days is left');
select is((select jsonb_agg(x ->> 'label') from jsonb_array_elements(private.remaining_visit_windows('2026-11-01', '2027-03-31')) x),
  '["Kış 2026–2027"]'::jsonb, 'November and March are outside every window');
select is(jsonb_array_length(private.remaining_visit_windows('2026-03-01', '2026-03-31')), 0, 'March alone: none');
select is((select jsonb_agg(x ->> 'label') from jsonb_array_elements(private.remaining_visit_windows('2026-01-15', '2027-01-14')) x),
  '["Kış 2025–2026", "İlkbahar 2026", "Yaz 2026", "Hasat 2026", "Kış 2026–2027"]'::jsonb,
  'a year from mid-January meets the winter twice');
select is((select x from jsonb_array_elements(private.remaining_visit_windows('2027-02-28', '2027-02-28')) x),
  '{"code": "winter", "name": "Kış", "label": "Kış 2026–2027", "start": "2026-12-01", "end": "2027-02-28"}'::jsonb,
  'the last day of a window still counts; dates and label');

-- 2. Base orders and an existing parcel --------------------------------------------------------

insert into public.price_list (id, org_id, status, valid_from, vat_rate_bp)
values ('f5400000-0000-4000-8000-000000000901', 'b0000000-0000-4000-8000-000000000001', 'draft', pg_temp.today(), 2000);
insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus)
values ('b0000000-0000-4000-8000-000000000001', 'f5400000-0000-4000-8000-000000000901',
        '91200000-0000-4000-8000-000000000001', 12500, 500000, 100000),
       ('b0000000-0000-4000-8000-000000000001', 'f5400000-0000-4000-8000-000000000901',
        '91200000-0000-4000-8000-000000000002', 13000, 450000, 0);
update public.price_list set status = 'published', version = 2, published_at = now()
where id = 'f5400000-0000-4000-8000-000000000901';

insert into ids values ('c1', pg_temp.new_customer(1));
-- X: an earlier order whose garden ends in 20 days; Y: the base the garden joins.
insert into ids select 'x', pg_temp.new_order(pg_temp.id('c1'), 20000, 37.801);
insert into ids select 'y', pg_temp.new_order(pg_temp.id('c1'), 15000, 37.811);
insert into ids select 'px', pg_temp.parcel_of(pg_temp.id('x'));
select testing.set_order_period(pg_temp.id('x'), pg_temp.today() - 345, pg_temp.today() + 19);
select testing.set_order_period(pg_temp.id('y'), pg_temp.today() - 100, pg_temp.today() + 264);
-- X's garden had a published inventory 300 days ago.
insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('px'), 'inventory', 'published', pg_temp.today() - 300,
        (pg_temp.today() - 300 + interval '9 hours')::timestamp at time zone 'Europe/Istanbul');

-- 3. Inventory reuse (8D/3) ---------------------------------------------------------------------

set local role authenticated;
select pg_temp.ops();
select results_eq(
  $$ select inventory, inventory_fee_kurus, inventory_reason, last_inventory_on
     from public.ops_preview_addon_quote(pg_temp.id('y'), p_parcel_ids => array[pg_temp.id('px')],
       p_proposed_service_start => pg_temp.today() + 20) $$,
  $$ select false, 0::bigint, 'inventory_reused'::text, pg_temp.today() - 300 $$,
  'within 24 months of its last inventory the garden pays no inventory fee');
reset role;
update public.org_billing_setting set inventory_reuse_months = 6 where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.ops();
select results_eq(
  $$ select inventory, inventory_fee_kurus, inventory_reason
     from public.ops_preview_addon_quote(pg_temp.id('y'), p_parcel_ids => array[pg_temp.id('px')],
       p_proposed_service_start => pg_temp.today() + 20) $$,
  $$ values (true, 100000::bigint, 'inventory_expired'::text) $$,
  'past the window (SQL setting, here 6 months) the fee is a line with its reason');
reset role;
update public.org_billing_setting set inventory_reuse_months = 24 where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select * from public.ops_preview_addon_quote(%L, p_parcel_ids => array[%L]::uuid[],
  p_new_inventory => '{"c0000000-0000-4000-8000-000000000001": "x"}') $$, pg_temp.id('y'), pg_temp.id('px'))),
  '22023 invalid_input / new_inventory', 'ops marks only the quoted gardens');
select is(pg_temp.error_of(format($$ select * from public.ops_preview_addon_quote(%L, p_parcel_ids => array[%L]::uuid[],
  p_new_inventory => jsonb_build_object(%L, '')) $$, pg_temp.id('y'), pg_temp.id('px'), pg_temp.id('px'))),
  '22023 invalid_input / new_inventory', 'with a reason');
select results_eq(
  format($$ select inventory_fee_kurus, inventory_reason, inventory_note
     from public.ops_preview_addon_quote(%L, p_parcel_ids => array[%L]::uuid[],
       p_proposed_service_start => %L, p_new_inventory => jsonb_build_object(%L, 'Sınır değişti; yeni envanter gerekli')) $$,
     pg_temp.id('y'), pg_temp.id('px'), pg_temp.today() + 20, pg_temp.id('px')),
  $$ values (100000::bigint, 'ops_required'::text, 'Sınır değişti; yeni envanter gerekli'::text) $$,
  'ops marks a new inventory as needed, with the reason');

-- 4. Breakdown (H19) -------------------------------------------------------------------------------

-- Read as postgres (expected values use private helpers); the claims still name ops.
reset role;

select results_eq(
  $$ select visits, raw_visits, basis, full_year_total_kurus, price_list_name,
            jsonb_array_length(remaining_windows) = jsonb_array_length(private.remaining_visit_windows(pg_temp.today() + 20, pg_temp.today() + 264))
     from public.ops_preview_addon_quote(pg_temp.id('y'), p_parcel_ids => array[pg_temp.id('px')],
       p_proposed_service_start => pg_temp.today() + 20) $$,
  $$ select private.addon_visits(4::smallint, pg_temp.today() + 20, pg_temp.today() - 100, pg_temp.today() + 264),
            round(4 * 245 / 365.0, 4), 'visits'::text,
            (select line_total_kurus from private.price_lines_v2('b0000000-0000-4000-8000-000000000001',
              '91200000-0000-4000-8000-000000000001', array[20000], array[false], 4::smallint)),
            'Fiyat listesi v2'::text, true $$,
  'the preview returns raw and rounded visits, the basis, the full-year price, the list name and the windows');
insert into ids select 'q', public.ops_issue_addon_quote(pg_temp.id('y'), p_parcel_ids => array[pg_temp.id('px')],
  p_proposed_service_start => pg_temp.today() + 20);
reset role;
select results_eq(
  $$ select (inputs -> 'addon' ->> 'raw_visits')::numeric, (inputs -> 'addon' ->> 'rounded_visits')::integer,
            inputs -> 'addon' ->> 'rounding', inputs -> 'addon' ->> 'price_list_name',
            (inputs -> 'addon' ->> 'remaining_window_count')::integer = jsonb_array_length(inputs -> 'addon' -> 'remaining_windows'),
            inputs -> 'addon' -> 'lines' -> 0 ->> 'inventory_reason', inputs -> 'areas' -> 0 ->> 'inventory_reason'
     from public.quote where id = pg_temp.id('q') $$,
  $$ values (round(4 * 245 / 365.0, 4), 3, 'half_up'::text, 'Fiyat listesi v2'::text, true, 'inventory_reused'::text,
             'inventory_reused'::text) $$,
  'the quote stores the breakdown in inputs.addon');
select results_eq(
  $$ select (l ->> 'visit_amount_kurus')::bigint, (l ->> 'minimum_fee_kurus')::bigint, l ->> 'basis',
            (l ->> 'inventory_fee_kurus')::bigint, (l ->> 'line_vat_kurus')::bigint, (l ->> 'line_total_kurus')::bigint,
            (l ->> 'line_total_kurus')::bigint = (select line_total_kurus from public.quote_item where quote_id = pg_temp.id('q'))
     from public.quote q, jsonb_array_elements(q.inputs -> 'addon' -> 'lines') l where q.id = pg_temp.id('q') $$,
  $$ values (750000::bigint, 375000::bigint, 'visits'::text, 0::bigint, 150000::bigint, 900000::bigint, true) $$,
  '20 dönüm, 3 visits: 750 000 against a prorated minimum of 375 000; VAT and total equal the quote line');
select is((select (inputs -> 'addon' -> 'lines' -> 0 ->> 'full_year_total_kurus')::bigint from public.quote where id = pg_temp.id('q')),
  1200000::bigint, 'the same garden''s full-year price (4 visits, no inventory)');
select ok((select (inputs -> 'addon' ->> 'visits_exceed_windows')::boolean = (3 > (inputs -> 'addon' ->> 'remaining_window_count')::integer)
           from public.quote where id = pg_temp.id('q')), 'visits_exceed_windows compares the entitlement with the windows');

-- A small garden: the prorated minimum is charged.
insert into ids select 'c2', pg_temp.new_customer(2);
insert into ids select 'y2', pg_temp.new_order(pg_temp.id('c2'), 15000, 37.821);
select testing.set_order_period(pg_temp.id('y2'), pg_temp.today() - 100, pg_temp.today() + 264);
select pg_temp.as_user(pg_temp.id('c2'));
select results_eq(
  $$ select visits, basis, line_base_kurus, raw_visits, price_list_name, jsonb_typeof(remaining_windows)
     from public.customer_addon_preview(array[2000]) $$,
  $$ select private.addon_visits(4::smallint, pg_temp.today(), pg_temp.today() - 100, pg_temp.today() + 264),
            'minimum'::text,
            round(500000.0 * private.addon_visits(4::smallint, pg_temp.today(), pg_temp.today() - 100, pg_temp.today() + 264) / 4)::bigint
              + 100000,
            round(4 * 265 / 365.0, 4), 'Fiyat listesi v2'::text, 'array'::text $$,
  'the customer preview: a 2-dönüm garden pays the prorated minimum and the inventory fee');
reset role;

-- 5. addon_order_closed (8D/6) ------------------------------------------------------------------

insert into ids select 'ao', pg_temp.accept(pg_temp.id('c1'), pg_temp.id('q'));
reset role;
-- The base closes before the payment arrives: the activation is refused.
select testing.set_order_period(pg_temp.id('y'), pg_temp.today() - 360, pg_temp.today() + 4);
select pg_temp.pay(pg_temp.id('ao'));
reset role;
select results_eq(
  $$ select status::text, cancel_reason from public.service_order where id = pg_temp.id('ao') $$,
  $$ values ('cancelled'::text, 'addon_base_closed'::text) $$, 'paid after the last add-on day: cancelled');
select results_eq(
  $$ select template::text, vars from public.notification where ref_id = pg_temp.id('ao') and template = 'addon_order_closed' $$,
  $$ select 'addon_order_closed'::text, jsonb_build_object('ref', number, 'path', '/portal/siparis/' || id)
     from public.service_order where id = pg_temp.id('ao') $$,
  'addon_order_closed is queued with the order number and its page');
select is((select reason::text from public.refund where order_id = pg_temp.id('ao')), 'order_closed',
  'the refund rules are unchanged (order_closed)');
update public.service_order set cancel_reason = cancel_reason where id = pg_temp.id('ao');
select is((select count(*)::integer from public.notification where ref_id = pg_temp.id('ao') and template = 'addon_order_closed'), 1,
  'once');

-- 6. Unchanged ------------------------------------------------------------------------------------

select ok(private.parcel_has_inventory(pg_temp.id('px')), 'parcel_has_inventory keeps its meaning for other callers');
select ok(not has_function_privilege('authenticated', 'private.addon_breakdown(uuid, uuid, jsonb, date, date, date, smallint, integer, date)', 'execute'),
  'the breakdown is internal');
select ok(has_function_privilege('anon', 'public.contract_visit_windows()', 'execute'), 'the windows are public');

select * from finish();
rollback;
