-- T20 (H01): ops hides a panorama, crop or close-up. Hidden media are
-- invisible to owners, viewers, demo visitors and experts (rows and files) and
-- visible to ops; records are append-only; lifting is a new record.
-- Seed: org b0..01, owner a0..01, viewer a0..02 of parcel c0..01, field a0..03,
-- expert a0..04, ops a0..05. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
create function pg_temp.obj(p text) returns text language sql immutable
as $$ select 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
             || encode(sha256(p::bytea), 'hex') $$;
grant execute on all functions in schema pg_temp to authenticated;

insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('63000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-11-01 07:00:00+00');
-- One frame (full + preview), a crop cut from the full panorama, another
-- frame, a close-up.
insert into public.asset (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, pipeline, pipeline_version,
                          position, position_uncertainty_m, pose)
select ('63000000-0000-4000-8000-0000000000' || n)::uuid, 'b0000000-0000-4000-8000-000000000001',
       'c0000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', k::public.asset_kind, t,
       'storage://media/' || pg_temp.obj('a63-' || n), encode(sha256(('a63-' || n)::bytea), 'hex'), 'pipeline', '0.1.0',
       'SRID=4326;POINT(37.38 37.07)', 0.1, p::jsonb
from (values
  ('11', 'panorama', null::uuid, '{"variant": "full", "gps_time_ns": "1449000000000000000"}'),
  ('12', 'panorama', null, '{"variant": "preview", "gps_time_ns": "1449000000000000000"}'),
  ('13', 'tree_crop', md5('orchados-seed:tree:S1-1')::uuid, '{"direction": "n", "panorama_asset_id": "63000000-0000-4000-8000-000000000011"}'),
  ('14', 'panorama', null, '{"variant": "full", "gps_time_ns": "1449000005000000000"}')) v(n, k, t, p);
insert into public.capture (id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, started_at)
values ('63000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'photo',
        md5('orchados-seed:tree:S1-1')::uuid, 'storage://media/' || pg_temp.obj('c63-21'),
        encode(sha256('c63-21'::bytea), 'hex'), '2026-11-01 07:10:00+00');
insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('a63-11')), ('media', pg_temp.obj('c63-21'));

select ok(not has_table_privilege('authenticated', 'private.media_suppression', 'SELECT'), 'API users do not read the records');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.asset where session_id = '63000000-0000-4000-8000-000000000001'), 4,
  'before hiding the owner sees the four assets');

-- Who may hide
select is(pg_temp.error_of($$ select public.ops_hide_media('63000000-0000-4000-8000-000000000011', 'kvkk_objection') $$),
  '42501 forbidden', 'the owner cannot hide');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.ops_hide_media('63000000-0000-4000-8000-000000000011', 'kvkk_objection') $$),
  '42501 forbidden', 'nor the expert');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_hide_media('63000000-0000-4000-8000-000000000011', 'nope') $$),
  '22023 invalid_input', 'the reason is checked');
select is(pg_temp.error_of($$ select public.ops_hide_media('63000000-0000-4000-8000-0000000000ff', 'other') $$),
  'P0002 not_found', 'an unknown id');
select lives_ok($$ select public.ops_hide_media('63000000-0000-4000-8000-000000000011', 'kvkk_objection', 'Komşu Ali Veli itiraz etti') $$,
  'ops hides a panorama');
select is(pg_temp.error_of($$ select public.ops_hide_media('63000000-0000-4000-8000-000000000011', 'other') $$),
  'P0001 already_hidden', 'twice is refused');
select lives_ok($$ select public.ops_hide_media('63000000-0000-4000-8000-000000000021', 'third_party') $$,
  'ops hides a close-up');
select is((select count(*)::int from public.asset where session_id = '63000000-0000-4000-8000-000000000001'), 4,
  'ops still sees every asset');
select is((select count(*)::int from public.ops_media_suppressions(null, '63000000-0000-4000-8000-000000000001') where hidden_now), 2,
  'ops lists the two hidden items');

-- Owners, viewers, experts
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select set_eq($$ select id from public.asset where session_id = '63000000-0000-4000-8000-000000000001' $$,
  array['63000000-0000-4000-8000-000000000014'::uuid], 'the owner loses the frame''s both variants and its crop');
select is_empty($$ select id from public.capture where id = '63000000-0000-4000-8000-000000000021' $$,
  'and the hidden close-up');
select is_empty(format($$ select name from storage.objects where name in (%L, %L) $$, pg_temp.obj('a63-11'), pg_temp.obj('c63-21')),
  'their files cannot be signed');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.asset where session_id = '63000000-0000-4000-8000-000000000001'), 1,
  'the viewer sees only the other frame');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.asset where session_id = '63000000-0000-4000-8000-000000000001'), 1,
  'the expert does not see hidden media either');
select is_empty(format($$ select name from storage.objects where name = %L $$, pg_temp.obj('a63-11')),
  'nor its file');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select count(*)::int from storage.objects where name in (pg_temp.obj('a63-11'), pg_temp.obj('c63-21'))), 2,
  'ops reads the hidden files');

-- Lifting is a new record
select lives_ok($$ select public.ops_unhide_media('63000000-0000-4000-8000-000000000011') $$, 'ops lifts the panorama''s suppression');
select is(pg_temp.error_of($$ select public.ops_unhide_media('63000000-0000-4000-8000-000000000011') $$),
  'P0001 not_hidden', 'lifting twice is refused');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.asset where session_id = '63000000-0000-4000-8000-000000000001'), 4,
  'the owner sees the frame again');

reset role;
select is((select count(*)::int from private.media_suppression where target_id = '63000000-0000-4000-8000-000000000011'), 2,
  'both records stay');
select throws_ok($$ delete from private.media_suppression $$, '42501', null, 'records cannot be deleted');
select is((select count(*)::int from public.audit_event where action like 'media_suppression.%' and details::text like '%Ali%'), 0,
  'the audit rows do not carry the note');

select * from finish();
rollback;
