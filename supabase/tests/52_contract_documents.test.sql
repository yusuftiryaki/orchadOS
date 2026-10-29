-- Contract documents data layer (docs/hukuk/kararlar.md H12, T04;
-- docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"): insert-only table,
-- service-role register, readers, the missing-documents reader, the private
-- bucket and its immutability trigger, contract_ready once per order, the
-- demo guards.
-- Seed: org b0..01, ops a0..05, package standart 9120..0001.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select testing.reset_to_seed();

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
create temporary table ids (k text primary key, v uuid) on commit drop;
grant select, insert on ids to authenticated, service_role;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f5200000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c52-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 52-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
  return v;
end;
$$;

-- An accepted order (awaiting payment) of one new garden.
create function pg_temp.new_order(p_user uuid, p_lon numeric, p_early boolean default false) returns uuid language plpgsql
as $$
declare
  a uuid;
  q uuid;
begin
  perform pg_temp.as_user(p_user);
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  perform public.customer_save_application_garden(a,
    jsonb_build_object('name', 'Bahçe ' || p_lon, 'declared_area_m2', 20000, 'lon', p_lon, 'lat', 37.2),
    '{"authorization_basis": "title_holder", "entry_permission": true}');
  perform public.customer_submit_application(a);
  perform pg_temp.ops();
  perform public.ops_verify_application_garden(x.id, x.declared_area_m2)
  from public.application_garden x where x.application_id = a;
  q := public.ops_issue_quote(a);
  perform pg_temp.as_user(p_user);
  return public.customer_accept_quote(q, jsonb_build_object('distance_sales', 'mesafeli-v5-taslak',
    'pre_information', 'onbilgi-v5-taslak')
    || case when p_early then '{"early_performance": "mesafeli-v5-taslak"}'::jsonb else '{}'::jsonb end);
end;
$$;

-- The object of a document as the Storage API writes it (postgres here).
create function pg_temp.upload(p_order uuid, p_kind text, p_size integer default 1234) returns text language sql
as $$
  insert into storage.objects (bucket_id, name, metadata)
  select 'contract-documents', o.org_id || '/' || o.id || '/' || p_kind || '.pdf',
         jsonb_build_object('size', p_size, 'mimetype', 'application/pdf')
  from public.service_order o where o.id = p_order
  returning name;
$$;
create function pg_temp.path(p_order uuid, p_kind text) returns text language sql stable
as $$ select o.org_id || '/' || o.id || '/' || p_kind || '.pdf' from public.service_order o where o.id = p_order $$;
create temporary table hashes on commit drop as
  select kind, sha256 from private.legal_text_version where is_current;
grant select on hashes to authenticated, service_role;
create function pg_temp.text_hash(p_kind text) returns text language sql stable
as $$ select sha256 from hashes where kind = p_kind $$;
create function pg_temp.register(p_order uuid, p_kind text, p_sha text default repeat('f', 64), p_size integer default 1234)
returns uuid language sql
as $$
  select public.service_register_contract_document(p_order, p_kind,
    case p_kind when 'pre_information' then 'onbilgi-v5-taslak' else 'mesafeli-v5-taslak' end,
    pg_temp.text_hash(case p_kind when 'pre_information' then 'pre_information' else 'distance_sales' end),
    pg_temp.path(p_order, p_kind), p_sha, p_size, 'web@test');
$$;

insert into ids values ('u1', pg_temp.new_customer(1)), ('u2', pg_temp.new_customer(2));
insert into ids select 'o1', pg_temp.new_order(pg_temp.id('u1'), 37.601, true);
insert into ids select 'o2', pg_temp.new_order(pg_temp.id('u2'), 37.611);
reset role;

-- Schema -----------------------------------------------------------------------------------

select ok((select relrowsecurity from pg_class where oid = 'private.contract_document'::regclass), 'RLS is on');
select ok(not has_table_privilege('authenticated', 'private.contract_document', 'select'), 'no client reads the table');
select ok((select not public from storage.buckets where id = 'contract-documents'), 'the bucket is private');
select ok(private.contract_documents_guarded(), 'the immutability trigger is on storage.objects');
select ok(exists (select 1 from pg_trigger where tgrelid = 'private.contract_document'::regclass and tgname = 'zz_demo_read_only'),
  'the demo write guard is attached');
select is((select count(*)::integer from private.demo_guard_drift()), 0, 'no demo guard drift');

-- Register (service role) ------------------------------------------------------------------

set local role authenticated;
select pg_temp.ops();
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'distance_sales',
  'mesafeli-v5-taslak', repeat('f', 64), 'x', repeat('f', 64), 1, 'web@test') $$, pg_temp.id('o1'))),
  '42501 permission denied for function service_register_contract_document', 'ops cannot register');
reset role;
set local role service_role;
select is(pg_temp.error_of(format($$ select pg_temp.register(%L, 'distance_sales') $$, pg_temp.id('o1'))),
  '22023 invalid_input / storage_path', 'the object must be uploaded first');
reset role;
select pg_temp.upload(pg_temp.id('o1'), 'distance_sales');
select pg_temp.upload(pg_temp.id('o1'), 'pre_information');
set local role service_role;
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'contract', 'mesafeli-v5-taslak',
  %L, %L, repeat('f', 64), 1234, 'web@test') $$, pg_temp.id('o1'), pg_temp.text_hash('distance_sales'),
  pg_temp.path(pg_temp.id('o1'), 'distance_sales'))), '22023 invalid_input / kind', 'only the three kinds');
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'distance_sales', 'mesafeli-v9',
  %L, %L, repeat('f', 64), 1234, 'web@test') $$, pg_temp.id('o1'), pg_temp.text_hash('distance_sales'),
  pg_temp.path(pg_temp.id('o1'), 'distance_sales'))), '22023 invalid_input / text_version', 'a registered version');
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'distance_sales', 'mesafeli-v5-taslak',
  %L, %L, repeat('f', 64), 1234, 'web@test') $$, pg_temp.id('o1'), repeat('0', 64),
  pg_temp.path(pg_temp.id('o1'), 'distance_sales'))), '22023 invalid_input / text_sha256', 'with its template hash');
select is(pg_temp.error_of(format($$ select public.service_register_contract_document(%L, 'distance_sales', 'mesafeli-v5-taslak',
  %L, 'x/y/distance_sales.pdf', repeat('f', 64), 1234, 'web@test') $$, pg_temp.id('o1'), pg_temp.text_hash('distance_sales'))),
  '22023 invalid_input / storage_path', 'the path is {org}/{order}/{kind}.pdf');
select is(pg_temp.error_of(format($$ select pg_temp.register(%L, 'distance_sales', repeat('f', 64), 999) $$, pg_temp.id('o1'))),
  '22023 invalid_input / size_bytes', 'the size matches the stored object');
select is(pg_temp.error_of(format($$ select pg_temp.register(%L, 'withdrawal_confirmation') $$, pg_temp.id('o1'))),
  'P0001 order_not_active', 'the withdrawal confirmation waits for the activation');
insert into ids select 'd1', pg_temp.register(pg_temp.id('o1'), 'distance_sales');
select is(pg_temp.register(pg_temp.id('o1'), 'distance_sales'), pg_temp.id('d1'), 'the same PDF again returns the row');
select is(pg_temp.error_of(format($$ select pg_temp.register(%L, 'distance_sales', repeat('a', 64)) $$, pg_temp.id('o1'))),
  '23505 exists', 'another PDF for the same kind is refused');
reset role;
select results_eq(
  $$ select kind, text_version, storage_path = pg_temp.path(pg_temp.id('o1'), 'distance_sales'), size_bytes,
            cardinality(consent_ids) from private.contract_document where id = pg_temp.id('d1') $$,
  $$ values ('distance_sales', 'mesafeli-v5-taslak', true, 1234::bigint, 2) $$,
  'the row links the distance_sales and early_performance consents');
select is((select count(*)::integer from public.notification where ref_id = pg_temp.id('o1') and template = 'contract_ready'), 0,
  'no message before both acceptance documents exist');
set local role service_role;
insert into ids select 'p1', pg_temp.register(pg_temp.id('o1'), 'pre_information');
reset role;
select results_eq(
  $$ select template::text, vars from public.notification where ref_id = pg_temp.id('o1') and template = 'contract_ready' $$,
  $$ select 'contract_ready', jsonb_build_object('ref', number, 'path', '/portal/hesap/sozlesmeler')
     from public.service_order where id = pg_temp.id('o1') $$,
  'contract_ready once both documents are registered (order number and the Sözleşmelerim path)');
select is((select cardinality(consent_ids) from private.contract_document where id = pg_temp.id('p1')), 1,
  'the pre-information document links its consent');

-- Insert-only and immutable objects --------------------------------------------------------

select throws_ok(format($$ update private.contract_document set sha256 = repeat('0', 64) where id = %L $$, pg_temp.id('d1')),
  'P0001', null, 'the table is insert-only');
select throws_ok(format($$ delete from private.contract_document where id = %L $$, pg_temp.id('d1')),
  'P0001', null, 'rows are never deleted');
select throws_ok(format($$ update storage.objects set metadata = '{}' where bucket_id = 'contract-documents' and name = %L $$,
  pg_temp.path(pg_temp.id('o1'), 'distance_sales')), '42501', 'contract_document_immutable', 'a stored PDF is never changed');
-- As the Storage API deletes (its own statement guard lets it through).
select set_config('storage.allow_delete_query', 'true', true);
select throws_ok(format($$ delete from storage.objects where bucket_id = 'contract-documents' and name = %L $$,
  pg_temp.path(pg_temp.id('o1'), 'distance_sales')), '42501', 'contract_document_immutable', 'nor deleted');
set local role service_role;
select throws_ok(format($$ delete from storage.objects where bucket_id = 'contract-documents' and name = %L $$,
  pg_temp.path(pg_temp.id('o1'), 'distance_sales')), '42501', 'contract_document_immutable',
  'not even by the service role (Storage API)');
reset role;
select lives_ok($$ update storage.objects set metadata = metadata where bucket_id = 'media' and false $$,
  'other buckets are untouched');

-- Readers ---------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select results_eq($$ select kind from public.my_contract_documents() order by kind $$,
  $$ values ('distance_sales'), ('pre_information') $$, 'the customer lists their documents');
select is((select count(*)::integer from storage.objects where bucket_id = 'contract-documents'), 2,
  'and reads their objects');
select pg_temp.as_user(pg_temp.id('u2'));
select is((select count(*)::integer from public.my_contract_documents()), 0, 'another customer sees none');
select is((select count(*)::integer from storage.objects where bucket_id = 'contract-documents'), 0,
  'nor their objects');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('contract-documents', 'x/y/z.pdf') $$,
  '42501', null, 'customers upload nothing');
select pg_temp.ops();
select is((select count(*)::integer from public.ops_contract_documents(pg_temp.id('o1'))), 2, 'ops reads an order''s documents');
select is((select count(*)::integer from storage.objects where bucket_id = 'contract-documents'), 2, 'and the objects');
select results_eq(
  $$ select order_id, missing from public.ops_orders_missing_contract_documents()
     where order_id in (pg_temp.id('o1'), pg_temp.id('o2')) order by order_number $$,
  $$ values (pg_temp.id('o2'), array['pre_information', 'distance_sales']) $$,
  'the missing-documents reader lists the order without documents');
-- Paid: o1 now needs its withdrawal confirmation.
reset role;
select testing.use_single_installment(pg_temp.id('o1'));
set local role authenticated;
select public.ops_record_manual_payment(pg_temp.id('o1'),
  (select total_kurus from public.service_order where id = pg_temp.id('o1')), current_date, 'EFT-52-1');
select results_eq(
  $$ select missing from public.ops_orders_missing_contract_documents() where order_id = pg_temp.id('o1') $$,
  $$ values (array['withdrawal_confirmation']) $$, 'an activated order needs its withdrawal confirmation');
select pg_temp.as_user(pg_temp.id('u1'));
select is((select count(*)::integer from public.ops_orders_missing_contract_documents()), 0,
  'a customer gets nothing from the ops reader');

-- Demo -------------------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id('u1'), 'role', 'authenticated',
  'app_metadata', json_build_object('demo', true))::text, true);
select is(pg_temp.error_of($$ select * from public.my_contract_documents() $$), '42501 demo_read_only',
  'a demo visitor reads no contract documents');
select is((select count(*)::integer from storage.objects where bucket_id = 'contract-documents'), 0,
  'nor their objects');
reset role;

select * from finish();
rollback;
