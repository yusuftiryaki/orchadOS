-- Legal follow-ups, wave 3 / 7: the 8A reconciliation with the per-visit
-- payment plan (docs/hukuk/kararlar.md H35, T06, T28; contract Md. 8/6, 8A/6;
-- docs/musteri-yonetimi.md §5.6). 20261105100300 was written before the plan:
-- a visit whose visit installment was never paid (lapsed at window end,
-- cancelled when the order ended or by a removal) counted as missed and opened
-- a task to refund money that was never paid. T28: "Dönem sonu kontrolü (T06)
-- yalnızca ödenmiş ama yapılmamış ziyaretleri sayar." Such visits are taken
-- out of the shortfall and shown as visits_unpaid; visits ops let go ahead
-- unpaid stay counted (they are owed). Old single-payment orders have no
-- visit installments and are unchanged.

alter table private.visit_reconciliation add column visits_unpaid integer not null default 0;
comment on column private.visit_reconciliation.visits_unpaid is
  'Visits of the line whose visit installment was never paid (lapsed, or cancelled when the order ended or by a removal) and not allowed unpaid by ops: not missed visits (contract 8/6, T28).';

-- Visit installments of a line never paid and not allowed unpaid by ops,
-- through p_to: cancelled ones, and for a window check those whose window
-- ended by then (later ones are windows ahead). Old single-payment orders
-- have none.
create function private.unpaid_visits(p_order_item_id uuid, p_to date, p_window_check boolean)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.order_installment_item ii
  join public.order_installment i on i.id = ii.installment_id
  where ii.order_item_id = p_order_item_id and i.kind = 'visit' and ii.paid_kurus = 0
    and ii.amount_kurus > 0 and i.visit_override_at is null
    and (not p_window_check or i.status = 'cancelled' or i.window_end <= p_to);
$$;
revoke all on function private.unpaid_visits(uuid, date, boolean) from public;

-- As in 20261105100300_visit_reconciliation.sql, less the unpaid visits.
create or replace function private.reconcile_line(p_order_item_id uuid, p_scope_end date, p_trigger text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  u record;
  w jsonb;
  v_end date;
  v_share bigint;
  v_fee bigint;
  v_refunded integer;
  v_carried integer;
  v_ahead integer := 0;
  v_unpaid integer;
  v_shortfall integer;
  v_count integer;
begin
  select oi.id, oi.order_id, oi.parcel_id, oi.removed_on, oi.amount_kurus, o.org_id, o.customer_user_id,
         o.service_start, o.service_end, qi.visits, qi.inventory_fee_kurus, qi.line_base_kurus
  into l
  from public.service_order_item oi
  join public.service_order o on o.id = oi.order_id
  join public.quote_item qi on qi.id = oi.quote_item_id
  where oi.id = p_order_item_id;
  if not found or l.parcel_id is null or coalesce(l.visits, 0) = 0 or private.is_demo_org(l.org_id) then
    return 0;
  end if;
  v_end := least(p_scope_end, l.service_end, coalesce(l.removed_on - 1, l.service_end));
  if v_end < l.service_start then
    return 0;
  end if;
  select * into u from private.visit_usage(l.parcel_id, l.service_start, v_end);
  v_share := case when l.line_base_kurus > 0
               then round(l.amount_kurus::numeric * l.inventory_fee_kurus / l.line_base_kurus) else 0 end;
  v_fee := private.removal_visit_fee(l.amount_kurus, v_share, l.visits);
  select greatest(
    (select count(*) from private.missed_visit m
     where m.parcel_id = l.parcel_id and m.outcome = 'refunded'
       and m.occurred_on between l.service_start and l.service_end)::integer,
    (select case when v_fee > 0 then floor(coalesce(sum(r.amount_kurus), 0)::numeric / v_fee)::integer else 0 end
     from public.refund r
     left join public.payment_item pi on pi.id = r.payment_item_id
     where r.order_id = l.order_id and r.reason = 'missed_visit'
       and r.status in ('requested', 'processing', 'succeeded')
       and (pi.order_item_id = l.id or r.payment_item_id is null or pi.order_item_id is null)))
  into v_refunded;
  select count(*) into v_carried from private.missed_visit m
  where m.parcel_id = l.parcel_id and m.outcome = 'carried_over'
    and m.occurred_on between l.service_start and l.service_end;
  v_unpaid := private.unpaid_visits(l.id, v_end, p_trigger = 'window_end');
  if p_trigger = 'window_end' then
    v_ahead := jsonb_array_length(private.remaining_visit_windows(v_end + 1, l.service_end));
    v_shortfall := l.visits - least(u.used, l.visits) - v_refunded - v_carried - v_ahead - v_unpaid;
  else
    v_shortfall := l.visits - least(u.used, l.visits) - v_refunded - v_unpaid;
  end if;
  if v_shortfall <= 0 then
    return 0;
  end if;
  w := private.visit_window_of(p_scope_end);
  insert into private.visit_reconciliation (
    org_id, customer_user_id, order_id, order_item_id, parcel_id, trigger, scope_end, window_label,
    visits_entitled, visits_used, visits_refunded, visits_carried, windows_ahead, shortfall, visit_fee_kurus,
    detected_on, due_on, visits_unpaid
  )
  values (
    l.org_id, l.customer_user_id, l.order_id, l.id, l.parcel_id, p_trigger, v_end,
    case when p_trigger = 'window_end' then w ->> 'label' end,
    l.visits, least(u.used, l.visits), v_refunded, v_carried, v_ahead, v_shortfall, v_fee,
    private.istanbul_today(), v_end + 14, v_unpaid
  )
  on conflict (order_item_id, scope_end) do nothing;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.audit(l.org_id, null, 'system', 'visit_reconciliation.opened', 'visit_reconciliation', l.id,
      jsonb_build_object('trigger', p_trigger, 'scope_end', v_end, 'shortfall', v_shortfall,
        'unpaid', v_unpaid));
  end if;
  return v_count;
end;
$$;
comment on function private.reconcile_line(uuid, date, text) is
  'T06 (8A/6): checks a line through a window or period end and opens an ops task for the paid visits that fell short (unpaid visits are not counted, T28).';
