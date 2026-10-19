-- Media bucket: object names, read and write rules.
-- Object name: org/<org_id>/parcel/<parcel_id>/<sha256> (docs/arayuzler.md, "Medya depolama").
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01, session e0..01 (in_review).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.org (id, name) values ('f1000000-0000-4000-8000-000000000005', 'Storage test org');
insert into public.parcel (id, org_id, name)
values ('f2000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000005', 'Storage test parcel');

-- A tree crop asset of the seed session and its file.
insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
values ('96000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'tree_crop',
        'storage://media/org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
          || encode(sha256('media-asset'::bytea), 'hex'),
        encode(sha256('media-asset'::bytea), 'hex'), 'pipeline', '0.1.0');
-- A close-up photo capture of the seed session and its file.
insert into public.capture (id, org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
values ('96000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'photo',
        'storage://media/org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
          || encode(sha256('media-capture'::bytea), 'hex'),
        encode(sha256('media-capture'::bytea), 'hex'), '2026-10-10 07:00:00+00');

insert into storage.objects (bucket_id, name)
select 'media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/' || h
from (values
  (encode(sha256('media-asset'::bytea), 'hex')),
  (encode(sha256('media-capture'::bytea), 'hex')),
  -- No asset or capture row: an orphan file, org members only.
  (encode(sha256('media-orphan'::bytea), 'hex'))
) as v (h);

create function pg_temp.obj(p_seed text) returns text language sql immutable
as $$ select 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
             || encode(sha256(p_seed::bytea), 'hex') $$;

-- Write: ops only, canonical names, own org and parcel -----------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000005", "role": "authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('ops-upload')) $$,
  'ops can add an object under org/<org>/parcel/<parcel>/<sha256>');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/photo.jpg') $$,
  '42501', null, 'ops cannot add an object whose file name is not a sha256');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/f2000000-0000-4000-8000-000000000005/'
       || encode(sha256('x'::bytea), 'hex')) $$,
  '42501', null, 'ops cannot add an object under a parcel of another org');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/f1000000-0000-4000-8000-000000000005/parcel/f2000000-0000-4000-8000-000000000005/'
       || encode(sha256('x'::bytea), 'hex')) $$,
  '42501', null, 'ops cannot add an object into another org');
select is_empty(
  $$ update storage.objects set metadata = '{"x": 1}' where bucket_id = 'media' returning id $$,
  'ops cannot change an object (media is immutable)');
select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')),
  0::bigint,
  'no API role may change or delete objects');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('field-upload')) $$,
  '42501', null, 'field staff cannot add objects (the pipeline uploads)');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('expert-upload')) $$,
  '42501', null, 'expert cannot add objects');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media', pg_temp.obj('owner-upload')) $$,
  '42501', null, 'owner cannot add objects');

-- Read -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000004", "role": "authenticated"}', true);
select results_eq($$ select count(*) from storage.objects where bucket_id = 'media' $$, array[4::bigint],
  'expert reads every media object of the org, orphans included');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is_empty($$ select name from storage.objects where bucket_id = 'media' $$,
  'owner reads no files of an unpublished session');

reset role;
update public.session set status = 'published' where id = 'e0000000-0000-4000-8000-000000000001';
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select set_eq($$ select name from storage.objects where bucket_id = 'media' $$,
  array[pg_temp.obj('media-asset'), pg_temp.obj('media-capture')],
  'after publication the owner reads the asset and capture files, not files without a row');

select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select results_eq($$ select count(*) from storage.objects where bucket_id = 'media' $$, array[2::bigint],
  'viewer reads the same files');

-- A row in the right org but under another parcel name does not open the file.
reset role;
insert into storage.objects (bucket_id, name)
values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/f2000000-0000-4000-8000-000000000005/'
  || encode(sha256('media-asset'::bytea), 'hex'));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is_empty(
  $$ select name from storage.objects where bucket_id = 'media' and name like '%f2000000-0000-4000-8000-000000000005%' $$,
  'a matching hash under another parcel path is not readable');
select lives_ok(
  $$ select name from storage.objects where bucket_id = 'media' and name = 'not/a/valid/path' $$,
  'odd object names do not make the read policy fail');

reset role;
set local role anon;
select is_empty($$ select name from storage.objects where bucket_id = 'media' $$, 'anon reads no media');

reset role;
select results_eq($$ select public from storage.buckets where id = 'media' $$, array[false], 'media bucket is private');

select * from finish();
rollback;
