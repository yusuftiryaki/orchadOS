-- Field app sync (20261021230000_field_sync): field staff uploads media, session
-- events and staff answers of a planned visit, and resending changes nothing.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01, trees of the seed inventory.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.org (id, name) values ('f1000000-0000-4000-8000-000000000019', 'Field sync test org');
insert into public.parcel (id, org_id, name)
values ('f2000000-0000-4000-8000-000000000019', 'f1000000-0000-4000-8000-000000000019', 'Field sync test parcel');

-- A planned periodic visit led by the field staff user (ops plans it in the app).
insert into public.session (id, org_id, parcel_id, kind, status, planned_date, lead_user_id)
values ('e1900000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2026-12-10',
        'a0000000-0000-4000-8000-000000000003');

create function pg_temp.obj(p_seed text) returns text language sql immutable
as $$ select 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
             || encode(sha256(p_seed::bytea), 'hex') $$;

create function pg_temp.a_tree() returns uuid language sql stable
as $$ select id from public.tree where parcel_id = 'c0000000-0000-4000-8000-000000000001' and status = 'active'
      order by id limit 1 $$;

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

-- Media: field staff adds, never changes -------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('field-photo')) $$,
  'field staff can add an object under a parcel of its org');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/f1000000-0000-4000-8000-000000000019/parcel/f2000000-0000-4000-8000-000000000019/'
       || encode(sha256('x'::bytea), 'hex')) $$,
  '42501', null, 'field staff cannot add an object into another org');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/f2000000-0000-4000-8000-000000000019/'
       || encode(sha256('x'::bytea), 'hex')) $$,
  '42501', null, 'field staff cannot add an object under a parcel of another org');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/photo.jpg') $$,
  '42501', null, 'field staff cannot add an object whose file name is not a sha256');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('field-photo')) $$,
  '23505', null, 'the same path cannot be written twice');
select is_empty(
  $$ update storage.objects set metadata = '{"x": 1}' where name = pg_temp.obj('field-photo') returning id $$,
  'field staff cannot change an object');
select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')),
  0::bigint,
  'no API role may change or delete objects, field staff included');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('expert-photo')) $$,
  '42501', null, 'expert still cannot add objects');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('owner-photo')) $$,
  '42501', null, 'owner still cannot add objects');

-- Session: planned -> captured by the field staff ---------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select results_eq(
  $$ update public.session
     set status = 'captured', started_at = '2026-12-10 07:00:00+00', ended_at = '2026-12-10 08:30:00+00',
         methodology_version = 'field-v0'
     where id = 'e1900000-0000-4000-8000-000000000001' and status in ('planned', 'captured')
     returning status::text $$,
  array['captured'],
  'field staff marks its planned visit captured with start and end times');
select results_eq(
  $$ update public.session
     set status = 'captured', started_at = '2026-12-10 07:00:00+00', ended_at = '2026-12-10 08:30:00+00'
     where id = 'e1900000-0000-4000-8000-000000000001' and status in ('planned', 'captured')
     returning status::text $$,
  array['captured'],
  'sending the same session again is harmless');
select throws_ok(
  $$ update public.session set planned_date = '2026-12-11' where id = 'e1900000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'field staff still cannot change the plan of the visit');

-- Session events --------------------------------------------------------------------

select lives_ok(
  $$ insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns,
       time_source, phone_time, logger_result)
     values ('e1910000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000001', 'qr_sync',
       'OQ1:1449403218200:visit', 1449403218200000000, 'gps', '2026-12-10 07:00:01+00', 'ok') $$,
  'field staff records a session event');
select lives_ok(
  $$ insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns,
       time_source, phone_time, logger_result)
     values ('e1910000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000001', 'qr_sync',
       'OQ1:1449403218200:visit', 1449403218200000000, 'gps', '2026-12-10 07:00:01+00', 'ok')
     on conflict (id) do nothing $$,
  'a resent event is ignored');
select results_eq(
  $$ select count(*) from public.session_event where session_id = 'e1900000-0000-4000-8000-000000000001' $$,
  array[1::bigint], 'the event is stored once');
select throws_ok(
  $$ update public.session_event set payload = 'x' where id = 'e1910000-0000-4000-8000-000000000001' $$,
  '42501', null, 'session events cannot be changed by API users');
select throws_ok(
  $$ insert into public.session_event (org_id, parcel_id, session_id, event_type, gps_time_ns, time_source, phone_time)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e1900000-0000-4000-8000-000000000001', 'QR sync', 0, 'gps', now()) $$,
  '23514', null, 'event types are lowercase codes');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty($$ select id from public.session_event $$, 'owners do not see session events');
select throws_ok(
  $$ insert into public.session_event (org_id, parcel_id, session_id, event_type, gps_time_ns, time_source, phone_time)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e1900000-0000-4000-8000-000000000001', 'corner', 0, 'gps', now()) $$,
  '42501', null, 'owners cannot record session events');

-- Capture and staff answers, resent ----------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select lives_ok(
  $$ insert into public.capture (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, byte_size,
       mime_type, started_at, metadata)
     values ('e1920000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000001', 'photo', pg_temp.a_tree(),
       'storage://media/' || pg_temp.obj('field-photo'), encode(sha256('field-photo'::bytea), 'hex'), 11,
       'image/jpeg', '2026-12-10 07:30:00+00', '{"shot_code": "trunk"}')
     on conflict (session_id, content_hash) do nothing $$,
  'field staff registers its close-up photo');
select lives_ok(
  $$ insert into public.capture (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, byte_size,
       mime_type, started_at, metadata)
     values ('e1920000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', 'e1900000-0000-4000-8000-000000000001', 'photo', pg_temp.a_tree(),
       'storage://media/' || pg_temp.obj('field-photo'), encode(sha256('field-photo'::bytea), 'hex'), 11,
       'image/jpeg', '2026-12-10 07:30:00+00', '{"shot_code": "trunk"}')
     on conflict (session_id, content_hash) do nothing $$,
  'a resent photo row is ignored');

select lives_ok(
  $$ insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('e1930000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', pg_temp.a_tree(),
       (select id from public.metric_definition where code = 'dead_branch_present'), true,
       'field_question', 'winter-v0', 'staff', 'e1900000-0000-4000-8000-000000000001', '2026-12-10 07:31:00+00')
     on conflict (id) do nothing $$,
  'field staff records a yes/no answer as value_boolean');
select lives_ok(
  $$ insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_boolean,
       method, method_version, source, session_id, measured_at)
     values ('e1930000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', pg_temp.a_tree(),
       (select id from public.metric_definition where code = 'dead_branch_present'), true,
       'field_question', 'winter-v0', 'staff', 'e1900000-0000-4000-8000-000000000001', '2026-12-10 07:31:00+00')
     on conflict (id) do nothing $$,
  'a resent answer is ignored');
select results_eq(
  $$ select (select count(*) from public.capture where session_id = 'e1900000-0000-4000-8000-000000000001'),
            (select count(*) from public.measurement where session_id = 'e1900000-0000-4000-8000-000000000001') $$,
  $$ values (1::bigint, 1::bigint) $$,
  'resending leaves one photo row and one answer');

-- Registry -------------------------------------------------------------------------------

reset role;
select set_eq(
  $$ select code from public.metric_definition where value_type = 'boolean' and card_visibility = 'hidden' $$,
  array['dead_branch_present', 'trunk_damage_present', 'root_sucker_present', 'pruned', 'frost_damage_present',
        'pest_sign_present', 'fruit_present', 'drought_stress_sign', 'theft_sign_present',
        -- "Sorun gördüm" (20261023130000_bulk_approval).
        'problem_seen'],
  'field question metrics are registered as hidden yes/no metrics');
select results_eq(
  $$ select count(*) from public.metric_definition
     where code in ('harvest_complete', 'branch_break') and value_type = 'boolean' and 'tree' = any (subject_kinds) $$,
  array[2::bigint], 'harvest questions reuse the registered tree metrics');

select * from finish();
rollback;
