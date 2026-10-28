-- Regression tests of the IP14 integrated review fixes
-- (20261102120500_garden_integration_fixes.sql): 1. a dead failed refund is
-- not counted as refunded; 3. an ended base cancels and refunds an add-on
-- that holds money; 4/7. my_gardens tells who opened the removal; 5. the end
-- of access keeps a paying owner whose period has not started; switch: the
-- add-on preview and an add-on application are refused while it is off.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4). Round
-- test prices (testing.use_round_prices, no inventory fee): 20 dönüm cost
-- 1 200 000 kuruş a year. One transaction: now() is constant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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
-- Read as postgres once: guards are tested as the API role, without usage on private.
create temporary table tday on commit drop as select private.istanbul_today() as d;
create function pg_temp.today() returns date language sql stable as $$ select d from tday $$;
create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on tday, ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f4900000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c49-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 49-' || p_n, 'sms');
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
  return public.customer_accept_quote(p_quote, '{"distance_sales": "mesafeli-v3-taslak", "pre_information": "onbilgi-v3-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid, p_amount bigint default null) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    coalesce(p_amount, (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order)),
    current_date, 'EFT-49-' || left(p_order::text, 8) || '-' || coalesce(p_amount, 0));
end;
$$;

-- An active order of a new application, serving from p_start (one year).
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

-- A visit of a parcel on a day (Istanbul hour), inserted by the service role.
create function pg_temp.visit(p_parcel uuid, p_kind public.session_kind, p_status public.session_status, p_day date,
  p_hour integer default 9) returns uuid language sql
as $$
  insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at)
  select p.org_id, p.id, p_kind, p_status, p_day,
         case when p_status <> 'planned' then (p_day + make_interval(hours => p_hour))::timestamp at time zone 'Europe/Istanbul' end
  from public.parcel p where p.id = p_parcel
  returning id;
$$;

-- An ops removal effective today, completed now.
create function pg_temp.remove_now(p_order uuid, p_reason text default 'sold', p_access integer default null,
  p_note text default null) returns uuid language plpgsql
as $$
declare
  v uuid;
begin
  perform pg_temp.ops();
  v := public.ops_request_garden_removal(pg_temp.item_of(p_order), p_reason, pg_temp.today(), p_note, p_access);
  perform public.ops_complete_garden_removal(v);
  return v;
end;
$$;

create function pg_temp.calc(p_removal uuid) returns jsonb language sql stable
as $$ select calculation from public.garden_removal where id = p_removal $$;
create function pg_temp.line(p_removal uuid, p_n integer default 0) returns jsonb language sql stable
as $$ select calculation -> 'lines' -> p_n from public.garden_removal where id = p_removal $$;

update public.org_billing_setting set garden_changes_enabled = true, removal_refund_mode = 'unused_visits'
where org_id = 'b0000000-0000-4000-8000-000000000001';

-- 1. A dead failed refund is not a refund ---------------------------------------------------

-- One line, 4 visits, 1 billed. A Md. 8A refund of 300 000 was declined for
-- good (retryable = false): it can never be claimed, so the removal refunds
-- the full 900 000.
insert into ids select 'c1', pg_temp.new_customer(1);
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 41.10);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o1')), 'periodic_scan', 'published', pg_temp.today() - 50);
select pg_temp.ops();
insert into ids select 'pay1', id from public.payment where order_id = pg_temp.id('o1');
insert into ids select 'f1', (public.ops_request_refund(pg_temp.id('pay1'), 300000, 'missed_visit', 'Md. 8A',
  (select id from public.payment_item where payment_id = pg_temp.id('pay1'))))[1];
update public.refund set status = 'failed', failure_code = 'card_declined', retryable = false where id = pg_temp.id('f1');
insert into ids select 'r1', pg_temp.remove_now(pg_temp.id('o1'));
select results_eq(
  $$ select refund_kurus, (pg_temp.line(id) ->> 'already_refunded_kurus')::bigint
     from public.garden_removal where id = pg_temp.id('r1') $$,
  $$ values (900000::bigint, 0::bigint) $$,
  'a failed refund that can no longer settle is not deducted');

-- The usual recovery: ops opens a new refund for the dead one. The line is
-- deducted once (300 000), not twice.
insert into ids select 'c1b', pg_temp.new_customer(2);
insert into ids select 'o1b', pg_temp.new_order(pg_temp.id('c1b'), array[20000], 41.15);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o1b')), 'periodic_scan', 'published', pg_temp.today() - 50);
select pg_temp.ops();
insert into ids select 'pay1b', id from public.payment where order_id = pg_temp.id('o1b');
insert into ids select 'f1b', (public.ops_request_refund(pg_temp.id('pay1b'), 300000, 'missed_visit', 'Md. 8A',
  (select id from public.payment_item where payment_id = pg_temp.id('pay1b'))))[1];
update public.refund set status = 'failed', failure_code = 'card_declined', retryable = false where id = pg_temp.id('f1b');
select public.ops_request_refund(pg_temp.id('pay1b'), 300000, 'missed_visit', 'Md. 8A, yeniden',
  (select id from public.payment_item where payment_id = pg_temp.id('pay1b')));
insert into ids select 'r1b', pg_temp.remove_now(pg_temp.id('o1b'));
select results_eq(
  $$ select refund_kurus, (pg_temp.line(id) ->> 'already_refunded_kurus')::bigint
     from public.garden_removal where id = pg_temp.id('r1b') $$,
  $$ values (600000::bigint, 300000::bigint) $$,
  'a dead refund and its replacement are deducted once');

-- A failed refund that may still be retried keeps counting.
insert into ids select 'c1c', pg_temp.new_customer(3);
insert into ids select 'o1c', pg_temp.new_order(pg_temp.id('c1c'), array[20000], 41.18);
select pg_temp.ops();
insert into ids select 'pay1c', id from public.payment where order_id = pg_temp.id('o1c');
insert into ids select 'f1c', (public.ops_request_refund(pg_temp.id('pay1c'), 300000, 'missed_visit', 'Md. 8A',
  (select id from public.payment_item where payment_id = pg_temp.id('pay1c'))))[1];
update public.refund set status = 'failed', failure_code = 'bank_error', retryable = null where id = pg_temp.id('f1c');
insert into ids select 'r1c', pg_temp.remove_now(pg_temp.id('o1c'));
select is((select (pg_temp.line(id) ->> 'already_refunded_kurus')::bigint from public.garden_removal
           where id = pg_temp.id('r1c')), 300000::bigint, 'a failed refund not marked final still counts');

-- 3. An ended base cancels and refunds an add-on holding money -------------------------------

insert into ids select 'c3', pg_temp.new_customer(4);
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), array[20000], 41.30);
insert into ids select 'a3', pg_temp.new_app(pg_temp.id('c3'), array[20000], 41.35);
insert into ids select 'o3a', pg_temp.accept(pg_temp.id('c3'), public.ops_issue_addon_quote(pg_temp.id('o3'), pg_temp.id('a3')));
select pg_temp.pay(pg_temp.id('o3a'), 500000);
-- The last garden of the base leaves: the base ends (terminate_emptied_order).
insert into ids select 'r3', pg_temp.remove_now(pg_temp.id('o3'));
select results_eq(
  $$ select o.status::text, o.cancel_reason from public.service_order o where o.id in (pg_temp.id('o3'), pg_temp.id('o3a'))
     order by o.addon_of_order_id nulls first $$,
  $$ values ('terminated'::text, null::text), ('cancelled'::text, 'base_terminated'::text) $$,
  'the base ends and its partly paid add-on is cancelled');
select results_eq(
  $$ select r.reason::text, r.kind::text, r.status::text, r.amount_kurus from public.refund r
     where r.order_id = pg_temp.id('o3a') $$,
  $$ values ('order_closed'::text, 'manual'::text, 'requested'::text, 500000::bigint) $$,
  'the money held is refunded (order_closed, manual for a transfer)');
select ok(exists (select 1 from public.audit_event where entity_id = pg_temp.id('o3a') and action = 'order.cancelled'
  and details ->> 'reason' = 'base_terminated' and (details ->> 'refunds')::integer = 1), 'the cancellation is audited');

-- The same through ops_terminate_order.
insert into ids select 'c3b', pg_temp.new_customer(5);
insert into ids select 'o3b', pg_temp.new_order(pg_temp.id('c3b'), array[20000], 41.40);
insert into ids select 'a3b', pg_temp.new_app(pg_temp.id('c3b'), array[20000], 41.45);
insert into ids select 'o3ba', pg_temp.accept(pg_temp.id('c3b'), public.ops_issue_addon_quote(pg_temp.id('o3b'), pg_temp.id('a3b')));
select pg_temp.pay(pg_temp.id('o3ba'), 100000);
select pg_temp.ops();
select public.ops_terminate_order(pg_temp.id('o3b'), 'idari fesih');
select results_eq(
  $$ select o.status::text, (select sum(r.amount_kurus) from public.refund r where r.order_id = o.id and r.reason = 'order_closed')
     from public.service_order o where o.id = pg_temp.id('o3ba') $$,
  $$ values ('cancelled'::text, 100000::numeric) $$, 'ops_terminate_order also refunds the partly paid add-on');

-- 4, 7. my_gardens tells who opened the removal ----------------------------------------------

insert into ids select 'c4', pg_temp.new_customer(6);
insert into ids select 'o4', pg_temp.new_order(pg_temp.id('c4'), array[20000, 20000], 41.50);
select pg_temp.ops();
select public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o4'), 1), 'duplicate', pg_temp.today() + 5,
  'mükerrer kayıt');
select pg_temp.as_user(pg_temp.id('c4'));
select public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o4'), 2), 'cost');
select results_eq(
  $$ select removal_initiated_by from public.my_gardens() where order_id = pg_temp.id('o4') order by parcel_id = pg_temp.parcel_of(pg_temp.id('o4'), 2) $$,
  $$ values ('ops'::text), ('customer'::text) $$, 'my_gardens: removal_initiated_by of each open removal');
select pg_temp.ops();
select is((select removal_initiated_by from public.ops_customer_gardens('b0000000-0000-4000-8000-000000000001',
  pg_temp.id('c4')) where parcel_id = pg_temp.parcel_of(pg_temp.id('o4'), 1)), 'ops', 'ops_customer_gardens: the same column');

-- 5. The end of access keeps a paying owner whose period has not started ----------------------

-- Parcel P: A pays, B is a second owner (shared deed). A's garden leaves by
-- transfer with access 0 and "remove everyone's access"; B then buys P with
-- a period starting in 10 days. The end of A's access keeps B and B's viewer.
insert into ids select 'cA', pg_temp.new_customer(7);
insert into ids select 'cB', pg_temp.new_customer(8);
insert into ids select 'oA', pg_temp.new_order(pg_temp.id('cA'), array[20000], 41.60);
insert into ids select 'p5', pg_temp.parcel_of(pg_temp.id('oA'));
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p5'), pg_temp.id('cB'), 'owner', null),
       ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p5'), 'a0000000-0000-4000-8000-000000000002', 'viewer',
        pg_temp.id('cB'));
select pg_temp.ops();
insert into ids select 'r5', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('oA')), 'transfer',
  pg_temp.today(), 'hisse devri', 0, true);
select public.ops_complete_garden_removal(pg_temp.id('r5'));
insert into ids select 'oB', pg_temp.accept(pg_temp.id('cB'), public.ops_issue_parcel_quote(
  'b0000000-0000-4000-8000-000000000001', pg_temp.id('cB'), '91200000-0000-4000-8000-000000000001',
  array[pg_temp.id('p5')], false, pg_temp.today() + 10));
select pg_temp.pay(pg_temp.id('oB'));
select is((select status::text from public.service_order where id = pg_temp.id('oB')), 'active',
  'B''s order is active, its period starts in 10 days');
select testing.run_garden_removal_housekeeping();
select ok((select access_revoked_at is not null from public.garden_removal where id = pg_temp.id('r5')),
  'A''s access window ended');
select results_eq(
  $$ select user_id from public.parcel_access where parcel_id = pg_temp.id('p5') order by user_id $$,
  $$ values ('a0000000-0000-4000-8000-000000000002'::uuid), (pg_temp.id('cB')) $$,
  'A''s row is gone; B (paying, not started) and B''s viewer stay despite revoke_all');

-- Without B's order, revoke_all removes B too (unchanged).
insert into ids select 'cC', pg_temp.new_customer(9);
insert into ids select 'cD', pg_temp.new_customer(10);
insert into ids select 'oC', pg_temp.new_order(pg_temp.id('cC'), array[20000], 41.70);
insert into ids select 'p6', pg_temp.parcel_of(pg_temp.id('oC'));
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p6'), pg_temp.id('cD'), 'owner', null);
select pg_temp.ops();
insert into ids select 'r6', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('oC')), 'transfer',
  pg_temp.today(), 'hisse devri', 0, true);
select public.ops_complete_garden_removal(pg_temp.id('r6'));
select testing.run_garden_removal_housekeeping();
select is((select count(*)::integer from public.parcel_access where parcel_id = pg_temp.id('p6')), 0,
  'with no other paying owner, revoke_all removes everyone');

-- Switch: closed on the server too --------------------------------------------------------------

update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
insert into ids select 'c7', pg_temp.new_customer(11);
insert into ids select 'o7', pg_temp.new_order(pg_temp.id('c7'), array[20000], 41.80);
select pg_temp.as_user(pg_temp.id('c7'));
select is(pg_temp.error_of($$ select * from public.customer_addon_preview(array[20000]) $$),
  'P0001 garden_changes_closed', 'switch off: the add-on preview is refused');
insert into ids select 'a7', public.customer_create_application('91200000-0000-4000-8000-000000000001');
select public.customer_save_application_garden(pg_temp.id('a7'),
  jsonb_build_object('name', 'Ek bahçe', 'declared_area_m2', 20000, 'lon', 41.85, 'lat', 37.2),
  '{"authorization_basis": "title_holder", "entry_permission": true}');
select is(pg_temp.error_of($$ select public.customer_submit_application(pg_temp.id('a7')) $$),
  'P0001 garden_changes_closed', 'switch off: a member''s application that would become an add-on is refused');
-- A customer with no membership applies as before.
insert into ids select 'c8', pg_temp.new_customer(12);
select pg_temp.as_user(pg_temp.id('c8'));
insert into ids select 'a8', public.customer_create_application('91200000-0000-4000-8000-000000000001');
select public.customer_save_application_garden(pg_temp.id('a8'),
  jsonb_build_object('name', 'İlk bahçe', 'declared_area_m2', 20000, 'lon', 41.90, 'lat', 37.2),
  '{"authorization_basis": "title_holder", "entry_permission": true}');
select lives_ok($$ select public.customer_submit_application(pg_temp.id('a8')) $$,
  'switch off: a first application is submitted');
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.as_user(pg_temp.id('c7'));
select lives_ok($$ select public.customer_submit_application(pg_temp.id('a7')) $$,
  'switch on: the member''s application is submitted');

select * from finish();
rollback;
