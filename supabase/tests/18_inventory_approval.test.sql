-- Inventory approval: verification_item, create_verification_tour(),
-- record_verification_result(), close_verification_item(), approve_inventory(),
-- frozen slot coding after approval, owner boundary approval.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05
-- of org b0..01. Fixtures: parcel ad..01 with an inventory session ad..02 and
-- three slots (S1-1 and S1-2 with a tree, S1-3 empty); a field-survey boundary.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

-- Error message of a failing call (the reason the web app maps), with its detail.
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

-- Schema ---------------------------------------------------------------------------

select has_table('public', 'verification_item', 'verification_item exists');
select enum_has_labels('public', 'verification_status', array['open', 'checked', 'closed'], 'verification statuses');
select enum_has_labels('public', 'verification_reason',
  array['high_uncertainty', 'empty_slot', 'unsure', 'multi_stem', 'possible_sapling', 'off_row', 'triangulation', 'other'],
  'verification reasons');
select ok(has_table_privilege('authenticated', 'public.verification_item', 'SELECT')
  and not has_table_privilege('authenticated', 'public.verification_item', 'INSERT')
  and not has_table_privilege('authenticated', 'public.verification_item', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.verification_item', 'DELETE'),
  'API users only read verification items; writes go through functions');
select ok(not has_function_privilege('anon', 'public.approve_inventory(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_verification_tour(uuid, jsonb, date, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_verification_result(uuid, boolean, text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.close_verification_item(uuid, text)', 'EXECUTE'),
  'anon calls none of the functions');
select ok(has_function_privilege('authenticated', 'public.approve_inventory(uuid)', 'EXECUTE'),
  'authenticated can call approve_inventory');
select has_trigger('public', 'slot', 'slot_freeze_after_inventory_approval', 'slots freeze after approval');
select has_trigger('public', 'tree', 'tree_freeze_slot_after_inventory_approval', 'trees stay in their slot');

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.parcel (id, org_id, name, status)
values ('ad000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Onay testi', 'inventory_planned');
insert into public.parcel_access (org_id, parcel_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('b0000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002', 'viewer');
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('ad000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', 'inventory', 'processed', '2026-10-20 09:00:00+00');
insert into public.slot (id, org_id, parcel_id, row_no, position_no, position, position_uncertainty_m) values
  ('ad000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000001', 1, 1, 'SRID=4326;POINT(37.41 37.03)', 0.2),
  ('ad000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000001', 1, 2, 'SRID=4326;POINT(37.41 37.03005)', 0.8),
  ('ad000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000001', 1, 3, 'SRID=4326;POINT(37.41 37.0301)', 0.2);
insert into public.tree (id, org_id, parcel_id, slot_id, first_seen_session_id) values
  ('ad000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000011', 'ad000000-0000-4000-8000-000000000002'),
  ('ad000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000001',
   'ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000012', 'ad000000-0000-4000-8000-000000000002');
insert into public.boundary (id, org_id, parcel_id, version, geom, source, vertex_uncertainty_m, session_id)
values ('ad000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000001',
        'ad000000-0000-4000-8000-000000000001', 1,
        'SRID=4326;POLYGON((37.4099 37.0299, 37.4101 37.0299, 37.4101 37.0302, 37.4099 37.0302, 37.4099 37.0299))',
        'field_survey', 0.5, 'ad000000-0000-4000-8000-000000000002');

create temp table tour (session_id uuid);
grant all on tour to authenticated;

set local role authenticated;

-- Creating a tour -------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.create_verification_tour('ad000000-0000-4000-8000-000000000001',
  '[{"slot_id": "ad000000-0000-4000-8000-000000000012", "reasons": ["high_uncertainty"]}]') $$),
  'forbidden', 'an expert does not create a tour');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.create_verification_tour('ad000000-0000-4000-8000-000000000001',
  '[{"slot_id": "ad000000-0000-4000-8000-000000000012", "reasons": ["high_uncertainty"]}]') $$),
  'forbidden', 'an owner does not create a tour');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select public.create_verification_tour('ad000000-0000-4000-8000-000000000001', '[]') $$),
  'invalid_input | p_items must be a non-empty json array', 'an empty item list is refused');
select is(pg_temp.error_of($$ select public.create_verification_tour('ad000000-0000-4000-8000-000000000001',
  '[{"slot_id": "c2000000-0000-4000-8000-000000000001", "reasons": ["unsure"]}]') $$),
  'invalid_input | slot c2000000-0000-4000-8000-000000000001', 'a slot of another parcel is refused');
select is(pg_temp.error_of($$ select public.create_verification_tour('ad000000-0000-4000-8000-000000000001',
  '[{"slot_id": "ad000000-0000-4000-8000-000000000012", "reasons": ["bogus"]}]') $$),
  'invalid_input | malformed slot id or reason', 'an unknown reason is refused');
select is(pg_temp.error_of($$ select public.create_verification_tour('ad000000-0000-4000-8000-000000000001',
  '[{"slot_id": "ad000000-0000-4000-8000-000000000012", "reasons": ["unsure"]},
    {"slot_id": "ad000000-0000-4000-8000-000000000012", "reasons": ["empty_slot"]}]') $$),
  'invalid_input | slot S1-2 twice', 'a slot listed twice is refused');

insert into tour
select (public.create_verification_tour('ad000000-0000-4000-8000-000000000001',
  '[{"slot_id": "ad000000-0000-4000-8000-000000000012", "reasons": ["high_uncertainty", "unsure", "unsure"], "note": "iki gövde?"},
    {"slot_id": "ad000000-0000-4000-8000-000000000013", "reasons": ["empty_slot", "possible_sapling"]}]',
  '2026-10-25') ->> 'session_id')::uuid;

select is((select kind::text || '/' || status::text || '/' || planned_date::text from public.session
           where id = (select session_id from tour)),
  'verification/planned/2026-10-25', 'field staff opens a planned verification session');
select is((select count(*) from public.verification_item where session_id = (select session_id from tour)),
  2::bigint, 'with two items');
select is((select tree_id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000012'),
  'ad000000-0000-4000-8000-000000000022'::uuid, 'an item on a tree slot names the tree');
select is((select reasons from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000012'),
  array['high_uncertainty', 'unsure']::public.verification_reason[], 'reasons are kept once each');
select is((select tree_id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000013'),
  null, 'an item on an empty slot has no tree');
select is((select status from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000013'),
  'open'::public.verification_status, 'items start open');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*) from public.verification_item where parcel_id = 'ad000000-0000-4000-8000-000000000001'),
  2::bigint, 'an expert of the org reads the items');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.verification_item where parcel_id = 'ad000000-0000-4000-8000-000000000001'),
  0::bigint, 'the owner does not read the items');

-- Approval refused while items are open ---------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.approve_inventory('ad000000-0000-4000-8000-000000000002') $$),
  'inventory_incomplete | open_items: S1-2, S1-3', 'approval lists the open items');
select is(pg_temp.error_of($$ select public.approve_inventory((select session_id from tour)) $$),
  'session_invalid | session ' || (select session_id from tour) || ' is verification',
  'only an inventory session is approved');

-- Results ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
reset role;
select set_config('test.item', (select id::text from public.verification_item
  where slot_id = 'ad000000-0000-4000-8000-000000000012'), true);
set local role authenticated;
select is(pg_temp.error_of($$ select public.record_verification_result(current_setting('test.item')::uuid, true) $$),
  'not_found | item ' || current_setting('test.item'), 'an owner does not see an item to record');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.record_verification_result(
  (select id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000012'), true) $$),
  'forbidden', 'an expert does not record field results');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
-- S1-3 was empty: a sapling stands there.
select is((public.record_verification_result(
  (select id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000013'),
  true, 'fidan')).status, 'checked'::public.verification_status, 'field staff records a result');
select is((select count(*) from public.tree where slot_id = 'ad000000-0000-4000-8000-000000000013' and status = 'active'),
  1::bigint, 'a tree found on an empty slot is added');
select is((select first_seen_session_id from public.tree where slot_id = 'ad000000-0000-4000-8000-000000000013'),
  (select session_id from tour), 'first seen on the verification visit');
select is((select status from public.session where id = (select session_id from tour)),
  'planned'::public.session_status, 'the tour stays planned while an item is open');

select is(pg_temp.error_of($$ select public.close_verification_item(
  (select id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000012'), '  ') $$),
  'invalid_input | a note is required', 'closing needs a note');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((public.close_verification_item(
  (select id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000012'),
  'Panoramada tek gövde görülüyor.')).status, 'closed'::public.verification_status,
  'an expert closes an item without a field visit');
select is((select status from public.session where id = (select session_id from tour)),
  'captured'::public.session_status, 'the tour is captured once no item is open');
select is(pg_temp.error_of($$ select public.close_verification_item(
  (select id from public.verification_item where slot_id = 'ad000000-0000-4000-8000-000000000012'), 'tekrar') $$),
  'item_not_open', 'a closed item cannot be closed again');

-- Approval --------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select public.approve_inventory('ad000000-0000-4000-8000-000000000002') $$),
  'forbidden | session ad000000-0000-4000-8000-000000000002', 'field staff cannot approve');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.approve_inventory('ad000000-0000-4000-8000-000000000002') $$),
  'forbidden | session ad000000-0000-4000-8000-000000000002', 'ops cannot approve');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.approve_inventory('ad000000-0000-4000-8000-000000000002') $$),
  'forbidden | session ad000000-0000-4000-8000-000000000002', 'an owner cannot approve');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((public.approve_inventory('ad000000-0000-4000-8000-000000000002')).status,
  'published'::public.session_status, 'the expert approves once every item is looked at');
reset role;
select is((select published_by from public.session where id = 'ad000000-0000-4000-8000-000000000002'),
  'a0000000-0000-4000-8000-000000000004'::uuid, 'the signer is recorded');
select ok((select published_at is not null from public.session where id = 'ad000000-0000-4000-8000-000000000002'),
  'the signing time is recorded');
select is((select status from public.parcel where id = 'ad000000-0000-4000-8000-000000000001'),
  'inventory_done'::public.parcel_status, 'the parcel is inventory_done');
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.approve_inventory('ad000000-0000-4000-8000-000000000002') $$),
  'already_published', 'an approved inventory is not approved twice');

-- Frozen coding, editable attributes -----------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ update public.slot set position_no = 9 where id = 'ad000000-0000-4000-8000-000000000011' $$,
  'P0001', null, 'a slot code cannot change after approval');
select throws_ok($$ update public.slot set position = 'SRID=4326;POINT(37.4101 37.03)'
  where id = 'ad000000-0000-4000-8000-000000000011' $$,
  'P0001', null, 'a slot position cannot change after approval');
select throws_ok($$ delete from public.slot where id = 'ad000000-0000-4000-8000-000000000011' $$,
  'P0001', null, 'API users cannot delete a slot after approval');
select throws_ok($$ update public.tree set slot_id = 'ad000000-0000-4000-8000-000000000012'
  where id = 'ad000000-0000-4000-8000-000000000021' $$,
  'P0001', null, 'a tree cannot move to another slot after approval');
select lives_ok($$ update public.tree set age_class = 'productive', graft = 'grafted', sex = 'female'
  where id = 'ad000000-0000-4000-8000-000000000021' $$, 'tree attributes stay editable');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select lives_ok($$ update public.tree set age_class = 'old' where id = 'ad000000-0000-4000-8000-000000000021' $$,
  'the expert corrects a tree attribute after approval');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select lives_ok($$ insert into public.slot (org_id, parcel_id, row_no, position_no, suffix, kind, position, position_uncertainty_m)
  values ('b0000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000001', 1, 1, 'a', 'interstitial',
          'SRID=4326;POINT(37.41 37.03002)', 0.3) $$, 'a new slot may still be added');
-- Seed parcel: its inventory session is not published, slots stay editable.
select lives_ok($$ update public.slot set position_uncertainty_m = 0.06
  where code = 'S1-1' and parcel_id = 'c0000000-0000-4000-8000-000000000001' $$,
  'slots of a parcel without an approved inventory stay editable');

-- Owner boundary approval -----------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.error_of($$ select public.approve_boundary('ad000000-0000-4000-8000-000000000031') $$),
  'boundary ad000000-0000-4000-8000-000000000031 not found, already approved, or caller is not an owner of its parcel',
  'a viewer cannot approve the boundary');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((public.approve_boundary('ad000000-0000-4000-8000-000000000031')).owner_approved_by,
  'a0000000-0000-4000-8000-000000000001'::uuid, 'the owner approves the boundary');

select * from finish();
rollback;
