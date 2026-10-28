-- Pricing, quotes and their acceptance (IP12-A2, docs/musteri-yonetimi.md §5.1,
-- §5.2, §6.6, §6.9): formula pricing-v1, previews, issuing and superseding
-- quotes, acceptance (consents, billing profile, expiry), decline, parcel and
-- renewal quotes, expiry by housekeeping, rejection message, a zero total.
-- Seed: ops a0..05, customer a0..06 (owner and billing profile, consents),
-- application 9120..0301 (submitted) with garden 9120..0401 (15 000 m², not
-- verified), packages temel 9120..0002 (2 visits), standart 9120..0001 (4) and
-- kapsamli 9120..0003 (6), price list v1 (unit / minimum / inventory: temel
-- 20 800 / 560 000 / 600 000, standart 18 000 / 1 120 000 / 600 000, kapsamli
-- 16 800 / 1 600 000 / 600 000; VAT 2000 bp). The functions are called as postgres with the JWT claims of the
-- user (security definer functions read auth.uid()); grants are in
-- 35_billing_security.
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

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
create function pg_temp.detail() returns jsonb language sql immutable
as $$ select '{"authorization_basis": "title_holder", "entry_permission": true}'::jsonb $$;
create function pg_temp.consents() returns jsonb language sql immutable
as $$ select '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}'::jsonb $$;
-- A submitted application of the customer with one verified garden.
create function pg_temp.verified_application(p_area numeric) returns uuid language plpgsql
as $$
declare
  a uuid;
  g uuid;
begin
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
  a := public.customer_create_application('91200000-0000-4000-8000-000000000001');
  g := public.customer_save_application_garden(a,
    jsonb_build_object('name', 'Test Bahçesi', 'declared_area_m2', p_area, 'lon', 37.6, 'lat', 37.1), pg_temp.detail());
  perform public.customer_submit_application(a);
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  perform public.ops_verify_application_garden(g, p_area);
  return a;
end;
$$;
create temporary table ids (name text primary key, id uuid) on commit drop;

-- Pricing ----------------------------------------------------------------------------

select is(
  (select line_total_kurus from public.price_preview('91200000-0000-4000-8000-000000000001', array[20000])),
  2448000::bigint, '20 dönüm, standart, first year: 2 448 000 kuruş with VAT');
select results_eq(
  $$ select billable_area_tenths, visit_amount_kurus, line_base_kurus, line_vat_kurus, price_list_version
     from public.price_preview('91200000-0000-4000-8000-000000000001', array[20000]) $$,
  $$ values (200, 1440000::bigint, 2040000::bigint, 408000::bigint, 1) $$,
  '20 dönüm: 200 tenths, 4 × 200 × 18 000 / 10, inventory 600 000 (first year), VAT 20 %');
select results_eq(
  $$ select visit_amount_kurus, line_base_kurus, line_total_kurus
     from public.price_preview('91200000-0000-4000-8000-000000000001', array[1000]) $$,
  $$ values (72000::bigint, 1720000::bigint, 2064000::bigint) $$,
  'the minimum fee applies below it');
select results_eq(
  $$ select p.code, l.line_total_kurus
     from public.service_package p cross join lateral public.price_preview(p.id, array[20000], false) l
     where p.org_id = 'b0000000-0000-4000-8000-000000000001' order by p.sort_order $$,
  $$ values ('temel'::text, 998400::bigint), ('standart', 1728000), ('kapsamli', 2419200) $$,
  'launch list (docs/fiyatlandirma.md): 20 dönüm, after the first year, with VAT');
select is(
  (select billable_area_tenths from public.price_preview('91200000-0000-4000-8000-000000000001', array[15001])),
  151, 'billable tenths are rounded up');
select is(
  (select visits from public.price_preview('91200000-0000-4000-8000-000000000002', array[20000]))::integer,
  2, 'the package''s visits');
select results_eq(
  $$ select line_no, area_m2 from public.price_preview('91200000-0000-4000-8000-000000000001', array[1000, 20000]) $$,
  $$ values (1, 1000.00::numeric), (2, 20000.00::numeric) $$,
  'one line per area, in order');
-- 201 tenths: base 1 447 200 + 600 000, discount 1 bp = 204.72 → 205; VAT 409 399 (half up).
select results_eq(
  $$ select line_discount_kurus, line_subtotal_kurus, line_vat_kurus, line_total_kurus
     from private.price_lines('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001',
       array[20100], true, 1) $$,
  $$ values (205::bigint, 2046995::bigint, 409399::bigint, 2456394::bigint) $$,
  'discount and VAT round half up');
select is(
  pg_temp.error_of($$ select * from private.price_lines('b0000000-0000-4000-8000-000000000001',
    '91200000-0000-4000-8000-000000000001', array[20000], true, 0, '2026-09-01') $$),
  'P0001 no_price_list', 'no published list before its validity');
insert into public.service_package (id, org_id, code, name, periodic_visits_per_year)
values ('93200000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'premium', 'Premium', 6);
select is(
  pg_temp.error_of($$ select * from public.price_preview('93200000-0000-4000-8000-000000000001', array[20000]) $$),
  'P0001 package_not_priced', 'a package without a price item');
select is(
  pg_temp.error_of($$ select * from public.price_preview('91200000-0000-4000-8000-000000000001', '{}') $$),
  '22023 invalid_input / areas', 'no areas');
select is(
  pg_temp.error_of($$ select * from public.price_preview('91200000-0000-4000-8000-000000000001', array[0]) $$),
  '22023 invalid_input / areas', 'a zero area');
select is(
  pg_temp.error_of($$ select * from public.price_preview(gen_random_uuid(), array[20000]) $$),
  'P0002 not_found', 'an unknown package');
select results_eq(
  $$ select code, price_list_version, unit_price_kurus, minimum_fee_kurus, vat_rate_bp
     from public.public_package_prices() $$,
  $$ values ('temel'::text, 1, 20800::bigint, 560000::bigint, 2000), ('standart', 1, 18000, 1120000, 2000),
    ('kapsamli', 1, 16800, 1600000, 2000) $$,
  'public prices: active packages with an item of the list in force');

-- Ops preview and issue ------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select results_eq(
  $$ select application_garden_id, area_source, area_m2, line_total_kurus
     from public.ops_preview_quote('91200000-0000-4000-8000-000000000301') $$,
  $$ values ('91200000-0000-4000-8000-000000000401'::uuid, 'estimated'::text, 15000.00::numeric, 2064000::bigint) $$,
  'preview of an unverified garden uses the declared area');
select is(
  pg_temp.error_of($$ select public.ops_issue_quote('91200000-0000-4000-8000-000000000301') $$),
  'P0001 garden_not_verified', 'a quote needs verified gardens');
select public.ops_verify_application_garden('91200000-0000-4000-8000-000000000401', 18000);
select is(
  (select area_source || ':' || line_total_kurus from public.ops_preview_quote('91200000-0000-4000-8000-000000000301')),
  'verified:2275200', 'preview of a verified garden');
select is(
  pg_temp.error_of($$ select public.ops_issue_quote('91200000-0000-4000-8000-000000000301', p_discount_bp => 500) $$),
  '22023 invalid_input / discount_note', 'a discount needs a note');
select is(
  pg_temp.error_of($$ select public.ops_issue_quote('91200000-0000-4000-8000-000000000301', p_valid_days => 91) $$),
  '22023 invalid_input / valid_days', 'validity is at most 90 days');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(
  pg_temp.error_of($$ select public.ops_issue_quote('91200000-0000-4000-8000-000000000301') $$),
  'P0002 not_found', 'the customer cannot issue a quote (not ops of the org)');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

insert into ids select 'q1', public.ops_issue_quote('91200000-0000-4000-8000-000000000301');
select results_eq(
  $$ select status::text, total_kurus, first_year, price_list_version, package_code, inputs ->> 'formula',
            inputs -> 'areas' -> 0 ->> 'source', valid_until - (now() at time zone 'Europe/Istanbul')::date
     from public.quote where id = (select id from ids where name = 'q1') $$,
  $$ values ('issued'::text, 2275200::bigint, true, 1, 'standart'::text, 'pricing-v1'::text, 'verified'::text, 30) $$,
  'the quote freezes the verified area, list and package; valid 30 days');
select ok((select number ~ '^T-[0-9]{4}-[0-9]{6}$' from public.quote where id = (select id from ids where name = 'q1')),
  'quote number T-YYYY-NNNNNN');
select results_eq(
  $$ select application_garden_id, area_m2, line_total_kurus from public.quote_item
     where quote_id = (select id from ids where name = 'q1') $$,
  $$ values ('91200000-0000-4000-8000-000000000401'::uuid, 18000.00::numeric, 2275200::bigint) $$,
  'one line per garden');
select is((select status::text from public.service_application where id = '91200000-0000-4000-8000-000000000301'),
  'quoted', 'submitted → quoted');
select results_eq(
  $$ select template::text, vars ->> 'ref', vars ->> 'path', channel::text from public.notification
     where ref_id = (select id from ids where name = 'q1') $$,
  $$ select 'quote_ready'::text, number, '/portal/teklif/' || id, 'whatsapp'::text from public.quote
     where id = (select id from ids where name = 'q1') $$,
  'quote_ready goes to the customer with the number and path');

insert into ids select 'q2', public.ops_issue_quote('91200000-0000-4000-8000-000000000301', p_discount_bp => 1000,
  p_discount_note => 'Pilot indirimi');
select is((select status::text from public.quote where id = (select id from ids where name = 'q1')),
  'superseded', 'a new quote supersedes the open one');
select is((select count(*)::integer from public.audit_event
           where action = 'quote.superseded' and entity_id = (select id from ids where name = 'q1')),
  1, 'superseding is audited');
select results_eq(
  $$ select status::text, discount_kurus, total_kurus from public.quote where id = (select id from ids where name = 'q2') $$,
  $$ values ('issued'::text, 189600::bigint, 2047680::bigint) $$, 'the discount is in the new quote');
select is((select status::text from public.service_application where id = '91200000-0000-4000-8000-000000000301'),
  'quoted', 'quoted → quoted');

-- Acceptance -------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  pg_temp.error_of(format('select public.customer_accept_quote(%L, pg_temp.consents())', (select id from ids where name = 'q2'))),
  'P0002 not_found', 'only the quote''s customer accepts it');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(
  pg_temp.error_of(format($$ select public.customer_accept_quote(%L, '{"pre_information": "onbilgi-v5-taslak"}') $$,
    (select id from ids where name = 'q2'))),
  '22023 consent_required / distance_sales', 'the distance sales text is required');
select is(
  pg_temp.error_of(format($$ select public.customer_accept_quote(%L, '{"distance_sales": "mesafeli-v5-taslak"}') $$,
    (select id from ids where name = 'q2'))),
  '22023 consent_required / pre_information', 'the pre-information text is required');
select is(
  pg_temp.error_of(format('select public.customer_accept_quote(%L, pg_temp.consents())', (select id from ids where name = 'q1'))),
  'P0001 quote_not_open', 'a superseded quote cannot be accepted');

update public.org_billing_setting set identity_number_required = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(
  pg_temp.error_of(format('select public.customer_accept_quote(%L, pg_temp.consents())', (select id from ids where name = 'q2'))),
  'P0001 billing_profile_incomplete', 'a TCKN is needed while the org requires it');
update public.org_billing_setting set identity_number_required = false where org_id = 'b0000000-0000-4000-8000-000000000001';

-- A newer record without the acknowledgement (as a backfill could write).
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, recorded_at)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000006', 'kvkk_notice', false, 'kvkk-v1-taslak', 'ops', now() - interval '1 hour');
select is(
  pg_temp.error_of(format('select public.customer_accept_quote(%L, pg_temp.consents())', (select id from ids where name = 'q2'))),
  '22023 consent_required / kvkk_notice', 'the latest KVKK notice record must be an acknowledgement');
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, recorded_at)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000006', 'kvkk_notice', true, 'kvkk-v1-taslak', 'portal', now() - interval '30 minutes');

-- An expired quote (valid_until moved past with the guard off).
set local session_replication_role = replica;
update public.quote set valid_until = (now() at time zone 'Europe/Istanbul')::date - 1
where id = (select id from ids where name = 'q2');
set local session_replication_role = origin;
select is(
  pg_temp.error_of(format('select public.customer_accept_quote(%L, pg_temp.consents())', (select id from ids where name = 'q2'))),
  'P0001 quote_expired', 'an expired quote cannot be accepted');
set local session_replication_role = replica;
update public.quote set valid_until = (now() at time zone 'Europe/Istanbul')::date + 30
where id = (select id from ids where name = 'q2');
set local session_replication_role = origin;

insert into ids select 'o1', public.customer_accept_quote((select id from ids where name = 'q2'), pg_temp.consents());
select results_eq(
  $$ select status::text, total_kurus, paid_kurus, quote_id, payment_due_at = now() + interval '14 days',
            number ~ '^S-[0-9]{4}-[0-9]{6}$'
     from public.service_order where id = (select id from ids where name = 'o1') $$,
  $$ select 'awaiting_payment'::text, 2047680::bigint, 0::bigint, id, true, true from ids where name = 'q2' $$,
  'the order awaits payment for the quote total, due in 14 days');
select results_eq(
  $$ select oi.line_no::integer, oi.amount_kurus, oi.quote_item_id from public.service_order_item oi
     where oi.order_id = (select id from ids where name = 'o1') $$,
  $$ select qi.line_no::integer, qi.line_total_kurus, qi.id from public.quote_item qi
     where qi.quote_id = (select id from ids where name = 'q2') $$,
  'order lines from the quote lines');
select is((select status::text from public.quote where id = (select id from ids where name = 'q2')), 'accepted',
  'the quote is accepted');
select is((select status::text from public.service_application where id = '91200000-0000-4000-8000-000000000301'),
  'accepted', 'the application is accepted');
select results_eq(
  $$ select kind::text, text_version, source::text from private.consent_record
     where order_id = (select id from ids where name = 'o1') and quote_id = (select id from ids where name = 'q2')
     order by kind $$,
  $$ values ('distance_sales'::text, 'mesafeli-v5-taslak'::text, 'quote_acceptance'::text),
            ('pre_information', 'onbilgi-v5-taslak', 'quote_acceptance') $$,
  'both texts are recorded with the quote and the order');
select is(
  (select count(*)::integer from public.audit_event
   where (action, entity_id) in (('quote.accepted', (select id from ids where name = 'q2')),
                                 ('order.created', (select id from ids where name = 'o1')))),
  2, 'acceptance and order are audited');
select is(
  pg_temp.error_of(format('select public.customer_accept_quote(%L, pg_temp.consents())', (select id from ids where name = 'q2'))),
  'P0001 quote_not_open', 'an accepted quote is final');
select is(
  pg_temp.error_of(format('select public.customer_payment_instructions(%L)', (select id from ids where name = 'o1'))), null,
  'payment instructions for the own order');
select results_eq(
  format('select iban, reference, outstanding_kurus from public.customer_payment_instructions(%L)',
    (select id from ids where name = 'o1')),
  $$ select 'TR000000000000000000000001'::text, number, 648000::bigint from public.service_order
     where id = (select id from ids where name = 'o1') $$,
  'IBAN, the order number as reference and the open amount of the first installment (inventory, 10 % off, VAT)');

-- Decline -------------------------------------------------------------------------

insert into ids select 'a2', pg_temp.verified_application(20000);
insert into ids select 'q3', public.ops_issue_quote((select id from ids where name = 'a2'));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select public.customer_decline_quote((select id from ids where name = 'q3'), true, 'Alanı yeniden ölçün lütfen.');
select is((select status::text from public.quote where id = (select id from ids where name = 'q3')), 'declined',
  'declined quote');
select results_eq(
  $$ select status::text, customer_note from public.service_application where id = (select id from ids where name = 'a2') $$,
  $$ values ('submitted'::text, 'Alanı yeniden ölçün lütfen.'::text) $$,
  'a revision request sends the application back to review with the note');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into ids select 'q4', public.ops_issue_quote((select id from ids where name = 'a2'));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select public.customer_decline_quote((select id from ids where name = 'q4'));
select is((select status::text from public.service_application where id = (select id from ids where name = 'a2')),
  'withdrawn', 'declining without a revision withdraws the application');
select is(
  pg_temp.error_of(format('select public.customer_decline_quote(%L)', (select id from ids where name = 'q4'))),
  'P0001 quote_not_open', 'a declined quote is final');

-- Expiry and rejection ------------------------------------------------------------

insert into ids select 'a3', pg_temp.verified_application(20000);
insert into ids select 'q5', public.ops_issue_quote((select id from ids where name = 'a3'));
set local session_replication_role = replica;
update public.quote set valid_until = (now() at time zone 'Europe/Istanbul')::date - 1
where id = (select id from ids where name = 'q5');
set local session_replication_role = origin;
select ok((private.billing_housekeeping() ->> 'quotes_expired')::integer >= 1, 'housekeeping expires quotes');
select is((select status::text from public.quote where id = (select id from ids where name = 'q5')), 'expired',
  'the past quote is expired');
select is((select status::text from public.service_application where id = (select id from ids where name = 'a3')),
  'submitted', 'its application goes back to review');
select is((select count(*)::integer from public.audit_event
           where action = 'quote.expired' and entity_id = (select id from ids where name = 'q5') and actor_role = 'system'),
  1, 'expiry is audited as the system');

select public.ops_reject_application((select id from ids where name = 'a3'), 'capacity');
select results_eq(
  $$ select template::text, vars ->> 'ref', vars ->> 'path' from public.notification
     where ref_id = (select id from ids where name = 'a3') $$,
  $$ select 'application_rejected'::text, number, '/portal/basvuru/' || id from public.service_application
     where id = (select id from ids where name = 'a3') $$,
  'application_rejected goes to the customer (no reason in the message)');
select is(
  pg_temp.error_of(format('select public.ops_issue_quote(%L)', (select id from ids where name = 'a3'))),
  'P0001 application_not_open', 'a rejected application gets no quote');

-- Zero total, then a renewal of that order -----------------------------------------

insert into ids select 'a4', pg_temp.verified_application(20000);
insert into ids select 'q6', public.ops_issue_quote((select id from ids where name = 'a4'), p_discount_bp => 10000,
  p_discount_note => 'Pilot: ücretsiz');
select is((select total_kurus from public.quote where id = (select id from ids where name = 'q6')), 0::bigint,
  'a full discount makes a zero total');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'o2', public.customer_accept_quote((select id from ids where name = 'q6'), pg_temp.consents());
select results_eq(
  $$ select status::text, service_start = (now() at time zone 'Europe/Istanbul')::date,
            service_end = (service_start + interval '1 year' - interval '1 day')::date
     from public.service_order where id = (select id from ids where name = 'o2') $$,
  $$ values ('active'::text, true, true) $$,
  'a zero total is active at once, for one year');
insert into ids select 'parcel', parcel_id from public.service_order_item where order_id = (select id from ids where name = 'o2');
select isnt((select id from ids where name = 'parcel'), null, 'the order line has its parcel');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(
  pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001', array[%L, gen_random_uuid()]::uuid[],
    false, null, %L) $$, (select id from ids where name = 'parcel'), (select id from ids where name = 'o2'))),
  '22023 invalid_input / parcel_ids', 'every parcel must be the customer''s');
select is(
  pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001', array[%L]::uuid[],
    true, null, %L) $$, (select id from ids where name = 'parcel'), (select id from ids where name = 'o2'))),
  '22023 invalid_input / first_year', 'a renewal is not a first year');
select is(
  pg_temp.error_of(format($$ select public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000005', '91200000-0000-4000-8000-000000000001', array[%L]::uuid[],
    false, null) $$, (select id from ids where name = 'parcel'))),
  '42501 forbidden', 'ops cannot quote for themself');
insert into ids select 'q7', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001',
  array[(select id from ids where name = 'parcel')], false, null, (select id from ids where name = 'o2'));
select results_eq(
  $$ select q.renewal_of_order_id, q.application_id, q.first_year, q.proposed_service_start, q.total_kurus,
            q.inputs -> 'areas' -> 0 ->> 'source'
     from public.quote q where q.id = (select id from ids where name = 'q7') $$,
  $$ select o.id, null::uuid, false, o.service_end + 1, 1728000::bigint, 'estimated'::text
     from public.service_order o where o.id = (select id from ids where name = 'o2') $$,
  'a renewal quote starts the day after the old service ends');
select is((select parcel_id from public.quote_item where quote_id = (select id from ids where name = 'q7')),
  (select id from ids where name = 'parcel'), 'the renewal line is the parcel');
insert into ids select 'q8', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001',
  array[(select id from ids where name = 'parcel')], false, null, (select id from ids where name = 'o2'));
select is((select status::text from public.quote where id = (select id from ids where name = 'q7')), 'superseded',
  'a new renewal quote supersedes the open one');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'o3', public.customer_accept_quote((select id from ids where name = 'q8'), pg_temp.consents());
select results_eq(
  $$ select renewal_of_order_id, status::text from public.service_order where id = (select id from ids where name = 'o3') $$,
  $$ select id, 'awaiting_payment'::text from ids where name = 'o2' $$,
  'the renewal order points at the old order');

-- Withdrawal cancels the open quote -------------------------------------------------

insert into ids select 'a5', pg_temp.verified_application(20000);
insert into ids select 'q9', public.ops_issue_quote((select id from ids where name = 'a5'));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select public.customer_withdraw_application((select id from ids where name = 'a5'));
select is((select status::text from public.quote where id = (select id from ids where name = 'q9')), 'cancelled',
  'withdrawing cancels the open quote');

-- Audit without personal data ------------------------------------------------------

select is(
  (select count(*)::integer from public.audit_event e
   where e.entity_type in ('quote', 'order')
     and (e.details::text like '%Örnek%' or e.details::text like '%+90%' or e.details::text like '%@%')),
  0, 'quote and order audit rows carry no names, phones or e-mails');
select is(
  (select count(*)::integer from public.notification n
   where n.ref_id is not null and (n.vars - array['ref', 'path']) <> '{}'::jsonb),
  0, 'account messages carry only the number and the path');

select * from finish();
rollback;
