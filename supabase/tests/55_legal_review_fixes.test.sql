-- Review fixes of the legal follow-ups, wave 1 (PR #92;
-- 20261103100700_legal_review_fixes.sql): the explicit production gate switch
-- is covered in 50 and 51; here a withdrawal from a paid renewal (ops and
-- portal) leaves the running line, a withdrawal recorded late is effective on
-- the notice day, the planning ban before a later start, and contract
-- documents bound to the accepted version.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4); round
-- test prices (testing.use_round_prices, no inventory fee): 20 dönüm cost
-- 1 200 000 kuruş a year (one visit 300 000). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
grant select, insert on tday, ids to authenticated, service_role;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f5500000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c55-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 55-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

-- An accepted order of one 20-dönüm garden; paid (activated now, serving
-- from today - 2) unless p_pay is false.
create function pg_temp.new_order(p_user uuid, p_lon numeric, p_early boolean, p_pay boolean default true)
returns uuid language plpgsql
as $$
declare
  a uuid;
  q uuid;
  o uuid;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  perform public.customer_save_application_garden(a,
    jsonb_build_object('name', 'Bahçe ' || p_lon, 'declared_area_m2', 20000, 'lon', p_lon, 'lat', 37.2),
    '{"authorization_basis": "title_holder", "entry_permission": true}');
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2)
  from public.application_garden x where x.application_id = a;
  q := public.ops_issue_quote(a);
  perform pg_temp.as_user(p_user);
  o := public.customer_accept_quote(q, jsonb_build_object('distance_sales', 'mesafeli-v4-taslak',
    'pre_information', 'onbilgi-v4-taslak')
    || case when p_early then '{"early_performance": "mesafeli-v4-taslak"}'::jsonb else '{}'::jsonb end);
  if p_pay then
    perform pg_temp.ops();
    perform public.ops_record_manual_payment(o, (select total_kurus from public.service_order where id = o),
      current_date, 'EFT-55-' || left(o::text, 8));
    perform testing.set_order_period(o, pg_temp.today() - 2, pg_temp.today() + 362);
  end if;
  return o;
end;
$$;
create function pg_temp.parcel_of(p_order uuid) returns uuid language sql stable
as $$ select parcel_id from public.service_order_item where order_id = p_order and line_no = 1 $$;
create function pg_temp.item_of(p_order uuid) returns uuid language sql stable
as $$ select id from public.service_order_item where order_id = p_order and line_no = 1 $$;
create function pg_temp.visit(p_parcel uuid, p_kind public.session_kind, p_status public.session_status, p_day date)
returns uuid language sql
as $$
  insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at)
  select p.org_id, p.id, p_kind, p_status, p_day,
         case when p_status <> 'planned' then (p_day + interval '9 hours')::timestamp at time zone 'Europe/Istanbul' end
  from public.parcel p where p.id = p_parcel
  returning id;
$$;
create function pg_temp.plan_sql(p_parcel uuid, p_kind text, p_day date) returns text language sql stable
as $$
  select format($f$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
    values ('b0000000-0000-4000-8000-000000000001', %L, %L, 'planned', %L) $f$, p_parcel, p_kind, p_day);
$$;
-- A running order (out of its withdrawal period, ending today + 5) with a
-- paid renewal starting today + 6 (inside its own withdrawal period).
create function pg_temp.with_renewal(p_user uuid, p_lon numeric, p_key text) returns void language plpgsql
as $$
declare
  a uuid := pg_temp.new_order(p_user, p_lon, false);
  q uuid;
  b uuid;
begin
  update public.service_order set activated_at = now() - interval '100 days' where id = a;
  perform testing.set_order_period(a, pg_temp.today() - 100, pg_temp.today() + 5);
  perform pg_temp.ops();
  q := public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', p_user,
    '91200000-0000-4000-8000-000000000001', array[pg_temp.parcel_of(a)], false, pg_temp.today() + 6, a);
  perform pg_temp.as_user(p_user);
  b := public.customer_accept_quote(q, '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak"}');
  perform pg_temp.ops();
  perform public.ops_record_manual_payment(b, (select total_kurus from public.service_order where id = b),
    current_date, 'EFT-55-' || p_key);
  insert into ids values (p_key || 'a', a), (p_key || 'b', b), (p_key || 'p', pg_temp.parcel_of(a));
end;
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3)),
  ('c4', pg_temp.new_customer(4)), ('c5', pg_temp.new_customer(5));
select pg_temp.with_renewal(pg_temp.id('c1'), 37.501, 'r1');
select pg_temp.with_renewal(pg_temp.id('c2'), 37.511, 'r2');
reset role;

-- 1. Ops records a withdrawal from the renewal -------------------------------------------------

insert into ids select 's1', pg_temp.visit(pg_temp.id('r1p'), 'periodic_scan', 'planned', pg_temp.today() + 2);
insert into ids select 's2', pg_temp.visit(pg_temp.id('r1p'), 'periodic_scan', 'planned', pg_temp.today() + 20);
create temporary table pstatus on commit drop as
  select status from public.parcel where id = pg_temp.id('r1p');
set local role authenticated;
select pg_temp.ops();
insert into ids select 'w1', (public.ops_record_withdrawal(array[pg_temp.item_of(pg_temp.id('r1b'))],
  pg_temp.today(), 'email', null))[1];
reset role;
select results_eq(
  $$ select status::text, refund_mode, refund_kurus, jsonb_array_length(calculation -> 'lines')
     from public.garden_removal where id = pg_temp.id('w1') $$,
  $$ values ('completed'::text, 'withdrawal'::text, 1200000::bigint, 1) $$,
  'the renewal is refunded in full; the running line is not in the calculation');
select is((select removed_on from public.service_order_item where id = pg_temp.item_of(pg_temp.id('r1a'))), null,
  'H14: the running line stays in service');
select is((select removed_on from public.service_order_item where id = pg_temp.item_of(pg_temp.id('r1b'))),
  pg_temp.today() + 6, 'the renewal line leaves from its start');
select is((select status::text from public.service_order where id = pg_temp.id('r1b')), 'terminated',
  'the emptied renewal ends');
select is((select status::text from public.service_order where id = pg_temp.id('r1a')), 'active', 'the running order not');
select is((select status::text from public.session where id = pg_temp.id('s1')), 'planned',
  'a visit of the running line stays planned');
select is((select status::text from public.session where id = pg_temp.id('s2')), 'cancelled',
  'a visit planned after the running line ends is cancelled');
select is((select status from public.parcel where id = pg_temp.id('r1p')), (select status from pstatus),
  'the parcel status is left alone');
select ok(private.parcel_served_on(pg_temp.id('r1p'), pg_temp.today()), 'the garden is still served today');

-- 2. Portal withdrawal from the renewal, garden changes off ---------------------------------------

update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c2'));
select is((select withdrawal_until from public.my_gardens() where parcel_id = pg_temp.id('r2p')), pg_temp.today() + 14,
  'the service card shows the renewal''s withdrawal period');
select results_eq(
  $$ select order_item_id, refund_estimate_kurus, line_count
     from public.customer_garden_removal_preview(pg_temp.id('r2p'), 'withdrawal') $$,
  $$ select pg_temp.item_of(pg_temp.id('r2b')), 1200000::bigint, 1 $$,
  'the preview refunds the renewal alone');
insert into ids select 'w2', public.customer_request_garden_removal(pg_temp.id('r2p'), 'other', 'withdrawal');
select is((select order_item_id from public.garden_removal where id = pg_temp.id('w2')),
  pg_temp.item_of(pg_temp.id('r2b')), 'the portal withdrawal targets the renewal line (switch off)');
select pg_temp.ops();
select public.ops_complete_garden_removal(pg_temp.id('w2'));
reset role;
select is((select removed_on from public.service_order_item where id = pg_temp.item_of(pg_temp.id('r2a'))), null,
  'the running line stays after the portal withdrawal too');
select is((select access_until from public.garden_removal where id = pg_temp.id('w2')),
  pg_temp.today() + 6 + (private.billing_setting('b0000000-0000-4000-8000-000000000001')).removal_access_days,
  'its access window counts from the renewal''s start');
-- Outside every withdrawal period the portal refuses as before.
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), 37.521, false);
update public.service_order set activated_at = now() - interval '20 days' where id = pg_temp.id('o3');
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c3'));
select is(pg_temp.error_of(format($$ select public.customer_request_garden_removal(%L, 'other', 'withdrawal') $$,
  pg_temp.parcel_of(pg_temp.id('o3')))), 'P0001 garden_changes_closed', 'no open withdrawal period: closed');
reset role;
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c3'));
select is(pg_temp.error_of(format($$ select public.customer_garden_removal_preview(%L, 'withdrawal') $$,
  pg_temp.parcel_of(pg_temp.id('o3')))), 'P0001 withdrawal_expired', 'and expired with the switch on');
reset role;

-- 3. A withdrawal recorded after the notice day ---------------------------------------------

insert into ids select 'o4', pg_temp.new_order(pg_temp.id('c4'), 37.531, true);
insert into ids select 'p4', pg_temp.parcel_of(pg_temp.id('o4'));
select pg_temp.visit(pg_temp.id('p4'), 'periodic_scan', 'captured', pg_temp.today() - 1);
insert into ids select 's4', pg_temp.visit(pg_temp.id('p4'), 'periodic_scan', 'planned', pg_temp.today() + 30);
set local role authenticated;
select pg_temp.ops();
insert into ids select 'w4', (public.ops_record_withdrawal(array[pg_temp.item_of(pg_temp.id('o4'))],
  pg_temp.today() - 2, 'post', null))[1];
reset role;
select results_eq(
  $$ select effective_on, refund_mode, refund_kurus, (calculation -> 'lines' -> 0 ->> 'visits_used')::integer
     from public.garden_removal where id = pg_temp.id('w4') $$,
  $$ select pg_temp.today() - 2, 'withdrawal'::text, 1200000::bigint, 0 $$,
  'H11 (c): effective on the notice day; the visit after it is not deducted despite the box');
select is((select status::text from public.session where id = pg_temp.id('s4')), 'cancelled',
  'planned visits from the notice day on are cancelled');
select is((select removed_on from public.service_order_item where id = pg_temp.item_of(pg_temp.id('o4'))),
  pg_temp.today() - 2, 'the line leaves on the notice day');

-- 4. Planning ban before a later start ---------------------------------------------------------

insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c5'), 37.541, false);
select testing.set_order_period(pg_temp.id('o5'), pg_temp.today() + 30, pg_temp.today() + 394);
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.parcel_of(pg_temp.id('o5')), 'inventory', pg_temp.today() + 5)),
  'P0001 withdrawal_period_open', '8B/4: no inventory before the start inside the withdrawal period');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.parcel_of(pg_temp.id('o5')), 'inventory', pg_temp.today() + 15)),
  null, 'after the withdrawal period it can be planned');
reset role;

-- 5. Contract documents bound to the accepted version ------------------------------------------

insert into ids select 'o6', pg_temp.new_order(pg_temp.id('c5'), 37.551, false, false);
insert into storage.objects (bucket_id, name, metadata)
select 'contract-documents', o.org_id || '/' || o.id || '/distance_sales.pdf', '{"size": 1234}'
from public.service_order o where o.id = pg_temp.id('o6');
set local role service_role;
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'distance_sales',
  'mesafeli-v2-taslak', repeat('1', 64), %L, repeat('f', 64), 1234, 'web@test') $$, pg_temp.id('o6'),
  (select org_id || '/' || id || '/distance_sales.pdf' from public.service_order where id = pg_temp.id('o6')))),
  '22023 invalid_input / text_version', 'H12: only the version the order accepted');
reset role;
-- An order accepted before T04 under an archived version (no hash anywhere).
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, order_id,
  recorded_at)
select o.org_id, o.customer_user_id, o.customer_user_id, 'distance_sales', true, 'mesafeli-v2-taslak',
       c.source, o.id, c.recorded_at - interval '1 minute'
from public.service_order o
join private.consent_record c on c.order_id = o.id and c.kind = 'distance_sales'
where o.id = pg_temp.id('o6');
set local role service_role;
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'distance_sales',
  'mesafeli-v2-taslak', repeat('1', 64), %L, repeat('f', 64), 1234, 'web@test') $$, pg_temp.id('o6'),
  (select org_id || '/' || id || '/distance_sales.pdf' from public.service_order where id = pg_temp.id('o6')))),
  '22023 invalid_input / text_sha256', 'an archived version without a hash cannot be registered');
reset role;
set local role authenticated;
select pg_temp.ops();
select is((select missing from public.ops_orders_missing_contract_documents() where order_id = pg_temp.id('o6')),
  array['pre_information'], 'so the missing list leaves it out and keeps the registrable one');
select is((select missing from public.ops_orders_missing_contract_documents() where order_id = pg_temp.id('o4')),
  array['pre_information', 'distance_sales', 'withdrawal_confirmation'], 'a current order lists all three');
reset role;

select * from finish();
rollback;
