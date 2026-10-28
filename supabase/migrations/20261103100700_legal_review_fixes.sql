-- Review fixes of the legal follow-ups, wave 1 (PR #92), fix-forward over
-- 20261103100100–20261103100500 (docs/hukuk/kararlar.md H11, H12, H13, H14,
-- T03, T04, T21):
--
-- 1. The production gate is an explicit SQL-only switch,
--    org_billing_setting.legal_gate_enforced (default false; the pilot sets it
--    when the publication conditions are met, docs/deployment.md), no longer
--    inferred from allow_fake_payments: the hosted test project and the demo
--    keep accepting quotes in every payment mode.
-- 2. A withdrawal from an order not started on the effective day (a paid
--    renewal, or a first order starting later) removes only that order's
--    lines from its start: the running line, its visits and the parcel stay.
-- 3. A withdrawal recorded by ops is effective on the day the notice arrived:
--    visits after it are not deducted and planned visits are cancelled.
-- 4. The portal withdrawal targets the open line still inside its withdrawal
--    period (a paid renewal before the running line): the switch bypass,
--    withdrawal_expired and the service card's withdrawal_until use it.
-- 6. No inventory or visit before the start of a paid order still inside its
--    withdrawal period without the consent, when no line serves the day.
-- 7. A contract document carries the version the order accepted;
--    ops_orders_missing_contract_documents lists only registrable documents.

-- ---------------------------------------------------------------------------
-- 1. Production gate switch
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting add column legal_gate_enforced boolean not null default false;
comment on column public.org_billing_setting.legal_gate_enforced is
  'T21: the production gate (legal_texts_not_final) is active for the org. SQL only (ops_save_billing_setting does not write it); the pilot sets it when the publication conditions are met.';

create or replace function private.legal_gate_active(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.billing_setting(p_org_id)).legal_gate_enforced, false);
$$;
comment on function private.legal_gate_active(uuid) is
  'T21: the production gate is on for the org (org_billing_setting.legal_gate_enforced; off without settings).';

-- ---------------------------------------------------------------------------
-- 2, 3. Withdrawal scope and notice day
-- ---------------------------------------------------------------------------

-- As in 20261103100500_early_performance_withdrawal.sql, except: a withdrawal
-- from an order not started on the effective day counts only that order's
-- lines, and the withdrawn line counts done visits only through the effective
-- day (the day the notice arrived).
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
    v_refund := greatest(0, v_gross - v_already);
    v_vat := round(v_refund::numeric * l.vat_rate_bp / (10000 + l.vat_rate_bp));

    v_lines := v_lines || jsonb_build_object(
      'order_item_id', l.id, 'order_id', l.order_id, 'order_number', l.number, 'removed_on', v_removed,
      'amount_kurus', l.amount_kurus, 'vat_rate_bp', l.vat_rate_bp, 'inventory_share_kurus', v_share,
      'inventory_done', bv.inventory_done, 'visits_entitled', l.visits, 'visits_used', v_used,
      'visits_excluded', bv.excluded, 'visit_fee_kurus', v_fee, 'gross_kurus', v_gross,
      'already_refunded_kurus', v_already, 'unattributed', v_unattributed, 'refund_kurus', v_refund,
      'refund_vat_kurus', v_vat, 'mode', v_mode, 'early_performance', l.early_performance);
    v_total_amount := v_total_amount + l.amount_kurus;
    v_total_refund := v_total_refund + v_refund;
    v_total_vat := v_total_vat + v_vat;
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
    'unattributed_refunds', v_any_unattributed,
    'lines', v_lines
  );
end;
$$;

-- As in 20261102120400_garden_review_fixes.sql, except: a withdrawal from an
-- order not started on the effective day removes only that order's lines
-- (from its start), cancels only the visits planned on days no line serves
-- any more and leaves the parcel, unless no other open line keeps it; its
-- access window counts from that start. Another withdrawal's window counts
-- from today at the earliest (the effective day may be the earlier notice
-- day).
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
      'cancelled_orders', v_cancelled_orders));
  perform private.enqueue_garden_notification('garden_removal_completed', r.org_id, r.customer_user_id, r.id, r.number,
    case when r.access_days > 0 then '/portal/parsel/' || r.parcel_id else '/portal' end, r.parcel_id);
  return true;
end;
$$;
comment on function private.complete_garden_removal(uuid, uuid, text) is
  'Completes a due removal (§5.3): lines, refund calculation and rows, visits cancelled, parcel passive, emptied orders ended; a withdrawal from an order not started only that order.';

-- ---------------------------------------------------------------------------
-- 4. Portal withdrawal target
-- ---------------------------------------------------------------------------

-- The line a portal withdrawal of the parcel applies to: an open line (active
-- order, not removed, not ended) still inside its order's withdrawal period
-- today, a paid order starting later first (a renewal is a contract of its
-- own, H14). No row when none is.
create function private.withdrawal_target(p_org_id uuid, p_user_id uuid, p_parcel_id uuid)
returns table (order_item_id uuid, order_id uuid, service_start date, withdrawal_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.id, o.id, o.service_start, private.withdrawal_until(o)
  from public.service_order_item oi
  join public.service_order o on o.id = oi.order_id
  where oi.parcel_id = p_parcel_id and oi.customer_user_id = p_user_id and o.org_id = p_org_id
    and o.status = 'active' and oi.removed_on is null and o.service_end >= private.istanbul_today()
    and private.withdrawal_until(o) >= private.istanbul_today()
  order by o.service_start > private.istanbul_today() desc, o.service_start desc, oi.line_no, oi.id
  limit 1;
$$;
comment on function private.withdrawal_target(uuid, uuid, uuid) is
  'T03: the open line of the parcel a withdrawal applies to today (inside its withdrawal period; a later order first).';

-- As in 20261103100500_early_performance_withdrawal.sql, except that a
-- withdrawal targets private.withdrawal_target.
create or replace function private.customer_removal_plan(
  p_org_id uuid,
  p_user_id uuid,
  p_parcel_id uuid,
  p_at_period_end boolean,
  p_withdrawal boolean,
  out order_item_id uuid,
  out order_id uuid,
  out effective_on date,
  out withdrawal_until date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  w record;
  v_today date := private.istanbul_today();
begin
  if not exists (
    select 1 from public.parcel_access pa join public.parcel p on p.id = pa.parcel_id
    where pa.parcel_id = p_parcel_id and pa.user_id = p_user_id and pa.role = 'owner' and p.org_id = p_org_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if coalesce(p_at_period_end, false) and coalesce(p_withdrawal, false) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'withdrawal';
  end if;
  select * into t from private.removal_target(p_org_id, p_user_id, p_parcel_id);
  if t.order_item_id is null then
    raise exception 'not_in_service' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.garden_removal r
    where r.parcel_id = p_parcel_id and r.customer_user_id = p_user_id and r.status in ('requested', 'scheduled')
      and (r.withdrawal or not coalesce(p_withdrawal, false))
  ) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.service_order o
    where o.customer_user_id = p_user_id and o.org_id = p_org_id and o.status = 'awaiting_payment'
      and p_parcel_id = any (private.order_line_parcels(o.id))
  ) then
    raise exception 'parcel_order_pending' using errcode = 'P0001';
  end if;
  if coalesce(p_withdrawal, false) then
    select * into w from private.withdrawal_target(p_org_id, p_user_id, p_parcel_id);
    if w.order_item_id is null then
      raise exception 'withdrawal_expired' using errcode = 'P0001';
    end if;
    t.order_item_id := w.order_item_id;
    t.order_id := w.order_id;
    t.withdrawal_until := w.withdrawal_until;
  end if;
  order_item_id := t.order_item_id;
  order_id := t.order_id;
  withdrawal_until := t.withdrawal_until;
  effective_on := case
    when coalesce(p_withdrawal, false) then v_today
    when t.future then t.service_start
    when coalesce(p_at_period_end, false) then t.service_end + 1
    else least(v_today + (private.billing_setting(p_org_id)).removal_notice_days, t.service_end + 1)
  end;
end;
$$;


-- As in 20261103100500_early_performance_withdrawal.sql, except that the
-- switch bypass checks private.withdrawal_target.
create or replace function public.customer_request_garden_removal(
  p_parcel_id uuid,
  p_reason text,
  p_note text default null,
  p_at_period_end boolean default false,
  p_withdrawal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  v_note text := nullif(btrim(p_note), '');
  v_withdrawal boolean := coalesce(p_withdrawal, false);
  s public.org_billing_setting;
  t record;
  pl record;
  v_id uuid;
  v_number text;
begin
  perform private.assert_not_demo();
  if v_user is null or v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.parcel_access pa join public.parcel p on p.id = pa.parcel_id
    where pa.parcel_id = p_parcel_id and pa.user_id = v_user and pa.role = 'owner' and p.org_id = v_org
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  s := private.billing_setting(v_org);
  if not s.garden_changes_enabled then
    select * into t from private.withdrawal_target(v_org, v_user, p_parcel_id);
    if not v_withdrawal or t.order_item_id is null then
      raise exception 'garden_changes_closed' using errcode = 'P0001';
    end if;
  end if;
  if p_reason is null or p_reason not in ('sold', 'not_needed', 'dissatisfied', 'cost', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform private.lock_parcel_coverage(array[p_parcel_id]);
  select * into pl from private.customer_removal_plan(v_org, v_user, p_parcel_id, p_at_period_end, v_withdrawal);
  if v_withdrawal then
    perform private.supersede_open_removal(p_parcel_id, v_user);
  end if;

  v_number := private.next_document_number(v_org, 'C');
  begin
    insert into public.garden_removal (
      org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
      reason, customer_note, at_period_end, withdrawal, requested_effective_on, access_days, requested_by,
      notice_channel, notice_received_on
    )
    select v_org, v_user, v_number, p.id, pl.order_id, pl.order_item_id, p.name, 'requested', 'customer',
           p_reason::public.garden_removal_reason, v_note, coalesce(p_at_period_end, false),
           v_withdrawal, pl.effective_on, s.removal_access_days, v_user,
           case when v_withdrawal then 'portal' end, case when v_withdrawal then private.istanbul_today() end
    from public.parcel p where p.id = p_parcel_id
    returning id into v_id;
  exception when unique_violation then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end;
  perform private.audit(v_org, v_user, 'customer', 'garden_removal.requested', 'garden_removal', v_id,
    jsonb_build_object('number', v_number, 'withdrawal', v_withdrawal,
      'at_period_end', coalesce(p_at_period_end, false), 'access_days', s.removal_access_days,
      'effective_on', pl.effective_on));
  if v_withdrawal then
    perform private.enqueue_garden_notification('withdrawal_received', v_org, v_user, v_id, v_number,
      '/portal/parsel/' || p_parcel_id, p_parcel_id);
  end if;
  return v_id;
end;
$$;


-- As in 20261103100500_early_performance_withdrawal.sql, except that the
-- removal is effective on the notice day (point 3).
create or replace function public.ops_record_withdrawal(
  p_order_item_ids uuid[],
  p_notice_received_on date,
  p_channel text,
  p_note text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_today date := private.istanbul_today();
  v_items uuid[];
  v_parcels uuid[];
  oi public.service_order_item;
  o public.service_order;
  s public.org_billing_setting;
  v_id uuid;
  v_number text;
  v_ids uuid[] := '{}';
  v_eff date;
begin
  v_items := array(select distinct x from unnest(p_order_item_ids) x where x is not null order by 1);
  if cardinality(v_items) = 0 or cardinality(v_items) > 50 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'order_item_ids';
  end if;
  if p_channel is null or p_channel not in ('email', 'kep', 'post') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'channel';
  end if;
  if p_notice_received_on is null or p_notice_received_on > v_today then
    raise exception 'invalid_input' using errcode = '22023', detail = 'notice_received_on';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  for oi in select * from public.service_order_item x where x.id = any (v_items) loop
    if oi.org_id not in (select authz.user_org_ids()) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    perform private.require_ops_customer(oi.org_id, oi.customer_user_id);
  end loop;
  if (select count(*) from public.service_order_item x where x.id = any (v_items)) <> cardinality(v_items) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_parcels := array(select x.parcel_id from public.service_order_item x where x.id = any (v_items));
  perform private.lock_parcel_coverage(v_parcels);
  for oi in
    select x.* from public.service_order_item x where x.id = any (v_items) order by x.parcel_id, x.id
  loop
    select * into o from public.service_order x where x.id = oi.order_id;
    if oi.parcel_id is null or o.status <> 'active' or oi.removed_on is not null
       or o.service_end < v_today then
      raise exception 'not_in_service' using errcode = 'P0001';
    end if;
    if p_notice_received_on > private.withdrawal_until(o) then
      raise exception 'withdrawal_expired' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.garden_removal r
      where r.parcel_id = oi.parcel_id and r.customer_user_id = oi.customer_user_id
        and r.status in ('requested', 'scheduled') and r.withdrawal
    ) then
      raise exception 'garden_removal_open' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.service_order x
      where x.customer_user_id = oi.customer_user_id and x.org_id = oi.org_id and x.status = 'awaiting_payment'
        and oi.parcel_id = any (private.order_line_parcels(x.id))
    ) then
      raise exception 'parcel_order_pending' using errcode = 'P0001';
    end if;
    perform private.supersede_open_removal(oi.parcel_id, oi.customer_user_id);
    -- Effective on the day the notice arrived (H11 (c)): visits after it are
    -- not deducted; an order not started that day leaves alone
    -- (complete_garden_removal).
    v_eff := p_notice_received_on;

    s := private.billing_setting(oi.org_id);
    v_number := private.next_document_number(oi.org_id, 'C');
    begin
      insert into public.garden_removal (
        org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
        reason, ops_note, at_period_end, withdrawal, requested_effective_on, access_days, requested_by,
        notice_channel, notice_received_on
      )
      select oi.org_id, oi.customer_user_id, v_number, p.id, oi.order_id, oi.id, p.name, 'requested', 'customer',
             'other', v_note, false, true, v_eff, s.removal_access_days, v_actor, p_channel, p_notice_received_on
      from public.parcel p where p.id = oi.parcel_id
      returning id into v_id;
    exception when unique_violation then
      raise exception 'garden_removal_open' using errcode = 'P0001';
    end;
    perform private.audit(oi.org_id, v_actor, 'ops', 'garden_removal.requested', 'garden_removal', v_id,
      jsonb_build_object('number', v_number, 'withdrawal', true, 'at_period_end', false,
        'access_days', s.removal_access_days, 'effective_on', v_eff, 'notice_channel', p_channel,
        'notice_received_on', p_notice_received_on));
    perform private.enqueue_garden_notification('withdrawal_received', oi.org_id, oi.customer_user_id, v_id,
      v_number, '/portal/parsel/' || oi.parcel_id, oi.parcel_id);
    perform private.complete_garden_removal(v_id, v_actor, 'ops');
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;


-- As in 20261102120500_garden_integration_fixes.sql, except that
-- withdrawal_until of a garden in service or upcoming is that of the line a
-- withdrawal would apply to (private.withdrawal_target), when there is one.
create or replace function private.customer_gardens(p_org_id uuid, p_user_id uuid)
returns table (
  order_item_id uuid,
  order_id uuid,
  order_number text,
  base_order_id uuid,
  is_addon boolean,
  order_status public.order_status,
  parcel_id uuid,
  garden_name text,
  parcel_status public.parcel_status,
  state text,
  service_start date,
  service_end date,
  removed_on date,
  visits_entitled smallint,
  visits_used integer,
  withdrawal_until date,
  in_next_period boolean,
  next_order_item_id uuid,
  removal_id uuid,
  removal_number text,
  removal_status public.garden_removal_status,
  removal_effective_on date,
  access_until date,
  removal_initiated_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select oi.id as item_id, oi.order_id, oi.line_no, oi.parcel_id, oi.removed_on, oi.quote_item_id, oi.garden_removal_id,
           o.number, o.status, o.addon_of_order_id, o.service_start, o.service_end,
           case
             when o.status = 'active' and o.service_start <= private.istanbul_today()
                  and private.istanbul_today() <= o.service_end
                  and (oi.removed_on is null or oi.removed_on > private.istanbul_today()) then 1
             when o.status = 'active' and o.service_start > private.istanbul_today() and oi.removed_on is null then 2
             when oi.removed_on is not null and exists (
                    select 1 from public.garden_removal gr
                    where gr.id = oi.garden_removal_id and gr.status = 'completed'
                      and gr.access_until >= private.istanbul_today() and gr.access_revoked_at is null) then 3
           end as prio
    from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    where o.org_id = p_org_id and o.customer_user_id = p_user_id and oi.parcel_id is not null
  ),
  pick as (
    select distinct on (l.parcel_id) l.*
    from lines l
    where l.prio is not null
    order by l.parcel_id, l.prio, case when l.prio < 3 then l.service_start end, l.service_start desc, l.line_no
  )
  select k.item_id, k.order_id, k.number, coalesce(k.addon_of_order_id, k.order_id), k.addon_of_order_id is not null,
         k.status, k.parcel_id, pa.name, pa.status,
         case
           when k.prio = 3 then 'removed'
           when rm.status in ('requested', 'scheduled') then 'leaving'
           when k.prio = 1 then 'in_service'
           else 'upcoming'
         end,
         k.service_start, k.service_end, k.removed_on, qi.visits,
         least(qi.visits::integer, bv.used),
         coalesce(case when k.prio < 3 then (
           select w.withdrawal_until from private.withdrawal_target(p_org_id, p_user_id, k.parcel_id) w) end,
           (select private.withdrawal_until(o2) from public.service_order o2 where o2.id = k.order_id)),
         case when exists (
           select 1 from public.service_order rn
           where rn.renewal_of_order_id = coalesce(k.addon_of_order_id, k.order_id) and rn.status = 'active'
         ) then nx.id is not null end,
         nx.id,
         rm.id, rm.number, rm.status, coalesce(rm.effective_on, rm.requested_effective_on), rm.access_until,
         rm.initiated_by
  from pick k
  join public.parcel pa on pa.id = k.parcel_id
  join public.quote_item qi on qi.id = k.quote_item_id
  cross join lateral private.billed_visits(k.parcel_id, k.service_start, coalesce(k.removed_on - 1, k.service_end)) bv
  left join lateral (
    select oi2.id from public.service_order_item oi2
    join public.service_order o2 on o2.id = oi2.order_id
    where oi2.parcel_id = k.parcel_id and o2.customer_user_id = p_user_id and o2.status = 'active'
      and o2.service_start > k.service_start and oi2.removed_on is null
    order by o2.service_start, oi2.id
    limit 1
  ) nx on true
  left join lateral (
    select gr.* from public.garden_removal gr
    where gr.parcel_id = k.parcel_id and gr.customer_user_id = p_user_id
    order by gr.id is not distinct from k.garden_removal_id desc, gr.status in ('requested', 'scheduled') desc,
             gr.requested_at desc, gr.id desc
    limit 1
  ) rm on true
  order by k.service_start, k.line_no, k.item_id;
$$;


-- ---------------------------------------------------------------------------
-- 6. Planning ban before a later start
-- ---------------------------------------------------------------------------

-- As in 20261103100500_early_performance_withdrawal.sql, plus: when no line
-- serves the day, a paid order of the parcel starting later that is inside
-- its withdrawal period on the day without early_performance blocks it.
create or replace function private.withdrawal_blocks_visit(p_parcel_id uuid, p_day date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_found boolean := false;
  v_blocked boolean := false;
  o public.service_order;
begin
  for o in
    select x.* from public.service_order_item oi
    join public.service_order x on x.id = oi.order_id
    where oi.parcel_id = p_parcel_id and x.status in ('active', 'completed') and x.activated_at is not null
      and x.service_start <= p_day and p_day <= x.service_end
      and (oi.removed_on is null or oi.removed_on > p_day)
  loop
    v_found := true;
    if p_day <= private.withdrawal_until(o) and not private.has_early_performance(o.id) then
      v_blocked := true;
    end if;
  end loop;
  if v_found then
    return v_blocked;
  end if;
  -- No line serves the day: a paid order starting later that is still inside
  -- its withdrawal period on the day without the consent (contract 8B/4).
  if exists (
    select 1 from public.service_order_item oi
    join public.service_order x on x.id = oi.order_id
    where oi.parcel_id = p_parcel_id and x.status = 'active' and x.activated_at is not null
      and x.service_start > p_day and oi.removed_on is null
      and p_day <= private.withdrawal_until(x) and not private.has_early_performance(x.id)
  ) then
    return true;
  end if;
  return exists (
    select 1 from public.service_order x
    where x.status = 'awaiting_payment' and x.activated_at is null
      and p_parcel_id = any (private.order_line_parcels(x.id)));
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. Contract documents
-- ---------------------------------------------------------------------------

-- A document of the kind can be registered for the order: the order has a
-- granted consent of its text kind (pre_information, else distance_sales)
-- whose template hash is known (on the consent row or in the registry).
create function private.contract_document_registrable(p_order_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select coalesce(c.text_sha256, v.sha256) is not null
    from private.consent_record c
    left join private.legal_text_version v on v.kind = c.kind::text and v.version = c.text_version
    where c.order_id = p_order_id and c.granted
      and c.kind::text = case p_kind when 'pre_information' then 'pre_information' else 'distance_sales' end
    order by c.recorded_at, c.id
    limit 1), false);
$$;
comment on function private.contract_document_registrable(uuid, text) is
  'T04: the order accepted a version of the document''s text whose template hash is known.';

-- As in 20261103100300_contract_documents.sql, except that the version is the
-- one the order accepted (its first granted consent of the text kind) and the
-- hash that row's, else the registry's (H12).
create or replace function public.service_register_contract_document(
  p_order_id uuid,
  p_kind text,
  p_text_version text,
  p_text_sha256 text,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes bigint,
  p_generator text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  d private.contract_document;
  v_text_kind text;
  v_accepted private.consent_record;
  v_object_size bigint;
  v_consents uuid[];
  v_id uuid;
begin
  select * into o from public.service_order x where x.id = p_order_id for update;
  if not found or o.quote_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if private.is_demo_org(o.org_id) or authz.is_demo_account(o.customer_user_id) then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('pre_information', 'distance_sales', 'withdrawal_confirmation') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  if p_kind = 'withdrawal_confirmation' and o.activated_at is null then
    raise exception 'order_not_active' using errcode = 'P0001';
  end if;
  v_text_kind := case p_kind when 'pre_information' then 'pre_information' else 'distance_sales' end;
  -- The version the order accepted (its first consent of the kind), with
  -- that row's template hash, else the registry's.
  select * into v_accepted from private.consent_record x
  where x.order_id = o.id and x.kind::text = v_text_kind and x.granted
  order by x.recorded_at, x.id
  limit 1;
  if v_accepted.id is null or p_text_version is distinct from v_accepted.text_version or not exists (
    select 1 from private.legal_text_version v where v.kind = v_text_kind and v.version = p_text_version
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_version';
  end if;
  if p_text_sha256 is null or p_text_sha256 !~ '^[0-9a-f]{64}$'
     or p_text_sha256 is distinct from coalesce(v_accepted.text_sha256,
       (select v.sha256 from private.legal_text_version v where v.kind = v_text_kind and v.version = p_text_version)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_sha256';
  end if;
  if p_storage_path is distinct from o.org_id || '/' || o.id || '/' || p_kind || '.pdf' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'storage_path';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'sha256';
  end if;
  if p_generator is null or length(btrim(p_generator)) not between 1 and 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'generator';
  end if;

  select * into d from private.contract_document x where x.order_id = o.id and x.kind = p_kind;
  if found then
    if d.sha256 = p_sha256 then
      return d.id;
    end if;
    raise exception 'exists' using errcode = '23505';
  end if;

  select (s.metadata ->> 'size')::bigint into v_object_size
  from storage.objects s where s.bucket_id = 'contract-documents' and s.name = p_storage_path;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'storage_path';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520
     or (v_object_size is not null and v_object_size <> p_size_bytes) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'size_bytes';
  end if;

  v_consents := array(
    select c.id from private.consent_record c
    where c.order_id = o.id
      and c.kind::text = any (case p_kind
        when 'pre_information' then array['pre_information']
        else array['distance_sales', 'early_performance'] end)
    order by c.recorded_at, c.id);
  insert into private.contract_document (org_id, customer_user_id, quote_id, order_id, kind, text_version,
    text_sha256, storage_path, sha256, size_bytes, generator, consent_ids)
  values (o.org_id, o.customer_user_id, o.quote_id, o.id, p_kind, p_text_version, p_text_sha256, p_storage_path,
    p_sha256, p_size_bytes, btrim(p_generator), v_consents)
  returning id into v_id;

  perform private.audit(o.org_id, null, 'system', 'contract_document.registered', 'order', o.id,
    jsonb_build_object('kind', p_kind, 'document_id', v_id, 'text_version', p_text_version));
  if (select count(*) from private.contract_document x
      where x.order_id = o.id and x.kind in ('pre_information', 'distance_sales')) = 2 then
    perform private.enqueue_billing_notification('contract_ready', o.org_id, o.customer_user_id, o.id, o.number,
      '/portal/hesap/sozlesmeler');
  end if;
  return v_id;
end;
$$;


-- As in 20261103100300_contract_documents.sql, except that a document whose
-- accepted version has no known hash (orders before T04 under archived
-- versions) is not listed: it can never be registered.
create or replace function public.ops_orders_missing_contract_documents()
returns table (
  order_id uuid,
  org_id uuid,
  order_number text,
  customer_user_id uuid,
  status public.order_status,
  accepted_at timestamptz,
  activated_at timestamptz,
  missing text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.org_id, o.number, o.customer_user_id, o.status, o.created_at, o.activated_at, m.missing
  from public.service_order o
  cross join lateral (
    select array(
      select k from unnest(array['pre_information', 'distance_sales', 'withdrawal_confirmation']) k
      where (k <> 'withdrawal_confirmation' or o.activated_at is not null)
        and not exists (select 1 from private.contract_document d where d.order_id = o.id and d.kind = k)
        and private.contract_document_registrable(o.id, k)
    ) as missing
  ) m
  where o.org_id in (select authz.user_org_ids('{ops}'))
    and o.quote_id is not null
    and not private.is_demo_org(o.org_id)
    and cardinality(m.missing) > 0
  order by o.created_at, o.id;
$$;


revoke all on function private.withdrawal_target(uuid, uuid, uuid) from public;
revoke all on function private.contract_document_registrable(uuid, text) from public;
