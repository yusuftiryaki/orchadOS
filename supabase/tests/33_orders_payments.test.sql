-- Orders and payments (IP12-A2, docs/musteri-yonetimi.md §4.8, §5.3, §5.4,
-- §6.9): card attempts (begin, token, events, finalize), activation with the
-- parcel, idempotency, mismatch, closed order, overpayment, live attempts,
-- bank transfers, review, reconciliation and the fake provider locks. The
-- payment plan (installments-v1, §5.6): a card attempt pays the earliest open
-- installment, the inventory of 720 000; the order activates once it is paid;
-- a transfer is spread over the open installments.
-- Seed: ops a0..05, customer a0..06 (owner and billing profile, whatsapp),
-- package standart 9120..0001, price list v1: an order of 20 dönüm (first year)
-- totals 2 448 000 kuruş: inventory 720 000, then 4 × 432 000. The whole file is one transaction (now() is constant), so
-- times are set explicitly where they matter. Functions run as postgres with
-- the user's JWT claims; grants are in 35_billing_security.
begin;
create extension if not exists pgtap with schema extensions;
select plan(106);

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
-- An accepted order of the customer for one verified garden (20 dönüm).
create function pg_temp.new_order(p_boundary boolean default false) returns uuid language plpgsql
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
    jsonb_build_object('name', 'Test Bahçesi', 'declared_area_m2', 20000, 'lon', 37.6, 'lat', 37.1)
      || case when p_boundary
           then '{"boundary": [[37.6, 37.1], [37.602, 37.1], [37.602, 37.101], [37.6, 37.101]]}'::jsonb
           else '{}'::jsonb end,
    '{"authorization_basis": "title_holder", "entry_permission": true, "deed_block": "88", "access_note": "Kapı kuzeyde"}');
  perform public.customer_submit_application(a);
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  perform public.ops_verify_application_garden(g, 20000);
  q := public.ops_issue_quote(a);
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
  o := public.customer_accept_quote(q, '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  return o;
end;
$$;
create function pg_temp.begin_card(p_order uuid) returns uuid language sql
as $$ select (public.payment_begin(p_order, 'a0000000-0000-4000-8000-000000000006', 'fake', 'http://127.0.0.1:3100')
              ->> 'payment_id')::uuid $$;
create function pg_temp.ok(p_amount bigint, p_ref text default 'fake_pay') returns jsonb language sql immutable
as $$ select jsonb_build_object('provider_payment_id', p_ref, 'provider_amount_kurus', p_amount, 'paid_kurus', p_amount,
  'installment', 1, 'card_association', 'FAKE', 'card_family', 'Sahte', 'card_last4', '0000', 'fraud_status', 1,
  'failure_code', null, 'items', '[]'::jsonb) $$;
create temporary table ids (name text primary key, id uuid) on commit drop;
create function pg_temp.id(p_name text) returns uuid language sql stable
as $$ select id from ids where name = p_name $$;

-- payment_begin --------------------------------------------------------------------

insert into ids select 'o1', pg_temp.new_order(true);
update public.org_billing_setting set allow_fake_payments = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(pg_temp.error_of($$ select pg_temp.begin_card(pg_temp.id('o1')) $$), 'P0001 fake_payments_disabled',
  'no fake attempt while the org does not allow fake payments');
update public.org_billing_setting set allow_fake_payments = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(
  pg_temp.error_of($$ select public.payment_begin(pg_temp.id('o1'), 'a0000000-0000-4000-8000-000000000001', 'fake',
    'http://127.0.0.1:3100') $$),
  'P0002 not_found', 'only the order''s customer begins a payment');
select is(
  pg_temp.error_of($$ select public.payment_begin(pg_temp.id('o1'), 'a0000000-0000-4000-8000-000000000006', 'manual',
    'http://127.0.0.1:3100') $$),
  '22023 invalid_input / provider', 'manual is not a card provider');
select is(
  pg_temp.error_of($$ select public.payment_begin(pg_temp.id('o1'), 'a0000000-0000-4000-8000-000000000006', 'fake',
    'http://127.0.0.1:3100/portal') $$),
  '22023 invalid_input / return_origin', 'the return origin has no path');

create temporary table begun (n integer primary key, r jsonb) on commit drop;
insert into begun values (1, public.payment_begin(pg_temp.id('o1'), 'a0000000-0000-4000-8000-000000000006', 'fake',
  'http://127.0.0.1:3100'));
insert into ids select 'p1', ((select r from begun where n = 1) ->> 'payment_id')::uuid;
select results_eq(
  $$ select r ->> 'amount_kurus', r ->> 'currency', r -> 'buyer' ->> 'identity_number', r -> 'buyer' ->> 'phone',
            r -> 'buyer' ->> 'first_name', r -> 'billing' ->> 'contact_name', jsonb_array_length(r -> 'items'),
            r -> 'items' -> 0 ->> 'amount_kurus'
     from begun where n = 1 $$,
  $$ values ('720000'::text, 'TRY'::text, '11111111111'::text, '+905550000006'::text, 'Örnek'::text,
             'Örnek Müşteri'::text, 1, '720000'::text) $$,
  'the attempt: the first installment (inventory), one line per order line, placeholder TCKN, the buyer');
select is((select order_installment_id from public.payment where id = pg_temp.id('p1')),
  (select id from public.order_installment where order_id = pg_temp.id('o1') and seq = 1),
  'the attempt pays the first installment');
select ok(not exists (select 1 from private.payment_billing_snapshot where payment_id = pg_temp.id('p1')),
  'payment_begin writes no snapshot');
select is((select count(*)::integer from public.audit_event where action = 'payment.initiated'
           and entity_id = pg_temp.id('p1') and actor_role = 'customer'), 1, 'the attempt is audited as the customer');

update public.org_billing_setting set identity_number_required = true where org_id = 'b0000000-0000-4000-8000-000000000001';
update private.billing_profile set identity_number = '10000000146'
where org_id = 'b0000000-0000-4000-8000-000000000001' and user_id = 'a0000000-0000-4000-8000-000000000006';
insert into begun values (2, public.payment_begin(pg_temp.id('o1'), 'a0000000-0000-4000-8000-000000000006', 'fake',
  'http://127.0.0.1:3100'));
insert into ids select 'p2', ((select r from begun where n = 2) ->> 'payment_id')::uuid;
select is((select r -> 'buyer' ->> 'identity_number' from begun where n = 2), '10000000146',
  'the real TCKN only while the org requires it');
select results_eq(
  $$ select status::text, failure_code from public.payment where id = pg_temp.id('p1') $$,
  $$ values ('expired'::text, 'superseded'::text) $$, 'a new attempt supersedes the live one');
select is(
  pg_temp.error_of($$ select public.payment_attach_token(pg_temp.id('p1'), 'fake_tok_33_old', now() + interval '30 minutes') $$),
  '55000 payment_not_open', 'a superseded attempt takes no token');
select public.payment_attach_token(pg_temp.id('p2'), 'fake_tok_33_a', now() + interval '30 minutes');
select results_eq(
  $$ select identity_number_last4, first_name, phone from private.payment_billing_snapshot where payment_id = pg_temp.id('p2') $$,
  $$ values ('0146'::text, 'Örnek'::text, '+905550000006'::text) $$,
  'the token brings the snapshot, TCKN as its last four digits');
update public.org_billing_setting set identity_number_required = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(
  pg_temp.error_of($$ select public.payment_attach_token(pg_temp.id('p2'), 'fake_tok_33_b', now() + interval '30 minutes') $$),
  '55000 payment_not_open', 'a token is attached once');
select results_eq(
  $$ select id, status from public.payment_by_token('fake_tok_33_a') $$,
  $$ select pg_temp.id('p2'), 'initiated'::text $$, 'the payment of a token');

-- Events ------------------------------------------------------------------------

select is(
  pg_temp.error_of($$ select public.payment_record_event('fake', 'webhook', 'wh:33:1', null, null, false, null, null, '{}') $$),
  '22023 invalid_input / signature_valid', 'an invalid signature is never written');
select is(public.payment_record_event('fake', 'callback', 'cb:33:1', pg_temp.id('p2'), null, true, 200, 'ok', '{"a": 1}'),
  true, 'a new event');
select is(public.payment_record_event('fake', 'callback', 'cb:33:1', pg_temp.id('p2'), null, true, 200, 'ok', '{"a": 1}'),
  false, 'the same event again is not new');
select is((select org_id from private.payment_event where dedup_key = 'cb:33:1'),
  'b0000000-0000-4000-8000-000000000001'::uuid, 'the event takes the payment''s org');

-- Live attempt ---------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select public.customer_cancel_order(pg_temp.id('o1')) $$), 'P0001 payment_in_progress',
  'the customer cannot cancel while a card payment is in progress');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_cancel_order(pg_temp.id('o1')) $$), 'P0001 payment_in_progress',
  'nor can ops');
select is(
  pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o1'), 2448000, current_date, 'EFT-1') $$),
  'P0001 payment_in_progress', 'no transfer is recorded while a card payment is in progress');

-- Success, idempotency, activation ------------------------------------------------

select is(public.payment_finalize(pg_temp.id('p2'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_2')), 'succeeded',
  'the attempt succeeds');
select is(public.payment_finalize(pg_temp.id('p2'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_2')), 'succeeded',
  'again: unchanged');
select is(public.payment_finalize(pg_temp.id('p2'), 'failed', '{"failure_code": "card_declined"}'), 'succeeded',
  'a later failure does not change a final row');
select results_eq(
  $$ select status::text, receipt_number ~ '^M-[0-9]{4}-[0-9]{6}$', provider_payment_id, card_last4, fraud_status::integer
     from public.payment where id = pg_temp.id('p2') $$,
  $$ values ('succeeded'::text, true, 'fake_pay_33_2'::text, '0000'::text, 1) $$, 'receipt number and provider fields');
select is((select count(*)::integer from public.audit_event where action = 'payment.succeeded' and entity_id = pg_temp.id('p2')),
  1, 'three calls: one audit row');
select is((select count(*)::integer from public.notification where template = 'payment_received' and ref_id = pg_temp.id('p2')),
  1, 'one payment_received message');
select results_eq(
  $$ select status::text, paid_kurus, service_start = (now() at time zone 'Europe/Istanbul')::date,
            service_end = (service_start + interval '1 year' - interval '1 day')::date, activated_at is not null
     from public.service_order where id = pg_temp.id('o1') $$,
  $$ values ('active'::text, 720000::bigint, true, true, true) $$,
  'the first installment paid: the order is active for one year, the amount counted once');
select results_eq(
  $$ select seq::integer, kind::text, status::text, paid_kurus from public.order_installment
     where order_id = pg_temp.id('o1') order by seq $$,
  $$ values (1, 'inventory'::text, 'paid'::text, 720000::bigint), (2, 'visit', 'pending', 0::bigint),
            (3, 'visit', 'pending', 0), (4, 'visit', 'pending', 0), (5, 'visit', 'pending', 0) $$,
  'the inventory installment is paid, the visit installments are open');
select is((select count(*)::integer from public.audit_event where action = 'order.activated' and entity_id = pg_temp.id('o1')),
  1, 'one activation');
insert into ids select 'parcel1', parcel_id from public.service_order_item where order_id = pg_temp.id('o1');
select results_eq(
  $$ select p.status::text, p.name, p.estimated_area_m2, p.org_id from public.parcel p where p.id = pg_temp.id('parcel1') $$,
  $$ values ('registered'::text, 'Test Bahçesi'::text, 20000.00::numeric, 'b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'a registered parcel for the garden');
select is(
  (select role::text from public.parcel_access where parcel_id = pg_temp.id('parcel1')
   and user_id = 'a0000000-0000-4000-8000-000000000006'),
  'owner', 'the customer owns it');
select results_eq(
  $$ select authorization_basis::text, deed_block, access_note from private.parcel_detail where parcel_id = pg_temp.id('parcel1') $$,
  $$ values ('title_holder'::text, '88'::text, 'Kapı kuzeyde'::text) $$, 'the garden detail is copied');
select results_eq(
  $$ select version, source::text from public.boundary where parcel_id = pg_temp.id('parcel1') $$,
  $$ values (1, 'owner_declared'::text) $$, 'the rough boundary is version 1, owner_declared');
select is(
  (select g.parcel_id from public.application_garden g
   join public.quote_item qi on qi.application_garden_id = g.id
   join public.service_order o on o.quote_id = qi.quote_id where o.id = pg_temp.id('o1')),
  pg_temp.id('parcel1'), 'the garden keeps its parcel');
select is(private.activate_order(pg_temp.id('o1')), false, 'activation is idempotent');
select is((select count(*)::integer from public.service_order_item oi join public.parcel p on p.id = oi.parcel_id
           where oi.order_id = pg_temp.id('o1')), 1, 'still one parcel');
select is(
  (select r ->> 'amount_kurus' from (select public.payment_begin(pg_temp.id('o1'), 'a0000000-0000-4000-8000-000000000006',
    'fake', 'http://127.0.0.1:3100') r) x),
  '432000', 'an active order takes an attempt for its next installment');
update public.payment set status = 'expired', token_expires_at = now() - interval '1 hour'
where order_id = pg_temp.id('o1') and status = 'initiated';
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is((public.receipt_data(pg_temp.id('p2')) ->> 'order_number'),
  (select number from public.service_order where id = pg_temp.id('o1')), 'the customer reads the receipt');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.receipt_data(pg_temp.id('p2')), null, 'nobody else does');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.customer_cancel_order(pg_temp.id('o1')) $$), 'P0002 not_found',
  'only the customer cancels their order');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select public.customer_cancel_order(pg_temp.id('o1')) $$), 'P0001 order_active',
  'an active order is not cancelled');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

-- Bank transfers -------------------------------------------------------------------

insert into ids select 'o3', pg_temp.new_order();
select is(
  pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o3'), 2448001, current_date, 'EFT-2') $$),
  'P0001 amount_exceeds_balance', 'a transfer beyond the balance is refused');
select is(
  pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o3'), 100, current_date, ' ') $$),
  '22023 invalid_input / bank_reference', 'a transfer needs the bank reference');
select is(
  pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o3'), 100, current_date + 2, 'EFT-2') $$),
  '22023 invalid_input / value_date', 'no value date in the future');
insert into ids select 'm1', public.ops_record_manual_payment(pg_temp.id('o3'), 200000, current_date, 'EFT-2', 'Kısmi');
select results_eq(
  $$ select status::text, paid_kurus from public.service_order where id = pg_temp.id('o3') $$,
  $$ values ('awaiting_payment'::text, 200000::bigint) $$, 'a partial transfer keeps the order waiting');
select results_eq(
  $$ select p.provider::text, p.status::text, p.receipt_number is not null, p.recorded_by, i.order_item_id, i.amount_kurus
     from public.payment p join public.payment_item i on i.payment_id = p.id where p.id = pg_temp.id('m1') $$,
  $$ values ('manual'::text, 'succeeded'::text, true, 'a0000000-0000-4000-8000-000000000005'::uuid, null::uuid, 200000::bigint) $$,
  'a transfer is succeeded with a receipt and a balance line');
select ok(exists (select 1 from private.payment_billing_snapshot where payment_id = pg_temp.id('m1')),
  'a transfer writes the snapshot');
select is(
  (select r -> 'amount_kurus' from (select public.payment_begin(pg_temp.id('o3'), 'a0000000-0000-4000-8000-000000000006',
    'fake', 'http://127.0.0.1:3100') r) x)::text,
  '520000', 'a card attempt takes the rest of the open installment');
-- Give the attempt up (its token ran out), then pay the rest by transfer.
update public.payment set status = 'expired', token_expires_at = now() - interval '1 hour'
where order_id = pg_temp.id('o3') and provider = 'fake';
insert into ids select 'm2', public.ops_record_manual_payment(pg_temp.id('o3'), 2248000, current_date, 'EFT-3');
select is((select status::text from public.service_order where id = pg_temp.id('o3')), 'active',
  'the rest by transfer activates the order');
select results_eq(
  $$ select count(*)::integer, sum(amount_kurus), count(distinct order_installment_id)::integer, count(distinct receipt_number)::integer
     from public.payment where order_id = pg_temp.id('o3') and bank_reference = 'EFT-3' $$,
  $$ values (5, 2248000::numeric, 5, 5) $$,
  'a transfer for several installments is one payment and receipt per installment');
select is(pg_temp.error_of($$ select public.ops_void_manual_payment(pg_temp.id('m2'), 'Yanlış kayıt') $$),
  'P0001 order_active', 'a transfer of an active order is not voided');
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o3'), 1, current_date, 'EFT-4') $$),
  'P0001 order_not_payable', 'no transfer once every installment is paid');

insert into ids select 'o3b', pg_temp.new_order();
insert into ids select 'm3', public.ops_record_manual_payment(pg_temp.id('o3b'), 300000, current_date, 'EFT-5');
select is(pg_temp.error_of($$ select public.ops_void_manual_payment(pg_temp.id('m3'), ' ') $$),
  '22023 invalid_input / note', 'voiding a transfer needs a note');
select public.ops_void_manual_payment(pg_temp.id('m3'), 'Yanlış sipariş');
select results_eq(
  $$ select p.status::text, o.paid_kurus from public.payment p join public.service_order o on o.id = p.order_id
     where p.id = pg_temp.id('m3') $$,
  $$ values ('voided'::text, 0::bigint) $$, 'a voided transfer leaves the order''s paid amount');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select public.customer_cancel_order(pg_temp.id('o3b'));
select is((select status::text || ':' || cancel_reason from public.service_order where id = pg_temp.id('o3b')),
  'cancelled:customer_cancelled', 'the customer cancels an order without payments');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

-- Mismatch -----------------------------------------------------------------------

insert into ids select 'o4', pg_temp.new_order();
insert into ids select 'p4', pg_temp.begin_card(pg_temp.id('o4'));
select is(public.payment_finalize(pg_temp.id('p4'), 'succeeded', pg_temp.ok(1100000, 'fake_pay_33_4')), 'pending_review',
  'success for another amount goes to review');
select results_eq(
  $$ select status::text, failure_code, provider_amount_kurus, receipt_number from public.payment where id = pg_temp.id('p4') $$,
  $$ values ('pending_review'::text, 'amount_mismatch'::text, 1100000::bigint, null::text) $$,
  'amount_mismatch with the provider''s amount, no receipt');
select results_eq(
  $$ select kind::text, reason::text, amount_kurus, status::text, requested_by from public.refund where payment_id = pg_temp.id('p4') $$,
  $$ values ('void'::text, 'provider_mismatch'::text, 1100000::bigint, 'requested'::text, null::uuid) $$,
  'a system void of the provider''s amount');
select results_eq(
  $$ select status::text, paid_kurus from public.service_order where id = pg_temp.id('o4') $$,
  $$ values ('awaiting_payment'::text, 0::bigint) $$, 'the order is not paid by it');
select is(public.payment_finalize(pg_temp.id('p4'), 'pending_review', '{"failure_code": "amount_mismatch"}'), 'pending_review',
  'repeated: unchanged');
select is((select count(*)::integer from public.refund where payment_id = pg_temp.id('p4')), 1, 'still one void');
select is(pg_temp.error_of($$ select public.ops_resolve_payment_review(pg_temp.id('p4'), true, 'fake_pay_33_4') $$),
  '55000 payment_not_open', 'a mismatch is not resolved by hand');
-- A mismatch row leaves review only through its void (review finding 2, 6).
select is(public.payment_finalize(pg_temp.id('p4'), 'failed', '{"failure_code": "not_completed"}'), 'pending_review',
  'a later failed report does not touch a mismatch in review');
select is(public.payment_finalize(pg_temp.id('p4'), 'succeeded', pg_temp.ok(2448000, 'fake_pay_33_4')), 'pending_review',
  'nor does a later success with the right amount');
select results_eq(
  $$ select p.status::text, p.failure_code, o.status::text, o.paid_kurus
     from public.payment p join public.service_order o on o.id = p.order_id where p.id = pg_temp.id('p4') $$,
  $$ values ('pending_review'::text, 'amount_mismatch'::text, 'awaiting_payment'::text, 0::bigint) $$,
  'the payment and the order are unchanged');
select is(pg_temp.error_of($$ select public.ops_cancel_refund(r.id) from public.refund r where r.payment_id = pg_temp.id('p4') $$),
  'P0001 refund_not_open', 'the system void of a mismatch in review is not cancelled');
select is((select status::text from public.refund where payment_id = pg_temp.id('p4')), 'requested', 'it stays requested');

insert into ids select 'p4b', pg_temp.begin_card(pg_temp.id('o4'));
select is(public.payment_finalize(pg_temp.id('p4b'), 'pending_review',
  pg_temp.ok(2448000, 'fake_pay_33_4b') || '{"failure_code": "reference_mismatch"}'), 'pending_review',
  'a reference mismatch goes to review');
select results_eq(
  $$ select r.kind::text, r.reason::text, r.amount_kurus, p.failure_code
     from public.refund r join public.payment p on p.id = r.payment_id where r.payment_id = pg_temp.id('p4b') $$,
  $$ values ('void'::text, 'provider_mismatch'::text, 2448000::bigint, 'reference_mismatch'::text) $$,
  'and gets a void too');

-- Fraud review --------------------------------------------------------------------

insert into ids select 'o5', pg_temp.new_order();
insert into ids select 'p5', pg_temp.begin_card(pg_temp.id('o5'));
select is(public.payment_finalize(pg_temp.id('p5'), 'pending_review',
  pg_temp.ok(2448000, 'fake_pay_33_5') || '{"fraud_status": 0, "failure_code": "fraud_review"}'), 'pending_review',
  'a fraud review');
select is((select count(*)::integer from public.refund where payment_id = pg_temp.id('p5')), 0, 'no refund for a review');
select is(pg_temp.error_of($$ select public.ops_resolve_payment_review(pg_temp.id('p5'), true, null) $$),
  '22023 invalid_input / provider_ref', 'accepting needs the provider reference');
select is(pg_temp.error_of($$ select public.ops_resolve_payment_review(pg_temp.id('p5'), true, 'other') $$),
  '22023 invalid_input / provider_ref', 'the reference must be the payment''s');
select public.ops_resolve_payment_review(pg_temp.id('p5'), true, 'fake_pay_33_5');
select results_eq(
  $$ select p.status::text, p.receipt_number is not null, o.status::text
     from public.payment p join public.service_order o on o.id = p.order_id where p.id = pg_temp.id('p5') $$,
  $$ values ('succeeded'::text, true, 'active'::text) $$, 'an accepted review pays and activates the order');

-- Closed order --------------------------------------------------------------------

insert into ids select 'o6', pg_temp.new_order();
insert into ids select 'p6', pg_temp.begin_card(pg_temp.id('o6'));
select public.payment_attach_token(pg_temp.id('p6'), 'fake_tok_33_6', now() - interval '1 hour');
select public.ops_cancel_order(pg_temp.id('o6'), 'Müşteri aradı');
select is((select status::text from public.service_order where id = pg_temp.id('o6')), 'cancelled',
  'an order with only a dead attempt is cancelled');
select is(public.payment_finalize(pg_temp.id('p6'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_6')), 'succeeded',
  'a late success on the cancelled order');
select results_eq(
  $$ select reason::text, amount_kurus, kind::text from public.refund where payment_id = pg_temp.id('p6') $$,
  $$ values ('order_closed'::text, 720000::bigint, 'void'::text) $$, 'is refunded in full (void on the same day)');
select results_eq(
  $$ select status::text, paid_kurus from public.service_order where id = pg_temp.id('o6') $$,
  $$ values ('cancelled'::text, 720000::bigint) $$, 'the order stays cancelled');
select is((select array_agg(distinct status::text) from public.order_installment where order_id = pg_temp.id('o6')),
  array['cancelled'], 'the cancelled order''s installments are cancelled');

-- Overpayment --------------------------------------------------------------------

insert into ids select 'o7', pg_temp.new_order();
insert into ids select 'p7', pg_temp.begin_card(pg_temp.id('o7'));
select public.payment_attach_token(pg_temp.id('p7'), 'fake_tok_33_7', now() - interval '1 hour');
select public.ops_record_manual_payment(pg_temp.id('o7'), 2448000, current_date, 'EFT-7');
select is(public.payment_finalize(pg_temp.id('p7'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_7')), 'succeeded',
  'a late card success after the transfer');
select results_eq(
  $$ select reason::text, amount_kurus from public.refund where payment_id = pg_temp.id('p7') $$,
  $$ values ('overpayment'::text, 720000::bigint) $$, 'the card payment of a paid installment is refunded');
select results_eq(
  $$ select status::text, paid_kurus from public.service_order where id = pg_temp.id('o7') $$,
  $$ values ('active'::text, 3168000::bigint) $$, 'both payments are counted');
select is((select count(*)::integer from public.audit_event where action = 'order.activated' and entity_id = pg_temp.id('o7')),
  1, 'activated once');

-- Failure, expiry, fake lock -----------------------------------------------------

insert into ids select 'o9', pg_temp.new_order();
insert into ids select 'p9', pg_temp.begin_card(pg_temp.id('o9'));
update public.org_billing_setting set allow_fake_payments = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(pg_temp.error_of($$ select public.payment_finalize(pg_temp.id('p9'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_9')) $$),
  'P0001 fake_payments_disabled', 'a fake success is refused while fake payments are off');
select is((select status::text from public.payment where id = pg_temp.id('p9')), 'initiated', 'nothing was written');
update public.org_billing_setting set allow_fake_payments = true where org_id = 'b0000000-0000-4000-8000-000000000001';
select is(public.payment_finalize(pg_temp.id('p9'), 'expired', '{}'), 'expired', 'initiated → expired');
select is(public.payment_finalize(pg_temp.id('p9'), 'failed', '{"failure_code": "Bad Code!"}'), 'failed', 'expired → failed');
select is((select failure_code from public.payment where id = pg_temp.id('p9')), 'provider_error',
  'a failure code of another shape is stored as provider_error');
select is(pg_temp.error_of($$ select public.payment_finalize(pg_temp.id('p9'), 'done', '{}') $$),
  '22023 invalid_input / outcome', 'unknown outcome');
select is(pg_temp.error_of($$ select public.payment_finalize(pg_temp.id('m1'), 'succeeded', '{}') $$),
  '55000 payment_not_open', 'a transfer is not finalized');

-- Late success after failed (review finding 1) --------------------------------

insert into ids select 'o10', pg_temp.new_order();
insert into ids select 'p10', pg_temp.begin_card(pg_temp.id('o10'));
select public.payment_attach_token(pg_temp.id('p10'), 'fake_tok_33_10', now() + interval '30 minutes');
select is(public.payment_finalize(pg_temp.id('p10'), 'failed', '{"failure_code": "not_completed"}'), 'failed',
  'an unfinished form is failed');
select is(public.payment_finalize(pg_temp.id('p10'), 'failed', '{"failure_code": "card_declined"}'), 'failed',
  'a failed row stays failed on another failed report');
select is(public.payment_finalize(pg_temp.id('p10'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_10')), 'succeeded',
  'a capture reported after the failure is written as a success');
select results_eq(
  $$ select p.receipt_number is not null, p.failure_code, o.status::text, o.paid_kurus
     from public.payment p join public.service_order o on o.id = p.order_id where p.id = pg_temp.id('p10') $$,
  $$ values (true, null::text, 'active'::text, 720000::bigint) $$, 'with a receipt, and the order is activated');
select is((select count(*)::integer from public.audit_event where action = 'payment.late_success' and entity_id = pg_temp.id('p10')),
  1, 'the late success is audited');
select public.payment_record_event('fake', 'retrieve', 'retrieve:fake_tok_33_10:succeeded', pg_temp.id('p10'), null,
  true, 200, 'succeeded', '{}');
select is((select array_agg(dedup_key) from public.ops_payment_events(pg_temp.id('p10')) where event_type = 'retrieve'),
  array['retrieve:…:succeeded'], 'ops see event keys without the provider token (review finding 5)');
update public.payment set failure_code = 'review_rejected' where id = pg_temp.id('p9');
select is(public.payment_finalize(pg_temp.id('p9'), 'succeeded', pg_temp.ok(720000, 'fake_pay_33_9')), 'failed',
  'a review ops rejected is not reopened by a provider report');

-- Refunded money is not paid (review finding 7) -----------------------------------

insert into ids select 'o12', pg_temp.new_order();
insert into ids select 'm12', public.ops_record_manual_payment(pg_temp.id('o12'), 200000, current_date, 'EFT-12');
select public.ops_complete_manual_refund((public.ops_request_refund(pg_temp.id('m12'), 200000, 'withdrawal'))[1], 'EFT-IADE-12',
  (now() at time zone 'Europe/Istanbul')::date);
select results_eq(
  $$ select paid_kurus, refunded_kurus from public.service_order where id = pg_temp.id('o12') $$,
  $$ values (200000::bigint, 200000::bigint) $$, 'setup: a transfer refunded in full');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is((select outstanding_kurus from public.customer_payment_instructions(pg_temp.id('o12'))), 720000::bigint,
  'the refunded transfer is open again in its installment');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into ids select 'm12b', public.ops_record_manual_payment(pg_temp.id('o12'), 520000, current_date, 'EFT-12b');
select is((select status::text from public.service_order where id = pg_temp.id('o12')), 'awaiting_payment',
  'a refunded transfer does not count toward activation');
select is(
  (select r -> 'amount_kurus' from (select public.payment_begin(pg_temp.id('o12'), 'a0000000-0000-4000-8000-000000000006',
    'fake', 'http://127.0.0.1:3100') r) x)::text,
  '200000', 'a card attempt takes what is really missing');
update public.payment set status = 'expired', token_expires_at = now() - interval '1 hour'
where order_id = pg_temp.id('o12') and provider = 'fake';

insert into ids select 'o13', pg_temp.new_order();
insert into ids select 'm13', public.ops_record_manual_payment(pg_temp.id('o13'), 200000, current_date, 'EFT-13');
select public.ops_complete_manual_refund((public.ops_request_refund(pg_temp.id('m13'), 200000, 'withdrawal'))[1], 'EFT-IADE-13',
  (now() at time zone 'Europe/Istanbul')::date);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select lives_ok($$ select public.customer_cancel_order(pg_temp.id('o13')) $$,
  'an order whose only payment was refunded is cancelled');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');

-- Voiding a transfer of a closed order (review finding 4) -------------------------

update public.service_order set status = 'completed', completed_at = now() where id = pg_temp.id('o3');
select is(pg_temp.error_of($$ select public.ops_void_manual_payment(pg_temp.id('m1'), 'Yanlış kayıt') $$),
  'P0001 order_not_payable', 'a transfer of a completed order is not voided');

-- Reconciliation ------------------------------------------------------------------

insert into ids select 'o8', pg_temp.new_order();
insert into public.payment (id, org_id, order_id, customer_user_id, provider, status, amount_kurus, initiated_at,
  token_expires_at, bank_reference, value_date, recorded_by, order_installment_id)
select x.id, 'b0000000-0000-4000-8000-000000000001', pg_temp.id('o8'), 'a0000000-0000-4000-8000-000000000006',
       x.provider::public.payment_provider, x.status::public.payment_status, 720000, x.initiated_at, x.expires,
       x.ref, x.vd, x.rec, (select i.id from public.order_installment i where i.order_id = pg_temp.id('o8') and i.seq = 1)
from (values
  ('93300000-0000-4000-8000-000000000001'::uuid, 'fake', 'initiated', now() - interval '5 minutes', now() + interval '25 minutes', null, null::date, null::uuid),
  ('93300000-0000-4000-8000-000000000002', 'fake', 'initiated', now() - interval '1 minute', now() + interval '29 minutes', null, null, null),
  ('93300000-0000-4000-8000-000000000003', 'iyzico', 'pending_review', now() - interval '3 hours', now() - interval '150 minutes', null, null, null),
  ('93300000-0000-4000-8000-000000000004', 'fake', 'expired', now() - interval '40 minutes', now() - interval '5 minutes', null, null, null),
  ('93300000-0000-4000-8000-000000000005', 'fake', 'expired', now() - interval '60 minutes', now() - interval '20 minutes', null, null, null),
  ('93300000-0000-4000-8000-000000000006', 'manual', 'pending_review', now() - interval '1 hour', null, 'EFT-8', current_date,
   'a0000000-0000-4000-8000-000000000005'),
  ('93300000-0000-4000-8000-000000000007', 'fake', 'failed', now() - interval '30 minutes', now() - interval '5 minutes', null, null, null),
  ('93300000-0000-4000-8000-000000000008', 'fake', 'pending_review', now() - interval '4 hours', now() - interval '210 minutes', null, null, null),
  ('93300000-0000-4000-8000-000000000009', 'fake', 'failed', now() - interval '30 minutes', now() - interval '5 minutes', null, null, null)
) x(id, provider, status, initiated_at, expires, ref, vd, rec);
update public.payment set provider_token = 'fake_tok_33_r' || right(id::text, 1),
  failure_code = case right(id::text, 1) when '7' then 'not_completed' when '8' then 'amount_mismatch'
                                         when '9' then 'card_declined' end
where id in ('93300000-0000-4000-8000-000000000007', '93300000-0000-4000-8000-000000000008',
             '93300000-0000-4000-8000-000000000009');
select results_eq(
  $$ select array_agg(r.id order by r.ordinality) from public.payment_attempts_to_reconcile(500) with ordinality r
     where r.order_id = pg_temp.id('o8') $$,
  $$ values (array['93300000-0000-4000-8000-000000000001', '93300000-0000-4000-8000-000000000004',
                   '93300000-0000-4000-8000-000000000007', '93300000-0000-4000-8000-000000000003']::uuid[]) $$,
  'reconciled: initiated first, then expired / not_completed within 10 min of the token, then fraud reviews; '
  'never mismatch reviews, other failures or transfers');

-- Audit without personal data ----------------------------------------------------

select is(
  (select count(*)::integer from public.audit_event e
   where e.entity_type in ('payment', 'order', 'refund')
     and (e.details::text like '%Örnek%' or e.details::text like '%+90%' or e.details::text like '%@%'
          or e.details::text like '%10000000146%' or e.details::text like '%fake_tok%')),
  0, 'payment audit rows carry no names, phones, e-mails, TCKN or tokens');

select * from finish();
rollback;
