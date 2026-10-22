-- Questions (owner portal v0.2): question / question_reply, their author rules,
-- edit window and row level security.
-- Seed: owner a0..01 and viewer a0..02 of parcel c0..01 (org b0..01),
-- field_staff a0..03, expert a0..04, ops a0..05. Fixtures add a published
-- visit ab..31 with a finding, an unpublished visit ab..32 with a finding, and
-- a parcel ab..33 of a second org with a question nobody from the seed sees.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Schema ---------------------------------------------------------------------------

select has_table('public', 'question', 'question table exists');
select has_table('public', 'question_reply', 'question_reply table exists');
select ok(not has_table_privilege('anon', 'public.question', 'SELECT'), 'anon cannot read questions');
select ok(not has_table_privilege('authenticated', 'public.question', 'DELETE'), 'nobody deletes a question');
select ok(not has_table_privilege('authenticated', 'public.question_reply', 'DELETE'), 'nobody deletes a reply');
select ok(not has_column_privilege('authenticated', 'public.question', 'tree_id', 'UPDATE'),
  'the target of a question cannot be changed');
select ok(has_column_privilege('authenticated', 'public.question', 'body', 'UPDATE'),
  'the text of a question can be edited');

-- Fixtures (as postgres) -----------------------------------------------------------

insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values
  ('ab000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'published', '2026-11-01 07:00:00+00'),
  ('ab000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-11-20 07:00:00+00');
insert into public.finding (id, org_id, parcel_id, session_id, tree_id, kind, severity, description)
values
  ('ab000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000031', pg_temp.tree('S1-1'),
   'dead_branch', 'medium', 'Published finding.'),
  ('ab000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000032', pg_temp.tree('S1-1'),
   'dead_branch', 'medium', 'Finding under review.');

insert into public.org (id, name, kind) values ('ab000000-0000-4000-8000-000000000033', 'Other org', 'company');
insert into public.parcel (id, org_id, name)
values ('ab000000-0000-4000-8000-000000000034', 'ab000000-0000-4000-8000-000000000033', 'Other parcel');
insert into public.slot (id, org_id, parcel_id, row_no, position_no, position, position_uncertainty_m)
values ('ab000000-0000-4000-8000-000000000035', 'ab000000-0000-4000-8000-000000000033',
        'ab000000-0000-4000-8000-000000000034', 1, 1, 'SRID=4326;POINT(37.5 37.1)', 0.1);
insert into public.tree (id, org_id, parcel_id, slot_id)
values ('ab000000-0000-4000-8000-000000000036', 'ab000000-0000-4000-8000-000000000033',
        'ab000000-0000-4000-8000-000000000034', 'ab000000-0000-4000-8000-000000000035');
-- Trusted roles write the columns as given.
insert into public.question (id, org_id, parcel_id, tree_id, body, author_role)
values ('ab000000-0000-4000-8000-000000000037', 'ab000000-0000-4000-8000-000000000033',
        'ab000000-0000-4000-8000-000000000034', 'ab000000-0000-4000-8000-000000000036',
        'Question of another org.', 'owner');

-- Owner asks ------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');

select lives_ok(
  format($$ insert into public.question (id, parcel_id, tree_id, body)
     values ('ab000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000001', %L,
             'Bu ağacın dalları neden kuru?') $$, pg_temp.tree('S1-1')),
  'the owner asks about a tree');
select results_eq(
  $$ select org_id, author_role::text, created_by from public.question
     where id = 'ab000000-0000-4000-8000-000000000051' $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid, 'owner', 'a0000000-0000-4000-8000-000000000001'::uuid) $$,
  'org, author and role are filled in');
select lives_ok(
  $$ insert into public.question (parcel_id, finding_id, body)
     values ('c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000041', 'Ne yapmalıyım?') $$,
  'the owner asks about a published finding');
select throws_ok(
  $$ insert into public.question (parcel_id, finding_id, body)
     values ('c0000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000042', 'Görmemem gereken') $$,
  '42501', null, 'a finding of an unpublished visit cannot be asked about');
select throws_ok(
  $$ insert into public.question (parcel_id, body)
     values ('c0000000-0000-4000-8000-000000000001', 'Konusuz soru') $$,
  '23514', null, 'a question needs a tree or a finding');
select throws_ok(
  format($$ insert into public.question (parcel_id, tree_id, body)
     values ('c0000000-0000-4000-8000-000000000001', %L, '   ') $$, pg_temp.tree('S1-2')),
  '23514', null, 'an empty question is refused');
select throws_ok(
  $$ insert into public.question (parcel_id, tree_id, body)
     values ('ab000000-0000-4000-8000-000000000034', 'ab000000-0000-4000-8000-000000000036', 'Başkasının bahçesi') $$,
  '42501', null, 'the owner cannot ask on another parcel');
select results_eq(
  $$ select count(*) from public.question $$, array[2::bigint],
  'the owner sees only the questions of their parcel');

select lives_ok(
  $$ update public.question set body = 'Bu ağacın dalları neden kurudu?' where id = 'ab000000-0000-4000-8000-000000000051' $$,
  'the author edits the question within the window');
select isnt(
  (select edited_at from public.question where id = 'ab000000-0000-4000-8000-000000000051'), null,
  'the edit is recorded');
select throws_ok(
  $$ update public.question set tree_id = null where id = 'ab000000-0000-4000-8000-000000000051' $$,
  '42501', null, 'the target cannot be edited');
select throws_ok(
  $$ delete from public.question where id = 'ab000000-0000-4000-8000-000000000051' $$,
  '42501', null, 'a question cannot be deleted');

-- Viewer ------------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select results_eq(
  $$ select count(*) from public.question $$, array[2::bigint],
  'the viewer sees the questions of the parcel');
select lives_ok(
  format($$ insert into public.question (id, parcel_id, tree_id, body)
     values ('ab000000-0000-4000-8000-000000000052', 'c0000000-0000-4000-8000-000000000001', %L, 'Hissedar sorusu') $$,
    pg_temp.tree('S1-2')),
  'the viewer asks too');
select is((select author_role::text from public.question where id = 'ab000000-0000-4000-8000-000000000052'),
  'viewer', 'as viewer');
select results_eq(
  $$ with u as (update public.question set body = 'Değişti' where id = 'ab000000-0000-4000-8000-000000000051' returning 1)
     select count(*) from u $$,
  array[0::bigint], 'only the author edits a question');

-- Field staff sees nothing -------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is_empty($$ select id from public.question $$, 'field staff does not see questions');
select throws_ok(
  $$ insert into public.question_reply (question_id, body) values ('ab000000-0000-4000-8000-000000000051', 'Saha') $$,
  '42501', null, 'field staff cannot reply');

-- Expert answers ------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select results_eq(
  $$ select count(*) from public.question $$, array[3::bigint],
  'the expert sees every question of the org, not of other orgs');
select lives_ok(
  $$ insert into public.question_reply (id, question_id, body)
     values ('ab000000-0000-4000-8000-000000000061', 'ab000000-0000-4000-8000-000000000051', 'Kış budamasında alınmalı.') $$,
  'the expert answers');
select results_eq(
  $$ select org_id, parcel_id, author_role::text from public.question_reply
     where id = 'ab000000-0000-4000-8000-000000000061' $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid, 'expert') $$,
  'the reply takes the question''s scope and the expert role');
select throws_ok(
  $$ insert into public.question_reply (question_id, body) values ('ab000000-0000-4000-8000-000000000037', 'Yabancı') $$,
  '42501', null, 'the expert cannot reply in another org');
select results_eq(
  $$ with u as (update public.question set body = 'Uzman değiştirdi' where id = 'ab000000-0000-4000-8000-000000000051' returning 1)
     select count(*) from u $$,
  array[0::bigint], 'the expert cannot edit the owner''s question');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok(
  $$ insert into public.question_reply (question_id, body) values ('ab000000-0000-4000-8000-000000000052', 'Operasyon cevabı') $$,
  'ops can answer as well');
select is((select author_role::text from public.question_reply where question_id = 'ab000000-0000-4000-8000-000000000052'),
  'ops', 'as ops');

-- Owner reads the answer and follows up --------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select body from public.question_reply where question_id = 'ab000000-0000-4000-8000-000000000051' $$,
  array['Kış budamasında alınmalı.'], 'the owner reads the answer');
select lives_ok(
  $$ insert into public.question_reply (question_id, body) values ('ab000000-0000-4000-8000-000000000051', 'Teşekkürler') $$,
  'the owner follows up in the thread');
select results_eq(
  $$ with u as (update public.question_reply set body = 'x' where id = 'ab000000-0000-4000-8000-000000000061' returning 1)
     select count(*) from u $$,
  array[0::bigint], 'the owner cannot edit the expert''s answer');

-- Edit window ---------------------------------------------------------------------------

reset role;
update public.question set created_at = now() - interval '16 minutes'
where id = 'ab000000-0000-4000-8000-000000000051';
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.question set body = 'Geç düzeltme' where id = 'ab000000-0000-4000-8000-000000000051' $$,
  '55000', null, 'after 15 minutes the question cannot be edited');

-- Author columns cannot be forged.
select lives_ok(
  format($$ insert into public.question (id, parcel_id, tree_id, body, author_role, created_by)
     values ('ab000000-0000-4000-8000-000000000053', 'c0000000-0000-4000-8000-000000000001', %L, 'Sahte', 'expert',
             'a0000000-0000-4000-8000-000000000004') $$, pg_temp.tree('S1-3')),
  'a question with forged author columns is accepted');
select results_eq(
  $$ select author_role::text, created_by from public.question where id = 'ab000000-0000-4000-8000-000000000053' $$,
  $$ values ('owner', 'a0000000-0000-4000-8000-000000000001'::uuid) $$,
  '... but written with the real author');

select * from finish();
rollback;
