-- IP14 / 4: garden removals (docs/bahce-yonetimi.md §5, §7, §9.6–§9.10, §10).
--
-- 1. Helpers: enqueue_garden_notification (demo filter, parcel name), the
--    read-only window of a removed parcel, the removal's refund calculation
--    (removal-v1) and refund rows, the access scope.
-- 2. private.complete_garden_removal(): one transaction on the effective
--    day (housekeeping or ops): pending orders, lines, calculation, planned
--    visits, follow-ups and invitations cancelled, parcel passive, refunds,
--    emptied orders terminated, notification.
-- 3. private.garden_removal_housekeeping() (pg_cron, daily 00:30): due
--    removals, the access notice, the end of access.
-- 4. Guards: zz_parcel_read_only on question, question_reply, parcel_access
--    and private.viewer_invitation; session_guard_removal on session.
-- 5. Customer: customer_garden_removal_preview, customer_request_garden_removal,
--    customer_cancel_garden_removal.
-- 6. Ops: ops_garden_removals, ops_garden_removal_preview,
--    ops_request_garden_removal, ops_schedule_garden_removal,
--    ops_cancel_garden_removal, ops_complete_garden_removal.
-- 7. Replaced: ops_terminate_order (add-ons and open removals follow a base
--    order), ops_set_parcel_passive (parcel_removed), ops_billing_summary
--    (dropped and created with three removal counts), ops_billing_setting and
--    ops_save_billing_setting (five keys), private.demo_guard_drift.
--
-- Lock order: parcel_coverage:<parcel> → order(s) (id order) →
-- garden_removal → payment(s) (id order) → refund. Every writer of a
-- removal takes the parcel lock first.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- One garden message to a customer (doc §10): document number, portal path
-- and the parcel's name only; no dates, amounts or reasons. Returns 1, or 0
-- when it was already queued (notification_ref_once) or the org or the
-- account is a demo one. A sibling of enqueue_billing_notification.
create function private.enqueue_garden_notification(
  p_template public.notification_template,
  p_org_id uuid,
  p_user_id uuid,
  p_ref_id uuid,
  p_ref text,
  p_path text,
  p_parcel_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification (org_id, recipient_user_id, channel, template, vars, ref_id, parcel_id)
  select
    p_org_id, p_user_id,
    case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
    p_template,
    jsonb_build_object('ref', p_ref, 'path', p_path)
      || case when p.name is not null then jsonb_build_object('parcel_name', p.name) else '{}'::jsonb end,
    p_ref_id, p.id
  from (select 1) one
  left join private.owner_profile op on op.org_id = p_org_id and op.user_id = p_user_id
  left join public.parcel p on p.id = p_parcel_id and p.org_id = p_org_id
  where not private.is_demo_org(p_org_id)
    and not authz.is_demo_account(p_user_id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function private.enqueue_garden_notification(public.notification_template, uuid, uuid, uuid, text, text, uuid) is
  'Queues one garden removal message (document number, portal path, parcel name) to a customer; duplicates and demo skipped.';

-- The parcel is in the read-only window of a removal (§5.4): a completed
-- removal whose access is still open, and no line serves the parcel today.
-- It reads the removal, not the parcel status.
create function private.parcel_read_only(p_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.garden_removal r
    where r.parcel_id = p_parcel_id and r.status = 'completed' and r.access_revoked_at is null
  ) and not private.parcel_served_on(p_parcel_id, private.istanbul_today());
$$;
comment on function private.parcel_read_only(uuid) is
  'A removed parcel during its access window (completed removal, access not revoked, not served today).';

-- For trigger functions running as the API caller (no usage on private).
create function authz.parcel_read_only(p_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.parcel_read_only(p_parcel_id);
$$;
comment on function authz.parcel_read_only(uuid) is 'private.parcel_read_only for guards running as the caller.';

-- The first effective day of an open removal of the parcel, or null.
create function authz.parcel_open_removal_from(p_parcel_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select min(coalesce(r.effective_on, r.requested_effective_on)) from public.garden_removal r
  where r.parcel_id = p_parcel_id and r.status in ('requested', 'scheduled');
$$;
comment on function authz.parcel_open_removal_from(uuid) is
  'The effective day of an open removal of the parcel (visit planning guard), or null.';

-- Refund calculation removal-v1 (§7.1–§7.2) of the customer's lines on the
-- parcel affected by an effective day: lines of active or completed orders,
-- not removed, ending on or after the day. Writes nothing; no personal data.
create function private.removal_calc(
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
begin
  for l in
    select oi.id, oi.order_id, oi.amount_kurus, o.number, o.service_start, o.service_end, o.total_kurus,
           qi.visits, qi.inventory_fee_kurus, qi.line_base_kurus, q.vat_rate_bp,
           (select count(*) from public.service_order_item x where x.order_id = o.id) as order_lines
    from public.service_order_item oi
    join public.service_order o on o.id = oi.order_id
    join public.quote_item qi on qi.id = oi.quote_item_id
    join public.quote q on q.id = o.quote_id
    where oi.parcel_id = p_parcel_id and oi.customer_user_id = p_user_id and o.org_id = p_org_id
      and o.status in ('active', 'completed') and oi.removed_on is null and o.service_end >= p_effective_on
    order by o.service_start, oi.line_no, oi.id
  loop
    v_removed := greatest(p_effective_on, l.service_start);
    select * into bv from private.billed_visits(p_parcel_id, l.service_start, v_removed - 1);
    v_used := least(bv.used, l.visits);
    v_share := case when l.line_base_kurus > 0
                 then round(l.amount_kurus::numeric * l.inventory_fee_kurus / l.line_base_kurus) else 0 end;
    v_service := l.amount_kurus - v_share;
    v_fee := floor(v_service::numeric / l.visits);
    v_mode := case
      when p_withdrawal and l.id = p_order_item_id then 'withdrawal'
      when p_reason = 'duplicate' then 'duplicate'
      else 'unused_visits'
    end;
    v_gross := case v_mode
      when 'withdrawal' then l.amount_kurus - case when bv.inventory_done then v_share else 0 end - v_used * v_fee
      when 'duplicate' then l.amount_kurus - v_used * v_fee
      else case when v_used = 0 then v_service else (l.visits - v_used) * v_fee end
           + case when bv.inventory_done then 0 else v_share end
    end;
    v_gross := greatest(v_gross, 0);

    -- Refunds on the line's payment items, and refunds of the order with no
    -- line (no item, or the balance item) except overpayment and mismatch.
    select coalesce(sum(r.amount_kurus), 0) into v_item_refunds
    from public.refund r
    join public.payment_item pi on pi.id = r.payment_item_id
    where pi.order_item_id = l.id and r.status in ('requested', 'processing', 'succeeded');
    select coalesce(sum(r.amount_kurus), 0) into v_loose
    from public.refund r
    left join public.payment_item pi on pi.id = r.payment_item_id
    where r.order_id = l.order_id and r.status in ('requested', 'processing', 'succeeded')
      and (r.payment_item_id is null or pi.order_item_id is null)
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
      'refund_vat_kurus', v_vat, 'mode', v_mode);
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

-- The calculation of a removal on an effective day (its own day when null).
create function private.removal_calculation(p_removal_id uuid, p_effective_on date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.removal_calc(r.org_id, r.customer_user_id, r.parcel_id, r.order_item_id,
           coalesce(p_effective_on, r.effective_on, r.requested_effective_on), r.withdrawal, r.reason)
  from public.garden_removal r where r.id = p_removal_id;
$$;
comment on function private.removal_calculation(uuid, date) is
  'Refund calculation removal-v1 of a removal (§7.2): lines, visits, prior refunds, VAT share. Writes nothing.';

-- Refund rows of a removal (§7.3), from the calculation stored on the row
-- while it is still open: per line, the order's succeeded payments newest
-- first (locked in id order), on the line's payment item or else the
-- balance item, within refund_room. Kind as ops_request_refund: manual for
-- a transfer, void for the full card amount on the payment day (no item),
-- otherwise a card item refund. What fits nowhere goes to
-- calculation.unallocated_kurus. Returns the number of refunds opened.
create function private.open_removal_refunds(p_removal_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  v_line jsonb;
  p public.payment;
  v_item uuid;
  v_left bigint;
  v_take bigint;
  v_base bigint;
  v_kind public.refund_kind;
  v_reason public.refund_reason;
  v_id uuid;
  v_count integer := 0;
  v_unallocated bigint := 0;
begin
  select * into r from public.garden_removal where id = p_removal_id;
  v_reason := case when r.refund_mode = 'withdrawal' then 'withdrawal' else 'termination' end;
  for v_line in select value from jsonb_array_elements(r.calculation -> 'lines') loop
    v_left := (v_line ->> 'refund_kurus')::bigint;
    continue when v_left <= 0;
    perform 1 from public.payment x
    where x.order_id = (v_line ->> 'order_id')::uuid and x.status = 'succeeded'
    order by x.id
    for update;
    for p in
      select * from public.payment x
      where x.order_id = (v_line ->> 'order_id')::uuid and x.status = 'succeeded'
      order by x.succeeded_at desc, x.id desc
    loop
      exit when v_left <= 0;
      select i.id into v_item from public.payment_item i
      where i.payment_id = p.id and i.order_item_id = (v_line ->> 'order_item_id')::uuid
      order by i.line_no limit 1;
      if v_item is null then
        select i.id into v_item from public.payment_item i
        where i.payment_id = p.id and i.order_item_id is null
        order by i.line_no limit 1;
      end if;
      continue when v_item is null;
      v_take := least(v_left, private.refund_room(p), private.refund_room(p, v_item));
      continue when v_take <= 0;
      v_base := coalesce(p.provider_amount_kurus, p.amount_kurus);
      if p.provider = 'manual' then
        v_kind := 'manual';
      elsif v_take = v_base and private.refund_room(p) = v_base and private.same_istanbul_day(p.succeeded_at) then
        v_kind := 'void';
      else
        v_kind := 'refund';
      end if;
      v_id := private.insert_refund(p, v_kind, case when v_kind = 'void' then null else v_item end, v_take, v_reason,
        'garden_removal:' || r.number, null, 'system');
      update public.refund set garden_removal_id = r.id where id = v_id;
      v_count := v_count + 1;
      v_left := v_left - v_take;
      v_item := null;
    end loop;
    v_unallocated := v_unallocated + v_left;
  end loop;
  update public.garden_removal
  set calculation = jsonb_set(calculation, '{unallocated_kurus}', to_jsonb(v_unallocated))
  where id = r.id;
  return v_count;
end;
$$;
comment on function private.open_removal_refunds(uuid) is
  'Opens the refund rows of an open removal from its calculation (§7.3); the remainder goes to unallocated_kurus.';

-- Access rows of a removal's parcel with their category and whether the end
-- of access removes them (§5.4): the customer's own row; viewers the
-- customer invited (approved invitation or granted_by); other viewers when
-- no other owner stays; everyone with revoke_all_access unless another
-- customer's line serves the parcel.
create function private.removal_access_scope(p_removal_id uuid)
returns table (access_id uuid, user_id uuid, category text, removed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select x.*, private.parcel_served_on(x.parcel_id, private.istanbul_today()) as served
    from public.garden_removal x where x.id = p_removal_id
  ),
  a as (
    select pa.id, pa.user_id,
           case
             when pa.user_id = r.customer_user_id then 'customer_owner'
             when pa.role = 'owner' then 'other_owner'
             when pa.granted_by = r.customer_user_id or pa.user_id in (
               select vi.user_id from private.viewer_invitation vi
               where vi.parcel_id = r.parcel_id and vi.status = 'approved' and vi.invited_by = r.customer_user_id)
               then 'invited_viewer'
             else 'other_viewer'
           end as category,
           r.revoke_all_access and not r.served as revoke_all
    from public.parcel_access pa, r
    where pa.parcel_id = r.parcel_id
  )
  select a.id, a.user_id, a.category,
         a.category in ('customer_owner', 'invited_viewer')
         or a.revoke_all
         or (a.category = 'other_viewer' and not exists (select 1 from a o where o.category = 'other_owner'))
  from a;
$$;

-- ---------------------------------------------------------------------------
-- 2. Completion
-- ---------------------------------------------------------------------------

-- Terminates an active order as the system (all gardens removed).
create function private.terminate_emptied_order(p_order_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  update public.service_order set status = 'terminated', terminated_at = now(), termination_note = p_reason
  where id = p_order_id and status = 'active'
  returning id, org_id, number into v;
  if v.id is null then
    return false;
  end if;
  perform private.audit(v.org_id, null, 'system', 'order.terminated', 'order', v.id,
    jsonb_build_object('number', v.number, 'reason', p_reason));
  return true;
end;
$$;

-- Closes what an ended base order leaves open: add-ons awaiting payment with
-- no money kept and no live card attempt are cancelled (money kept: the
-- activation refuses and refunds them), issued add-on quotes are cancelled.
-- Returns the number of orders cancelled.
create function private.close_base_addons(b public.service_order, p_actor uuid, p_role text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.service_order;
  v record;
  v_count integer := 0;
begin
  for x in
    select * from public.service_order o
    where o.addon_of_order_id = b.id and o.status = 'awaiting_payment'
    order by o.id
    for update
  loop
    if x.paid_kurus <= x.refunded_kurus and not private.live_payment_attempt(x.id) then
      perform private.cancel_order(x, null, 'system', 'base_terminated', null);
      v_count := v_count + 1;
    end if;
  end loop;
  for v in
    update public.quote set status = 'cancelled', decided_at = now(), decided_by = p_actor
    where addon_of_order_id = b.id and status = 'issued'
    returning id, org_id, number
  loop
    perform private.audit(v.org_id, p_actor, p_role, 'quote.cancelled', 'quote', v.id,
      jsonb_build_object('number', v.number, 'reason', 'base_closed', 'base_order_id', b.id));
  end loop;
  return v_count;
end;
$$;

-- Completes an open removal that is due (§5.3), in one transaction; true when
-- this call completed it. Idempotent: anything else returns false. A pending
-- order holding money or a live card attempt blocks it (blocked_reason
-- pending_order, audited once). Ops (ops_complete_garden_removal) and the
-- daily housekeeping call it.
create function private.complete_garden_removal(p_removal_id uuid, p_actor uuid, p_role text)
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

  v_affected := array(
    select distinct oi.order_id from public.service_order_item oi
    join public.service_order x on x.id = oi.order_id
    where oi.parcel_id = r.parcel_id and oi.customer_user_id = r.customer_user_id
      and x.status in ('active', 'completed') and oi.removed_on is null and x.service_end >= v_eff);
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
    set status = 'scheduled', effective_on = v_eff, access_until = v_eff + r.access_days, scheduled_at = now()
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
    and x.status in ('active', 'completed') and oi.removed_on is null and x.service_end >= v_eff;

  -- Operations, unless another line serves the parcel on the day.
  if not private.parcel_served_on(r.parcel_id, v_eff) then
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
  'Completes a due removal (§5.3): lines, refund calculation and rows, visits cancelled, parcel passive, emptied orders ended.';

-- ---------------------------------------------------------------------------
-- 3. Housekeeping
-- ---------------------------------------------------------------------------

-- Daily (pg_cron, after billing-housekeeping): completes due removals, sends
-- garden_access_ending once (7 days before the end of a window of at least
-- 14 days), and ends the access of windows that are over (§5.4).
create function private.garden_removal_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.istanbul_today();
  r public.garden_removal;
  v record;
  v_scheduled integer := 0;
  v_completed integer := 0;
  v_blocked integer := 0;
  v_cancelled integer := 0;
  v_notices integer := 0;
  v_revoked integer := 0;
  v_resumed integer := 0;
  v_removed uuid[];
  v_kept integer;
begin
  for r in
    select * from public.garden_removal x
    where x.status in ('requested', 'scheduled') and coalesce(x.effective_on, x.requested_effective_on) <= v_today
    order by coalesce(x.effective_on, x.requested_effective_on), x.id
  loop
    if private.complete_garden_removal(r.id, null, 'system') then
      v_completed := v_completed + 1;
    end if;
    select * into v from public.garden_removal x where x.id = r.id;
    if r.status = 'requested' and v.status <> 'requested' then
      v_scheduled := v_scheduled + 1;
    end if;
    if v.status = 'cancelled' then
      v_cancelled := v_cancelled + 1;
    elsif v.blocked_reason is not null then
      v_blocked := v_blocked + 1;
    end if;
  end loop;

  for v in
    update public.garden_removal set access_notice_sent_at = now()
    where status = 'completed' and access_notice_sent_at is null and access_revoked_at is null
      and access_days >= 14 and access_until - 7 <= v_today and v_today < access_until
    returning id, org_id, customer_user_id, number, parcel_id
  loop
    v_notices := v_notices + private.enqueue_garden_notification('garden_access_ending', v.org_id,
      v.customer_user_id, v.id, v.number, '/portal/parsel/' || v.parcel_id, v.parcel_id);
  end loop;

  for r in
    select * from public.garden_removal x
    where x.status = 'completed' and x.access_revoked_at is null and x.access_until <= v_today
    order by x.access_until, x.id
  loop
    perform private.lock_parcel_coverage(array[r.parcel_id]);
    select * into r from public.garden_removal x where x.id = r.id for update;
    continue when r.access_revoked_at is not null;
    if exists (
      select 1 from public.service_order_item oi
      join public.service_order o on o.id = oi.order_id
      where oi.parcel_id = r.parcel_id and o.customer_user_id = r.customer_user_id and o.status = 'active'
        and o.service_start <= v_today and v_today <= o.service_end
        and (oi.removed_on is null or oi.removed_on > v_today)
    ) then
      update public.garden_removal set access_revoked_at = now() where id = r.id;
      perform private.audit(r.org_id, null, 'system', 'garden_removal.access_revoked', 'garden_removal', r.id,
        jsonb_build_object('removed', 0, 'reason', 'resumed'));
      v_resumed := v_resumed + 1;
      continue;
    end if;
    v_removed := array(select s.user_id from private.removal_access_scope(r.id) s where s.removed order by s.user_id);
    delete from public.parcel_access pa
    where pa.id in (select s.access_id from private.removal_access_scope(r.id) s where s.removed);
    select count(*) into v_kept from public.parcel_access pa where pa.parcel_id = r.parcel_id;
    update public.garden_removal set access_revoked_at = now() where id = r.id;
    perform private.audit(r.org_id, null, 'system', 'garden_removal.access_revoked', 'garden_removal', r.id,
      jsonb_build_object('removed_user_ids', to_jsonb(v_removed), 'kept', v_kept, 'reason', 'expired'));
    v_revoked := v_revoked + 1;
  end loop;

  return jsonb_build_object('scheduled', v_scheduled, 'completed', v_completed, 'blocked', v_blocked,
    'cancelled', v_cancelled, 'access_notices', v_notices, 'access_revoked', v_revoked,
    'access_resumed', v_resumed);
end;
$$;
comment on function private.garden_removal_housekeeping() is
  'Daily (pg_cron): completes due garden removals, sends the access notice once, ends access windows that are over.';

select cron.schedule('garden-removal-housekeeping', '30 0 * * *', 'select private.garden_removal_housekeeping()');

-- ---------------------------------------------------------------------------
-- 4. Guards
-- ---------------------------------------------------------------------------

-- During the read-only window of a removed parcel (§5.4, §9.8): owners and
-- viewers write no question or reply (API users who are not expert or ops of
-- the org), no access row is added (API users who are not ops), no viewer is
-- invited (every role: owner_invite_viewer is security definer). Runs as
-- the caller; security definer paths (activate_order, ops functions) are not
-- API users here.
create function private.guard_parcel_read_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_api boolean := current_user in ('authenticated', 'anon');
begin
  if tg_table_name in ('question', 'question_reply') then
    if not v_api or new.org_id in (select authz.user_org_ids('{expert,ops}')) then
      return new;
    end if;
  elsif tg_table_name = 'parcel_access' then
    if not v_api or new.org_id in (select authz.user_org_ids('{ops}')) then
      return new;
    end if;
  end if;
  if authz.parcel_read_only(new.parcel_id) then
    raise exception 'parcel_read_only' using errcode = 'P0001',
      hint = 'The garden left the service; its reports are read-only until the access ends.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_parcel_read_only() from public;

create trigger zz_parcel_read_only before insert or update on public.question
for each row execute function private.guard_parcel_read_only();
create trigger zz_parcel_read_only before insert or update on public.question_reply
for each row execute function private.guard_parcel_read_only();
create trigger zz_parcel_read_only before insert on public.parcel_access
for each row execute function private.guard_parcel_read_only();
create trigger zz_parcel_read_only before insert on private.viewer_invitation
for each row execute function private.guard_parcel_read_only();

-- API users plan no inventory, scan or verification visit on or after the
-- effective day of an open removal (parcel_removal_scheduled), nor on a
-- parcel in its read-only window (parcel_passive). Like the passive guard,
-- security definer paths (create_verification_tour) are not API users here;
-- the completion cancels every planned visit anyway.
create function private.guard_removal_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from date;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.kind not in ('inventory', 'periodic_scan', 'verification') or new.status <> 'planned' then
    return new;
  end if;
  v_from := authz.parcel_open_removal_from(new.parcel_id);
  if v_from is not null and new.planned_date >= v_from then
    raise exception 'parcel_removal_scheduled' using errcode = 'P0001',
      hint = 'The garden leaves the service on that day; plan the visit before it.';
  end if;
  if authz.parcel_read_only(new.parcel_id) then
    raise exception 'parcel_passive' using errcode = 'P0001',
      hint = 'The garden left the service; it is added back with an add-on quote.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_removal_visit() from public;

create trigger session_guard_removal before insert or update of planned_date, status on public.session
for each row execute function private.guard_removal_visit();

-- ---------------------------------------------------------------------------
-- 5. Customer
-- ---------------------------------------------------------------------------

-- The line a customer's removal of the parcel starts from: the line serving
-- today, else the earliest paid future line (renewal). Null when none.
create function private.removal_target(p_org_id uuid, p_user_id uuid, p_parcel_id uuid)
returns table (order_item_id uuid, order_id uuid, service_start date, service_end date, future boolean,
  withdrawal_until date)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.id, o.id, o.service_start, o.service_end, o.service_start > private.istanbul_today(),
         private.withdrawal_until(o)
  from public.service_order_item oi
  join public.service_order o on o.id = oi.order_id
  where oi.parcel_id = p_parcel_id and oi.customer_user_id = p_user_id and o.org_id = p_org_id
    and o.status = 'active' and oi.removed_on is null and o.service_end >= private.istanbul_today()
  order by o.service_start > private.istanbul_today(), o.service_start, oi.line_no, oi.id
  limit 1;
$$;

-- Shared checks of the customer's preview and request; returns the target
-- line and the effective day. Errors: not_found, not_in_service,
-- invalid_input (withdrawal), garden_removal_open, parcel_order_pending,
-- withdrawal_expired.
create function private.customer_removal_plan(
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
  if private.has_open_removal(array[p_parcel_id], p_user_id) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.service_order o
    where o.customer_user_id = p_user_id and o.org_id = p_org_id and o.status = 'awaiting_payment'
      and p_parcel_id = any (private.order_line_parcels(o.id))
  ) then
    raise exception 'parcel_order_pending' using errcode = 'P0001';
  end if;
  if coalesce(p_withdrawal, false) and (t.withdrawal_until is null or v_today > t.withdrawal_until) then
    raise exception 'withdrawal_expired' using errcode = 'P0001';
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

-- The effective day, access end and the most the refund can be for one of
-- the three choices (§5.1). visits_used is today's count: the estimate is an
-- upper bound. Errors: not_customer, not_found, not_in_service,
-- garden_removal_open, parcel_order_pending, withdrawal_expired,
-- invalid_input (withdrawal: both choices).
create function public.customer_garden_removal_preview(
  p_parcel_id uuid,
  p_at_period_end boolean default false,
  p_withdrawal boolean default false
)
returns table (
  order_item_id uuid,
  effective_on date,
  withdrawal boolean,
  withdrawal_until date,
  access_until date,
  visits_entitled smallint,
  visits_used integer,
  refund_estimate_kurus bigint,
  line_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  pl record;
  v_calc jsonb;
  v_line jsonb;
begin
  if v_user is null or v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  select * into pl from private.customer_removal_plan(v_org, v_user, p_parcel_id, p_at_period_end, p_withdrawal);
  v_calc := private.removal_calc(v_org, v_user, p_parcel_id, pl.order_item_id, pl.effective_on,
    coalesce(p_withdrawal, false), 'other');
  select x into v_line from jsonb_array_elements(v_calc -> 'lines') x
  where x ->> 'order_item_id' = pl.order_item_id::text;
  return query select pl.order_item_id, pl.effective_on, coalesce(p_withdrawal, false), pl.withdrawal_until,
    pl.effective_on + (private.billing_setting(v_org)).removal_access_days,
    coalesce((v_line ->> 'visits_entitled')::smallint,
      (select qi.visits from public.service_order_item oi join public.quote_item qi on qi.id = oi.quote_item_id
       where oi.id = pl.order_item_id)),
    coalesce((v_line ->> 'visits_used')::integer, 0),
    (v_calc ->> 'refund_kurus')::bigint, jsonb_array_length(v_calc -> 'lines');
end;
$$;
comment on function public.customer_garden_removal_preview(uuid, boolean, boolean) is
  'Customer: effective day, access end and the refund estimate (upper bound) of removing a garden.';

-- Opens a requested removal (C-…) of a garden in service; it completes by
-- itself on the effective day. No message. Errors: demo_read_only,
-- not_customer, not_found, garden_changes_closed, not_in_service,
-- garden_removal_open (also for a concurrent request), parcel_order_pending,
-- withdrawal_expired, invalid_input (reason, note, withdrawal), state_changed.
create function public.customer_request_garden_removal(
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
  s public.org_billing_setting;
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
    raise exception 'garden_changes_closed' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('sold', 'not_needed', 'dissatisfied', 'cost', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform private.lock_parcel_coverage(array[p_parcel_id]);
  select * into pl from private.customer_removal_plan(v_org, v_user, p_parcel_id, p_at_period_end, p_withdrawal);

  v_number := private.next_document_number(v_org, 'C');
  begin
    insert into public.garden_removal (
      org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
      reason, customer_note, at_period_end, withdrawal, requested_effective_on, access_days, requested_by
    )
    select v_org, v_user, v_number, p.id, pl.order_id, pl.order_item_id, p.name, 'requested', 'customer',
           p_reason::public.garden_removal_reason, v_note, coalesce(p_at_period_end, false),
           coalesce(p_withdrawal, false), pl.effective_on, s.removal_access_days, v_user
    from public.parcel p where p.id = p_parcel_id
    returning id into v_id;
  exception when unique_violation then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end;
  perform private.audit(v_org, v_user, 'customer', 'garden_removal.requested', 'garden_removal', v_id,
    jsonb_build_object('number', v_number, 'withdrawal', coalesce(p_withdrawal, false),
      'at_period_end', coalesce(p_at_period_end, false), 'access_days', s.removal_access_days,
      'effective_on', pl.effective_on));
  return v_id;
end;
$$;
comment on function public.customer_request_garden_removal(uuid, text, text, boolean, boolean) is
  'Customer: asks to remove a garden (in 30 days, at the period end, or withdrawal today); returns the removal id.';

-- requested or scheduled → cancelled by the customer (no message). Errors:
-- demo_read_only, not_found, removal_not_open, state_changed.
create function public.customer_cancel_garden_removal(p_removal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  v_user uuid := (select auth.uid());
begin
  perform private.assert_not_demo();
  select * into r from public.garden_removal x where x.id = p_removal_id and x.customer_user_id = v_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.lock_parcel_coverage(array[r.parcel_id]);
  select * into r from public.garden_removal x where x.id = p_removal_id for update;
  if r.status not in ('requested', 'scheduled') then
    raise exception 'removal_not_open' using errcode = 'P0001';
  end if;
  update public.garden_removal
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', blocked_reason = null
  where id = r.id and status = r.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(r.org_id, v_user, 'customer', 'garden_removal.cancelled', 'garden_removal', r.id,
    jsonb_build_object('number', r.number, 'from', r.status));
end;
$$;
comment on function public.customer_cancel_garden_removal(uuid) is 'Customer: withdraws an open garden removal.';

-- ---------------------------------------------------------------------------
-- 6. Ops
-- ---------------------------------------------------------------------------

-- The removal for ops (read without a lock): not_found, forbidden (not ops,
-- or the caller's own).
create function private.removal_for_ops(p_removal_id uuid)
returns public.garden_removal
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
begin
  select * into r from public.garden_removal x where x.id = p_removal_id;
  if not found or r.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops_customer(r.org_id, r.customer_user_id);
  return r;
end;
$$;

-- An access days value for ops: 0..365; below the setting only for a
-- transfer, a duplicate or with a note (invalid_input access_days).
create function private.check_access_days(
  p_access_days integer,
  p_setting integer,
  p_reason public.garden_removal_reason,
  p_note text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_access_days is null or p_access_days not between 0 and 365 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'access_days';
  end if;
  if p_access_days < p_setting and p_reason not in ('transfer', 'duplicate') and p_note is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'access_days';
  end if;
end;
$$;

-- The last day + 1 an open removal of the customer's parcel may take: the
-- day after the latest active line ends.
create function private.removal_last_effective(p_parcel_id uuid, p_user_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(o.service_end) + 1 from public.service_order_item oi
  join public.service_order o on o.id = oi.order_id
  where oi.parcel_id = p_parcel_id and oi.customer_user_id = p_user_id and o.status = 'active'
    and oi.removed_on is null;
$$;

-- Removals of the org: open ones (null), all ('all') or one status; by the
-- effective day.
create function public.ops_garden_removals(p_org_id uuid, p_status text default null, p_limit integer default 200)
returns table (
  id uuid,
  number text,
  status public.garden_removal_status,
  customer_user_id uuid,
  customer_name text,
  parcel_id uuid,
  garden_name text,
  order_id uuid,
  order_number text,
  order_item_id uuid,
  initiated_by text,
  reason public.garden_removal_reason,
  customer_note text,
  ops_note text,
  at_period_end boolean,
  withdrawal boolean,
  requested_effective_on date,
  effective_on date,
  access_days smallint,
  access_until date,
  refund_mode text,
  refund_kurus bigint,
  planned_visits_before integer,
  planned_visits_after integer,
  requested_at timestamptz,
  scheduled_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  access_revoked_at timestamptz,
  blocked_reason text,
  revoke_all_access boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and p_status <> 'all'
     and not p_status = any (enum_range(null::public.garden_removal_status)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select r.id, r.number, r.status, r.customer_user_id, op.full_name, r.parcel_id, r.garden_name, r.order_id, o.number,
         r.order_item_id, r.initiated_by, r.reason, r.customer_note, r.ops_note, r.at_period_end, r.withdrawal,
         r.requested_effective_on, r.effective_on, r.access_days, r.access_until, r.refund_mode, r.refund_kurus,
         (select count(*)::integer from public.session s
          where s.parcel_id = r.parcel_id and s.status = 'planned' and s.kind in ('inventory', 'periodic_scan', 'verification')
            and s.planned_date < coalesce(r.effective_on, r.requested_effective_on)),
         (select count(*)::integer from public.session s
          where s.parcel_id = r.parcel_id and s.status = 'planned' and s.kind in ('inventory', 'periodic_scan', 'verification')
            and (s.planned_date is null or s.planned_date >= coalesce(r.effective_on, r.requested_effective_on))),
         r.requested_at, r.scheduled_at, r.completed_at, r.cancelled_at, r.access_revoked_at, r.blocked_reason,
         r.revoke_all_access
  from public.garden_removal r
  join public.service_order o on o.id = r.order_id
  left join private.owner_profile op on op.org_id = r.org_id and op.user_id = r.customer_user_id
  where r.org_id = p_org_id
    and case
          when p_status is null then r.status in ('requested', 'scheduled')
          when p_status = 'all' then true
          else r.status::text = p_status
        end
  order by coalesce(r.effective_on, r.requested_effective_on), r.requested_at, r.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_garden_removals(uuid, text, integer) is
  'Ops: garden removals of the org (open by default) with internal columns and planned visits around the day.';

-- The calculation (§7.2; stored once completed) of a removal on a day (its
-- own when null), plus what the completion touches. Errors: not_found, forbidden.
create function public.ops_garden_removal_preview(p_removal_id uuid, p_effective_on date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  v_eff date;
  v jsonb;
begin
  r := private.removal_for_ops(p_removal_id);
  v_eff := coalesce(p_effective_on, r.effective_on, r.requested_effective_on);
  v := case when r.status = 'completed' and p_effective_on is null then r.calculation
            else private.removal_calculation(r.id, v_eff) end;
  return v || jsonb_build_object(
    'access_until', coalesce(r.access_until, v_eff + r.access_days),
    'withdrawal', r.withdrawal,
    'blocked_reason', r.blocked_reason,
    'planned_visits_before', (select count(*) from public.session s
      where s.parcel_id = r.parcel_id and s.status = 'planned' and s.kind in ('inventory', 'periodic_scan', 'verification')
        and s.planned_date < v_eff),
    'planned_visits_after', (select count(*) from public.session s
      where s.parcel_id = r.parcel_id and s.status = 'planned' and s.kind in ('inventory', 'periodic_scan', 'verification')
        and (s.planned_date is null or s.planned_date >= v_eff)),
    'captured_unpublished', (select count(*) from public.session s
      where s.parcel_id = r.parcel_id and s.status in ('captured', 'processed', 'in_review')
        and s.kind in ('inventory', 'periodic_scan', 'verification')),
    'open_followups', (select count(*) from public.followup_request f
      where f.parcel_id = r.parcel_id and f.status in ('open', 'planned')),
    'pending_invitations', (select count(*) from private.viewer_invitation vi
      where vi.parcel_id = r.parcel_id and vi.status = 'pending'),
    'open_refunds', (select count(*) from public.refund x
      where x.customer_user_id = r.customer_user_id and x.status in ('requested', 'processing')
        and x.order_id in (select oi.order_id from public.service_order_item oi
                           where oi.parcel_id = r.parcel_id and oi.customer_user_id = r.customer_user_id)),
    'pending_orders', (select coalesce(jsonb_agg(o.number order by o.number), '[]'::jsonb)
      from public.service_order o
      where o.customer_user_id = r.customer_user_id and o.org_id = r.org_id and o.status = 'awaiting_payment'
        and r.parcel_id = any (private.order_line_parcels(o.id))),
    'access_scope', (select jsonb_build_object(
        'customer_owner', count(*) filter (where s.category = 'customer_owner'),
        'invited_viewers', count(*) filter (where s.category = 'invited_viewer'),
        'other_viewers', count(*) filter (where s.category = 'other_viewer'),
        'other_owners', count(*) filter (where s.category = 'other_owner'))
      from private.removal_access_scope(r.id) s)
  );
end;
$$;
comment on function public.ops_garden_removal_preview(uuid, date) is
  'Ops: refund calculation of a removal with planned visits, follow-ups, invitations, pending orders and access scope.';

-- A scheduled removal opened by ops for an order line in service (no
-- withdrawal); sends garden_removal_scheduled. Errors: not_found, forbidden,
-- garden_changes_closed, not_in_service, garden_removal_open,
-- parcel_order_pending, invalid_input (reason, effective_on, access_days,
-- note).
create function public.ops_request_garden_removal(
  p_order_item_id uuid,
  p_reason text,
  p_effective_on date,
  p_note text default null,
  p_access_days integer default null,
  p_revoke_all_access boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  oi public.service_order_item;
  o public.service_order;
  s public.org_billing_setting;
  v_actor uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_reason public.garden_removal_reason;
  v_access integer;
  v_last date;
  v_id uuid;
  v_number text;
begin
  select * into oi from public.service_order_item x where x.id = p_order_item_id;
  if not found or oi.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops_customer(oi.org_id, oi.customer_user_id);
  s := private.billing_setting(oi.org_id);
  if not s.garden_changes_enabled then
    raise exception 'garden_changes_closed' using errcode = 'P0001';
  end if;
  if p_reason is null or not p_reason = any (enum_range(null::public.garden_removal_reason)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  v_reason := p_reason::public.garden_removal_reason;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  v_access := coalesce(p_access_days, s.removal_access_days);
  perform private.check_access_days(v_access, s.removal_access_days, v_reason, v_note);

  perform private.lock_parcel_coverage(array[oi.parcel_id]);
  select * into o from public.service_order x where x.id = oi.order_id;
  select * into oi from public.service_order_item x where x.id = oi.id;
  if oi.parcel_id is null or o.status <> 'active' or oi.removed_on is not null
     or o.service_end < private.istanbul_today() then
    raise exception 'not_in_service' using errcode = 'P0001';
  end if;
  v_last := private.removal_last_effective(oi.parcel_id, oi.customer_user_id);
  if p_effective_on is null or p_effective_on < private.istanbul_today() or p_effective_on > v_last then
    raise exception 'invalid_input' using errcode = '22023', detail = 'effective_on';
  end if;
  if private.has_open_removal(array[oi.parcel_id], oi.customer_user_id) then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.service_order x
    where x.customer_user_id = oi.customer_user_id and x.org_id = oi.org_id and x.status = 'awaiting_payment'
      and oi.parcel_id = any (private.order_line_parcels(x.id))
  ) then
    raise exception 'parcel_order_pending' using errcode = 'P0001';
  end if;

  v_number := private.next_document_number(oi.org_id, 'C');
  begin
    insert into public.garden_removal (
      org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
      reason, ops_note, requested_effective_on, effective_on, access_days, access_until, revoke_all_access,
      requested_by, decided_by, scheduled_at
    )
    select oi.org_id, oi.customer_user_id, v_number, p.id, oi.order_id, oi.id, p.name, 'scheduled', 'ops',
           v_reason, v_note, p_effective_on, p_effective_on, v_access, p_effective_on + v_access,
           coalesce(p_revoke_all_access, false), v_actor, v_actor, now()
    from public.parcel p where p.id = oi.parcel_id
    returning id into v_id;
  exception when unique_violation then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end;
  perform private.audit(oi.org_id, v_actor, 'ops', 'garden_removal.requested', 'garden_removal', v_id,
    jsonb_build_object('number', v_number, 'reason', v_reason, 'withdrawal', false, 'at_period_end', false,
      'access_days', v_access));
  perform private.audit(oi.org_id, v_actor, 'ops', 'garden_removal.scheduled', 'garden_removal', v_id,
    jsonb_build_object('from_effective_on', null, 'to_effective_on', p_effective_on,
      'from_access_days', s.removal_access_days, 'to_access_days', v_access,
      'revoke_all_access', coalesce(p_revoke_all_access, false), 'change_id', null));
  perform private.enqueue_garden_notification('garden_removal_scheduled', oi.org_id, oi.customer_user_id, v_id,
    v_number, '/portal/parsel/' || oi.parcel_id, oi.parcel_id);
  return v_id;
end;
$$;
comment on function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean) is
  'Ops: opens a scheduled garden removal for an order line (transfer: access 0); sends garden_removal_scheduled.';

-- Confirms (requested → scheduled) or moves (scheduled → scheduled) the day,
-- access days and access scope; null keeps the value. A day other than the
-- requested one needs a note. First confirmation: garden_removal_scheduled;
-- a later day change: garden_removal_rescheduled with a fresh ref_id
-- (change_id). Errors: not_found, forbidden, removal_not_open, invalid_input
-- (effective_on, access_days, note), state_changed.
create function public.ops_schedule_garden_removal(
  p_removal_id uuid,
  p_effective_on date,
  p_note text default null,
  p_access_days integer default null,
  p_revoke_all_access boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  s public.org_billing_setting;
  v_actor uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
  v_access integer;
  v_last date;
  v_change uuid;
begin
  r := private.removal_for_ops(p_removal_id);
  perform private.lock_parcel_coverage(array[r.parcel_id]);
  select * into r from public.garden_removal x where x.id = p_removal_id for update;
  if r.status not in ('requested', 'scheduled') then
    raise exception 'removal_not_open' using errcode = 'P0001';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  v_last := coalesce(private.removal_last_effective(r.parcel_id, r.customer_user_id), r.requested_effective_on);
  if p_effective_on is null or p_effective_on < private.istanbul_today() or p_effective_on > v_last then
    raise exception 'invalid_input' using errcode = '22023', detail = 'effective_on';
  end if;
  if p_effective_on <> r.requested_effective_on and v_note is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  s := private.billing_setting(r.org_id);
  v_access := coalesce(p_access_days, r.access_days);
  if v_access is distinct from r.access_days::integer then
    perform private.check_access_days(v_access, s.removal_access_days, r.reason, v_note);
  end if;
  if r.status = 'scheduled' and p_effective_on is distinct from r.effective_on then
    v_change := gen_random_uuid();
  end if;

  update public.garden_removal
  set status = 'scheduled', effective_on = p_effective_on, access_days = v_access,
      access_until = p_effective_on + v_access, revoke_all_access = coalesce(p_revoke_all_access, revoke_all_access),
      scheduled_at = coalesce(scheduled_at, now()), decided_by = v_actor, ops_note = coalesce(v_note, ops_note)
  where id = r.id and status = r.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(r.org_id, v_actor, 'ops', 'garden_removal.scheduled', 'garden_removal', r.id,
    jsonb_build_object('from_effective_on', coalesce(r.effective_on, r.requested_effective_on),
      'to_effective_on', p_effective_on, 'from_access_days', r.access_days, 'to_access_days', v_access,
      'revoke_all_access', coalesce(p_revoke_all_access, r.revoke_all_access), 'change_id', v_change));
  if r.status = 'requested' then
    perform private.enqueue_garden_notification('garden_removal_scheduled', r.org_id, r.customer_user_id, r.id,
      r.number, '/portal/parsel/' || r.parcel_id, r.parcel_id);
  elsif v_change is not null then
    perform private.enqueue_garden_notification('garden_removal_rescheduled', r.org_id, r.customer_user_id, v_change,
      r.number, '/portal/parsel/' || r.parcel_id, r.parcel_id);
  end if;
end;
$$;
comment on function public.ops_schedule_garden_removal(uuid, date, text, integer, boolean) is
  'Ops: confirms or moves the day of a garden removal (note for another day); messages the customer.';

-- requested or scheduled → cancelled with a required note; sends
-- garden_removal_cancelled. Errors: not_found, forbidden, removal_not_open,
-- invalid_input (note), state_changed.
create function public.ops_cancel_garden_removal(p_removal_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
  v_actor uuid := (select auth.uid());
  v_note text := nullif(btrim(p_note), '');
begin
  r := private.removal_for_ops(p_removal_id);
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform private.lock_parcel_coverage(array[r.parcel_id]);
  select * into r from public.garden_removal x where x.id = p_removal_id for update;
  if r.status not in ('requested', 'scheduled') then
    raise exception 'removal_not_open' using errcode = 'P0001';
  end if;
  update public.garden_removal
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'ops', blocked_reason = null, ops_note = v_note,
      decided_by = v_actor
  where id = r.id and status = r.status;
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(r.org_id, v_actor, 'ops', 'garden_removal.cancelled', 'garden_removal', r.id,
    jsonb_build_object('number', r.number, 'from', r.status));
  perform private.enqueue_garden_notification('garden_removal_cancelled', r.org_id, r.customer_user_id, r.id,
    r.number, '/portal/parsel/' || r.parcel_id, r.parcel_id);
end;
$$;
comment on function public.ops_cancel_garden_removal(uuid, text) is
  'Ops: cancels an open garden removal (note required); sends garden_removal_cancelled.';

-- Completes a due removal now (or cancels it, by the system, when its order
-- ended and no line is left). Errors: not_found, forbidden,
-- removal_not_open, removal_not_due, parcel_order_pending (blocked by an
-- order awaiting payment), state_changed (completed or cancelled meanwhile).
create function public.ops_complete_garden_removal(p_removal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
begin
  r := private.removal_for_ops(p_removal_id);
  if r.status not in ('requested', 'scheduled') then
    raise exception 'removal_not_open' using errcode = 'P0001';
  end if;
  if coalesce(r.effective_on, r.requested_effective_on) > private.istanbul_today() then
    raise exception 'removal_not_due' using errcode = 'P0001';
  end if;
  if private.complete_garden_removal(r.id, (select auth.uid()), 'ops') then
    return;
  end if;
  select * into r from public.garden_removal x where x.id = p_removal_id;
  if r.status in ('requested', 'scheduled') and r.blocked_reason = 'pending_order' then
    raise exception 'parcel_order_pending' using errcode = 'P0001';
  end if;
  -- Cancelled by this call: its order ended and no line was left.
  if r.status = 'cancelled' and r.cancelled_by = 'system' and r.cancelled_at = now() then
    return;
  end if;
  raise exception 'state_changed' using errcode = 'P0001';
end;
$$;
comment on function public.ops_complete_garden_removal(uuid) is 'Ops: completes a due garden removal now.';

-- ---------------------------------------------------------------------------
-- 7. Replaced functions
-- ---------------------------------------------------------------------------

-- As in 20261030105300_quotes_orders.sql, and for a base order: its active
-- add-ons are terminated (base_terminated), add-ons awaiting payment with no
-- money kept are cancelled, issued add-on quotes are cancelled. Open
-- removals on the ended orders' gardens that no other active order serves
-- are cancelled by the system (no message). Parcels are not touched.
create or replace function public.ops_terminate_order(p_order_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  x public.service_order;
  v_note text := nullif(btrim(p_note), '');
  v_actor uuid := (select auth.uid());
  v_set uuid[];
  v_ended uuid[];
  v_removal record;
begin
  select * into o from public.service_order where id = p_order_id;
  if not found or o.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(o.org_id);
  if o.customer_user_id = v_actor then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_note is null or length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  v_set := array[o.id] || case when o.addon_of_order_id is null then array(
    select y.id from public.service_order y
    where y.addon_of_order_id = o.id and y.status in ('active', 'awaiting_payment')) else '{}'::uuid[] end;
  perform private.lock_parcel_coverage(array(
    select oi.parcel_id from public.service_order_item oi where oi.order_id = any (v_set) and oi.parcel_id is not null));
  perform 1 from public.service_order y where y.id = any (v_set) order by y.id for update;
  select * into o from public.service_order where id = p_order_id;

  update public.service_order set status = 'terminated', terminated_at = now(), termination_note = v_note
  where id = o.id and status = 'active';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, v_actor, 'ops', 'order.terminated', 'order', o.id,
    jsonb_build_object('number', o.number));
  v_ended := array[o.id];

  if o.addon_of_order_id is null then
    for x in
      select * from public.service_order y where y.addon_of_order_id = o.id and y.status = 'active' order by y.id
    loop
      update public.service_order set status = 'terminated', terminated_at = now(), termination_note = 'base_terminated'
      where id = x.id and status = 'active';
      perform private.audit(x.org_id, v_actor, 'ops', 'order.terminated', 'order', x.id,
        jsonb_build_object('number', x.number, 'reason', 'base_terminated', 'base_order_id', o.id));
      v_ended := v_ended || x.id;
    end loop;
    perform private.close_base_addons(o, v_actor, 'ops');
  end if;

  for v_removal in
    select r.id, r.org_id, r.number from public.garden_removal r
    where r.customer_user_id = o.customer_user_id and r.status in ('requested', 'scheduled')
      and r.parcel_id in (select oi.parcel_id from public.service_order_item oi where oi.order_id = any (v_ended))
      and not exists (
        select 1 from public.service_order_item oi
        join public.service_order y on y.id = oi.order_id
        where oi.parcel_id = r.parcel_id and y.status = 'active' and oi.removed_on is null)
    order by r.id
    for update of r
  loop
    update public.garden_removal
    set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', blocked_reason = null,
        ops_note = 'order_terminated'
    where id = v_removal.id and status in ('requested', 'scheduled');
    perform private.audit(v_removal.org_id, null, 'system', 'garden_removal.cancelled', 'garden_removal',
      v_removal.id, jsonb_build_object('number', v_removal.number, 'reason', 'order_terminated'));
  end loop;
end;
$$;

-- As in 20261024120000_parcel_lifecycle.sql; a removed parcel in its
-- read-only window is not resumed (parcel_removed): it comes back with an
-- add-on quote.
create or replace function public.ops_set_parcel_passive(p_parcel_id uuid, p_passive boolean)
returns public.parcel_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  v_planned integer;
  v_status public.parcel_status;
begin
  select * into p from public.parcel where id = p_parcel_id for update;
  if not found or p.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_passive is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_passive';
  end if;

  if p_passive then
    if p.status = 'passive' then
      return p.status;
    end if;
    select count(*) into v_planned from public.session s
    where s.parcel_id = p.id and s.status = 'planned'
      and s.kind in ('inventory', 'periodic_scan', 'verification');
    if v_planned > 0 then
      raise exception 'has_planned_visits' using errcode = 'P0001', detail = v_planned::text;
    end if;
    v_status := 'passive';
  else
    if private.parcel_read_only(p.id) then
      raise exception 'parcel_removed' using errcode = 'P0001',
        hint = 'The garden was removed from the service; add it back with an add-on quote.';
    end if;
    if p.status <> 'passive' then
      return p.status;
    end if;
    v_status := private.parcel_lifecycle_status(p.id);
  end if;

  update public.parcel set status = v_status where id = p.id;
  return v_status;
end;
$$;

-- As in 20261030105700_ops_billing_views.sql; renewals_due by
-- private.renewal_due (still without base orders that have an issued renewal
-- quote) and three removal counts appended.
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
  garden_removals_blocked integer
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
     where r.org_id = p_org_id and r.status in ('requested', 'scheduled') and r.blocked_reason is not null);
end;
$$;
comment on function public.ops_billing_summary(uuid) is
  'Ops: counts for the customers and payments card (open work, renewals due, sign-up attempts in 24 hours, garden removals).';

-- As in 20261030100400_catalog_applications.sql; the defaults come from
-- private.billing_setting (with the five IP14 settings).
create or replace function public.ops_billing_setting(p_org_id uuid)
returns setof public.org_billing_setting
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  return next private.billing_setting(p_org_id);
end;
$$;

-- As in 20261030100400_catalog_applications.sql, plus garden_changes_enabled,
-- addon_min_days (1–180), removal_notice_days (0–90), removal_access_days
-- (0–365) and removal_refund_mode (unused_visits, manual).
create or replace function public.ops_save_billing_setting(p_org_id uuid, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  r public.org_billing_setting;
  v_allowed text[] := array[
    'accepts_signups', 'identity_number_required', 'legal_name', 'tax_office', 'tax_number',
    'mersis_number', 'address', 'phone', 'email', 'bank_name', 'iban', 'iban_holder',
    'payment_due_days', 'quote_valid_days', 'renewal_notice_days',
    'garden_changes_enabled', 'addon_min_days', 'removal_notice_days', 'removal_access_days', 'removal_refund_mode'
  ];
  v_iban text;
  v_n numeric;
begin
  perform private.require_ops(p_org_id);
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'settings';
  end if;
  for k in select jsonb_object_keys(p_settings) loop
    if not k = any (v_allowed) then
      raise exception 'invalid_input' using errcode = '22023', detail = k;
    end if;
  end loop;

  insert into public.org_billing_setting (org_id, updated_by) values (p_org_id, (select auth.uid()))
  on conflict (org_id) do nothing;
  select * into r from public.org_billing_setting s where s.org_id = p_org_id for update;

  if p_settings ? 'accepts_signups' then
    r.accepts_signups := private.input_bool(p_settings, 'accepts_signups');
    if r.accepts_signups is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'accepts_signups';
    end if;
  end if;
  if p_settings ? 'identity_number_required' then
    r.identity_number_required := private.input_bool(p_settings, 'identity_number_required');
    if r.identity_number_required is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'identity_number_required';
    end if;
  end if;
  if p_settings ? 'garden_changes_enabled' then
    r.garden_changes_enabled := private.input_bool(p_settings, 'garden_changes_enabled');
    if r.garden_changes_enabled is null then
      raise exception 'invalid_input' using errcode = '22023', detail = 'garden_changes_enabled';
    end if;
  end if;
  if p_settings ? 'legal_name' then r.legal_name := private.input_text(p_settings, 'legal_name', 1, 200); end if;
  if p_settings ? 'tax_office' then r.tax_office := private.input_text(p_settings, 'tax_office', 1, 100); end if;
  if p_settings ? 'tax_number' then
    r.tax_number := private.input_text(p_settings, 'tax_number', 10, 10);
    if r.tax_number !~ '^[0-9]{10}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'tax_number';
    end if;
  end if;
  if p_settings ? 'mersis_number' then
    r.mersis_number := private.input_text(p_settings, 'mersis_number', 16, 16);
    if r.mersis_number !~ '^[0-9]{16}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'mersis_number';
    end if;
  end if;
  if p_settings ? 'address' then r.address := private.input_text(p_settings, 'address', 1, 500); end if;
  if p_settings ? 'phone' then
    r.phone := private.input_text(p_settings, 'phone', 8, 16);
    if r.phone !~ '^\+[1-9][0-9]{6,14}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
    end if;
  end if;
  if p_settings ? 'email' then
    r.email := lower(private.input_text(p_settings, 'email', 3, 254));
    if r.email is not null and not private.is_valid_email(r.email) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'email';
    end if;
  end if;
  if p_settings ? 'bank_name' then r.bank_name := private.input_text(p_settings, 'bank_name', 1, 100); end if;
  if p_settings ? 'iban' then
    v_iban := upper(replace(private.input_text(p_settings, 'iban', 1, 40), ' ', ''));
    if v_iban !~ '^TR[0-9]{24}$' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'iban';
    end if;
    r.iban := v_iban;
  end if;
  if p_settings ? 'iban_holder' then r.iban_holder := private.input_text(p_settings, 'iban_holder', 1, 200); end if;
  foreach k in array array['payment_due_days', 'quote_valid_days', 'renewal_notice_days'] loop
    if p_settings ? k then
      v_n := private.input_number(p_settings, k, true);
      if v_n <> trunc(v_n) or v_n < 1 or v_n > 1000 then
        raise exception 'invalid_input' using errcode = '22023', detail = k;
      end if;
      case k
        when 'payment_due_days' then r.payment_due_days := v_n;
        when 'quote_valid_days' then r.quote_valid_days := v_n;
        else r.renewal_notice_days := v_n;
      end case;
    end if;
  end loop;
  foreach k in array array['addon_min_days', 'removal_notice_days', 'removal_access_days'] loop
    if p_settings ? k then
      v_n := private.input_number(p_settings, k, true);
      if v_n <> trunc(v_n)
         or v_n < (case k when 'addon_min_days' then 1 else 0 end)
         or v_n > (case k when 'addon_min_days' then 180 when 'removal_notice_days' then 90 else 365 end) then
        raise exception 'invalid_input' using errcode = '22023', detail = k;
      end if;
      case k
        when 'addon_min_days' then r.addon_min_days := v_n;
        when 'removal_notice_days' then r.removal_notice_days := v_n;
        else r.removal_access_days := v_n;
      end case;
    end if;
  end loop;
  if p_settings ? 'removal_refund_mode' then
    if jsonb_typeof(p_settings -> 'removal_refund_mode') <> 'string'
       or p_settings ->> 'removal_refund_mode' not in ('unused_visits', 'manual') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'removal_refund_mode';
    end if;
    r.removal_refund_mode := p_settings ->> 'removal_refund_mode';
  end if;

  begin
    update public.org_billing_setting
    set accepts_signups = r.accepts_signups, identity_number_required = r.identity_number_required,
        legal_name = r.legal_name, tax_office = r.tax_office, tax_number = r.tax_number,
        mersis_number = r.mersis_number, address = r.address, phone = r.phone, email = r.email,
        bank_name = r.bank_name, iban = r.iban, iban_holder = r.iban_holder,
        payment_due_days = r.payment_due_days, quote_valid_days = r.quote_valid_days,
        renewal_notice_days = r.renewal_notice_days, garden_changes_enabled = r.garden_changes_enabled,
        addon_min_days = r.addon_min_days, removal_notice_days = r.removal_notice_days,
        removal_access_days = r.removal_access_days, removal_refund_mode = r.removal_refund_mode,
        updated_by = (select auth.uid())
    where org_id = p_org_id;
  exception
    when unique_violation then
      raise exception 'exists' using errcode = '23505', detail = 'accepts_signups';
    when check_violation or not_null_violation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'billing_setting.saved', 'billing_setting', p_org_id,
    jsonb_build_object('fields', (select jsonb_agg(x order by x) from jsonb_object_keys(p_settings) x)));
end;
$$;

-- As in 20261101120300_demo_guard_drift.sql, plus the IP14 entries: the
-- garden removal account guard, the customer write functions that call
-- private.assert_not_demo() and enqueue_garden_notification's demo filter.
create or replace function private.demo_guard_drift()
returns table (kind text, object text, problem text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Tables without the write guard.
  select 'table', c.oid::regclass::text, 'zz_demo_read_only missing'
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and not exists (
      select 1 from pg_catalog.pg_depend d
      where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    and c.oid <> 'private.demo_session'::regclass
    and not exists (
      select 1 from pg_catalog.pg_trigger g where g.tgrelid = c.oid and g.tgname = 'zz_demo_read_only')

  union all

  -- Functions IP13-A overrides: every overload still carries its demo filter.
  select 'function', coalesce(p.oid::regprocedure::text, f.schema_name || '.' || f.function_name),
         case when p.oid is null then 'missing' else 'demo filter missing: ' || f.marker end
  from (values
      ('public', 'approve_boundary', 'private.assert_not_demo()'),
      ('public', 'owner_invite_viewer', 'private.assert_not_demo()'),
      ('public', 'owner_cancel_viewer_invitation', 'private.assert_not_demo()'),
      ('private', 'enqueue_notifications', 'private.is_demo_org('),
      ('private', 'enqueue_billing_notification', 'private.is_demo_org('),
      ('public', 'save_ai_assessment', 'demo_org_no_ai'),
      ('public', 'ops_find_user_id', 'raw_app_meta_data ->> ''demo'''),
      ('public', 'signup_find_account', 'raw_app_meta_data ->> ''demo'''),
      ('public', 'customer_request_garden_removal', 'private.assert_not_demo()'),
      ('public', 'customer_cancel_garden_removal', 'private.assert_not_demo()'),
      ('public', 'customer_withdraw_application_garden', 'private.assert_not_demo()'),
      ('public', 'customer_revise_order', 'private.assert_not_demo()'),
      ('private', 'enqueue_garden_notification', 'private.is_demo_org(')
    ) as f (schema_name, function_name, marker)
  left join pg_catalog.pg_namespace n on n.nspname = f.schema_name
  left join pg_catalog.pg_proc p on p.pronamespace = n.oid and p.proname = f.function_name
  where p.oid is null or strpos(p.prosrc, f.marker) = 0

  union all

  -- Account scope guards of 20261101120200 (b) and IP14.
  select 'account_guard', a.table_name || '.' || a.trigger_name, 'missing'
  from (values
      ('public.parcel_access', 'demo_account_scope_user_id'),
      ('public.membership', 'demo_account_scope_user_id'),
      ('private.owner_profile', 'demo_account_scope_user_id'),
      ('private.billing_profile', 'demo_account_scope_user_id'),
      ('private.consent_record', 'demo_account_scope_user_id'),
      ('private.consent_record', 'demo_account_scope_subject_id'),
      ('private.customer_signup', 'demo_account_scope_user_id'),
      ('private.viewer_invitation', 'demo_account_scope_user_id'),
      ('public.notification', 'demo_account_scope_recipient_user_id'),
      ('public.service_application', 'demo_account_scope_customer_user_id'),
      ('public.application_garden', 'demo_account_scope_customer_user_id'),
      ('public.quote', 'demo_account_scope_customer_user_id'),
      ('public.quote_item', 'demo_account_scope_customer_user_id'),
      ('public.service_order', 'demo_account_scope_customer_user_id'),
      ('public.service_order_item', 'demo_account_scope_customer_user_id'),
      ('public.payment', 'demo_account_scope_customer_user_id'),
      ('public.payment_item', 'demo_account_scope_customer_user_id'),
      ('public.refund', 'demo_account_scope_customer_user_id'),
      ('public.garden_removal', 'demo_account_scope_customer_user_id')
    ) as a (table_name, trigger_name)
  where not exists (
    select 1 from pg_catalog.pg_trigger g
    where g.tgrelid = to_regclass(a.table_name) and g.tgname = a.trigger_name)

  order by 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.enqueue_garden_notification(public.notification_template, uuid, uuid, uuid, text, text, uuid)
  from public;
revoke all on function private.parcel_read_only(uuid) from public;
revoke all on function authz.parcel_read_only(uuid) from public, anon;
revoke all on function authz.parcel_open_removal_from(uuid) from public, anon;
grant execute on function authz.parcel_read_only(uuid) to authenticated, service_role;
grant execute on function authz.parcel_open_removal_from(uuid) to authenticated, service_role;
revoke all on function private.removal_calc(uuid, uuid, uuid, uuid, date, boolean, public.garden_removal_reason) from public;
revoke all on function private.removal_calculation(uuid, date) from public;
revoke all on function private.open_removal_refunds(uuid) from public;
revoke all on function private.removal_access_scope(uuid) from public;
revoke all on function private.terminate_emptied_order(uuid, text) from public;
revoke all on function private.close_base_addons(public.service_order, uuid, text) from public;
revoke all on function private.complete_garden_removal(uuid, uuid, text) from public;
revoke all on function private.garden_removal_housekeeping() from public;
revoke all on function private.removal_target(uuid, uuid, uuid) from public;
revoke all on function private.customer_removal_plan(uuid, uuid, uuid, boolean, boolean) from public;
revoke all on function private.removal_for_ops(uuid) from public;
revoke all on function private.check_access_days(integer, integer, public.garden_removal_reason, text) from public;
revoke all on function private.removal_last_effective(uuid, uuid) from public;

revoke all on function public.customer_garden_removal_preview(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.customer_request_garden_removal(uuid, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.customer_cancel_garden_removal(uuid) from public, anon, authenticated;
revoke all on function public.ops_garden_removals(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.ops_garden_removal_preview(uuid, date) from public, anon, authenticated;
revoke all on function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.ops_schedule_garden_removal(uuid, date, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.ops_cancel_garden_removal(uuid, text) from public, anon, authenticated;
revoke all on function public.ops_complete_garden_removal(uuid) from public, anon, authenticated;
revoke all on function public.ops_billing_summary(uuid) from public, anon, authenticated;

grant execute on function public.customer_garden_removal_preview(uuid, boolean, boolean) to authenticated;
grant execute on function public.customer_request_garden_removal(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.customer_cancel_garden_removal(uuid) to authenticated;
grant execute on function public.ops_garden_removals(uuid, text, integer) to authenticated;
grant execute on function public.ops_garden_removal_preview(uuid, date) to authenticated;
grant execute on function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean) to authenticated;
grant execute on function public.ops_schedule_garden_removal(uuid, date, text, integer, boolean) to authenticated;
grant execute on function public.ops_cancel_garden_removal(uuid, text) to authenticated;
grant execute on function public.ops_complete_garden_removal(uuid) to authenticated;
grant execute on function public.ops_billing_summary(uuid) to authenticated;
