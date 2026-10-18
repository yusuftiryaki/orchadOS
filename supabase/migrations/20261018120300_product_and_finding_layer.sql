-- IP1 / 4: product layer (asset + lineage) and finding layer
-- (metric_definition, measurement, assessment, finding, operation).

-- ---------------------------------------------------------------------------
-- Asset: derived file. Insert-only.
-- ---------------------------------------------------------------------------

create table public.asset (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  kind public.asset_kind not null,
  -- Subject tree for tree crops and tree point clouds.
  tree_id uuid,
  uri text not null,
  -- SHA-256 of the file content, lowercase hex.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size bigint check (byte_size >= 0),
  mime_type text,
  -- Pose: position plus orientation; pose.crs names the frame of any local values.
  position extensions.geometry(Point, 4326),
  position_uncertainty_m real check (position_uncertainty_m >= 0),
  pose jsonb,
  quality_score real check (quality_score >= 0 and quality_score <= 1),
  -- Producing pipeline, its version and a hash of its parameters.
  pipeline text not null,
  pipeline_version text not null,
  params_hash text,
  produced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  unique (org_id, content_hash),
  unique (id, parcel_id, org_id),
  check (position is null or position_uncertainty_m is not null)
);
comment on table public.asset is 'Derived file (panorama, tree crop, trajectory, point cloud). Insert-only; lineage in asset_source.';
create index asset_session_id_idx on public.asset (session_id);
create index asset_parcel_id_idx on public.asset (parcel_id);
create index asset_tree_id_idx on public.asset (tree_id);
create index asset_position_gist on public.asset using gist (position);

-- Lineage: each row says "asset was derived from this capture or this asset".
create table public.asset_source (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  asset_id uuid not null,
  source_capture_id uuid,
  source_asset_id uuid,
  created_at timestamptz not null default now(),
  foreign key (asset_id, parcel_id, org_id) references public.asset (id, parcel_id, org_id),
  foreign key (source_capture_id, parcel_id, org_id) references public.capture (id, parcel_id, org_id),
  foreign key (source_asset_id, parcel_id, org_id) references public.asset (id, parcel_id, org_id),
  unique nulls not distinct (asset_id, source_capture_id, source_asset_id),
  check (num_nonnulls(source_capture_id, source_asset_id) = 1),
  check (source_asset_id is distinct from asset_id)
);
comment on table public.asset_source is 'derived_from lineage of an asset: one source capture or one source asset per row.';
create index asset_source_source_capture_id_idx on public.asset_source (source_capture_id);
create index asset_source_source_asset_id_idx on public.asset_source (source_asset_id);
create index asset_source_org_id_idx on public.asset_source (org_id);

-- ---------------------------------------------------------------------------
-- Metric registry. Global catalogue (no org_id): adding a metric = adding a row.
-- ---------------------------------------------------------------------------

create table public.metric_definition (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  -- Null for dimensionless values (scales, categories, fractal dimension).
  unit text,
  value_type public.metric_value_type not null,
  scale_min smallint,
  scale_max smallint,
  categories text[],
  valid_seasons public.season[] not null,
  card_visibility public.card_visibility not null,
  subject_kinds public.measurement_subject[] not null default '{tree}',
  created_at timestamptz not null default now(),
  check ((value_type = 'scale') = (scale_min is not null and scale_max is not null)),
  check (scale_min is null or scale_min < scale_max),
  check ((value_type = 'category') = (categories is not null)),
  check (cardinality(valid_seasons) > 0),
  check (cardinality(subject_kinds) > 0)
);
comment on table public.metric_definition is 'Metric registry: code, unit, value type, valid seasons, report card visibility.';

-- ---------------------------------------------------------------------------
-- Measurement. Insert-only. The largest table; see note on partitioning below.
-- ---------------------------------------------------------------------------

create table public.measurement (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  -- Always set: scope for RLS. When no tree/slot/zone is given the subject is the parcel itself.
  parcel_id uuid not null,
  tree_id uuid,
  slot_id uuid,
  zone_id uuid,
  subject public.measurement_subject generated always as (
    case
      when tree_id is not null then 'tree'::public.measurement_subject
      when slot_id is not null then 'slot'::public.measurement_subject
      when zone_id is not null then 'zone'::public.measurement_subject
      else 'parcel'::public.measurement_subject
    end
  ) stored,
  metric_definition_id uuid not null references public.metric_definition (id),
  value_numeric double precision,
  value_scale smallint,
  value_category text,
  unit text,
  uncertainty double precision check (uncertainty >= 0),
  -- Optional model confidence (0..1) for ai / algorithm sources.
  confidence real check (confidence >= 0 and confidence <= 1),
  method text not null,
  method_version text not null,
  params_hash text,
  source public.measurement_source not null,
  session_id uuid not null,
  measured_at timestamptz not null,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  foreign key (slot_id, parcel_id, org_id) references public.slot (id, parcel_id, org_id),
  foreign key (zone_id, parcel_id, org_id) references public.zone (id, parcel_id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  unique (id, parcel_id, org_id),
  -- Exactly one subject: one of tree / slot / zone, or none of them (= the parcel).
  check (num_nonnulls(tree_id, slot_id, zone_id) <= 1),
  -- Exactly one value column; which one must match metric_definition.value_type (trigger).
  check (num_nonnulls(value_numeric, value_scale, value_category) = 1),
  -- Uncertainty is mandatory for numeric and scale values.
  check (value_category is not null or uncertainty is not null)
);
comment on table public.measurement is
  'One value of one metric on one subject, with method + version, source and uncertainty. Insert-only. '
  'To be partitioned by year once volume requires it (docs/veri-modeli.md, "Ölçek").';
create index measurement_tree_metric_time_idx on public.measurement (tree_id, metric_definition_id, measured_at);
create index measurement_parcel_metric_time_idx on public.measurement (parcel_id, metric_definition_id, measured_at);
create index measurement_slot_id_idx on public.measurement (slot_id) where slot_id is not null;
create index measurement_zone_id_idx on public.measurement (zone_id) where zone_id is not null;
create index measurement_session_id_idx on public.measurement (session_id);
create index measurement_metric_definition_id_idx on public.measurement (metric_definition_id);

-- Checks that depend on metric_definition: value type, scale range, category list,
-- unit and allowed subject kinds. Fills unit from the definition when omitted.
create function private.validate_measurement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  md public.metric_definition;
begin
  select * into md from public.metric_definition where id = new.metric_definition_id;
  if not found then
    raise exception 'unknown metric_definition_id %', new.metric_definition_id using errcode = '23503';
  end if;

  if md.value_type = 'numeric' and new.value_numeric is null then
    raise exception 'metric % expects value_numeric', md.code using errcode = '23514';
  elsif md.value_type = 'scale' then
    if new.value_scale is null then
      raise exception 'metric % expects value_scale', md.code using errcode = '23514';
    elsif new.value_scale < md.scale_min or new.value_scale > md.scale_max then
      raise exception 'metric % expects a scale value in [%, %], got %',
        md.code, md.scale_min, md.scale_max, new.value_scale using errcode = '23514';
    end if;
  elsif md.value_type = 'category' then
    if new.value_category is null then
      raise exception 'metric % expects value_category', md.code using errcode = '23514';
    elsif not (new.value_category = any (md.categories)) then
      raise exception 'metric % does not allow category %', md.code, new.value_category using errcode = '23514';
    end if;
  end if;

  if new.unit is null then
    new.unit := md.unit;
  elsif new.unit is distinct from md.unit then
    raise exception 'metric % is stored in %, got %', md.code, coalesce(md.unit, '(no unit)'), new.unit
      using errcode = '23514';
  end if;

  if not (
    case
      when new.tree_id is not null then 'tree'::public.measurement_subject
      when new.slot_id is not null then 'slot'::public.measurement_subject
      when new.zone_id is not null then 'zone'::public.measurement_subject
      else 'parcel'::public.measurement_subject
    end = any (md.subject_kinds)
  ) then
    raise exception 'metric % cannot be measured on this subject kind', md.code using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger measurement_validate
before insert on public.measurement
for each row execute function private.validate_measurement();

create trigger measurement_insert_only
before update or delete on public.measurement
for each row execute function private.forbid_mutation();
create trigger measurement_no_truncate
before truncate on public.measurement
for each statement execute function private.forbid_mutation();

create table public.measurement_evidence (
  org_id uuid not null,
  parcel_id uuid not null,
  measurement_id uuid not null,
  asset_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (measurement_id, asset_id),
  foreign key (measurement_id, parcel_id, org_id) references public.measurement (id, parcel_id, org_id),
  foreign key (asset_id, parcel_id, org_id) references public.asset (id, parcel_id, org_id)
);
create index measurement_evidence_asset_id_idx on public.measurement_evidence (asset_id);
create index measurement_evidence_org_id_idx on public.measurement_evidence (org_id);

-- Insert-only also for the asset and lineage/evidence join tables.
create trigger asset_insert_only
before update or delete on public.asset
for each row execute function private.forbid_mutation();
create trigger asset_no_truncate
before truncate on public.asset
for each statement execute function private.forbid_mutation();
create trigger asset_source_insert_only
before update or delete on public.asset_source
for each row execute function private.forbid_mutation();
create trigger measurement_evidence_insert_only
before update or delete on public.measurement_evidence
for each row execute function private.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Assessment: a judgement (AI, model or expert) based on measurements.
-- ---------------------------------------------------------------------------

create table public.assessment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  -- Null: parcel-level assessment.
  tree_id uuid,
  source public.assessment_source not null,
  overall_class public.health_class,
  confidence real check (confidence >= 0 and confidence <= 1),
  model_name text,
  model_version text,
  methodology_version text,
  assessed_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- Bulk-approved AI result ("otomatik onay").
  auto_approved boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  notes text,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  unique (id, parcel_id, org_id),
  check (source = 'expert' or (model_name is not null and model_version is not null)),
  check ((approved_by is null) = (approved_at is null))
);
comment on table public.assessment is 'Judgement on a tree (or parcel). AI and expert opinions are separate rows.';
create index assessment_tree_id_idx on public.assessment (tree_id, assessed_at);
create index assessment_session_id_idx on public.assessment (session_id);
create index assessment_parcel_id_idx on public.assessment (parcel_id);

create table public.assessment_measurement (
  org_id uuid not null,
  parcel_id uuid not null,
  assessment_id uuid not null,
  measurement_id uuid not null,
  primary key (assessment_id, measurement_id),
  foreign key (assessment_id, parcel_id, org_id) references public.assessment (id, parcel_id, org_id) on delete cascade,
  foreign key (measurement_id, parcel_id, org_id) references public.measurement (id, parcel_id, org_id)
);
comment on table public.assessment_measurement is 'Measurements an assessment is based on.';
create index assessment_measurement_measurement_id_idx on public.assessment_measurement (measurement_id);
create index assessment_measurement_org_id_idx on public.assessment_measurement (org_id);

-- ---------------------------------------------------------------------------
-- Finding: reported item with evidence.
-- ---------------------------------------------------------------------------

create table public.finding (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  tree_id uuid,
  zone_id uuid,
  assessment_id uuid,
  -- Area or point the finding refers to when it is not a single tree.
  location extensions.geometry(Geometry, 4326),
  position_uncertainty_m real check (position_uncertainty_m >= 0),
  -- Open vocabulary from the methodology document (e.g. dead_branch, pest_sign, theft_trace).
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*$'),
  severity public.finding_severity not null,
  description text not null,
  recommendation text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  foreign key (zone_id, parcel_id, org_id) references public.zone (id, parcel_id, org_id),
  foreign key (assessment_id, parcel_id, org_id) references public.assessment (id, parcel_id, org_id),
  unique (id, parcel_id, org_id),
  check ((approved_by is null) = (approved_at is null))
);
create index finding_session_id_idx on public.finding (session_id);
create index finding_parcel_id_idx on public.finding (parcel_id);
create index finding_tree_id_idx on public.finding (tree_id);
create index finding_zone_id_idx on public.finding (zone_id);
create index finding_assessment_id_idx on public.finding (assessment_id);
create index finding_location_gist on public.finding using gist (location);

create table public.finding_evidence (
  org_id uuid not null,
  parcel_id uuid not null,
  finding_id uuid not null,
  asset_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (finding_id, asset_id),
  foreign key (finding_id, parcel_id, org_id) references public.finding (id, parcel_id, org_id) on delete cascade,
  foreign key (asset_id, parcel_id, org_id) references public.asset (id, parcel_id, org_id)
);
create index finding_evidence_asset_id_idx on public.finding_evidence (asset_id);
create index finding_evidence_org_id_idx on public.finding_evidence (org_id);

-- ---------------------------------------------------------------------------
-- Operation: work done on the orchard (human or robot).
-- ---------------------------------------------------------------------------

create table public.operation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid,
  kind public.operation_kind not null,
  performer public.performer_kind not null default 'crew',
  performed_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  area extensions.geometry(MultiPolygon, 4326),
  area_m2 numeric(12, 2) check (area_m2 >= 0),
  product_name text,
  dose numeric check (dose >= 0),
  dose_unit text,
  prescription_no text,
  details jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  check (ended_at is null or ended_at >= started_at),
  check (dose is null or dose_unit is not null)
);
comment on table public.operation is 'Mowing, spraying (product, dose, prescription), tillage, pruning; by a crew or a robot.';
create index operation_parcel_id_idx on public.operation (parcel_id, started_at);
create index operation_session_id_idx on public.operation (session_id);
create index operation_org_id_idx on public.operation (org_id);
create index operation_area_gist on public.operation using gist (area);
