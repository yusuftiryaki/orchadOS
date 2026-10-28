-- Visit notices, postponements and missed visits (docs/hukuk/kararlar.md H01,
-- H15; T07; contract Md. 8A/1–4): visit_scheduled only with the setting on
-- and at least 3 days ahead (again when moved), phone notices, the owner's
-- one postponement up to the day before, missed-visit records with the
-- customer-reason flags (same-day notice, a new date in the window, photo and
-- note), outcomes set once (deemed_done only on the second failure, carry over
-- only to a later window of the period), the field app's visit_blocked
-- events (reading rule) and legal field notices.
-- Seed: org b0..01, ops a0..05, field staff a0..03, owner a0..01 and viewer
-- a0..02 of the pilot parcel c0..01 (no order). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

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
  v uuid := ('f7100000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c71-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 71-' || p_n, 'sms');
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
    current_date, 'EFT-71-' || left(p_order::text, 8));
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

create function pg_temp.plan_as_ops(p_parcel uuid, p_day date, p_kind text default 'periodic_scan') returns uuid
language plpgsql as $$
declare
  v uuid;
begin
  perform pg_temp.ops();
  set local role authenticated;
  insert into public.session (org_id, parcel_id, kind, status, planned_date)
  values ('b0000000-0000-4000-8000-000000000001', p_parcel, p_kind::public.session_kind, 'planned', p_day)
  returning id into v;
  reset role;
  return v;
end;
$$;
create function pg_temp.messages(p_session uuid) returns integer language sql stable
as $$ select count(*)::integer from public.notification where template = 'visit_scheduled' and session_id = p_session $$;

-- 1. visit_scheduled --------------------------------------------------------------------

insert into ids select 's5', pg_temp.plan_as_ops('c0000000-0000-4000-8000-000000000001', pg_temp.today() + 5);
select results_eq(
  $$ select recipient_user_id, vars ->> 'date', vars ->> 'path', vars ->> 'parcel_name', channel::text
     from public.notification where template = 'visit_scheduled' and session_id = pg_temp.id('s5') $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, (pg_temp.today() + 5)::text,
             '/portal/parsel/c0000000-0000-4000-8000-000000000001', 'Örnek Bahçe 1', 'whatsapp') $$,
  'a periodic visit planned 5 days ahead: visit_scheduled to the owner on their channel (not to the viewer)');
select results_eq(
  $$ select channel, planned_date from private.visit_notice where session_id = pg_temp.id('s5') $$,
  $$ values ('message'::text, pg_temp.today() + 5) $$, 'and a notice record');
insert into ids select 's3', pg_temp.plan_as_ops('c0000000-0000-4000-8000-000000000001', pg_temp.today() + 3, 'inventory');
select is(pg_temp.messages(pg_temp.id('s3')), 1, 'an inventory exactly 3 days ahead: notified');
insert into ids select 's2', pg_temp.plan_as_ops('c0000000-0000-4000-8000-000000000001', pg_temp.today() + 2);
select is(pg_temp.messages(pg_temp.id('s2')), 0, 'closer than 3 days: no message (a phone notice is needed)');
insert into ids select 'sv', pg_temp.plan_as_ops('c0000000-0000-4000-8000-000000000001', pg_temp.today() + 6, 'verification');
select is(pg_temp.messages(pg_temp.id('sv')), 0, 'a verification visit: no message');
select pg_temp.ops();
set local role authenticated;
update public.session set planned_date = pg_temp.today() + 8 where id = pg_temp.id('s5');
update public.session set notes = 'not' where id = pg_temp.id('s5');
reset role;
select is(pg_temp.messages(pg_temp.id('s5')), 2, 'moved to another day: notified again (a note edit does not)');
update public.org_billing_setting set visit_notice_sms_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
insert into ids select 's10', pg_temp.plan_as_ops('c0000000-0000-4000-8000-000000000001', pg_temp.today() + 10);
select is(pg_temp.messages(pg_temp.id('s10')), 0, 'with visit_notice_sms_enabled off (hosted default): no message');
update public.org_billing_setting set visit_notice_sms_enabled = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select ok((select column_default from information_schema.columns where table_schema = 'public'
           and table_name = 'org_billing_setting' and column_name = 'visit_notice_sms_enabled') = 'false',
  'the column defaults to false');

-- 2. Phone notice ----------------------------------------------------------------------

select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_record_visit_phone_notice(%L, %L) $$,
  pg_temp.id('s2'), now() + interval '1 hour')), '22023 invalid_input / notified_at', 'not in the future');
select lives_ok($$ select public.ops_record_visit_phone_notice(pg_temp.id('s2'), now() - interval '10 minutes') $$,
  'ops records "telefonla bildirildi" with the time');
select results_eq(
  $$ select x ->> 'channel', (x ->> 'planned_date')::date from public.ops_visit_records(pg_temp.id('s2')) r,
       jsonb_array_elements(r -> 'notices') x $$,
  $$ values ('phone'::text, pg_temp.today() + 2) $$, 'ops_visit_records lists the phone notice');
select results_eq(
  $$ select notice_missing from public.ops_visit_notice_flags('b0000000-0000-4000-8000-000000000001')
     where session_id in (pg_temp.id('s2'), pg_temp.id('s10')) order by session_id = pg_temp.id('s2') desc $$,
  $$ values (false), (true) $$, 'the ops list flags a visit without a notice of its day');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of(format($$ select public.ops_record_visit_phone_notice(%L, now()) $$, pg_temp.id('s2'))),
  'P0002 not_found', 'owners cannot record notices');

-- 3. Postponement ----------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.error_of(format($$ select public.customer_request_visit_postponement(%L) $$, pg_temp.id('s5'))),
  'P0002 not_found', 'a viewer cannot postpone');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select session_id, can_postpone from public.my_parcel_visits('c0000000-0000-4000-8000-000000000001')
     where session_id = pg_temp.id('s5') $$,
  $$ values (pg_temp.id('s5'), true) $$, 'the owner sees the upcoming visit as postponable');
select lives_ok(format($$ select public.customer_request_visit_postponement(%L) $$, pg_temp.id('s5')),
  'the owner postpones a visit');
select is(pg_temp.error_of(format($$ select public.customer_request_visit_postponement(%L) $$, pg_temp.id('s5'))),
  'P0001 postponement_not_allowed', 'only once per visit');
insert into ids select 's0', pg_temp.visit('c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', pg_temp.today());
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of(format($$ select public.customer_request_visit_postponement(%L) $$, pg_temp.id('s0'))),
  'P0001 postponement_not_allowed', 'not on the visit day (at the latest the day before)');
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_record_visit_postponement(%L, 'phone', now()) $$, pg_temp.id('s0'))),
  'P0001 postponement_not_allowed', 'ops: a request on the visit day is refused');
select lives_ok(format($$ select public.ops_record_visit_postponement(%L, 'phone', now()) $$, pg_temp.id('s10')),
  'ops records a postponement asked by phone');
select results_eq(
  $$ select postponed from public.ops_visit_notice_flags('b0000000-0000-4000-8000-000000000001')
     where session_id = pg_temp.id('s10') $$,
  $$ values (true) $$, 'the ops list shows the visit to replan');

-- 4. Missed visits ---------------------------------------------------------------------

-- A fixed day in last year's harvest window (Aug–Oct), the test runs on any day.
create temporary table dd on commit drop as select make_date(extract(year from pg_temp.today())::integer - 1, 10, 20) as d;
grant select on dd to authenticated;
create function pg_temp.dd() returns date language sql stable as $$ select d from dd $$;
insert into ids select 'sm', pg_temp.visit('c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', pg_temp.dd());
insert into ids values ('ev', gen_random_uuid()), ('ev2', gen_random_uuid());
insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns, time_source,
  phone_time, logger_result, recorded_by)
values (pg_temp.id('ev'), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.id('sm'),
        'visit_blocked', '{"reason": "customer", "detail": "gate_closed", "note": "Kapı kilitli", "photo_count": 1}',
        0, 'phone', now(), 'none', 'a0000000-0000-4000-8000-000000000003'),
       (pg_temp.id('ev2'), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.id('sm'),
        'visit_blocked', '{"reason": "weather", "detail": "rain", "photo_count": 0}',
        0, 'phone', now(), 'none', 'a0000000-0000-4000-8000-000000000001'),
       (gen_random_uuid(), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.id('sm'),
        'field_notice_sign', '{"sign": true, "badge": true}', 0, 'phone', now(), 'none', 'a0000000-0000-4000-8000-000000000003');
with x as (
  insert into public.capture (org_id, parcel_id, session_id, kind, uri, content_hash, started_at, metadata)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.id('sm'), 'photo',
          'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/' || repeat('a', 64),
          repeat('a', 64), now(), jsonb_build_object('local_kind', 'blocked_visit_photo', 'event_id', pg_temp.id('ev')))
  returning id)
insert into ids select 'cap', id from x;
select pg_temp.ops();
select results_eq(
  $$ select event_id, reason, detail, photo_capture_ids from public.ops_visit_blocked_events(pg_temp.id('sm')) $$,
  $$ values (pg_temp.id('ev'), 'customer'::text, 'gate_closed'::text, array[pg_temp.id('cap')]) $$,
  'prefill: the field staff''s visit_blocked event with its photo (not one recorded by the owner)');
select results_eq(
  $$ select event_type, payload ->> 'sign' from public.ops_visit_field_notices(pg_temp.id('sm')) $$,
  $$ values ('field_notice_sign'::text, 'true'::text) $$, 'the visit page shows the legal field notices');

create function pg_temp.missed(p_note text, p_caps uuid[], p_notified date, p_proposed date, p_no_date boolean default false,
  p_outcome text default 'rescheduled') returns text language sql
as $$
  select pg_temp.error_of(format($f$ select public.ops_record_missed_visit(%L, 'customer', %L, %L, 'gate_closed', %L, %L,
    '{}', %L, 'phone', %L, %L, false, %L) $f$, pg_temp.id('sm'), pg_temp.dd(), p_note, pg_temp.id('ev'), p_caps,
    p_notified, p_proposed, p_no_date, p_outcome));
$$;
select is(pg_temp.missed('Kapı kilitli', array[pg_temp.id('cap')], pg_temp.dd(), null),
  '22023 invalid_input / proposed_date', 'customer reason: a new date is required');
select is(pg_temp.missed('Kapı kilitli', '{}', pg_temp.dd(), pg_temp.dd() + 3),
  '22023 invalid_input / evidence', 'customer reason: a photo is required');
select is(pg_temp.missed(null, array[pg_temp.id('cap')], pg_temp.dd(), pg_temp.dd() + 3),
  '22023 invalid_input / note', 'customer reason: a note is required');
select is(pg_temp.missed('Kapı kilitli', array[pg_temp.id('cap')], pg_temp.dd() + 1, pg_temp.dd() + 3),
  '22023 invalid_input / customer_notified', 'customer reason: notified the same day');
select is(pg_temp.missed('Kapı kilitli', array[pg_temp.id('cap')], pg_temp.dd(), pg_temp.dd() + 16),
  'P0001 proposed_date_outside_window', 'the new date is in the same window');
select is(pg_temp.missed('Kapı kilitli', array[pg_temp.id('cap')], pg_temp.dd(), null, false, 'deemed_done'),
  '22023 invalid_input / proposed_date', 'a first failure is never deemed done');
select is(pg_temp.missed('Kapı kilitli', array[pg_temp.id('cap')], pg_temp.dd(), pg_temp.dd() + 5), null,
  'customer reason with photo, note, same-day notice and a new date: recorded (rescheduled)');
insert into ids select 'm1', id from private.missed_visit where session_id = pg_temp.id('sm');
select results_eq(
  $$ select reason, customer_notified_on, proposed_date, outcome, source_event_id, evidence_capture_ids
     from private.missed_visit where id = pg_temp.id('m1') $$,
  $$ values ('customer'::text, pg_temp.dd(), pg_temp.dd() + 5, 'rescheduled'::text, pg_temp.id('ev'), array[pg_temp.id('cap')]) $$,
  'the record keeps the flags, the event and the photo');
select throws_ok(
  $$ insert into private.missed_visit (org_id, parcel_id, session_id, occurred_on, reason, note)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.id('sm'),
             pg_temp.dd(), 'customer', 'x') $$,
  '23514', null, 'the table refuses a customer reason without notice and evidence');
reset role;
select throws_ok($$ update private.missed_visit set note = 'değişti' where id = pg_temp.id('m1') $$,
  'P0001', 'missed_visit_frozen', 'a record never changes');
select throws_ok($$ delete from private.missed_visit where id = pg_temp.id('m1') $$,
  'P0001', 'DELETE on private.missed_visit is not allowed', 'nor is deleted');
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.ops_set_missed_visit_outcome(%L, 'refunded') $$, pg_temp.id('m1'))),
  'P0001 missed_visit_frozen', 'an outcome is set once');
-- Second failure on the proposed day: deemed done (8A/3).
select is(pg_temp.error_of(format($$ select public.ops_record_missed_visit(%L, 'customer', %L, 'Yine kapalı', 'gate_closed',
    null, %L, '{}', %L, 'sms', p_outcome => 'deemed_done') $$, pg_temp.id('sm'), pg_temp.dd() + 4, array[pg_temp.id('cap')],
    pg_temp.dd() + 4)), '22023 invalid_input / proposed_date', 'not on another day than the proposed one');
select lives_ok(format($$ select public.ops_record_missed_visit(%L, 'customer', %L, 'Yine kapalı', 'gate_closed',
    null, %L, '{}', %L, 'sms', p_outcome => 'deemed_done') $$, pg_temp.id('sm'), pg_temp.dd() + 5, array[pg_temp.id('cap')],
    pg_temp.dd() + 5), 'the second failure on the proposed day is deemed done');
-- Weather: no flags needed; deemed_done is never allowed; carry over needs a period.
insert into ids select 'mw', public.ops_record_missed_visit(pg_temp.id('sm'), 'weather', pg_temp.dd(), null, 'rain');
select is(pg_temp.error_of(format($$ select public.ops_set_missed_visit_outcome(%L, 'deemed_done') $$, pg_temp.id('mw'))),
  'P0001 deemed_done_not_allowed', 'weather is never deemed done');
select is(pg_temp.error_of(format($$ select public.ops_set_missed_visit_outcome(%L, 'carried_over', null, 'portal', %L) $$,
  pg_temp.id('mw'), pg_temp.dd() + 60)), 'P0001 carry_over_not_allowed', 'no carry over without a period');

-- Carry over inside a period (an order serving the parcel of a customer).
insert into ids select 'c1', pg_temp.new_customer(1);
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.601);
insert into ids select 'sc', pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o1')), 'periodic_scan', 'planned', pg_temp.today() - 5);
select pg_temp.ops();
insert into ids select 'mc', public.ops_record_missed_visit(pg_temp.id('sc'), 'company', pg_temp.today() - 5, 'Ekip gelemedi',
  'staff');
create temporary table cw on commit drop as
  select (x ->> 'start')::date as start from public.ops_visit_records(pg_temp.id('sc')) r,
    jsonb_array_elements(r -> 'carry_windows') x order by 1 limit 1;
grant select on cw to authenticated;
select is(pg_temp.error_of(format($$ select public.ops_set_missed_visit_outcome(%L, 'carried_over', null, 'portal', %L) $$,
  pg_temp.id('mc'), pg_temp.today() + 400)), 'P0001 carry_over_not_allowed', 'never past the period''s last window');
select is(pg_temp.error_of(format($$ select public.ops_set_missed_visit_outcome(%L, 'carried_over', null, null, %L) $$,
  pg_temp.id('mc'), (select start from cw))), '22023 invalid_input / carry_over_channel',
  'a carry over needs the owner''s portal or written request');
select lives_ok(format($$ select public.ops_set_missed_visit_outcome(%L, 'carried_over', null, 'written', %L) $$,
  pg_temp.id('mc'), (select start from cw)), 'carried over to a later window of the period');

select * from finish();
rollback;
