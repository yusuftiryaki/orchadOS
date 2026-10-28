-- Demo write guard (20261101120100_demo_write_guard): every table carries
-- zz_demo_read_only, side-effect functions are allowlisted, and a demo
-- visitor's writes of docs/demo-turu.md §6.3 are refused while the seed owner
-- still writes.
-- Seed: owner a0..01, ops a0..05 of org b0..01, parcel c0..01, tree S1-1.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;
create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Ratchets ------------------------------------------------------------------------------

select is(
  (select coalesce(array_agg(c.oid::regclass::text order by c.oid::regclass::text), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relispartition
     and not exists (select 1 from pg_depend d
                     where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
     and c.oid <> 'private.demo_session'::regclass
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'zz_demo_read_only')),
  '{}'::text[],
  'every table in public and private has zz_demo_read_only (new tables: select private.attach_demo_guard(...))');
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')) > 60,
  'the ratchet sees the tables');
select hasnt_trigger('private', 'demo_session', 'zz_demo_read_only', 'demo_session is the one exception');
select is(
  (select (tgtype & 1) = 0 and (tgtype & 2) = 2 and (tgtype & 60) = 60 from pg_trigger
   where tgrelid = 'public.question'::regclass and tgname = 'zz_demo_read_only'),
  true, 'the guard is a BEFORE statement trigger on insert, update, delete and truncate');

-- Functions an API user can run that reach outside the database (pg_notify,
-- pg_net). Each entry was checked: on_question_activity is the question
-- trigger, which notifies ids only and cannot be reached by a visitor
-- (question writes are refused).
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private', 'authz', 'testing')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and (p.prosrc like '%pg_notify%' or p.prosrc like '%net.http\_%')
     and p.oid::regprocedure::text not in ('private.on_question_activity()')),
  '{}'::text[],
  'side-effect functions executable by authenticated are allowlisted');

-- Fixtures (as postgres) -----------------------------------------------------------------

insert into public.org (id, name, kind) values ('d1300000-0000-4000-8000-000000000011', 'pgTAP demo 43', 'other');
insert into public.parcel (id, org_id, name)
values ('d1310000-0000-4000-8000-000000000011', 'd1300000-0000-4000-8000-000000000011', 'Demo 43');
insert into private.demo_org (org_id, enabled, loaded_at) values ('d1300000-0000-4000-8000-000000000011', false, now());
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd13a0000-0000-4000-8000-000000000011', 'authenticated',
        'authenticated', 'ziyaretci-43@demo.orchados.invalid', '', '{"demo": true}', now(), now());
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by) values
  ('d1300000-0000-4000-8000-000000000011', 'd1310000-0000-4000-8000-000000000011',
   'd13a0000-0000-4000-8000-000000000011', 'owner', null);
insert into public.boundary (id, org_id, parcel_id, geom, source, version)
select 'd1340000-0000-4000-8000-000000000011', 'd1300000-0000-4000-8000-000000000011',
       'd1310000-0000-4000-8000-000000000011', geom, source, 1
from public.boundary where parcel_id = 'c0000000-0000-4000-8000-000000000001' limit 1;
insert into public.question (id, org_id, parcel_id, tree_id, body, author_role)
values ('d1350000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', pg_temp.tree('S1-1'), 'Seed question.', 'owner');

-- A demo visitor's writes -----------------------------------------------------------------

set local role authenticated;
select pg_temp.as_demo('d13a0000-0000-4000-8000-000000000011');

select throws_ok(
  $$ insert into public.question (parcel_id, tree_id, body)
     values ('d1310000-0000-4000-8000-000000000011', gen_random_uuid(), 'Demo soru') $$,
  '42501', 'demo_read_only', 'a visitor cannot ask a question');
select throws_ok(
  $$ insert into public.question_reply (question_id, body)
     values ('d1350000-0000-4000-8000-000000000011', 'Demo cevap') $$,
  '42501', 'demo_read_only', 'nor reply');
select throws_ok(
  $$ update public.question set body = 'x' where id = 'd1350000-0000-4000-8000-000000000011' $$,
  '42501', 'demo_read_only', 'nor edit a question');
select throws_ok(
  $$ insert into public.parcel_access (org_id, parcel_id, user_id, role)
     values ('d1300000-0000-4000-8000-000000000011', 'd1310000-0000-4000-8000-000000000011',
             'a0000000-0000-4000-8000-000000000002', 'viewer') $$,
  '42501', 'demo_read_only', 'nor add a co-owner');
select throws_ok(
  $$ delete from public.parcel_access where user_id = 'd13a0000-0000-4000-8000-000000000011' $$,
  '42501', 'demo_read_only', 'nor remove an access row');
select throws_ok(
  $$ select public.approve_boundary('d1340000-0000-4000-8000-000000000011') $$,
  '42501', 'demo_read_only', 'nor approve the boundary');
select throws_ok(
  $$ select public.owner_invite_viewer('d1310000-0000-4000-8000-000000000011', 'Hisse', '+905550043001') $$,
  '42501', 'demo_read_only', 'nor invite a co-owner');
select throws_ok(
  $$ select public.owner_cancel_viewer_invitation(gen_random_uuid()) $$,
  '42501', 'demo_read_only', 'nor withdraw an invitation');
select throws_ok(
  $$ select public.demo_start('d13a0000-0000-4000-8000-000000000011', 'h') $$,
  '42501', null, 'nor call the service role''s demo_start');

-- Every customer writer. A visitor has no customer profile (not_customer);
-- to show that the guard holds inside each function, the seed customer's own
-- rows are used under a demo claim (a visitor can never own such rows: see
-- 44_demo_account_lockdown).
select is(pg_temp.error_of($$ select public.customer_create_application(null) $$), 'not_customer',
  'a visitor is not a customer');
reset role;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql stable
as $$ select id from ids where name = p_name $$;
grant execute on function pg_temp.id(text) to authenticated;
do $$
declare
  a uuid;
  g uuid;
  q uuid;
begin
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
  -- Two quotes; one becomes an order.
  for i in 1..2 loop
    perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
    a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
    g := public.customer_save_application_garden(a,
      '{"name": "Demo 43 q", "declared_area_m2": 20000, "lon": 37.6, "lat": 37.1}',
      '{"authorization_basis": "title_holder", "entry_permission": true, "deed_block": "88", "access_note": "Kapı kuzeyde"}');
    perform public.customer_submit_application(a);
    perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
    perform public.ops_verify_application_garden(g, 20000);
    q := public.ops_issue_quote(a);
    insert into ids values ('quote' || i, q);
  end loop;
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
  insert into ids select 'order', public.customer_accept_quote(pg_temp.id('quote2'),
    '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
  -- A draft with a garden (last: create returns the open draft).
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  g := public.customer_save_application_garden(a,
    '{"name": "Demo 43", "declared_area_m2": 20000, "lon": 37.6, "lat": 37.1}',
    '{"authorization_basis": "title_holder", "entry_permission": true, "deed_block": "88", "access_note": "Kapı kuzeyde"}');
  insert into ids values ('draft', a), ('draft_garden', g);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
set local role authenticated;
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of(f), 'demo_read_only', 'refused under a demo claim: ' || substring(f from 'public\.(\w+)'))
-- (customer_create_application returns the open draft without writing.)
from unnest(array[
  $$ select public.customer_set_consent('explicit_marketing', false, 'acik-riza-v1') $$,
  $$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
       "last_name": "Müşteri", "address": "Yeni adres 2", "city": "Gaziantep", "identity_number": "10000000146"}') $$,
  $$ select public.customer_update_contact('Ad Soyad', null, 'sms') $$,
  $$ select public.customer_set_application_package(pg_temp.id('draft'), '91200000-0000-4000-8000-000000000002', null) $$,
  $$ select public.customer_save_application_garden(pg_temp.id('draft'),
       '{"name": "Yeni", "declared_area_m2": 10000, "lon": 37.6, "lat": 37.1}',
       '{"authorization_basis": "title_holder", "entry_permission": true}') $$,
  $$ select public.customer_remove_application_garden(pg_temp.id('draft_garden')) $$,
  $$ select public.customer_submit_application(pg_temp.id('draft')) $$,
  $$ select public.customer_withdraw_application('91200000-0000-4000-8000-000000000301') $$,
  $$ select public.customer_accept_quote(pg_temp.id('quote1'),
       '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}') $$,
  $$ select public.customer_decline_quote(pg_temp.id('quote1'), false, null) $$,
  $$ select public.customer_cancel_order(pg_temp.id('order')) $$
]) as f;
select pg_temp.as_demo('d13a0000-0000-4000-8000-000000000011');

-- The seed ops account with a demo claim: media_insert alone would allow it.
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
             || encode(sha256('demo-43'::bytea), 'hex')) $$,
  '42501', null, 'a demo request adds no media object (media_demo_no_insert)');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
             || encode(sha256('demo-43'::bytea), 'hex')) $$,
  'the same insert without the demo claim is allowed');

-- The seed owner still writes.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$ insert into public.question (parcel_id, tree_id, body)
            values ('c0000000-0000-4000-8000-000000000001', %L, 'Gerçek soru') $$, pg_temp.tree('S1-1')),
  'the seed owner can still ask a question');
select lives_ok(
  $$ update public.question set body = 'Gerçek soru, düzeltilmiş' where id = 'd1350000-0000-4000-8000-000000000011' $$,
  'and edit one');
select isa_ok(
  public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Hisse', '+905550043003'),
  'uuid', 'and invite a co-owner');
reset role;

-- Service role only (no demo_read_only expected: authenticated cannot call them).
select is(
  (select coalesce(array_agg(f order by f), '{}') from unnest(array[
     'public.payment_begin(uuid, uuid, text, text)', 'public.payment_attach_token(uuid, text, timestamptz)',
     'public.payment_finalize(uuid, text, jsonb)', 'public.payment_refund_claim(uuid)',
     'public.signup_prepare(uuid, text, text, text, text, jsonb, text)', 'public.signup_complete(uuid, timestamptz)',
     'public.signup_find_account(text, text)', 'public.demo_admit(text)', 'public.demo_start(uuid, text)']) f
   where has_function_privilege('authenticated', f, 'EXECUTE')),
  '{}'::text[], 'payment, sign-up and demo service functions are not executable by authenticated');

-- Guard helpers are not callable by API roles or PUBLIC ----------------------------------

select is(
  (select coalesce(array_agg(f order by f), '{}') from unnest(array[
     'private.deny_demo_write()', 'private.attach_demo_guard(regclass)',
     'private.attach_demo_guards()', 'private.demo_guard_drift()']) f
   where has_function_privilege('authenticated', f, 'EXECUTE')
      or has_function_privilege('anon', f, 'EXECUTE')
      or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = f::regprocedure and a.grantee = 0)),
  '{}'::text[], 'the guard helpers are revoked from PUBLIC, anon and authenticated');

-- Migration order (deploys run db push --include-all) ------------------------------------

-- A late-merged migration with an older timestamp creates an owner-writable
-- table after the one-time pass of 20261101120100.
create table public.zz_late_43 (id integer);
alter table public.zz_late_43 enable row level security;
create policy zz_late_43_all on public.zz_late_43 for all to authenticated using (true) with check (true);
grant select, insert on public.zz_late_43 to authenticated;

select results_eq($$ select * from private.demo_guard_drift() $$,
  $$ values ('table', 'public.zz_late_43', 'zz_demo_read_only missing') $$,
  'demo_guard_drift reports the unguarded table');
set local role authenticated;
select pg_temp.as_demo('d13a0000-0000-4000-8000-000000000011');
select lives_ok($$ insert into public.zz_late_43 values (1) $$, 'unguarded, a demo visitor could write it');
reset role;
select results_eq($$ select t::text from private.attach_demo_guards() t $$, $$ values ('zz_late_43') $$,
  'attach_demo_guards (run by every deploy after db push) guards it');
select is_empty($$ select * from private.demo_guard_drift() $$, 'and the drift check is clean again');
set local role authenticated;
select throws_ok($$ insert into public.zz_late_43 values (2) $$, '42501', 'demo_read_only',
  'the demo visitor''s write is refused');
reset role;
select is_empty($$ select * from private.attach_demo_guards() $$, 'attach_demo_guards is idempotent');

-- A late create or replace drops a demo filter; a dropped account guard.
create or replace function public.ops_find_user_id(p_org_id uuid, p_email text default null, p_phone text default null)
returns uuid language sql stable security definer set search_path = '' as $$ select null::uuid $$;
drop trigger demo_account_scope_user_id on public.membership;
select results_eq($$ select * from private.demo_guard_drift() $$,
  $$ values ('account_guard', 'public.membership.demo_account_scope_user_id', 'missing'),
            ('function', 'public.ops_find_user_id(uuid,text,text)',
             'demo filter missing: raw_app_meta_data ->> ''demo''') $$,
  'demo_guard_drift reports an overridden function without its demo filter and a lost account guard');

select * from finish();
rollback;
