-- İP17 3D world (docs/3d-dunya.md): parcel readers read and sign the world
-- cloud of a published visit; the raw point cloud stays staff only.
-- Seed: org b0..01, owner a0..01 and viewer a0..02 of parcel c0..01,
-- field_staff a0..03, expert a0..04, ops a0..05. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixtures (as postgres): a published and an unpublished scan --------------------------

insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('79000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-11-01 07:00:00+00'),
       ('79000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-11-02 07:00:00+00');

insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, mime_type, pipeline,
                          pipeline_version, position, position_uncertainty_m, pose)
select ('79000000-0000-4000-8000-0000000000' || n)::uuid, 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', s::uuid, k::public.asset_kind, 'storage://media/w' || n,
       encode(sha256(('w79-' || n)::bytea), 'hex'), 'application/vnd.orchados.world-cloud', 'orchados-pipeline',
       '0.1.0', 'SRID=4326;POINT(37.38 37.07)', 0.1,
       '{"schema": "orchados.world_cloud/1", "point_count": 1000, "crs": "local_enu"}'::jsonb
from (values ('31', 'world_cloud', '79000000-0000-4000-8000-000000000010'),
             ('32', 'point_cloud', '79000000-0000-4000-8000-000000000010'),
             ('33', 'world_cloud', '79000000-0000-4000-8000-000000000011')) v(n, k, s);

create function pg_temp.signable(p_n text) returns boolean language sql
as $$
  select authz.parcel_reader_media_object('b0000000-0000-4000-8000-000000000001',
                                          'c0000000-0000-4000-8000-000000000001',
                                          encode(sha256(('w79-' || p_n)::bytea), 'hex'))
$$;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;

-- Owner --------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select set_eq($$ select id::text from public.asset where id::text like '79000000-%' $$,
  array['79000000-0000-4000-8000-000000000031'],
  'the owner reads the world cloud of the published visit only, never the raw point cloud');
select ok(pg_temp.signable('31'), 'the owner can sign the world cloud file of a published visit');
select ok(not pg_temp.signable('32'), 'but not the raw point cloud file');
select ok(not pg_temp.signable('33'), 'nor the world cloud of an unpublished visit');
select is_empty($$ select pose ->> 'gps_time_ns' from public.asset where kind = 'world_cloud' and pose ? 'gps_time_ns' $$,
  'the world cloud row carries no capture time');

-- Viewer -------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select set_eq($$ select id::text from public.asset where id::text like '79000000-%' $$,
  array['79000000-0000-4000-8000-000000000031'],
  'the viewer reads the same row');
select ok(pg_temp.signable('31'), 'and signs the same file');

-- Staff --------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select set_eq($$ select id::text from public.asset where id::text like '79000000-%' $$,
  array['79000000-0000-4000-8000-000000000031', '79000000-0000-4000-8000-000000000032',
        '79000000-0000-4000-8000-000000000033'],
  'the expert reads every cloud of the org');

-- Hiding (T20) ------------------------------------------------------------------------

reset role;
select results_eq($$ select kind from private.media_target('79000000-0000-4000-8000-000000000031') $$,
  array['world_cloud'], 'ops can hide a world cloud');
select is_empty($$ select kind from private.media_target('79000000-0000-4000-8000-000000000032') $$,
  'the raw point cloud is not a portal medium');

-- Another org's owner -------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '79000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'stranger-79@example.test', now(), now());
set local role authenticated;
select pg_temp.as_user('79000000-0000-4000-8000-000000000001');
select is_empty($$ select id from public.asset where id::text like '79000000-%' $$,
  'a stranger reads nothing');

select * from finish();
rollback;
