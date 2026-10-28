-- Early performance and withdrawal (docs/hukuk/kararlar.md H10, H11, H13, T03;
-- docs/bahce-yonetimi.md §7, §9): the planning ban inside the withdrawal
-- period, removal-v1 deductions only with the consent, the portal withdrawal
-- while garden changes are off and its supersede, ops_record_withdrawal by
-- notice day and channel, the notice columns and the withdrawal_received
-- messages.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001 (V = 4). Round test
-- prices (testing.use_round_prices, no inventory fee): 20 dönüm cost 1 200 000
-- kuruş a year (one visit 300 000). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

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
  v uuid := ('f5300000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c53-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 53-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

-- A paid order of one 20-dönüm garden activated now, serving from today - 2;
-- with or without the early-performance box.
create function pg_temp.new_order(p_user uuid, p_lon numeric, p_early boolean) returns uuid language plpgsql
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
  o := public.customer_accept_quote(q, jsonb_build_object('distance_sales', 'mesafeli-v5-taslak',
    'pre_information', 'onbilgi-v5-taslak')
    || case when p_early then '{"early_performance": "mesafeli-v5-taslak"}'::jsonb else '{}'::jsonb end);
  perform pg_temp.ops();
  perform testing.use_single_installment(o);
  perform public.ops_record_manual_payment(o, (select total_kurus from public.service_order where id = o), current_date,
    'EFT-53-' || left(o::text, 8));
  perform testing.set_order_period(o, pg_temp.today() - 2, pg_temp.today() + 362);
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
-- A security definer path (like create_verification_tour): runs as its owner.
create function pg_temp.definer_plan(p_parcel uuid, p_day date) returns uuid language sql security definer
as $$
  insert into public.session (org_id, parcel_id, kind, status, planned_date)
  select p.org_id, p.id, 'inventory', 'planned', p_day from public.parcel p where p.id = p_parcel
  returning id;
$$;
create function pg_temp.plan_sql(p_parcel uuid, p_kind text, p_day date) returns text language sql stable
as $$
  select format($f$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
    values ('b0000000-0000-4000-8000-000000000001', %L, %L, 'planned', %L) $f$, p_parcel, p_kind, p_day);
$$;
grant execute on all functions in schema pg_temp to authenticated;

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3)),
  ('c4', pg_temp.new_customer(4)), ('c5', pg_temp.new_customer(5)), ('c6', pg_temp.new_customer(6));
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), 37.701, false);
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), 37.711, true);
insert into ids select 'p1', pg_temp.parcel_of(pg_temp.id('o1'));
insert into ids select 'p2', pg_temp.parcel_of(pg_temp.id('o2'));
reset role;

-- 1. Planning ban --------------------------------------------------------------------------

set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), 'inventory', pg_temp.today() + 5)),
  'P0001 withdrawal_period_open', 'no inventory inside the withdrawal period without the box');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), 'periodic_scan', pg_temp.today() + 14)),
  'P0001 withdrawal_period_open', 'nor a periodic visit on its last day (inclusive)');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), 'periodic_scan', pg_temp.today() + 15)), null,
  'the day after the withdrawal period is fine');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p1'), 'verification', pg_temp.today() + 1)), null,
  'a verification visit is not service and is not banned');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p2'), 'inventory', pg_temp.today() + 1)), null,
  'with the early-performance box the inventory is planned at once');
select lives_ok(format($$ select pg_temp.definer_plan(%L, %L) $$, pg_temp.id('p1'), pg_temp.today() + 1),
  'security definer paths are not API users');
reset role;
insert into ids select 's1', pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'planned', pg_temp.today() + 20);
insert into ids select 's2', pg_temp.visit(pg_temp.id('p1'), 'inventory', 'planned', pg_temp.today() + 3);
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ update public.session set planned_date = %L where id = %L $$,
  pg_temp.today() + 10, pg_temp.id('s1'))), 'P0001 withdrawal_period_open', 'a visit is not moved into the period');
select is(pg_temp.error_of(format($$ update public.session set planned_date = %L where id = %L $$,
  pg_temp.today() + 30, pg_temp.id('s2'))), null, 'a visit planned inside it can be moved out');
reset role;
insert into ids select 's3', pg_temp.visit(pg_temp.id('p1'), 'inventory', 'planned', pg_temp.today() + 2);
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ update public.session set status = 'captured', started_at = now() where id = %L $$,
  pg_temp.id('s3'))), null, 'a status change of a visit inside the period always syncs (field app)');
select is(pg_temp.error_of(format($$ update public.session set status = 'captured', planned_date = %L where id = %L $$,
  pg_temp.today() + 4, pg_temp.id('s2'))), null, 'also with a new day when it leaves planned');
reset role;

-- A renewal starting later never blocks the running order; the running order
-- outside its withdrawal period plans freely.
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c3'), 37.721, false);
insert into ids select 'p3', pg_temp.parcel_of(pg_temp.id('o3'));
update public.service_order set activated_at = now() - interval '100 days' where id = pg_temp.id('o3');
select testing.set_order_period(pg_temp.id('o3'), pg_temp.today() - 100, pg_temp.today() + 5);
set local role authenticated;
select pg_temp.ops();
insert into ids select 'rq', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c3'),
  '91200000-0000-4000-8000-000000000001', array[pg_temp.id('p3')], false, pg_temp.today() + 6, pg_temp.id('o3'));
select pg_temp.as_user(pg_temp.id('c3'));
insert into ids select 'o4', public.customer_accept_quote(pg_temp.id('rq'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
select pg_temp.ops();
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p3'), 'periodic_scan', pg_temp.today() + 7)),
  'P0001 withdrawal_period_open', 'an unpaid renewal: no service before the contract is paid');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p3'), 'periodic_scan', pg_temp.today() + 2)), null,
  'the running order decides its own days');
reset role;
select testing.use_single_installment(pg_temp.id('o4'));
set local role authenticated;
select public.ops_record_manual_payment(pg_temp.id('o4'), (select total_kurus from public.service_order where id = pg_temp.id('o4')),
  current_date, 'EFT-53-renewal');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p3'), 'periodic_scan', pg_temp.today() + 3)), null,
  'a paid renewal inside its withdrawal period does not block the running order');
select is(pg_temp.error_of(pg_temp.plan_sql(pg_temp.id('p3'), 'periodic_scan', pg_temp.today() + 8)),
  'P0001 withdrawal_period_open', 'but its own first days are inside its withdrawal period');
reset role;

-- 2. Refunds -------------------------------------------------------------------------------

-- Without the box a withdrawal refunds the whole line, even after a visit.
select pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'captured', pg_temp.today() - 1);
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select refund_estimate_kurus, withdrawal from public.customer_garden_removal_preview(pg_temp.id('p1'), 'withdrawal') $$,
  $$ values (1200000::bigint, true) $$, 'preview: the whole amount without the box');
reset role;
-- With the box the done visit is deducted (this package has no inventory share).
select pg_temp.visit(pg_temp.id('p2'), 'inventory', 'captured', pg_temp.today() - 1);
select pg_temp.visit(pg_temp.id('p2'), 'periodic_scan', 'captured', pg_temp.today() - 1);
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c2'));
select is((select refund_estimate_kurus from public.customer_garden_removal_preview(pg_temp.id('p2'), 'withdrawal')),
  1200000::bigint - 300000, 'with the box: the done visit is deducted (8B/4)');
reset role;

-- 3. Portal withdrawal while garden changes are off ---------------------------------------------

update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c1'));
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p1'), 'sold', 'notice') $$),
  'P0001 garden_changes_closed', 'every other timing stays closed');
insert into ids select 'w1', public.customer_request_garden_removal(pg_temp.id('p1'), 'dissatisfied', 'withdrawal');
reset role;
select results_eq(
  $$ select status::text, withdrawal, initiated_by, notice_channel, notice_received_on
     from public.garden_removal where id = pg_temp.id('w1') $$,
  $$ select 'requested'::text, true, 'customer'::text, 'portal'::text, pg_temp.today() $$,
  'H10: the withdrawal goes through with the switch off; channel portal, today');
select results_eq(
  $$ select template::text, vars ->> 'ref' = (select number from public.garden_removal where id = pg_temp.id('w1'))
     from public.notification where ref_id = pg_temp.id('w1') $$,
  $$ values ('withdrawal_received', true) $$, 'the confirmation SMS is queued at once');
select public.ops_complete_garden_removal(pg_temp.id('w1')) from (select pg_temp.ops()) x;
reset role;
select results_eq(
  $$ select refund_mode, refund_kurus, (calculation -> 'lines' -> 0 ->> 'early_performance')::boolean
     from public.garden_removal where id = pg_temp.id('w1') $$,
  $$ values ('withdrawal'::text, 1200000::bigint, false) $$, 'completed: the whole line refunded, consent recorded as absent');
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';

-- Supersede: a removal "in 30 days" gives way to the withdrawal.
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c2'));
insert into ids select 'r2', public.customer_request_garden_removal(pg_temp.id('p2'), 'not_needed', 'notice');
select is((select effective_on from public.customer_garden_removal_preview(pg_temp.id('p2'), 'withdrawal')), pg_temp.today(),
  'the withdrawal preview is offered over an open removal');
insert into ids select 'w2', public.customer_request_garden_removal(pg_temp.id('p2'), 'not_needed', 'withdrawal');
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p2'), 'sold', 'withdrawal') $$),
  'P0001 garden_removal_open', 'one open withdrawal per garden');
reset role;
select results_eq(
  $$ select status::text, cancelled_by from public.garden_removal where id = pg_temp.id('r2') $$,
  $$ values ('cancelled'::text, 'system'::text) $$, 'the open removal is cancelled by the system');
select is((select details ->> 'reason' from public.audit_event where entity_id = pg_temp.id('r2')
           and action = 'garden_removal.cancelled'), 'superseded_by_withdrawal', 'and audited');
select is((select status::text from public.garden_removal where id = pg_temp.id('w2')), 'requested', 'the withdrawal is open');

-- 4. Ops records a withdrawal by e-mail, KEP or post ------------------------------------------------

insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c4'), 37.731, false);
insert into ids select 'o6', pg_temp.new_order(pg_temp.id('c5'), 37.741, false);
update public.service_order set activated_at = now() - interval '13 days' where id = pg_temp.id('o5');
insert into ids select 'i5', pg_temp.item_of(pg_temp.id('o5'));
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_record_withdrawal(array[%L]::uuid[], %L, 'portal', null) $$,
  pg_temp.item_of(pg_temp.id('o5')), pg_temp.today())), '22023 invalid_input / channel', 'channels: email, kep, post');
select is(pg_temp.error_of(format($$ select public.ops_record_withdrawal(array[%L]::uuid[], %L, 'email', null) $$,
  pg_temp.item_of(pg_temp.id('o5')), pg_temp.today() + 1)), '22023 invalid_input / notice_received_on',
  'the notice day is not in the future');
select is(pg_temp.error_of(format($$ select public.ops_record_withdrawal(array[%L]::uuid[], %L, 'post', null) $$,
  pg_temp.item_of(pg_temp.id('o5')), pg_temp.today() + 2 - 0)), '22023 invalid_input / notice_received_on',
  'nor two days ahead');
reset role;
update public.service_order set activated_at = now() - interval '16 days' where id = pg_temp.id('o5');
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_record_withdrawal(array[%L]::uuid[], %L, 'kep', null) $$,
  pg_temp.item_of(pg_temp.id('o5')), pg_temp.today())), 'P0001 withdrawal_expired',
  'a notice arriving after the last day is late');
insert into ids select 'w5', (public.ops_record_withdrawal(array[pg_temp.item_of(pg_temp.id('o5'))],
  pg_temp.today() - 2, 'kep', 'KEP ile geldi'))[1];
reset role;
select results_eq(
  $$ select status::text, withdrawal, initiated_by, requested_by, notice_channel, notice_received_on, refund_mode,
            refund_kurus
     from public.garden_removal where id = pg_temp.id('w5') $$,
  $$ select 'completed'::text, true, 'customer'::text, 'a0000000-0000-4000-8000-000000000005'::uuid, 'kep'::text,
            pg_temp.today() - 2, 'withdrawal'::text, 1200000::bigint $$,
  'judged by the notice day (day 14), effective at once, the owner''s declaration recorded by ops');
select results_eq(
  $$ select template::text from public.notification where ref_id = pg_temp.id('w5') order by template::text $$,
  $$ values ('garden_removal_completed'), ('withdrawal_received') $$, 'the confirmation and the completion messages');
select is((select details ->> 'notice_channel' from public.audit_event where entity_id = pg_temp.id('w5')
           and action = 'garden_removal.requested'), 'kep', 'audited with the channel');
update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'staff_safety', %L) $$,
  pg_temp.item_of(pg_temp.id('o6')), pg_temp.today() + 10)), 'P0001 garden_changes_closed',
  'other ops removals stay closed');
insert into ids select 'w6', (public.ops_record_withdrawal(array[pg_temp.item_of(pg_temp.id('o6'))],
  pg_temp.today(), 'email', null))[1];
reset role;
select is((select status::text from public.garden_removal where id = pg_temp.id('w6')), 'completed',
  'an e-mailed withdrawal is recorded while garden changes are off');
set local role authenticated;
select pg_temp.as_user(pg_temp.id('c4'));
select is(pg_temp.error_of(format($$ select public.ops_record_withdrawal(array[%L]::uuid[], %L, 'email', null) $$,
  pg_temp.id('i5'), pg_temp.today())), 'P0002 not_found', 'only ops records withdrawals');
reset role;
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';

-- 5. Checks ----------------------------------------------------------------------------------

select throws_ok(format($$ insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id,
  order_item_id, garden_name, initiated_by, reason, withdrawal, requested_effective_on, access_days)
  select org_id, customer_user_id, 'C-2026-999991', %L, order_id, id, 'x', 'customer', 'other', true, %L, 90
  from public.service_order_item where id = %L $$, pg_temp.id('p3'), pg_temp.today(), pg_temp.item_of(pg_temp.id('o3'))),
  '23514', null, 'a withdrawal has a channel');
select throws_ok(format($$ insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id,
  order_item_id, garden_name, initiated_by, reason, withdrawal, requested_effective_on, access_days, notice_channel)
  select org_id, customer_user_id, 'C-2026-999992', %L, order_id, id, 'x', 'customer', 'other', true, %L, 90, 'post'
  from public.service_order_item where id = %L $$, pg_temp.id('p3'), pg_temp.today(), pg_temp.item_of(pg_temp.id('o3'))),
  '23514', null, 'e-mail, KEP and post need the notice day');
select throws_ok(format($$ insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id,
  order_item_id, garden_name, initiated_by, reason, withdrawal, requested_effective_on, access_days, notice_channel)
  select org_id, customer_user_id, 'C-2026-999993', %L, order_id, id, 'x', 'customer', 'other', false, %L, 90, 'portal'
  from public.service_order_item where id = %L $$, pg_temp.id('p3'), pg_temp.today(), pg_temp.item_of(pg_temp.id('o3'))),
  '23514', null, 'only a withdrawal has notice columns');
select throws_ok(format($$ update public.garden_removal set notice_channel = 'post' where id = %L $$, pg_temp.id('w2')),
  'P0001', 'garden_removal_frozen', 'the notice columns never change');
select ok(has_column_privilege('authenticated', 'public.garden_removal', 'notice_channel', 'select'),
  'the customer reads the channel');
select ok(not has_function_privilege('authenticated', 'private.withdrawal_blocks_visit(uuid, date)', 'execute'),
  'the ban helper is internal (authz wrapper for the guard)');

select * from finish();
rollback;
