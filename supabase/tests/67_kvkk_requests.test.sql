-- T11 (H26): portal KVKK applications with a 30-day deadline, the ops list
-- and audited status changes; behind kvkk_request_form_enabled (on in seed).
-- Seed: owner a0..01 and viewer a0..02 of parcel c0..01, customer a0..06,
-- ops a0..05 of org b0..01. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
create temporary table ids (k text primary key, v uuid) on commit drop;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
grant select, insert on ids to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(public.portal_kvkk_form_enabled(), true, 'a co-owner may file (switch on)');
select is(pg_temp.error_of($$ select public.portal_file_kvkk_request('nope', 'x') $$), '22023 invalid_input',
  'the type is checked');
select is(pg_temp.error_of($$ select public.portal_file_kvkk_request('erasure', '  ') $$), '22023 invalid_input',
  'a message is required');
insert into ids select 'r', public.portal_file_kvkk_request('erasure', 'Verilerimin silinmesini istiyorum.');
select results_eq($$ select request_type, status, (due_at - created_at) = interval '30 days' from public.my_kvkk_requests() $$,
  $$ values ('erasure', 'open', true) $$, 'filed with a 30-day deadline');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is_empty($$ select id from public.my_kvkk_requests() $$, 'another person does not see it');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select message from public.ops_kvkk_requests('b0000000-0000-4000-8000-000000000001') where id = pg_temp.id('r')),
  'Verilerimin silinmesini istiyorum.', 'ops reads the request');
select lives_ok($$ select public.ops_set_kvkk_request_status(pg_temp.id('r'), 'answered') $$, 'ops answers it');
select isnt((select settled_at from public.ops_kvkk_requests('b0000000-0000-4000-8000-000000000001') where id = pg_temp.id('r')),
  null, 'the settle time is recorded');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select public.ops_set_kvkk_request_status(pg_temp.id('r'), 'open') $$), '42501 forbidden',
  'the expert may not');

reset role;
update private.kvkk_request set created_at = now() - interval '31 days', due_at = now() - interval '1 day',
  status = 'open', settled_at = null where id = pg_temp.id('r');
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select overdue from public.ops_kvkk_requests('b0000000-0000-4000-8000-000000000001') where id = pg_temp.id('r')),
  true, 'past 30 days unanswered it is overdue');
reset role;
select is((select count(*)::int from public.audit_event where entity_type = 'kvkk_request' and details::text like '%silinmesini%'), 0,
  'audit rows carry no message');

-- Switch off: no form.
update public.org_billing_setting set kvkk_request_form_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(public.portal_kvkk_form_enabled(), false, 'switch off: no form');
select is(pg_temp.error_of($$ select public.portal_file_kvkk_request('access', 'x') $$), '42501 forbidden',
  'and no request');

select * from finish();
rollback;
