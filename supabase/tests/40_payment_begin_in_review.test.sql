-- payment_begin while a card attempt is in review (IP12-D review fix, PR #58
-- finding 1; migration 20261031100000): a pending_review attempt may already
-- have taken the money, so no new card attempt starts until ops settle it.
-- A mismatch in review (voided, never a success) and live initiated attempts
-- (superseded, §6.9) do not block.
-- Seed: ops a0..05, customer a0..06 (owner and billing profile), package
-- standart 9120..0001. The whole file is one transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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
-- An accepted order of the customer for one verified garden (20 dönüm).
create function pg_temp.new_order() returns uuid language plpgsql
as $$
declare
  a uuid;
  g uuid;
  q uuid;
  o uuid;
begin
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  g := public.customer_save_application_garden(a,
    jsonb_build_object('name', 'Test Bahçesi', 'declared_area_m2', 20000, 'lon', 37.6, 'lat', 37.1),
    '{"authorization_basis": "title_holder", "entry_permission": true, "deed_block": "88", "access_note": "Kapı kuzeyde"}');
  perform public.customer_submit_application(a);
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  perform public.ops_verify_application_garden(g, 20000);
  q := public.ops_issue_quote(a);
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
  o := public.customer_accept_quote(q, '{"distance_sales": "mesafeli-v3-taslak", "pre_information": "onbilgi-v3-taslak"}');
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  return o;
end;
$$;
create function pg_temp.begin_card(p_order uuid) returns uuid language sql
as $$ select (public.payment_begin(p_order, 'a0000000-0000-4000-8000-000000000006', 'fake', 'http://127.0.0.1:3100')
              ->> 'payment_id')::uuid $$;
create temporary table ids (name text primary key, id uuid) on commit drop;
create function pg_temp.id(p_name text) returns uuid language sql stable
as $$ select id from ids where name = p_name $$;

insert into ids select 'o', pg_temp.new_order();
insert into ids select 'p1', pg_temp.begin_card(pg_temp.id('o'));
insert into ids select 'p2', pg_temp.begin_card(pg_temp.id('o'));
select is((select status::text || '/' || failure_code from public.payment where id = pg_temp.id('p1')),
  'expired/superseded', 'a live initiated attempt is still superseded');

select is(public.payment_finalize(pg_temp.id('p2'), 'pending_review',
  jsonb_build_object('provider_payment_id', 'fake_pay_40', 'provider_amount_kurus', 1200000, 'paid_kurus', 1200000,
    'installment', 1, 'fraud_status', 0, 'failure_code', 'fraud_review', 'items', '[]'::jsonb)),
  'pending_review', 'the second attempt goes to fraud review');
select is((select status::text from public.service_order where id = pg_temp.id('o')), 'awaiting_payment',
  'the order still awaits payment');
select is(pg_temp.error_of($$ select pg_temp.begin_card(pg_temp.id('o')) $$), 'P0001 payment_in_progress',
  'no new card attempt while one is in review');
select is((select count(*)::integer from public.payment where order_id = pg_temp.id('o')), 2,
  'and no payment row was written');

select public.ops_resolve_payment_review(pg_temp.id('p2'), false, null);
select isnt(pg_temp.begin_card(pg_temp.id('o')), null, 'a rejected review frees the order for a new attempt');

-- A mismatch in review is on its way back through its void: no block.
insert into ids select 'o2', pg_temp.new_order();
insert into ids select 'p3', pg_temp.begin_card(pg_temp.id('o2'));
select is(public.payment_finalize(pg_temp.id('p3'), 'succeeded',
  jsonb_build_object('provider_payment_id', 'fake_pay_40_m', 'provider_amount_kurus', 1100000, 'paid_kurus', 1100000,
    'installment', 1, 'fraud_status', 1, 'items', '[]'::jsonb)),
  'pending_review', 'a success for another amount goes to review');
select isnt(pg_temp.begin_card(pg_temp.id('o2')), null, 'a mismatch in review does not block a new attempt');

select * from finish();
rollback;
