-- IP9: AI pre-assessment (services/ai-worker).
--
-- 1. ai_assessment_detail: what the expert panel needs beyond the assessment
--    row (tree visible?, inconsistency flags, triage path) and what the run
--    cost; one row per AI assessment. The prompt version and the model cascade
--    identify a result: the same (session, tree, prompt_version, config_key)
--    is written once, so a rerun adds nothing.
-- 2. save_ai_assessment(): one AI result in one transaction, as the caller
--    (ops): assessment (source ai) + measurements (source ai) + evidence
--    (the tree's crops of the visit) + assessment_measurement + detail.
--    Idempotent on the key above.
-- 3. AI rows are never shown to owners and viewers. Until now they saw a
--    published session's assessments and measurements of every source; AI
--    suggestions are for the expert only (docs/metodoloji.md, section 6). A
--    bulk-approved AI result reaches the owner as an expert row with
--    auto_approved = true, not as the AI row. The join tables follow, as their
--    select policies look the measurement and the assessment up under RLS.
--
-- Contract: docs/arayuzler.md, "AI ön değerlendirme satırları".

-- ---------------------------------------------------------------------------
-- 1. ai_assessment_detail
-- ---------------------------------------------------------------------------

create table public.ai_assessment_detail (
  assessment_id uuid primary key,
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  tree_id uuid not null,
  -- '<revision>/<methodology version>', e.g. ai-v0.1/methodology-v0.
  prompt_version text not null check (prompt_version <> ''),
  -- Models of the cascade, e.g. claude-haiku-5-5>claude-sonnet-5-5.
  config_key text not null check (config_key <> ''),
  -- Model whose answer is the result (also assessment.model_name) and its stage (1 = triage).
  final_model text not null,
  final_stage smallint not null check (final_stage >= 1),
  -- Models that answered for this tree, in stage order.
  models text[] not null check (cardinality(models) >= 1),
  -- Why the triage answer went to the next stage (empty: it stood).
  review_reasons text[] not null default '{}',
  tree_visible text not null check (tree_visible in ('yes', 'no', 'unsure')),
  -- staff_answer_conflict, large_change_from_previous, poor_image (open set).
  flags text[] not null default '{}',
  -- Token use and estimated cost of all stages for this tree (batch prices).
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_input_tokens integer not null default 0 check (cache_read_input_tokens >= 0),
  cache_creation_input_tokens integer not null default 0 check (cache_creation_input_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  batch_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (assessment_id, parcel_id, org_id) references public.assessment (id, parcel_id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  unique (session_id, tree_id, prompt_version, config_key)
);
comment on table public.ai_assessment_detail is
  'AI pre-assessment details (visibility, flags, triage, cost) per AI assessment. Org members only; insert-only.';
create index ai_assessment_detail_tree_id_idx on public.ai_assessment_detail (tree_id);
create index ai_assessment_detail_parcel_id_idx on public.ai_assessment_detail (parcel_id);
create index ai_assessment_detail_org_id_idx on public.ai_assessment_detail (org_id);

-- The detail belongs to an AI assessment of the same session and tree.
create function private.validate_ai_assessment_detail()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessment a
    where a.id = new.assessment_id
      and a.source = 'ai'
      and a.session_id = new.session_id
      and a.tree_id = new.tree_id
  ) then
    raise exception 'assessment % is not an AI assessment of session % and tree %',
      new.assessment_id, new.session_id, new.tree_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ai_assessment_detail_validate
before insert on public.ai_assessment_detail
for each row execute function private.validate_ai_assessment_detail();
create trigger ai_assessment_detail_insert_only
before update or delete on public.ai_assessment_detail
for each row execute function private.forbid_mutation();
create trigger ai_assessment_detail_no_truncate
before truncate on public.ai_assessment_detail
for each statement execute function private.forbid_mutation();

alter table public.ai_assessment_detail enable row level security;
revoke all on public.ai_assessment_detail from anon, authenticated;
grant select, insert on public.ai_assessment_detail to authenticated;
grant all on public.ai_assessment_detail to service_role;

-- Org members only: owners and viewers never see AI details.
create policy ai_assessment_detail_select on public.ai_assessment_detail for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy ai_assessment_detail_insert on public.ai_assessment_detail for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{expert,ops}')));

-- ---------------------------------------------------------------------------
-- 2. save_ai_assessment
-- ---------------------------------------------------------------------------

-- p_measurements: json array of
--   {"metric_definition_id": uuid, "value_scale" | "value_category" | "value_boolean": ...,
--    "confidence": number, "uncertainty": number | null}
-- p_detail: json object with prompt_version, config_key, final_stage, models,
--   review_reasons, tree_visible, flags, input_tokens, output_tokens,
--   cache_read_input_tokens, cache_creation_input_tokens, cost_usd, batch_ids,
--   params_hash.
-- Measurements get source = ai, method = ai_preassessment, method_version =
-- prompt_version. Evidence must be tree crops of this session and tree.
-- Returns the assessment id; when the same (session, tree, prompt_version,
-- config_key) was saved before, returns that one and writes nothing.
create function public.save_ai_assessment(
  p_session_id uuid,
  p_tree_id uuid,
  p_overall_class public.health_class,
  p_confidence real,
  p_model_name text,
  p_model_version text,
  p_methodology_version text,
  p_notes text,
  p_measurements jsonb,
  p_evidence_asset_ids uuid[],
  p_detail jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.session;
  v_assessment_id uuid;
  v_measurement_ids uuid[];
  v_prompt_version text := p_detail ->> 'prompt_version';
  v_config_key text := p_detail ->> 'config_key';
  v_bad uuid;
begin
  select * into s from public.session where id = p_session_id;
  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'P0002';
  end if;
  if s.status not in ('processed', 'in_review') then
    raise exception 'session % is %; AI results are written to processed or in_review sessions only', s.id, s.status
      using errcode = '55000';
  end if;
  if p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'p_measurements must be a json array' using errcode = '22023';
  end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' or v_prompt_version is null or v_config_key is null then
    raise exception 'p_detail must be an object with prompt_version and config_key' using errcode = '22023';
  end if;

  select d.assessment_id into v_assessment_id
  from public.ai_assessment_detail d
  where d.session_id = s.id and d.tree_id = p_tree_id
    and d.prompt_version = v_prompt_version and d.config_key = v_config_key;
  if found then
    return v_assessment_id;
  end if;

  select e into v_bad
  from unnest(coalesce(p_evidence_asset_ids, '{}')) as e
  where not exists (
    select 1 from public.asset a
    where a.id = e and a.session_id = s.id and a.tree_id = p_tree_id and a.kind = 'tree_crop'
  )
  limit 1;
  if v_bad is not null then
    raise exception 'asset % is not a tree crop of session % and tree %', v_bad, s.id, p_tree_id
      using errcode = '23514';
  end if;

  insert into public.assessment (
    org_id, parcel_id, session_id, tree_id, source, overall_class, confidence,
    model_name, model_version, methodology_version, notes, assessed_at
  )
  values (s.org_id, s.parcel_id, s.id, p_tree_id, 'ai', p_overall_class, p_confidence,
          p_model_name, p_model_version, p_methodology_version, p_notes, clock_timestamp())
  returning id into v_assessment_id;

  with inserted as (
    insert into public.measurement (
      org_id, parcel_id, tree_id, metric_definition_id,
      value_scale, value_category, value_boolean, uncertainty, confidence,
      method, method_version, params_hash, source, session_id, measured_at
    )
    select s.org_id, s.parcel_id, p_tree_id, x.metric_definition_id,
           x.value_scale, x.value_category, x.value_boolean, x.uncertainty, x.confidence,
           'ai_preassessment', v_prompt_version, p_detail ->> 'params_hash', 'ai', s.id, clock_timestamp()
    from jsonb_to_recordset(p_measurements) as x (
      metric_definition_id uuid,
      value_scale smallint,
      value_category text,
      value_boolean boolean,
      uncertainty double precision,
      confidence real
    )
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_measurement_ids from inserted;

  insert into public.assessment_measurement (org_id, parcel_id, assessment_id, measurement_id)
  select s.org_id, s.parcel_id, v_assessment_id, m
  from unnest(v_measurement_ids) as m;

  insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
  select s.org_id, s.parcel_id, m, a
  from unnest(v_measurement_ids) as m
  cross join (select distinct unnest(coalesce(p_evidence_asset_ids, '{}')) as a) as e;

  insert into public.ai_assessment_detail (
    assessment_id, org_id, parcel_id, session_id, tree_id, prompt_version, config_key,
    final_model, final_stage, models, review_reasons, tree_visible, flags,
    input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens,
    cost_usd, batch_ids
  )
  values (
    v_assessment_id, s.org_id, s.parcel_id, s.id, p_tree_id, v_prompt_version, v_config_key,
    p_model_name,
    coalesce((p_detail ->> 'final_stage')::smallint, 1),
    coalesce(array(select jsonb_array_elements_text(p_detail -> 'models')), array[p_model_name]),
    coalesce(array(select jsonb_array_elements_text(p_detail -> 'review_reasons')), '{}'),
    p_detail ->> 'tree_visible',
    coalesce(array(select jsonb_array_elements_text(p_detail -> 'flags')), '{}'),
    coalesce((p_detail ->> 'input_tokens')::integer, 0),
    coalesce((p_detail ->> 'output_tokens')::integer, 0),
    coalesce((p_detail ->> 'cache_read_input_tokens')::integer, 0),
    coalesce((p_detail ->> 'cache_creation_input_tokens')::integer, 0),
    coalesce((p_detail ->> 'cost_usd')::numeric, 0),
    coalesce(array(select jsonb_array_elements_text(p_detail -> 'batch_ids')), '{}')
  );

  return v_assessment_id;
end;
$$;
comment on function public.save_ai_assessment(
  uuid, uuid, public.health_class, real, text, text, text, text, jsonb, uuid[], jsonb
) is 'One AI pre-assessment of a tree (assessment, measurements, evidence, detail) in one transaction; idempotent.';
revoke all on function public.save_ai_assessment(
  uuid, uuid, public.health_class, real, text, text, text, text, jsonb, uuid[], jsonb
) from public, anon;
grant execute on function public.save_ai_assessment(
  uuid, uuid, public.health_class, real, text, text, text, text, jsonb, uuid[], jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. AI rows are for the org only
-- ---------------------------------------------------------------------------

drop policy assessment_select on public.assessment;
create policy assessment_select on public.assessment for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (source <> 'ai' and session_id in (select authz.user_published_session_ids()))
  );

drop policy measurement_select on public.measurement;
create policy measurement_select on public.measurement for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or (source <> 'ai' and session_id in (select authz.user_published_session_ids()))
  );
