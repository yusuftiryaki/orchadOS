-- IP12-A2 / 6: refunds (docs/musteri-yonetimi.md §5.5, §6.9, §8.4).
--
-- Kinds: void (card, same day, full amount; also every provider_mismatch),
-- refund (card, per payment line), manual (bank transfer, paid back by ops).
--
-- 1. Helpers: the refundable room of a payment and of a line, refund locks
--    (order → payment → refund), the effects of a succeeded refund (amounts
--    increased once, a void voids the payment, refund_completed).
-- 2. private.open_system_refund(): refunds opened by payment_finalize (closed
--    order, overpayment, mismatch).
-- 3. Ops: ops_request_refund, ops_can_process_refund,
--    ops_complete_manual_refund, ops_cancel_refund, ops_resolve_refund.
-- 4. Service role (payments Edge Function): payment_refund_claim (card only;
--    the row becomes processing before the provider is called: a card refund
--    is not idempotent), payment_refund_report (only from processing).
--
-- Ceiling: amount + Σ(requested, processing, succeeded refunds) never exceeds
-- coalesce(provider_amount_kurus, amount_kurus) of the payment, nor a line's
-- amount; it is checked under the payment lock, again when a failed refund
-- is retried. refunded_kurus grows only on the transition to succeeded, keyed
-- to the conditional update's row.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- What may still be refunded of a payment (p_item_id null) or of one of its
-- lines, not counting refund p_exclude.
create function private.refund_room(p public.payment, p_item_id uuid default null, p_exclude uuid default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_item_id is null then coalesce(p.provider_amount_kurus, p.amount_kurus)
    else (select i.amount_kurus from public.payment_item i where i.id = p_item_id and i.payment_id = p.id)
  end - coalesce((
    select sum(r.amount_kurus) from public.refund r
    where r.payment_id = p.id and r.status in ('requested', 'processing', 'succeeded')
      and (p_item_id is null or r.payment_item_id = p_item_id)
      and r.id is distinct from p_exclude
  ), 0);
$$;

create function private.same_istanbul_day(p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (coalesce(p_at, now()) at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
$$;

create function private.insert_refund(
  p public.payment,
  p_kind public.refund_kind,
  p_item_id uuid,
  p_amount_kurus bigint,
  p_reason public.refund_reason,
  p_note text,
  p_actor uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_number text := private.next_document_number(p.org_id, 'I');
begin
  insert into public.refund (org_id, payment_id, order_id, customer_user_id, payment_item_id, number, kind,
    amount_kurus, reason, note, requested_by)
  values (p.org_id, p.id, p.order_id, p.customer_user_id, p_item_id, v_number, p_kind, p_amount_kurus, p_reason,
    p_note, p_actor)
  returning id into v_id;
  perform private.audit(p.org_id, p_actor, p_role, 'refund.requested', 'refund', v_id,
    jsonb_build_object('number', v_number, 'payment_id', p.id, 'kind', p_kind, 'reason', p_reason,
      'amount_kurus', p_amount_kurus, 'payment_item_id', p_item_id));
  return v_id;
end;
$$;

-- The refund locked after its order and payment; not_found.
create function private.lock_refund(p_refund_id uuid)
returns public.refund
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment uuid;
  r public.refund;
begin
  select x.payment_id into v_payment from public.refund x where x.id = p_refund_id;
  if v_payment is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.lock_payment(v_payment);
  select * into r from public.refund where id = p_refund_id for update;
  return r;
end;
$$;

-- As lock_refund for ops: not_found, forbidden (not ops, or the caller's own).
create function private.lock_refund_for_ops(p_refund_id uuid)
returns public.refund
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment uuid;
  v_org uuid;
  r public.refund;
begin
  select x.payment_id, x.org_id into v_payment, v_org from public.refund x where x.id = p_refund_id;
  if v_payment is null or v_org not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.lock_payment_for_ops(v_payment);
  select * into r from public.refund where id = p_refund_id for update;
  return r;
end;
$$;

-- After the conditional update to succeeded returned r: the refunded amounts
-- grow once; a void voids the payment (succeeded or pending_review); the
-- order counts it only when the payment had counted as paid.
create function private.refund_completed(r public.refund, p_actor uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
begin
  select * into p from public.payment where id = r.payment_id;
  update public.payment
  set refunded_kurus = refunded_kurus + r.amount_kurus,
      status = case when r.kind = 'void' and status in ('succeeded', 'pending_review') then 'voided' else status end,
      voided_at = case when r.kind = 'void' and status in ('succeeded', 'pending_review') then now() else voided_at end
  where id = p.id;
  if r.payment_item_id is not null then
    update public.payment_item set refunded_kurus = refunded_kurus + r.amount_kurus where id = r.payment_item_id;
  end if;
  if p.status = 'succeeded' then
    update public.service_order set refunded_kurus = refunded_kurus + r.amount_kurus where id = r.order_id;
  end if;
  perform private.audit(r.org_id, p_actor, p_role, 'refund.succeeded', 'refund', r.id,
    jsonb_build_object('number', r.number, 'payment_id', p.id, 'kind', r.kind, 'amount_kurus', r.amount_kurus));
  if r.kind = 'void' and p.status in ('succeeded', 'pending_review') then
    perform private.audit(r.org_id, p_actor, p_role, 'payment.voided', 'payment', p.id,
      jsonb_build_object('refund_id', r.id, 'from', p.status));
  end if;
  perform private.enqueue_billing_notification('refund_completed', r.org_id, r.customer_user_id, r.id, r.number,
    '/portal/odeme/' || p.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. System refunds
-- ---------------------------------------------------------------------------

-- Opened by payment_finalize with the payment locked: a manual refund for a
-- transfer; a void for a mismatch, or for the full amount on the day of the
-- payment; otherwise line refunds from the last line backwards. Never raises
-- for the ceiling (the payment's outcome must be written): the amount is cut
-- to what is still refundable.
create function private.open_system_refund(p_payment_id uuid, p_amount_kurus bigint, p_reason public.refund_reason)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_amount bigint;
  v_left bigint;
  v_take bigint;
  v_item record;
  v_ids uuid[] := '{}';
begin
  select * into p from public.payment where id = p_payment_id for update;
  v_amount := least(coalesce(p_amount_kurus, 0), private.refund_room(p));
  if v_amount <= 0 then
    return v_ids;
  end if;
  if p.provider = 'manual' then
    return array[private.insert_refund(p, 'manual', null, v_amount, p_reason, null, null, 'system')];
  end if;
  if p_reason = 'provider_mismatch'
     or (v_amount = coalesce(p.provider_amount_kurus, p.amount_kurus) and private.same_istanbul_day(p.succeeded_at)) then
    return array[private.insert_refund(p, 'void', null, v_amount, p_reason, null, null, 'system')];
  end if;
  v_left := v_amount;
  for v_item in select i.id from public.payment_item i where i.payment_id = p.id order by i.line_no desc loop
    exit when v_left = 0;
    v_take := least(v_left, private.refund_room(p, v_item.id));
    if v_take > 0 then
      v_ids := v_ids || private.insert_refund(p, 'refund', v_item.id, v_take, p_reason, null, null, 'system');
      v_left := v_left - v_take;
    end if;
  end loop;
  return v_ids;
end;
$$;
comment on function private.open_system_refund(uuid, bigint, public.refund_reason) is
  'System refund of a locked payment: manual (transfer), void (mismatch, or full on the same day) or line refunds.';

-- ---------------------------------------------------------------------------
-- 3. Ops
-- ---------------------------------------------------------------------------

-- Kind: transfer → manual; card with the full amount on the day → void; a
-- line given → that line; the whole remainder → every line's remainder; a
-- part with a single line → that line; otherwise item_required. Errors:
-- not_found, forbidden, payment_not_open, invalid_input (amount_kurus, reason,
-- note, payment_item_id), refund_exceeds_payment, item_required.
create function public.ops_request_refund(
  p_payment_id uuid,
  p_amount_kurus bigint,
  p_reason text,
  p_note text default null,
  p_payment_item_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_actor uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_reason public.refund_reason;
  v_base bigint;
  v_room bigint;
  v_item record;
  v_ids uuid[] := '{}';
begin
  p := private.lock_payment_for_ops(p_payment_id);
  if p.status <> 'succeeded' then
    raise exception 'payment_not_open' using errcode = '55000';
  end if;
  if p_amount_kurus is null or p_amount_kurus <= 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount_kurus';
  end if;
  if p_reason is null or not p_reason = any (enum_range(null::public.refund_reason)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  v_reason := p_reason::public.refund_reason;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if p_payment_item_id is not null
     and not exists (select 1 from public.payment_item i where i.id = p_payment_item_id and i.payment_id = p.id) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'payment_item_id';
  end if;
  v_base := coalesce(p.provider_amount_kurus, p.amount_kurus);
  v_room := private.refund_room(p);
  if p_amount_kurus > v_room
     or (p_payment_item_id is not null and p_amount_kurus > private.refund_room(p, p_payment_item_id)) then
    raise exception 'refund_exceeds_payment' using errcode = 'P0001';
  end if;

  if p.provider = 'manual' then
    return array[private.insert_refund(p, 'manual', p_payment_item_id, p_amount_kurus, v_reason, v_note, v_actor, 'ops')];
  end if;
  if p_payment_item_id is not null then
    return array[private.insert_refund(p, 'refund', p_payment_item_id, p_amount_kurus, v_reason, v_note, v_actor, 'ops')];
  end if;
  if p_amount_kurus = v_base and v_room = v_base and private.same_istanbul_day(p.succeeded_at) then
    return array[private.insert_refund(p, 'void', null, p_amount_kurus, v_reason, v_note, v_actor, 'ops')];
  end if;
  if p_amount_kurus = v_room then
    if (select coalesce(sum(greatest(private.refund_room(p, i.id), 0)), 0) from public.payment_item i
        where i.payment_id = p.id) < p_amount_kurus then
      raise exception 'refund_exceeds_payment' using errcode = 'P0001';
    end if;
    for v_item in
      select i.id, private.refund_room(p, i.id) as room from public.payment_item i
      where i.payment_id = p.id order by i.line_no
    loop
      if v_item.room > 0 then
        v_ids := v_ids || private.insert_refund(p, 'refund', v_item.id, v_item.room, v_reason, v_note, v_actor, 'ops');
      end if;
    end loop;
    return v_ids;
  end if;
  if (select count(*) from public.payment_item i where i.payment_id = p.id) = 1 then
    select i.id into v_item from public.payment_item i where i.payment_id = p.id;
    if p_amount_kurus > private.refund_room(p, v_item.id) then
      raise exception 'refund_exceeds_payment' using errcode = 'P0001';
    end if;
    return array[private.insert_refund(p, 'refund', v_item.id, p_amount_kurus, v_reason, v_note, v_actor, 'ops')];
  end if;
  raise exception 'item_required' using errcode = '22023';
end;
$$;
comment on function public.ops_request_refund(uuid, bigint, text, text, uuid) is
  'Ops: requests a refund of a succeeded payment (kind chosen from provider, amount, day and line).';

-- The payments Edge Function asks with the caller's JWT before a card refund:
-- ops of the refund's org, and not the refund's customer. not_found for a
-- refund the caller cannot see.
create function public.ops_can_process_refund(p_refund_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.refund;
begin
  select * into r from public.refund where id = p_refund_id;
  if not found or r.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return r.org_id in (select authz.user_org_ids('{ops}')) and r.customer_user_id <> (select auth.uid());
end;
$$;
comment on function public.ops_can_process_refund(uuid) is
  'Whether the caller (ops of the org, not the customer) may have a refund processed.';

-- requested → succeeded for a transfer refund ops paid back. Errors:
-- not_found, forbidden, refund_not_open, invalid_input (bank_reference, completed_on).
create function public.ops_complete_manual_refund(p_refund_id uuid, p_bank_reference text, p_completed_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  v_reference text := nullif(btrim(p_bank_reference), '');
begin
  r := private.lock_refund_for_ops(p_refund_id);
  if r.customer_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.kind <> 'manual' or r.status <> 'requested' then
    raise exception 'refund_not_open' using errcode = 'P0001';
  end if;
  if v_reference is null or length(v_reference) > 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'bank_reference';
  end if;
  if p_completed_on is null or p_completed_on > private.istanbul_today()
     or p_completed_on < (r.requested_at at time zone 'Europe/Istanbul')::date then
    raise exception 'invalid_input' using errcode = '22023', detail = 'completed_on';
  end if;
  update public.refund
  set status = 'succeeded', bank_reference = v_reference, completed_on = p_completed_on, processed_at = now()
  where id = r.id and status = 'requested'
  returning * into r;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.refund_completed(r, (select auth.uid()), 'ops');
end;
$$;
comment on function public.ops_complete_manual_refund(uuid, text, date) is
  'Ops: records that a transfer refund was paid back (bank reference and day).';

-- requested → cancelled (internal note). Errors: not_found, forbidden,
-- refund_not_open, invalid_input (note).
create function public.ops_cancel_refund(p_refund_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  v_note text := nullif(btrim(p_note), '');
begin
  r := private.lock_refund_for_ops(p_refund_id);
  if r.customer_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.status <> 'requested' then
    raise exception 'refund_not_open' using errcode = 'P0001';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.refund set status = 'cancelled', note = coalesce(v_note, note)
  where id = r.id and status = 'requested';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'refund.cancelled', 'refund', r.id,
    jsonb_build_object('number', r.number));
end;
$$;
comment on function public.ops_cancel_refund(uuid, text) is 'Ops: cancels a requested refund.';

-- processing or failed → succeeded / failed, after ops checked the provider
-- (an uncertain card refund). A card refund needs the provider's reference to
-- succeed. Errors: not_found, forbidden, refund_not_open, invalid_input
-- (succeeded, provider_ref, note), refund_exceeds_payment.
create function public.ops_resolve_refund(
  p_refund_id uuid,
  p_succeeded boolean,
  p_provider_ref text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  p public.payment;
  v_ref text := nullif(btrim(p_provider_ref), '');
  v_note text := nullif(btrim(p_note), '');
  v_from public.refund_status;
begin
  r := private.lock_refund_for_ops(p_refund_id);
  if r.customer_user_id = (select auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.kind = 'manual' or r.status not in ('processing', 'failed') then
    raise exception 'refund_not_open' using errcode = 'P0001';
  end if;
  if p_succeeded is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'succeeded';
  end if;
  if (p_succeeded and v_ref is null) or length(v_ref) > 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'provider_ref';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  v_from := r.status;
  if p_succeeded and r.status = 'failed' then
    select * into p from public.payment where id = r.payment_id;
    if r.amount_kurus > private.refund_room(p, null, r.id)
       or (r.payment_item_id is not null and r.amount_kurus > private.refund_room(p, r.payment_item_id, r.id)) then
      raise exception 'refund_exceeds_payment' using errcode = 'P0001';
    end if;
  end if;
  if p_succeeded then
    update public.refund
    set status = 'succeeded', processed_at = now(), provider_ref = v_ref, failure_code = null, retryable = null,
        note = coalesce(v_note, note)
    where id = r.id and status = v_from
    returning * into r;
  else
    update public.refund
    set status = 'failed', processed_at = now(), processing_since = null,
        failure_code = coalesce(failure_code, 'refund_failed'), retryable = false, note = coalesce(v_note, note)
    where id = r.id and status = v_from
    returning * into r;
  end if;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'refund.resolved', 'refund', r.id,
    jsonb_build_object('number', r.number, 'from', v_from, 'succeeded', p_succeeded));
  if p_succeeded then
    perform private.refund_completed(r, (select auth.uid()), 'ops');
  end if;
end;
$$;
comment on function public.ops_resolve_refund(uuid, boolean, text, text) is
  'Ops: settles a processing or failed card refund by hand (provider reference required to succeed).';

-- ---------------------------------------------------------------------------
-- 4. Service role
-- ---------------------------------------------------------------------------

-- requested / failed → processing for a card refund (never manual); a retry
-- checks the ceiling again. Errors: not_found, refund_not_open,
-- refund_exceeds_payment.
create function public.payment_refund_claim(p_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  p public.payment;
  v_item text;
begin
  r := private.lock_refund(p_refund_id);
  select * into p from public.payment where id = r.payment_id;
  if r.kind = 'manual' or r.status not in ('requested', 'failed') or p.status not in ('succeeded', 'pending_review') then
    raise exception 'refund_not_open' using errcode = 'P0001';
  end if;
  if r.status = 'failed' and (
       r.amount_kurus > private.refund_room(p, null, r.id)
       or (r.payment_item_id is not null and r.amount_kurus > private.refund_room(p, r.payment_item_id, r.id))) then
    raise exception 'refund_exceeds_payment' using errcode = 'P0001';
  end if;
  update public.refund
  set status = 'processing', processing_since = now(), attempts = attempts + 1, failure_code = null, retryable = null
  where id = r.id and status = r.status
  returning * into r;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  select i.provider_item_id into v_item from public.payment_item i where i.id = r.payment_item_id;
  return jsonb_build_object(
    'refund_id', r.id,
    'number', r.number,
    'kind', r.kind,
    'amount_kurus', r.amount_kurus,
    'currency', r.currency,
    'provider', p.provider,
    'provider_payment_id', p.provider_payment_id,
    'provider_item_id', v_item,
    'payment_succeeded_at', p.succeeded_at,
    'payment_amount_kurus', p.amount_kurus
  );
end;
$$;
comment on function public.payment_refund_claim(uuid) is
  'Service role: takes a card refund for processing (before the provider call) and returns what the provider needs.';

-- processing → succeeded / failed with the provider's answer. Errors:
-- invalid_input (outcome, kind), not_found, refund_not_open.
create function public.payment_refund_report(
  p_refund_id uuid,
  p_outcome text,
  p_kind text,
  p_provider_ref text default null,
  p_failure_code text default null,
  p_retryable boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
begin
  if p_outcome is null or p_outcome not in ('succeeded', 'failed') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'outcome';
  end if;
  if p_kind is null or p_kind not in ('void', 'refund') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  r := private.lock_refund(p_refund_id);
  if r.kind::text <> p_kind then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  if p_outcome = 'succeeded' then
    update public.refund
    set status = 'succeeded', processed_at = now(), provider_ref = left(nullif(btrim(p_provider_ref), ''), 100)
    where id = r.id and status = 'processing'
    returning * into r;
    if not found then
      raise exception 'refund_not_open' using errcode = 'P0001';
    end if;
    perform private.refund_completed(r, null, 'provider');
  else
    update public.refund
    set status = 'failed', processing_since = null,
        failure_code = coalesce(private.clean_failure_code(p_failure_code), 'refund_failed'), retryable = p_retryable
    where id = r.id and status = 'processing'
    returning * into r;
    if not found then
      raise exception 'refund_not_open' using errcode = 'P0001';
    end if;
    perform private.audit(r.org_id, null, 'provider', 'refund.failed', 'refund', r.id,
      jsonb_build_object('number', r.number, 'failure_code', r.failure_code, 'retryable', p_retryable));
  end if;
end;
$$;
comment on function public.payment_refund_report(uuid, text, text, text, text, boolean) is
  'Service role: the provider''s answer to a processing card refund (only from processing).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.refund_room(public.payment, uuid, uuid) from public;
revoke all on function private.same_istanbul_day(timestamptz) from public;
revoke all on function private.insert_refund(public.payment, public.refund_kind, uuid, bigint, public.refund_reason, text, uuid, text)
  from public;
revoke all on function private.lock_refund(uuid) from public;
revoke all on function private.lock_refund_for_ops(uuid) from public;
revoke all on function private.refund_completed(public.refund, uuid, text) from public;
revoke all on function private.open_system_refund(uuid, bigint, public.refund_reason) from public;

revoke all on function public.ops_request_refund(uuid, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ops_can_process_refund(uuid) from public, anon, authenticated;
revoke all on function public.ops_complete_manual_refund(uuid, text, date) from public, anon, authenticated;
revoke all on function public.ops_cancel_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_resolve_refund(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.payment_refund_claim(uuid) from public, anon, authenticated;
revoke all on function public.payment_refund_report(uuid, text, text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.ops_request_refund(uuid, bigint, text, text, uuid) to authenticated;
grant execute on function public.ops_can_process_refund(uuid) to authenticated;
grant execute on function public.ops_complete_manual_refund(uuid, text, date) to authenticated;
grant execute on function public.ops_cancel_refund(uuid, text) to authenticated;
grant execute on function public.ops_resolve_refund(uuid, boolean, text, text) to authenticated;
grant execute on function public.payment_refund_claim(uuid) to service_role;
grant execute on function public.payment_refund_report(uuid, text, text, text, text, boolean) to service_role;
