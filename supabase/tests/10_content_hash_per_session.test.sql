-- Content hash uniqueness: capture per session, asset per session + pipeline version.
-- Seed: org b0..01, parcel c0..01, session e0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.session (id, org_id, parcel_id, kind, status)
values ('97000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'captured');

create function pg_temp.capture(p_session uuid) returns void language sql
as $$
  insert into public.capture (org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', p_session,
          'gnss_raw', 'station://test/base.obs', encode(sha256('shared-base'::bytea), 'hex'),
          '2026-10-10 06:40:00+00')
$$;

create function pg_temp.asset(p_session uuid, p_version text) returns void language sql
as $$
  insert into public.asset (org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', p_session,
          'panorama', 'storage://media/x', encode(sha256('same-pano'::bytea), 'hex'), 'pipeline', p_version)
$$;

select lives_ok($$ select pg_temp.capture('e0000000-0000-4000-8000-000000000001') $$,
  'a raw file is registered for a session');
select lives_ok($$ select pg_temp.capture('97000000-0000-4000-8000-000000000001') $$,
  'the same raw file can be registered for another session (shared base station data)');
select throws_ok($$ select pg_temp.capture('97000000-0000-4000-8000-000000000001') $$,
  '23505', null, 'a raw file is registered at most once per session');

select lives_ok($$ select pg_temp.asset('97000000-0000-4000-8000-000000000001', '0.1.0') $$,
  'an asset is registered');
select lives_ok($$ select pg_temp.asset('97000000-0000-4000-8000-000000000001', '0.2.0') $$,
  'a new pipeline version adds a row for a byte-identical file');
select throws_ok($$ select pg_temp.asset('97000000-0000-4000-8000-000000000001', '0.1.0') $$,
  '23505', null, 'an asset is registered at most once per session and pipeline version');

select has_index('public', 'asset', 'asset_org_id_content_hash_idx', 'asset (org, hash) index for media reads');
select has_index('public', 'capture', 'capture_org_id_content_hash_idx', 'capture (org, hash) index for media reads');

select * from finish();
rollback;
