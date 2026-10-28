-- Regression tests of the PR #71 review fixes (20261102120400_garden_review_fixes.sql):
-- 1. failed refunds count as already refunded; 2. the customer cannot cancel an
-- ops removal; 3. visits on the effective day are never refunded; 4. an add-on
-- quote is prorated with the membership's frozen V; 5. one failing removal
-- does not roll back the housekeeping; 6. a removal's own refund is not an
-- unattributed refund of the next removal; 7. a removal at the period end
-- marks the line, and my_gardens shows the garden as removed.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4). Round
-- test prices (testing.use_round_prices, no inventory fee): 20 dönüm cost
-- 1 200 000 kuruş a year. One transaction: now() is constant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
  v uuid := ('f4800000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c48-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 48-' || p_n, 'sms');
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
  -- With the early-performance box (T03): these orders plan visits and deduct
  -- them inside the withdrawal period.
  return public.customer_accept_quote(p_quote,
    '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak", "early_performance": "mesafeli-v5-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid, p_amount bigint default null) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  perform testing.use_single_installment(p_order);
  return public.ops_record_manual_payment(p_order,
    coalesce(p_amount, (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order)),
    current_date, 'EFT-48-' || left(p_order::text, 8) || '-' || coalesce(p_amount, 0));
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

-- 1. A failed refund counts as already refunded -------------------------------------------

-- One line, 4 visits, 1 billed. A Md. 8A refund of 300 000 failed (retryable):
-- IP12 can still retry or settle it, so the removal refunds 600 000, not 900 000.
insert into ids select 'c1', pg_temp.new_customer(1);
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 40.10);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o1')), 'periodic_scan', 'published', pg_temp.today() - 50);
select pg_temp.ops();
insert into ids select 'pay1', id from public.payment where order_id = pg_temp.id('o1');
insert into ids select 'f1', (public.ops_request_refund(pg_temp.id('pay1'), 300000, 'missed_visit', 'Md. 8A',
  (select id from public.payment_item where payment_id = pg_temp.id('pay1'))))[1];
update public.refund set status = 'failed', failure_code = 'bank_error', retryable = true where id = pg_temp.id('f1');
insert into ids select 'r1', pg_temp.remove_now(pg_temp.id('o1'));
select results_eq(
  $$ select refund_mode, refund_kurus, (pg_temp.line(id) ->> 'gross_kurus')::bigint,
            (pg_temp.line(id) ->> 'already_refunded_kurus')::bigint
     from public.garden_removal where id = pg_temp.id('r1') $$,
  $$ values ('unused_visits'::text, 600000::bigint, 900000::bigint, 300000::bigint) $$,
  'a failed refund on the line counts: 900 000 − 300 000');
select is((select coalesce(sum(amount_kurus), 0)::bigint from public.refund where order_id = pg_temp.id('o1')),
  900000::bigint, 'if the failed refund succeeds later, the customer gets 900 000 in all, not 1 200 000');

-- 2. The customer cannot cancel an ops removal --------------------------------------------

insert into ids select 'c2', pg_temp.new_customer(2);
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), array[20000], 40.20);
select pg_temp.ops();
insert into ids select 'r2', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o2')), 'transfer',
  pg_temp.today() + 5, 'parsel satıldı', 0);
select pg_temp.as_user(pg_temp.id('c2'));
select is(pg_temp.error_of($$ select public.customer_cancel_garden_removal(pg_temp.id('r2')) $$),
  'P0001 removal_not_open', 'the former owner cannot undo a transfer removal ops opened');
select is((select status::text from public.garden_removal where id = pg_temp.id('r2')), 'scheduled',
  'the ops removal stays scheduled');
insert into ids select 'o2b', pg_temp.new_order(pg_temp.id('c2'), array[20000], 40.25);
select pg_temp.as_user(pg_temp.id('c2'));
insert into ids select 'r2b', public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o2b')), 'cost');
select pg_temp.ops();
select public.ops_schedule_garden_removal(pg_temp.id('r2b'), pg_temp.today() + 30);
select pg_temp.as_user(pg_temp.id('c2'));
select lives_ok($$ select public.customer_cancel_garden_removal(pg_temp.id('r2b')) $$,
  'the customer still withdraws their own request, also once ops scheduled it');

-- 3. Visits on the effective day are done work ---------------------------------------------

-- Withdrawal today: an inventory and a periodic scan captured this morning
-- (one planned before the request, captured after it) are not refunded.
insert into ids select 'c3', pg_temp.new_customer(3);
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), array[20000], 40.30, -3);
update public.service_order set activated_at = now() - interval '3 days' where id = pg_temp.id('o3');
insert into ids select 'p3', pg_temp.parcel_of(pg_temp.id('o3'));
select pg_temp.visit(pg_temp.id('p3'), 'inventory', 'captured', pg_temp.today(), 0);
insert into ids select 's3', pg_temp.visit(pg_temp.id('p3'), 'periodic_scan', 'planned', pg_temp.today());
select pg_temp.as_user(pg_temp.id('c3'));
insert into ids select 'r3', public.customer_request_garden_removal(pg_temp.id('p3'), 'dissatisfied', null, false, true);
update public.session set status = 'captured', started_at = now() where id = pg_temp.id('s3');
select pg_temp.ops();
select public.ops_complete_garden_removal(pg_temp.id('r3'));
select results_eq(
  $$ select refund_mode, (l ->> 'inventory_done')::boolean, (l ->> 'visits_used')::integer,
            refund_kurus = (l ->> 'amount_kurus')::bigint - (l ->> 'inventory_share_kurus')::bigint
                           - (l ->> 'visit_fee_kurus')::bigint
     from (select g.*, pg_temp.line(g.id) l from public.garden_removal g where g.id = pg_temp.id('r3')) x $$,
  $$ values ('withdrawal'::text, true, 1, true) $$,
  'withdrawal: the inventory and the visit captured on the effective day are deducted');
select is((select status::text from public.session where id = pg_temp.id('s3')), 'captured',
  'the visit captured that day is kept');

-- An ops removal effective today, completed after a visit this morning.
insert into ids select 'c3b', pg_temp.new_customer(4);
insert into ids select 'o3b', pg_temp.new_order(pg_temp.id('c3b'), array[20000], 40.35);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o3b')), 'periodic_scan', 'captured', pg_temp.today(), 0);
insert into ids select 'r3b', pg_temp.remove_now(pg_temp.id('o3b'));
select results_eq(
  $$ select refund_kurus, (pg_temp.line(id) ->> 'visits_used')::integer from public.garden_removal where id = pg_temp.id('r3b') $$,
  $$ values (900000::bigint, 1) $$, 'unused visits: the visit of the effective day is used (3 × 300 000)');

-- 4. Add-on quotes use the membership's frozen V -----------------------------------------------

-- Base order sold with V = 4, 214 days left; ops then raises the package to V = 6.
insert into ids select 'c5', pg_temp.new_customer(5);
insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c5'), array[20000], 40.50, -151);
update public.service_package set periodic_visits_per_year = 6 where id = '91200000-0000-4000-8000-000000000001';
insert into ids select 'a5', pg_temp.new_app(pg_temp.id('c5'), array[20000], 40.55);
select pg_temp.as_user(pg_temp.id('c5'));
select results_eq(
  $$ select visits, periodic_visits_per_year from public.customer_addon_preview(array[20000]) $$,
  $$ values (2::smallint, 4::smallint) $$, 'customer preview: 4 × 214 / 365 = 2 visits');
select pg_temp.ops();
create temporary table preview5 on commit drop as
  select * from public.ops_preview_addon_quote(pg_temp.id('o5'), pg_temp.id('a5'));
insert into ids select 'q5', public.ops_issue_addon_quote(pg_temp.id('o5'), pg_temp.id('a5'));
select results_eq(
  $$ select qi.visits, qi.minimum_fee_kurus, qi.line_total_kurus, q.periodic_visits_per_year,
            (q.inputs -> 'addon' ->> 'visits_per_year')::integer
     from public.quote q join public.quote_item qi on qi.quote_id = q.id where q.id = pg_temp.id('q5') $$,
  $$ select visits, minimum_fee_kurus, line_total_kurus, 4::smallint, 4 from preview5 $$,
  'the issued quote matches the ops preview and keeps V = 4');
select is((select visits from preview5), 2::smallint, 'ops preview: 2 visits');
update public.service_package set periodic_visits_per_year = 1 where id = '91200000-0000-4000-8000-000000000001';
select pg_temp.as_user(pg_temp.id('c5'));
select is((select visits from public.customer_addon_preview(array[20000])), 2::smallint,
  'with V lowered below the membership''s, the preview still prices 2 visits');
update public.service_package set periodic_visits_per_year = 4 where id = '91200000-0000-4000-8000-000000000001';

-- 5. One failing removal does not roll back the housekeeping ----------------------------------

insert into ids select 'c6', pg_temp.new_customer(6);
insert into ids select 'o6', pg_temp.new_order(pg_temp.id('c6'), array[20000], 40.60);
insert into ids select 'c7', pg_temp.new_customer(7);
insert into ids select 'o7', pg_temp.new_order(pg_temp.id('c7'), array[20000], 40.70);
insert into ids select 'c8', pg_temp.new_customer(8);
insert into ids select 'o8', pg_temp.new_order(pg_temp.id('c8'), array[20000], 40.80);
select pg_temp.ops();
insert into ids select 'r6', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o6')), 'sold', pg_temp.today());
insert into ids select 'r7', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o7')), 'sold', pg_temp.today());
insert into ids select 'r8', pg_temp.remove_now(pg_temp.id('o8'), 'sold', 0, 'satış');
-- A deterministic failure while completing r6 (as a broken row would raise).
create function public.zz_fail_48() returns trigger language plpgsql as $$
begin
  if new.garden_removal_id = (select v from ids where k = 'r6') then
    raise exception 'boom_48';
  end if;
  return new;
end;
$$;
create trigger zz_fail_48 before update on public.service_order_item for each row execute function public.zz_fail_48();
select results_eq(
  $$ select (h ->> 'failed')::integer, (h ->> 'completed')::integer >= 1, (h ->> 'access_revoked')::integer >= 1
     from (select testing.run_garden_removal_housekeeping() h) x $$,
  $$ values (1, true, true) $$, 'housekeeping: one failure counted, the others completed and revoked');
select results_eq(
  $$ select id, status::text, access_revoked_at is not null from public.garden_removal
     where id in (pg_temp.id('r6'), pg_temp.id('r7'), pg_temp.id('r8')) order by number $$,
  $$ values (pg_temp.id('r6'), 'scheduled'::text, false), (pg_temp.id('r7'), 'completed'::text, false),
            (pg_temp.id('r8'), 'completed'::text, true) $$,
  'only the failing removal is left open; the access window of another one ends');
select results_eq(
  $$ select details ->> 'step', details ->> 'message' from public.audit_event
     where action = 'garden_removal.housekeeping_failed' and entity_id = pg_temp.id('r6') $$,
  $$ values ('complete'::text, 'boom_48'::text) $$, 'the failure is audited');
drop trigger zz_fail_48 on public.service_order_item;
select is((testing.run_garden_removal_housekeeping() ->> 'failed')::integer, 0, 'the next run completes it');
select is((select status::text from public.garden_removal where id = pg_temp.id('r6')), 'completed', 'r6 completed');

-- 6. A removal's own refund is not an unattributed refund ---------------------------------------

-- Two lines paid with two partial transfers: the payments carry only balance items.
insert into ids select 'c9', pg_temp.new_customer(9);
select pg_temp.accept(pg_temp.id('c9'), public.ops_issue_quote(pg_temp.new_app(pg_temp.id('c9'), array[20000, 20000], 40.90)));
insert into ids select 'o9', id from public.service_order where customer_user_id = pg_temp.id('c9');
select pg_temp.pay(pg_temp.id('o9'), (select total_kurus / 2 from public.service_order where id = pg_temp.id('o9')));
select pg_temp.pay(pg_temp.id('o9'));
select testing.set_order_period(pg_temp.id('o9'), pg_temp.today() - 100, pg_temp.today() + 264);
select is((select count(*)::integer from public.payment_item i join public.payment p on p.id = i.payment_id
           where p.order_id = pg_temp.id('o9') and i.order_item_id is not null), 0, 'only balance items');
select pg_temp.ops();
insert into ids select 'r9a', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o9'), 1), 'sold', pg_temp.today());
select public.ops_complete_garden_removal(pg_temp.id('r9a'));
select results_eq(
  $$ select refund_mode, refund_kurus from public.garden_removal where id = pg_temp.id('r9a') $$,
  $$ values ('unused_visits'::text, 1200000::bigint) $$, 'garden A: refunded on the balance item');
insert into ids select 'r9b', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o9'), 2), 'sold', pg_temp.today());
select public.ops_complete_garden_removal(pg_temp.id('r9b'));
select results_eq(
  $$ select refund_mode, refund_kurus, (pg_temp.line(id) ->> 'already_refunded_kurus')::bigint,
            (pg_temp.line(id) ->> 'unattributed')::boolean
     from public.garden_removal where id = pg_temp.id('r9b') $$,
  $$ values ('unused_visits'::text, 1200000::bigint, 0::bigint, false) $$,
  'garden B: A''s removal refund is neither a share of B nor unattributed');
select is((select count(*)::integer from public.refund where garden_removal_id = pg_temp.id('r9b')), 1,
  'garden B gets its refund row');

-- 7. A removal at the period end marks the line --------------------------------------------------

insert into ids select 'c10', pg_temp.new_customer(10);
insert into ids select 'o10', pg_temp.new_order(pg_temp.id('c10'), array[20000], 41.00, -360);
insert into ids select 'p10', pg_temp.parcel_of(pg_temp.id('o10'));
select pg_temp.as_user(pg_temp.id('c10'));
insert into ids select 'r10', public.customer_request_garden_removal(pg_temp.id('p10'), 'cost', null, true);
select is((select requested_effective_on from public.garden_removal where id = pg_temp.id('r10')), pg_temp.today() + 5,
  'at the period end, no renewal: the day after the line ends');
select testing.set_order_period(pg_temp.id('o10'), pg_temp.today() - 365, pg_temp.today() - 1);
select pg_temp.ops();
select public.ops_schedule_garden_removal(pg_temp.id('r10'), pg_temp.today(), 'dönem kaydı');
select is((testing.run_garden_removal_housekeeping() ->> 'completed')::integer, 1, 'completed on its day');
select results_eq(
  $$ select g.refund_mode, g.refund_kurus, oi.removed_on, oi.garden_removal_id
     from public.garden_removal g join public.service_order_item oi on oi.id = g.order_item_id
     where g.id = pg_temp.id('r10') $$,
  $$ select 'none'::text, 0::bigint, pg_temp.today(), pg_temp.id('r10') $$,
  'no refund; the line is marked removed on the day after its period');
select pg_temp.as_user(pg_temp.id('c10'));
select results_eq(
  $$ select state, removed_on, removal_id, access_until from public.my_gardens() where parcel_id = pg_temp.id('p10') $$,
  $$ select 'removed'::text, pg_temp.today(), pg_temp.id('r10'), pg_temp.today() + 90 $$,
  'my_gardens: removed, with the access end, as parcel_service_status');
select is((select status from public.parcel_service_status(pg_temp.id('p10'))), 'removed',
  'parcel_service_status agrees');

select * from finish();
rollback;
