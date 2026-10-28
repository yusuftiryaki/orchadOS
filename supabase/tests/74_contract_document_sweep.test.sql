-- Automatic sweep of missing contract documents (docs/hukuk/kararlar.md H12;
-- T04; docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"): the dispatcher
-- is a no-op without its Vault secrets; with them it picks orders with a
-- snapshot, missing registrable documents and no manual-copy marker, stores a
-- short-lived ticket (its hash) and calls the route; the ticket header opens
-- the ticket's orders and their snapshots only, never another order, a PDF
-- or after expiry. The rendering and upload are tested by the web
-- integration test (contract-sweep).
-- Seed: org b0..01, ops a0..05. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
  v uuid := ('f7400000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c74-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 74-' || p_n, 'sms');
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
    '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak", "early_performance": "mesafeli-v4-taslak"}');
end;
$$;

create function pg_temp.pay(p_order uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.ops();
  return public.ops_record_manual_payment(p_order,
    (select total_kurus - (paid_kurus - refunded_kurus) from public.service_order where id = p_order),
    current_date, 'EFT-74-' || left(p_order::text, 8));
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

insert into ids values ('c1', pg_temp.new_customer(1)), ('c2', pg_temp.new_customer(2));
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('c1'), array[20000], 37.901);
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('c2'), array[20000], 37.911);
reset role;
-- Accepted an hour ago; o1 has a snapshot, o2 a snapshot and a manual-copy marker.
update public.service_order set created_at = now() - interval '1 hour' where id in (pg_temp.id('o1'), pg_temp.id('o2'));
insert into storage.objects (bucket_id, name, metadata)
select 'contract-documents', o.org_id || '/' || o.id || '/' || f, '{}'
from public.service_order o, unnest(array['acceptance-' || repeat('b', 64) || '.json', 'pre_information.pdf']) f
where o.id in (pg_temp.id('o1'), pg_temp.id('o2'));
insert into storage.objects (bucket_id, name, metadata)
select 'contract-documents', o.org_id || '/' || o.id || '/manual-copy.json', '{}'
from public.service_order o where o.id = pg_temp.id('o2');

select ok(pg_temp.id('o1') = any (private.contract_sweep_candidates(20)), 'an order with a snapshot and missing documents');
select ok(not pg_temp.id('o2') = any (private.contract_sweep_candidates(20)), 'not one waiting for a manual copy');
update public.service_order set created_at = now() where id = pg_temp.id('o1');
select ok(not pg_temp.id('o1') = any (private.contract_sweep_candidates(20)), 'not one accepted less than 15 minutes ago');
update public.service_order set created_at = now() - interval '1 hour' where id = pg_temp.id('o1');

-- Without Vault secrets: nothing.
delete from vault.secrets where name in ('contract_documents_sweep_url', 'orchados_cron_secret');
select is(private.dispatch_contract_document_sweep(), null::bigint, 'no Vault secrets: no call');
select is((select count(*)::integer from private.contract_sweep_ticket), 0, 'and no ticket');
select vault.create_secret('http://127.0.0.1:9/sistem/sozlesme-tarama', 'contract_documents_sweep_url');
select is(private.dispatch_contract_document_sweep(), null::bigint, 'the URL alone: no call');
select vault.create_secret('cron-test-74', 'orchados_cron_secret');
select isnt(private.dispatch_contract_document_sweep(), null::bigint, 'both secrets: one call');
select results_eq(
  $$ select pg_temp.id('o1') = any (order_ids), cardinality(order_ids) <= 5, expires_at <= now() + interval '10 minutes',
            token_sha256 ~ '^[0-9a-f]{64}$'
     from private.contract_sweep_ticket $$,
  $$ values (true, true, true, true) $$, 'a ticket of at most 5 orders for 10 minutes, its hash only');
select ok((select body::text from net.http_request_queue order by id desc limit 1) !~ (select token_sha256 from private.contract_sweep_ticket),
  'the call carries the token, not its stored hash');
select is((select count(*)::integer from cron.job where jobname = 'contract-document-sweep' and active), 1, 'the pg_cron job');

-- The ticket header opens only the ticket's orders.
create temporary table tk on commit drop as
  select 'aa' || repeat('0', 62) as token;
insert into private.contract_sweep_ticket (token_sha256, order_ids, expires_at)
select encode(extensions.digest(token, 'sha256'), 'hex'), array[pg_temp.id('o1')], now() + interval '10 minutes' from tk;
grant select on tk, ids, tday to anon;
grant execute on all functions in schema pg_temp to anon;
select set_config('request.headers', json_build_object('x-orchados-sweep-ticket', (select token from tk))::text, true);
set local role anon;
select is(public.contract_sweep_ticket_orders(), array[pg_temp.id('o1')], 'the ticket names its orders');
select results_eq(
  $$ select order_id, missing from public.sweep_contract_orders() $$,
  $$ values (pg_temp.id('o1'), array['pre_information', 'distance_sales', 'withdrawal_confirmation']) $$,
  'sweep_contract_orders: the order and its missing kinds');
select results_eq(
  $$ select storage.filename(name) from storage.objects where bucket_id = 'contract-documents' order by 1 $$,
  $$ values ('acceptance-' || repeat('b', 64) || '.json') $$,
  'storage: the snapshot of the ticket''s order only (no PDF, no other order)');
reset role;
select set_config('request.headers', json_build_object('x-orchados-sweep-ticket', repeat('c', 64))::text, true);
set local role anon;
select is(public.contract_sweep_ticket_orders(), '{}'::uuid[], 'an unknown ticket opens nothing');
select is((select count(*)::integer from storage.objects where bucket_id = 'contract-documents'), 0, 'nor any object');
reset role;
update private.contract_sweep_ticket set expires_at = now() - interval '1 second'
where token_sha256 = encode(extensions.digest((select token from tk), 'sha256'), 'hex');
select set_config('request.headers', json_build_object('x-orchados-sweep-ticket', (select token from tk))::text, true);
set local role anon;
select is(public.contract_sweep_ticket_orders(), '{}'::uuid[], 'an expired ticket opens nothing');
reset role;
select set_config('request.headers', '', true);

select * from finish();
rollback;
