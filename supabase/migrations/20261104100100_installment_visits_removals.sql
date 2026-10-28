-- Per-visit payment plan, part 2 (docs/musteri-yonetimi.md §5.6, §6.13;
-- docs/bahce-yonetimi.md §7; docs/hukuk/kararlar.md H35):
--
-- 1. An order that ends (cancelled, terminated, completed) cancels its unpaid
--    installments, except those whose visit ops let go ahead unpaid: they stay
--    owed (no interest, no fee).
-- 2. A periodic visit is not planned while the installment of that visit is
--    unpaid (installment_unpaid): a visit on a day inside the window of a
--    visit installment needs that installment paid, unless ops allowed it
--    with a note (ops_allow_unpaid_visit, on the customer's written request:
--    H35). A day outside every window maps by count: visit k (earlier
--    periodic visit days of the period, not extra visits or cancelled ones)
--    needs visit installment k when it is still open.
-- 2b. Window passed (H35, T28): an open visit installment whose window has
--    ended is cancelled by the daily job (window_passed), unless ops allowed
--    its visit; it is never asked for again, a payment arriving for it is
--    refunded (order_closed), and it neither unlocks another window nor
--    activates an order (the first installment not lapsed does).
-- 3. Garden removal and withdrawal (removal-v1 with installments): a line's
--    unpaid share is cut first, up to what the line would get back; only the
--    rest is refunded from what was paid. The cut goes from the last open
--    installment backwards (private.cut_line_installments).
-- 4. Reminders: payment_reminder 7 days before and on the due day of each
--    open installment, once each (no amount in the message), replacing the
--    order's single reminder three days before its payment due time.
-- 5. Ops: ops_order_installments (with the internal override columns),
--    ops_overdue_installments, ops_allow_unpaid_visit; ops_billing_summary
--    counts installments 30 or more days overdue.

-- ---------------------------------------------------------------------------
-- 1. Orders that end
-- ---------------------------------------------------------------------------

create function private.close_order_installments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if new.status not in ('cancelled', 'terminated', 'completed') or old.status = new.status then
    return null;
  end if;
  with c as (
    update public.order_installment
    set cancelled_kurus = amount_kurus - paid_kurus, status = 'cancelled', cancelled_at = now(),
        cancel_reason = 'order_' || new.status::text
    where order_id = new.id and status = 'pending' and visit_override_at is null
    returning id
  )
  select array_agg(id) into v_ids from c;
  if v_ids is not null then
    update public.order_installment_item set cancelled_kurus = amount_kurus - paid_kurus
    where installment_id = any (v_ids);
    perform private.audit(new.org_id, null, 'system', 'order.installments_cancelled', 'order', new.id,
      jsonb_build_object('number', new.number, 'reason', 'order_' || new.status::text,
        'installments', cardinality(v_ids)));
  end if;
  return null;
end;
$$;
revoke all on function private.close_order_installments() from public;

create trigger service_order_close_installments after update of status on public.service_order
for each row execute function private.close_order_installments();

-- ---------------------------------------------------------------------------
-- 2. Visits
-- ---------------------------------------------------------------------------

-- The unpaid installment that holds back a periodic visit of the parcel on
-- the day (the visit being p_session_id when it exists), or null. For each
-- active order serving the parcel on the day: the visit installment whose
-- window holds the day must be paid or allowed by ops; on a day outside every
-- window, the visit is number k = 1 + the other periodic visit days of the
-- parcel in the order's period (not cancelled, not extra visits, not the same
-- day) and an open visit installment k must be allowed by ops. An order
-- without such an installment holds nothing.
create function private.installment_blocking_visit(p_parcel_id uuid, p_day date, p_session_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o record;
  v_k integer;
  v_id uuid;
begin
  for o in
    select distinct x.id, x.service_start, x.service_end
    from public.service_order_item oi
    join public.service_order x on x.id = oi.order_id
    where oi.parcel_id = p_parcel_id and x.status = 'active' and x.activated_at is not null
      and x.service_start <= p_day and p_day <= x.service_end
      and (oi.removed_on is null or oi.removed_on > p_day)
    order by x.id
  loop
    select i.id into v_id from public.order_installment i
    where i.order_id = o.id and i.kind = 'visit' and i.window_end is not null
      and p_day between i.window_start and i.window_end
    order by i.seq limit 1;
    if v_id is not null then
      select i.id into v_id from public.order_installment i
      where i.id = v_id and i.status <> 'paid' and i.visit_override_at is null;
      if v_id is not null then
        return v_id;
      end if;
      continue;
    end if;
    select count(distinct v.day) + 1 into v_k
    from (
      select coalesce((s.started_at at time zone 'Europe/Istanbul')::date, s.planned_date) as day, s.id
      from public.session s
      where s.parcel_id = p_parcel_id and s.kind = 'periodic_scan' and s.status <> 'cancelled'
        and s.id is distinct from p_session_id
        and not exists (
          select 1 from public.followup_request f
          where f.target_session_id = s.id and f.kind = 'extra_visit' and f.status in ('planned', 'done'))
    ) v
    where v.day between o.service_start and o.service_end and v.day <> p_day;
    select i.id into v_id from public.order_installment i
    where i.order_id = o.id and i.kind = 'visit' and i.visit_no = v_k
      and i.status = 'pending' and i.visit_override_at is null;
    if v_id is not null then
      return v_id;
    end if;
  end loop;
  return null;
end;
$$;
comment on function private.installment_blocking_visit(uuid, date, uuid) is
  'installments-v1: the unpaid visit installment holding back a periodic visit of a parcel on a day, or null.';

create function authz.installment_blocking_visit(p_parcel_id uuid, p_day date, p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.installment_blocking_visit(p_parcel_id, p_day, p_session_id);
$$;
comment on function authz.installment_blocking_visit(uuid, date, uuid) is
  'private.installment_blocking_visit for guards running as the caller.';

-- Like private.guard_withdrawal_visit: API users only; inserts of planned
-- periodic visits and updates that move the day of a planned one. A status
-- change is never refused (the field app must not be stuck).
create function private.guard_installment_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.kind <> 'periodic_scan' or new.status <> 'planned' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.planned_date is not distinct from old.planned_date or old.status <> 'planned') then
    return new;
  end if;
  if authz.installment_blocking_visit(new.parcel_id,
       coalesce(new.planned_date, (now() at time zone 'Europe/Istanbul')::date), new.id) is not null then
    raise exception 'installment_unpaid' using errcode = 'P0001',
      hint = 'The installment of this visit is unpaid: plan it after payment, or allow it on the order page.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_installment_visit() from public;

create trigger session_guard_installment before insert or update of planned_date on public.session
for each row execute function private.guard_installment_visit();

-- Ops lets the visit of an open visit installment go ahead unpaid (the
-- customer's request, recorded in the note); the installment stays owed and
-- is not cancelled when the order ends. Errors: not_found, forbidden,
-- installment_not_open, invalid_input (note).
create function public.ops_allow_unpaid_visit(p_installment_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.order_installment;
  o public.service_order;
  v_note text := nullif(btrim(p_note), '');
begin
  select x.* into i from public.order_installment x where x.id = p_installment_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  o := private.lock_order_for_ops(i.order_id);
  select * into i from public.order_installment where id = p_installment_id for update;
  if i.status <> 'pending' or i.kind <> 'visit' or i.visit_override_at is not null then
    raise exception 'installment_not_open' using errcode = 'P0001';
  end if;
  if v_note is null or length(v_note) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  update public.order_installment
  set visit_override_at = now(), visit_override_by = (select auth.uid()), visit_override_note = v_note
  where id = i.id and status = 'pending';
  perform private.audit(o.org_id, (select auth.uid()), 'ops', 'order.unpaid_visit_allowed', 'order', o.id,
    jsonb_build_object('number', o.number, 'installment_id', i.id, 'seq', i.seq, 'visit_no', i.visit_no));
end;
$$;
comment on function public.ops_allow_unpaid_visit(uuid, text) is
  'Ops: lets the visit of an unpaid visit installment be planned (note required, audited); the installment stays owed.';

-- ---------------------------------------------------------------------------
-- 3. Removals
-- ---------------------------------------------------------------------------

-- Cuts up to p_amount of the line's unpaid installment shares, from the last
-- open installment backwards: an installment with nothing left open is paid
-- when anything of it was paid, else cancelled. Returns the installments
-- touched. The caller holds the order.
create function private.cut_line_installments(p_order_item_id uuid, p_amount bigint, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  v_left bigint := p_amount;
  v_take bigint;
  v_count integer := 0;
begin
  for x in
    select ii.id as item_id, i.id, ii.amount_kurus - ii.cancelled_kurus - ii.paid_kurus as open
    from public.order_installment_item ii
    join public.order_installment i on i.id = ii.installment_id
    where ii.order_item_id = p_order_item_id and i.status = 'pending'
    order by i.seq desc
    for update of i, ii
  loop
    exit when v_left <= 0;
    v_take := least(v_left, x.open);
    continue when v_take <= 0;
    update public.order_installment_item set cancelled_kurus = cancelled_kurus + v_take where id = x.item_id;
    update public.order_installment
    set cancelled_kurus = cancelled_kurus + v_take,
        status = case when paid_kurus + cancelled_kurus + v_take < amount_kurus then status
                      when paid_kurus > 0 then 'paid' else 'cancelled' end::public.installment_status,
        paid_at = case when paid_kurus + cancelled_kurus + v_take = amount_kurus and paid_kurus > 0 then now()
                       else paid_at end,
        cancelled_at = case when paid_kurus + cancelled_kurus + v_take = amount_kurus and paid_kurus = 0 then now()
                            else cancelled_at end,
        cancel_reason = case when paid_kurus + cancelled_kurus + v_take = amount_kurus and paid_kurus = 0 then p_reason
                             else cancel_reason end
    where id = x.id;
    v_left := v_left - v_take;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.cut_line_installments(uuid, bigint, text) from public;

-- As in 20261103100700_legal_review_fixes.sql, with installments: each line
-- reports its unpaid share (unpaid_kurus) and the part of it cut
-- (installments_cut_kurus = min(unpaid, max(0, gross − already refunded)));
-- refund = max(0, gross − already refunded − cut). A fully paid line is
-- unchanged. The totals carry installments_cut_kurus.
create or replace function private.removal_calc(
  p_org_id uuid,
  p_user_id uuid,
  p_parcel_id uuid,
  p_order_item_id uuid,
  p_effective_on date,
  p_withdrawal boolean,
  p_reason public.garden_removal_reason
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l record;
  bv record;
  v_lines jsonb := '[]'::jsonb;
  v_removed date;
  v_used integer;
  v_share bigint;
  v_service bigint;
  v_fee bigint;
  v_mode text;
  v_gross bigint;
  v_item_refunds bigint;
  v_loose bigint;
  v_already bigint;
  v_unattributed boolean;
  v_refund bigint;
  v_vat bigint;
  v_total_amount bigint := 0;
  v_total_refund bigint := 0;
  v_total_vat bigint := 0;
  v_any_unattributed boolean := false;
  v_requested_mode text;
  v_first_mode text;
  v_overall text;
  v_only_order uuid;
  v_billed_to date;
  v_unpaid bigint;
  v_cut bigint;
  v_total_cut bigint := 0;
begin
  -- A withdrawal from an order not started on the effective day (a paid
  -- renewal, or a first order starting later) is that order's alone.
  if p_withdrawal then
    select o.id into v_only_order
    from public.service_order_item oi join public.service_order o on o.id = oi.order_id
    where oi.id = p_order_item_id and o.service_start > p_effective_on;
  end if;
  for l in
    select oi.id, oi.order_id, oi.amount_kurus, o.number, o.service_start, o.service_end, o.total_kurus,
           qi.visits, qi.inventory_fee_kurus, qi.line_base_kurus, q.vat_rate_bp,
           private.has_early_performance(o.id) as early_performance,
           (select count(*) from public.service_order_item x where x.order_id = o.id) as order_lines
    from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    join public.quote_item qi on qi.id = oi.quote_item_id
    join public.quote q on q.id = o.quote_id
    where oi.parcel_id = p_parcel_id and oi.customer_user_id = p_user_id and o.org_id = p_org_id
      and o.status in ('active', 'completed') and oi.removed_on is null and o.service_end >= p_effective_on
      and (v_only_order is null or o.id = v_only_order)
    order by o.service_start, oi.line_no, oi.id
  loop
    v_removed := greatest(p_effective_on, l.service_start);
    v_mode := case
      when p_withdrawal and l.id = p_order_item_id then 'withdrawal'
      when p_reason = 'duplicate' then 'duplicate'
      else 'unused_visits'
    end;
    -- Work done after the withdrawal notice arrived (the effective day) is
    -- not deducted (H11 (c)); other modes count through today.
    v_billed_to := case
      when v_mode = 'withdrawal' then least(p_effective_on, l.service_end)
      else greatest(v_removed - 1, least(private.istanbul_today(), l.service_end))
    end;
    select * into bv from private.billed_visits(p_parcel_id, l.service_start, v_billed_to);
    v_used := least(bv.used, l.visits);
    v_share := case when l.line_base_kurus > 0
                 then round(l.amount_kurus::numeric * l.inventory_fee_kurus / l.line_base_kurus) else 0 end;
    v_service := l.amount_kurus - v_share;
    v_fee := floor(v_service::numeric / l.visits);
    v_gross := case v_mode
      when 'withdrawal' then case
        when l.early_performance
          then l.amount_kurus - case when bv.inventory_done then v_share else 0 end - v_used * v_fee
        else l.amount_kurus
      end
      when 'duplicate' then l.amount_kurus - v_used * v_fee
      else case when v_used = 0 then v_service else (l.visits - v_used) * v_fee end
           + case when bv.inventory_done then 0 else v_share end
    end;
    v_gross := greatest(v_gross, 0);

    -- Refunds on the line's payment items or opened by a removal of the line,
    -- and refunds of the order with no line (no item, or the balance item)
    -- except overpayment, mismatch and other removals' refunds. A failed
    -- refund counts only while it can still settle (not marked retryable =
    -- false, the rule of payment_refund_claim); a dead one was never paid.
    select coalesce(sum(r.amount_kurus), 0) into v_item_refunds
    from public.refund r
    left join public.payment_item pi on pi.id = r.payment_item_id
    where r.order_id = l.order_id and (r.status in ('requested', 'processing', 'succeeded')
           or (r.status = 'failed' and r.retryable is distinct from false))
      and (pi.order_item_id = l.id
           or (r.garden_removal_id is not null and pi.order_item_id is null and exists (
                 select 1 from public.garden_removal g, jsonb_array_elements(g.calculation -> 'lines') x
                 where g.id = r.garden_removal_id and x ->> 'order_item_id' = l.id::text)));
    select coalesce(sum(r.amount_kurus), 0) into v_loose
    from public.refund r
    left join public.payment_item pi on pi.id = r.payment_item_id
    where r.order_id = l.order_id and (r.status in ('requested', 'processing', 'succeeded')
           or (r.status = 'failed' and r.retryable is distinct from false))
      and (r.payment_item_id is null or pi.order_item_id is null)
      and r.garden_removal_id is null
      and r.reason not in ('overpayment', 'provider_mismatch');
    if l.order_lines = 1 then
      v_already := v_item_refunds + v_loose;
      v_unattributed := false;
    else
      v_already := v_item_refunds
        + case when l.total_kurus > 0 then round(v_loose::numeric * l.amount_kurus / l.total_kurus) else 0 end;
      v_unattributed := v_loose > 0;
    end if;
    -- Installments: the line's unpaid share is cut first (up to what the
    -- line would get back); only the rest is refunded, from what was paid.
    select coalesce(sum(ii.amount_kurus - ii.cancelled_kurus - ii.paid_kurus), 0) into v_unpaid
    from public.order_installment_item ii
    join public.order_installment i on i.id = ii.installment_id
    where ii.order_item_id = l.id and i.status = 'pending';
    v_cut := least(v_unpaid, greatest(0, v_gross - v_already));
    v_refund := greatest(0, v_gross - v_already - v_cut);
    v_vat := round(v_refund::numeric * l.vat_rate_bp / (10000 + l.vat_rate_bp));

    v_lines := v_lines || jsonb_build_object(
      'order_item_id', l.id, 'order_id', l.order_id, 'order_number', l.number, 'removed_on', v_removed,
      'amount_kurus', l.amount_kurus, 'vat_rate_bp', l.vat_rate_bp, 'inventory_share_kurus', v_share,
      'inventory_done', bv.inventory_done, 'visits_entitled', l.visits, 'visits_used', v_used,
      'visits_excluded', bv.excluded, 'visit_fee_kurus', v_fee, 'gross_kurus', v_gross,
      'already_refunded_kurus', v_already, 'unattributed', v_unattributed, 'refund_kurus', v_refund,
      'refund_vat_kurus', v_vat, 'mode', v_mode, 'early_performance', l.early_performance,
      'unpaid_kurus', v_unpaid, 'installments_cut_kurus', v_cut);
    v_total_amount := v_total_amount + l.amount_kurus;
    v_total_refund := v_total_refund + v_refund;
    v_total_vat := v_total_vat + v_vat;
    v_total_cut := v_total_cut + v_cut;
    v_any_unattributed := v_any_unattributed or v_unattributed;
    if l.id = p_order_item_id then
      v_requested_mode := v_mode;
    end if;
    v_first_mode := coalesce(v_first_mode, v_mode);
  end loop;

  v_overall := case
    when jsonb_array_length(v_lines) = 0 or v_total_amount = 0 then 'none'
    when (private.billing_setting(p_org_id)).removal_refund_mode = 'manual' or v_any_unattributed then 'manual'
    else coalesce(v_requested_mode, v_first_mode)
  end;
  return jsonb_build_object(
    'formula', 'removal-v1',
    'as_of', private.istanbul_today(),
    'effective_on', p_effective_on,
    'mode', v_overall,
    'refund_kurus', v_total_refund,
    'refund_vat_kurus', v_total_vat,
    'unallocated_kurus', 0,
    'installments_cut_kurus', v_total_cut,
    'unattributed_refunds', v_any_unattributed,
    'lines', v_lines
  );
end;
$$;

-- As in 20261103100700_legal_review_fixes.sql, plus the installment cut of
-- each removed line before its refund rows are opened.
create or replace function private.complete_garden_removal(p_removal_id uuid, p_actor uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  o public.service_order;
  b public.service_order;
  v_today date := private.istanbul_today();
  v_eff date;
  v_affected uuid[];
  v_pending uuid[];
  v_lock uuid[];
  v_calc jsonb;
  v_requested_status public.order_status;
  v_lines integer;
  v_visits integer := 0;
  v_followups integer := 0;
  v_invitations integer := 0;
  v_cancelled_orders integer := 0;
  v_passive boolean := false;
  v_refunds integer := 0;
  v_base uuid;
  v_only_order uuid;
  v_access_from date;
  v_cleanup boolean;
  v_line jsonb;
  v_cut_rows integer := 0;
begin
  select * into r from public.garden_removal where id = p_removal_id;
  if not found then
    return false;
  end if;
  perform private.lock_parcel_coverage(array[r.parcel_id]);
  -- Every writer of a removal holds the parcel lock: the row read now stays.
  select * into r from public.garden_removal where id = p_removal_id;
  if r.status not in ('requested', 'scheduled') or coalesce(r.effective_on, r.requested_effective_on) > v_today then
    return false;
  end if;
  v_eff := coalesce(r.effective_on, r.requested_effective_on);
  -- A withdrawal from an order not started on the effective day removes only
  -- that order's lines, from its start (H13 (b), H14): the running line, its
  -- visits and the parcel stay.
  if r.withdrawal then
    select x.id into v_only_order from public.service_order x
    where x.id = r.order_id and x.service_start > v_eff;
  end if;
  v_access_from := case
    when v_only_order is not null then (select x.service_start from public.service_order x where x.id = v_only_order)
    when r.withdrawal then greatest(v_eff, v_today)
    else v_eff
  end;

  v_affected := array(
    select distinct oi.order_id from public.service_order_item oi
    join public.service_order x on x.id = oi.order_id
    where oi.parcel_id = r.parcel_id and oi.customer_user_id = r.customer_user_id
      and x.status in ('active', 'completed') and oi.removed_on is null and x.service_end >= v_eff
      and (v_only_order is null or x.id = v_only_order));
  v_pending := array(
    select x.id from public.service_order x
    where x.customer_user_id = r.customer_user_id and x.org_id = r.org_id and x.status = 'awaiting_payment'
      and r.parcel_id = any (private.order_line_parcels(x.id)));
  v_lock := array(
    select y from unnest(v_affected || v_pending) y
    union
    select coalesce(x.addon_of_order_id, x.id) from public.service_order x where x.id = any (v_affected)
    union
    select x.id from public.service_order x
    where x.addon_of_order_id in (
      select coalesce(z.addon_of_order_id, z.id) from public.service_order z where z.id = any (v_affected))
      and x.status in ('active', 'awaiting_payment'));
  perform 1 from public.service_order x where x.id = any (v_lock) order by x.id for update;
  select * into r from public.garden_removal where id = p_removal_id for update;
  if r.status not in ('requested', 'scheduled') then
    return false;
  end if;

  if r.status = 'requested' then
    update public.garden_removal
    set status = 'scheduled', effective_on = v_eff, access_until = v_access_from + r.access_days, scheduled_at = now()
    where id = r.id and status = 'requested'
    returning * into r;
    perform private.audit(r.org_id, p_actor, p_role, 'garden_removal.scheduled', 'garden_removal', r.id,
      jsonb_build_object('from_effective_on', null, 'to_effective_on', v_eff, 'from_access_days', r.access_days,
        'to_access_days', r.access_days, 'revoke_all_access', r.revoke_all_access, 'change_id', null));
  end if;

  -- Pending orders: all or nothing.
  if exists (
    select 1 from public.service_order x
    where x.id = any (v_pending) and x.status = 'awaiting_payment'
      and (x.paid_kurus > x.refunded_kurus or private.live_payment_attempt(x.id))
  ) then
    if r.blocked_reason is distinct from 'pending_order' then
      update public.garden_removal set blocked_reason = 'pending_order' where id = r.id;
      perform private.audit(r.org_id, null, 'system', 'garden_removal.blocked', 'garden_removal', r.id,
        jsonb_build_object('reason', 'pending_order'));
    end if;
    return false;
  end if;
  for o in select * from public.service_order x where x.id = any (v_pending) and x.status = 'awaiting_payment' order by x.id loop
    perform private.cancel_order(o, null, 'system', 'garden_removed', null);
    v_cancelled_orders := v_cancelled_orders + 1;
  end loop;

  v_calc := private.removal_calc(r.org_id, r.customer_user_id, r.parcel_id, r.order_item_id, v_eff, r.withdrawal,
    r.reason);
  v_lines := jsonb_array_length(v_calc -> 'lines');
  if v_lines = 0 then
    select x.status into v_requested_status from public.service_order x where x.id = r.order_id;
    if v_requested_status in ('terminated', 'cancelled') then
      update public.garden_removal
      set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', blocked_reason = null,
          ops_note = 'order_terminated'
      where id = r.id and status = 'scheduled';
      perform private.audit(r.org_id, null, 'system', 'garden_removal.cancelled', 'garden_removal', r.id,
        jsonb_build_object('reason', 'order_terminated'));
      return false;
    end if;
  end if;

  -- Lines leave the service on the effective day (a paid future line whole).
  update public.service_order_item oi
  set removed_on = greatest(v_eff, x.service_start), garden_removal_id = r.id
  from public.service_order x
  where x.id = oi.order_id and oi.parcel_id = r.parcel_id and oi.customer_user_id = r.customer_user_id
    and x.status in ('active', 'completed') and oi.removed_on is null and x.service_end >= v_eff
    and (v_only_order is null or x.id = v_only_order);
  update public.service_order_item oi
  set removed_on = v_eff, garden_removal_id = r.id
  from public.service_order x
  where oi.id = r.order_item_id and x.id = oi.order_id and x.status in ('active', 'completed')
    and oi.removed_on is null and x.service_end = v_eff - 1;

  -- Operations, unless another line serves the parcel on the day; for an
  -- order not started, unless another open line keeps the parcel (then only
  -- the visits planned on days no line serves any more are cancelled).
  v_cleanup := case
    when v_only_order is null then not private.parcel_served_on(r.parcel_id, v_eff)
    else not exists (
      select 1 from public.service_order_item oi
      join public.service_order x on x.id = oi.order_id
      where oi.parcel_id = r.parcel_id and x.status = 'active' and oi.removed_on is null and x.service_end >= v_today)
  end;
  if not v_cleanup then
    update public.session s set status = 'cancelled'
    where v_only_order is not null and s.parcel_id = r.parcel_id and s.status = 'planned'
      and s.kind in ('inventory', 'periodic_scan', 'verification')
      and s.planned_date >= v_access_from and not private.parcel_served_on(r.parcel_id, s.planned_date);
    get diagnostics v_visits = row_count;
  end if;
  if v_cleanup then
    update public.session set status = 'cancelled'
    where parcel_id = r.parcel_id and status = 'planned' and kind in ('inventory', 'periodic_scan', 'verification');
    get diagnostics v_visits = row_count;
    update public.followup_request set status = 'cancelled', resolved_at = now(), resolved_by = p_actor
    where parcel_id = r.parcel_id and status in ('open', 'planned');
    get diagnostics v_followups = row_count;
    update private.viewer_invitation set status = 'cancelled', resolved_at = now(), resolved_by = p_actor
    where parcel_id = r.parcel_id and status = 'pending';
    get diagnostics v_invitations = row_count;
    update public.parcel set status = 'passive' where id = r.parcel_id and status <> 'passive';
    v_passive := true;
  end if;

  update public.garden_removal
  set calculation = v_calc, refund_mode = v_calc ->> 'mode', refund_kurus = (v_calc ->> 'refund_kurus')::bigint
  where id = r.id;
  -- The removed lines' unpaid installment shares are cut (removal-v1 with
  -- installments) whatever the refund mode: nothing is asked for them.
  for v_line in select value from jsonb_array_elements(v_calc -> 'lines') loop
    if coalesce((v_line ->> 'installments_cut_kurus')::bigint, 0) > 0 then
      v_cut_rows := v_cut_rows + private.cut_line_installments((v_line ->> 'order_item_id')::uuid,
        (v_line ->> 'installments_cut_kurus')::bigint, 'garden_removed');
    end if;
  end loop;
  if v_calc ->> 'mode' not in ('manual', 'none') and (v_calc ->> 'refund_kurus')::bigint > 0 then
    v_refunds := private.open_removal_refunds(r.id);
  end if;
  update public.garden_removal set status = 'completed', completed_at = now(), blocked_reason = null
  where id = r.id and status = 'scheduled'
  returning * into r;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;

  -- Emptied orders end: an add-on with every line removed; a base order once
  -- its lines and those of its active add-ons are all removed (with them).
  for v_base in
    select distinct coalesce(x.addon_of_order_id, x.id) from public.service_order x where x.id = any (v_affected)
  loop
    for o in
      select * from public.service_order x
      where x.addon_of_order_id = v_base and x.id = any (v_affected) and x.status = 'active'
        and not exists (select 1 from public.service_order_item i where i.order_id = x.id and i.removed_on is null)
      order by x.id
    loop
      perform private.terminate_emptied_order(o.id, 'all_gardens_removed');
    end loop;
    select * into b from public.service_order x where x.id = v_base;
    if b.status = 'active'
       and not exists (
         select 1 from public.service_order_item i
         join public.service_order x on x.id = i.order_id
         where (x.id = b.id or (x.addon_of_order_id = b.id and x.status = 'active')) and i.removed_on is null) then
      perform private.terminate_emptied_order(b.id, 'all_gardens_removed');
      for o in select * from public.service_order x where x.addon_of_order_id = b.id and x.status = 'active' order by x.id loop
        perform private.terminate_emptied_order(o.id, 'all_gardens_removed');
      end loop;
      v_cancelled_orders := v_cancelled_orders + private.close_base_addons(b, null, 'system');
    end if;
  end loop;

  perform private.audit(r.org_id, p_actor, p_role, 'garden_removal.completed', 'garden_removal', r.id,
    jsonb_build_object('effective_on', v_eff, 'refund_mode', r.refund_mode, 'refund_kurus', r.refund_kurus,
      'lines', v_lines, 'refunds', v_refunds, 'parcel_passive', v_passive, 'cancelled_visits', v_visits,
      'cancelled_followups', v_followups, 'cancelled_invitations', v_invitations,
      'cancelled_orders', v_cancelled_orders, 'installments_cut_kurus', v_calc -> 'installments_cut_kurus',
      'installments_touched', v_cut_rows));
  perform private.enqueue_garden_notification('garden_removal_completed', r.org_id, r.customer_user_id, r.id, r.number,
    case when r.access_days > 0 then '/portal/parsel/' || r.parcel_id else '/portal' end, r.parcel_id);
  return true;
end;
$$;
comment on function private.complete_garden_removal(uuid, uuid, text) is
  'Completes a due removal (§5.3): lines, refund calculation and rows, visits cancelled, parcel passive, emptied orders ended; a withdrawal from an order not started only that order.';

-- ---------------------------------------------------------------------------
-- 4. Reminders
-- ---------------------------------------------------------------------------

-- As in 20261030105800_billing_cron.sql, plus the lapse of visit
-- installments whose window passed (above, 2b), and except the reminders: each open
-- installment of an order awaiting payment or active gets payment_reminder
-- once 7 days before its due day (not when it was created within those 7
-- days) and once on its due day (up to 3 days late when a run was missed).
-- The first message's notification ref is the installment id, the second's a
-- uuid derived from it (md5 of "<id>:due"), so each is queued once.
create or replace function private.billing_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.istanbul_today();
  q record;
  o record;
  v record;
  i record;
  v_expired integer := 0;
  v_reminded integer := 0;
  v_completed integer := 0;
  v_lapsed integer := 0;
  v_events integer;
begin
  -- Locks application → quote, as everywhere.
  for q in
    select x.id, x.application_id from public.quote x where x.status = 'issued' and x.valid_until < v_today
  loop
    if q.application_id is not null then
      perform 1 from public.service_application where id = q.application_id for update;
    end if;
    update public.quote set status = 'expired', decided_at = now()
    where id = q.id and status = 'issued' and valid_until < v_today
    returning id, org_id, number into v;
    continue when v.id is null;
    v_expired := v_expired + 1;
    perform private.audit(v.org_id, null, 'system', 'quote.expired', 'quote', v.id, jsonb_build_object('number', v.number));
    if q.application_id is not null then
      update public.service_application set status = 'submitted' where id = q.application_id and status = 'quoted';
    end if;
  end loop;

  for i in
    select x.id, x.order_id,
           x.reminder_sent_at is null and x.due_on - 7 <= v_today and v_today < x.due_on
             and (x.created_at at time zone 'Europe/Istanbul')::date < x.due_on - 7 as early,
           x.due_reminder_sent_at is null and x.due_on <= v_today and v_today <= x.due_on + 3 as due
    from public.order_installment x
    join public.service_order so on so.id = x.order_id
    where x.status = 'pending' and so.status in ('awaiting_payment', 'active')
      and ((x.reminder_sent_at is null and x.due_on - 7 <= v_today and v_today < x.due_on)
           or (x.due_reminder_sent_at is null and x.due_on <= v_today and v_today <= x.due_on + 3))
    order by x.due_on, x.id
    for update of x skip locked
  loop
    continue when not (i.early or i.due);
    if i.due then
      update public.order_installment set due_reminder_sent_at = now(), reminder_sent_at = coalesce(reminder_sent_at, now())
      where id = i.id and status = 'pending';
    else
      update public.order_installment set reminder_sent_at = now() where id = i.id and status = 'pending';
    end if;
    select x.id, x.org_id, x.customer_user_id, x.number into o from public.service_order x where x.id = i.order_id;
    v_reminded := v_reminded + private.enqueue_billing_notification('payment_reminder', o.org_id, o.customer_user_id,
      case when i.due then md5(i.id::text || ':due')::uuid else i.id end, o.number, '/portal/siparis/' || o.id);
  end loop;
  -- Window passed (H35, T28): open visit installments of active orders and of
  -- renewals already started whose window ended are cancelled, unless ops
  -- allowed their visit.
  for i in
    select x.id, x.order_id, x.seq, so.org_id, so.number
    from public.order_installment x
    join public.service_order so on so.id = x.order_id
    where x.status = 'pending' and x.kind = 'visit' and x.visit_override_at is null
      and x.window_end is not null and x.window_end < v_today
      and (so.status = 'active'
           or (so.status = 'awaiting_payment' and so.renewal_of_order_id is not null
               and (select qq.proposed_service_start from public.quote qq where qq.id = so.quote_id) <= v_today))
    order by x.order_id, x.seq
    for update of x skip locked
  loop
    update public.order_installment
    set cancelled_kurus = amount_kurus - paid_kurus, status = 'cancelled', cancelled_at = now(),
        cancel_reason = 'window_passed'
    where id = i.id and status = 'pending';
    update public.order_installment_item set cancelled_kurus = amount_kurus - paid_kurus where installment_id = i.id;
    v_lapsed := v_lapsed + 1;
    perform private.audit(i.org_id, null, 'system', 'order.installment_lapsed', 'order', i.order_id,
      jsonb_build_object('number', i.number, 'installment_id', i.id, 'seq', i.seq, 'reason', 'window_passed'));
  end loop;

  -- An early reminder whose window passed unsent stays unsent (marked).
  update public.order_installment set reminder_sent_at = now()
  where status = 'pending' and reminder_sent_at is null and due_on <= v_today;

  for o in
    select x.id from public.service_order x where x.status = 'active' and x.service_end < v_today
    for update skip locked
  loop
    update public.service_order set status = 'completed', completed_at = now()
    where id = o.id and status = 'active'
    returning id, org_id, number into v;
    continue when v.id is null;
    v_completed := v_completed + 1;
    perform private.audit(v.org_id, null, 'system', 'order.completed', 'order', v.id,
      jsonb_build_object('number', v.number));
  end loop;

  delete from private.payment_event where payment_id is null and received_at < now() - interval '7 days';
  get diagnostics v_events = row_count;

  return jsonb_build_object('quotes_expired', v_expired, 'reminders_sent', v_reminded,
    'installments_lapsed', v_lapsed, 'orders_completed', v_completed, 'events_deleted', v_events);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ops
-- ---------------------------------------------------------------------------

-- The plan of an order with the internal override columns and the days
-- overdue (open installments past their due day). Errors: not_found,
-- forbidden.
create function public.ops_order_installments(p_order_id uuid)
returns table (
  id uuid,
  seq integer,
  kind text,
  visit_no integer,
  window_code text,
  window_name text,
  window_start date,
  window_end date,
  amount_kurus bigint,
  vat_kurus bigint,
  paid_kurus bigint,
  cancelled_kurus bigint,
  open_kurus bigint,
  due_on date,
  status text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  days_overdue integer,
  reminder_sent_at timestamptz,
  due_reminder_sent_at timestamptz,
  visit_override_at timestamptz,
  visit_override_by jsonb,
  visit_override_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select o.org_id into v_org from public.service_order o where o.id = p_order_id;
  if v_org is null or v_org not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(v_org);
  return query
  select i.id, i.seq::integer, i.kind::text, i.visit_no::integer, i.window_code, i.window_name, i.window_start,
         i.window_end, i.amount_kurus, i.vat_kurus, i.paid_kurus, i.cancelled_kurus, private.installment_due(i), i.due_on,
         i.status::text, i.paid_at, i.cancelled_at, i.cancel_reason,
         case when i.status = 'pending' and i.due_on < private.istanbul_today()
              then private.istanbul_today() - i.due_on else 0 end,
         i.reminder_sent_at, i.due_reminder_sent_at, i.visit_override_at,
         private.user_ref(i.org_id, i.visit_override_by), i.visit_override_note
  from public.order_installment i
  where i.order_id = p_order_id
  order by i.seq;
end;
$$;
comment on function public.ops_order_installments(uuid) is
  'Ops: the payment plan of an order with days overdue and the visit override (who, note).';

-- Open installments at least p_min_days past their due day, oldest first.
create function public.ops_overdue_installments(p_org_id uuid, p_min_days integer default 30, p_limit integer default 200)
returns table (
  installment_id uuid,
  order_id uuid,
  order_number text,
  order_status text,
  customer_user_id uuid,
  customer_name text,
  seq integer,
  kind text,
  visit_no integer,
  window_name text,
  due_on date,
  open_kurus bigint,
  days_overdue integer,
  visit_allowed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_min_days is null or p_min_days < 0 or p_min_days > 3650 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'min_days';
  end if;
  return query
  select i.id, o.id, o.number, o.status::text, o.customer_user_id,
         (private.user_ref(o.org_id, o.customer_user_id) ->> 'name'),
         i.seq::integer, i.kind::text, i.visit_no::integer, i.window_name, i.due_on, private.installment_due(i),
         private.istanbul_today() - i.due_on, i.visit_override_at is not null
  from public.order_installment i
  join public.service_order o on o.id = i.order_id
  where i.org_id = p_org_id and i.status = 'pending' and i.due_on <= private.istanbul_today() - p_min_days
  order by i.due_on, o.number, i.seq
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_overdue_installments(uuid, integer, integer) is
  'Ops: open installments at least the given days (default 30) past their due day; no automatic termination.';

-- As in 20261102120300_garden_removals.sql, plus installments_overdue: open
-- installments 30 or more days past their due day.
drop function public.ops_billing_summary(uuid);
create function public.ops_billing_summary(p_org_id uuid)
returns table (
  applications_submitted integer,
  quotes_open integer,
  orders_awaiting_payment integer,
  orders_overdue integer,
  payments_pending_review integer,
  refunds_open integer,
  refunds_failed integer,
  parcels_awaiting_inventory integer,
  renewals_due integer,
  signup_attempts_24h integer,
  garden_removals_requested integer,
  garden_removals_due integer,
  garden_removals_blocked integer,
  installments_overdue integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_notice integer := coalesce(
    (select s.renewal_notice_days from public.org_billing_setting s where s.org_id = p_org_id), 45);
begin
  perform private.require_ops(p_org_id);
  return query
  select
    (select count(*)::integer from public.service_application a where a.org_id = p_org_id and a.status = 'submitted'),
    (select count(*)::integer from public.quote q where q.org_id = p_org_id and q.status = 'issued'),
    (select count(*)::integer from public.service_order o where o.org_id = p_org_id and o.status = 'awaiting_payment'),
    (select count(*)::integer from public.service_order o
     where o.org_id = p_org_id and o.status = 'awaiting_payment' and o.payment_due_at < now()),
    (select count(*)::integer from public.payment p where p.org_id = p_org_id and p.status = 'pending_review'),
    (select count(*)::integer from public.refund r where r.org_id = p_org_id and r.status in ('requested', 'processing')),
    (select count(*)::integer from public.refund r where r.org_id = p_org_id and r.status = 'failed'),
    (select count(distinct oi.parcel_id)::integer
     from public.service_order o
     join public.service_order_item oi on oi.order_id = o.id
     join public.parcel pa on pa.id = oi.parcel_id
     where o.org_id = p_org_id and o.status = 'active' and pa.status = 'registered'),
    (select count(*)::integer from public.service_order o
     where o.org_id = p_org_id and o.status = 'active' and private.renewal_due(o, v_notice)
       and not exists (select 1 from public.quote q where q.renewal_of_order_id = o.id and q.status = 'issued')),
    -- Attempts carry no org: counted for the org that takes sign-ups.
    (case when private.signup_org_id() = p_org_id then
       (select count(*)::integer from private.signup_attempt s where s.created_at > now() - interval '24 hours')
     else 0 end),
    (select count(*)::integer from public.garden_removal r where r.org_id = p_org_id and r.status = 'requested'),
    (select count(*)::integer from public.garden_removal r
     where r.org_id = p_org_id and r.status in ('requested', 'scheduled')
       and coalesce(r.effective_on, r.requested_effective_on) <= private.istanbul_today() + 7),
    (select count(*)::integer from public.garden_removal r
     where r.org_id = p_org_id and r.status in ('requested', 'scheduled') and r.blocked_reason is not null),
    (select count(*)::integer from public.order_installment i
     where i.org_id = p_org_id and i.status = 'pending' and i.due_on <= private.istanbul_today() - 30);
end;
$$;
comment on function public.ops_billing_summary(uuid) is
  'Ops: counts for the customers and payments card (open work, renewals due, sign-up attempts in 24 hours, garden removals, installments 30+ days overdue).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.installment_blocking_visit(uuid, date, uuid) from public;
revoke all on function authz.installment_blocking_visit(uuid, date, uuid) from public, anon;
grant execute on function authz.installment_blocking_visit(uuid, date, uuid) to authenticated, service_role;
revoke all on function public.ops_allow_unpaid_visit(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_order_installments(uuid) from public, anon, authenticated;
revoke all on function public.ops_overdue_installments(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.ops_billing_summary(uuid) from public, anon, authenticated;
grant execute on function public.ops_allow_unpaid_visit(uuid, text) to authenticated;
grant execute on function public.ops_order_installments(uuid) to authenticated;
grant execute on function public.ops_overdue_installments(uuid, integer, integer) to authenticated;
grant execute on function public.ops_billing_summary(uuid) to authenticated;
