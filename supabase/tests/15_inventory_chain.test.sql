-- Inventory chain (IP5 v0.2): save_inventory() and trunk_label.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05
-- of org b0..01. Fixtures add an empty parcel ac..01 (no slots, numbering not
-- recorded), its inventory session ac..02 with one panorama asset ac..03, and a
-- tree crop asset ac..04.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

-- One slot (row 1, position p) near 37.41 E 37.03 N with an optional tree and its labels.
create function pg_temp.slot(p_position int, p_tree boolean, p_labels jsonb default '[]') returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'row_no', 1, 'position_no', p_position, 'suffix', null, 'kind', 'row',
    'lon', 37.41, 'lat', 37.03 + p_position * 0.00005, 'uncertainty_m', 0.2,
    'local_x_m', p_position * 5.5, 'local_y_m', 0,
    'tree', case when p_tree then jsonb_build_object('unsure', p_position = 2, 'moved', false, 'labels', p_labels) end)
$$;

create function pg_temp.label(p_yaw double precision) returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'panorama_asset_id', 'ac000000-0000-4000-8000-000000000003', 'panorama_gps_time_ns', '1476435618200000000',
    'yaw_deg', p_yaw, 'pitch_deg', -12.5, 'azimuth_deg', mod((90 + p_yaw + 360)::numeric, 360)::float8,
    'labelled_at', '2026-10-21T08:00:00Z')
$$;

-- Error message of a failing call (the reason the web app maps).
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Schema ---------------------------------------------------------------------------

select has_table('public', 'trunk_label', 'trunk_label exists');
select has_function('public', 'save_inventory',
  array['uuid', 'uuid', 'corner', 'real', 'jsonb', 'text'], 'save_inventory exists');
select is((select prosecdef from pg_proc where proname = 'save_inventory'), false,
  'save_inventory runs as the caller (security invoker)');
select ok(not has_function_privilege('anon',
  'public.save_inventory(uuid, uuid, public.corner, real, jsonb, text)', 'EXECUTE'),
  'anon cannot call save_inventory');
select ok(has_function_privilege('authenticated',
  'public.save_inventory(uuid, uuid, public.corner, real, jsonb, text)', 'EXECUTE'),
  'authenticated can call save_inventory');
select ok(not has_table_privilege('authenticated', 'public.trunk_label', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.trunk_label', 'DELETE'),
  'API users get no update or delete grant on trunk_label');
select has_trigger('public', 'trunk_label', 'trunk_label_append_only', 'trunk_label is append-only');

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.parcel (id, org_id, name)
values ('ac000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Envanter testi');
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('ac000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'ac000000-0000-4000-8000-000000000001', 'inventory', 'processed', '2026-10-20 09:00:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version, pose)
values
  ('ac000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', 'panorama',
   'storage://media/p', encode(sha256('inventory-panorama'::bytea), 'hex'), 'pipeline', '0.1.0',
   '{"variant": "preview", "heading_deg": 90}'),
  ('ac000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', 'trajectory',
   'storage://media/t', encode(sha256('inventory-trajectory'::bytea), 'hex'), 'pipeline', '0.1.0', null);

-- Who may save ----------------------------------------------------------------------

set local role authenticated;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0, jsonb_build_array(pg_temp.slot(1, true))) $$),
  'forbidden', 'an expert cannot save an inventory (row level security alone would let it)');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0, jsonb_build_array(pg_temp.slot(1, true))) $$),
  'not_found', 'a viewer of another parcel does not see this one');

-- The seed owner gets owner access to the parcel: it sees it, but cannot save.
reset role;
insert into public.parcel_access (org_id, parcel_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'owner');
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0, jsonb_build_array(pg_temp.slot(1, true))) $$),
  'forbidden', 'an owner cannot save an inventory');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0, jsonb_build_array(pg_temp.slot(1, true))) $$),
  'numbering_forbidden', 'field staff cannot record the numbering (ops only)');
select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001', 'sw', 0, jsonb_build_array(pg_temp.slot(1, true))) $$),
  'session_invalid', 'a session of another parcel is refused');

-- All or nothing --------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
-- The third slot repeats the first one's code.
select ok(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0,
  jsonb_build_array(pg_temp.slot(1, true, jsonb_build_array(pg_temp.label(10))), pg_temp.slot(2, true), pg_temp.slot(1, true))) $$)
  is not null, 'a duplicate slot code fails the call');
-- A label with a pitch out of range.
select ok(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0,
  jsonb_build_array(pg_temp.slot(1, true, jsonb_build_array(pg_temp.label(10) || '{"pitch_deg": 120}')))) $$)
  is not null, 'an invalid label fails the call');
-- A label pointing at an asset that is not a panorama.
select ok(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0,
  jsonb_build_array(pg_temp.slot(1, true, jsonb_build_array(pg_temp.label(10)
    || '{"panorama_asset_id": "ac000000-0000-4000-8000-000000000004"}')))) $$)
  is not null, 'a label on a non-panorama asset fails the call');
select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0, '[]') $$),
  'invalid_input', 'an empty slot list is refused');

reset role;
select is((select count(*) from public.slot where parcel_id = 'ac000000-0000-4000-8000-000000000001'), 0::bigint,
  'no slot was written by the failed calls');
select is((select count(*) from public.trunk_label where parcel_id = 'ac000000-0000-4000-8000-000000000001'), 0::bigint,
  'no label was written by the failed calls');
select is((select numbering_origin_corner from public.parcel where id = 'ac000000-0000-4000-8000-000000000001'), null,
  'the numbering was not recorded by the failed calls');

-- Success ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  public.save_inventory('ac000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000002', 'sw', 0,
    jsonb_build_array(
      pg_temp.slot(1, true, jsonb_build_array(pg_temp.label(10), pg_temp.label(-35.5))),
      pg_temp.slot(2, true, jsonb_build_array(pg_temp.label(20))),
      pg_temp.slot(3, false))),
  '{"slots": 3, "trees": 2, "labels": 3}'::jsonb,
  'ops saves slots, trees and labels in one call');

select results_eq(
  $$ select s.code, t.first_seen_session_id, t.first_seen_at
     from public.slot s join public.tree t on t.slot_id = s.id
     where s.parcel_id = 'ac000000-0000-4000-8000-000000000001' order by s.code $$,
  $$ values ('S1-1', 'ac000000-0000-4000-8000-000000000002'::uuid, '2026-10-20 09:00:00+00'::timestamptz),
            ('S1-2', 'ac000000-0000-4000-8000-000000000002'::uuid, '2026-10-20 09:00:00+00'::timestamptz) $$,
  'trees are linked to the inventory session and start with it');
select is((select numbering_origin_corner::text || '/' || row_azimuth_deg::text
           from public.parcel where id = 'ac000000-0000-4000-8000-000000000001'), 'sw/0',
  'ops records the numbering on the parcel');
select results_eq(
  $$ select s.code, l.yaw_deg, l.unsure, l.labelled_by, l.panorama_gps_time_ns
     from public.trunk_label l join public.slot s on s.id = l.slot_id
     where l.parcel_id = 'ac000000-0000-4000-8000-000000000001' order by s.code, l.yaw_deg $$,
  $$ values ('S1-1', -35.5::float8, false, 'a0000000-0000-4000-8000-000000000005'::uuid, 1476435618200000000::bigint),
            ('S1-1', 10::float8, false, 'a0000000-0000-4000-8000-000000000005'::uuid, 1476435618200000000::bigint),
            ('S1-2', 20::float8, true, 'a0000000-0000-4000-8000-000000000005'::uuid, 1476435618200000000::bigint) $$,
  'labels keep the click, the tree, the labeller and the panorama frame');

select is(pg_temp.error_of($$ select public.save_inventory('ac000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000002', 'sw', 0, jsonb_build_array(pg_temp.slot(5, true))) $$),
  'existing_inventory', 'a second save over an existing inventory is refused');

-- Append-only, org roles only -------------------------------------------------------

select throws_ok(
  $$ update public.trunk_label set yaw_deg = 0 where parcel_id = 'ac000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'API users cannot update a label');
select throws_ok(
  $$ delete from public.trunk_label where parcel_id = 'ac000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'API users cannot delete a label');
select throws_ok(
  $$ insert into public.trunk_label (org_id, parcel_id, session_id, panorama_asset_id, yaw_deg, pitch_deg,
       azimuth_deg, slot_id, labelled_by)
     select org_id, parcel_id, 'ac000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000003',
       0, 0, 0, id, 'a0000000-0000-4000-8000-000000000003'
     from public.slot where parcel_id = 'ac000000-0000-4000-8000-000000000001' limit 1 $$,
  '42501', null, 'a label cannot be written in someone else''s name');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*) from public.trunk_label where parcel_id = 'ac000000-0000-4000-8000-000000000001'),
  3::bigint, 'an expert of the org reads the labels');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.slot where parcel_id = 'ac000000-0000-4000-8000-000000000001'),
  3::bigint, 'the owner sees the saved slots');
select is((select count(*) from public.trunk_label where parcel_id = 'ac000000-0000-4000-8000-000000000001'),
  0::bigint, 'the owner does not see the labels');

reset role;
select throws_ok(
  $$ update public.trunk_label set yaw_deg = 0 where parcel_id = 'ac000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'nobody updates a label, not even trusted roles');
select lives_ok(
  $$ delete from public.trunk_label where parcel_id = 'ac000000-0000-4000-8000-000000000001' $$,
  'trusted roles may delete labels (tests, data erasure)');

select * from finish();
rollback;
