-- payment_begin without a usable buyer e-mail (IP12 integrated review,
-- finding 1; migration 20261101100000): the provider requires buyer.email, so
-- a phone-only customer is refused with billing_profile_incomplete / detail
-- 'email' before any attempt is written. Any one of the billing profile, the
-- owner profile or the account e-mail is enough, in that order.
-- Seed: ops a0..05, customer a0..06 (owner and billing profile), package
-- standart 9120..0001. The whole file is one transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
-- sqlstate, message and detail of the error p_sql raises, else null.
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || ' ' || coalesce(v_detail, '');
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
create function pg_temp.begin_card(p_order uuid) returns jsonb language sql
as $$ select public.payment_begin(p_order, 'a0000000-0000-4000-8000-000000000006', 'fake', 'http://127.0.0.1:3100') $$;
create temporary table ids (name text primary key, id uuid) on commit drop;
create function pg_temp.id(p_name text) returns uuid language sql stable
as $$ select id from ids where name = p_name $$;

insert into ids select 'o', pg_temp.new_order();

-- A phone-only customer: no e-mail anywhere ('' counts as none).
update auth.users set email = '' where id = 'a0000000-0000-4000-8000-000000000006';
update private.owner_profile set email = null where user_id = 'a0000000-0000-4000-8000-000000000006';
update private.billing_profile set email = null where user_id = 'a0000000-0000-4000-8000-000000000006';

select is(pg_temp.error_of($$ select pg_temp.begin_card(pg_temp.id('o')) $$),
  'P0001 billing_profile_incomplete email', 'no card attempt without a buyer e-mail');
select is((select count(*)::integer from public.payment where order_id = pg_temp.id('o')), 0,
  'and no payment row was written');

update auth.users set email = 'hesap@example.test' where id = 'a0000000-0000-4000-8000-000000000006';
select is(pg_temp.begin_card(pg_temp.id('o')) #>> '{buyer,email}', 'hesap@example.test',
  'the account e-mail is enough');

update private.owner_profile set email = 'iletisim@example.test' where user_id = 'a0000000-0000-4000-8000-000000000006';
select is(pg_temp.begin_card(pg_temp.id('o')) #>> '{buyer,email}', 'iletisim@example.test',
  'the contact e-mail comes before the account e-mail');

update private.billing_profile set email = 'fatura@example.test' where user_id = 'a0000000-0000-4000-8000-000000000006';
select is(pg_temp.begin_card(pg_temp.id('o')) #>> '{buyer,email}', 'fatura@example.test',
  'the billing e-mail comes first');

-- A null account e-mail as well; the refusal leaves the order as it was.
update auth.users set email = null where id = 'a0000000-0000-4000-8000-000000000006';
update private.owner_profile set email = null where user_id = 'a0000000-0000-4000-8000-000000000006';
update private.billing_profile set email = null where user_id = 'a0000000-0000-4000-8000-000000000006';
select is(pg_temp.error_of($$ select pg_temp.begin_card(pg_temp.id('o')) $$),
  'P0001 billing_profile_incomplete email', 'null e-mails are refused the same way');
select is((select status::text from public.service_order where id = pg_temp.id('o')), 'awaiting_payment',
  'the order still awaits payment');

select * from finish();
rollback;
