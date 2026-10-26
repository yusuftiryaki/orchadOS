-- Inventory approval and the coverage gate (20261025120300_inventory_coverage_gate):
-- without a coverage report approval is unchanged; a report below the threshold
-- refuses it until the expert accepts that report with a reason (waive_coverage);
-- a passing newer report needs nothing.
-- Seed users: owner a0..01, field_staff a0..03, expert a0..04, ops a0..05 of org b0..01.
-- Fixtures: parcels ae..01 / ae..11 / ae..21, each with an inventory session and a slot.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' | ' || nullif(v_detail, ''), '');
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;
create function pg_temp.report(p_covered int) returns jsonb language sql
as $$ select jsonb_build_object(
  'pipeline', 'orchados-pipeline', 'pipeline_version', '0.1.0', 'params_hash', 'h' || p_covered,
  'active_trees', 20, 'covered_trees', p_covered, 'threshold', 0.95, 'blind_spots', 0,
  'missing_slot_codes', '[]'::jsonb, 'blind_spot_cells', '[]'::jsonb, 'rule', '{}'::jsonb) $$;

-- Three parcels: without a report (n = 0), below the threshold (1), passing (2).
insert into public.parcel (id, org_id, name, status)
select ('ae000000-0000-4000-8000-0000000000' || n || '1')::uuid, 'b0000000-0000-4000-8000-000000000001',
       'Kapsama kapısı ' || n, 'inventory_planned'
from generate_series(0, 2) n;
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
select ('ae000000-0000-4000-8000-0000000000' || n || '2')::uuid, 'b0000000-0000-4000-8000-000000000001',
       ('ae000000-0000-4000-8000-0000000000' || n || '1')::uuid, 'inventory', 'processed', '2026-10-25 09:00+00'
from generate_series(0, 2) n;
insert into public.slot (id, org_id, parcel_id, row_no, position_no, position, position_uncertainty_m)
select ('ae000000-0000-4000-8000-0000000000' || n || '3')::uuid, 'b0000000-0000-4000-8000-000000000001',
       ('ae000000-0000-4000-8000-0000000000' || n || '1')::uuid, 1, 1, 'SRID=4326;POINT(37.41 37.03)', 0.2
from generate_series(0, 2) n;

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.record_coverage_report('ae000000-0000-4000-8000-000000000012', pg_temp.report(15));
select public.record_coverage_report('ae000000-0000-4000-8000-000000000022', pg_temp.report(15));
select public.record_coverage_report('ae000000-0000-4000-8000-000000000022', pg_temp.report(20));

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.waive_coverage('ae000000-0000-4000-8000-000000000002', 'x') $$),
  'not_found', 'nothing to accept without a report');
select is((public.approve_inventory('ae000000-0000-4000-8000-000000000002')).status::text, 'published',
  'no coverage report (older data): approved as before');
select is(pg_temp.error_of($$ select public.approve_inventory('ae000000-0000-4000-8000-000000000012') $$),
  'inventory_incomplete | coverage_below_threshold: 0.7500/0.9500',
  'below the threshold: refused, with the ratio and the threshold');
select is((public.approve_inventory('ae000000-0000-4000-8000-000000000022')).status::text, 'published',
  'the newest report passes: approved');

-- Accepting the report below the threshold.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.waive_coverage('ae000000-0000-4000-8000-000000000012', 'koridor kapalı') $$),
  'forbidden', 'ops does not accept the coverage');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.waive_coverage('ae000000-0000-4000-8000-000000000012', '  ') $$),
  'invalid_input | p_note', 'a reason is required');
select is(pg_temp.error_of($$ select public.waive_coverage('ae000000-0000-4000-8000-000000000022', 'x') $$),
  'session_invalid', 'a published inventory is not changed');
select is((public.waive_coverage('ae000000-0000-4000-8000-000000000012',
  'Doğu koridoru sulama hattı nedeniyle sürülemedi.')).waiver_note,
  'Doğu koridoru sulama hattı nedeniyle sürülemedi.', 'the expert accepts it with a reason');
select ok((select waived_by = 'a0000000-0000-4000-8000-000000000004' and waived_at is not null
           from public.coverage_report where session_id = 'ae000000-0000-4000-8000-000000000012'),
  'who and when are kept on the report');

-- A newer report below the threshold needs its own acceptance.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.record_coverage_report('ae000000-0000-4000-8000-000000000012', pg_temp.report(14));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.approve_inventory('ae000000-0000-4000-8000-000000000012') $$),
  'inventory_incomplete | coverage_below_threshold: 0.7000/0.9500',
  'a newer report below the threshold: refused again');
select public.waive_coverage('ae000000-0000-4000-8000-000000000012', 'Aynı neden.');
select is((public.approve_inventory('ae000000-0000-4000-8000-000000000012')).status::text, 'published',
  'accepted: approved');
select is((select status::text from public.parcel where id = 'ae000000-0000-4000-8000-000000000011'),
  'inventory_done', 'the parcel is inventory_done');
select throws_ok(
  $$ update public.coverage_report set waiver_note = 'x' where session_id = 'ae000000-0000-4000-8000-000000000012' $$,
  '42501', null, 'API users do not change reports directly');

select * from finish();
rollback;
