-- Garden removal per H20 and H21 (docs/hukuk/kararlar.md; T05, T23; contract
-- Md. 12/3, mesafeli-v3-taslak and -v4-taslak examples): removal-v2 (the
-- "remaining" method) with both examples of each version, 8A deductions,
-- visits deemed done under 8A/3 counted as used, lost reports not; no default
-- timing and "hemen" on the next day; the withdrawal path with garden changes
-- off; the pending order cancelled in the same request; ops removals only for
-- just causes with their notice; the transfer message; removal-v1 rows
-- unchanged.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4). Round
-- test prices (testing.use_round_prices, no inventory fee): 20 dönüm cost
-- 1 200 000 kuruş a year (one visit 300 000). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select testing.reset_to_seed();
select testing.use_round_prices();

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
  v uuid := ('f7000000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c70-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 70-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

create function pg_temp.new_app(p_user uuid, p_areas numeric[], p_lon numeric) returns uuid language plpgsql
as $$
declare
  a uuid;
  i integer;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  for i in 1 .. cardinality(p_areas) loop
    perform public.customer_save_application_garden(a,
      jsonb_build_object('name', 'Bahçe ' || p_lon || '-' || i, 'declared_area_m2', p_areas[i],
        'lon', p_lon + i * 0.01, 'lat', 37.2),
      '{"authorization_basis": "title_holder", "entry_permission": true}');
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
  return public.customer_accept_quote(p_quote,
    '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak", "early_performance": "mesafeli-v4-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order),
    current_date, 'EFT-70-' || left(p_order::text, 8));
end;
$$;

-- An active order of one new application, serving from today + p_start_offset (one year).
create function pg_temp.new_order(p_user uuid, p_areas numeric[], p_lon numeric, p_start_offset integer default -100)
returns uuid language plpgsql
as $$
declare
  o uuid;
begin
  o := pg_temp.accept(p_user, public.ops_issue_quote(pg_temp.new_app(p_user, p_areas, p_lon)));
  perform pg_temp.pay(o);
  perform testing.set_order_period(o, pg_temp.today() + p_start_offset, pg_temp.today() + p_start_offset + 364);
  return o;
end;
$$;

create function pg_temp.parcel_of(p_order uuid, p_line integer default 1) returns uuid language sql stable
as $$ select parcel_id from public.service_order_item where order_id = p_order and line_no = p_line $$;
create function pg_temp.item_of(p_order uuid, p_line integer default 1) returns uuid language sql stable
as $$ select id from public.service_order_item where order_id = p_order and line_no = p_line $$;

create function pg_temp.visit(p_parcel uuid, p_kind public.session_kind, p_status public.session_status, p_day date)
returns uuid language sql
as $$
  insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at)
  select p.org_id, p.id, p_kind, p_status, p_day,
         case when p_status <> 'planned' then (p_day + interval '9 hours')::timestamp at time zone 'Europe/Istanbul' end
  from public.parcel p where p.id = p_parcel
  returning id;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. removal-v2 formula and the contract examples ---------------------------------------

-- mesafeli-v3-taslak (12/3): 12 000,00 TL, 4 visits, 1 used → 9 000,00 TL.
select is(private.removal_v2_gross(1200000, 0, 4, 1, false), 900000::bigint, 'v3 example: 12 000 − 1 × 3 000 = 9 000,00 TL');
-- mesafeli-v4-taslak (12/3): 17 280,00 TL, 4 visits, 1 used → 12 960,00 TL.
select is(private.removal_v2_gross(1728000, 0, 4, 1, false), 1296000::bigint, 'v4 example: 17 280 − 1 × 4 320 = 12 960,00 TL');
select is(private.removal_v2_gross(1728000, 0, 4, 1, false) - 432000, 864000::bigint,
  'v4 example with an 8A refund of 4 320,00 TL: 8 640,00 TL');
select is(private.removal_v2_gross(1000001, 0, 3, 1, false), 666668::bigint,
  'the visit fee is rounded down and the remainder is refunded (v1 gave 666 666)');
select is(private.removal_v2_gross(1200000, 120000, 4, 0, true), 1080000::bigint,
  'no visit done: everything but the inventory share (inventory done)');
select is(private.removal_v2_gross(1200000, 120000, 4, 0, false), 1200000::bigint,
  'no visit and no inventory: the whole line');
select is(private.removal_v2_gross(1200000, 0, 4, 9, false), 0::bigint, 'never below zero, at most the entitlement');

-- 2. Integration: round prices (20 dönüm = 1 200 000 kuruş, 4 visits) ---------------------

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3)),
  ('c4', pg_temp.new_customer(4)), ('c5', pg_temp.new_customer(5)), ('c6', pg_temp.new_customer(6));
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.501);
insert into ids select 'p1', pg_temp.parcel_of(pg_temp.id('o1'));
select pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'published', pg_temp.today() - 60);

create function pg_temp.calc(p_user uuid, p_order uuid) returns jsonb language sql stable
as $$
  select private.removal_calc('b0000000-0000-4000-8000-000000000001', p_user, pg_temp.parcel_of(p_order),
    pg_temp.item_of(p_order), pg_temp.today(), false, 'other');
$$;
select results_eq(
  $$ select x ->> 'formula', (x ->> 'refund_kurus')::bigint, (x ->> 'refund_vat_kurus')::bigint,
            (x -> 'lines' -> 0 ->> 'visit_fee_kurus')::bigint
     from pg_temp.calc(pg_temp.id('c1'), pg_temp.id('o1')) x $$,
  $$ values ('removal-v2'::text, 900000::bigint, 150000::bigint, 300000::bigint) $$,
  'v3 example in the database: 9 000,00 TL, VAT share 1 500,00 TL, formula removal-v2');

-- 8A refund of one missed visit (3 000,00 TL) is deducted: 6 000,00 TL.
select pg_temp.ops();
select public.ops_request_refund((select id from public.payment where order_id = pg_temp.id('o1')), 300000,
  'missed_visit', '8A/2');
reset role;
select results_eq(
  $$ select (x ->> 'refund_kurus')::bigint, (x -> 'lines' -> 0 ->> 'already_refunded_kurus')::bigint,
            (x ->> 'refund_vat_kurus')::bigint
     from pg_temp.calc(pg_temp.id('c1'), pg_temp.id('o1')) x $$,
  $$ values (600000::bigint, 300000::bigint, 100000::bigint) $$,
  'v3 second example: 9 000 − 3 000 (8A) = 6 000,00 TL, VAT share 1 000,00 TL');

-- 8A/3: a visit deemed done counts as used.
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), array[20000], 37.511);
insert into ids select 'p2', pg_temp.parcel_of(pg_temp.id('o2'));
-- Two days of one window inside the period (the test runs on any day).
create temporary table dd on commit drop as
  select max(d)::date as d from generate_series(pg_temp.today() - 90, pg_temp.today() - 3, interval '1 day') d
  where private.visit_window_of(d::date) is not null
    and private.visit_window_of(d::date) = private.visit_window_of(d::date + 2);
grant select on dd to authenticated;
create function pg_temp.dd() returns date language sql stable as $$ select d from dd $$;
insert into ids select 's2', pg_temp.visit(pg_temp.id('p2'), 'periodic_scan', 'planned', pg_temp.dd());
insert into storage.objects (bucket_id, name, metadata)
select 'visit-evidence', 'b0000000-0000-4000-8000-000000000001/' || pg_temp.id('p2') || '/kapi.jpg', '{}';
select pg_temp.ops();
insert into ids select 'm2a', public.ops_record_missed_visit(pg_temp.id('s2'), 'customer', pg_temp.dd(),
  'Kapı kilitliydi', 'gate_closed', null, '{}',
  array['b0000000-0000-4000-8000-000000000001/' || pg_temp.id('p2') || '/kapi.jpg'],
  pg_temp.dd(), 'phone', pg_temp.dd() + 2, false, false, 'rescheduled');
insert into ids select 'm2b', public.ops_record_missed_visit(pg_temp.id('s2'), 'customer', pg_temp.dd() + 2,
  'Yine kapalı', 'gate_closed', null, '{}',
  array['b0000000-0000-4000-8000-000000000001/' || pg_temp.id('p2') || '/kapi.jpg'],
  pg_temp.dd() + 2, 'sms');
select lives_ok($$ select public.ops_set_missed_visit_outcome(pg_temp.id('m2b'), 'deemed_done') $$,
  'deemed_done on the proposed day after a first failure for the same reason');
reset role;
select results_eq(
  $$ select (x -> 'lines' -> 0 ->> 'visits_used')::integer, (x -> 'lines' -> 0 ->> 'visits_deemed_done')::integer,
            (x ->> 'refund_kurus')::bigint
     from pg_temp.calc(pg_temp.id('c2'), pg_temp.id('o2')) x $$,
  $$ values (1, 1, 900000::bigint) $$,
  '8A/3: the visit deemed done is a used visit (9 000,00 TL refunded, not 12 000)');

-- 12/3: a visit whose report cannot be published is not used.
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), array[20000], 37.521);
insert into ids select 'p3', pg_temp.parcel_of(pg_temp.id('o3'));
insert into ids select 's3', pg_temp.visit(pg_temp.id('p3'), 'periodic_scan', 'processed', pg_temp.today() - 20);
select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_record_missed_visit(pg_temp.id('s3'), 'weather', pg_temp.today() - 20,
  p_report_lost => true) $$), '22023 invalid_input / reason', 'a lost report is always the company''s');
select lives_ok($$ select public.ops_record_missed_visit(pg_temp.id('s3'), 'company', pg_temp.today() - 20,
  'Kart okunamadı', 'data_loss', p_report_lost => true) $$, 'report_lost is recorded on a captured visit');
reset role;
select results_eq(
  $$ select (x -> 'lines' -> 0 ->> 'visits_used')::integer, (x -> 'lines' -> 0 ->> 'visits_report_lost')::integer,
            (x ->> 'refund_kurus')::bigint
     from pg_temp.calc(pg_temp.id('c3'), pg_temp.id('o3')) x $$,
  $$ values (0, 1, 1200000::bigint) $$, 'a visit without a publishable report is not used: the whole line');

-- 3. Customer timing: no default, "hemen" is the next day ---------------------------------

select ok((select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'customer_request_garden_removal')
          ~ '^p_parcel_id uuid, p_reason text, p_timing text, p_note text DEFAULT NULL',
  'customer_request_garden_removal has no default timing');
select ok((select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'customer_garden_removal_preview') = 'p_parcel_id uuid, p_timing text',
  'nor has the preview');
select pg_temp.as_user(pg_temp.id('c3'));
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p3'), 'sold', null) $$),
  '22023 invalid_input / timing', 'a request without a timing is refused');
select results_eq(
  $$ select timing, effective_on from public.customer_garden_removal_preview(pg_temp.id('p3'), 'immediate') $$,
  $$ values ('immediate'::text, pg_temp.today() + 1) $$, 'preview of "hemen": the day after the request');
insert into ids select 'r3', public.customer_request_garden_removal(pg_temp.id('p3'), 'not_needed', 'immediate');
select results_eq(
  $$ select requested_effective_on, timing, at_period_end, withdrawal from public.garden_removal where id = pg_temp.id('r3') $$,
  $$ values (pg_temp.today() + 1, 'immediate'::text, false, false) $$, '"hemen": effective the next day');
select is(pg_temp.error_of($$ select * from public.customer_garden_removal_preview(pg_temp.id('p1'), 'notice') $$),
  'P0002 not_found', 'previews are the caller''s own');

-- 4. Withdrawal path with garden changes off (T03 kept) ----------------------------------

insert into ids select 'o4', pg_temp.new_order(pg_temp.id('c4'), array[20000], 37.531, -2);
update public.service_order set activated_at = now() where id = pg_temp.id('o4');
insert into ids select 'p4', pg_temp.parcel_of(pg_temp.id('o4'));
update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.as_user(pg_temp.id('c4'));
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p4'), 'sold', 'immediate') $$),
  'P0001 garden_changes_closed', 'with garden changes off only the withdrawal is open');
select lives_ok($$ select public.customer_request_garden_removal(pg_temp.id('p4'), 'other', 'withdrawal') $$,
  'the withdrawal works with garden changes off');
select is((select count(*)::integer from public.notification where template = 'withdrawal_received'
           and recipient_user_id = pg_temp.id('c4')), 1, 'and queues withdrawal_received');
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';

-- 5. Pending order: cancelled in the same request ---------------------------------------

insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c5'), array[20000], 37.541, -330);
insert into ids select 'p5', pg_temp.parcel_of(pg_temp.id('o5'));
select pg_temp.ops();
insert into ids select 'q5', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c5'),
  '91200000-0000-4000-8000-000000000001', array[pg_temp.id('p5')], false, null, pg_temp.id('o5'));
insert into ids select 'o5r', pg_temp.accept(pg_temp.id('c5'), pg_temp.id('q5'));
select pg_temp.as_user(pg_temp.id('c5'));
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p5'), 'cost', 'notice') $$),
  'P0001 parcel_order_pending', 'a garden on an unpaid renewal is refused without the cancel option');
select is(pg_temp.error_of(format($$ select public.customer_request_garden_removal(%L, 'cost', 'notice', null, %L) $$,
  pg_temp.id('p5'), pg_temp.id('o1'))), '22023 invalid_input / cancel_order_id', 'only the order holding the garden');
insert into ids select 'r5', public.customer_request_garden_removal(pg_temp.id('p5'), 'cost', 'notice', null, pg_temp.id('o5r'));
select results_eq(
  $$ select (select status::text from public.service_order where id = pg_temp.id('o5r')),
            (select status::text from public.garden_removal where id = pg_temp.id('r5')) $$,
  $$ values ('cancelled'::text, 'requested'::text) $$,
  '"bekleyen siparişi iptal et ve devam et": the order is cancelled and the request recorded');

-- 6. Ops removals: just causes and notice -----------------------------------------------

insert into ids select 'o6', pg_temp.new_order(pg_temp.id('c6'), array[20000], 37.551);
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'sold', %L) $$,
  pg_temp.item_of(pg_temp.id('o6')), pg_temp.today() + 40)), 'P0001 removal_reason_not_allowed',
  'ops cannot remove for a customer reason');
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'other', %L) $$,
  pg_temp.item_of(pg_temp.id('o6')), pg_temp.today() + 40)), 'P0001 removal_reason_not_allowed', 'nor "other"');
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'out_of_area', %L) $$,
  pg_temp.item_of(pg_temp.id('o6')), pg_temp.today() + 29)), 'P0001 removal_notice_too_short',
  'out of area: at least 30 days notice');
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'owner_breach', %L) $$,
  pg_temp.item_of(pg_temp.id('o6')), pg_temp.today() + 5)), 'P0001 removal_notice_too_short',
  'a breach of Md. 5: 30 days notice too');
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'by_agreement', %L) $$,
  pg_temp.item_of(pg_temp.id('o6')), pg_temp.today())), '22023 invalid_input / owner_consent_note',
  'by agreement: the owner''s written consent is required');
select ok(private.ops_removal_reason('staff_safety') = 'no_notice' and private.ops_removal_reason('duplicate') = 'no_notice'
  and private.ops_removal_reason('no_authority') = 'no_notice' and private.ops_removal_reason('third_party_objection') = 'no_notice'
  and private.ops_removal_reason('service_discontinued') = 'notice' and private.ops_removal_reason('transfer') = 'notice'
  and private.ops_removal_reason('cost') is null, 'the notice rule of each cause (H20 (c))');
insert into ids select 'r6', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o6')), 'out_of_area',
  pg_temp.today() + 30, 'Bölge dışı');
select is((select reason::text from public.garden_removal where id = pg_temp.id('r6')), 'out_of_area',
  'out of area with 30 days notice is accepted');
select public.ops_cancel_garden_removal(pg_temp.id('r6'), 'test');
insert into ids select 'r6b', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o6')), 'staff_safety',
  pg_temp.today(), 'Tehdit');
select public.ops_cancel_garden_removal(pg_temp.id('r6b'), 'test');
-- Transfer by agreement on an earlier day: the reports message (H22, T23).
insert into ids select 'r6c', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o6')), 'transfer',
  pg_temp.today() + 3, 'Satıldı', 0, false, 'Sahip e-postayla onayladı');
select results_eq(
  $$ select template::text, vars ->> 'ref', vars ->> 'path' from public.notification
     where ref_id = pg_temp.id('r6c') order by template::text $$,
  $$ values ('garden_removal_scheduled'::text, (select number from public.garden_removal where id = pg_temp.id('r6c')),
             '/portal/parsel/' || pg_temp.parcel_of(pg_temp.id('o6'))),
            ('garden_transfer_reports'::text, (select number from public.garden_removal where id = pg_temp.id('r6c')),
             '/portal/parsel/' || pg_temp.parcel_of(pg_temp.id('o6'))) $$,
  'a transfer queues "raporlarınızı indirin" before the exit day');
select is(pg_temp.error_of($$ select public.ops_cancel_garden_removal(pg_temp.id('r6c'), 'test') $$), null,
  'cleanup');
reset role;
select throws_ok(
  $$ insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name,
       status, initiated_by, reason, requested_effective_on, access_days)
     select 'b0000000-0000-4000-8000-000000000001', pg_temp.id('c6'), 'C-2026-970001', i.parcel_id, i.order_id, i.id,
            'x', 'requested', 'ops', 'other', pg_temp.today(), 90
     from public.service_order_item i where i.order_id = pg_temp.id('o6') $$,
  '23514', null, 'the table refuses a new ops removal without a just cause');

-- 7. removal-v1 rows are never rewritten ------------------------------------------------

insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name,
  status, initiated_by, reason, requested_effective_on, effective_on, access_days, access_until, scheduled_at,
  completed_at, refund_mode, refund_kurus, calculation)
select 'b0000000-0000-4000-8000-000000000001', pg_temp.id('c1'), 'C-2025-970002', i.parcel_id, i.order_id, i.id,
       'Eski', 'completed', 'customer', 'cost', pg_temp.today() - 400, pg_temp.today() - 400, 90, pg_temp.today() - 310,
       now(), now(), 'unused_visits', 900000, '{"formula": "removal-v1", "refund_kurus": 900000, "lines": []}'
from public.service_order_item i where i.order_id = pg_temp.id('o1');
select throws_ok(
  $$ update public.garden_removal set calculation = calculation || '{"formula": "removal-v2"}' where number = 'C-2025-970002' $$,
  'P0001', 'removal_not_open', 'a stored removal-v1 calculation cannot be rewritten');
select is((select calculation ->> 'formula' from public.garden_removal where number = 'C-2025-970002'), 'removal-v1',
  'the removal-v1 row is unchanged');

select * from finish();
rollback;
