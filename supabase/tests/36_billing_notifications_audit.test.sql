-- Account notifications, the Edge contract and the audit log (IP12-A2,
-- docs/musteri-yonetimi.md §6.3, §6.5, §6.9, §12; B's
-- supabase/functions/_shared/payments/db.ts).
-- 1. notification: report templates need parcel and visit, account templates
--    a document (ref_id); vars hold only parcel_name, date, path, ref; one
--    message per recipient, template and document; channel by preference.
-- 2. ops_notifications lists account messages (no parcel) with their ref.
-- 3. The keys of payment_begin / payment_refund_claim and the columns of
--    payment_by_token / payment_attempts_to_reconcile equal db.ts.
-- 4. Audit rows: explicit actor roles, no personal data; errors without values.
-- Seed: owner a0..01 (whatsapp), viewer a0..02 (sms), ops a0..05, customer
-- a0..06 (whatsapp) with application 9120..0301 and garden 9120..0401.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

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
create function pg_temp.sqlstate_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$;
create temporary table ids (k text primary key, v uuid);
create function pg_temp.id(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;
create function pg_temp.sorted(p text[]) returns text[] language sql immutable
as $$ select array_agg(x order by x) from unnest(p) x $$;
create function pg_temp.keys(p jsonb) returns text[] language sql immutable
as $$ select array_agg(k order by k) from jsonb_object_keys(p) k $$;
grant select on ids to authenticated;
grant execute on all functions in schema pg_temp to authenticated;

-- 1. Queue rules --------------------------------------------------------------------

select is(pg_temp.sqlstate_of($$ insert into public.notification (org_id, recipient_user_id, channel, template, vars)
  values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'sms', 'report_ready',
    '{"parcel_name": "x", "date": "2026-10-14", "path": "/portal/parsel/x"}') $$),
  '23514', 'a report message needs a parcel and a visit');
select is(pg_temp.sqlstate_of($$ insert into public.notification (org_id, recipient_user_id, channel, template, vars)
  values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'sms', 'quote_ready',
    '{"ref": "T-2026-000001", "path": "/portal/teklif/x"}') $$),
  '23514', 'an account message needs its document');
select is(pg_temp.sqlstate_of($$ insert into public.notification (org_id, parcel_id, session_id, recipient_user_id,
    channel, template, vars, ref_id)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'sms', 'quote_ready',
    '{"ref": "T-2026-000001"}', gen_random_uuid()) $$),
  '23514', 'an account message names no visit');
select is(pg_temp.sqlstate_of($$ insert into public.notification (org_id, recipient_user_id, channel, template, vars, ref_id)
  values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'sms', 'payment_received',
    '{"ref": "M-2026-000001", "amount_kurus": 100}', gen_random_uuid()) $$),
  '23514', 'no variables beyond parcel_name, date, path and ref (no amounts)');
select is(pg_temp.sqlstate_of($$ insert into public.notification (org_id, recipient_user_id, channel, template, vars, ref_id)
  values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'sms', 'payment_received',
    '{"ref": "M-2026-000099", "path": "/portal/odeme/x"}', 'f3600000-0000-4000-8000-000000000099') $$),
  null, 'an account message with ref and path is accepted');

select is(private.enqueue_billing_notification('quote_ready', 'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', 'f3600000-0000-4000-8000-000000000001', 'T-2026-009999',
  '/portal/teklif/f3600000-0000-4000-8000-000000000001'), 1, 'an account message is queued');
select is(private.enqueue_billing_notification('quote_ready', 'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', 'f3600000-0000-4000-8000-000000000001', 'T-2026-009999',
  '/portal/teklif/f3600000-0000-4000-8000-000000000001'), 0, 'once per recipient, template and document');
select is(private.enqueue_billing_notification('payment_reminder', 'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', 'f3600000-0000-4000-8000-000000000001', 'S-2026-009999',
  '/portal/siparis/f3600000-0000-4000-8000-000000000001'), 1, 'another template for the same document is a new message');
select has_index('public', 'notification', 'notification_ref_once', 'notification_ref_once exists');
select private.enqueue_billing_notification('quote_ready', 'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002', 'f3600000-0000-4000-8000-000000000002', 'T-2026-009998', '/portal/teklif/x');
select private.enqueue_billing_notification('quote_ready', 'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000003', 'f3600000-0000-4000-8000-000000000003', 'T-2026-009997', '/portal/teklif/y');
select is((select array_agg(recipient_user_id::text || ':' || channel::text order by recipient_user_id)
           from public.notification where ref_id in ('f3600000-0000-4000-8000-000000000001',
             'f3600000-0000-4000-8000-000000000002', 'f3600000-0000-4000-8000-000000000003') and template = 'quote_ready'),
  array['a0000000-0000-4000-8000-000000000002:sms', 'a0000000-0000-4000-8000-000000000003:sms',
        'a0000000-0000-4000-8000-000000000006:whatsapp'],
  'the channel follows the contact preference (sms without a profile)');
select is((select vars from public.notification where ref_id = 'f3600000-0000-4000-8000-000000000001'
           and template = 'quote_ready'),
  '{"ref": "T-2026-009999", "path": "/portal/teklif/f3600000-0000-4000-8000-000000000001"}'::jsonb,
  'only the document number and the portal path');

-- 2. Operations screen ------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select parcel_id::text || '|' || coalesce(parcel_name, '-') || '|' || ref || '|' || recipient_name
           from public.ops_notifications()
           where id = (select n.id from public.notification n where n.ref_id = 'f3600000-0000-4000-8000-000000000001'
                       and n.template = 'quote_ready')),
  null, 'account messages have no parcel');
select is((select coalesce(parcel_name, '-') || '|' || ref || '|' || recipient_name from public.ops_notifications()
           where id = (select n.id from public.notification n where n.ref_id = 'f3600000-0000-4000-8000-000000000001'
                       and n.template = 'quote_ready')),
  '-|T-2026-009999|Örnek Müşteri', 'ops lists them with the document number and the recipient');
select ok((select count(*) from public.ops_notifications() where ref is not null) >= 5, 'every account message is listed');
reset role;

-- 3. Edge contract ---------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.ops_verify_application_garden('91200000-0000-4000-8000-000000000401', 15000);
insert into ids select 'q', public.ops_issue_quote('91200000-0000-4000-8000-000000000301');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'o', public.customer_accept_quote(pg_temp.id('q'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');

create temporary table begin1 as
  select public.payment_begin(pg_temp.id('o'), 'a0000000-0000-4000-8000-000000000006', 'fake',
    'http://127.0.0.1:3100') as b;
insert into ids select 'p', (b ->> 'payment_id')::uuid from begin1;

select is((select pg_temp.keys(b) from begin1),
  pg_temp.sorted(array['payment_id', 'order_id', 'order_number', 'amount_kurus', 'currency', 'items', 'buyer', 'billing']),
  'payment_begin keys = PAYMENT_BEGIN_KEYS');
select is((select pg_temp.keys(b -> 'items' -> 0) from begin1),
  pg_temp.sorted(array['payment_item_id', 'line_no', 'name', 'amount_kurus']), 'item keys = PAYMENT_BEGIN_ITEM_KEYS');
select is((select pg_temp.keys(b -> 'buyer') from begin1),
  pg_temp.sorted(array['id', 'first_name', 'last_name', 'identity_number', 'email', 'phone', 'address', 'district',
    'city', 'country', 'postal_code', 'registered_at']), 'buyer keys = PAYMENT_BEGIN_BUYER_KEYS');
select is((select pg_temp.keys(b -> 'billing') from begin1),
  pg_temp.sorted(array['contact_name', 'address', 'city', 'country', 'postal_code']),
  'billing keys = PAYMENT_BEGIN_BILLING_KEYS');
select is((select b -> 'buyer' ->> 'identity_number' from begin1), '11111111111',
  'the placeholder TCKN while the org does not require it');
select is((select b -> 'buyer' ->> 'phone' from begin1), '+905550000006', 'the phone of the profile');
select is((select (b ->> 'amount_kurus')::bigint from begin1), (select amount_kurus from public.order_installment
  where order_id = pg_temp.id('o') and seq = 1), 'the open amount of the first installment');
select is((select count(*)::integer from private.payment_billing_snapshot where payment_id = pg_temp.id('p')), 0,
  'payment_begin writes no snapshot');

select public.payment_attach_token(pg_temp.id('p'), 'fake_36_token', now() + interval '30 minutes');
select is((select count(*)::integer from private.payment_billing_snapshot where payment_id = pg_temp.id('p')), 1,
  'payment_attach_token writes the snapshot');
select is((select pg_temp.keys(to_jsonb(t)) from public.payment_by_token('fake_36_token') t),
  pg_temp.sorted(array['id', 'order_id', 'provider', 'status', 'amount_kurus', 'currency', 'token_expires_at',
    'return_origin']), 'payment_by_token columns = PAYMENT_BY_TOKEN_COLUMNS');
select is((select count(*)::integer from public.payment_by_token('no-such-token')), 0, 'an unknown token finds nothing');
update public.payment set initiated_at = now() - interval '5 minutes' where id = pg_temp.id('p');
select is((select pg_temp.keys(to_jsonb(t)) from public.payment_attempts_to_reconcile() t where t.id = pg_temp.id('p')),
  pg_temp.sorted(array['id', 'order_id', 'provider', 'status', 'amount_kurus', 'currency', 'provider_token',
    'token_expires_at']), 'payment_attempts_to_reconcile columns = RECONCILE_COLUMNS');

-- With the TCKN required: the real number goes to the provider, the snapshot keeps four digits.
update public.org_billing_setting set identity_number_required = true where org_id = 'b0000000-0000-4000-8000-000000000001';
update private.billing_profile set identity_number = '10000000146'
where user_id = 'a0000000-0000-4000-8000-000000000006';
create temporary table begin2 as
  select public.payment_begin(pg_temp.id('o'), 'a0000000-0000-4000-8000-000000000006', 'fake',
    'http://127.0.0.1:3100') as b;
insert into ids select 'p2', (b ->> 'payment_id')::uuid from begin2;
select is((select b -> 'buyer' ->> 'identity_number' from begin2), '10000000146', 'the real TCKN when required');
select is((select status::text || '/' || failure_code from public.payment where id = pg_temp.id('p')),
  'expired/superseded', 'the earlier live attempt is superseded');
select public.payment_attach_token(pg_temp.id('p2'), 'fake_36_token_2', now() + interval '30 minutes');
select is((select identity_number_last4 from private.payment_billing_snapshot where payment_id = pg_temp.id('p2')),
  '0146', 'the snapshot keeps the last four digits only');

select is(public.payment_finalize(pg_temp.id('p2'), 'succeeded', jsonb_build_object(
    'provider_payment_id', 'fp_36', 'provider_amount_kurus', (select b ->> 'amount_kurus' from begin2)::bigint,
    'paid_kurus', (select b ->> 'amount_kurus' from begin2)::bigint, 'installment', 1, 'fraud_status', 1,
    'card_last4', '4242', 'items', '[]'::jsonb)),
  'succeeded', 'the attempt succeeds');
select is(public.receipt_data(pg_temp.id('p2')) -> 'buyer' ->> 'identity_number_masked', '*******0146',
  'the receipt shows the masked TCKN');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into ids select 'r', (public.ops_request_refund(pg_temp.id('p2'), 1000, 'goodwill'))[1];
select is((select pg_temp.keys(public.payment_refund_claim(pg_temp.id('r')))),
  pg_temp.sorted(array['refund_id', 'number', 'kind', 'amount_kurus', 'currency', 'provider', 'provider_payment_id',
    'provider_item_id', 'payment_succeeded_at', 'payment_amount_kurus']), 'payment_refund_claim keys = REFUND_CLAIM_KEYS');

-- 4. Audit and errors ------------------------------------------------------------------

select is((select array_agg(x order by x) from (
           select distinct action || ':' || actor_role || ':' || coalesce(actor_user_id::text, '-') as x
           from public.audit_event
           where action in ('quote.issued', 'quote.accepted', 'order.created', 'payment.initiated', 'payment.succeeded',
                            'order.activated', 'refund.requested')
             and created_at = now()) s),
  array['order.activated:system:-', 'order.created:customer:a0000000-0000-4000-8000-000000000006',
        'payment.initiated:customer:a0000000-0000-4000-8000-000000000006', 'payment.succeeded:provider:-',
        'quote.accepted:customer:a0000000-0000-4000-8000-000000000006',
        'quote.issued:ops:a0000000-0000-4000-8000-000000000005',
        'refund.requested:ops:a0000000-0000-4000-8000-000000000005'],
  'every action carries its actor and role explicitly');

-- Housekeeping: a quote past its validity, a reminder three days before the due time.
-- Both on a pilot parcel of the customer: the served parcel would be refused
-- (IP14, parcel_in_service).
insert into public.parcel (id, org_id, name, estimated_area_m2)
values ('f3600000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', 'Pilot 36', 15000);
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
values ('b0000000-0000-4000-8000-000000000001', 'f3600000-0000-4000-8000-000000000011',
  'a0000000-0000-4000-8000-000000000006', 'owner', null);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into ids select 'q2', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001',
  array['f3600000-0000-4000-8000-000000000011'::uuid], false, null);
insert into ids select 'q3', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001',
  array['f3600000-0000-4000-8000-000000000011'::uuid], false, null);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'o3', public.customer_accept_quote(pg_temp.id('q3'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
set local session_replication_role = replica;
update public.quote set valid_until = valid_until - 60 where id = pg_temp.id('q2');
set local session_replication_role = origin;
-- Installment 1 is due today: the due-day reminder (installments-v1).
update public.order_installment set due_on = (now() at time zone 'Europe/Istanbul')::date
where order_id = pg_temp.id('o3') and seq = 1;
select is((select (r ->> 'quotes_expired')::integer || '/' || (r ->> 'reminders_sent')::integer
           from (select private.billing_housekeeping() r) x), '1/1', 'housekeeping expires the quote and reminds once');
select is((select (r ->> 'reminders_sent')::integer from (select private.billing_housekeeping() r) x), 0,
  'the reminder is not sent twice');
select is((select actor_role || ':' || coalesce(actor_user_id::text, '-') from public.audit_event
           where action = 'quote.expired' and entity_id = pg_temp.id('q2')), 'system:-', 'expiry by the system');
select is((select vars ->> 'ref' from public.notification where template = 'payment_reminder'
            and ref_id = (select md5(i.id::text || ':due')::uuid from public.order_installment i
                          where i.order_id = pg_temp.id('o3') and i.seq = 1)),
  (select number from public.service_order where id = pg_temp.id('o3')), 'payment_reminder names the order');

select is((select count(*)::integer from public.audit_event
           where details::text ~* '(Örnek Müşteri|905550000006|customer@example\.com|10000000146|Örnek Mah)'),
  0, 'no personal data in audit rows');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o3'), 100, current_date,
  repeat('GİZLİ-REF-905551112233 ', 10)) $$), 'invalid_input / bank_reference',
  'a bad bank reference is named, never echoed');
select is(pg_temp.error_of($$ select public.ops_record_manual_payment(pg_temp.id('o3'), 99999999999, current_date, 'EFT') $$),
  'amount_exceeds_balance', 'an amount beyond the balance is refused by code');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(pg_temp.error_of($$ select public.customer_save_billing_profile('{"kind": "individual", "first_name": "A",
  "last_name": "B", "identity_number": "12345678901", "address": "Sok. 1", "city": "Gaziantep"}') $$),
  'invalid_input / identity_number', 'an invalid TCKN is named, never echoed');
select is(pg_temp.error_of($$ select public.customer_accept_quote(pg_temp.id('q2'), '{}') $$), 'quote_not_open',
  'an expired quote cannot be accepted');
select is(pg_temp.error_of($$ select public.payment_finalize(pg_temp.id('p2'), 'won', '{}') $$),
  'invalid_input / outcome', 'an unknown outcome is named');
select is(pg_temp.error_of($$ select public.payment_record_event('fake', 'webhook', 'wh:36', null, null, false, 200,
  'x', '{}') $$), 'invalid_input / signature_valid', 'an invalid signature is never recorded');
select is(public.payment_record_event('fake', 'webhook', 'wh:36', null, null, true, 200, 'x', '{}'), true,
  'a valid event is new');
select is(public.payment_record_event('fake', 'webhook', 'wh:36', null, null, true, 200, 'x', '{}'), false,
  'and recorded once');

select * from finish();
rollback;
