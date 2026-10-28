-- Legal follow-ups, wave 1 / 6: early performance and withdrawal
-- (docs/hukuk/kararlar.md H10, H11, H13, T03; docs/bahce-yonetimi.md §7, §9).
--
-- 1. private.has_early_performance(order): the order's early_performance
--    consent (quote acceptance box, 20261103100400).
-- 2. Planning ban: API users plan no inventory or periodic visit inside the
--    withdrawal period of an order without that consent, nor on a parcel
--    whose only line is in an order awaiting payment (withdrawal_period_open).
--    Status changes are never refused (the field app syncs them).
-- 3. removal-v1 deducts the inventory share and the done visits of a
--    withdrawal only when the order has the consent; otherwise the line is
--    refunded in full (stored calculations are not rewritten).
-- 4. garden_removal.notice_channel / notice_received_on; a portal withdrawal
--    works while garden changes are off, supersedes an open non-withdrawal
--    removal of the garden and queues withdrawal_received;
--    ops_record_withdrawal records one received by e-mail, KEP or post by the
--    day it arrived.

-- ---------------------------------------------------------------------------
-- 1. Consent
-- ---------------------------------------------------------------------------

create function private.has_early_performance(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.consent_record c
    where c.order_id = p_order_id and c.kind = 'early_performance' and c.granted);
$$;
comment on function private.has_early_performance(uuid) is
  'T03: the order was accepted with the early-performance box ticked (service may start inside the withdrawal period).';

-- ---------------------------------------------------------------------------
-- 2. Planning ban
-- ---------------------------------------------------------------------------

-- An inventory or periodic visit of the parcel on the day would fall inside
-- an open withdrawal period: the activated order line serving the parcel that
-- day belongs to an order still inside its withdrawal period
-- (private.withdrawal_until, inclusive) without early_performance; or no
-- activated line serves the day and the parcel is on an order awaiting
-- payment (service before the contract is paid). Other orders of the parcel
-- are ignored: a paid renewal starting later never blocks the running order.
create function private.withdrawal_blocks_visit(p_parcel_id uuid, p_day date)
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
  return exists (
    select 1 from public.service_order x
    where x.status = 'awaiting_payment' and x.activated_at is null
      and p_parcel_id = any (private.order_line_parcels(x.id)));
end;
$$;
comment on function private.withdrawal_blocks_visit(uuid, date) is
  'T03: an inventory or periodic visit of the parcel on the day is inside an open withdrawal period (no early_performance) or before payment.';

create function authz.withdrawal_blocks_visit(p_parcel_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.withdrawal_blocks_visit(p_parcel_id, p_day);
$$;
comment on function authz.withdrawal_blocks_visit(uuid, date) is 'private.withdrawal_blocks_visit for guards running as the caller.';

-- Like private.guard_removal_visit: only API users (security definer paths
-- are not); inserts of planned inventory and periodic visits, and updates
-- that set or move the day of such a visit while it is planned. A status
-- change is never refused: the field app moves visits out of planned with
-- PostgREST updates and must not be stuck. The day is planned_date, or the
-- Istanbul today when none is set.
create function private.guard_withdrawal_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.kind not in ('inventory', 'periodic_scan') or new.status <> 'planned' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.planned_date is not distinct from old.planned_date or old.status <> 'planned') then
    return new;
  end if;
  if authz.withdrawal_blocks_visit(new.parcel_id,
       coalesce(new.planned_date, (now() at time zone 'Europe/Istanbul')::date)) then
    raise exception 'withdrawal_period_open' using errcode = 'P0001',
      hint = 'The order has no early-performance consent: plan inventory and visits after its withdrawal period.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_withdrawal_visit() from public;

create trigger session_guard_withdrawal before insert or update of planned_date on public.session
for each row execute function private.guard_withdrawal_visit();

-- ---------------------------------------------------------------------------
-- 3. Refund calculation
-- ---------------------------------------------------------------------------

-- As in 20261102120500_garden_integration_fixes.sql, except that the
-- withdrawal mode deducts the inventory share and the done visits only when
-- the order has an early_performance consent (contract Md. 8B/4); without it
-- the whole line amount is refunded. Each line reports early_performance.
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
begin
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
    order by o.service_start, oi.line_no, oi.id
  loop
    v_removed := greatest(p_effective_on, l.service_start);
    select * into bv from private.billed_visits(p_parcel_id, l.service_start,
      greatest(v_removed - 1, least(private.istanbul_today(), l.service_end)));
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
-- ---------------------------------------------------------------------------
-- 4. Withdrawal notices
-- ---------------------------------------------------------------------------

alter table public.garden_removal
  add column notice_channel text check (notice_channel in ('portal', 'email', 'kep', 'post')),
  add column notice_received_on date;
comment on column public.garden_removal.notice_channel is
  'Withdrawal only: how the notice arrived (portal, email, kep, post; H11 (c)).';
comment on column public.garden_removal.notice_received_on is
  'Withdrawal only: the Istanbul day the notice arrived; the withdrawal period is judged by it.';

-- Existing withdrawals came through the portal on the day they were asked.
-- The guard freezes final rows, so it is off for this one update.
alter table public.garden_removal disable trigger garden_removal_guard;
update public.garden_removal
set notice_channel = 'portal', notice_received_on = (requested_at at time zone 'Europe/Istanbul')::date
where withdrawal and notice_channel is null;
alter table public.garden_removal enable trigger garden_removal_guard;

alter table public.garden_removal
  add constraint garden_removal_notice_only_withdrawal
    check (withdrawal or (notice_channel is null and notice_received_on is null)),
  add constraint garden_removal_withdrawal_has_channel
    check (not withdrawal or notice_channel is not null),
  add constraint garden_removal_withdrawal_notice_day
    check (notice_channel is null or notice_channel = 'portal' or notice_received_on is not null);

-- As in 20261102120100_garden_membership_schema.sql, plus the notice columns
-- among the identity columns.
create or replace function private.garden_removal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE on public.garden_removal is not allowed' using errcode = 'P0001';
  end if;
  if private.only_unlinks_users(to_jsonb(old), to_jsonb(new), array['requested_by', 'decided_by']) then
    return new;
  end if;
  if (new.id, new.org_id, new.customer_user_id, new.number, new.parcel_id, new.order_id, new.order_item_id,
      new.garden_name, new.initiated_by, new.reason, new.at_period_end, new.withdrawal,
      new.requested_effective_on, new.requested_at, new.notice_channel, new.notice_received_on)
     is distinct from
     (old.id, old.org_id, old.customer_user_id, old.number, old.parcel_id, old.order_id, old.order_item_id,
      old.garden_name, old.initiated_by, old.reason, old.at_period_end, old.withdrawal,
      old.requested_effective_on, old.requested_at, old.notice_channel, old.notice_received_on) then
    raise exception 'garden_removal_frozen' using errcode = 'P0001', hint = 'The identity of a removal never changes.';
  end if;
  if old.status in ('completed', 'cancelled')
     and (to_jsonb(new) - array['access_notice_sent_at', 'access_revoked_at', 'updated_at'])
         is distinct from (to_jsonb(old) - array['access_notice_sent_at', 'access_revoked_at', 'updated_at']) then
    raise exception 'removal_not_open' using errcode = 'P0001',
      hint = 'A final removal only records the access notice and the revocation.';
  end if;
  return new;
end;
$$;

grant select (notice_channel, notice_received_on) on public.garden_removal to authenticated;

-- A withdrawal supersedes the open removal of the garden that is not one
-- (the customer's "in 30 days" or "at the period end", or one ops opened):
-- cancelled by the system in the caller's transaction, audited. The caller
-- holds the parcel lock. Returns the cancelled removal's id or null.
create function private.supersede_open_removal(p_parcel_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.garden_removal;
begin
  select * into r from public.garden_removal x
  where x.parcel_id = p_parcel_id and x.customer_user_id = p_user_id and x.status in ('requested', 'scheduled')
    and not x.withdrawal
  for update;
  if not found then
    return null;
  end if;
  update public.garden_removal
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', blocked_reason = null
  where id = r.id and status = r.status;
  perform private.audit(r.org_id, null, 'system', 'garden_removal.cancelled', 'garden_removal', r.id,
    jsonb_build_object('number', r.number, 'from', r.status, 'reason', 'superseded_by_withdrawal'));
  return r.id;
end;
$$;

-- As in 20261102120300_garden_removals.sql, except that a withdrawal is held
-- back only by an open withdrawal of the garden: another open removal is
-- superseded by it (private.supersede_open_removal).
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

-- As in 20261102120300_garden_removals.sql, except: a withdrawal inside the
-- withdrawal period passes while garden changes are off (H10; every other
-- choice stays gated), supersedes an open non-withdrawal removal of the
-- garden, records notice_channel 'portal' with today, and queues
-- withdrawal_received (C-…). Errors as before.
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
    select * into t from private.removal_target(v_org, v_user, p_parcel_id);
    if not v_withdrawal or t.withdrawal_until is null or private.istanbul_today() > t.withdrawal_until then
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

-- Ops records withdrawals the owner sent by e-mail, KEP or post (H11 (c)):
-- one removal per order line (initiated_by customer: the declaration is the
-- owner's; requested_by the ops user), valid when notice_received_on is not
-- in the future and not after the order's last withdrawal day; effective at
-- once (completed in the same transaction unless a pending order blocks it);
-- refund as removal-v1 (point 3); an open non-withdrawal removal of the
-- garden is superseded; withdrawal_received is queued. Works while garden
-- changes are off. Returns the removal ids in the order of the lines.
-- Errors: not_found, forbidden, invalid_input (order_item_ids, channel,
-- notice_received_on, note), not_in_service, withdrawal_expired,
-- garden_removal_open, parcel_order_pending.
create function public.ops_record_withdrawal(
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

    s := private.billing_setting(oi.org_id);
    v_number := private.next_document_number(oi.org_id, 'C');
    begin
      insert into public.garden_removal (
        org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
        reason, ops_note, at_period_end, withdrawal, requested_effective_on, access_days, requested_by,
        notice_channel, notice_received_on
      )
      select oi.org_id, oi.customer_user_id, v_number, p.id, oi.order_id, oi.id, p.name, 'requested', 'customer',
             'other', v_note, false, true, v_today, s.removal_access_days, v_actor, p_channel, p_notice_received_on
      from public.parcel p where p.id = oi.parcel_id
      returning id into v_id;
    exception when unique_violation then
      raise exception 'garden_removal_open' using errcode = 'P0001';
    end;
    perform private.audit(oi.org_id, v_actor, 'ops', 'garden_removal.requested', 'garden_removal', v_id,
      jsonb_build_object('number', v_number, 'withdrawal', true, 'at_period_end', false,
        'access_days', s.removal_access_days, 'effective_on', v_today, 'notice_channel', p_channel,
        'notice_received_on', p_notice_received_on));
    perform private.enqueue_garden_notification('withdrawal_received', oi.org_id, oi.customer_user_id, v_id,
      v_number, '/portal/parsel/' || oi.parcel_id, oi.parcel_id);
    perform private.complete_garden_removal(v_id, v_actor, 'ops');
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;
comment on function public.ops_record_withdrawal(uuid[], date, text, text) is
  'Ops: records withdrawals received by e-mail, KEP or post by the day they arrived; effective at once, refund per removal-v1, withdrawal_received queued.';

revoke all on function private.has_early_performance(uuid) from public;
revoke all on function private.withdrawal_blocks_visit(uuid, date) from public;
revoke all on function authz.withdrawal_blocks_visit(uuid, date) from public, anon;
grant execute on function authz.withdrawal_blocks_visit(uuid, date) to authenticated, service_role;
revoke all on function private.supersede_open_removal(uuid, uuid) from public;
revoke all on function public.ops_record_withdrawal(uuid[], date, text, text) from public, anon, authenticated;
grant execute on function public.ops_record_withdrawal(uuid[], date, text, text) to authenticated;
