-- Expert panel v0.2: bulk approval of the trees that need no mandatory review.
--
-- 1. problem_seen: the field crew's "Sorun gördüm" mark on a tree during a
--    scan, a yes/no staff measurement like the close-up questions
--    (20261021230000_field_sync.sql). A tree with this mark always goes to
--    the expert (docs/metodoloji.md, section 6). Hidden on the report card.
-- 2. bulk_approve_trees(): one transaction that writes, for each given tree,
--    an expert assessment with auto_approved = true and the class of the
--    newest AI (or model) suggestion of the visit, plus the copied AI
--    measurements, their evidence and links. The AI rows stay as they are.
--    Which trees qualify (no mandatory review, not in the 5 % quality sample)
--    is decided by the expert panel (apps/web/src/lib/expert/mandatory-review.ts);
--    the database refuses trees without an AI suggestion, trees that already
--    have an expert decision in the visit and published visits.
--
-- publish_session() needs an expert assessment for every active tree; a bulk
-- approved row is one (source = expert), so it counts, and publication
-- approves it in the signer's name like every other expert assessment.

-- ---------------------------------------------------------------------------
-- 1. problem_seen metric
-- ---------------------------------------------------------------------------

-- Same id rule as 20261021180000_metric_registry.sql.
insert into public.metric_definition (
  id, code, name, description, unit, value_type, valid_seasons, card_visibility, subject_kinds
)
values (
  md5('orchados-seed:metric:problem_seen')::uuid, 'problem_seen', 'Sorun gördüm',
  'Field crew marked the tree during the scan: something looks wrong. Sends the tree to mandatory expert review.',
  null, 'boolean', '{winter,spring,summer,harvest}', 'hidden', '{tree}'
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. bulk_approve_trees
-- ---------------------------------------------------------------------------

-- p_items: json array of
--   {"tree_id": uuid,
--    "measurements": [same shape as save_expert_assessment's p_measurements],
--    "evidence_asset_ids": [uuid, ...]}
-- Returns the number of trees approved. All or nothing: one refused tree
-- rolls back the whole call. Security invoker: row level security decides
-- (expert rows can only be written by an expert of the org).
create function public.bulk_approve_trees(
  p_session_id uuid,
  p_items jsonb,
  p_method_version text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.session;
  v_item jsonb;
  v_tree_id uuid;
  v_code text;
  v_class public.health_class;
  v_assessment_id uuid;
  v_measurement_ids uuid[];
  v_count integer := 0;
begin
  select * into s from public.session where id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids('{expert}')) then
    raise exception 'session % not found, or caller is not an expert of its org', p_session_id
      using errcode = '42501';
  end if;
  if s.status in ('processed', 'in_review') then
    -- Serialises with publish_session(), which locks the same row; the status
    -- is read again under the lock. (The update policy hides published rows
    -- from FOR UPDATE, hence the plain read first.)
    select * into s from public.session where id = p_session_id for update;
    if not found then
      s.status := 'published';
    end if;
  end if;
  if s.status not in ('processed', 'in_review') then
    raise exception 'session % is %; only processed or in_review sessions can be reviewed', p_session_id, s.status
      using errcode = '55000';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a json array' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_tree_id := (v_item ->> 'tree_id')::uuid;

    select sl.code into v_code
    from public.tree t
    join public.slot sl on sl.id = t.slot_id
    where t.id = v_tree_id and t.parcel_id = s.parcel_id and t.status = 'active';
    if not found then
      raise exception 'tree % is not an active tree of the visit''s parcel', v_tree_id
        using errcode = '22023';
    end if;

    if exists (
      select 1 from public.assessment a
      where a.session_id = s.id and a.tree_id = v_tree_id and a.source = 'expert'
    ) then
      raise exception 'tree % already has an expert decision in session %', v_code, s.id
        using errcode = 'P0001', detail = 'decided: ' || v_code,
              hint = 'Reload the visit; bulk approval only covers undecided trees.';
    end if;

    -- Newest AI (or model) suggestion of the visit: the one the expert panel
    -- shows and "Accept AI" takes (newest row, then creation time, then id).
    select a.overall_class into v_class
    from public.assessment a
    where a.session_id = s.id and a.tree_id = v_tree_id and a.source in ('model', 'ai')
    order by a.assessed_at desc, a.created_at desc, a.id
    limit 1;
    if v_class is null then
      raise exception 'tree % has no AI suggestion in session %', v_code, s.id
        using errcode = 'P0001', detail = 'no_ai: ' || v_code;
    end if;

    if jsonb_typeof(coalesce(v_item -> 'measurements', '[]')) <> 'array' then
      raise exception 'measurements of tree % must be a json array', v_code using errcode = '22023';
    end if;

    insert into public.assessment (
      org_id, parcel_id, session_id, tree_id, source, overall_class, methodology_version,
      auto_approved, assessed_at
    )
    values (s.org_id, s.parcel_id, s.id, v_tree_id, 'expert', v_class, p_method_version,
            true, clock_timestamp())
    returning id into v_assessment_id;

    with inserted as (
      insert into public.measurement (
        org_id, parcel_id, tree_id, metric_definition_id,
        value_numeric, value_scale, value_category, value_boolean, uncertainty,
        method, method_version, source, session_id, measured_at
      )
      select s.org_id, s.parcel_id, v_tree_id, x.metric_definition_id,
             x.value_numeric, x.value_scale, x.value_category, x.value_boolean, x.uncertainty,
             'expert_review', p_method_version, 'expert', s.id, clock_timestamp()
      from jsonb_to_recordset(coalesce(v_item -> 'measurements', '[]')) as x (
        metric_definition_id uuid,
        value_numeric double precision,
        value_scale smallint,
        value_category text,
        value_boolean boolean,
        uncertainty double precision
      )
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_measurement_ids from inserted;

    insert into public.assessment_measurement (org_id, parcel_id, assessment_id, measurement_id)
    select s.org_id, s.parcel_id, v_assessment_id, m
    from unnest(v_measurement_ids) as m;

    insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
    select s.org_id, s.parcel_id, m, e.a
    from unnest(v_measurement_ids) as m
    cross join (
      select distinct value::uuid as a
      from jsonb_array_elements_text(coalesce(v_item -> 'evidence_asset_ids', '[]'))
    ) as e;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
comment on function public.bulk_approve_trees(uuid, jsonb, text) is
  'Bulk approval ("otomatik onay"): an auto_approved expert assessment with the AI class and copied AI values per tree, in one transaction.';
revoke all on function public.bulk_approve_trees(uuid, jsonb, text) from public, anon;
grant execute on function public.bulk_approve_trees(uuid, jsonb, text) to authenticated;
