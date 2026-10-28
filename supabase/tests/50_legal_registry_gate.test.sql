-- Legal-text registry, company information and the production gate status
-- (docs/hukuk/kararlar.md H34, T21; docs/musteri-yonetimi.md §9.3, §9.4).
-- Seed: org b0..01 (sign-up org, fake payments allowed, gate not enforced, complete company
-- information), customer a0..06 (KVKK notice kvkk-v1-taslak), ops a0..05.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id uuid) returns void language sql
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
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Registry ---------------------------------------------------------------------------

select results_eq(
  $$ select kind, version from private.legal_text_version where is_current order by kind $$,
  $$ values ('distance_sales', 'mesafeli-v4-taslak'), ('early_performance', 'mesafeli-v4-taslak'),
            ('explicit_consent', 'riza-v2-taslak'), ('field_notice', 'bahcede-v1-taslak'),
            ('kvkk_notice', 'kvkk-v2-taslak'), ('pre_information', 'onbilgi-v4-taslak'),
            ('privacy', 'gizlilik-v2-taslak'), ('refund_policy', 'iade-v4-taslak') $$,
  'one current version per kind, equal to LEGAL_TEXT_VERSIONS');
select is((select count(*)::integer from private.legal_text_version where is_current and sha256 ~ '^[0-9a-f]{64}$'), 8,
  'every current version carries its template hash');
select results_eq(
  $$ select kind, version, sha256 is not null from private.legal_text_version where not is_current
     order by kind, version $$,
  $$ values ('distance_sales', 'mesafeli-v1-taslak', false), ('distance_sales', 'mesafeli-v2-taslak', false),
            ('distance_sales', 'mesafeli-v3-taslak', true), ('early_performance', 'mesafeli-v3-taslak', true),
            ('explicit_consent', 'riza-v1-taslak', false), ('kvkk_notice', 'kvkk-v1-taslak', false),
            ('pre_information', 'onbilgi-v1-taslak', false), ('pre_information', 'onbilgi-v2-taslak', false),
            ('pre_information', 'onbilgi-v3-taslak', true), ('privacy', 'gizlilik-v1-taslak', false),
            ('refund_policy', 'iade-v1-taslak', false), ('refund_policy', 'iade-v2-taslak', false),
            ('refund_policy', 'iade-v3-taslak', true) $$,
  'versions archived before the registry have no hash; v3 (registered, then superseded) keeps its own');
select ok(not exists (select 1 from private.legal_text_version where is_final), 'every registered version is a draft today');
select throws_ok($$ insert into private.legal_text_version (kind, version, sha256, is_current)
  values ('kvkk_notice', 'kvkk-v3', repeat('b', 64), true) $$, '23505', null, 'a second current row per kind is refused');
select throws_ok($$ insert into private.legal_text_version (kind, version, is_current) values ('privacy', 'gizlilik-v9', true) $$,
  '23514', null, 'a current version needs its hash');
select throws_ok($$ insert into private.legal_text_version (kind, version) values ('contract', 'x-v1') $$,
  '23514', null, 'only the known kinds');

-- register_legal_text makes a version current and keeps the earlier one.
savepoint reg;
select private.register_legal_text('privacy', 'gizlilik-v3', repeat('a', 64));
select results_eq(
  $$ select version, is_current, is_final from private.legal_text_version where kind = 'privacy' order by version $$,
  $$ values ('gizlilik-v1-taslak', false, false), ('gizlilik-v2-taslak', false, false), ('gizlilik-v3', true, true) $$,
  'register_legal_text switches the current version');
rollback to savepoint reg;

set local role anon;
select is((select count(*)::integer from public.registered_legal_text_versions()), 21, 'anyone reads the registered versions');
select throws_ok($$ select * from private.legal_text_version $$, '42501', null, 'the table itself is closed');
reset role;

-- Company information --------------------------------------------------------------------

set local role anon;
select results_eq(
  $$ select legal_name, site_domain, kep_address, kvkk_email, complete from public.public_company_info() $$,
  $$ values ('orchadOS Denetim Hizmetleri A.Ş. (örnek)'::text, 'orchados.example'::text,
             'orchados@hs01.kep.example'::text, 'kvkk@orchados.example'::text, true) $$,
  'the seller is the sign-up org; kvkk_email falls back to kvkk@ + domain');
reset role;
update public.org_billing_setting set kvkk_email = 'veri@orchados.example' where org_id = 'b0000000-0000-4000-8000-000000000001';
select is((select kvkk_email from public.public_company_info()), 'veri@orchados.example', 'an explicit kvkk_email wins');
update public.org_billing_setting set site_domain = null where org_id = 'b0000000-0000-4000-8000-000000000001';
select is((select complete from public.public_company_info()), false, 'the domain is required for completeness');
update public.org_billing_setting set site_domain = 'orchados.example', kep_address = null
where org_id = 'b0000000-0000-4000-8000-000000000001';
select is((select complete from public.public_company_info()), false, 'so is the KEP address');
update public.org_billing_setting set kep_address = 'orchados@hs01.kep.example'
where org_id = 'b0000000-0000-4000-8000-000000000001';
select throws_ok($$ update public.org_billing_setting set site_domain = 'Orchados.Example/'
  where org_id = 'b0000000-0000-4000-8000-000000000001' $$, '23514', null, 'a domain is a lower-case host name');

-- A demo org on the same database (shared test host) is never the seller.
insert into public.org (id, name, kind) values ('d1500000-0000-4000-8000-000000000001', 'pgTAP demo 50', 'other');
insert into private.demo_org (org_id, enabled, loaded_at) values ('d1500000-0000-4000-8000-000000000001', true, now());
insert into public.org_billing_setting (org_id, legal_name, mersis_number, address, phone, email, kep_address,
  tax_office, tax_number, site_domain)
values ('d1500000-0000-4000-8000-000000000001', 'Demo A.Ş.', '9999999999999999', 'Demo adres', '+905550009999',
  'demo@example.com', 'demo@kep.example', 'Demo', '9999999999', 'demo.example');
select is((select legal_name from public.public_company_info()), 'orchadOS Denetim Hizmetleri A.Ş. (örnek)',
  'with a demo org present the sign-up org is the seller');
update public.org_billing_setting set accepts_signups = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select is((select legal_name from public.public_company_info()), 'orchadOS Denetim Hizmetleri A.Ş. (örnek)',
  'without a sign-up org: the only non-demo org with a setting');
insert into public.org (id, name, kind) values ('b5000000-0000-4000-8000-000000000002', 'pgTAP second org 50', 'other');
insert into public.org_billing_setting (org_id, legal_name) values ('b5000000-0000-4000-8000-000000000002', 'İkinci');
select results_eq($$ select legal_name, complete from public.public_company_info() $$,
  $$ values (null::text, false) $$, 'two non-demo orgs and no sign-up org: no seller');
update public.org_billing_setting set accepts_signups = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select is((select legal_name from public.public_company_info()), 'orchadOS Denetim Hizmetleri A.Ş. (örnek)',
  'the sign-up org decides between two orgs');
delete from public.org_billing_setting where org_id = 'b5000000-0000-4000-8000-000000000002';
delete from private.demo_org where org_id = 'd1500000-0000-4000-8000-000000000001';

-- Settings through ops ---------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"kep_address": "Yeni@Kep.Example", "site_domain": "Orchados.Example", "kvkk_email": null}') $$,
  'ops saves the KEP address, the domain and the KVKK e-mail');
select results_eq($$ select kep_address, site_domain, kvkk_email from public.ops_billing_setting('b0000000-0000-4000-8000-000000000001') $$,
  $$ values ('yeni@kep.example'::text, 'orchados.example'::text, null::text) $$, 'lower case, null clears');
select is(pg_temp.error_of($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"site_domain": "not a domain"}') $$), '22023 invalid_input / site_domain', 'a bad domain is refused');
select is(pg_temp.error_of($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"marketing_consent_enabled": true}') $$), '22023 invalid_input / marketing_consent_enabled',
  'T27: the marketing switch is SQL only');
select is(pg_temp.error_of($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"inventory_reuse_months": 12}') $$), '22023 invalid_input / inventory_reuse_months',
  'T18: the inventory reuse window is SQL only');
reset role;
select is((select marketing_consent_enabled from public.org_billing_setting
           where org_id = 'b0000000-0000-4000-8000-000000000001'), false, 'T27: marketing stays off in seed');

-- Gate status ------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select results_eq($$ select active, reasons from public.legal_gate_status() $$,
  $$ values (false, array[]::text[]) $$, 'not enforced (local, CI, test, demo): the gate is inactive');
reset role;
update public.org_billing_setting set allow_fake_payments = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq($$ select active, reasons from public.legal_gate_status() $$,
  $$ values (false, array[]::text[]) $$, 'refusing fake payments (iyzico sandbox) does not turn the gate on');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select throws_ok($$ select public.ops_save_billing_setting('b0000000-0000-4000-8000-000000000001',
  '{"legal_gate_enforced": true}') $$, '22023', 'invalid_input', 'the gate switch is SQL only');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
reset role;
update public.org_billing_setting set legal_gate_enforced = true where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select results_eq($$ select active, reasons from public.legal_gate_status() $$,
  $$ values (true, array['distance_sales_draft', 'pre_information_draft', 'kvkk_notice_not_final']) $$,
  'pilot and production: drafts and a draft KVKK notice block');
select results_eq($$ select active, reasons from public.legal_gate_status('b0000000-0000-4000-8000-000000000001') $$,
  $$ values (false, array[]::text[]) $$, 'an org is named only where the caller has a quote (none in seed)');
select results_eq($$ select active, reasons from public.legal_gate_status('d1500000-0000-4000-8000-000000000001') $$,
  $$ values (false, array[]::text[]) $$, 'an org without the caller''s quotes tells nothing');
reset role;
-- Launch: final texts registered, the customer acknowledges the final notice.
select private.register_legal_text('distance_sales', 'mesafeli-v4', repeat('1', 64));
select private.register_legal_text('pre_information', 'onbilgi-v4', repeat('2', 64));
select private.register_legal_text('kvkk_notice', 'kvkk-v2', repeat('3', 64));
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select results_eq($$ select reasons from public.legal_gate_status() $$,
  $$ values (array['kvkk_notice_not_final']) $$, 'only the customer''s draft KVKK notice is left');
select lives_ok($$ select public.customer_set_consent('kvkk_notice', true, 'kvkk-v2') $$,
  'the customer acknowledges the current final notice');
select results_eq($$ select reasons from public.legal_gate_status() $$,
  $$ values (array[]::text[]) $$, 'nothing blocks');
reset role;
update public.org_billing_setting set tax_office = null where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select results_eq($$ select reasons from public.legal_gate_status() $$,
  $$ values (array['company_info_incomplete']) $$, 'missing company data blocks (H34)');
reset role;
set local role anon;
select throws_ok($$ select * from public.legal_gate_status() $$, '42501', null, 'the gate status needs a signed-in user');
reset role;

select * from finish();
rollback;
