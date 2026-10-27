-- Per-customer back office lookups (IP12-E fix-forward 20261031200000):
-- ops_customer and ops_customer_applications read one customer by user id,
-- whatever the size of the org. Security definer with an empty search_path,
-- closed to anon, ops only.
-- Seed: owner a0..01, field a0..03, expert a0..04, ops a0..05, customer a0..06.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
           where p.oid in ('public.ops_customer(uuid,uuid)'::regprocedure,
                           'public.ops_customer_applications(uuid,uuid)'::regprocedure)
             and p.prosecdef and p.proconfig @> array['search_path=""']
             and obj_description(p.oid, 'pg_proc') is not null),
  array['ops_customer(uuid,uuid)', 'ops_customer_applications(uuid,uuid)'],
  'both are security definer with an empty search_path and a comment');
select ok(not has_function_privilege('anon', 'public.ops_customer(uuid,uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.ops_customer_applications(uuid,uuid)', 'EXECUTE'),
  'anon executes neither');
select ok(has_function_privilege('authenticated', 'public.ops_customer(uuid,uuid)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.ops_customer_applications(uuid,uuid)', 'EXECUTE'),
  'signed-in users do');

-- A customer older than 1000 newer profiles and applications: the org-wide
-- lists cut it off, the lookups do not.
insert into auth.users (id, instance_id, aud, role, email)
select ('41000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dolgu-' || i || '@example.com'
from generate_series(1, 1000) i;
insert into private.owner_profile (org_id, user_id, full_name, contact_preference, created_at)
select 'b0000000-0000-4000-8000-000000000001', ('41000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'Dolgu ' || i, 'sms', now() + make_interval(secs => i)
from generate_series(1, 1000) i;
insert into public.service_application (org_id, customer_user_id, number, status, package_id, submitted_at)
select 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  'B-2026-41' || lpad(i::text, 4, '0'), 'submitted', '91200000-0000-4000-8000-000000000001',
  now() + make_interval(secs => i)
from generate_series(1, 1000) i;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select count(*)::integer from public.ops_customers('b0000000-0000-4000-8000-000000000001', null, 1000)
           where user_id = 'a0000000-0000-4000-8000-000000000006'), 0,
  'the org-wide customer list no longer reaches the seed customer');
select results_eq(
  $$ select full_name, signup_source, application_count, has_billing_profile
     from public.ops_customer('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') $$,
  $$ values ('Örnek Müşteri', 'self', 1, true) $$, 'ops_customer still finds it by user id');
select is((select count(*)::integer from public.ops_applications('b0000000-0000-4000-8000-000000000001', null, 1000)
           where customer_user_id = 'a0000000-0000-4000-8000-000000000006'), 0,
  'the org-wide application list no longer reaches its application');
select results_eq(
  $$ select number, status, customer_name, package_name, garden_count
     from public.ops_customer_applications('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') $$,
  $$ values ('B-2026-000001', 'submitted', 'Örnek Müşteri', 'Standart', 1) $$,
  'ops_customer_applications still lists it');
select is((select count(*)::integer
           from public.ops_customer('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003')), 0,
  'a user without a profile in the org has no row');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select * from public.ops_customer('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006') $$), 'forbidden', 'field staff cannot read a customer');
select is(pg_temp.error_of($$ select * from public.ops_customer_applications('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006') $$), 'forbidden', 'nor its applications');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select * from public.ops_customer('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006') $$), 'forbidden', 'nor can the customer read itself through it');
select is(pg_temp.error_of($$ select * from public.ops_customer_applications('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006') $$), 'forbidden', 'nor its applications');

select * from finish();
rollback;
