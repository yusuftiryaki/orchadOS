-- Review fixes of the legal follow-ups wave 2 (PR #97): deleting a user with
-- append-only records, staff profiles per org, the demo media mirror, final
-- KVKK request states, and the first-login notice without a parcel.
-- Seed: org b0..01, owner a0..01, viewer a0..02 of parcel c0..01, field a0..03,
-- expert a0..04, ops a0..05. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
create function pg_temp.user(p_id uuid, p_email text) returns void language sql
as $$
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, now(), now());
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Deleting a user who has append-only records ------------------------------------

select pg_temp.user('68000000-0000-4000-8000-000000000001', 'leaver-68@example.test');
insert into private.media_suppression (org_id, parcel_id, session_id, target_table, target_id, action, reason, created_by)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        gen_random_uuid(), 'asset', gen_random_uuid(), 'hide', 'other', '68000000-0000-4000-8000-000000000001');
insert into private.boundary_dispute (org_id, parcel_id, action, note, created_by)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'open', 'Komşu itirazı',
        '68000000-0000-4000-8000-000000000001');
insert into private.boundary_approval (org_id, parcel_id, boundary_id, user_id, text_version, declaration_sha256)
select b.org_id, b.parcel_id, b.id, '68000000-0000-4000-8000-000000000001', 'v1', repeat('a', 64)
from public.boundary b where b.parcel_id = 'c0000000-0000-4000-8000-000000000001' order by b.version limit 1;

select lives_ok($$ delete from auth.users where id = '68000000-0000-4000-8000-000000000001' $$,
  'a user with a media suppression, a boundary dispute and a boundary approval can be deleted');
select is((select count(*)::int from private.media_suppression where created_by is null and reason = 'other'), 1,
  'the suppression stays, unlinked');
select is((select count(*)::int from private.boundary_dispute where created_by is null and note = 'Komşu itirazı'), 1,
  'the dispute stays, unlinked');
select is((select count(*)::int from private.boundary_approval where user_id is null and text_version = 'v1'), 1,
  'the approval stays, unlinked');
select throws_ok($$ update private.boundary_dispute set note = 'x' where created_by is null $$, 'P0001', null,
  'other changes are still refused');

-- 2. Staff profiles per org -----------------------------------------------------------

insert into public.org (id, name, kind) values ('68100000-0000-4000-8000-000000000001', 'Başka kurum', 'other');
select pg_temp.user('68100000-0000-4000-8000-000000000002', 'ops-68@example.test');
insert into public.membership (org_id, user_id, role) values
  ('68100000-0000-4000-8000-000000000001', '68100000-0000-4000-8000-000000000002', 'ops'),
  -- Ops of the other org may add any uuid as a member of their own org.
  ('68100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'field_staff');
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('68000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-11-01 07:00:00+00');
update public.session set status = 'published', published_at = now(), published_by = 'a0000000-0000-4000-8000-000000000004'
where id = '68000000-0000-4000-8000-000000000010';

set local role authenticated;
select pg_temp.as_user('68100000-0000-4000-8000-000000000002');
select lives_ok($$ select public.ops_save_staff_profile('68100000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000004', 'Sahte Ad', 'Sahte Unvan') $$, 'ops of another org names the expert there');
select is((select full_name from public.ops_staff('68100000-0000-4000-8000-000000000001')
           where user_id = 'a0000000-0000-4000-8000-000000000004'), 'Sahte Ad', 'in that org');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.visit_approver('68000000-0000-4000-8000-000000000010'),
  '{"name": "Örnek Uzman", "title": "Ziraat Mühendisi"}'::jsonb, 'the visit''s org keeps its own profile on the report');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select full_name from public.ops_staff('b0000000-0000-4000-8000-000000000001')
           where user_id = 'a0000000-0000-4000-8000-000000000004'), 'Örnek Uzman', 'and in its staff list');

-- 3. Demo media: a public copy blocks hiding -------------------------------------------

reset role;
insert into public.org (id, name, kind) values ('68200000-0000-4000-8000-000000000001', 'pgTAP demo 68', 'other');
insert into public.parcel (id, org_id, name)
values ('68200000-0000-4000-8000-000000000002', '68200000-0000-4000-8000-000000000001', 'Demo 68');
select testing.register_demo_org('68200000-0000-4000-8000-000000000001',
  array['68200000-0000-4000-8000-000000000002']::uuid[], false, '{}');
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('68200000-0000-4000-8000-000000000003', '68200000-0000-4000-8000-000000000001',
        '68200000-0000-4000-8000-000000000002', 'periodic_scan', 'in_review', '2026-07-14 07:00:00+00');
insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
values ('68200000-0000-4000-8000-000000000004', '68200000-0000-4000-8000-000000000001',
        '68200000-0000-4000-8000-000000000002', '68200000-0000-4000-8000-000000000003', 'panorama',
        'storage://media/org/68200000-0000-4000-8000-000000000001/parcel/68200000-0000-4000-8000-000000000002/'
          || encode(sha256('d68'::bytea), 'hex'),
        encode(sha256('d68'::bytea), 'hex'), 'pipeline', '0.1.0');
insert into storage.objects (bucket_id, name) values
  ('demo-media', 'org/68200000-0000-4000-8000-000000000001/parcel/68200000-0000-4000-8000-000000000002/'
                 || encode(sha256('d68'::bytea), 'hex'));
insert into public.membership (org_id, user_id, role)
values ('68200000-0000-4000-8000-000000000001', '68100000-0000-4000-8000-000000000002', 'ops');

set local role authenticated;
select pg_temp.as_user('68100000-0000-4000-8000-000000000002');
select is(pg_temp.error_of($$ select public.ops_hide_media('68200000-0000-4000-8000-000000000004', 'kvkk_objection') $$),
  'P0001 demo_mirror_public', 'a demo file with a public copy cannot be hidden');
reset role;
select is((select count(*)::int from private.media_suppression where target_id = '68200000-0000-4000-8000-000000000004'), 0,
  'no record is left');
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'demo-media' and name like 'org/68200000-%';
set local role authenticated;
select pg_temp.as_user('68100000-0000-4000-8000-000000000002');
select lives_ok($$ select public.ops_hide_media('68200000-0000-4000-8000-000000000004', 'kvkk_objection') $$,
  'once the copy is gone, ops hides it');

-- 4. KVKK requests: settled is final ---------------------------------------------------

reset role;
insert into private.kvkk_request (id, org_id, subject_id, user_id, request_type, message, due_at)
values ('68300000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'access', 'Bilgi istiyorum.',
        now() + interval '30 days');
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.ops_set_kvkk_request_status('68300000-0000-4000-8000-000000000001', 'answered');
select is(pg_temp.error_of($$ select public.ops_set_kvkk_request_status('68300000-0000-4000-8000-000000000001', 'open') $$),
  '22023 invalid_input', 'an answered request cannot be reopened');
select is(pg_temp.error_of($$ select public.ops_set_kvkk_request_status('68300000-0000-4000-8000-000000000001', 'rejected') $$),
  '22023 invalid_input', 'nor rejected afterwards');
reset role;
select ok((select status = 'answered' and settled_at is not null from private.kvkk_request
           where id = '68300000-0000-4000-8000-000000000001'), 'status and settled_at stay');

-- 5. First-login notice for an ops-opened owner without a parcel ----------------------

select pg_temp.user('68400000-0000-4000-8000-000000000001', 'noparcel-68@example.test');
insert into private.owner_profile (org_id, user_id, full_name, phone)
values ('b0000000-0000-4000-8000-000000000001', '68400000-0000-4000-8000-000000000001', 'Parselsiz Sahip', '+905320000068');
set local role authenticated;
select pg_temp.as_user('68400000-0000-4000-8000-000000000001');
select is((public.portal_notice_status() ->> 'required')::boolean, true,
  'an owner profile without a parcel still owes the KVKK notice acknowledgement');

select * from finish();
rollback;
