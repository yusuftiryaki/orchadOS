-- Calibration for the kit identity chip (20261027120000_calibration_kit_mount):
-- chip_id is assigned, unique and fixed; kit_mount poses are checked and fixed
-- once written; the rest of the row stays editable.
-- Seed: field_staff a0..03, rig d2..01, calibration d3..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');

insert into public.calibration (id, org_id, rig_id, version, extrinsics, valid_from) values
  ('d3290000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', 'kit-v2',
   '{"kit_mount": {"kit_gnss": [0, 0, 0.9, 0, 0, 0], "kit_cam360": [0.02, 0, 0.75, 0, 0, 1.5708]}}',
   '2026-10-27 00:00+00');

select ok((select chip_id from public.calibration where id = 'd3000000-0000-4000-8000-000000000001') > 0,
  'existing rows get a chip id');
select ok((select chip_id from public.calibration where id = 'd3290000-0000-4000-8000-000000000001')
  > (select chip_id from public.calibration where id = 'd3000000-0000-4000-8000-000000000001'),
  'chip ids increase');

select throws_ok($$ insert into public.calibration (org_id, rig_id, version, valid_from, chip_id)
  values ('b0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'x', now(), 7) $$,
  '428C9', null, 'a chip id cannot be chosen');

select throws_ok($$ insert into public.calibration (org_id, rig_id, version, valid_from, extrinsics)
  values ('b0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'x', now(),
  '{"kit_mount": {"kit_gnss": [0, 0, 1]}}') $$,
  '23514', null, 'a pose needs six numbers');
select throws_ok($$ insert into public.calibration (org_id, rig_id, version, valid_from, extrinsics)
  values ('b0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'x', now(),
  '{"kit_mount": {"antenna": [0, 0, 1, 0, 0, 0]}}') $$,
  '23514', null, 'only the robot''s kit frames');

select throws_ok($$ update public.calibration set extrinsics = jsonb_set(extrinsics, '{kit_mount,kit_gnss,2}', '1.0')
  where id = 'd3290000-0000-4000-8000-000000000001' $$,
  '23514', null, 'kit_mount poses are fixed');
select throws_ok($$ update public.calibration set chip_id = default
  where id = 'd3290000-0000-4000-8000-000000000001' $$,
  '23514', null, 'the chip id is fixed');

select lives_ok($$ update public.calibration set valid_to = '2026-11-01 00:00+00',
  extrinsics = extrinsics || '{"note": "x"}' where id = 'd3290000-0000-4000-8000-000000000001' $$,
  'other fields stay editable');
select lives_ok($$ update public.calibration set extrinsics = '{"camera_to_antenna_m": [0, 0, 0.2]}'
  where id = 'd3000000-0000-4000-8000-000000000001' $$,
  'rows without kit_mount are unaffected');

select * from finish();
rollback;
