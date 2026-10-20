-- IP7: expert review and report publication.
--
-- 1. session.published_at / published_by: who signed the report and when.
-- 2. Publication goes through publish_session() only. API users (authenticated)
--    can no longer insert a published session or update a session's status to
--    'published'; a published session's status is final for everyone.
-- 3. The expert's judgement of a published session is frozen for API users:
--    assessments, findings and their join tables cannot be added, changed or
--    removed once the session is published.
-- 4. save_expert_assessment(): one transaction for an expert decision
--    (assessment + measurements + evidence + links), as the caller.
-- 5. publish_session(): expert-only; every active tree needs an expert
--    assessment; approves the session's findings and expert assessments in the
--    signer's name.
--
-- Trusted roles (service_role: processing pipeline, tests; postgres:
-- migrations, demo data) may still write published sessions directly.

-- ---------------------------------------------------------------------------
-- 1. Publication columns
-- ---------------------------------------------------------------------------

alter table public.session
  add column published_at timestamptz,
  add column published_by uuid references auth.users (id) on delete set null;

alter table public.session
  add constraint session_published_fields
  check (status = 'published' or (published_at is null and published_by is null));

comment on column public.session.published_at is 'When the report was signed and published (publish_session).';
comment on column public.session.published_by is 'Expert who signed and published the report; null when published by a trusted backend.';

-- ---------------------------------------------------------------------------
-- 2. Publication is final; only publish_session() publishes for API users
-- ---------------------------------------------------------------------------

create function private.guard_session_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'published' then
    if new.status <> 'published' then
      raise exception 'session % is published; its status cannot change', old.id
        using errcode = 'P0001', hint = 'Unpublishing is not supported.';
    end if;
    if new.published_at is distinct from old.published_at or new.published_by is distinct from old.published_by then
      raise exception 'session % is published; its publication record cannot change', old.id using errcode = 'P0001';
    end if;
  end if;

  -- Rows published directly by a trusted role still get a publication time.
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger session_guard_publication
before insert or update on public.session
for each row execute function private.guard_session_publication();

-- The with-check clauses keep API users from writing status = 'published';
-- the using clauses keep published sessions out of reach for updates and deletes.
drop policy session_insert on public.session;
create policy session_insert on public.session for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')) and status <> 'published');

drop policy session_update on public.session;
create policy session_update on public.session for update to authenticated
  using (org_id in (select authz.user_org_ids()) and status <> 'published')
  with check (org_id in (select authz.user_org_ids()) and status <> 'published');

drop policy session_delete on public.session;
create policy session_delete on public.session for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')) and status <> 'published');

-- ---------------------------------------------------------------------------
-- 3. Frozen judgement after publication (API users only)
-- ---------------------------------------------------------------------------

create function private.forbid_change_after_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_session_id uuid;
begin
  -- publish_session() runs as its owner, and trusted roles are not API users.
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;

  v_row := case when tg_op = 'DELETE' then old else new end;
  if tg_table_name in ('assessment', 'finding') then
    v_session_id := v_row.session_id;
  elsif tg_table_name = 'assessment_measurement' then
    select a.session_id into v_session_id from public.assessment a where a.id = v_row.assessment_id;
  elsif tg_table_name = 'finding_evidence' then
    select f.session_id into v_session_id from public.finding f where f.id = v_row.finding_id;
  end if;
  -- An update must not move a row out of (or into) a published session either.
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.session s where s.id = old.session_id and s.status = 'published') then
      v_session_id := old.session_id;
    end if;
  end if;

  if exists (select 1 from public.session s where s.id = v_session_id and s.status = 'published') then
    raise exception '% of published session % cannot be changed', tg_table_name, v_session_id
      using errcode = '42501', hint = 'The report is signed; unpublishing is not supported.';
  end if;
  return null;
end;
$$;

-- AFTER triggers: row level security has already accepted the row.
create trigger assessment_frozen_after_publication
after insert or update or delete on public.assessment
for each row execute function private.forbid_change_after_publication();
create trigger assessment_measurement_frozen_after_publication
after insert or delete on public.assessment_measurement
for each row execute function private.forbid_change_after_publication();
create trigger finding_frozen_after_publication
after insert or update or delete on public.finding
for each row execute function private.forbid_change_after_publication();
create trigger finding_evidence_frozen_after_publication
after insert or delete on public.finding_evidence
for each row execute function private.forbid_change_after_publication();

-- ---------------------------------------------------------------------------
-- 4. save_expert_assessment: one expert decision in one transaction
-- ---------------------------------------------------------------------------

-- p_measurements: json array of
--   {"metric_definition_id": uuid, "value_numeric" | "value_scale" | "value_category" | "value_boolean": ...,
--    "uncertainty": number | null}
-- Every measurement gets source = expert, method = expert_review and
-- p_method_version, is linked to the assessment (assessment_measurement) and to
-- every asset in p_evidence_asset_ids (measurement_evidence). Earlier rows are
-- never changed: a new decision is a new assessment; the newest one counts.
-- Security invoker: row level security decides (assessment and measurement
-- rows with source = expert can only be written by an expert of the org).
create function public.save_expert_assessment(
  p_session_id uuid,
  p_tree_id uuid,
  p_overall_class public.health_class,
  p_measurements jsonb,
  p_evidence_asset_ids uuid[],
  p_method_version text,
  p_notes text default null
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
begin
  select * into s from public.session where id = p_session_id;
  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'P0002';
  end if;
  if s.status not in ('processed', 'in_review') then
    raise exception 'session % is %; only processed or in_review sessions can be reviewed', s.id, s.status
      using errcode = '55000';
  end if;
  if p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'p_measurements must be a json array' using errcode = '22023';
  end if;

  insert into public.assessment (
    org_id, parcel_id, session_id, tree_id, source, overall_class, methodology_version, notes, assessed_at
  )
  -- clock_timestamp(): two decisions in one transaction still keep their order.
  values (s.org_id, s.parcel_id, s.id, p_tree_id, 'expert', p_overall_class, p_method_version, p_notes,
          clock_timestamp())
  returning id into v_assessment_id;

  with inserted as (
    insert into public.measurement (
      org_id, parcel_id, tree_id, metric_definition_id,
      value_numeric, value_scale, value_category, value_boolean, uncertainty,
      method, method_version, source, session_id, measured_at
    )
    select s.org_id, s.parcel_id, p_tree_id, x.metric_definition_id,
           x.value_numeric, x.value_scale, x.value_category, x.value_boolean, x.uncertainty,
           'expert_review', p_method_version, 'expert', s.id, clock_timestamp()
    from jsonb_to_recordset(p_measurements) as x (
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
  select s.org_id, s.parcel_id, m, a
  from unnest(v_measurement_ids) as m
  cross join (select distinct unnest(coalesce(p_evidence_asset_ids, '{}')) as a) as e;

  return v_assessment_id;
end;
$$;
comment on function public.save_expert_assessment(uuid, uuid, public.health_class, jsonb, uuid[], text, text) is
  'Expert decision on one tree: a new expert assessment with its measurements and evidence, in one transaction.';
revoke all on function public.save_expert_assessment(uuid, uuid, public.health_class, jsonb, uuid[], text, text)
  from public, anon;
grant execute on function public.save_expert_assessment(uuid, uuid, public.health_class, jsonb, uuid[], text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. publish_session: sign and publish the report
-- ---------------------------------------------------------------------------

create function public.publish_session(p_session_id uuid)
returns public.session
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_uid uuid := (select auth.uid());
  v_missing text[];
begin
  select * into s from public.session where id = p_session_id for update;
  if not found or s.org_id not in (select authz.user_org_ids('{expert}')) then
    raise exception 'session % not found, or caller is not an expert of its org', p_session_id
      using errcode = '42501';
  end if;
  if s.status = 'published' then
    raise exception 'session % is already published', s.id using errcode = '55000';
  end if;
  if s.status not in ('processed', 'in_review') then
    raise exception 'session % is %; only processed or in_review sessions can be published', s.id, s.status
      using errcode = '55000';
  end if;

  select array_agg(sl.code order by sl.row_no, sl.position_no, sl.suffix nulls first)
  into v_missing
  from public.tree t
  join public.slot sl on sl.id = t.slot_id
  where t.parcel_id = s.parcel_id
    and t.status = 'active'
    and not exists (
      select 1 from public.assessment a
      where a.session_id = s.id and a.tree_id = t.id and a.source = 'expert'
    );
  if v_missing is not null then
    raise exception 'session % cannot be published: % active trees have no expert assessment',
      s.id, cardinality(v_missing)
      using errcode = 'P0001',
            detail = 'missing: ' || array_to_string(v_missing, ', '),
            hint = 'Accept or correct every tree before signing.';
  end if;

  update public.finding
  set approved_by = v_uid, approved_at = now()
  where session_id = s.id and approved_by is null;

  update public.assessment
  set approved_by = v_uid, approved_at = now()
  where session_id = s.id and source = 'expert' and approved_by is null;

  update public.session
  set status = 'published', published_at = now(), published_by = v_uid
  where id = s.id
  returning * into s;
  return s;
end;
$$;
comment on function public.publish_session(uuid) is
  'Expert signs and publishes a session: needs an expert assessment for every active tree; approves its findings.';
revoke all on function public.publish_session(uuid) from public, anon;
grant execute on function public.publish_session(uuid) to authenticated;
