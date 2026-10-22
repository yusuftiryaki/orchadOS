-- Tree present / missing check of the processing pipeline (MVP Module 4, step 5;
-- docs/metodoloji.md, Ek B and section 6).
--
-- 1. tree_visible: is a tree visible at the inventory position? Category yes /
--    no / unsure. Source algorithm (the pipeline's first, model-free signal,
--    method crop_greenness) or later a trunk detection model; the AI's own
--    answer stays in ai_assessment_detail.tree_visible. On an empty slot "yes"
--    means "yeni dikim olabilir" (possible new planting): a suggestion for the
--    expert. The class "Yok" is only ever given by the expert (methodology,
--    section 5); a "no" sends the tree to mandatory review in the expert panel
--    (apps/web/src/lib/expert/mandatory-review.ts).
-- 2. record_tree_presence(): ops (the pipeline's user) writes the measurements
--    of one run and their evidence (the crops) in one transaction; the same
--    run again adds nothing.

-- Same id rule as 20261021180000_metric_registry.sql.
insert into public.metric_definition (
  id, code, name, description, unit, value_type, categories, valid_seasons, card_visibility, subject_kinds
)
values (
  md5('orchados-seed:metric:tree_visible')::uuid, 'tree_visible', 'Ağaç görünüyor',
  'Is a tree visible at the inventory position: yes, no, unsure. Pipeline signal on the crops '
  '(crop_greenness; unsure out of the leafy months). On an empty slot, yes = possible new planting. '
  'Only the expert gives the class "absent".',
  null, 'category', '{yes,no,unsure}', '{winter,spring,summer,harvest}', 'hidden', '{tree,slot}'
)
on conflict do nothing;

-- p_payload:
--   {"method": text, "method_version": text, "params_hash": text,
--    "measured_at": timestamptz,
--    "items": [{"tree_id": uuid | "slot_id": uuid, "value": "yes" | "no" | "unsure",
--               "confidence": 0..1 (optional), "evidence_asset_ids": [uuid, ...]}, ...]}
-- A tree must be an active tree of the session's parcel; a slot one of its slots
-- without an active tree. Evidence must be the session's tree crops.
-- An item whose subject already has a tree_visible measurement of this session
-- with the same method, version and parameters is skipped (re-running).
-- Returns {"created": n, "existing": n}. All or nothing.
-- Errors: not_found (P0002), forbidden (42501: not ops of the org),
-- invalid_input (22023, detail names the item).
create function public.record_tree_presence(p_session_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_metric uuid := md5('orchados-seed:metric:tree_visible')::uuid;
  v_item jsonb;
  v_tree uuid;
  v_slot uuid;
  v_id uuid;
  v_method text := p_payload ->> 'method';
  v_version text := p_payload ->> 'method_version';
  v_hash text := p_payload ->> 'params_hash';
  v_at timestamptz;
  v_evidence uuid[];
  v_created integer := 0;
  v_existing integer := 0;
begin
  select * into s from public.session where id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if s.status = 'cancelled' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'cancelled session';
  end if;
  if p_payload is null or jsonb_typeof(p_payload -> 'items') <> 'array'
     or length(btrim(coalesce(v_method, ''))) = 0 or length(btrim(coalesce(v_version, ''))) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method, method_version and items are required';
  end if;
  begin
    v_at := coalesce((p_payload ->> 'measured_at')::timestamptz, now());
  exception when others then
    raise exception 'invalid_input' using errcode = '22023', detail = 'measured_at';
  end;

  perform pg_advisory_xact_lock(hashtextextended('record_tree_presence:' || s.id::text, 0));

  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    begin
      v_tree := (v_item ->> 'tree_id')::uuid;
      v_slot := (v_item ->> 'slot_id')::uuid;
      v_evidence := array(select jsonb_array_elements_text(coalesce(v_item -> 'evidence_asset_ids', '[]'))::uuid);
    exception when others then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s', v_item);
    end;
    if num_nonnulls(v_tree, v_slot) <> 1 then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: one of tree_id, slot_id', v_item);
    end if;
    if v_tree is not null and not exists (
      select 1 from public.tree t where t.id = v_tree and t.parcel_id = s.parcel_id and t.status = 'active'
    ) then
      raise exception 'invalid_input' using errcode = '22023', detail = format('tree %s is not an active tree of the parcel', v_tree);
    end if;
    if v_slot is not null and (
      not exists (select 1 from public.slot sl where sl.id = v_slot and sl.parcel_id = s.parcel_id)
      or exists (select 1 from public.tree t where t.slot_id = v_slot and t.status = 'active')
    ) then
      raise exception 'invalid_input' using errcode = '22023', detail = format('slot %s is not an empty slot of the parcel', v_slot);
    end if;
    if exists (
      select 1 from unnest(v_evidence) e
      where not exists (select 1 from public.asset a
                        where a.id = e and a.session_id = s.id and a.kind = 'tree_crop')
    ) then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: evidence is not a crop of the session', v_item);
    end if;

    if exists (
      select 1 from public.measurement m
      where m.session_id = s.id and m.metric_definition_id = v_metric and m.source = 'algorithm'
        and m.tree_id is not distinct from v_tree and m.slot_id is not distinct from v_slot
        and m.method = v_method and m.method_version = v_version
        and m.params_hash is not distinct from v_hash
    ) then
      v_existing := v_existing + 1;
      continue;
    end if;

    begin
      insert into public.measurement (
        org_id, parcel_id, tree_id, slot_id, metric_definition_id, value_category, confidence,
        method, method_version, params_hash, source, session_id, measured_at, recorded_by
      )
      values (
        s.org_id, s.parcel_id, v_tree, v_slot, v_metric, v_item ->> 'value',
        (v_item ->> 'confidence')::real, v_method, v_version, v_hash, 'algorithm', s.id, v_at,
        (select auth.uid())
      )
      returning id into v_id;
    exception
      when check_violation or invalid_text_representation then
        raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: %s', v_item, sqlerrm);
    end;
    insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
    select s.org_id, s.parcel_id, v_id, e from (select distinct unnest(v_evidence) as e) x;
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'existing', v_existing);
end;
$$;
comment on function public.record_tree_presence(uuid, jsonb) is
  'Ops (the pipeline): tree_visible measurements of a run with their crops as evidence; idempotent.';

revoke all on function public.record_tree_presence(uuid, jsonb) from public, anon;
grant execute on function public.record_tree_presence(uuid, jsonb) to authenticated;
