-- Removing gardens during a membership (IP14, docs/bahce-yonetimi.md §5, §7,
-- §9.6, §9.8, §10): requests (notice, period end, withdrawal on day 14 and
-- 15), ops scheduling and messages, completion (lines, refunds, visits,
-- follow-ups, invitations, passive parcel, emptied orders), the refund
-- calculation removal-v1 with the doc §7 examples, prior refunds, billed
-- visits, refund rows (item, balance, unallocated), pending orders, the
-- read-only window and its guards, the end of access, re-adding a garden and
-- the housekeeping.
-- Seed: org b0..01, ops a0..05, expert a0..04, owner a0..01 of parcel c0..01
-- (viewer a0..02 granted by the owner), package standart 9120..0001 (V = 4):
-- 20 dönüm cost 1 200 000 kuruş a year. One transaction: now() is constant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(117);

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
-- Read as postgres once: guards are tested as the API role, without usage on private.
create temporary table tday on commit drop as select private.istanbul_today() as d;
create function pg_temp.today() returns date language sql stable as $$ select d from tday $$;
create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on tday, ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f4600000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c46-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 46-' || p_n, 'sms');
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
  return public.customer_accept_quote(p_quote, '{"distance_sales": "mesafeli-v1-taslak", "pre_information": "onbilgi-v1-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid, p_amount bigint default null) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    coalesce(p_amount, (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order)),
    current_date, 'EFT-46-' || left(p_order::text, 8) || '-' || coalesce(p_amount, 0));
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

-- 1. Customer requests ------------------------------------------------------------------

insert into ids select 'c1', pg_temp.new_customer(1);
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.20);
insert into ids select 'p1', pg_temp.parcel_of(pg_temp.id('o1'));
select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select order_item_id, effective_on, withdrawal, access_until, visits_entitled, visits_used, refund_estimate_kurus, line_count
     from public.customer_garden_removal_preview(pg_temp.id('p1')) $$,
  $$ select pg_temp.item_of(pg_temp.id('o1')), pg_temp.today() + 30, false, pg_temp.today() + 120, 4::smallint, 0,
            1200000::bigint, 1 $$,
  'preview, in 30 days: the date, access end, at most the whole amount (no visit yet)');
select is((select effective_on from public.customer_garden_removal_preview(pg_temp.id('p1'), true)),
  pg_temp.today() + 265, 'at the period end: the day after the line ends');
select is(pg_temp.error_of($$ select * from public.customer_garden_removal_preview(pg_temp.id('p1'), true, true) $$),
  '22023 invalid_input / withdrawal', 'not both choices');
update public.service_order set activated_at = now() - interval '20 days' where id = pg_temp.id('o1');
select is(pg_temp.error_of($$ select * from public.customer_garden_removal_preview(pg_temp.id('p1'), false, true) $$),
  'P0001 withdrawal_expired', 'withdrawal only within 14 days of activation');
update public.service_order set activated_at = now() - interval '14 days' where id = pg_temp.id('o1');
select results_eq(
  $$ select effective_on, withdrawal, withdrawal_until from public.customer_garden_removal_preview(pg_temp.id('p1'), false, true) $$,
  $$ select pg_temp.today(), true, pg_temp.today() $$, 'day 14 of the withdrawal period: accepted, effective today');
update public.service_order set activated_at = now() - interval '15 days' where id = pg_temp.id('o1');
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p1'), 'sold', null, false, true) $$),
  'P0001 withdrawal_expired', 'day 15: refused');
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p1'), 'transfer') $$),
  '22023 invalid_input / reason', 'transfer and duplicate are ops'' reasons');
select is(pg_temp.error_of(format($$ select public.customer_request_garden_removal(%L, 'other', %L) $$,
  pg_temp.id('p1'), repeat('x', 1001))), '22023 invalid_input / note', 'a note of at most 1000 characters');
select is(pg_temp.error_of($$ select public.customer_request_garden_removal('c0000000-0000-4000-8000-000000000001', 'sold') $$),
  'P0002 not_found', 'only an owned parcel');
update public.org_billing_setting set garden_changes_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p1'), 'sold') $$),
  'P0001 garden_changes_closed', 'no request while the switch is off');
update public.org_billing_setting set garden_changes_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';
insert into ids select 'r1', public.customer_request_garden_removal(pg_temp.id('p1'), 'not_needed', 'Bahçeyi kiraya verdim');
select results_eq(
  $$ select status::text, initiated_by, number ~ '^C-[0-9]{4}-[0-9]{6}$', requested_effective_on, effective_on,
            access_days, withdrawal, at_period_end, order_item_id
     from public.garden_removal where id = pg_temp.id('r1') $$,
  $$ select 'requested'::text, 'customer'::text, true, pg_temp.today() + 30, null::date, 90::smallint, false, false,
            pg_temp.item_of(pg_temp.id('o1')) $$,
  'a requested removal (C-…), effective in 30 days');
select is((select count(*)::integer from public.notification where ref_id = pg_temp.id('r1')), 0,
  'no message for the customer''s own request');
select is((select details ->> 'access_days' from public.audit_event where action = 'garden_removal.requested'
           and entity_id = pg_temp.id('r1') and actor_role = 'customer'), '90', 'garden_removal.requested by the customer');
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.id('p1'), 'sold') $$),
  'P0001 garden_removal_open', 'one open removal per garden');
select is((select state from public.my_gardens() where parcel_id = pg_temp.id('p1')), 'leaving', 'my_gardens: leaving');
select results_eq(
  $$ select status, leaving_on from public.parcel_service_status(pg_temp.id('p1')) $$,
  $$ select 'leaving'::text, pg_temp.today() + 30 $$, 'parcel_service_status: leaving on the day');
select lives_ok($$ select public.customer_cancel_garden_removal(pg_temp.id('r1')) $$, 'the customer withdraws it');
select is(pg_temp.error_of($$ select public.customer_cancel_garden_removal(pg_temp.id('r1')) $$),
  'P0001 removal_not_open', 'once');

-- 2. Ops: schedule, messages, access rule, cancel -----------------------------------------

select pg_temp.as_user(pg_temp.id('c1'));
insert into ids select 'r2', public.customer_request_garden_removal(pg_temp.id('p1'), 'cost');
select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_schedule_garden_removal(pg_temp.id('r2'), pg_temp.today() + 10) $$),
  '22023 invalid_input / note', 'another day than requested needs a note');
select is(pg_temp.error_of($$ select public.ops_schedule_garden_removal(pg_temp.id('r2'), pg_temp.today() + 266, 'x') $$),
  '22023 invalid_input / effective_on', 'not after the day after the line ends');
select is(pg_temp.error_of($$ select public.ops_schedule_garden_removal(pg_temp.id('r2'), pg_temp.today() + 30, null, 10) $$),
  '22023 invalid_input / access_days', 'a shorter access needs a transfer, a duplicate or a note');
select lives_ok($$ select public.ops_schedule_garden_removal(pg_temp.id('r2'), pg_temp.today() + 30) $$,
  'ops confirms the requested day');
select results_eq(
  $$ select status::text, effective_on, access_until, scheduled_at is not null from public.garden_removal where id = pg_temp.id('r2') $$,
  $$ select 'scheduled'::text, pg_temp.today() + 30, pg_temp.today() + 120, true $$, 'scheduled');
select results_eq(
  $$ select template::text, vars ->> 'ref', vars ->> 'path', vars ->> 'parcel_name', parcel_id from public.notification
     where ref_id = pg_temp.id('r2') $$,
  $$ select 'garden_removal_scheduled'::text, (select number from public.garden_removal where id = pg_temp.id('r2')),
            '/portal/parsel/' || pg_temp.id('p1'), (select name from public.parcel where id = pg_temp.id('p1')), pg_temp.id('p1') $$,
  'garden_removal_scheduled: number, path and parcel name only');
select lives_ok($$ select public.ops_schedule_garden_removal(pg_temp.id('r2'), pg_temp.today() + 20, 'müşteriyle anlaşıldı', 30) $$,
  'ops moves the day with a note and a shorter access');
select results_eq(
  $$ select n.template::text, n.ref_id = (e.details ->> 'change_id')::uuid
     from public.notification n
     join public.audit_event e on e.entity_id = pg_temp.id('r2') and e.action = 'garden_removal.scheduled'
       and e.details ->> 'change_id' is not null
     where n.template = 'garden_removal_rescheduled' and n.recipient_user_id = pg_temp.id('c1') $$,
  $$ values ('garden_removal_rescheduled'::text, true) $$,
  'a date change: garden_removal_rescheduled with a fresh ref (change_id)');
select results_eq(
  $$ select (details ->> 'from_access_days')::integer, (details ->> 'to_access_days')::integer,
            (details ->> 'to_effective_on')::date from public.audit_event
     where entity_id = pg_temp.id('r2') and action = 'garden_removal.scheduled' and details ->> 'change_id' is not null $$,
  $$ select 90, 30, pg_temp.today() + 20 $$, 'the audit keeps the old and new access days');
select is(pg_temp.error_of($$ select public.ops_cancel_garden_removal(pg_temp.id('r2'), null) $$),
  '22023 invalid_input / note', 'ops cancels with a note');
select lives_ok($$ select public.ops_cancel_garden_removal(pg_temp.id('r2'), 'müşteri vazgeçti') $$, 'ops cancels');
select is((select count(*)::integer from public.notification where template = 'garden_removal_cancelled'
           and ref_id = pg_temp.id('r2')), 1, 'garden_removal_cancelled is sent');
select is(pg_temp.error_of($$ select public.ops_cancel_garden_removal(pg_temp.id('r2'), 'x') $$),
  'P0001 removal_not_open', 'a cancelled removal is final');
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'sold', %L, null, 0) $$,
  pg_temp.item_of(pg_temp.id('o1')), pg_temp.today())), '22023 invalid_input / access_days',
  'ops: no access shortening without a reason');
select is(pg_temp.error_of(format($$ select public.ops_request_garden_removal(%L, 'sold', %L) $$,
  pg_temp.item_of(pg_temp.id('o1')), pg_temp.today() - 1)), '22023 invalid_input / effective_on', 'not in the past');
insert into ids select 'r3', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o1')), 'sold',
  pg_temp.today() + 5, 'satış', 0);
select is(pg_temp.error_of($$ select public.ops_complete_garden_removal(pg_temp.id('r3')) $$),
  'P0001 removal_not_due', 'not completed before its day');
select public.ops_cancel_garden_removal(pg_temp.id('r3'), 'yanlış');

-- 3. Doc §7 examples: unused visits, Md. 8A, VAT, billed visits ---------------------------

-- 1 billed visit; a same-day second scan, a rescan of an extra_visit request,
-- a later planned visit and a mowing do not count.
insert into ids select 's1', pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'published', pg_temp.today() - 60, 8);
insert into ids select 's2', pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'captured', pg_temp.today() - 60, 14);
insert into ids select 's3', pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'processed', pg_temp.today() - 40);
insert into public.followup_request (org_id, parcel_id, source_session_id, kind, note, status, target_session_id,
  resolved_at)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p1'), pg_temp.id('s1'), 'extra_visit', 'kapsama yetersiz',
        'done', pg_temp.id('s3'), now());
select pg_temp.visit(pg_temp.id('p1'), 'mowing', 'captured', pg_temp.today() - 30);
select pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'planned', pg_temp.today() - 3);
select pg_temp.visit(pg_temp.id('p1'), 'periodic_scan', 'planned', pg_temp.today() + 20);
select pg_temp.visit(pg_temp.id('p1'), 'inventory', 'planned', pg_temp.today() + 25);
select pg_temp.visit(pg_temp.id('p1'), 'mowing', 'planned', pg_temp.today() + 25);
select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select visits_entitled, visits_used from public.my_gardens() where parcel_id = pg_temp.id('p1') $$,
  $$ values (4::smallint, 1) $$, 'my_gardens: one billed visit');
-- Md. 8A: the missed visit already refunded on the line's payment item.
select pg_temp.ops();
insert into ids select 'pay1', id from public.payment where order_id = pg_temp.id('o1');
select public.ops_request_refund(pg_temp.id('pay1'), 300000, 'missed_visit', 'Md. 8A',
  (select id from public.payment_item where payment_id = pg_temp.id('pay1')));
insert into public.followup_request (org_id, parcel_id, source_session_id, kind, note)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p1'), pg_temp.id('s1'), 'extra_visit', 'tekrar');
insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, invited_by)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p1'), 'Hissedar Bir', '+905550004601', pg_temp.id('c1'));
select pg_temp.ops();
insert into ids select 'r4', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o1')), 'sold', pg_temp.today());
select results_eq(
  $$ select x ->> 'mode', (x ->> 'refund_kurus')::bigint, (x -> 'lines' -> 0 ->> 'visits_used')::integer,
            (x -> 'lines' -> 0 ->> 'already_refunded_kurus')::bigint, (x ->> 'pending_orders')
     from (select public.ops_garden_removal_preview(pg_temp.id('r4')) x) y $$,
  $$ values ('unused_visits'::text, 600000::bigint, 1, 300000::bigint, '[]'::text) $$,
  'the ops preview of a removal today');
select results_eq(
  $$ select (x ->> 'planned_visits_before')::integer, (x ->> 'planned_visits_after')::integer,
            (x ->> 'open_followups')::integer, (x ->> 'pending_invitations')::integer,
            (x ->> 'captured_unpublished')::integer, x -> 'access_scope' ->> 'customer_owner'
     from (select public.ops_garden_removal_preview(pg_temp.id('r4')) x) y $$,
  $$ values (1, 2, 1, 1, 2, '1'::text) $$, 'what the completion touches');
select lives_ok($$ select public.ops_complete_garden_removal(pg_temp.id('r4')) $$, 'ops completes it today');
select results_eq(
  $$ select status::text, refund_mode, refund_kurus, (calculation ->> 'refund_vat_kurus')::bigint,
            calculation ->> 'formula', (calculation ->> 'unallocated_kurus')::bigint
     from public.garden_removal where id = pg_temp.id('r4') $$,
  $$ values ('completed'::text, 'unused_visits'::text, 600000::bigint, 100000::bigint, 'removal-v1'::text, 0::bigint) $$,
  'doc §7 Md. 8A example: 3 × 300 000 − 300 000 = 600 000, VAT share 100 000');
select results_eq(
  $$ select (l ->> 'amount_kurus')::bigint, (l ->> 'visits_entitled')::integer, (l ->> 'visits_used')::integer,
            (l ->> 'visits_excluded')::integer, (l ->> 'visit_fee_kurus')::bigint, (l ->> 'gross_kurus')::bigint,
            (l ->> 'already_refunded_kurus')::bigint, (l ->> 'unattributed')::boolean, (l ->> 'removed_on')::date
     from (select pg_temp.line(pg_temp.id('r4')) l) x $$,
  $$ select 1200000::bigint, 4, 1, 1, 300000::bigint, 900000::bigint, 300000::bigint, false, pg_temp.today() $$,
  'the line: same-day scans count once, the extra_visit rescan is excluded (gross 900 000 as in §7.1)');
select results_eq(
  $$ select kind::text, reason::text, amount_kurus, status::text, note, payment_item_id is not null
     from public.refund where garden_removal_id = pg_temp.id('r4') $$,
  $$ select 'manual'::text, 'termination'::text, 600000::bigint, 'requested'::text,
            'garden_removal:' || (select number from public.garden_removal where id = pg_temp.id('r4')), true $$,
  'one refund row on the line''s transfer item, requested by the system');
select is((select requested_by from public.refund where garden_removal_id = pg_temp.id('r4')), null::uuid,
  'requested_by is the system');
select results_eq(
  $$ select removed_on, garden_removal_id from public.service_order_item where order_id = pg_temp.id('o1') $$,
  $$ select pg_temp.today(), pg_temp.id('r4') $$, 'the line is removed today');
select results_eq(
  $$ select status::text, count(*)::integer from public.session where parcel_id = pg_temp.id('p1')
     group by status order by status $$,
  $$ values ('cancelled'::text, 3), ('captured'::text, 2), ('planned'::text, 1), ('processed'::text, 1),
            ('published'::text, 1) $$,
  'every planned inventory, scan and verification visit is cancelled, past ones too (mowing stays)');
select results_eq(
  $$ select (select status::text from public.parcel where id = pg_temp.id('p1')),
            (select count(*)::integer from public.followup_request where parcel_id = pg_temp.id('p1') and status = 'cancelled'),
            (select count(*)::integer from private.viewer_invitation where parcel_id = pg_temp.id('p1') and status = 'cancelled') $$,
  $$ values ('passive'::text, 1, 1) $$, 'the parcel is passive; open follow-ups and pending invitations cancelled');
select results_eq(
  $$ select (details ->> 'cancelled_visits')::integer, (details ->> 'cancelled_followups')::integer,
            (details ->> 'cancelled_invitations')::integer, (details ->> 'parcel_passive')::boolean,
            details ->> 'refund_mode', actor_role
     from public.audit_event where action = 'garden_removal.completed' and entity_id = pg_temp.id('r4') $$,
  $$ values (3, 1, 1, true, 'unused_visits'::text, 'ops'::text) $$, 'the counts are audited');
select results_eq(
  $$ select status::text, termination_note from public.service_order where id = pg_temp.id('o1') $$,
  $$ values ('terminated'::text, 'all_gardens_removed'::text) $$, 'the emptied order is terminated by the system');
select results_eq(
  $$ select template::text, vars ->> 'path' from public.notification where ref_id = pg_temp.id('r4')
     and template = 'garden_removal_completed' $$,
  $$ select 'garden_removal_completed'::text, '/portal/parsel/' || pg_temp.id('p1') $$, 'garden_removal_completed');
select pg_temp.as_user(pg_temp.id('c1'));
select results_eq(
  $$ select state, removed_on, access_until from public.my_gardens() where parcel_id = pg_temp.id('p1') $$,
  $$ select 'removed'::text, pg_temp.today(), pg_temp.today() + 90 $$, 'my_gardens: removed, access open');
select results_eq(
  $$ select status, removed_on, access_until from public.parcel_service_status(pg_temp.id('p1')) $$,
  $$ select 'removed'::text, pg_temp.today(), pg_temp.today() + 90 $$, 'parcel_service_status: removed');
select is((select count(*)::integer from public.my_service_period()), 0, 'no period is left');

-- 4. Read-only window guards ----------------------------------------------------------------

select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_set_parcel_passive(pg_temp.id('p1'), false) $$),
  'P0001 parcel_removed', 'ops does not resume a removed parcel');
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
  values ('b0000000-0000-4000-8000-000000000001', %L, 'periodic_scan', 'planned', %L) $$,
  pg_temp.id('p1'), pg_temp.today() + 3)), 'P0001 parcel_passive', 'no visit is planned on a removed parcel');
select pg_temp.as_user(pg_temp.id('c1'));
select is(pg_temp.error_of($$ select public.owner_invite_viewer(pg_temp.id('p1'), 'Yeni Hissedar', '+905550004602') $$),
  'P0001 parcel_read_only', 'no viewer is invited');
select is(pg_temp.error_of(format($$ insert into public.parcel_access (org_id, parcel_id, user_id, role)
  values ('b0000000-0000-4000-8000-000000000001', %L, 'a0000000-0000-4000-8000-000000000002', 'viewer') $$,
  pg_temp.id('p1'))), 'P0001 parcel_read_only', 'no access row is added through the API');
reset role;

-- 5. Questions on a removed parcel (seed parcel c0..01 of owner a0..01, viewer a0..02) ------

insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'individual', 'Ö', 'S', 'Adres', 'Gaziantep');
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
select pg_temp.ops();
insert into ids select 'oq', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001',
  array['c0000000-0000-4000-8000-000000000001'::uuid], true, null);
insert into ids select 'oo', pg_temp.accept('a0000000-0000-4000-8000-000000000001', pg_temp.id('oq'));
select pg_temp.pay(pg_temp.id('oo'));
insert into ids select 'tree', (select id from public.tree where parcel_id = 'c0000000-0000-4000-8000-000000000001' limit 1);
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
insert into public.question (parcel_id, tree_id, body)
values ('c0000000-0000-4000-8000-000000000001', pg_temp.id('tree'), 'Bu ağaçta ne var? (46)');
reset role;
insert into ids select 'qq', id from public.question where body = 'Bu ağaçta ne var? (46)';
select pg_temp.ops();
-- Visit guard while the removal is open: on or after its day.
insert into ids select 'oqr', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('oo')), 'sold',
  pg_temp.today() + 10);
insert into ids select 'ps', pg_temp.visit('c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', pg_temp.today() + 5);
set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', %L) $$,
  pg_temp.today() + 10)), 'P0001 parcel_removal_scheduled', 'no visit on or after the effective day');
select is(pg_temp.error_of(format($$ update public.session set planned_date = %L where id = %L $$,
  pg_temp.today() + 12, pg_temp.id('ps'))), 'P0001 parcel_removal_scheduled', 'nor is a visit moved there');
select lives_ok(format($$ update public.session set planned_date = %L where id = %L $$,
  pg_temp.today() + 9, pg_temp.id('ps')), 'before the day is fine');
reset role;
select public.ops_schedule_garden_removal(pg_temp.id('oqr'), pg_temp.today(), 'bugün');
select public.ops_complete_garden_removal(pg_temp.id('oqr'));
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of(format($$ insert into public.question (parcel_id, tree_id, body) values
  ('c0000000-0000-4000-8000-000000000001', %L, 'Yeni soru') $$, pg_temp.id('tree'))),
  'P0001 parcel_read_only', 'the owner asks no question in the read-only window');
select is(pg_temp.error_of($$ update public.question set body = 'Değişti' where id = pg_temp.id('qq') $$),
  'P0001 parcel_read_only', 'nor edits one');
select is(pg_temp.error_of($$ insert into public.question_reply (question_id, body) values (pg_temp.id('qq'), 'Ek') $$),
  'P0001 parcel_read_only', 'nor replies');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.error_of(format($$ insert into public.question (parcel_id, tree_id, body) values
  ('c0000000-0000-4000-8000-000000000001', %L, 'Hissedar sorusu') $$, pg_temp.id('tree'))),
  'P0001 parcel_read_only', 'nor does a viewer');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select lives_ok($$ insert into public.question_reply (question_id, body) values (pg_temp.id('qq'), 'Uzman yanıtı') $$,
  'the expert still answers');
reset role;
-- The end of access: the sole owner leaves, so do all viewers.
set local session_replication_role = replica;
update public.garden_removal set access_until = pg_temp.today() where id = pg_temp.id('oqr');
set local session_replication_role = origin;
select is((testing.run_garden_removal_housekeeping() ->> 'access_revoked')::integer, 1, 'housekeeping ends the access');
select is((select count(*)::integer from public.parcel_access where parcel_id = 'c0000000-0000-4000-8000-000000000001'), 0,
  'the owner row and every viewer row are gone (no other owner)');
select results_eq(
  $$ select details -> 'removed_user_ids', (details ->> 'kept')::integer, details ->> 'reason'
     from public.audit_event where action = 'garden_removal.access_revoked' and entity_id = pg_temp.id('oqr') $$,
  $$ values ('["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002"]'::jsonb, 0, 'expired'::text) $$,
  'access_revoked: user ids only');
select is((select access_revoked_at is not null from public.garden_removal where id = pg_temp.id('oqr')), true,
  'the window is closed');
select is((select count(*)::integer from public.question where id = pg_temp.id('qq')), 1, 'nothing else is deleted');

-- 6. Access scope with other owners, invited viewers and revoke_all_access ------------------

insert into ids select 'c2', pg_temp.new_customer(2);
insert into ids select 'u_owner', pg_temp.new_customer(3);
insert into ids select 'u_inv', pg_temp.new_customer(4);
insert into ids select 'u_view', pg_temp.new_customer(5);
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), array[20000], 37.40);
insert into ids select 'p2', pg_temp.parcel_of(pg_temp.id('o2'));
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by) values
  ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p2'), pg_temp.id('u_owner'), 'owner', 'a0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p2'), pg_temp.id('u_inv'), 'viewer', 'a0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p2'), pg_temp.id('u_view'), 'viewer', 'a0000000-0000-4000-8000-000000000005');
insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, invited_by, status, user_id, resolved_at)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p2'), 'Davetli', '+905550004603', pg_temp.id('c2'), 'approved',
        pg_temp.id('u_inv'), now());
insert into ids select 'r6', pg_temp.remove_now(pg_temp.id('o2'), 'sold', 14, 'kısa erişim');
select results_eq(
  $$ select x -> 'access_scope' from (select public.ops_garden_removal_preview(pg_temp.id('r6')) x) y $$,
  $$ values ('{"customer_owner": 1, "invited_viewers": 1, "other_viewers": 1, "other_owners": 1}'::jsonb) $$,
  'the access scope of the ops preview');
set local session_replication_role = replica;
update public.garden_removal set access_until = pg_temp.today() + 5 where id = pg_temp.id('r6');
set local session_replication_role = origin;
select is((testing.run_garden_removal_housekeeping() ->> 'access_notices')::integer, 1, 'the access notice is sent');
select is((testing.run_garden_removal_housekeeping() ->> 'access_notices')::integer, 0, 'once');
select is((select count(*)::integer from public.notification where template = 'garden_access_ending'
           and ref_id = pg_temp.id('r6')), 1, 'garden_access_ending');
set local session_replication_role = replica;
update public.garden_removal set access_until = pg_temp.today() where id = pg_temp.id('r6');
set local session_replication_role = origin;
select testing.run_garden_removal_housekeeping();
select is((select array_agg(user_id order by user_id) from public.parcel_access where parcel_id = pg_temp.id('p2')),
  array[pg_temp.id('u_owner'), pg_temp.id('u_view')],
  'the customer and the viewer they invited leave; another owner and their viewer stay');

insert into ids select 'c6', pg_temp.new_customer(6);
insert into ids select 'o3', pg_temp.new_order(pg_temp.id('c6'), array[20000], 37.50);
insert into ids select 'p3', pg_temp.parcel_of(pg_temp.id('o3'));
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by) values
  ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p3'), pg_temp.id('u_owner'), 'owner', null);
select pg_temp.ops();
insert into ids select 'r7', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o3')), 'transfer',
  pg_temp.today(), null, 0, true);
select public.ops_complete_garden_removal(pg_temp.id('r7'));
select results_eq(
  $$ select access_days, access_until, refund_mode from public.garden_removal where id = pg_temp.id('r7') $$,
  $$ select 0::smallint, pg_temp.today(), 'unused_visits'::text $$, 'a transfer: no access window');
select is((select template::text || ':' || (vars ->> 'path') from public.notification where ref_id = pg_temp.id('r7')
           and template = 'garden_removal_completed'), 'garden_removal_completed:/portal',
  'without an access window the message links the portal');
select is((testing.run_garden_removal_housekeeping() ->> 'access_notices')::integer, 0, 'no notice for a short window');
select is((select count(*)::integer from public.parcel_access where parcel_id = pg_temp.id('p3')), 0,
  'revoke_all_access: every row, other owners too, at the next housekeeping');

-- 7. Re-adding the garden during the window keeps the re-invited viewer ----------------------

insert into ids select 'c7', pg_temp.new_customer(7);
insert into ids select 'o4', pg_temp.new_order(pg_temp.id('c7'), array[20000], 37.60);
insert into ids select 'p4', pg_temp.parcel_of(pg_temp.id('o4'));
insert into ids select 'o5', pg_temp.new_order(pg_temp.id('c7'), array[17000], 37.70);
insert into ids select 'r8', pg_temp.remove_now(pg_temp.id('o4'));
select is((select status::text from public.service_order where id = pg_temp.id('o4')), 'terminated', 'removed');
select pg_temp.ops();
insert into ids select 'q9', public.ops_issue_addon_quote(pg_temp.id('o5'), p_parcel_ids => array[pg_temp.id('p4')]);
insert into ids select 'o9', pg_temp.accept(pg_temp.id('c7'), pg_temp.id('q9'));
select pg_temp.pay(pg_temp.id('o9'));
select results_eq(
  $$ select (select access_revoked_at is not null from public.garden_removal where id = pg_temp.id('r8')),
            (select status::text from public.parcel where id = pg_temp.id('p4')),
            (select details ->> 'reason' from public.audit_event where action = 'garden_removal.access_closed'
             and entity_id = pg_temp.id('r8')) $$,
  $$ values (true, 'registered'::text, 'resumed'::text) $$,
  're-added: the access window is closed (resumed), the parcel leaves passive');
select pg_temp.as_user(pg_temp.id('c7'));
insert into ids select 'inv', public.owner_invite_viewer(pg_temp.id('p4'), 'Yeni Hissedar', '+905550004604');
select pg_temp.ops();
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id('p4'), pg_temp.id('u_view'), 'viewer');
set local session_replication_role = replica;
update public.garden_removal set access_until = pg_temp.today() where id = pg_temp.id('r8');
set local session_replication_role = origin;
select testing.run_garden_removal_housekeeping();
select is((select count(*)::integer from public.parcel_access where parcel_id = pg_temp.id('p4')), 2,
  'past the old window the owner and the re-invited viewer stay');

-- 8. Refund modes and prior refunds -----------------------------------------------------------

-- Withdrawal on day 3: the whole line back but the billed visit.
insert into ids select 'c8', pg_temp.new_customer(8);
insert into ids select 'o10', pg_temp.new_order(pg_temp.id('c8'), array[20000], 37.80);
update public.service_order set activated_at = now() - interval '3 days' where id = pg_temp.id('o10');
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o10')), 'periodic_scan', 'captured', pg_temp.today() - 2);
select pg_temp.as_user(pg_temp.id('c8'));
insert into ids select 'r10', public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o10')), 'dissatisfied',
  null, false, true);
select pg_temp.ops();
select public.ops_complete_garden_removal(pg_temp.id('r10'));
select results_eq(
  $$ select refund_mode, refund_kurus, withdrawal, effective_on from public.garden_removal where id = pg_temp.id('r10') $$,
  $$ select 'withdrawal'::text, 900000::bigint, true, pg_temp.today() $$,
  'withdrawal: 1 200 000 − 1 billed visit × 300 000');
select is((select reason::text from public.refund where garden_removal_id = pg_temp.id('r10')), 'withdrawal',
  'the refund row''s reason is withdrawal');
select is((select count(*)::integer from public.audit_event where action = 'garden_removal.scheduled'
           and entity_id = pg_temp.id('r10') and actor_role = 'ops'), 1, 'a requested removal is scheduled on completion');

-- Duplicate: only the billed visits are kept.
insert into ids select 'c9', pg_temp.new_customer(9);
insert into ids select 'o11', pg_temp.new_order(pg_temp.id('c9'), array[20000], 37.90);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o11')), 'periodic_scan', 'captured', pg_temp.today() - 20);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o11')), 'inventory', 'published', pg_temp.today() - 90);
insert into ids select 'r11', pg_temp.remove_now(pg_temp.id('o11'), 'duplicate');
select results_eq(
  $$ select refund_mode, refund_kurus from public.garden_removal where id = pg_temp.id('r11') $$,
  $$ values ('duplicate'::text, 900000::bigint) $$, 'duplicate: the amount less the billed visit');

-- Visits capped at the entitlement.
insert into ids select 'c10', pg_temp.new_customer(10);
insert into ids select 'o12', pg_temp.new_order(pg_temp.id('c10'), array[20000], 38.00);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o12')), 'periodic_scan', 'captured', pg_temp.today() - d)
from unnest(array[90, 70, 50, 30, 10]) d;
insert into ids select 'r12', pg_temp.remove_now(pg_temp.id('o12'));
select results_eq(
  $$ select refund_kurus, (calculation -> 'lines' -> 0 ->> 'visits_used')::integer from public.garden_removal
     where id = pg_temp.id('r12') $$,
  $$ values (0::bigint, 4) $$, 'five scans count as the four entitled visits: nothing back');

-- Manual setting: computed, no refund row.
update public.org_billing_setting set removal_refund_mode = 'manual' where org_id = 'b0000000-0000-4000-8000-000000000001';
insert into ids select 'c11', pg_temp.new_customer(11);
insert into ids select 'o13', pg_temp.new_order(pg_temp.id('c11'), array[20000], 38.10);
insert into ids select 'r13', pg_temp.remove_now(pg_temp.id('o13'));
select results_eq(
  $$ select refund_mode, refund_kurus, (select count(*)::integer from public.refund where garden_removal_id = pg_temp.id('r13'))
     from public.garden_removal where id = pg_temp.id('r13') $$,
  $$ values ('manual'::text, 1200000::bigint, 0) $$, 'manual: the amount is computed, ops decides');
update public.org_billing_setting set removal_refund_mode = 'unused_visits' where org_id = 'b0000000-0000-4000-8000-000000000001';

-- (b) An item-less refund of a single-line order (two transfers, balance items).
insert into ids select 'c12', pg_temp.new_customer(12);
insert into ids select 'o14', pg_temp.accept(pg_temp.id('c12'), public.ops_issue_quote(pg_temp.new_app(pg_temp.id('c12'), array[20000], 38.20)));
insert into ids select 'pa', pg_temp.pay(pg_temp.id('o14'), 600000);
insert into ids select 'pb', pg_temp.pay(pg_temp.id('o14'), 600000);
select testing.set_order_period(pg_temp.id('o14'), pg_temp.today() - 100, pg_temp.today() + 264);
select pg_temp.ops();
select public.ops_request_refund(pg_temp.id('pa'), 100000, 'goodwill');
select public.ops_request_refund(pg_temp.id('pa'), 200000, 'overpayment');
insert into ids select 'r14', pg_temp.remove_now(pg_temp.id('o14'));
select results_eq(
  $$ select refund_kurus, (calculation -> 'lines' -> 0 ->> 'already_refunded_kurus')::bigint,
            (calculation ->> 'unallocated_kurus')::bigint
     from public.garden_removal where id = pg_temp.id('r14') $$,
  $$ values (1100000::bigint, 100000::bigint, 200000::bigint) $$,
  'single line: the item-less refund is deducted, an overpayment refund is not');
select results_eq(
  $$ select payment_id, amount_kurus, kind::text, (select order_item_id from public.payment_item i where i.id = payment_item_id)
     from public.refund where garden_removal_id = pg_temp.id('r14') order by amount_kurus desc $$,
  $$ values (pg_temp.id('pb'), 600000::bigint, 'manual'::text, null::uuid),
            (pg_temp.id('pa'), 300000::bigint, 'manual'::text, null::uuid) $$,
  'newest payment first, on the balance items, within what is left of each');
select is((select calculation ->> 'unallocated_kurus' from public.garden_removal where id = pg_temp.id('r14')), '200000',
  'what fits on no payment is unallocated');

-- (c) A multi-line order with an item-less refund: manual, unattributed.
insert into ids select 'c13', pg_temp.new_customer(13);
insert into ids select 'o15', pg_temp.new_order(pg_temp.id('c13'), array[20000, 15000], 38.30);
select pg_temp.ops();
select public.ops_request_refund((select id from public.payment where order_id = pg_temp.id('o15')), 210000, 'goodwill');
insert into ids select 'r15', pg_temp.remove_now(pg_temp.id('o15'));
select results_eq(
  $$ select refund_mode, (calculation ->> 'unattributed_refunds')::boolean, (calculation -> 'lines' -> 0 ->> 'unattributed')::boolean,
            (calculation -> 'lines' -> 0 ->> 'already_refunded_kurus')::bigint,
            (select count(*)::integer from public.refund where garden_removal_id = pg_temp.id('r15'))
     from public.garden_removal where id = pg_temp.id('r15') $$,
  $$ values ('manual'::text, true, true, 120000::bigint, 0) $$,
  'multi-line: a pro-rata share, flagged unattributed, no refund row');
select is((select status::text from public.service_order where id = pg_temp.id('o15')), 'active',
  'an order with a garden left stays active');

-- (d) At the period end with a paid renewal: the ending line is out, the renewal comes back whole.
insert into ids select 'c14', pg_temp.new_customer(14);
insert into ids select 'o16', pg_temp.new_order(pg_temp.id('c14'), array[20000], 38.40, -360);
select pg_temp.ops();
insert into ids select 'q17', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001', pg_temp.id('c14'),
  '91200000-0000-4000-8000-000000000001', array[pg_temp.parcel_of(pg_temp.id('o16'))], false, null, pg_temp.id('o16'));
insert into ids select 'o17', pg_temp.accept(pg_temp.id('c14'), pg_temp.id('q17'));
select pg_temp.as_user(pg_temp.id('c14'));
select is(pg_temp.error_of($$ select public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o16')), 'cost') $$),
  'P0001 parcel_order_pending', 'a garden on an unpaid renewal: cancel or fix that order first');
select pg_temp.pay(pg_temp.id('o17'));
select pg_temp.as_user(pg_temp.id('c14'));
insert into ids select 'r17', public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o16')), 'cost', null, true);
select is((select requested_effective_on from public.garden_removal where id = pg_temp.id('r17')), pg_temp.today() + 5,
  'at the period end: the renewal''s first day');
select testing.set_order_period(pg_temp.id('o16'), pg_temp.today() - 365, pg_temp.today() - 1);
select testing.set_order_period(pg_temp.id('o17'), pg_temp.today(), pg_temp.today() + 364);
select pg_temp.ops();
select public.ops_schedule_garden_removal(pg_temp.id('r17'), pg_temp.today(), 'dönem kaydı');
select public.ops_complete_garden_removal(pg_temp.id('r17'));
select results_eq(
  $$ select jsonb_array_length(calculation -> 'lines'), (calculation -> 'lines' -> 0 ->> 'order_id')::uuid, refund_kurus
     from public.garden_removal where id = pg_temp.id('r17') $$,
  $$ select 1, pg_temp.id('o17'), (select total_kurus from public.service_order where id = pg_temp.id('o17')) $$,
  'only the renewal line, refunded whole');
select results_eq(
  $$ select id, status::text from public.service_order where id in (pg_temp.id('o16'), pg_temp.id('o17')) order by number $$,
  $$ values (pg_temp.id('o16'), 'active'::text), (pg_temp.id('o17'), 'terminated'::text) $$,
  'the ended line is untouched; the emptied renewal is terminated');

-- 9. Pending orders at completion -------------------------------------------------------------

insert into ids select 'c15', pg_temp.new_customer(15);
insert into ids select 'o18', pg_temp.new_order(pg_temp.id('c15'), array[20000], 38.50, -300);
select pg_temp.ops();
insert into ids select 'o19', pg_temp.accept(pg_temp.id('c15'), public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  pg_temp.id('c15'), '91200000-0000-4000-8000-000000000001', array[pg_temp.parcel_of(pg_temp.id('o18'))], false, null,
  pg_temp.id('o18')));
-- An open removal written past the request checks (as if raced).
insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name,
  status, initiated_by, reason, requested_effective_on, effective_on, access_days, access_until, scheduled_at)
select 'b0000000-0000-4000-8000-000000000001', pg_temp.id('c15'), 'C-2026-946001', i.parcel_id, i.order_id, i.id,
       i.garden_name, 'scheduled', 'ops', 'sold', pg_temp.today(), pg_temp.today(), 90, pg_temp.today() + 90, now()
from public.service_order_item i where i.order_id = pg_temp.id('o18');
insert into ids select 'r19', id from public.garden_removal where number = 'C-2026-946001';
select is(pg_temp.error_of($$ select public.payment_begin(pg_temp.id('o19'), pg_temp.id('c15'), 'fake', 'http://127.0.0.1:3100') $$),
  'P0001 garden_removal_open', 'no card payment for a garden that is leaving');
select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o19'), 1000, current_date, 'EFT-x') $$),
  'P0001 garden_removal_open', 'nor a transfer');
select lives_ok($$ select public.ops_complete_garden_removal(pg_temp.id('r19')) $$,
  'completed: the unpaid order is cancelled first');
select results_eq(
  $$ select status::text, cancel_reason from public.service_order where id = pg_temp.id('o19') $$,
  $$ values ('cancelled'::text, 'garden_removed'::text) $$, 'cancelled (garden_removed)');

insert into ids select 'c16', pg_temp.new_customer(16);
insert into ids select 'o20', pg_temp.new_order(pg_temp.id('c16'), array[20000], 38.60, -300);
select pg_temp.ops();
insert into ids select 'o21', pg_temp.accept(pg_temp.id('c16'), public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  pg_temp.id('c16'), '91200000-0000-4000-8000-000000000001', array[pg_temp.parcel_of(pg_temp.id('o20'))], false, null,
  pg_temp.id('o20')));
select pg_temp.pay(pg_temp.id('o21'), 1000);
insert into public.garden_removal (org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name,
  status, initiated_by, reason, requested_effective_on, access_days)
select 'b0000000-0000-4000-8000-000000000001', pg_temp.id('c16'), 'C-2026-946002', i.parcel_id, i.order_id, i.id,
       i.garden_name, 'requested', 'customer', 'sold', pg_temp.today(), 90
from public.service_order_item i where i.order_id = pg_temp.id('o20');
insert into ids select 'r21', id from public.garden_removal where number = 'C-2026-946002';
select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_complete_garden_removal(pg_temp.id('r21')) $$),
  'P0001 parcel_order_pending', 'money on the pending order blocks the completion');
select results_eq(
  $$ select (h ->> 'scheduled')::integer, (h ->> 'completed')::integer, (h ->> 'blocked')::integer
     from (select testing.run_garden_removal_housekeeping() h) x $$,
  $$ values (1, 0, 1) $$, 'housekeeping: scheduled on its requested day, blocked');
select results_eq(
  $$ select status::text, blocked_reason, effective_on from public.garden_removal where id = pg_temp.id('r21') $$,
  $$ select 'scheduled'::text, 'pending_order'::text, pg_temp.today() $$, 'blocked_reason pending_order');
select testing.run_garden_removal_housekeeping();
select is((select count(*)::integer from public.audit_event where action = 'garden_removal.blocked'
           and entity_id = pg_temp.id('r21')), 1, 'the block is audited once');
select is((select garden_removals_blocked from public.ops_billing_summary('b0000000-0000-4000-8000-000000000001')), 1,
  'ops_billing_summary counts the blocked removal');

-- 10. Housekeeping completes due removals once; a removal of an ended order ----------------

insert into ids select 'c17', pg_temp.new_customer(17);
insert into ids select 'o22', pg_temp.new_order(pg_temp.id('c17'), array[20000], 38.70);
select pg_temp.as_user(pg_temp.id('c17'));
insert into ids select 'r22', public.customer_request_garden_removal(pg_temp.parcel_of(pg_temp.id('o22')), 'sold');
set local session_replication_role = replica;
update public.garden_removal set requested_effective_on = pg_temp.today() where id = pg_temp.id('r22');
set local session_replication_role = origin;
select is((testing.run_garden_removal_housekeeping() ->> 'completed')::integer, 1, 'housekeeping completes the due removal');
select is((testing.run_garden_removal_housekeeping() ->> 'completed')::integer, 0, 'a second run does nothing');
select results_eq(
  $$ select status::text, (select count(*)::integer from public.refund where garden_removal_id = pg_temp.id('r22')),
            (select count(*)::integer from public.notification where ref_id = pg_temp.id('r22'))
     from public.garden_removal where id = pg_temp.id('r22') $$,
  $$ values ('completed'::text, 1, 1) $$, 'one completion, one refund, one message');
select is((select actor_role from public.audit_event where action = 'garden_removal.completed'
           and entity_id = pg_temp.id('r22')), 'system', 'completed by the system');

insert into ids select 'c18', pg_temp.new_customer(18);
insert into ids select 'o23', pg_temp.new_order(pg_temp.id('c18'), array[20000], 38.80);
select pg_temp.ops();
insert into ids select 'r23', public.ops_request_garden_removal(pg_temp.item_of(pg_temp.id('o23')), 'sold', pg_temp.today());
update public.service_order set status = 'terminated', terminated_at = now() where id = pg_temp.id('o23');
select lives_ok($$ select public.ops_complete_garden_removal(pg_temp.id('r23')) $$,
  'completing a removal whose order ended meanwhile');
select results_eq(
  $$ select status::text, cancelled_by from public.garden_removal where id = pg_temp.id('r23') $$,
  $$ values ('cancelled'::text, 'system'::text) $$, 'no line left: cancelled by the system');

-- An add-on and its base: the base ends with its last garden.
insert into ids select 'c19', pg_temp.new_customer(19);
insert into ids select 'o24', pg_temp.new_order(pg_temp.id('c19'), array[20000], 38.90);
select pg_temp.ops();
insert into ids select 'o25', pg_temp.accept(pg_temp.id('c19'), public.ops_issue_addon_quote(pg_temp.id('o24'),
  pg_temp.new_app(pg_temp.id('c19'), array[15000], 39.00)));
select pg_temp.pay(pg_temp.id('o25'));
insert into ids select 'q26', public.ops_issue_addon_quote(pg_temp.id('o24'), pg_temp.new_app(pg_temp.id('c19'), array[15000], 39.10));
select pg_temp.remove_now(pg_temp.id('o24'));
select is((select status::text from public.service_order where id = pg_temp.id('o24')), 'active',
  'the base order stays while its add-on serves a garden');
select pg_temp.remove_now(pg_temp.id('o25'));
select results_eq(
  $$ select id, status::text from public.service_order where id in (pg_temp.id('o24'), pg_temp.id('o25')) order by number $$,
  $$ values (pg_temp.id('o24'), 'terminated'::text), (pg_temp.id('o25'), 'terminated'::text) $$,
  'the last garden out: the add-on and the base end');
select is((select status::text from public.quote where id = pg_temp.id('q26')), 'cancelled',
  'the open add-on quote of the ended base is cancelled');

-- 11. Inventory share (doc §7.1 third example), with a price list that has an inventory fee --

insert into public.price_list (id, org_id, status, valid_from, vat_rate_bp)
values ('f4600000-0000-4000-8000-000000000901', 'b0000000-0000-4000-8000-000000000001', 'draft', pg_temp.today(), 2000);
insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus)
values ('b0000000-0000-4000-8000-000000000001', 'f4600000-0000-4000-8000-000000000901',
        '91200000-0000-4000-8000-000000000001', 12500, 500000, 100000),
       ('b0000000-0000-4000-8000-000000000001', 'f4600000-0000-4000-8000-000000000901',
        '91200000-0000-4000-8000-000000000002', 13000, 450000, 0);
update public.price_list set status = 'published', version = 2, published_at = now()
where id = 'f4600000-0000-4000-8000-000000000901';
insert into ids select 'c20', pg_temp.new_customer(20);
insert into ids select 'o26', pg_temp.new_order(pg_temp.id('c20'), array[20000], 39.20);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o26')), 'periodic_scan', 'captured', pg_temp.today() - 10);
insert into ids select 'r26', pg_temp.remove_now(pg_temp.id('o26'));
select results_eq(
  $$ select (l ->> 'amount_kurus')::bigint, (l ->> 'inventory_share_kurus')::bigint, (l ->> 'inventory_done')::boolean,
            (l ->> 'visit_fee_kurus')::bigint, (l ->> 'refund_kurus')::bigint, (l ->> 'refund_vat_kurus')::bigint
     from (select pg_temp.line(pg_temp.id('r26')) l) x $$,
  $$ values (1320000::bigint, 120000::bigint, false, 300000::bigint, 1020000::bigint, 170000::bigint) $$,
  'doc §7.1: share 120 000, visit fee 300 000; no inventory done: 900 000 + 120 000');
insert into ids select 'c21', pg_temp.new_customer(21);
insert into ids select 'o27', pg_temp.new_order(pg_temp.id('c21'), array[20000], 39.30);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o27')), 'inventory', 'captured', pg_temp.today() - 50);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o27')), 'periodic_scan', 'captured', pg_temp.today() - 10);
insert into ids select 'r27', pg_temp.remove_now(pg_temp.id('o27'));
select is((select refund_kurus from public.garden_removal where id = pg_temp.id('r27')), 900000::bigint,
  'with the inventory done its share is kept');

-- 12. Counters -------------------------------------------------------------------------------

select pg_temp.ops();
select is((select count(*)::integer from public.ops_garden_removals('b0000000-0000-4000-8000-000000000001', 'all'))
          >= 20, true, 'ops_garden_removals lists every removal with all');
select is((select bool_and(status in ('requested', 'scheduled')) from public.ops_garden_removals('b0000000-0000-4000-8000-000000000001')),
  true, 'by default only the open ones');

select * from finish();
rollback;
