-- IP14 integrated review fixes (docs/gorevler/ip14-entegrasyon-duzeltme.md),
-- fix-forward over 20261102120200–20261102120400 (docs/bahce-yonetimi.md):
--
-- 1. removal-v1 counts a failed refund as already refunded only while it can
--    still settle: a failed refund marked retryable = false (a definitive
--    decline, or ops_resolve_refund(false)) can never be claimed again, so it
--    no longer cuts the removal's refund.
-- 3. When a base order ends, an add-on awaiting payment that holds money is
--    cancelled too and its succeeded payments get order_closed refunds (as
--    activate_order does for addon_base_closed); only a live card attempt is
--    left to reconciliation.
-- 4, 7. my_gardens / ops_customer_gardens return removal_initiated_by, so the
--    portal offers the undo only on a removal the customer asked for.
-- 5. The end of access keeps every access row when another customer has a
--    line covering the parcel today or later (an active order not started
--    yet, or one awaiting payment), and never removes the row of a user
--    whose own line covers it.
-- Switch: while garden_changes_enabled is off, customer_addon_preview and a
--    member's customer_submit_application that would become an add-on raise
--    garden_changes_closed (not only the portal).

-- ---------------------------------------------------------------------------
-- 1. Refund calculation: dead failed refunds are not refunds
-- ---------------------------------------------------------------------------

-- Refund calculation removal-v1 (§7.1–§7.2). As in
-- 20261102120400_garden_review_fixes.sql, except that a failed refund counts
-- as refunded only while it can still be retried or settled (retryable is
-- not false, the rule of payment_refund_claim).
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
      when 'withdrawal' then l.amount_kurus - case when bv.inventory_done then v_share else 0 end - v_used * v_fee
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
-- ---------------------------------------------------------------------------
-- 3. An ended base closes its add-ons, money held or not
-- ---------------------------------------------------------------------------

-- Closes what an ended base order leaves open: add-ons awaiting payment are
-- cancelled (base_terminated); those holding money get an order_closed
-- refund of each succeeded payment, as activate_order does for
-- addon_base_closed. An add-on with a live card attempt is left to
-- reconciliation (payment_finalize activates nothing on a closed base: the
-- activation refuses and refunds it). Issued add-on quotes are cancelled.
-- Returns the number of orders cancelled.
create or replace function private.close_base_addons(b public.service_order, p_actor uuid, p_role text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.service_order;
  v record;
  v_payment record;
  v_refunds integer;
  v_count integer := 0;
begin
  for x in
    select * from public.service_order o
    where o.addon_of_order_id = b.id and o.status = 'awaiting_payment'
    order by o.id
    for update
  loop
    continue when private.live_payment_attempt(x.id);
    if x.paid_kurus <= x.refunded_kurus then
      perform private.cancel_order(x, null, 'system', 'base_terminated', null);
    else
      update public.service_order set status = 'cancelled', cancelled_at = now(), cancel_reason = 'base_terminated'
      where id = x.id and status = 'awaiting_payment';
      if not found then
        raise exception 'state_changed' using errcode = 'P0001';
      end if;
      v_refunds := 0;
      for v_payment in
        select p.id, coalesce(p.provider_amount_kurus, p.amount_kurus) as amount
        from public.payment p where p.order_id = x.id and p.status = 'succeeded'
        order by p.id
        for update
      loop
        v_refunds := v_refunds + coalesce(cardinality(
          private.open_system_refund(v_payment.id, v_payment.amount, 'order_closed')), 0);
      end loop;
      perform private.audit(x.org_id, null, 'system', 'order.cancelled', 'order', x.id,
        jsonb_build_object('number', x.number, 'reason', 'base_terminated', 'refunds', v_refunds,
          'addon_of_order_id', b.id));
    end if;
    v_count := v_count + 1;
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
comment on function private.close_base_addons(public.service_order, uuid, text) is
  'Cancels the add-ons awaiting payment of an ended base (refunding money held; a live card attempt is left) and its issued add-on quotes.';

-- ---------------------------------------------------------------------------
-- 5. End of access: a paying owner keeps access
-- ---------------------------------------------------------------------------

-- Access rows of a removal's parcel with their category and whether the end
-- of access removes them (§5.4): the customer's own row; viewers the
-- customer invited (approved invitation or granted_by); other viewers when
-- no other owner stays; everyone with revoke_all_access unless another
-- customer's line covers the parcel today or later (active, even if not
-- started yet, or awaiting payment). The row of another user whose own line
-- covers the parcel is never removed.
create or replace function private.removal_access_scope(p_removal_id uuid)
returns table (access_id uuid, user_id uuid, category text, removed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select x.* from public.garden_removal x where x.id = p_removal_id
  ),
  cover as (
    select distinct c.customer_user_id
    from r, private.coverage_lines(r.parcel_id) c
    where c.customer_user_id <> r.customer_user_id
      and (c.order_status = 'awaiting_payment' or c.to_day >= private.istanbul_today())
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
           r.revoke_all_access and not exists (select 1 from cover) as revoke_all,
           pa.user_id in (select cover.customer_user_id from cover) as covered
    from public.parcel_access pa, r
    where pa.parcel_id = r.parcel_id
  )
  select a.id, a.user_id, a.category,
         not a.covered and (
           a.category in ('customer_owner', 'invited_viewer')
           or a.revoke_all
           or (a.category = 'other_viewer' and not exists (select 1 from a o where o.category = 'other_owner')))
  from a;
$$;
comment on function private.removal_access_scope(uuid) is
  'Access rows of a removal''s parcel, their category and whether the end of access removes them (§5.4).';

-- ---------------------------------------------------------------------------
-- 4, 7. Who opened the open removal (the portal's undo)
-- ---------------------------------------------------------------------------

drop function public.ops_customer_gardens(uuid, uuid);
drop function public.my_gardens();
drop function private.customer_gardens(uuid, uuid);

-- As in 20261102120200_garden_addons.sql, plus removal_initiated_by
-- (customer or ops): the customer withdraws only their own request.
-- One row per parcel of the customer (§9.6 my_gardens): the line serving
-- today, else the earliest paid future line, else the latest line closed by
-- a removal whose access is still open.
create function private.customer_gardens(p_org_id uuid, p_user_id uuid)
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
         (select private.withdrawal_until(o2) from public.service_order o2 where o2.id = k.order_id),
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

create function public.my_gardens()
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
  select g.* from private.customer_gardens(private.customer_org_id((select auth.uid())), (select auth.uid())) g
  where (select auth.uid()) is not null;
$$;
comment on function public.my_gardens() is
  'Customer: one row per garden (in service, upcoming, leaving or removed with access open) with visits and removal.';

create function public.ops_customer_gardens(p_org_id uuid, p_user_id uuid)
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
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops_customer(p_org_id, p_user_id);
  return query select * from private.customer_gardens(p_org_id, p_user_id);
end;
$$;
comment on function public.ops_customer_gardens(uuid, uuid) is 'Ops: the gardens of a customer (columns of my_gardens).';
revoke all on function private.customer_gardens(uuid, uuid) from public;
revoke all on function public.my_gardens() from public, anon, authenticated;
revoke all on function public.ops_customer_gardens(uuid, uuid) from public, anon, authenticated;
grant execute on function public.my_gardens() to authenticated;
grant execute on function public.ops_customer_gardens(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Switch: garden changes closed on the server too
-- ---------------------------------------------------------------------------

-- As in 20261102120400_garden_review_fixes.sql, plus garden_changes_closed
-- while the switch is off.
create or replace function public.customer_addon_preview(p_areas_m2 numeric[])
returns table (
  line_no integer,
  area_m2 numeric,
  billable_area_tenths integer,
  visits smallint,
  unit_price_kurus bigint,
  minimum_fee_kurus bigint,
  inventory_fee_kurus bigint,
  visit_amount_kurus bigint,
  line_base_kurus bigint,
  line_discount_kurus bigint,
  line_subtotal_kurus bigint,
  line_vat_kurus bigint,
  line_total_kurus bigint,
  price_list_id uuid,
  price_list_version integer,
  valid_from date,
  vat_rate_bp integer,
  base_order_id uuid,
  service_start date,
  service_end date,
  periodic_visits_per_year smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid := private.customer_org_id((select auth.uid()));
  b public.service_order;
  q public.quote;
  v_start date;
  v_visits smallint;
begin
  if v_user is null or v_org is null then
    raise exception 'not_customer' using errcode = 'P0001';
  end if;
  if not (private.billing_setting(v_org)).garden_changes_enabled then
    raise exception 'garden_changes_closed' using errcode = 'P0001';
  end if;
  b := private.addon_base_order(v_org, v_user);
  if b.id is null then
    if exists (
      select 1 from public.service_order o
      where o.org_id = v_org and o.customer_user_id = v_user and o.status = 'active'
        and o.addon_of_order_id is null and o.service_end >= private.istanbul_today()
    ) then
      raise exception 'addon_period_too_short' using errcode = 'P0001';
    end if;
    raise exception 'no_membership' using errcode = 'P0001';
  end if;
  if p_areas_m2 is null or cardinality(p_areas_m2) = 0 or cardinality(p_areas_m2) > 50 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'areas';
  end if;
  select * into q from public.quote x where x.id = b.quote_id;
  v_start := greatest(private.istanbul_today(), b.service_start);
  v_visits := private.addon_visits(q.periodic_visits_per_year, v_start, b.service_start, b.service_end);
  return query
  select l.*, b.id, v_start, b.service_end, q.periodic_visits_per_year
  from private.price_lines_v2(v_org, q.package_id, p_areas_m2, array_fill(true, array[cardinality(p_areas_m2)]),
    v_visits, 0, null, q.periodic_visits_per_year) l;
end;
$$;

-- As in 20261030100400_catalog_applications.sql, plus: a member's
-- application that would become an add-on (the membership takes add-ons) is
-- refused with garden_changes_closed while the switch is off (§2). Returns the
-- application number. Errors: not_found, application_not_draft,
-- application_incomplete (detail: package_id, gardens, authorization_basis),
-- garden_changes_closed.
create or replace function public.customer_submit_application(p_application_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_number text;
  v_gardens integer;
begin
  a := private.lock_own_application(p_application_id);
  if a.status <> 'draft' then
    raise exception 'application_not_draft' using errcode = 'P0001';
  end if;
  if a.package_id is null or not exists (
    select 1 from public.service_package p where p.id = a.package_id and p.active
  ) then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'package_id';
  end if;
  select count(*) into v_gardens from public.application_garden g where g.application_id = a.id;
  if v_gardens = 0 then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'gardens';
  end if;
  if exists (
    select 1 from public.application_garden g
    left join private.application_garden_detail d on d.application_garden_id = g.id
    where g.application_id = a.id and d.authorization_basis is null
  ) then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = 'authorization_basis';
  end if;
  if not (private.billing_setting(a.org_id)).garden_changes_enabled
     and (private.addon_base_order(a.org_id, a.customer_user_id)).id is not null then
    raise exception 'garden_changes_closed' using errcode = 'P0001';
  end if;

  v_number := private.next_document_number(a.org_id, 'B');
  update public.service_application
  set status = 'submitted', number = v_number, submitted_at = now()
  where id = a.id and status = 'draft';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(a.org_id, a.customer_user_id, 'customer', 'application.submitted', 'application', a.id,
    jsonb_build_object('number', v_number, 'gardens', v_gardens));
  return v_number;
end;
$$;
