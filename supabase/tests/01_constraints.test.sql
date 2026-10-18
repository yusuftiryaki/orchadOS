-- Constraints and immutability, run as the migration owner (postgres).
-- Seed ids: org b0..01, parcel c0..01, session e0..01; slot/tree/metric ids are md5-derived.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixtures --------------------------------------------------------------------

insert into public.capture (id, org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
values ('99000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'video_360', 'station://raw/test.insv', encode(sha256('capture-1'::bytea), 'hex'), '2026-10-10 06:40:00+00');

insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
values ('99000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001',
        'panorama', 'storage://media/test.jpg', encode(sha256('asset-1'::bytea), 'hex'), 'pipeline', '0.1.0');

-- Exactly one subject ------------------------------------------------------------

select lives_ok(
  $$ insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_numeric,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('99000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', md5('orchados-seed:tree:S1-1')::uuid,
       md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 24.5, 0.3, 'tape_measure', '1',
       'staff', 'e0000000-0000-4000-8000-000000000001', '2026-10-10 07:10:00+00') $$,
  'a tree measurement with one subject is accepted'
);

select is(
  (select subject::text || ' ' || unit from public.measurement where id = '99000000-0000-4000-8000-000000000010'),
  'tree cm',
  'subject is derived and unit is filled from the metric definition'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, slot_id, metric_definition_id, value_numeric,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:slot:S1-1')::uuid,
       md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 24.5, 0.3, 'tape_measure', '1',
       'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a measurement with two subjects (tree and slot) is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, metric_definition_id, value_numeric,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 24.5, 0.3, 'tape_measure', '1',
       'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a parcel-level value for a tree-only metric is rejected'
);

insert into public.metric_definition (code, name, unit, value_type, valid_seasons, card_visibility, subject_kinds)
values ('test_parcel_score', 'Test parcel score', null, 'numeric', '{winter}', 'hidden', '{parcel}');

select lives_ok(
  $$ insert into public.measurement (org_id, parcel_id, metric_definition_id, value_numeric,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       (select id from public.metric_definition where code = 'test_parcel_score'), 0.8, 0.1, 'aggregate', '1',
       'algorithm', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  'a parcel-level measurement (no tree/slot/zone) is accepted for a parcel metric'
);

-- Value checks against the metric definition -------------------------------------------

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:dead_branch_scale')::uuid, 4, 0,
       'staff_question', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a scale value outside 0..3 is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_scale,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 2, 0,
       'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a scale value for a numeric metric is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, unit,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 0.245, 'm',
       0.003, 'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a unit different from the metric unit is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric,
       method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 24.5,
       'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a numeric measurement without uncertainty is rejected'
);

select throws_ok(
  $$ insert into public.measurement (org_id, parcel_id, tree_id, metric_definition_id, value_numeric, value_scale,
       uncertainty, method, method_version, source, session_id, measured_at)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid, 24.5, 2,
       0.3, 'tape_measure', '1', 'staff', 'e0000000-0000-4000-8000-000000000001', now()) $$,
  '23514', null,
  'a measurement with two value columns is rejected'
);

-- Immutability ---------------------------------------------------------------------

select throws_ok(
  $$ update public.measurement set value_numeric = 30 where id = '99000000-0000-4000-8000-000000000010' $$,
  'P0001', null,
  'measurement update is rejected even for the table owner'
);
select throws_ok(
  $$ delete from public.measurement where id = '99000000-0000-4000-8000-000000000010' $$,
  'P0001', null,
  'measurement delete is rejected'
);
select throws_ok(
  $$ update public.capture set uri = 'x' where id = '99000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'capture update is rejected'
);
select throws_ok(
  $$ update public.asset set quality_score = 1 where id = '99000000-0000-4000-8000-000000000002' $$,
  'P0001', null,
  'asset update is rejected'
);
select throws_ok(
  $$ truncate public.measurement cascade $$,
  'P0001', null,
  'measurement truncate is rejected'
);

-- Content hash, lineage ------------------------------------------------------------

select throws_ok(
  $$ insert into public.asset (org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001', 'panorama', 'x', 'not-a-sha256', 'pipeline', '0.1.0') $$,
  '23514', null,
  'an asset without a valid SHA-256 content hash is rejected'
);
select throws_ok(
  $$ insert into public.asset (org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'e0000000-0000-4000-8000-000000000001', 'panorama', 'y', encode(sha256('asset-1'::bytea), 'hex'),
       'pipeline', '0.1.0') $$,
  '23505', null,
  'the same content hash cannot be registered twice in an org'
);
select lives_ok(
  $$ insert into public.asset_source (org_id, parcel_id, asset_id, source_capture_id)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       '99000000-0000-4000-8000-000000000002', '99000000-0000-4000-8000-000000000001') $$,
  'an asset can record the capture it was derived from'
);
select throws_ok(
  $$ insert into public.asset_source (org_id, parcel_id, asset_id)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       '99000000-0000-4000-8000-000000000002') $$,
  '23514', null,
  'a lineage row needs exactly one source'
);

-- Slots and trees ------------------------------------------------------------------

select throws_ok(
  $$ insert into public.slot (org_id, parcel_id, row_no, position_no)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 1, 1) $$,
  '23505', null,
  'slot code S1-1 is unique per parcel'
);
select is(
  (select kind::text from public.slot
   where parcel_id = 'c0000000-0000-4000-8000-000000000001' and code = 'S5-12a'),
  'interstitial',
  'interstitial slot code is the previous code plus a letter'
);
select throws_ok(
  $$ insert into public.slot (org_id, parcel_id, row_no, position_no, kind)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 30, 1, 'interstitial') $$,
  '23514', null,
  'an interstitial slot needs a suffix letter'
);
select throws_ok(
  $$ insert into public.tree (org_id, parcel_id, slot_id)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:slot:S1-1')::uuid) $$,
  '23505', null,
  'a slot holds at most one active tree'
);
select lives_ok(
  $$ insert into public.tree (org_id, parcel_id, slot_id, age_class)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-seed:slot:S2-7')::uuid, 'sapling') $$,
  'a new tree can be planted in an empty slot'
);

-- Tenant consistency ---------------------------------------------------------------

insert into public.org (id, name) values ('99000000-0000-4000-8000-0000000000aa', 'Other org');
select throws_ok(
  $$ insert into public.slot (org_id, parcel_id, row_no, position_no)
     values ('99000000-0000-4000-8000-0000000000aa', 'c0000000-0000-4000-8000-000000000001', 40, 1) $$,
  '23503', null,
  'a row cannot claim a different org than its parcel'
);

-- Boundary and parcel numbering ------------------------------------------------------

select throws_ok(
  $$ insert into public.boundary (org_id, parcel_id, version, geom, source)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 3,
       extensions.st_geomfromtext('POLYGON((37.45 37, 37.451 37.001, 37.451 37, 37.45 37.001, 37.45 37))', 4326),
       'field_survey') $$,
  '23514', null,
  'a self-intersecting boundary polygon is rejected'
);
select ok(
  (select area_m2 between 19000 and 20500 from public.boundary
   where parcel_id = 'c0000000-0000-4000-8000-000000000001' and version = 2),
  'boundary area is computed in square metres (~20 donum)'
);
select throws_ok(
  $$ update public.parcel set numbering_origin_corner = 'ne' where id = 'c0000000-0000-4000-8000-000000000001' $$,
  'P0001', null,
  'slot numbering origin cannot change once set'
);

select * from finish();
rollback;
