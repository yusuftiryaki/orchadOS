-- Session event details (20261022120000_session_event_data): corners and
-- coverage carry a JSON object; the table stays insert-only.
-- Seed: owner a0..01, field_staff a0..03, org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

insert into public.session (id, org_id, parcel_id, kind, status, planned_date, lead_user_id)
values ('e2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'inventory', 'planned', '2026-12-10',
        'a0000000-0000-4000-8000-000000000003');

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

create function pg_temp.event(p_id text, p_type text, p_data jsonb) returns void language sql
as $$
  insert into public.session_event (id, org_id, parcel_id, session_id, event_type, payload, gps_time_ns,
                                    time_source, phone_time, logger_result, data)
  values (p_id::uuid, 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
          'e2000000-0000-4000-8000-000000000001', p_type, '1', 1449000000000000000, 'gps',
          '2026-12-10 07:05:00+00', 'ok', p_data)
$$;

select has_column('public', 'session_event', 'data', 'session_event has a data column');
select col_is_null('public', 'session_event', 'data', 'data is optional');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');

select lives_ok(
  $$ select pg_temp.event('e2010000-0000-4000-8000-000000000001', 'corner',
       '{"corner_no": 1, "position": {"lat": 37.0662, "lon": 37.3833, "h_acc_m": 0.014,
         "fix_type": 3, "carr_soln": "fixed", "num_sv": 24}}') $$,
  'field staff records a corner with its position');
select lives_ok(
  $$ select pg_temp.event('e2010000-0000-4000-8000-000000000002', 'qr_sync', null) $$,
  'events without details still work');
select is(
  (select data -> 'position' ->> 'carr_soln' from public.session_event
   where id = 'e2010000-0000-4000-8000-000000000001'),
  'fixed',
  'details are stored as sent');
select throws_ok(
  $$ select pg_temp.event('e2010000-0000-4000-8000-000000000003', 'corner', '[1, 2]') $$,
  '23514', null, 'details must be a JSON object');
select throws_ok(
  $$ update public.session_event set data = '{"corner_no": 2}'
     where id = 'e2010000-0000-4000-8000-000000000001' $$,
  '42501', null, 'field staff cannot change details (insert-only)');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty(
  $$ select id from public.session_event where session_id = 'e2000000-0000-4000-8000-000000000001' $$,
  'owners still do not see session events');

select * from finish();
rollback;
