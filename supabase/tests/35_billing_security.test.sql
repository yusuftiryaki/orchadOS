-- Billing function security (IP12, docs/musteri-yonetimi.md §6.1, §6.8, §6.9):
-- grants of every IP12 function (anon only the two public ones, payment_*
-- only the service role), security definer with an empty search_path, ops
-- writes refusing the caller's own customer records, internal columns closed
-- to customers, and receipts for nobody else.
-- Seed: owner a0..01, field a0..03, ops a0..05, customer a0..06. Here the ops
-- user a0..05 is also a customer (own profile, application, order, payment)
-- and a0..01 gets the ops role to serve them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;
create temporary table ids (k text primary key, v uuid);
create function pg_temp.id(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;
grant select on ids to authenticated, anon;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Grants -----------------------------------------------------------------------------

create temporary table ip12_fn (sig text primary key, grantee text not null);
insert into ip12_fn values
  -- IP12-A1
  ('public.signup_register_attempt(text,text,text)', 'service_role'),
  ('public.signup_find_account(text,text)', 'service_role'),
  ('public.signup_prepare(uuid,text,text,text,text,jsonb,text)', 'service_role'),
  ('public.signup_complete(uuid,timestamptz)', 'service_role'),
  ('public.my_consents()', 'authenticated'),
  ('public.customer_set_consent(text,boolean,text)', 'authenticated'),
  ('public.my_billing_profile()', 'authenticated'),
  ('public.customer_save_billing_profile(jsonb)', 'authenticated'),
  ('public.customer_update_contact(text,text,text)', 'authenticated'),
  ('public.ops_billing_profile(uuid,uuid,boolean)', 'authenticated'),
  ('public.ops_customer_consents(uuid,uuid)', 'authenticated'),
  ('public.ops_billing_setting(uuid)', 'authenticated'),
  ('public.ops_save_billing_setting(uuid,jsonb)', 'authenticated'),
  ('public.ops_save_package(uuid,jsonb)', 'authenticated'),
  ('public.ops_create_price_list_draft(uuid,uuid)', 'authenticated'),
  ('public.ops_save_price_list_draft(uuid,date,integer,text,jsonb)', 'authenticated'),
  ('public.ops_publish_price_list(uuid)', 'authenticated'),
  ('public.ops_delete_price_list_draft(uuid)', 'authenticated'),
  ('public.customer_create_application(uuid)', 'authenticated'),
  ('public.customer_set_application_package(uuid,uuid,text)', 'authenticated'),
  ('public.customer_save_application_garden(uuid,jsonb,jsonb,uuid)', 'authenticated'),
  ('public.customer_remove_application_garden(uuid)', 'authenticated'),
  ('public.customer_application_garden_detail(uuid)', 'authenticated'),
  ('public.customer_submit_application(uuid)', 'authenticated'),
  ('public.customer_withdraw_application(uuid)', 'authenticated'),
  ('public.ops_applications(uuid,text,integer)', 'authenticated'),
  ('public.ops_application_garden_detail(uuid)', 'authenticated'),
  ('public.ops_verify_application_garden(uuid,numeric,jsonb,text)', 'authenticated'),
  ('public.ops_reject_application(uuid,text,text)', 'authenticated'),
  -- IP12-A2
  ('public.ops_notifications(integer,text)', 'authenticated'),
  ('public.public_package_prices()', 'anon'),
  ('public.price_preview(uuid,numeric[],boolean)', 'anon'),
  ('public.ops_preview_quote(uuid,integer)', 'authenticated'),
  ('public.ops_issue_quote(uuid,date,integer,integer,text,text)', 'authenticated'),
  ('public.ops_issue_parcel_quote(uuid,uuid,uuid,uuid[],boolean,date,uuid,integer,integer,text,text)', 'authenticated'),
  ('public.customer_accept_quote(uuid,jsonb)', 'authenticated'),
  ('public.customer_decline_quote(uuid,boolean,text)', 'authenticated'),
  ('public.customer_cancel_order(uuid)', 'authenticated'),
  ('public.customer_payment_instructions(uuid)', 'authenticated'),
  ('public.ops_cancel_order(uuid,text)', 'authenticated'),
  ('public.ops_extend_payment_due(uuid,date)', 'authenticated'),
  ('public.ops_terminate_order(uuid,text)', 'authenticated'),
  ('public.payment_begin(uuid,uuid,text,text)', 'service_role'),
  ('public.payment_attach_token(uuid,text,timestamp with time zone)', 'service_role'),
  ('public.payment_by_token(text)', 'service_role'),
  ('public.payment_record_event(text,text,text,uuid,uuid,boolean,integer,text,jsonb)', 'service_role'),
  ('public.payment_finalize(uuid,text,jsonb)', 'service_role'),
  ('public.payment_attempts_to_reconcile(integer)', 'service_role'),
  ('public.ops_record_manual_payment(uuid,bigint,date,text,text,uuid)', 'authenticated'),
  -- Payment plan (installments-v1)
  ('public.quote_installment_plan(uuid)', 'authenticated'),
  ('public.ops_order_installments(uuid)', 'authenticated'),
  ('public.ops_overdue_installments(uuid,integer,integer)', 'authenticated'),
  ('public.ops_allow_unpaid_visit(uuid,text)', 'authenticated'),
  ('public.ops_void_manual_payment(uuid,text)', 'authenticated'),
  ('public.ops_resolve_payment_review(uuid,boolean,text,text)', 'authenticated'),
  ('public.receipt_data(uuid)', 'authenticated'),
  ('public.ops_request_refund(uuid,bigint,text,text,uuid)', 'authenticated'),
  ('public.ops_can_process_refund(uuid)', 'authenticated'),
  ('public.ops_complete_manual_refund(uuid,text,date)', 'authenticated'),
  ('public.ops_cancel_refund(uuid,text)', 'authenticated'),
  ('public.ops_resolve_refund(uuid,boolean,text,text)', 'authenticated'),
  ('public.payment_refund_claim(uuid)', 'service_role'),
  ('public.payment_refund_report(uuid,text,text,text,text,boolean)', 'service_role'),
  ('public.ops_billing_summary(uuid)', 'authenticated'),
  ('public.ops_customers(uuid,text,integer)', 'authenticated'),
  ('public.ops_billing_internal(text,uuid)', 'authenticated'),
  ('public.ops_orders(uuid,text,uuid,integer)', 'authenticated'),
  ('public.ops_payments(uuid,text,uuid,integer)', 'authenticated'),
  ('public.ops_payment_events(uuid)', 'authenticated'),
  ('public.ops_refunds(uuid,text,uuid,integer)', 'authenticated'),
  ('public.ops_audit_events(uuid,text,uuid,text,integer)', 'authenticated');

select is((select count(*)::integer from ip12_fn where to_regprocedure(sig) is null), 0, 'every listed function exists');
select is((select array_agg(sig order by sig) from ip12_fn where has_function_privilege('anon', sig, 'EXECUTE')),
  array['public.price_preview(uuid,numeric[],boolean)', 'public.public_package_prices()'],
  'anon executes only public_package_prices and price_preview');
select is((select array_agg(sig order by sig) from ip12_fn
           where grantee = 'service_role' and (has_function_privilege('authenticated', sig, 'EXECUTE')
             or has_function_privilege('anon', sig, 'EXECUTE') or not has_function_privilege('service_role', sig, 'EXECUTE'))),
  null, 'payment_* and signup_* only for the service role');
select is((select array_agg(sig order by sig) from ip12_fn
           where grantee in ('authenticated', 'anon') and not has_function_privilege('authenticated', sig, 'EXECUTE')),
  null, 'customer, ops and public functions are executable by signed-in users');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'payment\_%'
             and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  null, 'no payment_* function at all is open to API users');
select is((select array_agg(f.sig order by f.sig) from ip12_fn f join pg_proc p on p.oid = to_regprocedure(f.sig)
           where not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false)),
  null, 'every IP12 function is security definer with an empty search_path');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'ops\_%' and not p.prosecdef
             and p.oid in (select to_regprocedure(sig) from ip12_fn)),
  null, 'every ops_* function is security definer');
select is((select count(*)::integer from pg_proc p
           where p.oid in (select to_regprocedure(sig) from ip12_fn)
             and obj_description(p.oid, 'pg_proc') is null), 0, 'every IP12 function has a comment');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
           where p.pronamespace = 'private'::regnamespace
             and p.proname in ('price_lines', 'activate_order', 'create_customer_parcel', 'open_system_refund',
               'enqueue_billing_notification', 'billing_housekeeping', 'dispatch_payment_reconcile',
               -- IP14
               'price_lines_v2', 'write_addon_quote', 'complete_garden_removal', 'open_removal_refunds',
               'removal_calculation', 'garden_removal_housekeeping', 'enqueue_garden_notification')
             and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  null, 'private helpers are closed to API users');

-- Setup: the ops user a0..05 as a customer, served by a second ops user a0..01 --

insert into public.membership (org_id, user_id, role)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'ops');
insert into private.owner_profile (org_id, user_id, full_name, phone, contact_preference, kvkk_consent, kvkk_consent_at,
  kvkk_text_version)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Ops Müşteri',
  '+905550000095', 'sms', true, now(), 'kvkk-v1-taslak');
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000005', 'kvkk_notice', true, 'kvkk-v1-taslak', 'ops');
insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'individual', 'Ops',
  'Müşteri', 'Örnek Sok. 5', 'Gaziantep');
insert into public.service_application (id, org_id, customer_user_id, number, status, package_id, submitted_at)
values ('f3500000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000005', 'B-2026-009901', 'submitted', '91200000-0000-4000-8000-000000000001', now());
insert into public.application_garden (id, org_id, application_id, customer_user_id, name, declared_area_m2, position,
  verified_area_m2, verified_at)
values ('f3500000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'f3500000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'Kendi Bahçem', 10000,
  extensions.st_setsrid(extensions.st_makepoint(37.6, 37.1), 4326), 10000, now());

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_issue_quote('f3500000-0000-4000-8000-000000000001') $$), 'forbidden',
  'ops cannot quote their own application');
select is(pg_temp.error_of($$ select public.ops_verify_application_garden('f3500000-0000-4000-8000-000000000002', 9000) $$),
  'forbidden', 'nor verify their own garden');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
insert into ids select 'q', public.ops_issue_quote('f3500000-0000-4000-8000-000000000001');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into ids select 'o', public.customer_accept_quote(pg_temp.id('q'),
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak"}');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
insert into ids select 'p', public.ops_record_manual_payment(pg_temp.id('o'), 1000, current_date, 'EFT-35-1');
insert into ids select 'r', (public.ops_request_refund(pg_temp.id('p'), 500, 'goodwill'))[1];

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_cancel_order(pg_temp.id('o')) $$), 'forbidden',
  'ops cannot cancel their own order');
select is(pg_temp.error_of($$ select public.ops_extend_payment_due(pg_temp.id('o'), current_date + 30) $$), 'forbidden',
  'nor move its due date');
select is(pg_temp.error_of($$ select public.ops_terminate_order(pg_temp.id('o'), 'x') $$), 'forbidden',
  'nor terminate it');
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o'), 1000, current_date, 'EFT-35-2') $$),
  'forbidden', 'nor record a transfer for it');
select is(pg_temp.error_of($$ select public.ops_void_manual_payment(pg_temp.id('p'), 'x') $$), 'forbidden',
  'nor void its transfer');
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p'), 100, 'goodwill') $$), 'forbidden',
  'nor refund it');
select is(pg_temp.error_of($$ select public.ops_complete_manual_refund(pg_temp.id('r'), 'EFT-I', current_date) $$),
  'forbidden', 'nor complete its refund');
select is(pg_temp.error_of($$ select public.ops_cancel_refund(pg_temp.id('r')) $$), 'forbidden',
  'nor cancel its refund');
select is(pg_temp.error_of($$ select public.ops_resolve_refund(pg_temp.id('r'), false) $$), 'forbidden',
  'nor resolve it');
select is(public.ops_can_process_refund(pg_temp.id('r')), false, 'nor have it processed');
select is(pg_temp.error_of($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000005', '91200000-0000-4000-8000-000000000001',
  array['c0000000-0000-4000-8000-000000000001']::uuid[], true, null) $$), 'forbidden',
  'nor quote parcels for themself');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.ops_can_process_refund(pg_temp.id('r')), true, 'another ops user may');

-- Non-ops callers ----------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select * from public.ops_billing_summary('b0000000-0000-4000-8000-000000000001') $$),
  'forbidden', 'a customer gets no ops summary');
select is(pg_temp.error_of($$ select * from public.ops_orders('b0000000-0000-4000-8000-000000000001') $$),
  'forbidden', 'nor the order list');
select is(pg_temp.error_of($$ select * from public.ops_customers('b0000000-0000-4000-8000-000000000001') $$),
  'forbidden', 'nor the customer list');
select is(pg_temp.error_of($$ select public.ops_cancel_order(pg_temp.id('o')) $$), 'not_found',
  'another customer''s order is not found');
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o'), 100, current_date, 'x') $$),
  'not_found', 'nor paid by them');
select is(pg_temp.error_of($$ select public.ops_billing_internal('order', pg_temp.id('o')) $$), 'not_found',
  'internal columns are not theirs to read');
select is(pg_temp.error_of($$ select public.ops_issue_quote('91200000-0000-4000-8000-000000000301') $$), 'not_found',
  'nor do they quote their own application');
select is(public.receipt_data(pg_temp.id('p')), null, 'another customer''s receipt is null');
select is((select count(*)::integer from public.customer_payment_instructions(pg_temp.id('o'))), 0,
  'nor their bank details for that order');
select is(pg_temp.error_of($$ select public.customer_cancel_order(pg_temp.id('o')) $$), 'not_found',
  'nor may they cancel it');
select throws_ok($$ select ops_note from public.service_application $$, '42501', null,
  'a customer selecting ops_note gets 42501');
select throws_ok($$ select provider_token from public.payment $$, '42501', null, 'nor the provider token');
select throws_ok($$ select note from public.refund $$, '42501', null, 'nor the refund''s internal note');
select throws_ok($$ select termination_note from public.service_order $$, '42501', null, 'nor the termination note');
select is(pg_temp.error_of($$ select public.payment_finalize(pg_temp.id('p'), 'succeeded', '{}') $$),
  'permission denied for function payment_finalize', 'payment_finalize is not for API users');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o'), 100, current_date, 'x') $$),
  'forbidden', 'field staff record no transfer');
select is(public.receipt_data(pg_temp.id('p')), null, 'and see no receipt');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select isnt(public.receipt_data(pg_temp.id('p')), null, 'the customer (here also ops) reads their own receipt');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.receipt_data(pg_temp.id('p')) ->> 'receipt_number',
  (select receipt_number from public.payment where id = pg_temp.id('p')), 'ops of the org reads it');
select is(public.ops_billing_internal('payment', pg_temp.id('p')) ->> 'has_provider_token', 'false',
  'ops reads internal columns without the provider token');
select is(public.ops_billing_internal('payment', pg_temp.id('p')) -> 'recorded_by' ->> 'id',
  'a0000000-0000-4000-8000-000000000001', 'users as {id, name}');
select is(pg_temp.error_of($$ select public.ops_billing_internal('parcel', pg_temp.id('p')) $$),
  'invalid_input / entity_type', 'unknown entity types are refused');
reset role;

set local role anon;
select is(pg_temp.error_of($$ select public.receipt_data(pg_temp.id('p')) $$),
  'permission denied for function receipt_data', 'anon reads no receipt');
select ok((select count(*) from public.public_package_prices()) > 0, 'anon reads the public prices');
select is((select sum(line_total_kurus)::bigint from public.price_preview('91200000-0000-4000-8000-000000000001',
  array[20000]::numeric[])), 2448000::bigint, 'and a preview');
select is(pg_temp.error_of($$ select * from public.price_preview('91200000-0000-4000-8000-0000000000ff', array[1000]::numeric[]) $$),
  'not_found', 'an unknown package is not found');
reset role;

select * from finish();
rollback;
