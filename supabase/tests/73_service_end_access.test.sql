-- Access when a contract ends for a garden in any way (docs/hukuk/kararlar.md
-- H22, H23, H25; T08, T09, T23; contract Md. 12/4): with
-- service_end_access_flow_enabled on, a completed order, a terminated order
-- and a pilot parcel set passive get the read-only window (no question, no
-- co-owner invitation), the 7-day message and the access end; a paid
-- renewal and an active pilot parcel reopen access; with the hosted default
-- nothing changes. At the access end the field contact's phone is cleared
-- (name kept); contract end dates are stored; Bahçelerim lists removed
-- gardens with the exit day, also after the access ended.
-- Seed: org b0..01, ops a0..05, owner a0..01 and viewer a0..02 of the pilot
-- parcel c0..01 (no order, field contact "Örnek Bekçi"). One transaction.
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
grant select, insert on tday, ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f7300000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c73-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 73-' || p_n, 'sms');
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
    current_date, 'EFT-73-' || left(p_order::text, 8));
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

create function pg_temp.window_of(p_parcel uuid, p_user uuid) returns public.garden_removal language sql stable
as $$
  select r.* from public.garden_removal r
  where r.parcel_id = p_parcel and r.customer_user_id = p_user and r.initiated_by = 'system'
  order by r.created_at desc, r.id desc limit 1
$$;

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3)),
  ('c4', pg_temp.new_customer(4));

-- 1. Hosted default: nothing changes --------------------------------------------------

update public.org_billing_setting set service_end_access_flow_enabled = false;
insert into ids select 'o0', pg_temp.new_order(pg_temp.id('c4'), array[20000], 37.791, -366);
reset role;
select private.billing_housekeeping();
select results_eq(
  $$ select (select status::text from public.service_order where id = pg_temp.id('o0')),
            (select count(*)::integer from public.garden_removal where order_id = pg_temp.id('o0')),
            (select status::text from public.parcel where id = pg_temp.parcel_of(pg_temp.id('o0'))) <> 'passive' $$,
  $$ values ('completed'::text, 0, true) $$, 'setting off: the order completes as today, no window, parcel untouched');
update public.org_billing_setting set service_end_access_flow_enabled = true;

-- 2. Completed order ------------------------------------------------------------------

insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.801, -365);
insert into ids select 'p1', pg_temp.parcel_of(pg_temp.id('o1'));
insert into ids select 'sp', pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'planned', pg_temp.today() + 20);
reset role;
select private.billing_housekeeping();
select results_eq(
  $$ select status::text, initiated_by, reason::text, effective_on, access_days, access_until, refund_mode, refund_kurus
     from pg_temp.window_of(pg_temp.id('p1'), pg_temp.id('c1')) $$,
  $$ values ('completed'::text, 'system'::text, 'period_ended'::text, pg_temp.today(), 90::smallint, pg_temp.today() + 90,
             'none'::text, 0::bigint) $$,
  'a completed order: the read-only window of 90 days from the day after its end, no refund');
select results_eq(
  $$ select (select status::text from public.parcel where id = pg_temp.id('p1')),
            (select status::text from public.session where id = pg_temp.id('sp')),
            private.parcel_read_only(pg_temp.id('p1')) $$,
  $$ values ('passive'::text, 'cancelled'::text, true) $$, 'parcel passive, planned visits cancelled, read-only');
select pg_temp.as_user(pg_temp.id('c1'));
select is(pg_temp.error_of($$ select public.owner_invite_viewer(pg_temp.id('p1'), 'Yeni Hissedar', '+905550007301', true) $$),
  'P0001 parcel_read_only', 'no co-owner invitation in the window');
set local role authenticated;
select is(pg_temp.error_of(format($$ insert into public.question (parcel_id, body) values (%L, 'Soru') $$, pg_temp.id('p1'))),
  'P0001 parcel_read_only', 'no question in the window');
reset role;
select results_eq(
  $$ select state, removal_effective_on, access_until from public.my_gardens() where parcel_id = pg_temp.id('p1') $$,
  $$ values ('removed'::text, pg_temp.today(), pg_temp.today() + 90) $$, 'Bahçelerim: out of service with the window');
reset role;
select results_eq(
  $$ select user_id, last_service_day, cause from private.contract_end where parcel_id = pg_temp.id('p1') $$,
  $$ values (pg_temp.id('c1'), pg_temp.today() - 1, 'period_ended'::text) $$, 'T09: the contract end date is stored');
select is(private.parcel_contract_end(pg_temp.id('p1')), pg_temp.today() - 1, 'per parcel');
select is(private.owner_contract_end(pg_temp.id('c1')), pg_temp.today() - 1, 'and per owner');

-- The housekeeping of removals runs for these windows too.
select private.garden_removal_housekeeping();
select is((select count(*)::integer from public.notification where template = 'garden_access_ending'
           and recipient_user_id = pg_temp.id('c1')), 0, 'no access-ending message 90 days ahead');

-- A renewal paid in the window reopens access (and keeps the field contact's phone).
update private.parcel_detail set site_contact_phone = '+905550007309' where parcel_id = pg_temp.id('p1');
select pg_temp.ops();
insert into ids select 'q1', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c1'),
  '91200000-0000-4000-8000-000000000001', array[pg_temp.id('p1')], false, null, pg_temp.id('o1'));
insert into ids select 'o1r', pg_temp.accept(pg_temp.id('c1'), pg_temp.id('q1'));
select pg_temp.pay(pg_temp.id('o1r'));
reset role;
select results_eq(
  $$ select (pg_temp.window_of(pg_temp.id('p1'), pg_temp.id('c1'))).access_revoked_at is not null,
            private.parcel_read_only(pg_temp.id('p1')),
            (select status::text from public.parcel where id = pg_temp.id('p1')) <> 'passive',
            exists (select 1 from public.parcel_access where parcel_id = pg_temp.id('p1') and user_id = pg_temp.id('c1')) $$,
  $$ values (true, false, true, true) $$, 'renewal paid in the window: access fully open again');
select is((select site_contact_phone from private.parcel_detail where parcel_id = pg_temp.id('p1')), '+905550007309',
  'a window closed by the renewal clears no phone');

-- 3. Terminated order -------------------------------------------------------------------

insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), array[20000], 37.811);
insert into ids select 'p2', pg_temp.parcel_of(pg_temp.id('o2'));
select pg_temp.ops();
select public.ops_terminate_order(pg_temp.id('o2'), 'idari fesih');
reset role;
select results_eq(
  $$ select reason::text, effective_on, access_until from pg_temp.window_of(pg_temp.id('p2'), pg_temp.id('c2')) $$,
  $$ values ('order_terminated'::text, pg_temp.today(), pg_temp.today() + 90) $$,
  'ops_terminate_order: the window from today');
select ok(private.parcel_read_only(pg_temp.id('p2')), 'read-only after the termination');

-- 4. Access end: phone cleared, Bahçelerim keeps the garden ------------------------------

insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), array[20000], 37.821, -365);
insert into ids select 'p3', pg_temp.parcel_of(pg_temp.id('o3'));
update private.parcel_detail set site_contact_name = 'Bekçi 73', site_contact_phone = '+905550007302'
where parcel_id = pg_temp.id('p3');
update public.org_billing_setting set removal_access_days = 0;
select private.billing_housekeeping();
select private.garden_removal_housekeeping();
update public.org_billing_setting set removal_access_days = 90;
select results_eq(
  $$ select site_contact_name, site_contact_phone from private.parcel_detail where parcel_id = pg_temp.id('p3') $$,
  $$ values ('Bekçi 73'::text, null::text) $$, 'T09: at the access end the field contact''s phone is cleared, the name kept');
select is((select count(*)::integer from private.application_garden_detail d
           join public.application_garden g on g.id = d.application_garden_id
           where g.customer_user_id = pg_temp.id('c3') and d.site_contact_phone is not null), 0,
  'also in the customer''s application copy');
select ok(not exists (select 1 from public.parcel_access where parcel_id = pg_temp.id('p3') and user_id = pg_temp.id('c3')),
  'the owner''s access is gone');
select pg_temp.as_user(pg_temp.id('c3'));
select results_eq(
  $$ select state, garden_name is not null, removal_effective_on from public.my_gardens() where parcel_id = pg_temp.id('p3') $$,
  $$ values ('removed'::text, true, pg_temp.today()) $$,
  'T23: Bahçelerim lists the garden after the access ended, with the exit day');
reset role;

-- A removed garden stays in Bahçelerim after its access ended too.
insert into ids select 'c5', pg_temp.new_customer(5);
insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c5'), array[20000], 37.831);
select pg_temp.ops();
insert into ids select 'r5', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o5')), 'staff_safety',
  pg_temp.today(), 'Tehdit', 0);
select public.ops_complete_garden_removal(pg_temp.id('r5'));
reset role;
select private.garden_removal_housekeeping();
select pg_temp.as_user(pg_temp.id('c5'));
select results_eq(
  $$ select state, removed_on, removal_number is not null from public.my_gardens()
     where parcel_id = pg_temp.parcel_of(pg_temp.id('o5')) $$,
  $$ values ('removed'::text, pg_temp.today(), true) $$, 'a removed garden after its access ended: listed with the exit day');
reset role;

-- 5. Pilot parcel ------------------------------------------------------------------------

update public.session set status = 'cancelled' where parcel_id = 'c0000000-0000-4000-8000-000000000001' and status = 'planned';
select pg_temp.ops();
select is(public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', true), 'passive'::public.parcel_status,
  'a pilot parcel set passive');
reset role;
select results_eq(
  $$ select customer_user_id, reason::text, order_id is null, status::text
     from public.garden_removal where parcel_id = 'c0000000-0000-4000-8000-000000000001' and initiated_by = 'system' $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, 'pilot_ended'::text, true, 'completed'::text) $$,
  'its owner gets the window (no order)');
select ok(private.parcel_read_only('c0000000-0000-4000-8000-000000000001'), 'read-only');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'X', '+905550007303', true) $$),
  'P0001 parcel_read_only', 'no invitation on the passive pilot parcel');
select pg_temp.ops();
select isnt(public.ops_set_parcel_passive('c0000000-0000-4000-8000-000000000001', false), 'passive'::public.parcel_status,
  'set active again');
reset role;
select ok(not private.parcel_read_only('c0000000-0000-4000-8000-000000000001')
  and (select access_revoked_at is not null from public.garden_removal
       where parcel_id = 'c0000000-0000-4000-8000-000000000001' and initiated_by = 'system'),
  'the pilot window closes, access stays');

select * from finish();
rollback;
