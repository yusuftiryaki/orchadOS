-- IP12-A2 / 5: payments (docs/musteri-yonetimi.md §5.3, §5.4, §6.9, §8).
--
-- 1. Helpers: payment lines of an order, the masked buyer snapshot, the
--    effects of a succeeded payment (receipt M-…, order paid amount, refunds
--    for a closed order or an overpayment, activation, payment_received).
-- 2. Service role (payment Edge Functions, contract in
--    supabase/functions/_shared/payments/db.ts): payment_begin,
--    payment_attach_token, payment_by_token, payment_record_event,
--    payment_finalize, payment_attempts_to_reconcile.
-- 3. Ops: ops_record_manual_payment (bank transfer), ops_void_manual_payment,
--    ops_resolve_payment_review (fraud review only).
-- 4. receipt_data(): the receipt of a payment for its customer or the org's ops.
--
-- payment_finalize compares the provider's report with the payment row (never
-- the order), is a no-op on a final row and writes nothing for a fake success
-- unless the org allows fake payments. A function that starts from a payment
-- reads its order_id without a lock, locks the order, then the payment.
-- Personal data: payment_begin returns the buyer for the provider request
-- only; the snapshot (TCKN as its last four digits) is written when the token
-- is attached or a transfer is recorded. Errors and audit rows carry codes,
-- ids and amounts, never personal data.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Payment lines for an amount of an order: one per order line when the whole
-- total is paid at once, otherwise one balance line (no order line). Order
-- amounts count the money kept: paid_kurus - refunded_kurus.
create function private.write_payment_items(o public.service_order, p_payment_id uuid, p_amount_kurus bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if o.paid_kurus = o.refunded_kurus and p_amount_kurus = o.total_kurus then
    insert into public.payment_item (org_id, payment_id, customer_user_id, line_no, order_item_id, name, amount_kurus)
    select o.org_id, p_payment_id, o.customer_user_id, row_number() over (order by i.line_no), i.id,
           left(i.garden_name, 200), i.amount_kurus
    from public.service_order_item i
    where i.order_id = o.id and i.amount_kurus > 0;
  else
    insert into public.payment_item (org_id, payment_id, customer_user_id, line_no, order_item_id, name, amount_kurus)
    values (o.org_id, p_payment_id, o.customer_user_id, 1, null, o.number || ' bakiye', p_amount_kurus);
  end if;
end;
$$;

-- The buyer as on the receipt; the TCKN only as its last four digits.
create function private.write_payment_snapshot(p_payment_id uuid, p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.payment_billing_snapshot (
    payment_id, org_id, kind, first_name, last_name, identity_number_last4, company_title, tax_office, tax_number,
    address, district, city, postal_code, country, email, phone
  )
  select p_payment_id, b.org_id, b.kind, b.first_name, b.last_name,
         case when s.identity_number_required then right(b.identity_number, 4) end,
         b.company_title, b.tax_office, b.tax_number, b.address, b.district, b.city, b.postal_code, b.country,
         coalesce(b.email, op.email), op.phone
  from private.billing_profile b
  left join public.org_billing_setting s on s.org_id = b.org_id
  left join private.owner_profile op on op.org_id = b.org_id and op.user_id = b.user_id
  where b.org_id = p_org_id and b.user_id = p_user_id
  on conflict (payment_id) do nothing;
  if not found and not exists (select 1 from private.payment_billing_snapshot x where x.payment_id = p_payment_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
end;
$$;

-- After a payment row became succeeded (order and payment locked): the order's
-- paid amount, a full order_closed refund when the order was closed meanwhile,
-- an overpayment refund for what exceeds the total, activation when paid in
-- full, the payment_received message and the audit row.
create function private.complete_payment(
  o public.service_order,
  p public.payment,
  p_actor uuid,
  p_role text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid bigint;
  v_total bigint;
begin
  update public.service_order set paid_kurus = paid_kurus + p.amount_kurus
  where id = o.id
  returning paid_kurus - refunded_kurus, total_kurus into v_paid, v_total;
  perform private.audit(p.org_id, p_actor, p_role, p_action, 'payment', p.id,
    jsonb_build_object('order_id', o.id, 'receipt_number', p.receipt_number, 'provider', p.provider,
      'amount_kurus', p.amount_kurus, 'paid_kurus', p.paid_kurus));
  if o.status in ('cancelled', 'terminated', 'completed') then
    perform private.open_system_refund(p.id, p.amount_kurus, 'order_closed');
  else
    if v_paid > v_total then
      perform private.open_system_refund(p.id, least(p.amount_kurus, v_paid - v_total), 'overpayment');
    end if;
    if o.status = 'awaiting_payment' and v_paid >= v_total then
      perform private.activate_order(o.id);
    end if;
  end if;
  perform private.enqueue_billing_notification('payment_received', p.org_id, p.customer_user_id, p.id,
    p.receipt_number, '/portal/odeme/' || p.id);
end;
$$;

-- The payment of a payment id, locked after its order (order → payment);
-- not_found. The caller reads the order row, already locked, afterwards.
create function private.lock_payment(p_payment_id uuid)
returns public.payment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
  p public.payment;
begin
  select x.order_id into v_order from public.payment x where x.id = p_payment_id;
  if v_order is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.service_order where id = v_order for update;
  select * into p from public.payment where id = p_payment_id for update;
  return p;
end;
$$;

-- As lock_payment for ops: not_found, forbidden (not ops, or the caller's own).
create function private.lock_payment_for_ops(p_payment_id uuid)
returns public.payment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
  v_org uuid;
  p public.payment;
begin
  select x.order_id, x.org_id into v_order, v_org from public.payment x where x.id = p_payment_id;
  if v_order is null or v_org not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.lock_order_for_ops(v_order);
  select * into p from public.payment where id = p_payment_id for update;
  return p;
end;
$$;

create function private.fake_payments_allowed(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.allow_fake_payments from public.org_billing_setting s where s.org_id = p_org_id), false);
$$;

-- A provider's failure code as stored, or provider_error when it has another shape.
create function private.clean_failure_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when length(p_value) <= 80 and p_value ~ '^[a-z][a-z0-9_]*(:[a-z0-9_.-]{1,40})?$' then p_value
    else 'provider_error'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Service role
-- ---------------------------------------------------------------------------

-- A new card attempt for the outstanding amount of the user's order. Live
-- initiated attempts of the order are superseded (expired, superseded). The
-- buyer goes to the provider only: the snapshot is written by
-- payment_attach_token. identity_number is the real TCKN only while the org
-- requires it, otherwise 11111111111. Errors: invalid_input (provider,
-- return_origin), not_found, order_not_payable, billing_profile_incomplete,
-- fake_payments_disabled.
create function public.payment_begin(p_order_id uuid, p_user_id uuid, p_provider text, p_return_origin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  b private.billing_profile;
  op private.owner_profile;
  u auth.users;
  v_required boolean;
  v_amount bigint;
  v_id uuid;
begin
  if p_provider is null or p_provider not in ('iyzico', 'fake') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider';
  end if;
  if p_return_origin is null or length(p_return_origin) > 200 or p_return_origin !~ '^https?://[^/?#[:space:]]+$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'return_origin';
  end if;
  select * into o from public.service_order where id = p_order_id and customer_user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_amount := o.total_kurus - (o.paid_kurus - o.refunded_kurus);
  if o.status <> 'awaiting_payment' or v_amount <= 0 then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if p_provider = 'fake' and not private.fake_payments_allowed(o.org_id) then
    raise exception 'fake_payments_disabled' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(o.org_id, p_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  select * into b from private.billing_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into op from private.owner_profile x where x.org_id = o.org_id and x.user_id = p_user_id;
  select * into u from auth.users x where x.id = p_user_id;
  v_required := coalesce((select s.identity_number_required from public.org_billing_setting s where s.org_id = o.org_id), false);

  update public.payment
  set status = 'expired', failure_code = 'superseded'
  where order_id = o.id and provider <> 'manual' and status = 'initiated'
    and (token_expires_at is null or token_expires_at > now());

  insert into public.payment (org_id, order_id, customer_user_id, provider, amount_kurus, return_origin)
  values (o.org_id, o.id, p_user_id, p_provider::public.payment_provider, v_amount, p_return_origin)
  returning id into v_id;
  perform private.write_payment_items(o, v_id, v_amount);
  perform private.audit(o.org_id, p_user_id, 'customer', 'payment.initiated', 'payment', v_id,
    jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount_kurus', v_amount));

  return jsonb_build_object(
    'payment_id', v_id,
    'order_id', o.id,
    'order_number', o.number,
    'amount_kurus', v_amount,
    'currency', o.currency,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object('payment_item_id', i.id, 'line_no', i.line_no, 'name', i.name,
        'amount_kurus', i.amount_kurus) order by i.line_no), '[]'::jsonb)
      from public.payment_item i where i.payment_id = v_id),
    'buyer', jsonb_build_object(
      'id', p_user_id,
      'first_name', b.first_name,
      'last_name', b.last_name,
      'identity_number', case when v_required and b.identity_number is not null then b.identity_number
                              else '11111111111' end,
      'email', coalesce(b.email, op.email, u.email),
      'phone', coalesce(op.phone, case when u.phone is not null and u.phone <> '' then '+' || u.phone end),
      'address', b.address,
      'district', b.district,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code,
      'registered_at', coalesce(u.created_at, op.created_at)
    ),
    'billing', jsonb_build_object(
      'contact_name', case when b.kind = 'company' then b.company_title else b.first_name || ' ' || b.last_name end,
      'address', b.address,
      'city', b.city,
      'country', b.country,
      'postal_code', b.postal_code
    )
  );
end;
$$;
comment on function public.payment_begin(uuid, uuid, text, text) is
  'Service role: a new card attempt for the outstanding amount of the user''s order, with the buyer for the provider (no snapshot).';

-- The provider's token of an initiated attempt and the buyer snapshot (TCKN
-- masked). Errors: not_found, payment_not_open, invalid_input (token, expires_at).
create function public.payment_attach_token(p_payment_id uuid, p_token text, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
begin
  if p_token is null or length(p_token) not between 1 and 200 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'token';
  end if;
  if p_expires_at is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'expires_at';
  end if;
  p := private.lock_payment(p_payment_id);
  select * into o from public.service_order where id = p.order_id;
  if p.provider = 'manual' or p.status <> 'initiated' or p.provider_token is not null then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  begin
    update public.payment set provider_token = p_token, token_expires_at = p_expires_at
    where id = p.id and status = 'initiated' and provider_token is null;
  exception when unique_violation then
    raise exception 'invalid_input' using errcode = '22023', detail = 'token';
  end;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.write_payment_snapshot(p.id, p.org_id, p.customer_user_id);
end;
$$;
comment on function public.payment_attach_token(uuid, text, timestamptz) is
  'Service role: stores the provider token of an initiated attempt and the masked buyer snapshot.';

create function public.payment_by_token(p_token text)
returns table (
  id uuid,
  order_id uuid,
  provider text,
  status text,
  amount_kurus bigint,
  currency text,
  token_expires_at timestamptz,
  return_origin text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.order_id, p.provider::text, p.status::text, p.amount_kurus, p.currency, p.token_expires_at,
         p.return_origin
  from public.payment p
  where p.provider_token = p_token and p_token is not null;
$$;
comment on function public.payment_by_token(text) is
  'Service role: the payment of a provider token (callback, webhook).';

-- true when the event is new, false when (provider, dedup_key) was already
-- recorded. A request with an invalid signature is never written. Errors:
-- invalid_input (detail: argument).
create function public.payment_record_event(
  p_provider text,
  p_event_type text,
  p_dedup_key text,
  p_payment_id uuid,
  p_refund_id uuid,
  p_signature_valid boolean,
  p_http_status integer,
  p_outcome text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer;
begin
  if p_signature_valid is not distinct from false then
    raise exception 'invalid_input' using errcode = '22023', detail = 'signature_valid';
  end if;
  if p_provider is null or p_provider not in ('iyzico', 'manual', 'fake') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider';
  end if;
  if p_event_type is null
     or p_event_type not in ('initialize', 'callback', 'webhook', 'retrieve', 'reconcile', 'cancel', 'refund', 'detail') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'event_type';
  end if;
  if p_dedup_key is null or length(p_dedup_key) not between 1 and 200 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'dedup_key';
  end if;
  if p_payload is not null and jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'payload';
  end if;
  if p_payment_id is not null then
    select p.org_id into v_org from public.payment p where p.id = p_payment_id;
    if v_org is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'payment_id';
    end if;
  end if;
  if p_refund_id is not null then
    select coalesce(v_org, r.org_id) into v_org from public.refund r
    where r.id = p_refund_id and (p_payment_id is null or r.payment_id = p_payment_id);
    if not found then
      raise exception 'invalid_input' using errcode = '22023', detail = 'refund_id';
    end if;
  end if;
  insert into private.payment_event (org_id, provider, event_type, dedup_key, payment_id, refund_id,
    signature_valid, http_status, outcome, payload)
  values (v_org, p_provider::public.payment_provider, p_event_type, p_dedup_key, p_payment_id, p_refund_id,
    p_signature_valid, p_http_status, left(p_outcome, 100), coalesce(p_payload, '{}'))
  on conflict (provider, dedup_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
comment on function public.payment_record_event(text, text, text, uuid, uuid, boolean, integer, text, jsonb) is
  'Service role: records a provider call or notification once per (provider, dedup_key); never an invalid signature.';

-- p_outcome: succeeded, failed, pending_review or expired. p_result:
-- {provider_payment_id, provider_amount_kurus, paid_kurus, installment,
-- card_association, card_family, card_last4, fraud_status, failure_code,
-- items [{payment_item_id, provider_item_id}]}. Returns the payment's status
-- afterwards.
-- - A succeeded or voided row does not change.
-- - A failed row changes only for a provider report that money moved
--   (succeeded or pending_review), never after ops rejected a review
--   (review_rejected): a capture reported after the attempt was failed is
--   written as any success (receipt, activation, or an order_closed /
--   overpayment refund), so it is never kept without a record.
-- - A row in review for amount_mismatch / reference_mismatch does not change:
--   it leaves review only through its void refund (→ voided).
-- - Success with a provider amount other than the payment row's amount, or a
--   review for amount_mismatch / reference_mismatch: pending_review and a
--   system void refund of the provider amount (provider_mismatch); never
--   failed.
-- - Success on a cancelled, terminated or completed order: a full
--   order_closed refund. Beyond the order total: an overpayment refund.
-- - A fake success needs allow_fake_payments (fake_payments_disabled).
-- - The order is activated once paid_kurus >= total_kurus.
-- Errors: invalid_input (outcome, result fields), not_found, payment_not_open
-- (manual), fake_payments_disabled.
create function public.payment_finalize(p_payment_id uuid, p_outcome text, p_result jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  r jsonb := coalesce(p_result, '{}'::jsonb);
  v_provider_payment_id text;
  v_provider_amount numeric;
  v_paid numeric;
  v_installment numeric;
  v_fraud numeric;
  v_code text;
  v_last4 text;
  v_mismatch boolean;
  v_was_failed boolean;
  v_item jsonb;
begin
  if p_outcome is null or p_outcome not in ('succeeded', 'failed', 'pending_review', 'expired') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'outcome';
  end if;
  if jsonb_typeof(r) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'result';
  end if;
  p := private.lock_payment(p_payment_id);
  select * into o from public.service_order where id = p.order_id;
  if p.provider = 'manual' then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  -- Repeated calls (callback, webhook, reconciliation) change nothing.
  if p.status in ('succeeded', 'voided')
     or (p.status = 'failed'
         and (p_outcome in ('failed', 'expired') or p.failure_code is not distinct from 'review_rejected'))
     or (p.status = 'pending_review'
         and (p_outcome in ('pending_review', 'expired') or p.failure_code in ('amount_mismatch', 'reference_mismatch')))
     or (p.status = 'expired' and p_outcome = 'expired') then
    return p.status::text;
  end if;
  v_was_failed := p.status = 'failed';

  v_provider_payment_id := private.input_text(r, 'provider_payment_id', 1, 100);
  v_provider_amount := private.input_number(r, 'provider_amount_kurus');
  v_paid := private.input_number(r, 'paid_kurus');
  v_installment := private.input_number(r, 'installment');
  v_fraud := private.input_number(r, 'fraud_status');
  if v_provider_amount is not null and (v_provider_amount <> trunc(v_provider_amount) or v_provider_amount < 0) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider_amount_kurus';
  end if;
  if v_paid is not null and (v_paid <> trunc(v_paid) or v_paid <= 0) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'paid_kurus';
  end if;
  if v_installment is not null and (v_installment <> trunc(v_installment) or v_installment not between 1 and 12) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'installment';
  end if;
  if v_fraud is not null and v_fraud not in (-1, 0, 1) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'fraud_status';
  end if;
  if r -> 'items' is not null and jsonb_typeof(r -> 'items') not in ('array', 'null') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;
  v_code := private.clean_failure_code(private.input_text(r, 'failure_code', 1, 200));
  v_last4 := private.input_text(r, 'card_last4', 1, 20);
  if v_last4 !~ '^[0-9]{4}$' then
    v_last4 := null;
  end if;

  v_mismatch := (p_outcome = 'succeeded' and v_provider_amount is distinct from p.amount_kurus)
             or (p_outcome = 'pending_review' and v_code in ('amount_mismatch', 'reference_mismatch'));
  if v_mismatch and p_outcome = 'succeeded' then
    v_code := 'amount_mismatch';
  end if;
  if p_outcome = 'succeeded' and not v_mismatch and p.provider = 'fake' and not private.fake_payments_allowed(p.org_id) then
    raise exception 'fake_payments_disabled' using errcode = 'P0001';
  end if;

  begin
    update public.payment
    set provider_payment_id = coalesce(v_provider_payment_id, provider_payment_id),
        provider_amount_kurus = coalesce(v_provider_amount::bigint, provider_amount_kurus),
        paid_kurus = coalesce(v_paid::bigint, paid_kurus),
        installment = coalesce(v_installment::smallint, installment),
        card_association = coalesce(left(private.input_text(r, 'card_association', 1, 200), 100), card_association),
        card_family = coalesce(left(private.input_text(r, 'card_family', 1, 200), 100), card_family),
        card_last4 = coalesce(v_last4, card_last4),
        fraud_status = coalesce(v_fraud::smallint, fraud_status)
    where id = p.id;
  exception when unique_violation then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider_payment_id';
  end;
  for v_item in select value from jsonb_array_elements(coalesce(nullif(r -> 'items', 'null'::jsonb), '[]')) loop
    if jsonb_typeof(v_item) = 'object' and v_item ->> 'payment_item_id' ~* '^[0-9a-f-]{36}$' then
      update public.payment_item
      set provider_item_id = left(private.input_text(v_item, 'provider_item_id', 1, 200), 100)
      where id = (v_item ->> 'payment_item_id')::uuid and payment_id = p.id;
    end if;
  end loop;

  if p_outcome = 'succeeded' and not v_mismatch then
    update public.payment
    set status = 'succeeded', succeeded_at = now(), failure_code = null,
        receipt_number = private.next_document_number(org_id, 'M'),
        paid_kurus = coalesce(paid_kurus, amount_kurus)
    where id = p.id and status = p.status
    returning * into p;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
    if v_was_failed then
      perform private.audit(p.org_id, null, 'provider', 'payment.late_success', 'payment', p.id,
        jsonb_build_object('order_id', o.id, 'order_status', o.status));
    end if;
    perform private.complete_payment(o, p, null, 'provider', 'payment.succeeded');
  elsif p_outcome in ('succeeded', 'pending_review') then
    update public.payment set status = 'pending_review', failure_code = v_code
    where id = p.id and status = p.status
    returning * into p;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
    perform private.audit(p.org_id, null, 'provider', 'payment.pending_review', 'payment', p.id,
      jsonb_build_object('order_id', o.id, 'failure_code', v_code, 'provider_amount_kurus', p.provider_amount_kurus));
    if v_mismatch and coalesce(p.provider_amount_kurus, p.amount_kurus) > 0 then
      perform private.open_system_refund(p.id, coalesce(p.provider_amount_kurus, p.amount_kurus), 'provider_mismatch');
    end if;
  elsif p_outcome = 'failed' then
    update public.payment set status = 'failed', failed_at = now(), failure_code = coalesce(v_code, 'failed')
    where id = p.id and status = p.status
    returning * into p;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
    perform private.audit(p.org_id, null, 'provider', 'payment.failed', 'payment', p.id,
      jsonb_build_object('order_id', o.id, 'failure_code', p.failure_code));
  else
    update public.payment set status = 'expired', failure_code = coalesce(v_code, 'expired')
    where id = p.id and status = 'initiated'
    returning * into p;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
    perform private.audit(p.org_id, null, 'provider', 'payment.expired', 'payment', p.id,
      jsonb_build_object('order_id', o.id, 'failure_code', p.failure_code));
  end if;
  return p.status::text;
end;
$$;
comment on function public.payment_finalize(uuid, text, jsonb) is
  'Service role: writes the confirmed outcome of a card attempt (idempotent; mismatch → review and void; activation).';

-- Card attempts to ask the provider about: initiated for more than two
-- minutes, pending fraud reviews, and expired or failed-unfinished
-- (not_completed) ones until ten minutes after the token ran out (late
-- approvals). Mismatch reviews are left out: only their void settles them.
-- Order: initiated first, then the late-approval window, then reviews; oldest
-- first within each, so long-lived reviews never crowd out new attempts.
create function public.payment_attempts_to_reconcile(p_limit integer default 50)
returns table (
  id uuid,
  order_id uuid,
  provider text,
  status text,
  amount_kurus bigint,
  currency text,
  provider_token text,
  token_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.order_id, p.provider::text, p.status::text, p.amount_kurus, p.currency, p.provider_token,
         p.token_expires_at
  from public.payment p
  where p.provider <> 'manual'
    and ((p.status = 'initiated' and p.initiated_at < now() - interval '2 minutes')
         or (p.status = 'pending_review'
             and p.failure_code is distinct from 'amount_mismatch'
             and p.failure_code is distinct from 'reference_mismatch')
         or (p.status = 'expired' and p.token_expires_at + interval '10 minutes' > now())
         or (p.status = 'failed' and p.failure_code = 'not_completed' and p.provider_token is not null
             and p.token_expires_at + interval '10 minutes' > now()))
  order by case p.status when 'initiated' then 0 when 'pending_review' then 2 else 1 end, p.initiated_at, p.id
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;
comment on function public.payment_attempts_to_reconcile(integer) is
  'Service role: card attempts for reconciliation (initiated > 2 min, fraud review, expired or not_completed within 10 min of the token).';

-- ---------------------------------------------------------------------------
-- 3. Ops
-- ---------------------------------------------------------------------------

-- A bank transfer for (part of) the outstanding amount: succeeded at once
-- with a receipt; the order is activated when paid in full. Errors:
-- not_found, forbidden, order_not_payable, payment_in_progress (a live card
-- attempt), amount_exceeds_balance, billing_profile_incomplete, invalid_input
-- (amount_kurus, value_date, bank_reference, note).
create function public.ops_record_manual_payment(
  p_order_id uuid,
  p_amount_kurus bigint,
  p_value_date date,
  p_bank_reference text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  v_reference text := nullif(btrim(p_bank_reference), '');
  v_note text := nullif(btrim(p_note), '');
begin
  o := private.lock_order_for_ops(p_order_id);
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if private.live_payment_attempt(o.id) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  if p_amount_kurus is null or p_amount_kurus <= 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount_kurus';
  end if;
  if p_amount_kurus > o.total_kurus - (o.paid_kurus - o.refunded_kurus) then
    raise exception 'amount_exceeds_balance' using errcode = 'P0001';
  end if;
  if p_value_date is null or p_value_date > private.istanbul_today() or p_value_date < private.istanbul_today() - 366 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'value_date';
  end if;
  if v_reference is null or length(v_reference) > 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'bank_reference';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if not private.billing_profile_complete(o.org_id, o.customer_user_id) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;

  insert into public.payment (org_id, order_id, customer_user_id, provider, status, amount_kurus,
    provider_amount_kurus, paid_kurus, receipt_number, bank_reference, value_date, recorded_by, manual_note,
    succeeded_at)
  values (o.org_id, o.id, o.customer_user_id, 'manual', 'succeeded', p_amount_kurus, p_amount_kurus, p_amount_kurus,
    private.next_document_number(o.org_id, 'M'), v_reference, p_value_date, (select auth.uid()), v_note, now())
  returning * into p;
  perform private.write_payment_items(o, p.id, p_amount_kurus);
  perform private.write_payment_snapshot(p.id, p.org_id, p.customer_user_id);
  perform private.complete_payment(o, p, (select auth.uid()), 'ops', 'payment.manual_recorded');
  return p.id;
end;
$$;
comment on function public.ops_record_manual_payment(uuid, bigint, date, text, text) is
  'Ops: records a bank transfer (partial allowed) with a receipt; activates the order when paid in full.';

-- Corrects a wrongly recorded transfer of an order still awaiting payment:
-- voided, and taken off the order's paid amount. Errors: not_found,
-- forbidden, payment_not_open (not a succeeded transfer, or refunds on it, or
-- the order's refunds would exceed what stays paid), order_active (active),
-- order_not_payable (cancelled, terminated, completed), invalid_input (note).
create function public.ops_void_manual_payment(p_payment_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  v_note text := nullif(btrim(p_note), '');
begin
  p := private.lock_payment_for_ops(p_payment_id);
  select * into o from public.service_order where id = p.order_id;
  if p.provider <> 'manual' or p.status <> 'succeeded'
     or exists (select 1 from public.refund r where r.payment_id = p.id and r.status <> 'cancelled') then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if o.status = 'active' then
    raise exception 'order_active' using errcode = 'P0001';
  end if;
  if o.status <> 'awaiting_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if o.paid_kurus - p.amount_kurus < o.refunded_kurus then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.payment set status = 'voided', voided_at = now(), manual_note = v_note
  where id = p.id and status = 'succeeded';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  update public.service_order set paid_kurus = paid_kurus - p.amount_kurus where id = o.id;
  perform private.audit(p.org_id, (select auth.uid()), 'ops', 'payment.voided', 'payment', p.id,
    jsonb_build_object('order_id', o.id, 'receipt_number', p.receipt_number, 'amount_kurus', p.amount_kurus));
end;
$$;
comment on function public.ops_void_manual_payment(uuid, text) is
  'Ops: voids a wrongly recorded bank transfer of an order awaiting payment (note required).';

-- Fraud review only (a payment in review for a mismatch waits for its void
-- refund). p_provider_ref: the provider's payment id ops checked, required to
-- accept. Errors: not_found, forbidden, payment_not_open, invalid_input
-- (provider_ref, note), fake_payments_disabled.
create function public.ops_resolve_payment_review(
  p_payment_id uuid,
  p_succeeded boolean,
  p_provider_ref text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  p public.payment;
  v_ref text := nullif(btrim(p_provider_ref), '');
  v_note text := nullif(btrim(p_note), '');
begin
  p := private.lock_payment_for_ops(p_payment_id);
  select * into o from public.service_order where id = p.order_id;
  if p.status <> 'pending_review' or p.failure_code in ('amount_mismatch', 'reference_mismatch') then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if p_succeeded is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'succeeded';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if length(v_ref) > 100 or (p_succeeded and (v_ref is null or v_ref is distinct from coalesce(p.provider_payment_id, v_ref))) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider_ref';
  end if;

  if p_succeeded then
    if p.provider = 'fake' and not private.fake_payments_allowed(p.org_id) then
      raise exception 'fake_payments_disabled' using errcode = 'P0001';
    end if;
    begin
      update public.payment
      set status = 'succeeded', succeeded_at = now(), failure_code = null, provider_payment_id = v_ref,
          receipt_number = private.next_document_number(org_id, 'M'), paid_kurus = coalesce(paid_kurus, amount_kurus),
          manual_note = coalesce(v_note, manual_note)
      where id = p.id and status = 'pending_review'
      returning * into p;
    exception when unique_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'provider_ref';
    end;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  else
    update public.payment
    set status = 'failed', failed_at = now(), failure_code = 'review_rejected', manual_note = coalesce(v_note, manual_note)
    where id = p.id and status = 'pending_review'
    returning * into p;
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;
  perform private.audit(p.org_id, (select auth.uid()), 'ops', 'payment.review_resolved', 'payment', p.id,
    jsonb_build_object('order_id', o.id, 'succeeded', p_succeeded));
  if p_succeeded then
    perform private.complete_payment(o, p, (select auth.uid()), 'ops', 'payment.succeeded');
  end if;
end;
$$;
comment on function public.ops_resolve_payment_review(uuid, boolean, text, text) is
  'Ops: accepts or rejects a card payment held for fraud review (not a mismatch).';

-- ---------------------------------------------------------------------------
-- 4. Receipt
-- ---------------------------------------------------------------------------

-- The receipt of a payment with a receipt number, for its customer or the
-- org's ops; null for anyone else. The buyer comes from the snapshot.
create function public.receipt_data(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'receipt_number', p.receipt_number,
    'status', p.status,
    'issued_at', p.succeeded_at,
    'provider', p.provider,
    'amount_kurus', p.amount_kurus,
    'paid_kurus', coalesce(p.paid_kurus, p.amount_kurus),
    'refunded_kurus', p.refunded_kurus,
    'currency', p.currency,
    'installment', p.installment,
    'card_association', p.card_association,
    'card_last4', p.card_last4,
    'bank_reference', p.bank_reference,
    'value_date', p.value_date,
    'order_number', o.number,
    'package_name', q.package_name,
    'service_start', o.service_start,
    'service_end', o.service_end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('line_no', i.line_no, 'name', i.name,
                'amount_kurus', i.amount_kurus) order by i.line_no), '[]'::jsonb)
              from public.payment_item i where i.payment_id = p.id),
    'buyer', jsonb_build_object(
      'name', sn.first_name || ' ' || sn.last_name,
      'identity_number_masked', case when sn.identity_number_last4 is not null
                                     then '*******' || sn.identity_number_last4 end,
      'company_title', sn.company_title,
      'tax_office', sn.tax_office,
      'tax_number', sn.tax_number,
      'address', sn.address,
      'district', sn.district,
      'city', sn.city
    ),
    'seller', jsonb_build_object(
      'legal_name', s.legal_name,
      'tax_office', s.tax_office,
      'tax_number', s.tax_number,
      'mersis_number', s.mersis_number,
      'address', s.address,
      'phone', s.phone,
      'email', s.email
    ),
    'refunds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'amount_kurus', r.amount_kurus,
                  'processed_at', r.processed_at) order by r.processed_at, r.number), '[]'::jsonb)
                from public.refund r where r.payment_id = p.id and r.status = 'succeeded')
  )
  from public.payment p
  join public.service_order o on o.id = p.order_id
  join public.quote q on q.id = o.quote_id
  left join private.payment_billing_snapshot sn on sn.payment_id = p.id
  left join public.org_billing_setting s on s.org_id = p.org_id
  where p.id = p_payment_id
    and p.receipt_number is not null
    and (p.customer_user_id = (select auth.uid()) or p.org_id in (select authz.user_org_ids('{ops}')));
$$;
comment on function public.receipt_data(uuid) is
  'Receipt of a payment (buyer from the masked snapshot, seller, lines, refunds) for its customer or ops; null otherwise.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.write_payment_items(public.service_order, uuid, bigint) from public;
revoke all on function private.write_payment_snapshot(uuid, uuid, uuid) from public;
revoke all on function private.complete_payment(public.service_order, public.payment, uuid, text, text) from public;
revoke all on function private.lock_payment(uuid) from public;
revoke all on function private.lock_payment_for_ops(uuid) from public;
revoke all on function private.fake_payments_allowed(uuid) from public;
revoke all on function private.clean_failure_code(text) from public;

revoke all on function public.payment_begin(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.payment_attach_token(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.payment_by_token(text) from public, anon, authenticated;
revoke all on function public.payment_record_event(text, text, text, uuid, uuid, boolean, integer, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.payment_finalize(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.payment_attempts_to_reconcile(integer) from public, anon, authenticated;
revoke all on function public.ops_record_manual_payment(uuid, bigint, date, text, text) from public, anon, authenticated;
revoke all on function public.ops_void_manual_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_resolve_payment_review(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.receipt_data(uuid) from public, anon, authenticated;

grant execute on function public.payment_begin(uuid, uuid, text, text) to service_role;
grant execute on function public.payment_attach_token(uuid, text, timestamptz) to service_role;
grant execute on function public.payment_by_token(text) to service_role;
grant execute on function public.payment_record_event(text, text, text, uuid, uuid, boolean, integer, text, jsonb)
  to service_role;
grant execute on function public.payment_finalize(uuid, text, jsonb) to service_role;
grant execute on function public.payment_attempts_to_reconcile(integer) to service_role;
grant execute on function public.ops_record_manual_payment(uuid, bigint, date, text, text) to authenticated;
grant execute on function public.ops_void_manual_payment(uuid, text) to authenticated;
grant execute on function public.ops_resolve_payment_review(uuid, boolean, text, text) to authenticated;
grant execute on function public.receipt_data(uuid) to authenticated;
