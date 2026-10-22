-- Coverage quality gate of a scan (docs/metodoloji.md, section 10; MVP Module 3).
--
-- The processing pipeline (services/pipeline, coverage stage) measures for every
-- active tree whether it was seen from two sides, and for the parcel the share
-- of covered trees against a threshold (0.95). The per-tree detail stays in the
-- run's coverage.json; the summary comes here on upload, one row per report:
--
--   coverage_report  ratio, threshold, result, missing trees, blind spots, the
--                    rule (parameters) and the pipeline version that made it.
--
-- Rows are insert-only (results are versioned: reprocessing adds a report, the
-- newest one counts) and written only through record_coverage_report() by ops,
-- the pipeline's user. Org roles read them; owners and viewers once the visit
-- is published ("Denetim güveni" on the report card), as other results.
-- Decision and alternatives: docs/veri-modeli.md, "Kapsama raporu".

create table public.coverage_report (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  -- Producing pipeline, its version and the hash of its parameters.
  pipeline text not null,
  pipeline_version text not null,
  params_hash text not null,
  active_trees integer not null check (active_trees > 0),
  covered_trees integer not null check (covered_trees >= 0),
  ratio double precision generated always as (covered_trees::double precision / active_trees) stored,
  threshold double precision not null check (threshold > 0 and threshold <= 1),
  passed boolean generated always as (covered_trees::double precision / active_trees >= threshold) stored,
  missing_trees integer generated always as (active_trees - covered_trees) stored,
  -- 10 x 10 m cells (docs/arayuzler.md) where uncovered trees cluster.
  blind_spots integer not null check (blind_spots >= 0),
  rescan_needed boolean generated always as (
    covered_trees::double precision / active_trees < threshold or blind_spots > 0
  ) stored,
  -- Slot codes of the uncovered trees, and the blind spot cells:
  -- [{"cell": [cx, cy], "trees": n, "uncovered": n, "slot_codes": [...],
  --   "south": deg, "west": deg, "north": deg, "east": deg}, ...]
  missing_slot_codes text[] not null default '{}',
  blind_spot_cells jsonb not null default '[]' check (jsonb_typeof(blind_spot_cells) = 'array'),
  -- The pipeline's coverage parameters (min_view_score, min_directions, ...).
  rule jsonb not null default '{}' check (jsonb_typeof(rule) = 'object'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- clock_timestamp(): reports of one transaction still have an order (newest counts).
  created_at timestamptz not null default clock_timestamp(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  unique (id, parcel_id, org_id),
  check (covered_trees <= active_trees),
  check (cardinality(missing_slot_codes) <= active_trees - covered_trees)
);
comment on table public.coverage_report is
  'Coverage of a scan by the pipeline: share of active trees seen from two sides, threshold, blind spots. Insert-only; newest per session counts.';
create index coverage_report_session_idx on public.coverage_report (session_id, created_at desc);
create index coverage_report_parcel_idx on public.coverage_report (parcel_id);

alter table public.coverage_report enable row level security;
revoke all on public.coverage_report from anon, authenticated;
grant select on public.coverage_report to authenticated;
grant all on public.coverage_report to service_role;

create policy coverage_report_select on public.coverage_report for select to authenticated
  using (org_id in (select authz.user_org_ids()) or session_id in (select authz.user_published_session_ids()));

-- ---------------------------------------------------------------------------
-- record_coverage_report
-- ---------------------------------------------------------------------------

-- p_report: the summary of the pipeline's coverage.json
--   {"pipeline", "pipeline_version", "params_hash", "active_trees", "covered_trees",
--    "threshold", "blind_spots", "missing_slot_codes": [...], "blind_spot_cells": [...],
--    "rule": {...}}
-- Ratio, result and "rescan needed" are computed here from the counts.
-- Re-running is safe: when the session's newest report has the same pipeline
-- version, parameters and numbers, that row is returned and nothing is written.
-- Returns {"report_id", "created", "passed", "rescan_needed"}.
-- Errors: not_found (P0002), forbidden (42501: not ops of the session's org),
-- invalid_input (22023, detail names the field), session_invalid (cancelled visit).
create function public.record_coverage_report(p_session_id uuid, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  r public.coverage_report;
  v_missing text[];
  v_cells jsonb;
begin
  select * into s from public.session where id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if s.status = 'cancelled' then
    raise exception 'session_invalid' using errcode = '22023', detail = 'cancelled';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_report';
  end if;
  if p_report ? 'missing_slot_codes' and jsonb_typeof(p_report -> 'missing_slot_codes') <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'missing_slot_codes';
  end if;
  v_missing := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_report -> 'missing_slot_codes', '[]'))), '{}');
  v_cells := coalesce(p_report -> 'blind_spot_cells', '[]');

  -- Serialises two uploads of the same visit.
  perform pg_advisory_xact_lock(hashtextextended('coverage_report:' || s.id::text, 0));
  select * into r from public.coverage_report
  where session_id = s.id
  order by created_at desc, id desc
  limit 1;
  if found
     and r.pipeline_version = p_report ->> 'pipeline_version'
     and r.params_hash = p_report ->> 'params_hash'
     and r.active_trees = (p_report ->> 'active_trees')::integer
     and r.covered_trees = (p_report ->> 'covered_trees')::integer
     and r.blind_spots = (p_report ->> 'blind_spots')::integer
     and r.missing_slot_codes = v_missing then
    return jsonb_build_object(
      'report_id', r.id, 'created', false, 'passed', r.passed, 'rescan_needed', r.rescan_needed);
  end if;

  begin
    insert into public.coverage_report (
      org_id, parcel_id, session_id, pipeline, pipeline_version, params_hash,
      active_trees, covered_trees, threshold, blind_spots, missing_slot_codes,
      blind_spot_cells, rule, created_by
    )
    values (
      s.org_id, s.parcel_id, s.id,
      p_report ->> 'pipeline', p_report ->> 'pipeline_version', p_report ->> 'params_hash',
      (p_report ->> 'active_trees')::integer, (p_report ->> 'covered_trees')::integer,
      (p_report ->> 'threshold')::double precision, (p_report ->> 'blind_spots')::integer,
      v_missing, v_cells, coalesce(p_report -> 'rule', '{}'), (select auth.uid())
    )
    returning * into r;
  exception
    when not_null_violation or check_violation or invalid_text_representation
         or numeric_value_out_of_range or division_by_zero then
      raise exception 'invalid_input' using errcode = '22023', detail = sqlerrm;
  end;
  return jsonb_build_object(
    'report_id', r.id, 'created', true, 'passed', r.passed, 'rescan_needed', r.rescan_needed);
end;
$$;
comment on function public.record_coverage_report(uuid, jsonb) is
  'Ops (the pipeline): records the coverage summary of a visit; idempotent for the same run.';

revoke all on function public.record_coverage_report(uuid, jsonb) from public, anon;
grant execute on function public.record_coverage_report(uuid, jsonb) to authenticated;
