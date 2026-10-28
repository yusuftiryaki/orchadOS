-- Security of adding and removing gardens (IP14, docs/bahce-yonetimi.md
-- §9.5, §9.6, §9.10): function grants (anon none), security definer with an
-- empty search_path, closed private helpers, column grants of
-- garden_removal, row visibility, demo guards and drift, and no personal
-- data in audit details and message variables.
-- Seed: org b0..01, owner a0..01, viewer a0..02 of parcel c0..01, ops a0..05,
-- customer a0..06. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id uuid) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id uuid) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
create function pg_temp.ops() returns void language sql
as $$ select pg_temp.as_user('a0000000-0000-4000-8000-000000000005') $$;
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
grant select on ids to authenticated, anon;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Grants ------------------------------------------------------------------------------------

create temporary table ip14_fn (sig text primary key) on commit drop;
insert into ip14_fn values
  ('public.my_service_period()'),
  ('public.my_gardens()'),
  ('public.parcel_service_status(uuid)'),
  ('public.customer_addon_preview(numeric[])'),
  ('public.customer_withdraw_application_garden(uuid)'),
  ('public.customer_revise_order(uuid,text)'),
  ('public.customer_garden_removal_preview(uuid,boolean,boolean)'),
  ('public.customer_request_garden_removal(uuid,text,text,boolean,boolean)'),
  ('public.customer_cancel_garden_removal(uuid)'),
  ('public.ops_customer_service_period(uuid,uuid)'),
  ('public.ops_customer_gardens(uuid,uuid)'),
  ('public.ops_garden_overlaps(uuid)'),
  ('public.ops_link_application_garden_parcel(uuid,uuid)'),
  ('public.ops_withdraw_application_garden(uuid,text)'),
  ('public.ops_preview_addon_quote(uuid,uuid,uuid[],date,integer)'),
  ('public.ops_issue_addon_quote(uuid,uuid,uuid[],date,integer,integer,text,text)'),
  ('public.ops_garden_removals(uuid,text,integer)'),
  ('public.ops_garden_removal_preview(uuid,date)'),
  ('public.ops_request_garden_removal(uuid,text,date,text,integer,boolean)'),
  ('public.ops_schedule_garden_removal(uuid,date,text,integer,boolean)'),
  ('public.ops_cancel_garden_removal(uuid,text)'),
  ('public.ops_complete_garden_removal(uuid)'),
  -- Replaced or recreated by IP14.
  ('public.ops_orders(uuid,text,uuid,integer)'),
  ('public.ops_billing_summary(uuid)'),
  ('public.ops_terminate_order(uuid,text)'),
  ('public.ops_set_parcel_passive(uuid,boolean)'),
  ('public.ops_issue_quote(uuid,date,integer,integer,text,text)'),
  ('public.ops_issue_parcel_quote(uuid,uuid,uuid,uuid[],boolean,date,uuid,integer,integer,text,text)'),
  ('public.customer_accept_quote(uuid,jsonb)'),
  ('public.ops_extend_payment_due(uuid,date)'),
  ('public.ops_record_manual_payment(uuid,bigint,date,text,text)'),
  ('public.ops_verify_application_garden(uuid,numeric,jsonb,text)'),
  ('public.ops_preview_quote(uuid,integer)'),
  ('public.ops_billing_setting(uuid)'),
  ('public.ops_save_billing_setting(uuid,jsonb)');

select is((select array_agg(sig) from ip14_fn where to_regprocedure(sig) is null), null, 'every listed function exists');
select is((select array_agg(sig order by sig) from ip14_fn where has_function_privilege('anon', sig, 'EXECUTE')),
  null, 'anon executes none of them');
select is((select array_agg(sig order by sig) from ip14_fn where not has_function_privilege('authenticated', sig, 'EXECUTE')),
  null, 'signed-in users execute all of them (the functions check the role)');
select is((select array_agg(f.sig order by f.sig) from ip14_fn f join pg_proc p on p.oid = to_regprocedure(f.sig)
           where not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false)),
  null, 'all security definer with an empty search_path');
select is((select array_agg(f.sig order by f.sig) from ip14_fn f join pg_proc p on p.oid = to_regprocedure(f.sig)
           where obj_description(p.oid, 'pg_proc') is null), null, 'all have a comment');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
           where p.pronamespace = 'private'::regnamespace
             and p.proname in ('billing_setting', 'addon_visits', 'price_lines_v2', 'parcel_served_on', 'coverage_lines',
               'parcel_in_service', 'lock_parcel_coverage', 'lock_customer_gardens', 'account_garden_count',
               'addon_base_order', 'addon_last_day', 'withdrawal_until', 'renewal_due', 'billed_visits',
               'service_periods', 'customer_gardens', 'write_addon_quote', 'parcel_read_only', 'removal_calc',
               'removal_calculation', 'open_removal_refunds', 'complete_garden_removal', 'garden_removal_housekeeping',
               'enqueue_garden_notification', 'removal_access_scope', 'guard_parcel_read_only', 'guard_removal_visit')
             and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  null, 'private helpers are closed to API users');
select is((select count(*)::integer from pg_proc p where p.pronamespace = 'private'::regnamespace
           and p.proname in ('price_lines_v2', 'complete_garden_removal', 'removal_calculation', 'open_removal_refunds',
             'garden_removal_housekeeping', 'enqueue_garden_notification', 'parcel_read_only', 'addon_base_order',
             'renewal_due', 'parcel_in_service', 'parcel_served_on', 'account_garden_count', 'addon_visits')), 13,
  'the recommended private helpers exist');
select ok(not has_function_privilege('anon', 'authz.parcel_read_only(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'authz.parcel_read_only(uuid)', 'EXECUTE'),
  'authz.parcel_read_only: for guards running as the caller, not for anon');
select is((select count(*)::integer from cron.job where jobname = 'garden-removal-housekeeping' and schedule = '30 0 * * *'),
  1, 'the housekeeping runs daily at 00:30');

-- Table and column grants --------------------------------------------------------------------

select ok(not has_table_privilege('anon', 'public.garden_removal', 'SELECT')
      and not has_table_privilege('authenticated', 'public.garden_removal', 'INSERT')
      and not has_table_privilege('authenticated', 'public.garden_removal', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.garden_removal', 'DELETE'),
  'no API writes on garden_removal, no anon read');
select is(
  (select array_agg(c order by c) from unnest(array['ops_note', 'requested_by', 'decided_by', 'blocked_reason',
     'revoke_all_access']) c where has_column_privilege('authenticated', 'public.garden_removal', c, 'SELECT')),
  null, 'the internal columns are not granted');
select ok(has_column_privilege('authenticated', 'public.garden_removal', 'calculation', 'SELECT')
      and has_column_privilege('authenticated', 'public.service_order_item', 'removed_on', 'SELECT')
      and has_column_privilege('authenticated', 'public.quote', 'addon_of_order_id', 'SELECT')
      and has_column_privilege('authenticated', 'public.service_order', 'addon_of_order_id', 'SELECT')
      and has_column_privilege('authenticated', 'public.application_garden', 'withdrawn_at', 'SELECT')
      and has_column_privilege('authenticated', 'public.refund', 'garden_removal_id', 'SELECT'),
  'the new columns are granted');
select ok(exists (select 1 from pg_policies where tablename = 'garden_removal' and policyname = 'garden_removal_select'),
  'garden_removal_select');

-- A removal of the seed owner a0..01 on c0..01 (active order, ops removal) -------------------

insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'individual', 'Örnek', 'Sahip',
        'Gizli Mah. 5', 'Gaziantep');
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup');
select pg_temp.ops();
insert into ids select 'q', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001',
  array['c0000000-0000-4000-8000-000000000001'::uuid], true, null);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
insert into ids select 'o', public.customer_accept_quote(pg_temp.id('q'),
  '{"distance_sales": "mesafeli-v3-taslak", "pre_information": "onbilgi-v3-taslak"}');
select pg_temp.ops();
select public.ops_record_manual_payment(pg_temp.id('o'), (select total_kurus from public.service_order where id = pg_temp.id('o')),
  current_date, 'EFT-47');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
insert into ids select 'r', public.customer_request_garden_removal('c0000000-0000-4000-8000-000000000001', 'other',
  'Telefonum 05550000001, adım Örnek Sahip');
select pg_temp.ops();
select public.ops_schedule_garden_removal(pg_temp.id('r'), private.istanbul_today(), 'bugün, müşteri Örnek Sahip istedi');
select public.ops_complete_garden_removal(pg_temp.id('r'));

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.garden_removal), 1, 'the customer reads their removal');
select is(pg_temp.error_of($$ select ops_note from public.garden_removal $$),
  '42501 permission denied for table garden_removal', 'but not its internal note');
select is(pg_temp.error_of($$ select * from public.garden_removal $$),
  '42501 permission denied for table garden_removal', 'nor select *');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.garden_removal), 0, 'a viewer reads no removal');
select is((select count(*)::integer from public.my_gardens()) + (select count(*)::integer from public.my_service_period()),
  0, 'nor the payer''s gardens and period');
select is((select status from public.parcel_service_status('c0000000-0000-4000-8000-000000000001')), 'removed',
  'the viewer sees only the service state');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is((select count(*)::integer from public.garden_removal), 0, 'another customer reads nothing');
select is((select count(*)::integer from public.parcel_service_status('c0000000-0000-4000-8000-000000000001')), 0,
  'nor the state of a parcel they cannot see');
select pg_temp.ops();
select is((select count(*)::integer from public.garden_removal), 1, 'ops reads the org''s removals');
select is((select ops_note from public.ops_garden_removals('b0000000-0000-4000-8000-000000000001', 'all')
           where id = pg_temp.id('r')), 'bugün, müşteri Örnek Sahip istedi', 'ops reads the note through the function');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select * from public.ops_garden_removals('b0000000-0000-4000-8000-000000000001') $$),
  '42501 forbidden', 'a customer cannot call the ops functions');
reset role;

-- No personal data ---------------------------------------------------------------------------

select is((select count(*)::integer from public.audit_event
           where (entity_type = 'garden_removal' or action like 'order.%' or action like 'quote.%')
             and details::text ~* '(Örnek|0555|905550000001|Gizli Mah|example\.com)'), 0,
  'audit details carry no name, phone or address');
select is((select array_agg(distinct k order by k) from public.notification n, jsonb_object_keys(n.vars) k
           where n.template::text like 'garden\_%'), array['parcel_name', 'path', 'ref'],
  'garden messages carry the number, the path and the parcel name only');

-- Demo ---------------------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_change, phone_change,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'd1470000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'ziyaretci-47@demo.orchados.invalid', '', '', '', '{"demo": true}', '{"email_verified": true}', now(), now());
select pg_temp.as_demo('d1470000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.customer_request_garden_removal('c0000000-0000-4000-8000-000000000001', 'sold') $$),
  '42501 demo_read_only', 'a demo visitor requests no removal');
select is(pg_temp.error_of($$ select public.customer_cancel_garden_removal(pg_temp.id('r')) $$),
  '42501 demo_read_only', 'nor cancels one');
select is((select count(*)::integer from public.my_gardens()) + (select count(*)::integer from public.my_service_period()),
  0, 'the reads are empty for a demo visitor');
select pg_temp.ops();
select is(private.enqueue_garden_notification('garden_removal_completed', 'b0000000-0000-4000-8000-000000000001',
  'd1470000-0000-4000-8000-000000000001', gen_random_uuid(), 'C-2026-000999', '/portal', null), 0,
  'no message to a demo account');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.garden_removal'::regclass and tgname = 'zz_demo_read_only')
      and exists (select 1 from pg_trigger where tgrelid = 'public.garden_removal'::regclass
                  and tgname = 'demo_account_scope_customer_user_id'),
  'garden_removal carries the write guard and the account guard');
select is((select count(*)::integer from (select private.attach_demo_guards()) x), 0, 'nothing left to guard');
select is((select count(*)::integer from private.demo_guard_drift()), 0, 'demo_guard_drift() is empty');

select * from finish();
rollback;
