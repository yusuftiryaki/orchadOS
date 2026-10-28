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
