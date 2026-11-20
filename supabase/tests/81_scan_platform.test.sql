-- Scan platforms (20261120100000_scan_platform_atv): walk, atv and robot are
-- offered; motorcycle stays valid for older visits; anything else is rejected.
-- Seed: org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select testing.reset_to_seed();

create function pg_temp.visit(p_id uuid, p_platform text) returns void language sql
as $$
  insert into public.session (id, org_id, parcel_id, kind, status, scan_platform, camera_height_m)
  values (p_id, 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
          'periodic_scan', 'captured', p_platform, 2.0)
$$;

select lives_ok($$ select pg_temp.visit('98100000-0000-4000-8000-000000000001', 'walk') $$, 'walk');
select lives_ok($$ select pg_temp.visit('98100000-0000-4000-8000-000000000002', 'atv') $$, 'atv is new');
select lives_ok($$ select pg_temp.visit('98100000-0000-4000-8000-000000000003', 'robot') $$, 'robot');
select lives_ok($$ select pg_temp.visit('98100000-0000-4000-8000-000000000004', 'motorcycle') $$,
  'motorcycle stays valid for older visits');
select throws_ok($$ select pg_temp.visit('98100000-0000-4000-8000-000000000005', 'tractor') $$,
  '23514', null, 'an unknown platform is rejected');

select * from finish();
rollback;
