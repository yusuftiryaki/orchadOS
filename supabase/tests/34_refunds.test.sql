-- Refunds (IP12-A2, docs/musteri-yonetimi.md §5.5): kind selection, ceilings
-- per payment and per line (also when a failed refund is retried), the claim
-- and report rules of the payments Edge Function, the once-only increase of
-- the refunded amounts, voids, manual refunds and ops' manual resolution.
-- Seed: ops a0..05, customer a0..06 with application 9120..0301 (garden
-- 9120..0401, 15 000 m²). A second garden (20 000 m²) is added here, so the
-- first order has two lines: 900 000 + 1 200 000 kuruş.
-- The whole file is one transaction, so now() is constant.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.ops() returns void language sql
as $$ select pg_temp.as_user('a0000000-0000-4000-8000-000000000005') $$;
create function pg_temp.customer() returns void language sql
as $$ select pg_temp.as_user('a0000000-0000-4000-8000-000000000006') $$;
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

-- A succeeded fake card payment of the outstanding amount of an order.
create function pg_temp.card_pay(p_order uuid, p_token text) returns uuid language plpgsql
as $$
declare
  b jsonb;
  v_id uuid;
begin
  b := public.payment_begin(p_order, 'a0000000-0000-4000-8000-000000000006', 'fake', 'http://127.0.0.1:3100');
  v_id := (b ->> 'payment_id')::uuid;
  perform public.payment_attach_token(v_id, p_token, now() + interval '30 minutes');
  perform public.payment_finalize(v_id, 'succeeded', jsonb_build_object(
    'provider_payment_id', 'fp_' || p_token, 'provider_amount_kurus', (b ->> 'amount_kurus')::bigint,
    'paid_kurus', (b ->> 'amount_kurus')::bigint, 'installment', 1, 'fraud_status', 1,
    'items', (select jsonb_agg(jsonb_build_object('payment_item_id', i ->> 'payment_item_id',
                'provider_item_id', 'pi_' || p_token || '_' || (i ->> 'line_no')))
              from jsonb_array_elements(b -> 'items') i)));
  return v_id;
end;
$$;

-- An accepted quote's order for the customer.
create function pg_temp.accept(p_quote uuid) returns uuid language plpgsql
as $$
begin
  perform pg_temp.customer();
  return public.customer_accept_quote(p_quote,
    '{"distance_sales": "mesafeli-v3-taslak", "pre_information": "onbilgi-v3-taslak"}');
end;
$$;

-- Setup ------------------------------------------------------------------------

insert into public.application_garden (id, org_id, application_id, customer_user_id, sort_order, name,
  declared_area_m2, position)
values ('f3400000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000006', 2, 'İkinci Bahçe', 20000,
  extensions.st_setsrid(extensions.st_makepoint(37.8, 37.05), 4326));

select pg_temp.ops();
select public.ops_verify_application_garden('91200000-0000-4000-8000-000000000401', 15000);
select public.ops_verify_application_garden('f3400000-0000-4000-8000-000000000001', 20000);
insert into ids select 'q1', public.ops_issue_quote('91200000-0000-4000-8000-000000000301');
insert into ids select 'o1', pg_temp.accept(pg_temp.id('q1'));
insert into ids select 'p1', pg_temp.card_pay(pg_temp.id('o1'), 'r1');
insert into ids select 'parcel', parcel_id from public.application_garden where id = '91200000-0000-4000-8000-000000000401';
insert into ids select 'p1i1', id from public.payment_item where payment_id = pg_temp.id('p1') and line_no = 1;
insert into ids select 'p1i2', id from public.payment_item where payment_id = pg_temp.id('p1') and line_no = 2;

-- o2: a transfer of part of a parcel quote; o3: a single-line card payment.
-- Each on its own pilot parcel of the customer (15 000 m²): a parcel is never
-- on two orders whose periods overlap (IP14, private.parcel_in_service).
insert into public.parcel (id, org_id, name, estimated_area_m2) values
  ('f3400000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', 'Pilot 34-2', 15000),
  ('f3400000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', 'Pilot 34-3', 15000);
insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
select 'b0000000-0000-4000-8000-000000000001', x, 'a0000000-0000-4000-8000-000000000006', 'owner', null
from unnest(array['f3400000-0000-4000-8000-000000000011', 'f3400000-0000-4000-8000-000000000012']::uuid[]) x;
select pg_temp.ops();
insert into ids select 'q2', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001',
  array['f3400000-0000-4000-8000-000000000011'::uuid], false, null);
insert into ids select 'o2', pg_temp.accept(pg_temp.id('q2'));
select pg_temp.ops();
insert into ids select 'p2', public.ops_record_manual_payment(pg_temp.id('o2'), 100000, current_date, 'EFT-34-1');
select pg_temp.ops();
insert into ids select 'q3', public.ops_issue_parcel_quote('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000006', '91200000-0000-4000-8000-000000000001',
  array['f3400000-0000-4000-8000-000000000012'::uuid], false, null);
insert into ids select 'o3', pg_temp.accept(pg_temp.id('q3'));
insert into ids select 'p3', pg_temp.card_pay(pg_temp.id('o3'), 'r3');

select is((select array[amount_kurus, (select count(*) from public.payment_item i where i.payment_id = p.id)]
           from public.payment p where id = pg_temp.id('p1')),
  array[2100000, 2]::bigint[], 'setup: a two-line card payment of 2 100 000 kuruş');
select is((select status::text from public.payment where id = pg_temp.id('p2')), 'succeeded', 'setup: a transfer');
select is((select count(*)::integer from public.payment_item where payment_id = pg_temp.id('p3')), 1,
  'setup: a single-line card payment');

-- Kind selection ---------------------------------------------------------------------

select pg_temp.ops();
insert into ids select 'void1', (public.ops_request_refund(pg_temp.id('p1'), 2100000, 'withdrawal'))[1];
select is((select kind::text || '/' || status::text || '/' || coalesce(payment_item_id::text, '-')
           from public.refund where id = pg_temp.id('void1')),
  'void/requested/-', 'the full amount on the day of the payment is a void');
select is((select requested_by from public.refund where id = pg_temp.id('void1')),
  'a0000000-0000-4000-8000-000000000005'::uuid, 'requested by the ops user');
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 1, 'goodwill') $$),
  'refund_exceeds_payment', 'nothing is left next to a requested void');
select lives_ok($$ select public.ops_cancel_refund(pg_temp.id('void1'), 'yanlış istek') $$, 'a requested refund is cancelled');
select is((select status::text from public.refund where id = pg_temp.id('void1')), 'cancelled', 'cancelled');
select is(pg_temp.error_of($$ select public.ops_cancel_refund(pg_temp.id('void1')) $$), 'refund_not_open',
  'a cancelled refund is final');

update public.payment set succeeded_at = now() - interval '1 day' where id in (pg_temp.id('p1'), pg_temp.id('p3'));
create temporary table full_refund as
  select unnest(public.ops_request_refund(pg_temp.id('p1'), 2100000, 'withdrawal')) as id;
select is((select array_agg(r.kind::text || ':' || r.amount_kurus order by r.amount_kurus)
           from public.refund r join full_refund f on f.id = r.id),
  array['refund:900000', 'refund:1200000'], 'the full amount on a later day: one refund per line');
select lives_ok($$ select public.ops_cancel_refund(id) from full_refund $$, 'both cancelled');

select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 1000, 'goodwill') $$),
  'item_required', 'a part of a payment with several lines needs the line');
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 1000, 'goodwill', null,
  'f3400000-0000-4000-8000-0000000000ff') $$),
  'invalid_input / payment_item_id', 'a line of another payment is refused');
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 1000, 'because') $$),
  'invalid_input / reason', 'an unknown reason is refused');
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 0, 'goodwill') $$),
  'invalid_input / amount_kurus', 'a zero amount is refused');

insert into ids select 'single', (public.ops_request_refund(pg_temp.id('p3'), 1000, 'goodwill'))[1];
select is((select kind::text || '/' || (payment_item_id is not null)::text from public.refund where id = pg_temp.id('single')),
  'refund/true', 'a part of a single-line payment goes to that line');
select public.ops_cancel_refund(pg_temp.id('single'));

insert into ids select 'manual', (public.ops_request_refund(pg_temp.id('p2'), 50000, 'goodwill', 'havale iadesi'))[1];
select is((select kind::text from public.refund where id = pg_temp.id('manual')), 'manual', 'a transfer is refunded manually');

-- Ceilings ---------------------------------------------------------------------------

insert into ids select 'a', (public.ops_request_refund(pg_temp.id('p1'), 600000, 'missed_visit', null, pg_temp.id('p1i1')))[1];
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 400000, 'missed_visit', null,
  pg_temp.id('p1i1')) $$),
  'refund_exceeds_payment', 'a second request beyond the line''s amount is refused');
insert into ids select 'r2', (public.ops_request_refund(pg_temp.id('p1'), 1200000, 'missed_visit', null, pg_temp.id('p1i2')))[1];
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 1, 'goodwill', null, pg_temp.id('p1i2')) $$),
  'refund_exceeds_payment', 'the second line is used up');
select is(pg_temp.error_of($$ select public.ops_request_refund(pg_temp.id('p1'), 300001, 'goodwill', null, pg_temp.id('p1i1')) $$),
  'refund_exceeds_payment', 'the payment''s ceiling counts every open refund');

-- Claim and report -------------------------------------------------------------------

reset role;
select is(pg_temp.error_of($$ select public.payment_refund_claim(pg_temp.id('manual')) $$), 'refund_not_open',
  'a manual refund is never claimed for the provider');
create temporary table claim_a as select public.payment_refund_claim(pg_temp.id('a')) as c;
select is((select array_agg(k order by k) from claim_a, jsonb_object_keys(c) k),
  array['amount_kurus', 'currency', 'kind', 'number', 'payment_amount_kurus', 'payment_succeeded_at', 'provider',
        'provider_item_id', 'provider_payment_id', 'refund_id'],
  'the claim returns REFUND_CLAIM_KEYS (db.ts)');
select is((select c ->> 'provider_item_id' from claim_a), 'pi_r1_1', 'with the provider''s line id');
select is((select status::text || '/' || attempts from public.refund where id = pg_temp.id('a')), 'processing/1',
  'requested → processing, one attempt');
select is(pg_temp.error_of($$ select public.payment_refund_claim(pg_temp.id('a')) $$), 'refund_not_open',
  'a processing refund is not claimed twice');
select lives_ok($$ select public.payment_refund_report(pg_temp.id('a'), 'failed', 'refund', null, 'iyzico_10051', true) $$,
  'the provider refused');
select is((select status::text || '/' || failure_code || '/' || retryable from public.refund where id = pg_temp.id('a')),
  'failed/iyzico_10051/true', 'failed with the code, retryable');
select is(pg_temp.error_of($$ select public.payment_refund_report(pg_temp.id('a'), 'succeeded', 'refund', 'x') $$),
  'refund_not_open', 'a report comes only for a processing refund');

-- The failed refund no longer counts: another one takes the line's room.
select pg_temp.ops();
insert into ids select 'c', (public.ops_request_refund(pg_temp.id('p1'), 900000, 'missed_visit', null, pg_temp.id('p1i1')))[1];
reset role;
select is(pg_temp.error_of($$ select public.payment_refund_claim(pg_temp.id('a')) $$), 'refund_exceeds_payment',
  'a retry checks the ceiling again');
select is(pg_temp.error_of($$ select public.payment_refund_report(pg_temp.id('c'), 'succeeded', 'refund', 'x') $$),
  'refund_not_open', 'no report for a requested refund');

select is(pg_temp.error_of($$ select public.payment_refund_report(pg_temp.id('r2'), 'succeeded', 'refund', 'x') $$),
  'refund_not_open', 'nor before the claim');
select public.payment_refund_claim(pg_temp.id('r2'));
select is(pg_temp.error_of($$ select public.payment_refund_report(pg_temp.id('r2'), 'succeeded', 'void', 'x') $$),
  'invalid_input / kind', 'the kind must match');
select lives_ok($$ select public.payment_refund_report(pg_temp.id('r2'), 'succeeded', 'refund', 'iyz-r2') $$, 'refunded');
select is(pg_temp.error_of($$ select public.payment_refund_report(pg_temp.id('r2'), 'succeeded', 'refund', 'iyz-r2') $$),
  'refund_not_open', 'a second report is refused');
select is((select array[p.refunded_kurus, i.refunded_kurus, o.refunded_kurus]
           from public.payment p, public.payment_item i, public.service_order o
           where p.id = pg_temp.id('p1') and i.id = pg_temp.id('p1i2') and o.id = pg_temp.id('o1')),
  array[1200000, 1200000, 1200000]::bigint[], 'payment, line and order grow once');
select is((select status::text || '/' || provider_ref from public.refund where id = pg_temp.id('r2')),
  'succeeded/iyz-r2', 'succeeded with the provider reference');

-- Ops resolution ------------------------------------------------------------------------

select public.payment_refund_claim(pg_temp.id('c'));
select pg_temp.ops();
select is(pg_temp.error_of($$ select public.ops_resolve_refund(pg_temp.id('c'), false) $$), 'refund_not_open',
  'a refund whose provider call may still be in flight (< 15 minutes) is not resolved');
update public.refund set processing_since = now() - interval '16 minutes' where id = pg_temp.id('c');
select is(pg_temp.error_of($$ select public.ops_resolve_refund(pg_temp.id('c'), true) $$),
  'invalid_input / provider_ref', 'a card refund needs the provider''s reference to succeed');
select lives_ok($$ select public.ops_resolve_refund(pg_temp.id('c'), true, 'iyz-c', 'panelde görüldü') $$,
  'resolved as succeeded');
select is(pg_temp.error_of($$ select public.ops_resolve_refund(pg_temp.id('c'), true, 'iyz-c') $$), 'refund_not_open',
  'a succeeded refund is not resolved again');
select is((select array[p.refunded_kurus, i.refunded_kurus, o.refunded_kurus]
           from public.payment p, public.payment_item i, public.service_order o
           where p.id = pg_temp.id('p1') and i.id = pg_temp.id('p1i1') and o.id = pg_temp.id('o1')),
  array[2100000, 900000, 2100000]::bigint[], 'counted once more, for this refund only');
select is((select status::text from public.payment where id = pg_temp.id('p1')), 'succeeded',
  'line refunds leave the payment succeeded');
select is(pg_temp.error_of($$ select public.ops_resolve_refund(pg_temp.id('a'), true, 'iyz-a') $$),
  'refund_exceeds_payment', 'resolving the failed one as succeeded would exceed the payment');
select lives_ok($$ select public.ops_resolve_refund(pg_temp.id('a'), false) $$, 'resolved as failed');
select is((select retryable from public.refund where id = pg_temp.id('a')), false, 'and not retried');
reset role;
select is(pg_temp.error_of($$ select public.payment_refund_claim(pg_temp.id('a')) $$), 'refund_not_open',
  'a failed refund marked not retryable is never sent to the provider again');
select pg_temp.ops();

-- Manual refunds -------------------------------------------------------------------------

select is(pg_temp.error_of($$ select public.ops_complete_manual_refund(pg_temp.id('manual'), ' ', (now() at time zone 'Europe/Istanbul')::date) $$),
  'invalid_input / bank_reference', 'the bank reference is required');
select lives_ok($$ select public.ops_complete_manual_refund(pg_temp.id('manual'), 'EFT-IADE-1', (now() at time zone 'Europe/Istanbul')::date) $$,
  'a transfer refund is completed');
select is(pg_temp.error_of($$ select public.ops_complete_manual_refund(pg_temp.id('manual'), 'EFT-IADE-1', (now() at time zone 'Europe/Istanbul')::date) $$),
  'refund_not_open', 'only once');
select is((select array[p.refunded_kurus, o.refunded_kurus] from public.payment p, public.service_order o
           where p.id = pg_temp.id('p2') and o.id = pg_temp.id('o2')),
  array[50000, 50000]::bigint[], 'the transfer and its order count the refund');
select is(pg_temp.error_of($$ select public.ops_resolve_refund(pg_temp.id('manual'), true, 'x') $$), 'refund_not_open',
  'a manual refund is not resolved like a card refund');

-- Void -------------------------------------------------------------------------------------

update public.payment set succeeded_at = now() where id = pg_temp.id('p3');
-- The line given (as the back office may always do) does not turn the
-- same-day full amount into a line refund.
insert into ids select 'void3', (public.ops_request_refund(pg_temp.id('p3'), 900000, 'withdrawal', null,
  (select id from public.payment_item where payment_id = pg_temp.id('p3'))))[1];
reset role;
select is((select c ->> 'kind' from (select public.payment_refund_claim(pg_temp.id('void3')) c) x), 'void', 'a void is claimed');
select lives_ok($$ select public.payment_refund_report(pg_temp.id('void3'), 'succeeded', 'void', 'iyz-v3') $$, 'voided at the provider');
select is((select status::text || '/' || refunded_kurus || '/' || (voided_at is not null)::text
           from public.payment where id = pg_temp.id('p3')),
  'voided/900000/true', 'a succeeded void voids the payment');
select is(pg_temp.error_of($$ select public.payment_refund_claim(
  (public.ops_request_refund(pg_temp.id('p3'), 1, 'goodwill'))[1]) $$),
  'payment_not_open', 'a voided payment is not refunded again');

-- Messages -------------------------------------------------------------------------------

select is((select array_agg(vars ->> 'ref' order by vars ->> 'ref') from public.notification
           where template = 'refund_completed' and recipient_user_id = 'a0000000-0000-4000-8000-000000000006'),
  (select array_agg(number order by number) from public.refund where status = 'succeeded'),
  'one refund_completed message per succeeded refund');

select * from finish();
rollback;
