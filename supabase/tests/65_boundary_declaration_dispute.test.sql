-- T16 (H07, H09): the boundary declaration on approval, the boundary pointer
-- copied from session events (an invalid payload never fails the insert),
-- and boundary disputes that refuse new scan visits.
-- Seed: org b0..01, owner a0..01, viewer a0..02 of parcel c0..01, field a0..03,
-- expert a0..04, ops a0..05; boundary_declaration_required is on. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
create function pg_temp.event(p_id text, p_payload text) returns void language sql
as $$
  insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns, time_source, phone_time, logger_result)
  values (p_id::uuid, 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
          '65000000-0000-4000-8000-000000000001', 'boundary_pointer', p_payload, 1449000000000000000, 'phone',
          '2026-11-01 07:05:00+00', 'none')
$$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('65000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'inventory', 'captured', '2026-11-01 07:00:00+00');
insert into public.boundary (id, org_id, parcel_id, version, geom, source, vertex_uncertainty_m)
select '65000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', coalesce(max(version), 0) + 1,
       'SRID=4326;POLYGON((37.45 37.0, 37.452 37.0, 37.452 37.002, 37.45 37.002, 37.45 37.0))', 'field_survey', 0.05
from public.boundary where parcel_id = 'c0000000-0000-4000-8000-000000000001';

-- a) Declaration --------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.error_of($$ select public.approve_boundary('65000000-0000-4000-8000-000000000011', true) $$),
  '42501 boundary 65000000-0000-4000-8000-000000000011 not found, already approved, or caller is not an owner of its parcel',
  'a viewer cannot approve');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.approve_boundary('65000000-0000-4000-8000-000000000011') $$),
  'P0001 declaration_required', 'without the declaration the approval is refused');
select lives_ok($$ select public.approve_boundary('65000000-0000-4000-8000-000000000011', true) $$,
  'with the declaration the owner approves');
reset role;
select results_eq(
  $$ select user_id, text_version, declaration_sha256 from private.boundary_approval
     where boundary_id = '65000000-0000-4000-8000-000000000011' $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid, 'mesafeli-v4-taslak',
             encode(sha256(convert_to('Gösterdiğim sınırın fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin vermeye yetkili olduğumu beyan ederim.', 'UTF8')), 'hex')) $$,
  'recorded with the current distance_sales version and the text''s SHA-256');
select is((select approved_at from private.boundary_approval where boundary_id = '65000000-0000-4000-8000-000000000011'),
  (select owner_approved_at from public.boundary where id = '65000000-0000-4000-8000-000000000011'), 'at the approval time');
select throws_ok($$ update private.boundary_approval set text_version = 'x' $$, 'P0001', null, 'the record is append-only');

-- Switch off: today's behaviour.
update public.org_billing_setting set boundary_declaration_required = false where org_id = 'b0000000-0000-4000-8000-000000000001';
insert into public.boundary (id, org_id, parcel_id, version, geom, source, vertex_uncertainty_m)
select '65000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', max(version) + 1,
       'SRID=4326;POLYGON((37.45 37.0, 37.452 37.0, 37.452 37.0021, 37.45 37.0021, 37.45 37.0))', 'field_survey', 0.05
from public.boundary where parcel_id = 'c0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.approve_boundary('65000000-0000-4000-8000-000000000012') $$, 'switch off: no declaration needed');
reset role;
select is((select count(*)::int from private.boundary_approval where boundary_id = '65000000-0000-4000-8000-000000000012'), 0,
  'and none recorded');

-- b) Boundary pointer ------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select lives_ok($$ select pg_temp.event('65000000-0000-4000-8000-000000000021', '{"name": "  Ali   Bekçi ", "role": "worker"}') $$,
  'the field app writes a boundary_pointer event');
select lives_ok($$ select pg_temp.event('65000000-0000-4000-8000-000000000022', 'not json') $$, 'an invalid payload is accepted');
select lives_ok($$ select pg_temp.event('65000000-0000-4000-8000-000000000023', '{"name": "Veli", "role": "boss"}') $$,
  'an unknown role is accepted');
select lives_ok($$ select pg_temp.event('65000000-0000-4000-8000-000000000024', '{"role": "owner"}') $$, 'a missing name is accepted');
select lives_ok(format($$ select pg_temp.event('65000000-0000-4000-8000-000000000025', %L) $$,
  json_build_object('name', repeat('x', 121), 'role', 'owner')::text), 'a too long name is accepted');
select lives_ok($$ select pg_temp.event('65000000-0000-4000-8000-000000000026', '["Ali", "owner"]') $$, 'a JSON array is accepted');
select is((select count(*)::int from public.session_event where session_id = '65000000-0000-4000-8000-000000000001'), 6,
  'all six events are stored');
select results_eq($$ select name, role from public.staff_boundary_pointers('c0000000-0000-4000-8000-000000000001') $$,
  $$ values ('Ali Bekçi', 'worker') $$, 'only the valid one becomes a pointer, name tidied; field staff reads it');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.staff_boundary_pointers('c0000000-0000-4000-8000-000000000001')), 1,
  'the expert reads it');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty($$ select * from public.staff_boundary_pointers('c0000000-0000-4000-8000-000000000001') $$,
  'the owner does not');

-- c) Dispute -----------------------------------------------------------------------------------

select is(pg_temp.error_of($$ select public.ops_open_boundary_dispute('c0000000-0000-4000-8000-000000000001', 'Komşu itiraz etti') $$),
  '42501 forbidden', 'an owner cannot open a dispute');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_open_boundary_dispute('c0000000-0000-4000-8000-000000000001', ' ') $$),
  '22023 invalid_input', 'a note is required');
select lives_ok($$ select public.ops_open_boundary_dispute('c0000000-0000-4000-8000-000000000001', 'Komşu Hasan itiraz etti') $$,
  'ops opens a dispute');
select is(pg_temp.error_of($$ select public.ops_open_boundary_dispute('c0000000-0000-4000-8000-000000000001', 'Tekrar') $$),
  'P0001 dispute_open', 'one at a time');
select is(pg_temp.error_of($$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2026-12-01') $$),
  'P0001 boundary_dispute_open', 'a new scan visit is refused');
select lives_ok($$ update public.session set status = 'processed' where id = '65000000-0000-4000-8000-000000000001' $$,
  'a visit under way still moves on');
select is(public.boundary_dispute_status('c0000000-0000-4000-8000-000000000001') -> 'history' -> 0 ->> 'note',
  'Komşu Hasan itiraz etti', 'ops reads the note');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.boundary_dispute_status('c0000000-0000-4000-8000-000000000001') ->> 'open', 'true', 'the owner sees it is open');
select ok(not (public.boundary_dispute_status('c0000000-0000-4000-8000-000000000001') ? 'history'), 'but not the note');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok($$ select public.ops_close_boundary_dispute('c0000000-0000-4000-8000-000000000001', 'Çözüldü') $$, 'ops closes it');
select lives_ok($$ insert into public.session (org_id, parcel_id, kind, status, planned_date)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'planned', '2026-12-01') $$,
  'then scans can be planned again');
reset role;
select is((select count(*)::int from private.boundary_dispute where parcel_id = 'c0000000-0000-4000-8000-000000000001'), 2,
  'both rows stay');

select * from finish();
rollback;
