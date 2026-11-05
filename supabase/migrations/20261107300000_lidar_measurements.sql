-- LiDAR measurements of the processing pipeline (services/pipeline, lidar
-- stages crown, skeleton, pruning).
--
-- 1. New metrics for what the stages measure that the registry lacked:
--    tree_height, size_class (crown stage), wood_volume (skeleton stage, research),
--    pruned_wood_volume, pruned_wood_fraction, pruning_cut_count (pruning stage).
--    crown_diameter, crown_volume, scaffold_branch_count, fractal_dimension and
--    pruning_status are registered already (20261021180000_metric_registry).
--    New measured quantities start as under_evaluation (stored, not on the
--    report card until the method is validated); size_class is a proposal for
--    the office and the expert (tree.age_class stays theirs) and research
--    values are hidden.
-- 2. record_lidar_measurements(): ops (the pipeline's user) writes the
--    measurements of the stage reports (crown.json, skeleton.json,
--    pruning.json) of one session in one transaction, source algorithm; the
--    same reports again add nothing, a new method version adds its own rows.
--
-- No new table, so no demo guard to attach; measurement already carries
-- zz_demo_read_only and the function also refuses a demo visitor's request.

-- Same id rule as 20261021180000_metric_registry.sql.
insert into public.metric_definition (
  id, code, name, description, unit, value_type, categories, valid_seasons, card_visibility, subject_kinds
)
select md5('orchados-seed:metric:' || m.code)::uuid, m.code, m.name, m.description, m.unit,
       m.value_type::public.metric_value_type, m.categories, m.valid_seasons::public.season[],
       m.card_visibility::public.card_visibility, '{tree}'::public.measurement_subject[]
from (values
  ('tree_height', 'Ağaç boyu',
   'Height of the highest crown point above the ground under the tree. LiDAR (lidar_crown).',
   'm', 'numeric', null::text[], '{winter,spring,summer,harvest}', 'under_evaluation'),
  ('size_class', 'Boy sınıfı önerisi',
   'Size class proposed from height and crown (lidar_crown): sapling, young, productive, old, the '
   'codes of tree.age_class. A proposal for the office and the expert; not a card value.',
   null, 'category', '{sapling,young,productive,old}', '{winter,spring,summer,harvest}', 'hidden'),
  ('wood_volume', 'Odun hacmi',
   'Wood volume of the leafless branch skeleton (QSM, lidar_qsm). Research only.',
   'm3', 'numeric', null, '{winter}', 'hidden'),
  ('pruned_wood_volume', 'Budanan odun hacmi',
   'Wood volume removed between a winter scan before and one after pruning (lidar_pruning).',
   'm3', 'numeric', null, '{winter}', 'under_evaluation'),
  ('pruned_wood_fraction', 'Budanan odun oranı',
   'Removed wood volume over the wood volume before pruning, 0..1 (lidar_pruning).',
   'ratio', 'numeric', null, '{winter}', 'under_evaluation'),
  ('pruning_cut_count', 'Budama kesiti sayısı',
   'Branches cut between the scan before and the scan after pruning (lidar_pruning).',
   'count', 'numeric', null, '{winter}', 'under_evaluation')
) as m (code, name, description, unit, value_type, categories, valid_seasons, card_visibility)
on conflict do nothing;

-- Metric codes each LiDAR method may write.
create function private.lidar_method_metrics()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "lidar_crown": ["tree_height", "crown_diameter", "crown_volume", "size_class"],
    "lidar_qsm": ["scaffold_branch_count", "wood_volume", "fractal_dimension"],
    "lidar_pruning": ["pruned_wood_volume", "pruned_wood_fraction", "pruning_cut_count", "pruning_status"]
  }'::jsonb;
$$;
comment on function private.lidar_method_metrics() is
  'LiDAR stages: method -> metric codes record_lidar_measurements() accepts.';
revoke all on function private.lidar_method_metrics() from public;

-- p_payload:
--   {"measured_at": timestamptz (optional; default the session's start),
--    "items": [{"tree_id": uuid, "slot_code": text (optional, for messages),
--               "metric": code, "value_numeric": number | "value_category": text,
--               "unit": text (optional; must be the metric's unit),
--               "uncertainty": number >= 0 (required for numeric values, 1 sigma),
--               "confidence": 0..1 (optional),
--               "method": "lidar_crown" | "lidar_qsm" | "lidar_pruning",
--               "method_version": text, "params_hash": text (optional)}, ...]}
-- A tree must be an active tree of the session's parcel; the metric one of the
-- method's metrics (private.lidar_method_metrics) and its value of the metric's
-- type. An item without a value (the stage could not measure the tree) is not
-- recorded and listed in "skipped". An item whose tree already has a measurement
-- of this session with the same metric, method, version and parameters is
-- counted as existing (re-running). Seasons are not checked: the season
-- calendar lives in code, keyed by the visit's methodology version
-- (20261103100800_methodology_v02).
-- Returns {"created": n, "existing": n, "skipped": [{"tree_id", "metric",
-- "method", "reason"}, ...]}. All or nothing.
-- Errors: not_found (P0002), forbidden (42501: not ops of the org),
-- demo_read_only (42501), invalid_input (22023, detail names the item).
create function public.record_lidar_measurements(p_session_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  md public.metric_definition;
  v_methods jsonb := private.lidar_method_metrics();
  v_item jsonb;
  v_tree uuid;
  v_metric text;
  v_method text;
  v_version text;
  v_hash text;
  v_numeric double precision;
  v_category text;
  v_uncertainty double precision;
  v_confidence real;
  v_at timestamptz;
  v_created integer := 0;
  v_existing integer := 0;
  v_skipped jsonb := '[]'::jsonb;
begin
  perform private.assert_not_demo();
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
  if p_payload is null or jsonb_typeof(p_payload -> 'items') is distinct from 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items is required';
  end if;
  begin
    v_at := coalesce((p_payload ->> 'measured_at')::timestamptz, s.started_at, now());
  exception when others then
    raise exception 'invalid_input' using errcode = '22023', detail = 'measured_at';
  end;

  perform pg_advisory_xact_lock(hashtextextended('record_lidar_measurements:' || s.id::text, 0));

  for v_item in select value from jsonb_array_elements(p_payload -> 'items') loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s', v_item);
    end if;
    v_metric := v_item ->> 'metric';
    v_method := v_item ->> 'method';
    v_version := v_item ->> 'method_version';
    v_hash := v_item ->> 'params_hash';
    if length(btrim(coalesce(v_version, ''))) = 0 then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: method_version is required', v_item);
    end if;
    if v_method is null or not coalesce((v_methods -> v_method) ? v_metric, false) then
      raise exception 'invalid_input' using errcode = '22023',
        detail = format('item %s: %s is not a metric of LiDAR method %s', v_item, v_metric, v_method);
    end if;
    select * into md from public.metric_definition where code = v_metric;
    if not found then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: unknown metric', v_item);
    end if;

    begin
      v_tree := (v_item ->> 'tree_id')::uuid;
      v_confidence := (v_item ->> 'confidence')::real;
    exception when others then
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s', v_item);
    end;
    if v_tree is null or not exists (
      select 1 from public.tree t where t.id = v_tree and t.parcel_id = s.parcel_id and t.status = 'active'
    ) then
      raise exception 'invalid_input' using errcode = '22023',
        detail = format('tree %s is not an active tree of the parcel', coalesce(v_tree::text, '(none)'));
    end if;

    -- Value of the metric's type.
    if not (v_item ? 'value_numeric') or jsonb_typeof(v_item -> 'value_numeric') = 'null' then
      v_numeric := null;
    elsif jsonb_typeof(v_item -> 'value_numeric') = 'number' then
      v_numeric := (v_item ->> 'value_numeric')::double precision;
    else
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: value_numeric is not a number', v_item);
    end if;
    if not (v_item ? 'value_category') or jsonb_typeof(v_item -> 'value_category') = 'null' then
      v_category := null;
    elsif jsonb_typeof(v_item -> 'value_category') = 'string' then
      v_category := v_item ->> 'value_category';
    else
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: value_category is not a text', v_item);
    end if;
    if v_numeric is null and v_category is null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'tree_id', v_tree, 'metric', v_metric, 'method', v_method, 'reason', 'no_value'));
      continue;
    end if;
    if md.value_type = 'numeric' then
      if v_numeric is null or v_category is not null then
        raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: %s expects value_numeric', v_item, v_metric);
      end if;
      if jsonb_typeof(v_item -> 'uncertainty') is distinct from 'number' then
        raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: uncertainty is required', v_item);
      end if;
      v_uncertainty := (v_item ->> 'uncertainty')::double precision;
    elsif md.value_type = 'category' then
      if v_category is null or v_numeric is not null then
        raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: %s expects value_category', v_item, v_metric);
      end if;
      if not (v_category = any (md.categories)) then
        raise exception 'invalid_input' using errcode = '22023',
          detail = format('item %s: %s does not allow %s', v_item, v_metric, v_category);
      end if;
      v_uncertainty := null;
    else
      raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: unsupported metric', v_item);
    end if;

    if exists (
      select 1 from public.measurement m
      where m.session_id = s.id and m.metric_definition_id = md.id and m.source = 'algorithm'
        and m.tree_id = v_tree
        and m.method = v_method and m.method_version = v_version
        and m.params_hash is not distinct from v_hash
    ) then
      v_existing := v_existing + 1;
      continue;
    end if;

    begin
      insert into public.measurement (
        org_id, parcel_id, tree_id, metric_definition_id, value_numeric, value_category, unit,
        uncertainty, confidence, method, method_version, params_hash, source, session_id,
        measured_at, recorded_by
      )
      values (
        s.org_id, s.parcel_id, v_tree, md.id, v_numeric, v_category, v_item ->> 'unit',
        v_uncertainty, v_confidence, v_method, v_version, v_hash, 'algorithm', s.id,
        v_at, (select auth.uid())
      );
    exception
      when check_violation then
        raise exception 'invalid_input' using errcode = '22023', detail = format('item %s: %s', v_item, sqlerrm);
    end;
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'existing', v_existing, 'skipped', v_skipped);
end;
$$;
comment on function public.record_lidar_measurements(uuid, jsonb) is
  'Ops (the pipeline): LiDAR measurements (crown, skeleton, pruning stages) of a session, source algorithm; idempotent.';

revoke all on function public.record_lidar_measurements(uuid, jsonb) from public, anon;
grant execute on function public.record_lidar_measurements(uuid, jsonb) to authenticated;
