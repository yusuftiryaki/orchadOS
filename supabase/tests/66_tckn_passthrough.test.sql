-- T13 (H16): the TCKN is never stored in full. The billing profile cannot
-- hold one, payment_begin sends only the placeholder, the snapshot keeps the
-- last four digits, and no audit, outbox, notification or payment event row
-- carries a TCKN-shaped number. identity_number_required stays false by default.
-- Seed: customer a0..06 of org b0..01 with an application in review. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select testing.reset_to_seed();
select testing.use_round_prices();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create temporary table ids (k text primary key, v uuid) on commit drop;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
grant select, insert on ids to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

select is((private.billing_setting('ab000000-0000-4000-8000-0000000000ff')).identity_number_required, false,
  'identity_number_required is off by default');
select is((select count(*)::int from private.billing_profile where identity_number is not null), 0,
  'no billing profile holds a TCKN');
select throws_ok($$ update private.billing_profile set identity_number = '10000000146' $$, '23514', null,
  'a TCKN cannot be written into a profile');

update public.org_billing_setting set identity_number_required = true where org_id = 'b0000000-0000-4000-8000-000000000001';

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select lives_ok($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "Örnek",
  "last_name": "Müşteri", "address": "Adres 66", "city": "Gaziantep", "identity_number": "10000000146"}') $$,
  'the profile saves while a TCKN is required');
reset role;
select is((select identity_number from private.billing_profile where user_id = 'a0000000-0000-4000-8000-000000000006'),
  null, 'and the TCKN that came along is not stored');

-- An order to pay.
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.ops_verify_application_garden('91200000-0000-4000-8000-000000000401', 15000);
insert into ids select 'q', public.ops_issue_quote('91200000-0000-4000-8000-000000000301');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'o', public.customer_accept_quote(pg_temp.id('q'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
reset role;

create temporary table begun as
  select public.payment_begin(pg_temp.id('o'), 'a0000000-0000-4000-8000-000000000006', 'fake', 'http://127.0.0.1:3100') as b;
insert into ids select 'p', (b ->> 'payment_id')::uuid from begun;
select is((select b -> 'buyer' ->> 'identity_number' from begun), '11111111111', 'payment_begin sends the placeholder');
select is((select (b ->> 'identity_number_required')::boolean from begun), true, 'and says the TCKN is required');
select throws_ok($$ select public.payment_attach_token(pg_temp.id('p'), 'fake_66_token', now() + interval '30 minutes', '10000000146') $$,
  '22023', null, 'the full number is refused');
select lives_ok($$ select public.payment_attach_token(pg_temp.id('p'), 'fake_66_token', now() + interval '30 minutes', '0146') $$,
  'the last four digits come with the token');
select is((select identity_number_last4 from private.payment_billing_snapshot where payment_id = pg_temp.id('p')), '0146',
  'the snapshot keeps them only');

-- No TCKN-shaped value anywhere (11 digits, not starting with 0, not part of a longer
-- number). Hex letters count as part of the token: a random UUID's last group
-- holds 11 digits next to a letter in about 0.4% of UUIDs, and the web tests
-- leave hundreds of UUIDs in audit and outbox rows.
select is((select count(*)::int from public.audit_event
           where details::text ~ '(^|[^0-9a-fA-F])[1-9][0-9]{10}([^0-9a-fA-F]|$)'), 0,
  'no audit row carries a TCKN-shaped number');
select is((select count(*)::int from (
    select body as t from private.message_outbox
    union all select vars::text from public.notification
    union all select payload::text from private.payment_event) x
  where x.t ~ '(^|[^0-9a-fA-F])[1-9][0-9]{10}([^0-9a-fA-F]|$)'), 0,
  'no outbox, notification or payment event row carries one');

select * from finish();
rollback;
