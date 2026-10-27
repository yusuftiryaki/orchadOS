-- IP12-A2 / 7: order activation (docs/musteri-yonetimi.md §4.8, §5.3, §6.9).
--
-- private.activate_order() runs inside payment_finalize,
-- ops_record_manual_payment, ops_resolve_payment_review and the acceptance of
-- a quote with a total of 0. In one transaction: a registered parcel per
-- application garden (private.create_customer_parcel: detail, rough boundary
-- as v1 owner_declared, owner access), owner access on the parcels of a
-- parcel or renewal quote, the order lines' parcels, a one-year service
-- period. Idempotent: an order that is not awaiting payment, or not paid in
-- full, is left as it is. The first planned inventory visit then moves the
-- parcel to inventory_planned (existing trigger).

-- The parcel of an application garden: the logic of register_parcel and
-- add_owner_declared_boundary (20261021220000_operations_screens.sql), which
-- stay unchanged, without their caller checks (no ops caller here). The
-- garden keeps the parcel id; a garden that already has one returns it.
create function private.create_customer_parcel(p_garden_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.application_garden;
  d private.application_garden_detail;
  v_id uuid;
begin
  select * into g from public.application_garden where id = p_garden_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if g.parcel_id is not null then
    return g.parcel_id;
  end if;

  insert into public.parcel (
    org_id, name, province, district, village, estimated_area_m2, irrigation, estimated_tree_count, position,
    position_uncertainty_m
  )
  values (
    g.org_id, g.name, g.province, g.district, g.village, coalesce(g.verified_area_m2, g.declared_area_m2),
    g.irrigation, g.estimated_tree_count, g.position, g.position_uncertainty_m
  )
  returning id into v_id;

  select * into d from private.application_garden_detail x where x.application_garden_id = g.id;
  if found then
    insert into private.parcel_detail (
      parcel_id, org_id, deed_block, deed_parcel, is_shared_deed, used_portion_note, authorization_basis,
      entry_permission_at, access_note, site_contact_name, site_contact_phone
    )
    values (
      v_id, g.org_id, d.deed_block, d.deed_parcel, d.is_shared_deed, d.used_portion_note, d.authorization_basis,
      d.entry_permission_at, d.access_note, d.site_contact_name, d.site_contact_phone
    );
  end if;

  -- The rough boundary (validated when saved or verified) as version 1.
  if g.boundary is not null then
    perform pg_advisory_xact_lock(hashtextextended('boundary:' || v_id::text, 0));
    insert into public.boundary (org_id, parcel_id, version, geom, source)
    values (g.org_id, v_id, 1, g.boundary, 'owner_declared');
  end if;

  insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
  values (g.org_id, v_id, g.customer_user_id, 'owner', null);

  update public.application_garden set parcel_id = v_id where id = g.id;
  return v_id;
end;
$$;
comment on function private.create_customer_parcel(uuid) is
  'The registered parcel of an application garden (detail, v1 owner_declared boundary, owner access).';

-- Returns true when the order became active now.
create function private.activate_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  q public.quote;
  v_item record;
  v_parcel uuid;
  v_start date;
begin
  select * into o from public.service_order where id = p_order_id for update;
  if not found or o.status <> 'awaiting_payment' or o.paid_kurus - o.refunded_kurus < o.total_kurus then
    return false;
  end if;
  select * into q from public.quote where id = o.quote_id;

  for v_item in
    select oi.id, qi.application_garden_id, qi.parcel_id
    from public.service_order_item oi
    join public.quote_item qi on qi.id = oi.quote_item_id
    where oi.order_id = o.id
    order by oi.line_no
  loop
    if v_item.application_garden_id is not null then
      v_parcel := private.create_customer_parcel(v_item.application_garden_id);
    else
      v_parcel := v_item.parcel_id;
      insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
      select o.org_id, v_parcel, o.customer_user_id, 'owner', null
      where not exists (
        select 1 from public.parcel_access pa where pa.parcel_id = v_parcel and pa.user_id = o.customer_user_id
      );
    end if;
    update public.service_order_item set parcel_id = v_parcel where id = v_item.id and parcel_id is null;
  end loop;

  v_start := coalesce(q.proposed_service_start, private.istanbul_today());
  update public.service_order
  set status = 'active', activated_at = now(), service_start = v_start,
      service_end = (v_start + interval '1 year' - interval '1 day')::date
  where id = o.id and status = 'awaiting_payment';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  perform private.audit(o.org_id, null, 'system', 'order.activated', 'order', o.id,
    jsonb_build_object('number', o.number, 'service_start', v_start,
      'lines', (select count(*) from public.service_order_item oi where oi.order_id = o.id)));
  return true;
end;
$$;
comment on function private.activate_order(uuid) is
  'Activates an order paid in full: parcels and owner access, order line parcels, a one-year service period. Idempotent.';

revoke all on function private.create_customer_parcel(uuid) from public;
revoke all on function private.activate_order(uuid) from public;
