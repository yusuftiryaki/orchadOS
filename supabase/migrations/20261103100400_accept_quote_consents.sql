-- Legal follow-ups, wave 1 / 5: customer_accept_quote with the legal-text
-- registry, the production gate, the template hashes and the optional
-- early-performance consent (docs/hukuk/kararlar.md T21, T04, T03, H11 (a)).
--
-- p_consents takes, for distance_sales, pre_information and the optional
-- early_performance, either form (the old web keeps working during a deploy):
--   {"distance_sales": "mesafeli-v3-taslak", ...}
--   {"distance_sales": {"version": "...", "sha256": "<64 hex>", "display_sha256": "<64 hex>"}, ...}
-- The version must be the current registered one and a sent sha256 its
-- registered template hash, else legal_text_outdated (P0001, detail: kind);
-- display_sha256 is optional, format-checked and stored as given. The
-- consent rows carry the registered hash (text_sha256). early_performance is
-- never required (absent, null or false: no row); its version is the
-- distance_sales version shown next to the box.
-- Where the gate is active (allow_fake_payments off: pilot, production),
-- legal_texts_not_final (P0001, detail: the first reason of
-- private.legal_gate_reasons) refuses the acceptance.

-- One p_consents entry checked against the registry: (version, registered
-- sha256, display_sha256), or no row when absent and not required. Errors:
-- consent_required (missing or malformed, detail: kind), invalid_input
-- (detail: kind.display_sha256), legal_text_outdated (detail: kind).
create function private.accept_consent_entry(p_consents jsonb, p_kind text, p_required boolean)
returns table (version text, sha256 text, display_sha256 text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e jsonb;
  cur private.legal_text_version := private.legal_text_current(p_kind);
  v_version text;
  v_sha text;
  v_display text;
begin
  if p_consents is not null and jsonb_typeof(p_consents) = 'object' then
    e := p_consents -> p_kind;
  end if;
  if e is null or jsonb_typeof(e) = 'null' or (not p_required and e = 'false'::jsonb) then
    if p_required then
      raise exception 'consent_required' using errcode = '22023', detail = p_kind;
    end if;
    return;
  end if;
  if jsonb_typeof(e) = 'string' then
    v_version := e #>> '{}';
  elsif jsonb_typeof(e) = 'object' then
    if jsonb_typeof(e -> 'version') is distinct from 'string'
       or jsonb_typeof(e -> 'sha256') is distinct from 'string' then
      raise exception 'consent_required' using errcode = '22023', detail = p_kind;
    end if;
    v_version := e ->> 'version';
    v_sha := e ->> 'sha256';
    if v_sha !~ '^[0-9a-f]{64}$' then
      raise exception 'consent_required' using errcode = '22023', detail = p_kind;
    end if;
    if e ? 'display_sha256' and jsonb_typeof(e -> 'display_sha256') <> 'null' then
      v_display := e ->> 'display_sha256';
      if jsonb_typeof(e -> 'display_sha256') <> 'string' or v_display !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid_input' using errcode = '22023', detail = p_kind || '.display_sha256';
      end if;
    end if;
  else
    raise exception 'consent_required' using errcode = '22023', detail = p_kind;
  end if;
  if not private.text_version_ok(v_version) then
    raise exception 'consent_required' using errcode = '22023', detail = p_kind;
  end if;
  if cur.version is null or v_version <> cur.version or (v_sha is not null and v_sha <> cur.sha256) then
    raise exception 'legal_text_outdated' using errcode = 'P0001', detail = p_kind;
  end if;
  return query select v_version, cur.sha256, v_display;
end;
$$;
revoke all on function private.accept_consent_entry(jsonb, text, boolean) from public;

-- As in 20261102120200_garden_addons.sql, plus the entry checks and the gate
-- above, the hashes on the consent rows and the early_performance row.
create or replace function public.customer_accept_quote(p_quote_id uuid, p_consents jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quote;
  b public.service_order;
  v_user uuid := (select auth.uid());
  v_due_days integer;
  v_due timestamptz;
  v_order uuid;
  v_number text;
  v_parcels uuid[];
  v_from date;
  v_to date;
  v_lines integer;
  v_distance record;
  v_pre record;
  v_early record;
  v_reasons text[];
  v_kinds jsonb := jsonb_build_array('distance_sales', 'pre_information');
begin
  q := private.lock_own_quote(p_quote_id);
  if q.status <> 'issued' then
    raise exception 'quote_not_open' using errcode = 'P0001';
  end if;
  if q.valid_until < private.istanbul_today() then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;
  if not private.billing_profile_complete(q.org_id, v_user) then
    raise exception 'billing_profile_incomplete' using errcode = 'P0001';
  end if;
  if not private.kvkk_notice_granted(q.org_id, v_user) then
    raise exception 'consent_required' using errcode = '22023', detail = 'kvkk_notice';
  end if;
  select * into v_distance from private.accept_consent_entry(p_consents, 'distance_sales', true);
  select * into v_pre from private.accept_consent_entry(p_consents, 'pre_information', true);
  select * into v_early from private.accept_consent_entry(p_consents, 'early_performance', false);
  if private.legal_gate_active(q.org_id) then
    v_reasons := private.legal_gate_reasons(q.org_id, v_user);
    if cardinality(v_reasons) > 0 then
      raise exception 'legal_texts_not_final' using errcode = 'P0001', detail = v_reasons[1];
    end if;
  end if;

  v_parcels := private.quote_line_parcels(q.id);
  perform private.lock_customer_gardens(v_user);
  perform private.lock_parcel_coverage(v_parcels);
  select coalesce(s.payment_due_days, 14) into v_due_days
  from (select 1) one left join public.org_billing_setting s on s.org_id = q.org_id;
  v_due := now() + make_interval(days => v_due_days);
  if q.addon_of_order_id is not null then
    select * into b from public.service_order where id = q.addon_of_order_id for update;
    if b.status is distinct from 'active' or private.istanbul_today() > private.addon_last_day(b) then
      raise exception 'addon_base_closed' using errcode = 'P0001';
    end if;
    v_from := greatest(coalesce(q.proposed_service_start, private.istanbul_today()), private.istanbul_today());
    v_to := b.service_end;
    v_due := least(v_due, (private.addon_last_day(b) + 1)::timestamp at time zone 'Europe/Istanbul');
  else
    v_from := coalesce(q.proposed_service_start, private.istanbul_today());
    v_to := (v_from + interval '1 year' - interval '1 day')::date;
  end if;
  if exists (select 1 from unnest(v_parcels) x where private.parcel_in_service(x, v_from, v_to)) then
    raise exception 'parcel_in_service' using errcode = 'P0001', detail = 'parcel_ids';
  end if;
  select count(*) into v_lines from public.quote_item i where i.quote_id = q.id;
  if private.account_garden_count(q.org_id, v_user, v_from, v_to) + v_lines > 50 then
    raise exception 'account_garden_limit' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.garden_removal r
    where r.parcel_id = any (v_parcels) and r.customer_user_id = v_user
      and (r.status in ('requested', 'scheduled') or (r.status <> 'cancelled' and r.requested_at > q.issued_at))
  ) then
    raise exception 'garden_removal_open' using errcode = 'P0001', detail = 'parcel_ids';
  end if;

  update public.quote set status = 'accepted', decided_at = now(), decided_by = v_user
  where id = q.id and status = 'issued';
  if not found then
    raise exception 'state_changed' using errcode = 'P0001';
  end if;
  if q.application_id is not null then
    update public.service_application set status = 'accepted', decided_at = now(), decided_by = v_user
    where id = q.application_id and status = 'quoted';
    if not found then
      raise exception 'state_changed' using errcode = 'P0001';
    end if;
  end if;

  v_number := private.next_document_number(q.org_id, 'S');
  insert into public.service_order (org_id, customer_user_id, quote_id, number, total_kurus, payment_due_at,
    renewal_of_order_id, addon_of_order_id)
  values (q.org_id, v_user, q.id, v_number, q.total_kurus, v_due, q.renewal_of_order_id, q.addon_of_order_id)
  returning id into v_order;
  insert into public.service_order_item (org_id, order_id, customer_user_id, quote_item_id, line_no, garden_name,
    amount_kurus)
  select q.org_id, v_order, v_user, i.id, i.line_no, i.garden_name, i.line_total_kurus
  from public.quote_item i where i.quote_id = q.id order by i.line_no;

  insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, quote_id,
    order_id, text_sha256, display_sha256)
  values
    (q.org_id, v_user, v_user, 'distance_sales', true, v_distance.version, 'quote_acceptance', q.id, v_order,
     v_distance.sha256, v_distance.display_sha256),
    (q.org_id, v_user, v_user, 'pre_information', true, v_pre.version, 'quote_acceptance', q.id, v_order,
     v_pre.sha256, v_pre.display_sha256);
  if v_early.version is not null then
    insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source, quote_id,
      order_id, text_sha256, display_sha256)
    values (q.org_id, v_user, v_user, 'early_performance', true, v_early.version, 'quote_acceptance', q.id, v_order,
      v_early.sha256, v_early.display_sha256);
    v_kinds := v_kinds || jsonb_build_array('early_performance');
  end if;

  perform private.audit(q.org_id, v_user, 'customer', 'quote.accepted', 'quote', q.id,
    jsonb_build_object('number', q.number, 'order_id', v_order));
  perform private.audit(q.org_id, v_user, 'customer', 'order.created', 'order', v_order,
    jsonb_build_object('number', v_number, 'quote_id', q.id, 'total_kurus', q.total_kurus,
      'addon_of_order_id', q.addon_of_order_id));
  perform private.audit(q.org_id, v_user, 'customer', 'consent.granted', 'consent', v_user,
    jsonb_build_object('kinds', v_kinds, 'order_id', v_order));
  if q.total_kurus = 0 then
    perform private.activate_order(v_order);
  end if;
  return v_order;
end;
$$;
