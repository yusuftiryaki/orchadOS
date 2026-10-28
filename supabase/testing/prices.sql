-- Round test prices for the pgTAP files that check order, payment and removal
-- mechanics rather than the price list: local and CI databases only, like the
-- rest of this folder (see purge.sql and README.md).
--
-- The seed carries the launch price list (docs/fiyatlandirma.md), which is
-- revised twice a year. testing.use_round_prices() publishes, inside the
-- caller's transaction, a newer list of the seed org valid from the seed
-- list's day with round prices and no inventory fee: standart 12 500 a visit
-- and dönüm, minimum 500 000 (20 dönüm: 1 200 000 kuruş with VAT), temel
-- 13 000 / 450 000, any other active package 12 000 / 600 000; VAT 20 %. The
-- pgTAP file rolls it back with the rest. Returns the list's version.

create schema if not exists testing;
revoke all on schema testing from public;

create or replace function testing.use_round_prices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org constant uuid := 'b0000000-0000-4000-8000-000000000001';
  v_list uuid := gen_random_uuid();
  v_version integer;
begin
  select coalesce(max(version), 0) + 1 into v_version from public.price_list where org_id = v_org;
  insert into public.price_list (id, org_id, status, valid_from, vat_rate_bp, note)
  values (v_list, v_org, 'draft', '2026-10-01', 2000, 'Test: round prices');
  insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus,
    inventory_fee_kurus)
  select v_org, v_list, p.id,
         case p.code when 'standart' then 12500 when 'temel' then 13000 else 12000 end,
         case p.code when 'standart' then 500000 when 'temel' then 450000 else 600000 end,
         0
  from public.service_package p
  where p.org_id = v_org and p.active;
  update public.price_list set status = 'published', version = v_version, published_at = now()
  where id = v_list;
  return v_version;
end;
$$;

revoke all on function testing.use_round_prices() from public;

-- Orders before the payment plan (installments-v1) have one 'single'
-- installment of their total (the backfill in
-- 20261104100950_visit_installments.sql). The pgTAP files that check the
-- mechanics of a fully paid order (removal refunds, add-ons, withdrawal) turn
-- a new order without payments into such an order inside their transaction:
-- its plan is replaced by one single installment due today, a line share per
-- order line. Returns the installment id; null (and no change) for an order
-- with payments or without a total.
create or replace function testing.use_single_installment(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  v_id uuid;
begin
  select * into o from public.service_order where id = p_order_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Already paid into (or nothing to pay): left as it is.
  if o.total_kurus = 0 or exists (select 1 from public.payment p where p.order_id = o.id) then
    return null;
  end if;
  set local session_replication_role = replica;
  delete from public.order_installment_item where order_id = o.id;
  delete from public.order_installment where order_id = o.id;
  set local session_replication_role = origin;
  insert into public.order_installment (org_id, order_id, customer_user_id, seq, kind, amount_kurus, vat_kurus, due_on)
  select o.org_id, o.id, o.customer_user_id, 1, 'single', o.total_kurus, q.vat_kurus,
         (now() at time zone 'Europe/Istanbul')::date
  from public.quote q where q.id = o.quote_id
  returning id into v_id;
  insert into public.order_installment_item (org_id, installment_id, order_id, customer_user_id, order_item_id,
    amount_kurus, vat_kurus)
  select o.org_id, v_id, o.id, o.customer_user_id, oi.id, oi.amount_kurus, qi.line_vat_kurus
  from public.service_order_item oi join public.quote_item qi on qi.id = oi.quote_item_id
  where oi.order_id = o.id and oi.amount_kurus > 0;
  return v_id;
end;
$$;

revoke all on function testing.use_single_installment(uuid) from public;
