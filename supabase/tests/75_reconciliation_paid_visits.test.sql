-- 8A reconciliation with the per-visit payment plan
-- (20261105100600_reconciliation_paid_visits.sql; docs/hukuk/kararlar.md T06,
-- T28): only paid visits not done are missing; visits whose installment lapsed
-- are counted as unpaid. Seed: org b0..01, ops a0..05, package standart
-- (V = 4). Round prices (one visit 300 000 kuruş, no inventory fee). One
-- transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select testing.reset_to_seed();
select testing.use_round_prices();

create function pg_temp.as_user(p_id uuid) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.ops() returns void language sql
as $$ select pg_temp.as_user('a0000000-0000-4000-8000-000000000005') $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;
create temporary table tday on commit drop as select private.istanbul_today() as d;
create function pg_temp.today() returns date language sql stable as $$ select d from tday $$;
create temporary table ids (k text primary key, v uuid) on commit drop;
grant select, insert on tday, ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f7500000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c75-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 75-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

create function pg_temp.new_app(p_user uuid, p_areas numeric[], p_lon numeric) returns uuid language plpgsql
as $$
declare
  a uuid;
  i integer;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  for i in 1 .. cardinality(p_areas) loop
    perform public.customer_save_application_garden(a,
      jsonb_build_object('name', 'Bahçe ' || p_lon || '-' || i, 'declared_area_m2', p_areas[i],
        'lon', p_lon + i * 0.01, 'lat', 37.2),
      '{"authorization_basis": "title_holder", "entry_permission": true}');
  end loop;
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2)
  from public.application_garden x where x.application_id = a;
  return a;
end;
$$;

create function pg_temp.accept(p_user uuid, p_quote uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.as_user(p_user);
  return public.customer_accept_quote(p_quote,
    '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak", "early_performance": "mesafeli-v5-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid) returns uuid language plpgsql
as $$
begin
  -- One payment for the whole order (the old single-payment plan), as the
  -- removal tests of the payment plan (testing.use_single_installment).
  perform testing.use_single_installment(p_order);
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order),
    current_date, 'EFT-75-' || left(p_order::text, 8));
end;
$$;

-- Pays p_amount by transfer on the order's payment plan (open installments in order).
create function pg_temp.pay_plan(p_order uuid, p_amount bigint) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order, p_amount, current_date, 'EFT-75P-' || left(p_order::text, 8));
end;
$$;

-- An active order on its payment plan (4 × 300 000), p_paid paid, serving from today − 100.
create function pg_temp.plan_order(p_user uuid, p_lon numeric, p_paid bigint) returns uuid language plpgsql
as $$
declare
  o uuid;
begin
  o := pg_temp.accept(p_user, public.ops_issue_quote(pg_temp.new_app(p_user, array[20000], p_lon)));
  perform pg_temp.pay_plan(o, p_paid);
  perform testing.set_order_period(o, pg_temp.today() - 100, pg_temp.today() + 264);
  return o;
end;
$$;

-- An active order of one new application, serving from today + p_start_offset (one year).
create function pg_temp.new_order(p_user uuid, p_areas numeric[], p_lon numeric, p_start_offset integer default -100)
returns uuid language plpgsql
as $$
declare
  o uuid;
begin
  o := pg_temp.accept(p_user, public.ops_issue_quote(pg_temp.new_app(p_user, p_areas, p_lon)));
  perform pg_temp.pay(o);
  perform testing.set_order_period(o, pg_temp.today() + p_start_offset, pg_temp.today() + p_start_offset + 364);
  return o;
end;
$$;

create function pg_temp.parcel_of(p_order uuid, p_line integer default 1) returns uuid language sql stable
as $$ select parcel_id from public.service_order_item where order_id = p_order and line_no = p_line $$;
create function pg_temp.item_of(p_order uuid, p_line integer default 1) returns uuid language sql stable
as $$ select id from public.service_order_item where order_id = p_order and line_no = p_line $$;

create function pg_temp.visit(p_parcel uuid, p_kind public.session_kind, p_status public.session_status, p_day date)
returns uuid language sql
as $$
  insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at)
  select p.org_id, p.id, p_kind, p_status, p_day,
         case when p_status <> 'planned' then (p_day + interval '9 hours')::timestamp at time zone 'Europe/Istanbul' end
  from public.parcel p where p.id = p_parcel
  returning id;
$$;
grant execute on all functions in schema pg_temp to authenticated;


create function pg_temp.lapse(p_order uuid, p_seqs integer[]) returns void language sql
as $$
  update public.order_installment_item ii set cancelled_kurus = ii.amount_kurus - ii.paid_kurus
  from public.order_installment i
  where i.id = ii.installment_id and i.order_id = p_order and i.seq = any (p_seqs);
  update public.order_installment set cancelled_kurus = amount_kurus - paid_kurus, status = 'cancelled',
    cancelled_at = now(), cancel_reason = 'window_passed'
  where order_id = p_order and seq = any (p_seqs);
$$;

insert into ids values ('c2', pg_temp.new_customer(2)), ('c3', pg_temp.new_customer(3));

-- 3. 8A reconciliation counts paid visits only (T28) ----------------------------------

-- Two paid, two lapsed at window end, one visit done: one paid visit is missing.
insert into ids select 'o2', pg_temp.plan_order(pg_temp.id('c2'), 37.752, 600000);
reset role;
select pg_temp.lapse(pg_temp.id('o2'), array[3, 4]);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o2')), 'periodic_scan', 'published', pg_temp.today() - 60);
select is(private.reconcile_line(pg_temp.item_of(pg_temp.id('o2')), pg_temp.today() + 264, 'period_end'), 1,
  'a task for the paid visit not done');
select results_eq($$ select shortfall, visits_unpaid from private.visit_reconciliation where order_id = pg_temp.id('o2') $$,
  $$ values (1, 2) $$, 'the two lapsed visits are unpaid, not missing');
-- All unpaid visits lapsed, the paid one done: nothing to refund.
insert into ids select 'o3', pg_temp.plan_order(pg_temp.id('c3'), 37.753, 300000);
reset role;
select pg_temp.lapse(pg_temp.id('o3'), array[2, 3, 4]);
select pg_temp.visit(pg_temp.parcel_of(pg_temp.id('o3')), 'periodic_scan', 'published', pg_temp.today() - 60);
select is(private.reconcile_line(pg_temp.item_of(pg_temp.id('o3')), pg_temp.today() + 264, 'period_end'), 0,
  'no task when every visit not done was never paid');

select * from finish();
rollback;
