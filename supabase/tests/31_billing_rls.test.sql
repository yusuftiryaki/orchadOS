-- Billing access (IP12, docs/musteri-yonetimi.md §6.5, §6.8, §6.9, §7.4): who
-- reads which rows and columns, no writes through the API, function grants,
-- the account lookup after self sign-up, application transitions and the
-- catalog functions.
-- Seed: owner a0..01, viewer a0..02, field a0..03, expert a0..04, ops a0..05,
-- customer a0..06 with application 9120..0301 (garden 9120..0401). Fixtures: a
-- second customer a3100000..01 with a submitted application f31..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

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
  return sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;
create function pg_temp.n(p_sql text) returns bigint language plpgsql
as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
create function pg_temp.garden(p_name text) returns jsonb language sql immutable
as $$ select jsonb_build_object('name', p_name, 'declared_area_m2', 12000, 'lon', 37.6, 'lat', 37.1,
                                'irrigation', 'irrigated', 'estimated_tree_count', 150) $$;
create function pg_temp.detail() returns jsonb language sql immutable
as $$ select '{"authorization_basis": "title_holder", "entry_permission": true, "deed_block": "10",
               "site_contact_name": "Bekçi", "site_contact_phone": "+905551112233"}'::jsonb $$;
grant execute on all functions in schema pg_temp to authenticated, anon;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

-- Fixtures ------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, phone, phone_confirmed_at, raw_app_meta_data, created_at, updated_at)
values
  -- A second customer (completed self sign-up).
  ('00000000-0000-0000-0000-000000000000', 'a3100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'pgtap-customer2@example.test', '905559991001', now(), '{"signup": "self"}', now(), now()),
  -- An attacker's sign-up with the victim's e-mail and phone, phone never verified.
  ('00000000-0000-0000-0000-000000000000', 'a3100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'victim@example.test', '905559991002', null, '{"signup": "self"}', now(), now()),
  -- An account opened by ops without confirming its phone.
  ('00000000-0000-0000-0000-000000000000', 'a3100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'pgtap-unconfirmed@example.test', '905559991003', null, '{}', now(), now());
insert into private.owner_profile (org_id, user_id, full_name, phone, contact_preference, kvkk_consent, kvkk_consent_at, kvkk_text_version)
values ('b0000000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'İkinci Müşteri',
        '+905559991001', 'sms', true, now(), 'kvkk-v1');
insert into private.customer_signup (user_id, org_id, full_name, email, phone, contact_preference, consents, completed_at)
values ('a3100000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'İkinci Müşteri',
        'pgtap-customer2@example.test', '+905559991001', 'sms', '{}', now()),
       ('a3100000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Saldırgan',
        'victim@example.test', '+905559991002', 'sms', '{}', null);
insert into public.service_application (id, org_id, customer_user_id, number, status, package_id, submitted_at, ops_note)
values ('f3100000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'a3100000-0000-4000-8000-000000000001', 'B-2026-990001', 'submitted', '91200000-0000-4000-8000-000000000002',
        now(), 'iç not');
insert into public.application_garden (id, org_id, application_id, customer_user_id, name, declared_area_m2, position)
values ('f3100000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'f3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'İkinci bahçe', 8000,
        extensions.st_setsrid(extensions.st_makepoint(37.7, 37.05), 4326));
insert into private.application_garden_detail (application_garden_id, org_id, authorization_basis, entry_permission_at)
values ('f3100000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'title_holder', now());
-- An application of the ops user (self-dealing check).
insert into public.service_application (id, org_id, customer_user_id, number, status, package_id, submitted_at)
values ('f3100000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000005', 'B-2026-990002', 'submitted', '91200000-0000-4000-8000-000000000001', now());
insert into public.application_garden (id, org_id, application_id, customer_user_id, name, declared_area_m2, position)
values ('f3100000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
        'f3100000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', 'Ops bahçesi', 8000,
        extensions.st_setsrid(extensions.st_makepoint(37.7, 37.05), 4326));

-- Table privileges ---------------------------------------------------------------------

select is(
  (select array_agg(format('%s %s %s', r, t, p) order by r, t, p)
   from unnest(array['anon', 'authenticated']) r,
        unnest(array['org_billing_setting', 'service_package', 'price_list', 'price_list_item', 'service_application',
                     'application_garden', 'quote', 'quote_item', 'service_order', 'service_order_item', 'payment',
                     'payment_item', 'refund', 'audit_event']) t,
        unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where has_table_privilege(r, 'public.' || t, p)),
  null, 'anon and authenticated write none of the billing tables');
select is(
  (select array_agg(format('%s %s', t, r) order by t, r)
   from unnest(array['anon', 'authenticated']) r,
        unnest(array['org_billing_setting', 'service_package', 'price_list', 'price_list_item', 'service_application',
                     'application_garden', 'quote', 'quote_item', 'service_order', 'service_order_item', 'payment',
                     'payment_item', 'refund', 'audit_event']) t
   where r = 'anon' and has_any_column_privilege(r, 'public.' || t, 'SELECT')),
  null, 'anon reads none of them');
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT'))),
  null, 'private tables stay closed to API users');
select is(
  (select array_agg(format('%s.%s', t, c) order by t, c)
   from (values ('service_application', 'ops_note'), ('service_application', 'decided_by'),
                ('application_garden', 'verified_by'), ('application_garden', 'verification_note'),
                ('quote', 'issued_by'), ('quote', 'decided_by'), ('service_order', 'termination_note'),
                ('payment', 'provider_token'), ('payment', 'return_origin'), ('payment', 'recorded_by'),
                ('payment', 'manual_note'), ('refund', 'note'), ('refund', 'requested_by'),
                -- IP14 (docs/bahce-yonetimi.md §9.5)
                ('garden_removal', 'ops_note'), ('garden_removal', 'requested_by'),
                ('garden_removal', 'decided_by'), ('garden_removal', 'blocked_reason'),
                ('garden_removal', 'revoke_all_access')) x(t, c)
   where has_column_privilege('authenticated', 'public.' || t, c, 'SELECT')),
  null, 'no internal column is granted');

-- Function privileges ---------------------------------------------------------------

select is(
  (select array_agg(f order by f) from unnest(array[
     'signup_register_attempt(text,text,text)', 'signup_find_account(text,text)',
     'signup_prepare(uuid,text,text,text,text,jsonb,text)', 'signup_complete(uuid,timestamptz)',
     'my_consents()', 'customer_set_consent(text,boolean,text)', 'my_billing_profile()',
     'customer_save_billing_profile(jsonb)', 'customer_update_contact(text,text,text)',
     'ops_billing_profile(uuid,uuid,boolean)', 'ops_customer_consents(uuid,uuid)',
     'ops_billing_setting(uuid)', 'ops_save_billing_setting(uuid,jsonb)', 'ops_save_package(uuid,jsonb)',
     'ops_create_price_list_draft(uuid,uuid)', 'ops_save_price_list_draft(uuid,date,integer,text,jsonb)',
     'ops_publish_price_list(uuid)', 'ops_delete_price_list_draft(uuid)',
     'customer_create_application(uuid)', 'customer_set_application_package(uuid,uuid,text)',
     'customer_save_application_garden(uuid,jsonb,jsonb,uuid)', 'customer_remove_application_garden(uuid)',
     'customer_application_garden_detail(uuid)', 'customer_submit_application(uuid)',
     'customer_withdraw_application(uuid)', 'ops_applications(uuid,text,integer)',
     'ops_application_garden_detail(uuid)', 'ops_verify_application_garden(uuid,numeric,jsonb,text)',
     'ops_reject_application(uuid,text,text)', 'ops_find_user_id(uuid,text,text)',
     'ops_create_owner_profile(uuid,uuid,text,text,boolean,text,text,timestamptz,text)',
     'ops_update_owner_profile(uuid,text,text,boolean,text,text,timestamptz,text)',
     -- IP14 (docs/bahce-yonetimi.md §9.6); the full list is in 47_garden_security.
     'my_service_period()', 'my_gardens()', 'customer_request_garden_removal(uuid,text,text,boolean,boolean)',
     'ops_issue_addon_quote(uuid,uuid,uuid[],date,integer,integer,text,text,jsonb)'
   ]) f where has_function_privilege('anon', 'public.' || f, 'EXECUTE')),
  null, 'anon executes none of the IP12 functions of A1 (nor the IP14 ones)');
select is(
  (select array_agg(f order by f) from unnest(array[
     'signup_register_attempt(text,text,text)', 'signup_find_account(text,text)',
     'signup_prepare(uuid,text,text,text,text,jsonb,text)', 'signup_complete(uuid,timestamptz)'
   ]) f where has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
          or not has_function_privilege('service_role', 'public.' || f, 'EXECUTE')),
  null, 'signup_* is for the service role only');
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace
     and (proname like 'customer\_%' or proname like 'my\_%' or proname like 'signup\_%' or proname like 'ops\_%')
     and (not prosecdef or not coalesce('search_path=""' = any (proconfig), false))),
  null, 'customer_*, my_*, signup_* and ops_* are security definer with an empty search_path');
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where pronamespace = 'public'::regnamespace
     and (proname like 'customer\_%' or proname like 'signup\_%' or proname in ('my_consents', 'my_billing_profile'))
     and obj_description(oid, 'pg_proc') is null),
  null, 'every new function has a comment');

-- Row visibility --------------------------------------------------------------------

set local role authenticated;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.n($$ select count(*) from public.service_application $$), 1::bigint,
  'the customer sees their own application only');
select is(pg_temp.n($$ select count(*) from public.application_garden $$), 1::bigint, 'and its garden');
select is(pg_temp.n($$ select count(*) from public.service_package $$)
          + pg_temp.n($$ select count(*) from public.price_list $$)
          + pg_temp.n($$ select count(*) from public.org_billing_setting $$)
          + pg_temp.n($$ select count(*) from public.audit_event $$), 0::bigint,
  'no settings, packages, price lists or audit rows for customers');
select results_eq(
  $$ select number, status::text from public.service_application $$,
  $$ values ('B-2026-000001', 'submitted') $$, 'with the granted columns');
select is(pg_temp.error_of($$ select ops_note from public.service_application $$),
  '42501 permission denied for table service_application', 'selecting ops_note is refused');
select is(pg_temp.error_of($$ select * from public.service_application $$),
  '42501 permission denied for table service_application', 'and so is select *');
select throws_ok($$ select verification_note from public.application_garden $$, '42501', null, 'verification_note');
select throws_ok($$ select issued_by from public.quote $$, '42501', null, 'quote.issued_by');
select throws_ok($$ select termination_note from public.service_order $$, '42501', null, 'termination_note');
select throws_ok($$ select provider_token from public.payment $$, '42501', null, 'provider_token');
select throws_ok($$ select manual_note from public.payment $$, '42501', null, 'manual_note');
select throws_ok($$ select note from public.refund $$, '42501', null, 'refund.note');
select throws_ok(
  $$ update public.service_application set customer_note = 'x' where id = '91200000-0000-4000-8000-000000000301' $$,
  '42501', null, 'customers do not write tables directly');
select is(pg_temp.n($$ select count(*) from public.application_garden
                       where id = 'f3100000-0000-4000-8000-000000000002' $$), 0::bigint,
  'another customer''s garden is invisible');

select pg_temp.as_user('a3100000-0000-4000-8000-000000000001');
select results_eq($$ select number from public.service_application $$, $$ values ('B-2026-990001') $$,
  'the other customer sees only theirs');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.n($$ select count(*) from public.service_application $$)
          + pg_temp.n($$ select count(*) from public.application_garden $$), 0::bigint, 'the owner sees no applications');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(pg_temp.n($$ select count(*) from public.service_application $$), 0::bigint, 'nor does the viewer');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.n($$ select count(*) from public.service_application $$)
          + pg_temp.n($$ select count(*) from public.price_list $$), 0::bigint, 'nor field staff');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.n($$ select count(*) from public.service_application $$)
          + pg_temp.n($$ select count(*) from public.org_billing_setting $$), 0::bigint, 'nor the expert');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.n($$ select count(*) from public.service_application $$), 3::bigint, 'ops sees the org''s applications');
select is(pg_temp.n($$ select count(*) from public.price_list $$)
          + pg_temp.n($$ select count(*) from public.service_package $$)
          + pg_temp.n($$ select count(*) from public.org_billing_setting $$), 5::bigint,
  'and its price lists, packages and settings');
select throws_ok($$ select ops_note from public.service_application $$, '42501', null,
  'ops reads internal columns only through functions');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.service_application $$, '42501', null, 'anon reads no application');
select throws_ok($$ select count(*) from public.price_list $$, '42501', null, 'nor price lists');
reset role;

-- Account lookup after self sign-up (§6.5, §7.4) ------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'victim@example.test'), null,
  'an unverified self sign-up is not found by its e-mail');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null, '+905559991002'), null,
  'nor by its unverified phone');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'customer@example.com'), null,
  'a completed self sign-up is not found by e-mail either');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null, '+905550000006'),
  'a0000000-0000-4000-8000-000000000006'::uuid, 'but by its verified phone');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null, '+905559991003'), null,
  'an unconfirmed phone is never matched');
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', 'pgtap-unconfirmed@example.test'),
  'a3100000-0000-4000-8000-000000000003'::uuid, 'an account opened by ops is found by e-mail');
reset role;
update auth.users set phone_confirmed_at = now() where id = 'a3100000-0000-4000-8000-000000000002';
set local role authenticated;
select is(public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null, '+905559991002'), null,
  'a self sign-up with a confirmed phone but no completed sign-up is not matched');

-- Co-owner approval: the owner invites the victim's phone; ops looks the account up
-- (as the operations screen does through invite-user) and finds nothing to link.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Kurban', '+905559991002') $$,
  'the owner invites a co-owner by phone');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  public.ops_find_user_id('b0000000-0000-4000-8000-000000000001', null,
    (select phone from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001') where full_name = 'Kurban')),
  null, 'the attacker''s account is not offered for the co-owner approval');

-- Applications (customer) ---------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select public.customer_create_application(null) $$), 'P0001 not_customer',
  'only customers apply');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select public.customer_create_application('91200000-0000-4000-8000-000000000999') $$),
  '22023 invalid_input / package_id', 'an unknown package is refused');
insert into ids values ('draft', public.customer_create_application('91200000-0000-4000-8000-000000000001'));
select is(public.customer_create_application(null), (select id from ids where name = 'draft'),
  'the open draft is returned again');
select is(pg_temp.error_of(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('Sınırsız') || '{"boundary": [[37.6, 37.1], [37.61, 37.1]]}',
    pg_temp.detail())),
  '22023 boundary_invalid / at least three points', 'a boundary needs three points');
select is(pg_temp.error_of(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('İzinsiz'), pg_temp.detail() - 'entry_permission')),
  '22023 invalid_input / entry_permission', 'entry permission is required');
select is(pg_temp.error_of(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('Telefonlu'),
    pg_temp.detail() || '{"site_contact_phone": "0555 111 22 33"}')),
  '22023 invalid_input / site_contact_phone', 'a bad site contact phone is refused without its value');
select is(pg_temp.error_of(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('Minik') || '{"declared_area_m2": 100}', pg_temp.detail())),
  '22023 invalid_input / declared_area_m2', 'a garden is at least 500 m²');
insert into ids values ('garden', public.customer_save_application_garden((select id from ids where name = 'draft'),
  pg_temp.garden('Yeni bahçe') || '{"boundary": [[37.6, 37.1], [37.601, 37.1], [37.601, 37.101], [37.6, 37.101]]}',
  pg_temp.detail() - 'authorization_basis'));
select results_eq(
  $$ select name, declared_area_m2, boundary is not null from public.application_garden
     where id = (select id from ids where name = 'garden') $$,
  $$ values ('Yeni bahçe', 12000.00::numeric, true) $$, 'the garden is saved with its boundary');
select results_eq(
  $$ select deed_block, site_contact_name from public.customer_application_garden_detail((select id from ids where name = 'garden')) $$,
  $$ values ('10', 'Bekçi') $$, 'the customer reads the garden''s private detail');
select is(pg_temp.error_of(format($$ select public.customer_submit_application(%L) $$, (select id from ids where name = 'draft'))),
  'P0001 application_incomplete / authorization_basis', 'every garden needs its authorization basis');
select lives_ok(format($$ select public.customer_save_application_garden(%L, %L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('Yeni bahçe'), pg_temp.detail(),
    (select id from ids where name = 'garden')),
  'the garden is corrected');
select lives_ok(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('Silinecek'), pg_temp.detail()),
  'a second garden');
select lives_ok($$ select public.customer_remove_application_garden(
    (select id from public.application_garden where name = 'Silinecek')) $$, 'and removed again');
select is(pg_temp.n(format($$ select count(*) from public.application_garden where application_id = %L $$,
  (select id from ids where name = 'draft'))), 1::bigint, 'one garden left');
select is(pg_temp.error_of(format($$ select public.customer_set_application_package(%L, %L) $$,
    (select id from ids where name = 'draft'), '91200000-0000-4000-8000-000000000999')),
  '22023 invalid_input / package_id', 'the package must be an active one of the org');
select lives_ok(format($$ select public.customer_set_application_package(%L, %L, 'Not') $$,
    (select id from ids where name = 'draft'), '91200000-0000-4000-8000-000000000002'), 'the package changes');
select matches(public.customer_submit_application((select id from ids where name = 'draft')),
  '^B-[0-9]{4}-[0-9]{6}$', 'the application is submitted with a number');
select is(pg_temp.error_of(format($$ select public.customer_set_application_package(%L, %L) $$,
    (select id from ids where name = 'draft'), '91200000-0000-4000-8000-000000000001')),
  'P0001 application_not_draft', 'a submitted application does not change');
select is(pg_temp.error_of(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft'), pg_temp.garden('Geç'), pg_temp.detail())),
  'P0001 application_not_draft', 'nor do its gardens');
select is(pg_temp.error_of($$ select public.customer_withdraw_application('f3100000-0000-4000-8000-000000000001') $$),
  'P0002 not_found', 'another customer''s application is not found');
select is(pg_temp.n($$ select count(*) from public.customer_application_garden_detail('f3100000-0000-4000-8000-000000000002') $$),
  0::bigint, 'nor its garden detail');

-- Too many gardens.
insert into ids values ('draft2', public.customer_create_application(null));
select lives_ok(format($$ select count(public.customer_save_application_garden(%L, pg_temp.garden('B' || i), pg_temp.detail()))
                         from generate_series(1, 10) i $$, (select id from ids where name = 'draft2')),
  'ten gardens');
select is(pg_temp.error_of(format($$ select public.customer_save_application_garden(%L, %L, %L) $$,
    (select id from ids where name = 'draft2'), pg_temp.garden('On birinci'), pg_temp.detail())),
  'P0001 too_many_gardens', 'not eleven');
select lives_ok(format($$ select public.customer_withdraw_application(%L) $$, (select id from ids where name = 'draft2')),
  'a draft is withdrawn');
select results_eq(format($$ select status::text, number from public.service_application where id = %L $$,
    (select id from ids where name = 'draft2')),
  $$ values ('withdrawn', null::text) $$, 'without a number');

-- Ops review ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$ select * from public.ops_applications('b0000000-0000-4000-8000-000000000001') $$),
  '42501 forbidden', 'field staff does not review applications');
select is(pg_temp.n($$ select count(*) from public.ops_application_garden_detail('91200000-0000-4000-8000-000000000401') $$),
  0::bigint, 'nor read garden details');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.n($$ select count(*) from public.ops_applications('b0000000-0000-4000-8000-000000000001') $$), 5::bigint,
  'ops lists every application but drafts (seed, fixtures, the submitted and the withdrawn one)');
select is(pg_temp.n($$ select count(*) from public.ops_applications('b0000000-0000-4000-8000-000000000001', 'withdrawn') $$),
  1::bigint, 'and by status');
select results_eq(
  $$ select customer_name, package_name, garden_count, declared_area_m2::numeric from public.ops_applications('b0000000-0000-4000-8000-000000000001')
     where number = 'B-2026-000001' $$,
  $$ values ('Örnek Müşteri', 'Standart', 1, 15000.00::numeric) $$, 'with the customer, package and areas');
select results_eq(
  $$ select authorization_basis, deed_block from public.ops_application_garden_detail('91200000-0000-4000-8000-000000000401') $$,
  $$ values ('title_holder', '204') $$, 'ops reads the garden detail');
select is(pg_temp.error_of($$ select public.ops_verify_application_garden('91200000-0000-4000-8000-000000000401', 0) $$),
  '22023 invalid_input / verified_area_m2', 'a verified area is positive');
select lives_ok($$ select public.ops_verify_application_garden('91200000-0000-4000-8000-000000000401', 14850.456,
  '[[37.79, 37.01], [37.791, 37.01], [37.791, 37.011], [37.79, 37.011]]', 'Uydu görüntüsünden') $$,
  'ops verifies a garden''s area and redraws its boundary');
select results_eq(
  $$ select verified_area_m2, verified_at is not null, boundary is not null from public.application_garden
     where id = '91200000-0000-4000-8000-000000000401' $$,
  $$ values (14850.46::numeric, true, true) $$, 'the verified area is rounded to cm²');
select is(pg_temp.error_of($$ select public.ops_verify_application_garden('f3100000-0000-4000-8000-000000000004', 8000) $$),
  '42501 forbidden', 'ops does not review their own application');
select is(pg_temp.error_of($$ select public.ops_reject_application('f3100000-0000-4000-8000-000000000003', 'other') $$),
  '42501 forbidden', 'nor reject it');
select is(pg_temp.error_of(format($$ select public.ops_verify_application_garden(%L, 1000) $$,
    (select id from public.application_garden where application_id = (select id from ids where name = 'draft2') limit 1))),
  'P0001 application_not_open', 'a withdrawn application is not reviewed');

-- Rejection cancels the open quote (written here as IP12-A2 will issue it).
reset role;
update public.service_application set status = 'quoted' where id = 'f3100000-0000-4000-8000-000000000001';
insert into public.quote (id, org_id, customer_user_id, application_id, number, price_list_id, price_list_version,
  package_id, package_code, package_name, periodic_visits_per_year, includes_inventory, first_year, vat_rate_bp,
  base_kurus, discount_kurus, subtotal_kurus, vat_kurus, total_kurus, inputs, valid_until)
values ('f3100000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001',
  'a3100000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000001', 'T-2026-990001',
  '91200000-0000-4000-8000-000000000101', 1, '91200000-0000-4000-8000-000000000002', 'ekonomik', 'Ekonomik', 3,
  true, true, 2000, 450000, 0, 450000, 90000, 540000, '{}', current_date + 30);
set local role authenticated;
select is(pg_temp.error_of($$ select public.ops_reject_application('f3100000-0000-4000-8000-000000000001', 'bogus') $$),
  '22023 invalid_input / reason', 'a rejection needs a known reason');
select lives_ok($$ select public.ops_reject_application('f3100000-0000-4000-8000-000000000001', 'out_of_service_area', 'Bölge dışı') $$,
  'ops rejects a quoted application');
reset role;
select results_eq(
  $$ select a.status::text, a.rejection_reason::text, a.ops_note, q.status::text
     from public.service_application a join public.quote q on q.application_id = a.id
     where a.id = 'f3100000-0000-4000-8000-000000000001' $$,
  $$ values ('rejected', 'out_of_service_area', 'Bölge dışı', 'cancelled') $$,
  'rejected with its reason; the open quote is cancelled');
select results_eq(
  $$ select action, actor_role from public.audit_event
     where entity_id in ('f3100000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000005')
     order by action $$,
  $$ values ('application.rejected', 'ops'), ('quote.cancelled', 'ops') $$, 'both are audited');
set local role authenticated;
select is(pg_temp.error_of($$ select public.ops_reject_application('f3100000-0000-4000-8000-000000000001', 'other') $$),
  'P0001 application_not_open', 'a rejected application is final');

-- The customer withdraws a submitted application.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select lives_ok($$ select public.customer_withdraw_application('91200000-0000-4000-8000-000000000301') $$,
  'the customer withdraws a submitted application');
select is(pg_temp.error_of($$ select public.customer_withdraw_application('91200000-0000-4000-8000-000000000301') $$),
  'P0001 application_not_open', 'once');

-- Settings, packages, price lists -------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"allow_fake_payments": false}') $$), '22023 invalid_input / allow_fake_payments',
  'fake payments are not an ops setting');
select is(pg_temp.error_of($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"iban": "TR12 3456"}') $$), '22023 invalid_input / iban', 'an IBAN has 26 characters');
select lives_ok($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"iban": "TR33 0006 1005 1978 6457 8413 26", "payment_due_days": 10}') $$, 'ops saves settings');
select results_eq(
  $$ select iban, payment_due_days, allow_fake_payments, accepts_signups
     from public.ops_billing_setting('b0000000-0000-4000-8000-000000000001') $$,
  $$ values ('TR330006100519786457841326', 10, true, true) $$, 'normalised; other keys stay');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select * from public.ops_billing_setting('b0000000-0000-4000-8000-000000000001') $$),
  '42501 forbidden', 'the expert reads no settings');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select isa_ok(public.ops_save_package('b0000000-0000-4000-8000-000000000001',
  '{"code": "yogun", "name": "Yoğun", "periodic_visits_per_year": 6}'), 'uuid', 'ops adds a package');
select is(pg_temp.error_of($$ select public.ops_save_package('b0000000-0000-4000-8000-000000000001',
  '{"code": "standart", "name": "İkinci", "periodic_visits_per_year": 4}') $$), '23505 exists / code',
  'package codes are unique');
insert into ids values ('list', public.ops_create_price_list_draft('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000101'));
select is(pg_temp.n(format($$ select count(*) from public.price_list_item where price_list_id = %L $$,
  (select id from ids where name = 'list'))), 2::bigint, 'a draft copies the items');
select is(pg_temp.error_of(format($$ select public.ops_publish_price_list(%L) $$, (select id from ids where name = 'list'))),
  'P0001 valid_from_in_past', 'a copied draft needs a new validity date');
select lives_ok(format($$ select public.ops_save_price_list_draft(%L, current_date + 1, 2000, null, %L) $$,
    (select id from ids where name = 'list'),
    '[{"package_id": "91200000-0000-4000-8000-000000000001", "unit_price_kurus": 13000, "minimum_fee_kurus": 500000},
      {"package_id": "91200000-0000-4000-8000-000000000002", "unit_price_kurus": 13500}]'),
  'ops saves the draft');
select is(pg_temp.error_of(format($$ select public.ops_publish_price_list(%L) $$, (select id from ids where name = 'list'))),
  'P0001 price_list_incomplete', 'every active package needs a price');
select is(pg_temp.error_of(format($$ select public.ops_save_price_list_draft(%L, current_date + 1, 2000, null, %L) $$,
    (select id from ids where name = 'list'), '[{"package_id": "91200000-0000-4000-8000-000000000001", "unit_price_kurus": 1.5}]')),
  '22023 invalid_input / unit_price_kurus', 'prices are whole kuruş');
select lives_ok(format($$ select public.ops_save_price_list_draft(%L, current_date + 1, 2000, 'Yeni', %L) $$,
    (select id from ids where name = 'list'),
    (select jsonb_agg(jsonb_build_object('package_id', id, 'unit_price_kurus', 14000)) from public.service_package)),
  'every package priced');
select is(public.ops_publish_price_list((select id from ids where name = 'list')), 2, 'published as version 2');
select is(pg_temp.error_of(format($$ select public.ops_save_price_list_draft(%L, current_date + 1, 2000, null, '[]') $$,
    (select id from ids where name = 'list'))), 'P0001 price_list_not_draft', 'a published list does not change');
select lives_ok($$ select public.ops_delete_price_list_draft('91200000-0000-4000-8000-000000000102') $$,
  'a draft is deleted');
reset role;
select results_eq(
  $$ select action from public.audit_event where entity_type in ('price_list', 'package', 'billing_setting')
     order by action $$,
  $$ values ('billing_setting.saved'), ('package.saved'), ('price_list.draft_created'), ('price_list.draft_deleted'),
            ('price_list.draft_saved'), ('price_list.draft_saved'), ('price_list.published') $$,
  'catalog changes are audited');

select * from finish();
rollback;
