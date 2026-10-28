-- customer_accept_quote with the legal-text registry, the template hashes,
-- the optional early-performance consent and the production gate
-- (docs/hukuk/kararlar.md T21, T04, T03, H11 (a); docs/musteri-yonetimi.md
-- "Sözleşme belgeleri (T04)").
-- Seed: org b0..01 (fake payments allowed: gate inactive), ops a0..05,
-- package standart 9120..0001.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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
create temporary table hashes on commit drop as
  select kind, version, sha256 from private.legal_text_version where is_current;
grant select, insert on ids to authenticated;
grant select on hashes to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create function pg_temp.h(p_kind text) returns text language sql stable
as $$ select sha256 from hashes where kind = p_kind $$;
grant execute on all functions in schema pg_temp to authenticated;

create function pg_temp.new_customer(p_n integer) returns uuid language plpgsql
as $$
declare
  v uuid := ('f5100000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated',
          'c51-' || p_n || '@example.test', now(), now());
  insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
  values ('b0000000-0000-4000-8000-000000000001', v, 'Müşteri 51-' || p_n, 'sms');
  insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
  values ('b0000000-0000-4000-8000-000000000001', v, 'individual', 'A', 'B', 'Adres', 'Gaziantep');
  -- A day old: one transaction has one now(), and the gate reads the latest record.
  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, recorded_at)
  values ('b0000000-0000-4000-8000-000000000001', v, v, 'kvkk_notice', true, 'kvkk-v1-taslak', 'signup',
          now() - interval '1 day');
  return v;
end;
$$;

-- An issued quote for one new garden of the customer.
create function pg_temp.new_quote(p_user uuid, p_lon numeric) returns uuid language plpgsql
as $$
declare
  a uuid;
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
  return public.ops_issue_quote(a);
end;
$$;

insert into ids values ('u1', pg_temp.new_customer(1)), ('u2', pg_temp.new_customer(2)), ('u3', pg_temp.new_customer(3));
insert into ids select 'q1', pg_temp.new_quote(pg_temp.id('u1'), 37.501);
insert into ids select 'q2', pg_temp.new_quote(pg_temp.id('u2'), 37.511);
insert into ids select 'q3', pg_temp.new_quote(pg_temp.id('u3'), 37.521);

-- Registry checks (every project) ------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v2-taslak", "pre_information": "onbilgi-v4-taslak"}') $$, pg_temp.id('q1'))),
  'P0001 legal_text_outdated / distance_sales', 'an earlier registered version is outdated');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4", "pre_information": "onbilgi-v4-taslak"}') $$, pg_temp.id('q1'))),
  'P0001 legal_text_outdated / distance_sales', 'a final-looking version that is not registered is refused');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v9-taslak"}') $$, pg_temp.id('q1'))),
  'P0001 legal_text_outdated / pre_information', 'the pre-information form is checked too');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L, %L) $$, pg_temp.id('q1'),
  jsonb_build_object('distance_sales', jsonb_build_object('version', 'mesafeli-v4-taslak', 'sha256', repeat('0', 64)),
    'pre_information', 'onbilgi-v4-taslak'))),
  'P0001 legal_text_outdated / distance_sales', 'a hash other than the registered one is refused');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L, %L) $$, pg_temp.id('q1'),
  jsonb_build_object('distance_sales', jsonb_build_object('version', 'mesafeli-v4-taslak'),
    'pre_information', 'onbilgi-v4-taslak'))),
  '22023 consent_required / distance_sales', 'the object form carries the hash');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L, %L) $$, pg_temp.id('q1'),
  jsonb_build_object('distance_sales', 'mesafeli-v4-taslak', 'pre_information',
    jsonb_build_object('version', 'onbilgi-v4-taslak', 'sha256', pg_temp.h('pre_information'), 'display_sha256', 'xyz')))),
  '22023 invalid_input / pre_information.display_sha256', 'display_sha256 is format-checked');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak", "early_performance": "mesafeli-v2-taslak"}') $$,
  pg_temp.id('q1'))),
  'P0001 legal_text_outdated / early_performance', 'the early-performance box has its registered version too');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak", "early_performance": 1}') $$,
  pg_temp.id('q1'))),
  '22023 consent_required / early_performance', 'a malformed box value is refused');

-- Old string form, no box -----------------------------------------------------------------

insert into ids select 'o1', public.customer_accept_quote(pg_temp.id('q1'),
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak"}');
reset role;
select results_eq(
  $$ select kind::text, granted, text_version, text_sha256 = pg_temp.h(kind::text), display_sha256 is null
     from private.consent_record where order_id = pg_temp.id('o1') order by kind::text $$,
  $$ values ('distance_sales', true, 'mesafeli-v4-taslak', true, true),
            ('pre_information', true, 'onbilgi-v4-taslak', true, true) $$,
  'the old form: the rows carry the registered template hash');
select ok(not private.has_early_performance(pg_temp.id('o1')), 'without the box there is no early_performance row');
select is((select details -> 'kinds' from public.audit_event
           where action = 'consent.granted' and details ->> 'order_id' = pg_temp.id('o1')::text),
  '["distance_sales", "pre_information"]'::jsonb, 'the audit names the two contract consents');

-- Object form, with the box ------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user(pg_temp.id('u2'));
insert into ids select 'o2', public.customer_accept_quote(pg_temp.id('q2'), jsonb_build_object(
  'distance_sales', jsonb_build_object('version', 'mesafeli-v4-taslak', 'sha256', pg_temp.h('distance_sales'),
    'display_sha256', repeat('d', 64)),
  'pre_information', jsonb_build_object('version', 'onbilgi-v4-taslak', 'sha256', pg_temp.h('pre_information'),
    'display_sha256', repeat('e', 64)),
  'early_performance', jsonb_build_object('version', 'mesafeli-v4-taslak', 'sha256', pg_temp.h('early_performance'))));
reset role;
select results_eq(
  $$ select kind::text, granted, text_version, text_sha256 = pg_temp.h(kind::text), display_sha256, source::text
     from private.consent_record where order_id = pg_temp.id('o2') order by kind::text $$,
  $$ values ('distance_sales', true, 'mesafeli-v4-taslak', true, repeat('d', 64), 'quote_acceptance'),
            ('early_performance', true, 'mesafeli-v4-taslak', true, null, 'quote_acceptance'),
            ('pre_information', true, 'onbilgi-v4-taslak', true, repeat('e', 64), 'quote_acceptance') $$,
  'the object form: hashes and the display hash as given; the box is its own consent row');
select ok(private.has_early_performance(pg_temp.id('o2')), 'the order has the early-performance consent');
select is((select details -> 'kinds' from public.audit_event
           where action = 'consent.granted' and details ->> 'order_id' = pg_temp.id('o2')::text),
  '["distance_sales", "pre_information", "early_performance"]'::jsonb, 'the audit names the box');

-- The box in the string form; false is no box.
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u3'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak", "early_performance": false}') $$,
  pg_temp.id('q3'))), null, 'false: accepted without the box');
reset role;
select is((select count(*)::integer from private.consent_record c join public.service_order o on o.id = c.order_id
           where o.quote_id = pg_temp.id('q3') and c.kind = 'early_performance'), 0, 'and no early_performance row');

-- Production gate ----------------------------------------------------------------------------

insert into ids select 'q4', pg_temp.new_quote(pg_temp.id('u1'), 37.531);
reset role;
update public.org_billing_setting set allow_fake_payments = false where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak"}') $$, pg_temp.id('q4'))),
  'P0001 legal_texts_not_final / distance_sales_draft', 'the gate refuses a draft contract');
select results_eq($$ select reasons from public.legal_gate_status('b0000000-0000-4000-8000-000000000001') $$,
  $$ values (array['distance_sales_draft', 'pre_information_draft', 'kvkk_notice_not_final']) $$,
  'legal_gate_status names every reason for the quote''s org');
reset role;
select private.register_legal_text('distance_sales', 'mesafeli-v4', repeat('1', 64));
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4", "pre_information": "onbilgi-v4-taslak"}') $$, pg_temp.id('q4'))),
  'P0001 legal_texts_not_final / pre_information_draft', 'then a draft pre-information form');
reset role;
select private.register_legal_text('pre_information', 'onbilgi-v4', repeat('2', 64));
select private.register_legal_text('kvkk_notice', 'kvkk-v2', repeat('3', 64));
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4", "pre_information": "onbilgi-v4"}') $$, pg_temp.id('q4'))),
  'P0001 legal_texts_not_final / kvkk_notice_not_final', 'then the customer''s draft KVKK notice');
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4"}') $$, pg_temp.id('q4'))),
  'P0001 legal_text_outdated / distance_sales', 'the client''s string never decides: the old draft is outdated');
select lives_ok($$ select public.customer_set_consent('kvkk_notice', true, 'kvkk-v2') $$,
  'the customer acknowledges the current final notice');
reset role;
update public.org_billing_setting set site_domain = null where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4", "pre_information": "onbilgi-v4"}') $$, pg_temp.id('q4'))),
  'P0001 legal_texts_not_final / company_info_incomplete', 'then missing company data (the domain)');
reset role;
update public.org_billing_setting set site_domain = 'orchados.example' where org_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u1'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L, %L) $$, pg_temp.id('q4'),
  jsonb_build_object('distance_sales', jsonb_build_object('version', 'mesafeli-v4', 'sha256', repeat('1', 64)),
    'pre_information', 'onbilgi-v4'))), null, 'final texts, final notice, complete company data: accepted');
reset role;
select is((select text_sha256 from private.consent_record c join public.service_order o on o.id = c.order_id
           where o.quote_id = pg_temp.id('q4') and c.kind = 'pre_information'), repeat('2', 64),
  'the string form records the registered hash of the final text');

-- Inactive where fake payments are allowed: the drafts pass (the steps above).
update public.org_billing_setting set allow_fake_payments = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select private.register_legal_text('distance_sales', 'mesafeli-v4-taslak', pg_temp.h('distance_sales'));
select private.register_legal_text('pre_information', 'onbilgi-v4-taslak', pg_temp.h('pre_information'));
insert into ids select 'q5', pg_temp.new_quote(pg_temp.id('u2'), 37.541);
set local role authenticated;
select pg_temp.as_user(pg_temp.id('u2'));
select is(pg_temp.error_of(format($$ select public.customer_accept_quote(%L,
  '{"distance_sales": "mesafeli-v4-taslak", "pre_information": "onbilgi-v4-taslak"}') $$, pg_temp.id('q5'))), null,
  'the gate is inactive with fake payments allowed (local, CI, test)');
reset role;

-- Privileges -----------------------------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'private.accept_consent_entry(jsonb, text, boolean)', 'execute'),
  'the entry check is internal');
select ok(not has_function_privilege('anon', 'public.customer_accept_quote(uuid, jsonb)', 'execute'),
  'anonymous callers cannot accept');
select ok(not has_function_privilege('authenticated', 'private.legal_gate_reasons(uuid, uuid)', 'execute'),
  'the gate reasons are read through legal_gate_status');

select * from finish();
rollback;
