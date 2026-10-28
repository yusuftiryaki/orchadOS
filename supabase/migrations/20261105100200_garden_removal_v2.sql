-- Legal follow-ups, wave 3 / 3: garden removal per H20 and H21
-- (docs/hukuk/kararlar.md; T05, T23; contract Md. 12/3, 12/4,
-- mesafeli-v4-taslak; docs/bahce-yonetimi.md §5, §7).
--
-- 1. garden_removal.timing: the customer's explicit choice, now required
--    (no default, contract 12/3 "varsayılan seçenek yoktur"): immediate
--    ("hemen": the day after the request), notice (30 days), period_end,
--    withdrawal. owner_consent_note: the owner's written consent of a removal
--    by agreement. Both frozen with the identity.
-- 2. Billed visits (12/3 "Kullanılmış sayılan ziyaret"): a visit deemed done
--    under 8A/3 (private.missed_visit outcome deemed_done) counts as used; a
--    captured visit whose report cannot be published (report_lost) does not,
--    nor does an inventory whose report was lost. private.visit_usage gives
--    the breakdown.
-- 3. removal-v2 (stored as calculation.formula; removal-v1 rows are never
--    rewritten, the guard of 20261102120100 freezes completed rows): refund =
--    line amount − inventory share (if done) − used visits × visit fee, the
--    fee rounded down to the kuruş, so the rounding remainder is refunded;
--    earlier refunds of the line (8A included) are deducted, never below zero.
--    private.removal_v2_gross is the formula alone (tests: contract examples).
-- 4. Customer request and preview take the timing (new signatures; the old
--    boolean ones are dropped), and the request may cancel the customer's
--    order awaiting payment that holds the parcel in the same transaction
--    (12/3 "Portal, aynı işlemde bekleyen siparişi iptal etme seçeneği
--    sunar"). The withdrawal path keeps working with garden changes off and
--    supersedes an open removal (T03).
-- 5. Ops removals only for just causes (H20 (c)): out_of_area, owner_breach,
--    no_authority, third_party_objection, staff_safety, transfer, duplicate,
--    service_discontinued, by_agreement (with the consent note). Notice at
--    least 30 days (or the period's natural end when sooner), none for
--    staff_safety, duplicate, no_authority, third_party_objection and
--    by_agreement; an earlier day for the other causes only with the owner's
--    recorded consent. All unused visits are refunded (removal-v2).
-- 6. Transfer (H22, T23): garden_transfer_reports ("raporlarınızı indirin")
--    when a transfer removal is scheduled.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.garden_removal
  add column timing text check (timing in ('immediate', 'notice', 'period_end', 'withdrawal')),
  add column owner_consent_note text check (char_length(owner_consent_note) between 1 and 2000);
comment on column public.garden_removal.timing is
  'The customer''s explicit timing (12/3): immediate, notice, period_end, withdrawal. Null on rows before T05 and on ops and system rows.';
comment on column public.garden_removal.owner_consent_note is
  'by_agreement (12/3): how the owner''s written consent was given (internal). Personal data possible.';

alter table public.garden_removal
  add constraint garden_removal_timing_choice_check
    check (timing is null or (initiated_by = 'customer' and (timing = 'withdrawal') = withdrawal
                              and (timing = 'period_end') = at_period_end)),
  add constraint garden_removal_consent_check
    check (reason::text <> 'by_agreement' or owner_consent_note is not null);
-- Ops removals of T05 onwards: just causes only (older rows keep theirs).
alter table public.garden_removal
  add constraint garden_removal_ops_reason_check
    check (initiated_by <> 'ops' or reason::text in ('out_of_area', 'owner_breach', 'no_authority',
      'third_party_objection', 'staff_safety', 'transfer', 'duplicate', 'service_discontinued', 'by_agreement'))
    not valid;

grant select (timing) on public.garden_removal to authenticated;

-- As in 20261103100500_early_performance_withdrawal.sql, plus timing and
-- owner_consent_note in the identity.
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
      new.requested_effective_on, new.requested_at, new.notice_channel, new.notice_received_on, new.timing,
      new.owner_consent_note)
     is distinct from
     (old.id, old.org_id, old.customer_user_id, old.number, old.parcel_id, old.order_id, old.order_item_id,
      old.garden_name, old.initiated_by, old.reason, old.at_period_end, old.withdrawal,
      old.requested_effective_on, old.requested_at, old.notice_channel, old.notice_received_on, old.timing,
      old.owner_consent_note) then
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

-- ---------------------------------------------------------------------------
-- 2. Billed visits
-- ---------------------------------------------------------------------------

-- Visits of a parcel between two days (12/3): distinct Istanbul days of
-- captured (or later) periodic scans that no extra_visit request targets and
-- whose report is not lost, plus the days of visits deemed done under 8A/3;
-- the excluded scans; deemed-done and lost counts; whether an inventory was
-- captured (and its report not lost).
create function private.visit_usage(p_parcel_id uuid, p_from date, p_to date)
returns table (used integer, excluded integer, deemed_done integer, report_lost integer, inventory_done boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select s.id, s.kind,
           coalesce((s.started_at at time zone 'Europe/Istanbul')::date, s.planned_date) as day,
           exists (
             select 1 from public.followup_request f
             where f.target_session_id = s.id and f.kind = 'extra_visit' and f.status in ('planned', 'done')
           ) as extra,
           exists (select 1 from private.missed_visit m where m.session_id = s.id and m.report_lost) as lost
    from public.session s
    where s.parcel_id = p_parcel_id and s.kind in ('periodic_scan', 'inventory')
      and s.status in ('captured', 'processed', 'in_review', 'published')
  ),
  d as (
    select distinct m.occurred_on as day from private.missed_visit m
    join public.session s on s.id = m.session_id
    where m.parcel_id = p_parcel_id and m.outcome = 'deemed_done' and s.kind = 'periodic_scan'
      and m.occurred_on between p_from and p_to
  )
  select
    (select count(*) from (
       select v.day from v
       where v.kind = 'periodic_scan' and not v.extra and not v.lost and v.day between p_from and p_to
       union
       select d.day from d) u)::integer,
    (select count(*) from v
     where v.kind = 'periodic_scan' and v.extra and v.day between p_from and p_to)::integer,
    (select count(*) from d)::integer,
    (select count(*) from v where v.kind = 'periodic_scan' and v.lost and v.day between p_from and p_to)::integer,
    exists (select 1 from v where v.kind = 'inventory' and not v.lost and v.day between p_from and p_to);
$$;
comment on function private.visit_usage(uuid, date, date) is
  'T05/T07: used visits of a parcel in a range (12/3: deemed-done visits count, lost reports do not), excluded rescans, counts.';

-- Same columns as before (20261102120200), the rule of visit_usage.
create or replace function private.billed_visits(p_parcel_id uuid, p_from date, p_to date)
returns table (used integer, excluded integer, inventory_done boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.used, u.excluded, u.inventory_done from private.visit_usage(p_parcel_id, p_from, p_to) u;
$$;

-- ---------------------------------------------------------------------------
-- 3. removal-v2
-- ---------------------------------------------------------------------------

-- The visit fee of a line (8A/2): (amount − inventory share) ÷ visits, rounded
-- down to the kuruş.
create function private.removal_visit_fee(p_amount bigint, p_share bigint, p_visits integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_visits, 0) > 0 then floor((p_amount - p_share)::numeric / p_visits)::bigint else 0 end;
$$;

-- removal-v2 before earlier refunds (12/3): amount − share (when the inventory
-- was done) − used × fee, never below zero.
create function private.removal_v2_gross(
  p_amount bigint,
  p_share bigint,
  p_visits integer,
  p_used integer,
  p_inventory_done boolean
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select greatest(0, p_amount - case when p_inventory_done then p_share else 0 end
                    - least(p_used, p_visits) * private.removal_visit_fee(p_amount, p_share, p_visits));
$$;
comment on function private.removal_v2_gross(bigint, bigint, integer, integer, boolean) is
  'removal-v2 (12/3): line amount − inventory share (if done) − used visits × visit fee (rounded down).';

-- As in 20261103100700_legal_review_fixes.sql, except: formula removal-v2
-- (the "remaining" method), visit_usage (deemed-done visits used, lost
-- reports not), and per line the deemed-done and lost counts.
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
    v_billed_to := case
      when v_mode = 'withdrawal' then least(p_effective_on, l.service_end)
      else greatest(v_removed - 1, least(private.istanbul_today(), l.service_end))
    end;
    select * into bv from private.visit_usage(p_parcel_id, l.service_start, v_billed_to);
    v_used := least(bv.used, l.visits);
    v_share := case when l.line_base_kurus > 0
                 then round(l.amount_kurus::numeric * l.inventory_fee_kurus / l.line_base_kurus) else 0 end;
    v_fee := private.removal_visit_fee(l.amount_kurus, v_share, l.visits);
    v_gross := case v_mode
      when 'withdrawal' then case
        when l.early_performance then private.removal_v2_gross(l.amount_kurus, v_share, l.visits, v_used, bv.inventory_done)
        else l.amount_kurus
      end
      when 'duplicate' then greatest(0, l.amount_kurus - v_used * v_fee)
      else private.removal_v2_gross(l.amount_kurus, v_share, l.visits, v_used, bv.inventory_done)
    end;

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
      'visits_excluded', bv.excluded, 'visits_deemed_done', bv.deemed_done, 'visits_report_lost', bv.report_lost,
      'visit_fee_kurus', v_fee, 'gross_kurus', v_gross,
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
    'formula', 'removal-v2',
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
comment on function private.removal_calc(uuid, uuid, uuid, uuid, date, boolean, public.garden_removal_reason) is
  'removal-v2 (12/3, H20, H21): per line amount − inventory share (if done) − used × fee − earlier refunds; withdrawal deductions only with early performance.';

-- ---------------------------------------------------------------------------
-- 4. Customer timing
-- ---------------------------------------------------------------------------

drop function public.customer_garden_removal_preview(uuid, boolean, boolean);
drop function public.customer_request_garden_removal(uuid, text, text, boolean, boolean);
drop function private.customer_removal_plan(uuid, uuid, uuid, boolean, boolean);

-- As in 20261103100700_legal_review_fixes.sql with the explicit timing:
-- immediate (the day after today), notice (removal_notice_days), period_end
-- (the day after the line's end), withdrawal (today); a paid order not
-- started yet leaves on its start; never after the day after the line's end.
create function private.customer_removal_plan(
  p_org_id uuid,
  p_user_id uuid,
  p_parcel_id uuid,
  p_timing text,
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
  v_withdrawal boolean := p_timing = 'withdrawal';
begin
  if not exists (
    select 1 from public.parcel_access pa join public.parcel p on p.id = pa.parcel_id
    where pa.parcel_id = p_parcel_id and pa.user_id = p_user_id and pa.role = 'owner' and p.org_id = p_org_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_timing is null or p_timing not in ('immediate', 'notice', 'period_end', 'withdrawal') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'timing';
  end if;
  select * into t from private.removal_target(p_org_id, p_user_id, p_parcel_id);
  if t.order_item_id is null then
    raise exception 'not_in_service' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.garden_removal r
    where r.parcel_id = p_parcel_id and r.customer_user_id = p_user_id and r.status in ('requested', 'scheduled')
      and (r.withdrawal or not v_withdrawal)
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
  if v_withdrawal then
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
    when v_withdrawal then v_today
    when t.future then t.service_start
    when p_timing = 'period_end' then t.service_end + 1
    when p_timing = 'immediate' then least(v_today + 1, t.service_end + 1)
    else least(v_today + (private.billing_setting(p_org_id)).removal_notice_days, t.service_end + 1)
  end;
end;
$$;
revoke all on function private.customer_removal_plan(uuid, uuid, uuid, text) from public;

-- The preview of one timing (§5.1). Errors as customer_removal_plan.
create function public.customer_garden_removal_preview(p_parcel_id uuid, p_timing text)
returns table (
  order_item_id uuid,
  timing text,
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
  select * into pl from private.customer_removal_plan(v_org, v_user, p_parcel_id, p_timing);
  v_calc := private.removal_calc(v_org, v_user, p_parcel_id, pl.order_item_id, pl.effective_on,
    p_timing = 'withdrawal', 'other');
  select x into v_line from jsonb_array_elements(v_calc -> 'lines') x
  where x ->> 'order_item_id' = pl.order_item_id::text;
  return query select pl.order_item_id, p_timing, pl.effective_on, p_timing = 'withdrawal', pl.withdrawal_until,
    pl.effective_on + (private.billing_setting(v_org)).removal_access_days,
    coalesce((v_line ->> 'visits_entitled')::smallint,
      (select qi.visits from public.service_order_item oi join public.quote_item qi on qi.id = oi.quote_item_id
       where oi.id = pl.order_item_id)),
    coalesce((v_line ->> 'visits_used')::integer, 0),
    (v_calc ->> 'refund_kurus')::bigint, jsonb_array_length(v_calc -> 'lines');
end;
$$;
comment on function public.customer_garden_removal_preview(uuid, text) is
  'Customer: date, access end and refund estimate (removal-v2) of one explicit timing (immediate, notice, period_end, withdrawal).';

-- As in 20261103100700_legal_review_fixes.sql, with the required timing and
-- p_cancel_order_id: the customer's order awaiting payment holding the
-- parcel, cancelled first in the same transaction (customer_cancel_order).
-- Errors as before, invalid_input (timing, cancel_order_id).
create function public.customer_request_garden_removal(
  p_parcel_id uuid,
  p_reason text,
  p_timing text,
  p_note text default null,
  p_cancel_order_id uuid default null
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
  v_withdrawal boolean := p_timing = 'withdrawal';
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
  if p_timing is null or p_timing not in ('immediate', 'notice', 'period_end', 'withdrawal') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'timing';
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
  if p_cancel_order_id is not null then
    if not exists (
      select 1 from public.service_order o
      where o.id = p_cancel_order_id and o.customer_user_id = v_user and o.org_id = v_org
        and o.status = 'awaiting_payment' and p_parcel_id = any (private.order_line_parcels(o.id))
    ) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'cancel_order_id';
    end if;
    perform public.customer_cancel_order(p_cancel_order_id);
  end if;
  perform private.lock_parcel_coverage(array[p_parcel_id]);
  select * into pl from private.customer_removal_plan(v_org, v_user, p_parcel_id, p_timing);
  if v_withdrawal then
    perform private.supersede_open_removal(p_parcel_id, v_user);
  end if;

  v_number := private.next_document_number(v_org, 'C');
  begin
    insert into public.garden_removal (
      org_id, customer_user_id, number, parcel_id, order_id, order_item_id, garden_name, status, initiated_by,
      reason, customer_note, at_period_end, withdrawal, requested_effective_on, access_days, requested_by,
      notice_channel, notice_received_on, timing
    )
    select v_org, v_user, v_number, p.id, pl.order_id, pl.order_item_id, p.name, 'requested', 'customer',
           p_reason::public.garden_removal_reason, v_note, p_timing = 'period_end',
           v_withdrawal, pl.effective_on, s.removal_access_days, v_user,
           case when v_withdrawal then 'portal' end, case when v_withdrawal then private.istanbul_today() end,
           p_timing
    from public.parcel p where p.id = p_parcel_id
    returning id into v_id;
  exception when unique_violation then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end;
  perform private.audit(v_org, v_user, 'customer', 'garden_removal.requested', 'garden_removal', v_id,
    jsonb_build_object('number', v_number, 'withdrawal', v_withdrawal, 'timing', p_timing,
      'at_period_end', p_timing = 'period_end', 'access_days', s.removal_access_days,
      'effective_on', pl.effective_on, 'cancelled_order_id', p_cancel_order_id));
  if v_withdrawal then
    perform private.enqueue_garden_notification('withdrawal_received', v_org, v_user, v_id, v_number,
      '/portal/parsel/' || p_parcel_id, p_parcel_id);
  end if;
  return v_id;
end;
$$;
comment on function public.customer_request_garden_removal(uuid, text, text, text, uuid) is
  'Customer: asks to remove a garden with an explicit timing (12/3: no default); may cancel the order awaiting payment holding it first; withdrawal works with garden changes off.';

revoke all on function public.customer_garden_removal_preview(uuid, text) from public, anon;
grant execute on function public.customer_garden_removal_preview(uuid, text) to authenticated;
revoke all on function public.customer_request_garden_removal(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.customer_request_garden_removal(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5, 6. Ops removals for just causes; transfer message
-- ---------------------------------------------------------------------------

-- Just causes of an ops removal (12/3) and those without a notice period.
create function private.ops_removal_reason(p_reason text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_reason in ('staff_safety', 'duplicate', 'no_authority', 'third_party_objection', 'by_agreement') then 'no_notice'
    when p_reason in ('out_of_area', 'owner_breach', 'transfer', 'service_discontinued') then 'notice'
  end;
$$;
comment on function private.ops_removal_reason(text) is
  'H20 (c): notice (30 days) or no_notice for the just causes of an ops removal; null for any other reason.';

drop function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean);

-- As in 20261102120300_garden_removals.sql, except: just causes only
-- (removal_reason_not_allowed), by_agreement needs p_owner_consent_note, the
-- day is at least 30 days ahead (or the day after the period's end when
-- sooner) unless the cause needs no notice or the owner agreed to an earlier
-- day (p_owner_consent_note; else removal_notice_too_short), and a transfer
-- queues garden_transfer_reports.
create function public.ops_request_garden_removal(
  p_order_item_id uuid,
  p_reason text,
  p_effective_on date,
  p_note text default null,
  p_access_days integer default null,
  p_revoke_all_access boolean default false,
  p_owner_consent_note text default null
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
  v_consent text := nullif(btrim(p_owner_consent_note), '');
  v_reason public.garden_removal_reason;
  v_access integer;
  v_last date;
  v_today date := private.istanbul_today();
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
  if private.ops_removal_reason(p_reason) is null then
    raise exception 'removal_reason_not_allowed' using errcode = 'P0001',
      hint = '12/3: the company removes a garden only for the listed just causes.';
  end if;
  v_reason := p_reason::public.garden_removal_reason;
  if length(v_note) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if (p_reason = 'by_agreement' and v_consent is null) or length(v_consent) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'owner_consent_note';
  end if;
  v_access := coalesce(p_access_days, s.removal_access_days);
  perform private.check_access_days(v_access, s.removal_access_days, v_reason, v_note);

  perform private.lock_parcel_coverage(array[oi.parcel_id]);
  select * into o from public.service_order x where x.id = oi.order_id;
  select * into oi from public.service_order_item x where x.id = oi.id;
  if oi.parcel_id is null or o.status <> 'active' or oi.removed_on is not null or o.service_end < v_today then
    raise exception 'not_in_service' using errcode = 'P0001';
  end if;
  v_last := private.removal_last_effective(oi.parcel_id, oi.customer_user_id);
  if p_effective_on is null or p_effective_on < v_today or p_effective_on > v_last then
    raise exception 'invalid_input' using errcode = '22023', detail = 'effective_on';
  end if;
  -- A shorter notice only by agreement with the owner (12/3: the date changes
  -- only by agreement), recorded like a removal by agreement.
  if private.ops_removal_reason(p_reason) = 'notice' and p_effective_on < least(v_today + 30, v_last)
     and v_consent is null then
    raise exception 'removal_notice_too_short' using errcode = 'P0001',
      hint = '12/3: at least 30 days notice (none for safety, duplicate, authority or objection, agreement).';
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
      requested_by, decided_by, scheduled_at, owner_consent_note
    )
    select oi.org_id, oi.customer_user_id, v_number, p.id, oi.order_id, oi.id, p.name, 'scheduled', 'ops',
           v_reason, v_note, p_effective_on, p_effective_on, v_access, p_effective_on + v_access,
           coalesce(p_revoke_all_access, false), v_actor, v_actor, now(), v_consent
    from public.parcel p where p.id = oi.parcel_id
    returning id into v_id;
  exception when unique_violation then
    raise exception 'garden_removal_open' using errcode = 'P0001';
  end;
  perform private.audit(oi.org_id, v_actor, 'ops', 'garden_removal.requested', 'garden_removal', v_id,
    jsonb_build_object('number', v_number, 'reason', v_reason, 'withdrawal', false, 'at_period_end', false,
      'access_days', v_access, 'notice', private.ops_removal_reason(p_reason),
      'owner_consent', v_consent is not null));
  perform private.audit(oi.org_id, v_actor, 'ops', 'garden_removal.scheduled', 'garden_removal', v_id,
    jsonb_build_object('from_effective_on', null, 'to_effective_on', p_effective_on,
      'from_access_days', s.removal_access_days, 'to_access_days', v_access,
      'revoke_all_access', coalesce(p_revoke_all_access, false), 'change_id', null));
  perform private.enqueue_garden_notification('garden_removal_scheduled', oi.org_id, oi.customer_user_id, v_id,
    v_number, '/portal/parsel/' || oi.parcel_id, oi.parcel_id);
  if v_reason = 'transfer' then
    perform private.enqueue_garden_notification('garden_transfer_reports', oi.org_id, oi.customer_user_id, v_id,
      v_number, '/portal/parsel/' || oi.parcel_id, oi.parcel_id);
  end if;
  return v_id;
end;
$$;
comment on function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean, text) is
  'Ops: removes a garden for a just cause (12/3) with its notice rule; by_agreement records the owner''s consent; transfer sends garden_transfer_reports.';
revoke all on function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean, text) from public, anon;
grant execute on function public.ops_request_garden_removal(uuid, text, date, text, integer, boolean, text) to authenticated;

revoke all on function private.visit_usage(uuid, date, date) from public;
revoke all on function private.removal_visit_fee(bigint, bigint, integer) from public;
revoke all on function private.removal_v2_gross(bigint, bigint, integer, integer, boolean) from public;
revoke all on function private.ops_removal_reason(text) from public;
