-- 8A reconciliation at window and period ends (docs/hukuk/kararlar.md H21;
-- T06; contract Md. 8A/2, 8A/6): an order completed by the billing
-- housekeeping and a "dönem sonunda" removal open an ops task for the visits
-- that fell short, due 14 days after the period end; refunded (8A) visits are
-- not missing; the daily check after a window opens a task once the windows
-- left cannot hold the visits; overdue flag; resolution once. T08 is off here
-- (the hosted default) so that only T06 runs.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4). Round
-- prices (one visit 300 000 kuruş). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
  v uuid := ('f7200000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c72-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 72-' || p_n, 'sms');
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
    '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak", "early_performance": "mesafeli-v5-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order),
    current_date, 'EFT-72-' || left(p_order::text, 8));
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

update public.org_billing_setting set service_end_access_flow_enabled = false;
create function pg_temp.tasks(p_order uuid) returns integer language sql stable
as $$ select count(*)::integer from private.visit_reconciliation where order_id = p_order $$;

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3)),
  ('c4', pg_temp.new_customer(4)), ('c5', pg_temp.new_customer(5));

-- 1. Period end (billing housekeeping) ---------------------------------------------------

insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.701, -365);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o1')), 'periodic_scan', 'published', pg_temp.today() - 300);
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), array[20000], 37.711, -365);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o2')), 'periodic_scan', 'published', pg_temp.today() - 300 + n * 80)
from generate_series(0, 3) n;
-- o3: three visits and one 8A refund.
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), array[20000], 37.721, -365);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o3')), 'periodic_scan', 'published', pg_temp.today() - 300 + n * 80)
from generate_series(0, 2) n;
select pg_temp.ops();
select public.ops_request_refund((select id from public.payment where order_id = pg_temp.id('o3') order by created_at, id limit 1), 300000,
  'missed_visit', '8A/2');
reset role;
select private.billing_housekeeping();
select results_eq(
  $$ select trigger, scope_end, visits_entitled, visits_used, visits_refunded, shortfall, due_on, status, visit_fee_kurus
     from private.visit_reconciliation where order_id = pg_temp.id('o1') $$,
  $$ values ('period_end'::text, pg_temp.today() - 1, 4, 1, 0, 3, pg_temp.today() + 13, 'open'::text, 300000::bigint) $$,
  'a completed order with 1 of 4 visits: a task for 3 visits, due 14 days after the period end');
select is(pg_temp.tasks(pg_temp.id('o2')), 0, 'all visits done: no task');
select is(pg_temp.tasks(pg_temp.id('o3')), 0, 'the missing visit was refunded under 8A: no task');
select private.billing_housekeeping();
select is(pg_temp.tasks(pg_temp.id('o1')), 1, 'once per line and period');

-- 2. "Dönem sonunda" removal ----------------------------------------------------------

insert into ids select 'o4', pg_temp.new_order(pg_temp.id('c4'), array[20000], 37.731, -364);
select pg_temp.as_user(pg_temp.id('c4'));
insert into ids select 'r4', public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o4')), 'cost', 'period_end');
-- The period ended yesterday (the test cannot wait): ops confirm the exit today.
select testing.set_order_period(pg_temp.id('o4'), pg_temp.today() - 365, pg_temp.today() - 1);
select pg_temp.ops();
select public.ops_schedule_garden_removal(pg_temp.id('r4'), pg_temp.today(), 'dönem bitti');
reset role;
select private.garden_removal_housekeeping();
select results_eq(
  $$ select trigger, shortfall, due_on from private.visit_reconciliation where order_id = pg_temp.id('o4') $$,
  $$ values ('removal'::text, 4, pg_temp.today() + 13) $$,
  'a "dönem sonunda" removal: the same check (4 visits missing)');

-- 3. Window end ---------------------------------------------------------------------------

insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c5'), array[20000], 37.741);
-- A fixed period: 1 January – 31 December of next year (windows: winter
-- (Jan–Feb), spring, summer, harvest, winter (from 1 December)).
create temporary table yy on commit drop as select extract(year from pg_temp.today())::integer + 1 as y;
select testing.set_order_period(pg_temp.id('o5'), make_date((select y from yy), 1, 1), make_date((select y from yy), 12, 31));
select is((private.visit_reconciliation_housekeeping(make_date((select y from yy), 3, 1)) ->> 'windows')::integer, 1,
  'the day after the winter window: one window ended');
select is(pg_temp.tasks(pg_temp.id('o5')), 0, 'four windows still ahead hold the four visits: no task');
select private.visit_reconciliation_housekeeping(make_date((select y from yy), 6, 1));
select results_eq(
  $$ select trigger, scope_end, window_label, windows_ahead, shortfall, due_on
     from private.visit_reconciliation where order_id = pg_temp.id('o5') $$,
  $$ values ('window_end'::text, make_date((select y from yy), 5, 31), 'İlkbahar ' || (select y from yy), 3, 1,
             make_date((select y from yy), 6, 14)) $$,
  'after spring with no visit: one visit cannot fit in the three windows left (due in 14 days)');
select is((private.visit_reconciliation_housekeeping(make_date((select y from yy), 6, 2)) ->> 'windows')::integer, 0,
  'no window ended the day before: nothing runs');

-- 4. Ops list and resolution ------------------------------------------------------------

insert into ids select 'v1', id from private.visit_reconciliation where order_id = pg_temp.id('o1');
select pg_temp.ops();
select results_eq(
  $$ select order_id, overdue from public.ops_visit_reconciliations('b0000000-0000-4000-8000-000000000001')
     where order_id in (pg_temp.id('o1'), pg_temp.id('o5')) order by due_on $$,
  $$ values (pg_temp.id('o1'), false), (pg_temp.id('o5'), false) $$, 'ops list: the open tasks by due day');
select results_eq(
  $$ select open >= 3, overdue >= 0 from public.ops_visit_reconciliation_counts('b0000000-0000-4000-8000-000000000001') $$,
  $$ values (true, true) $$, 'nav counts');
select is(pg_temp.error_of(format($$ select public.ops_resolve_visit_reconciliation(%L, 'not_needed') $$, pg_temp.id('v1'))),
  '22023 invalid_input / note', 'not needed requires a note');
select lives_ok(format($$ select public.ops_resolve_visit_reconciliation(%L, 'refund_opened', 'İade açıldı') $$,
  pg_temp.id('v1')), 'resolved with the refund');
select is(pg_temp.error_of(format($$ select public.ops_resolve_visit_reconciliation(%L, 'visit_done') $$, pg_temp.id('v1'))),
  'P0001 reconciliation_frozen', 'once');
select pg_temp.as_user(pg_temp.id('c1'));
select is(pg_temp.error_of($$ select * from public.ops_visit_reconciliations('b0000000-0000-4000-8000-000000000001') $$),
  '42501 forbidden', 'customers never see the tasks');
reset role;
-- Overdue: a task whose due day has passed.
insert into private.visit_reconciliation (org_id, customer_user_id, order_id, order_item_id, parcel_id, trigger, scope_end,
  visits_entitled, visits_used, visits_refunded, visits_carried, windows_ahead, shortfall, visit_fee_kurus, detected_on, due_on)
select 'b0000000-0000-4000-8000-000000000001', pg_temp.id('c2'), pg_temp.id('o2'), pg_temp.item_of(pg_temp.id('o2')),
       pg_temp.parcel_of(pg_temp.id('o2')), 'period_end', pg_temp.today() - 20, 4, 3, 0, 0, 0, 1, 300000,
       pg_temp.today() - 19, pg_temp.today() - 6;
select pg_temp.ops();
select is((select overdue from public.ops_visit_reconciliations('b0000000-0000-4000-8000-000000000001')
           where order_id = pg_temp.id('o2')), true, 'past its due day: overdue');

select * from finish();
rollback;
