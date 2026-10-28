-- T23 visibility (H05, H22, H32): question threads per owner, no staff track
-- for parcel readers, session_event staff only while the field app still
-- writes and reads its rows.
-- Seed: org b0..01, owner a0..01 and viewer a0..02 of parcel c0..01,
-- field_staff a0..03, expert a0..04, ops a0..05. The fixture adds a second
-- owner (co-owner) 60..01 of the same parcel. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select testing.reset_to_seed();

create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixtures (as postgres) --------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'coowner-60@example.test', now(), now());
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000001', 'owner');

insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('60000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-11-01 07:00:00+00');

-- Media of the published scan: what an owner may see and what is staff only.
insert into public.capture (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, started_at,
                            position, position_uncertainty_m)
select ('60000000-0000-4000-8000-0000000000' || n)::uuid, 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000010',
       k::public.capture_kind, t, 'station://raw/' || n, encode(sha256(('c60-' || n)::bytea), 'hex'),
       '2026-11-01 07:00:00+00'::timestamptz + (n::int || ' seconds')::interval,
       'SRID=4326;POINT(37.38 37.07)', 0.1
from (values ('21', 'gnss_raw', null::uuid), ('22', 'mcap', null), ('23', 'video_360', null),
             ('24', 'photo', null), ('25', 'photo', pg_temp.tree('S1-1'))) v(n, k, t);
insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version,
                          position, position_uncertainty_m)
select ('60000000-0000-4000-8000-0000000000' || n)::uuid, 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000010',
       k::public.asset_kind, t, 'storage://media/x' || n, encode(sha256(('a60-' || n)::bytea), 'hex'), 'pipeline', '0.1.0',
       'SRID=4326;POINT(37.38 37.07)', 0.1
from (values ('31', 'trajectory', null::uuid), ('32', 'point_cloud', null), ('33', 'panorama', null),
             ('34', 'tree_crop', pg_temp.tree('S1-1'))) v(n, k, t);

insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns,
                                  time_source, phone_time, logger_result)
values ('60000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000010', 'boundary_pointer',
        '{"name": "Ali Bekçi", "role": "worker"}', 1449000000000000000, 'gps', '2026-11-01 07:05:00+00', 'none');

-- Questions: two owners and a viewer of one parcel --------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
insert into public.question (id, parcel_id, tree_id, body)
values ('60000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'), 'Birinci sahibin sorusu');
select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
insert into public.question (id, parcel_id, tree_id, body)
values ('60000000-0000-4000-8000-000000000052', 'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'), 'İkinci sahibin sorusu');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
insert into public.question (id, parcel_id, tree_id, body)
values ('60000000-0000-4000-8000-000000000053', 'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'), 'Hissedarın sorusu');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
insert into public.question_reply (id, question_id, body) values
  ('60000000-0000-4000-8000-000000000061', '60000000-0000-4000-8000-000000000051', 'Cevap 1'),
  ('60000000-0000-4000-8000-000000000062', '60000000-0000-4000-8000-000000000052', 'Cevap 2'),
  ('60000000-0000-4000-8000-000000000063', '60000000-0000-4000-8000-000000000053', 'Cevap 3');
select results_eq($$ select count(*) from public.question where body like '%sorusu' $$, array[3::bigint],
  'the expert reads every thread of the org');
select results_eq($$ select count(*) from public.question_reply where body like 'Cevap _' $$, array[3::bigint],
  'and every reply');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq($$ select id from public.question $$, array['60000000-0000-4000-8000-000000000051'::uuid],
  'the first owner reads only their own question');
select results_eq($$ select body from public.question_reply $$, array['Cevap 1'],
  'and only the reply to it');
select throws_ok(
  $$ insert into public.question_reply (question_id, body) values ('60000000-0000-4000-8000-000000000052', 'Araya girme') $$,
  '42501', null, 'the first owner cannot reply in the co-owner''s thread');
select results_eq(
  $$ with u as (update public.question set body = 'x' where id = '60000000-0000-4000-8000-000000000052' returning 1)
     select count(*) from u $$, array[0::bigint], 'nor edit it');

select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
select results_eq($$ select id from public.question $$, array['60000000-0000-4000-8000-000000000052'::uuid],
  'the co-owner reads only their own question');
select results_eq($$ select body from public.question_reply $$, array['Cevap 2'], 'and its reply');
select lives_ok(
  $$ insert into public.question_reply (question_id, body) values ('60000000-0000-4000-8000-000000000052', 'Teşekkürler') $$,
  'the co-owner follows up in their own thread');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select results_eq($$ select id from public.question $$, array['60000000-0000-4000-8000-000000000053'::uuid],
  'the viewer reads only their own question, not the owners''');
select results_eq($$ select body from public.question_reply $$, array['Cevap 3'], 'and only its reply');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select results_eq($$ select count(*) from public.question_reply where question_id = '60000000-0000-4000-8000-000000000052' $$,
  array[2::bigint], 'ops reads the co-owner''s thread with the follow-up');

-- A removed owner's threads stay closed to the remaining owner (H22).
reset role;
delete from public.parcel_access where user_id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('60000000-0000-4000-8000-000000000001');
select is_empty($$ select id from public.question $$, 'an owner without access reads no question');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq($$ select count(*) from public.question $$, array[1::bigint],
  'the remaining owner still reads only their own thread');

-- Staff GNSS ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select set_eq($$ select kind::text from public.capture where session_id = '60000000-0000-4000-8000-000000000010' $$,
  array['photo'], 'the owner reads only the close-up photo of a tree');
select is_empty($$ select id from public.capture where kind in ('gnss_raw', 'mcap', 'video_360') $$,
  'no raw GNSS log, MCAP or video for the owner');
select set_eq($$ select kind::text from public.asset where session_id = '60000000-0000-4000-8000-000000000010' $$,
  array['panorama', 'tree_crop'], 'the owner reads panoramas and crops, no trajectory or point cloud');
select is_empty($$ select id from public.session_event $$, 'the owner reads no session event');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is_empty($$ select id from public.capture where kind <> 'photo' or tree_id is null $$,
  'the viewer reads no staff capture');
select is_empty($$ select id from public.asset where kind in ('trajectory', 'point_cloud') $$,
  'nor a trajectory');
select is_empty($$ select id from public.session_event $$, 'nor a session event');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select results_eq($$ select count(*) from public.capture where session_id = '60000000-0000-4000-8000-000000000010' $$,
  array[5::bigint], 'the expert reads every capture');
select results_eq($$ select count(*) from public.session_event where session_id = '60000000-0000-4000-8000-000000000010' $$,
  array[1::bigint], 'and the session events');

-- The field app writes and reads back its events (apps/field sync: insert, then select by id).
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select lives_ok(
  $$ insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns, time_source, phone_time, logger_result)
     values ('60000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000001',
             'c0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000010', 'field_notice_verbal',
             '{"answer": "nobody"}', 1449000060000000000, 'phone', now(), 'none') $$,
  'field staff inserts a session event');
select results_eq($$ select count(*) from public.session_event where session_id = '60000000-0000-4000-8000-000000000010' $$,
  array[2::bigint], 'and reads the events back');
select results_eq($$ select count(*) from public.capture where session_id = '60000000-0000-4000-8000-000000000010' $$,
  array[5::bigint], 'field staff reads every capture of the visit');

-- Files follow the rows: no object of a staff-only capture is readable for the owner.
reset role;
insert into storage.objects (bucket_id, name) values
  ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
            || encode(sha256('c60-21'::bytea), 'hex')),
  ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
            || encode(sha256('c60-25'::bytea), 'hex'));
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq(
  format($$ select storage.filename(name) from storage.objects where bucket_id = 'media'
            and storage.filename(name) in (%L, %L) $$,
         encode(sha256('c60-21'::bytea), 'hex'), encode(sha256('c60-25'::bytea), 'hex')),
  array[encode(sha256('c60-25'::bytea), 'hex')],
  'the owner reads the close-up file, not the GNSS log file');

select * from finish();
rollback;
