-- Per-visit payment plan (installments-v1; docs/musteri-yonetimi.md §5.6,
-- §6.14; docs/fiyatlandirma.md §2a; docs/hukuk/kararlar.md H35): the schedule
-- (amounts, rounding, due days, the launch examples), the plan on the quote
-- and on the order, activation by the first installment, card and transfer
-- payments per installment, the planning ban and its override, the window
-- lapse, reminders, termination, removal and withdrawal with unpaid
-- installments, add-ons, the ops readers and the column grants.
-- Seed: org b0..01, ops a0..05, packages temel ..0002 (V = 2), standart ..0001
-- (V = 4), kapsamli ..0003 (V = 6); launch price list v1 (20 dönüm Standart
-- first year 2 448 000 kuruş: inventory 720 000 + 4 × 432 000). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

select testing.reset_to_seed();
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';

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

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f5600000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c56-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 56-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city, email)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep',
          'c56-' || p_n || '@example.test');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

-- A first-year quote of verified gardens (m²) of a new application.
create function pg_temp.new_quote(p_user uuid, p_areas numeric[], p_lon numeric, p_package uuid
  default '91200000-0000-4000-8000-000000000001', p_discount integer default 0) returns uuid language plpgsql
as $$
declare
  a uuid;
  i integer;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application(p_package);
  for i in 1 .. cardinality(p_areas) loop
    perform public.customer_save_application_garden(a,
      jsonb_build_object('name', 'Bahçe ' || p_lon || '-' || i, 'declared_area_m2', p_areas[i],
        'lon', p_lon + i * 0.01, 'lat', 37.3),
      '{"authorization_basis": "title_holder", "entry_permission": true}');
  end loop;
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2)
  from public.application_garden x where x.application_id = a;
  return public.ops_issue_quote(a, null, null, p_discount, case when p_discount > 0 then 'Komşu bahçe indirimi' end);
end;
$$;

-- A pilot parcel of the customer (m²) and a yearly (no inventory) quote for it.
create function pg_temp.parcel_quote(p_user uuid, p_n integer, p_area numeric, p_package uuid) returns uuid
language plpgsql
as $$
declare
  v_parcel uuid := ('f5600000-0000-4000-8000-0000000002' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into public.parcel (id, org_id, name, estimated_area_m2)
  values (v_parcel, 'b0000000-0000-4000-8000-000000000001', 'Pilot 56-' || p_n, p_area);
  insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
  values ('b0000000-0000-4000-8000-000000000001', v_parcel, p_user, 'owner', null);
  perform pg_temp.ops();
  return public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', p_user, p_package,
    array[v_parcel], false, null);
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

-- A fake card payment of the earliest open installment, succeeded.
create function pg_temp.card_pay(p_user uuid, p_order uuid) returns uuid language plpgsql
as $$
declare
  b jsonb;
  v_id uuid;
begin
  b := public.payment_begin(p_order, p_user, 'fake', 'http://127.0.0.1:3100');
  v_id := (b ->> 'payment_id')::uuid;
  perform public.payment_attach_token(v_id, 'tok56_' || v_id, now() + interval '30 minutes');
  perform public.payment_finalize(v_id, 'succeeded', jsonb_build_object('provider_payment_id', 'fp56_' || v_id,
    'provider_amount_kurus', (b ->> 'amount_kurus')::bigint, 'paid_kurus', (b ->> 'amount_kurus')::bigint,
    'installment', 1, 'fraud_status', 1));
  return v_id;
end;
$$;

create function pg_temp.plan_of(p_order uuid) returns table (seq integer, kind text, amount bigint, status text)
language sql stable
as $$ select seq::integer, kind::text, amount_kurus, status::text from public.order_installment
      where order_id = p_order order by seq $$;
create function pg_temp.inst(p_order uuid, p_seq integer) returns public.order_installment language sql stable
security definer
as $$ select * from public.order_installment where order_id = p_order and seq = p_seq $$;
create function pg_temp.parcel_of(p_order uuid) returns uuid language sql stable
as $$ select parcel_id from public.service_order_item where order_id = p_order and line_no = 1 $$;
create function pg_temp.item_of(p_order uuid) returns uuid language sql stable
as $$ select id from public.service_order_item where order_id = p_order and line_no = 1 $$;
create function pg_temp.plan_sql(p_parcel uuid, p_day date) returns text language sql stable
as $$
  select format($f$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
    values ('b0000000-0000-4000-8000-000000000001', %L, 'periodic_scan', 'planned', %L) $f$, p_parcel, p_day);
$$;
grant execute on all functions in schema pg_temp to authenticated;

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3)),
  ('c4', pg_temp.new_customer(4)), ('c5', pg_temp.new_customer(5)), ('c6', pg_temp.new_customer(6));

-- 1. Schedule ---------------------------------------------------------------------------------------

insert into ids select 'q1', pg_temp.new_quote(pg_temp.id('c1'), array[20000], 37.10);
select results_eq(
  $$ select seq, kind::text, visit_no, window_code, window_start, window_end, amount_kurus, vat_kurus, due_on, due_rule
     from private.installment_schedule(pg_temp.id('q1'), '2026-11-01', '2026-11-15') order by seq $$,
  $$ values (1, 'inventory'::text, null::integer, null::text, null::date, null::date, 720000::bigint, 120000::bigint,
             '2026-11-15'::date, 'payment_period'::text),
            (2, 'visit', 1, 'winter', '2026-12-15', '2027-02-15', 432000, 72000, '2026-12-01', 'window'),
            (3, 'visit', 2, 'spring', '2027-04-15', '2027-05-15', 432000, 72000, '2027-04-01', 'window'),
            (4, 'visit', 3, 'summer', '2027-07-01', '2027-07-25', 432000, 72000, '2027-06-17', 'window'),
            (5, 'visit', 4, 'harvest', '2027-09-15', '2027-10-31', 432000, 72000, '2027-09-01', 'window') $$,
  'Standart, 20 dönüm, first year accepted on 1 November: 7 200 TL inventory, then 4 × 4 320 TL 14 days before each window');
select is((select sum(amount_kurus) from private.installment_schedule(pg_temp.id('q1'), '2026-11-01', '2026-11-15')),
  (select total_kurus::numeric from public.quote where id = pg_temp.id('q1')), 'the plan sums to the quote total');
select results_eq(
  $$ select due_on, due_rule from private.installment_schedule(pg_temp.id('q1'), '2026-12-10', '2026-12-24') order by seq $$,
  $$ values ('2026-12-24'::date, 'payment_period'::text), ('2026-12-24', 'acceptance'), ('2027-04-01', 'window'),
            ('2027-06-17', 'window'), ('2027-09-01', 'window') $$,
  'a window whose due day has passed is due at acceptance, never before an earlier installment');

insert into ids select 'qt', pg_temp.parcel_quote(pg_temp.id('c2'), 1, 20000, '91200000-0000-4000-8000-000000000002');
select results_eq(
  $$ select amount_kurus, window_code, due_on, due_rule from private.installment_schedule(pg_temp.id('qt'), '2026-11-01', '2026-11-15')
     order by seq $$,
  $$ values (499200::bigint, 'winter'::text, '2026-12-01'::date, 'window'::text),
            (499200, 'harvest', '2027-09-01', 'window') $$,
  'Temel, 20 dönüm, a yearly order: 2 × 4 992 TL, the first one activates (due by its window, not before the payment period)');
insert into ids select 'qk', pg_temp.parcel_quote(pg_temp.id('c2'), 2, 20000, '91200000-0000-4000-8000-000000000003');
select results_eq(
  $$ select amount_kurus, window_code, due_on from private.installment_schedule(pg_temp.id('qk'), '2026-11-01', '2026-11-15')
     order by seq $$,
  $$ values (403200::bigint, 'winter'::text, '2026-12-01'::date), (403200, 'awakening', '2027-02-24'),
            (403200, 'spring', '2027-04-01'), (403200, 'summer', '2027-06-17'), (403200, 'pre_harvest', '2027-07-18'),
            (403200, 'harvest', '2027-09-01') $$,
  'Kapsamlı, 20 dönüm, yearly: 6 × 4 032 TL in its six windows');
select is((select window_name from private.installment_schedule(pg_temp.id('qk'), '2026-11-01', '2026-11-15') where seq = 6),
  'Hasat sonrası', 'Kapsamlı names its harvest window Hasat sonrası');
insert into ids select 'q10', pg_temp.parcel_quote(pg_temp.id('c2'), 3, 10000, '91200000-0000-4000-8000-000000000001');
select is((select array_agg(amount_kurus order by seq) from private.installment_schedule(pg_temp.id('q10'), '2026-11-01', '2026-11-15')),
  array[336000, 336000, 336000, 336000]::bigint[], 'Standart, 10 dönüm (minimum fee), yearly: 4 × 3 360 TL');

-- Rounding: two lines, 10 % off.
insert into ids select 'qr', pg_temp.new_quote(pg_temp.id('c1'), array[15000, 23456], 37.20, '91200000-0000-4000-8000-000000000001', 1000);
create temporary table sr on commit drop as
  select * from private.installment_schedule(pg_temp.id('qr'), '2026-11-01', '2026-11-15');
select is((select sum(amount_kurus) from sr), (select total_kurus::numeric from public.quote where id = pg_temp.id('qr')),
  'with a discount and two lines the plan still sums to the total');
select is((select sum(vat_kurus) from sr), (select vat_kurus::numeric from public.quote where id = pg_temp.id('qr')),
  'and its VAT to the quote VAT');
select ok((select bool_and(s.amount_kurus = (select sum((x ->> 'amount_kurus')::bigint) from jsonb_array_elements(s.items) x))
           from sr s), 'each installment is the sum of its line shares');
select is((select sum((x ->> 'amount_kurus')::bigint) from sr s, jsonb_array_elements(s.items) x
           where x ->> 'quote_item_id' = (select id::text from public.quote_item where quote_id = pg_temp.id('qr') and line_no = 2)),
  (select line_total_kurus::numeric from public.quote_item where quote_id = pg_temp.id('qr') and line_no = 2),
  'a line''s shares sum to its line total');
select is((select amount_kurus from sr where seq = 1),
  (select sum(n.net + round(n.net::numeric * 2000 / 10000))::bigint
   from public.quote_item i, lateral (select i.inventory_fee_kurus - round(i.inventory_fee_kurus * 0.1)::bigint as net) n
   where i.quote_id = pg_temp.id('qr')),
  'the inventory installment is the inventory fee less its discount, plus VAT');
select ok((select max(amount_kurus) - min(amount_kurus) < 4 and max(amount_kurus) = (select amount_kurus from sr where seq = 5)
           from sr where kind = 'visit'), 'visit installments are equal in kuruş, the remainder on the last');

-- 2. Quote page and order ------------------------------------------------------------------------

select pg_temp.as_user(pg_temp.id('c1'));
select is((select count(*)::integer from public.quote_installment_plan(pg_temp.id('q1'))), 5, 'the customer sees the plan');
select is((select inputs -> 'installments' ->> 'formula' from public.quote where id = pg_temp.id('q1')), 'installments-v1',
  'the quote freezes the formula');
select is((select (inputs -> 'installments' ->> 'lead_days')::integer from public.quote where id = pg_temp.id('q1')), 14,
  'and the lead time');
select pg_temp.as_user(pg_temp.id('c2'));
select is((select count(*)::integer from public.quote_installment_plan(pg_temp.id('q1'))), 0, 'another customer sees nothing');
create temporary table shown on commit drop as select * from public.quote_installment_plan(pg_temp.id('qt'));
grant select on shown to authenticated;
insert into ids select 'o1', pg_temp.accept(pg_temp.id('c1'), pg_temp.id('q1'));
select results_eq(
  $$ select seq, kind, amount, status from pg_temp.plan_of(pg_temp.id('o1')) $$,
  $$ values (1, 'inventory'::text, 720000::bigint, 'pending'::text), (2, 'visit', 432000, 'pending'),
            (3, 'visit', 432000, 'pending'), (4, 'visit', 432000, 'pending'), (5, 'visit', 432000, 'pending') $$,
  'the accepted order carries the plan');
select results_eq(
  $$ select seq, amount_kurus, due_on from public.order_installment where order_id = pg_temp.id('o1') order by seq $$,
  $$ select seq::smallint, amount_kurus, due_on
     from private.installment_schedule(pg_temp.id('q1'), pg_temp.today(), pg_temp.today() + 14) order by seq $$,
  'as computed on the day of acceptance');
insert into ids select 'ot', pg_temp.accept(pg_temp.id('c2'), pg_temp.id('qt'));
select results_eq(
  $$ select seq::integer, amount_kurus, due_on from public.order_installment where order_id = pg_temp.id('ot') order by seq $$,
  $$ select seq, amount_kurus, due_on from shown order by seq $$,
  'the plan shown on the quote is the plan of the order');
select is((select count(*)::integer from public.audit_event where action = 'order.installments_created' and entity_id = pg_temp.id('o1')),
  1, 'the plan is audited once');

-- 3. Payments and activation ---------------------------------------------------------------------

select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_record_manual_payment(%L, 720001, current_date, 'EFT-56-x', null, %L) $$,
    pg_temp.id('o1'), (pg_temp.inst(pg_temp.id('o1'), 1)).id)),
  'P0001 amount_exceeds_balance', 'a transfer for one installment is at most its open amount');
select is(pg_temp.error_of(format($$ select public.ops_record_manual_payment(%L, 100, current_date, 'EFT-56-x', null, %L) $$,
    pg_temp.id('ot'), (pg_temp.inst(pg_temp.id('ot'), 1)).id)), null, 'a transfer for part of an installment');
select is(pg_temp.error_of(format($$ select public.ops_record_manual_payment(%L, 100, current_date, 'EFT-56-x', null, %L) $$,
    pg_temp.id('o1'), (pg_temp.inst(pg_temp.id('ot'), 1)).id)),
  '22023 invalid_input / installment_id', 'an installment of another order is refused');
insert into ids select 'pay1', pg_temp.card_pay(pg_temp.id('c1'), pg_temp.id('o1'));
select results_eq(
  $$ select o.status::text, (pg_temp.inst(o.id, 1)).status::text, (pg_temp.inst(o.id, 2)).status::text
     from public.service_order o where o.id = pg_temp.id('o1') $$,
  $$ values ('active'::text, 'paid'::text, 'pending'::text) $$,
  'the inventory installment paid activates the order; the visits stay open');
select is(public.payment_finalize(pg_temp.id('pay1'), 'succeeded', jsonb_build_object('provider_payment_id',
    'fp56_' || pg_temp.id('pay1'), 'provider_amount_kurus', 720000, 'paid_kurus', 720000, 'fraud_status', 1)),
  'succeeded', 'a repeated report changes nothing');
select is((pg_temp.inst(pg_temp.id('o1'), 1)).paid_kurus, 720000::bigint, 'the installment is credited once');
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_record_manual_payment(%L, 100, current_date, 'EFT-56-y', null, %L) $$,
    pg_temp.id('o1'), (pg_temp.inst(pg_temp.id('o1'), 1)).id)),
  'P0001 installment_not_open', 'a transfer for a paid installment is refused');
insert into ids select 'pay2', pg_temp.card_pay(pg_temp.id('c1'), pg_temp.id('o1'));
select results_eq(
  $$ select amount_kurus, order_installment_id = (pg_temp.inst(order_id, 2)).id from public.payment where id = pg_temp.id('pay2') $$,
  $$ values (432000::bigint, true) $$, 'the next card payment pays the next installment');
select pg_temp.as_user(pg_temp.id('c1'));
select is(public.receipt_data(pg_temp.id('pay2')) -> 'plan_installment' ->> 'seq', '2', 'its receipt names the installment');
select is((public.receipt_data(pg_temp.id('pay2')) -> 'plan_installment' ->> 'count')::integer, 5, 'of five');

-- 4. Planning ban --------------------------------------------------------------------------------

insert into ids select 'p1', pg_temp.parcel_of(pg_temp.id('o1'));
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), (pg_temp.inst(pg_temp.id('o1'), 2)).window_start)), null,
  'a visit in the window of a paid installment is planned');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), (pg_temp.inst(pg_temp.id('o1'), 3)).window_start + 3)),
  'P0001 installment_unpaid', 'not one in the window of an unpaid installment');
select is(pg_temp.error_of(format($$ select public.ops_allow_unpaid_visit(%L, ' ') $$, (pg_temp.inst(pg_temp.id('o1'), 3)).id)),
  '22023 invalid_input / note', 'allowing it needs a note');
select public.ops_allow_unpaid_visit((pg_temp.inst(pg_temp.id('o1'), 3)).id, 'Sahip SMS ile istedi, 28 Ekim');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), (pg_temp.inst(pg_temp.id('o1'), 3)).window_start + 3)), null,
  'allowed by ops, it is planned');
select is(pg_temp.error_of(format($$ select public.ops_allow_unpaid_visit(%L, 'x') $$, (pg_temp.inst(pg_temp.id('o1'), 1)).id)),
  'P0001 installment_not_open', 'only an open visit installment is allowed');
select pg_temp.as_user(pg_temp.id('c1'));
select is(pg_temp.error_of('select visit_override_note from public.order_installment limit 1'),
  '42501 permission denied for table order_installment', 'the customer does not read the override note');
select is((select count(*)::integer from public.order_installment), 5, 'the customer reads the own plan only');
reset role;

-- 5. Window passed, reminders --------------------------------------------------------------------

insert into ids select 'o2', pg_temp.accept(pg_temp.id('c3'), pg_temp.new_quote(pg_temp.id('c3'), array[20000], 37.30));
select pg_temp.card_pay(pg_temp.id('c3'), pg_temp.id('o2'));
select pg_temp.as_user(pg_temp.id('c3'));
insert into ids select 'late', (public.payment_begin(pg_temp.id('o2'), pg_temp.id('c3'), 'fake', 'http://127.0.0.1:3100') ->> 'payment_id')::uuid;
select public.payment_attach_token(pg_temp.id('late'), 'tok56_late', now() + interval '30 minutes');
update public.order_installment set window_start = pg_temp.today() - 30, window_end = pg_temp.today() - 1
where order_id = pg_temp.id('o2') and seq = 2;
select is((private.billing_housekeeping() ->> 'installments_lapsed')::integer, 1, 'the daily job lapses one installment');
select results_eq(
  $$ select status::text, cancel_reason, cancelled_kurus from public.order_installment where order_id = pg_temp.id('o2') and seq = 2 $$,
  $$ values ('cancelled'::text, 'window_passed'::text, 432000::bigint) $$,
  'an unpaid installment whose window passed is cancelled, never asked for again');
select is(public.payment_finalize(pg_temp.id('late'), 'succeeded', jsonb_build_object('provider_payment_id', 'fp56_late',
    'provider_amount_kurus', 432000, 'paid_kurus', 432000, 'fraud_status', 1)), 'succeeded', 'a late card payment for it');
select results_eq(
  $$ select reason::text, amount_kurus from public.refund where payment_id = pg_temp.id('late') $$,
  $$ values ('order_closed'::text, 432000::bigint) $$, 'is refunded in full');
select is((public.payment_begin(pg_temp.id('o2'), pg_temp.id('c3'), 'fake', 'http://127.0.0.1:3100') ->> 'amount_kurus')::bigint,
  432000::bigint, 'the next attempt pays the next window');
select is((select order_installment_id from public.payment where order_id = pg_temp.id('o2') and status = 'initiated'),
  (pg_temp.inst(pg_temp.id('o2'), 3)).id, 'not the lapsed one');
update public.payment set status = 'expired', token_expires_at = now() - interval '1 hour'
where order_id = pg_temp.id('o2') and status = 'initiated';

update public.order_installment set due_on = pg_temp.today() + 7, created_at = now() - interval '30 days'
where order_id = pg_temp.id('o2') and seq = 3;
select private.billing_housekeeping();
select is((select count(*)::integer from public.notification where template = 'payment_reminder'
           and ref_id = (pg_temp.inst(pg_temp.id('o2'), 3)).id), 1, 'a reminder 7 days before the due day');
update public.order_installment set due_on = pg_temp.today() where order_id = pg_temp.id('o2') and seq = 3;
select private.billing_housekeeping();
select private.billing_housekeeping();
select is((select count(*)::integer from public.notification where template = 'payment_reminder'
           and ref_id in ((pg_temp.inst(pg_temp.id('o2'), 3)).id, md5((pg_temp.inst(pg_temp.id('o2'), 3)).id::text || ':due')::uuid)),
  2, 'and one on the due day, each once');
select is((select vars ->> 'ref' from public.notification where template = 'payment_reminder'
           and ref_id = (pg_temp.inst(pg_temp.id('o2'), 3)).id),
  (select number from public.service_order where id = pg_temp.id('o2')), 'the message names the order, not the amount');

-- 6. Ops readers, overdue, termination -----------------------------------------------------------

update public.order_installment set due_on = pg_temp.today() - 40 where order_id = pg_temp.id('o2') and seq = 3;
select pg_temp.ops();
select is((select days_overdue from public.ops_order_installments(pg_temp.id('o2')) where seq = 3), 40,
  'ops see the days overdue');
select is((select count(*)::integer from public.ops_overdue_installments('b0000000-0000-4000-8000-000000000001')
           where order_id = pg_temp.id('o2')), 1, 'a 30+ days overdue installment is listed');
select ok((select installments_overdue >= 1 from public.ops_billing_summary('b0000000-0000-4000-8000-000000000001')),
  'and counted on the dashboard');
select is((select status::text from public.service_order where id = pg_temp.id('o2')), 'active',
  'no automatic termination');
select is((select visit_override_note from public.ops_order_installments(pg_temp.id('o1')) where seq = 3),
  'Sahip SMS ile istedi, 28 Ekim', 'ops read the override note');
select public.ops_terminate_order(pg_temp.id('o1'), 'Ödeme uyarısına yanıt yok');
select results_eq(
  $$ select seq, status from pg_temp.plan_of(pg_temp.id('o1')) $$,
  $$ values (1, 'paid'::text), (2, 'paid'), (3, 'pending'), (4, 'cancelled'), (5, 'cancelled') $$,
  'termination cancels the unpaid installments, except the one whose visit was done on request');
select is((pg_temp.inst(pg_temp.id('o1'), 4)).cancel_reason, 'order_terminated', 'with the reason');

-- 7. Removal and withdrawal with unpaid installments --------------------------------------------

-- A yearly Standart order of 20 dönüm (4 × 432 000): two paid, one visit done.
insert into ids select 'o3', pg_temp.accept(pg_temp.id('c4'), pg_temp.parcel_quote(pg_temp.id('c4'), 4, 20000,
  '91200000-0000-4000-8000-000000000001'));
select pg_temp.ops();
select public.ops_record_manual_payment(pg_temp.id('o3'), 864000, current_date, 'EFT-56-3');
select results_eq($$ select seq, status from pg_temp.plan_of(pg_temp.id('o3')) $$,
  $$ values (1, 'paid'::text), (2, 'paid'), (3, 'pending'), (4, 'pending') $$,
  'one transfer for two installments: one payment each');
insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.parcel_of(pg_temp.id('o3')), 'periodic_scan', 'captured',
        pg_temp.today(), now());
select pg_temp.ops();
insert into ids select 'r3', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o3')), 'sold', pg_temp.today());
select public.ops_complete_garden_removal(pg_temp.id('r3'));
select results_eq(
  $$ select (calculation -> 'lines' -> 0 ->> 'gross_kurus')::bigint, (calculation -> 'lines' -> 0 ->> 'unpaid_kurus')::bigint,
            (calculation -> 'lines' -> 0 ->> 'installments_cut_kurus')::bigint, refund_kurus
     from public.garden_removal where id = pg_temp.id('r3') $$,
  $$ values (1296000::bigint, 864000::bigint, 864000::bigint, 432000::bigint) $$,
  'removal: gross 12 960 TL less the unpaid 8 640 TL (cut) refunds 4 320 TL of what was paid');
select results_eq($$ select seq, status from pg_temp.plan_of(pg_temp.id('o3')) $$,
  $$ values (1, 'paid'::text), (2, 'paid'), (3, 'cancelled'), (4, 'cancelled') $$,
  'the unpaid installments of the removed garden are cancelled');
select is((select sum(amount_kurus) from public.refund where garden_removal_id = pg_temp.id('r3')), 432000::numeric,
  'the refund rows hold the paid part only');

-- Withdrawal inside 14 days, no early start: everything paid comes back, the rest is cancelled.
insert into ids select 'q5', pg_temp.new_quote(pg_temp.id('c5'), array[20000], 37.50);
select pg_temp.as_user(pg_temp.id('c5'));
insert into ids select 'o5', public.customer_accept_quote(pg_temp.id('q5'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
select pg_temp.card_pay(pg_temp.id('c5'), pg_temp.id('o5'));
select pg_temp.as_user(pg_temp.id('c5'));
insert into ids select 'r5', public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o5')), 'not_needed', null, false, true);
select pg_temp.ops();
select public.ops_complete_garden_removal(pg_temp.id('r5'));
select results_eq(
  $$ select refund_kurus, (calculation ->> 'installments_cut_kurus')::bigint from public.garden_removal where id = pg_temp.id('r5') $$,
  $$ values (720000::bigint, 1728000::bigint) $$, 'withdrawal: the paid inventory comes back, the four visits are cancelled');
select is((select array_agg(distinct status::text) from public.order_installment where order_id = pg_temp.id('o5') and seq > 1),
  array['cancelled'], 'no visit installment is left open');

-- 8. Add-on ----------------------------------------------------------------------------------------

-- An active base order of c6 (single installment, as the removal tests) in a period started 100 days ago.
insert into ids select 'b6', pg_temp.accept(pg_temp.id('c6'), pg_temp.new_quote(pg_temp.id('c6'), array[20000], 37.60));
select testing.use_single_installment(pg_temp.id('b6'));
select pg_temp.ops();
select public.ops_record_manual_payment(pg_temp.id('b6'), (select total_kurus from public.service_order where id = pg_temp.id('b6')),
  current_date, 'EFT-56-b6');
select testing.set_order_period(pg_temp.id('b6'), pg_temp.today() - 100, pg_temp.today() + 264);
create function pg_temp.addon_app(p_user uuid) returns uuid language plpgsql
as $$
declare
  a uuid;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  perform public.customer_save_application_garden(a,
    jsonb_build_object('name', 'Ek bahçe', 'declared_area_m2', 20000, 'lon', 37.69, 'lat', 37.3),
    '{"authorization_basis": "title_holder", "entry_permission": true}');
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2) from public.application_garden x where x.application_id = a;
  return a;
end;
$$;
insert into ids select 'qa', public.ops_issue_addon_quote(pg_temp.id('b6'), pg_temp.addon_app(pg_temp.id('c6')));
insert into ids select 'oa', pg_temp.accept(pg_temp.id('c6'), pg_temp.id('qa'));
select results_eq(
  $$ select (select count(*)::integer from public.order_installment i where i.order_id = pg_temp.id('oa') and i.kind = 'visit'),
            (select visits::integer from public.quote_item where quote_id = pg_temp.id('qa') and line_no = 1),
            (select kind::text from public.order_installment where order_id = pg_temp.id('oa') and seq = 1) $$,
  $$ values ((select visits::integer from public.quote_item where quote_id = pg_temp.id('qa') and line_no = 1),
             (select visits::integer from public.quote_item where quote_id = pg_temp.id('qa') and line_no = 1), 'inventory'::text) $$,
  'an add-on: inventory first, then as many visit installments as its prorated visits');
select is((select sum(amount_kurus) from public.order_installment where order_id = pg_temp.id('oa')),
  (select total_kurus::numeric from public.service_order where id = pg_temp.id('oa')), 'which sum to its total');
select ok((select bool_and(window_start is null or window_start between pg_temp.today() and pg_temp.today() + 264)
           from public.order_installment where order_id = pg_temp.id('oa')),
  'its visit windows are the remaining windows of the base period');

select * from finish();
rollback;
