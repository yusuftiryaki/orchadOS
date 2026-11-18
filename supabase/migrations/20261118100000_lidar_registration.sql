-- LiDAR registration step and its reader gate
-- (docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md §5.8, §5.11).
--
-- The pipeline's `lidar register` turns a kit session's raw MCAP and GNSS into a
-- registered cloud plus a quality report (registration.json) with an automatic
-- verdict. The report comes here; LiDAR measurements and the 3D world cloud of
-- the run name it, and parcel readers see them only while it is the session's
-- current accepted registration.
--
-- 1. public.lidar_registration: one row per register run (run_id), with the
--    report's metrics, verdict and reasons and the decision. Rows are never
--    deleted; only the decision columns change, through the functions below:
--    pending_review -> accepted | rejected (once, by ops), accepted ->
--    superseded (a later accepted run of the same session). At most one
--    accepted row per session.
-- 2. record_lidar_registration(): ops (the pipeline) records a run; the same
--    run again returns the same row. Initial status from the verdict:
--    accepted_auto -> accepted, review -> pending_review, rejected_auto ->
--    rejected. An accepted run supersedes the session's previous accepted one.
-- 3. decide_lidar_registration(): ops accepts or rejects a pending run; a note
--    is required to reject; accepting supersedes the previous accepted run.
-- 4. measurement.registration_id: the registration a LiDAR measurement came
--    from (same session, enforced by the foreign key); record_lidar_measurements
--    takes it as payload.registration_id, refuses a rejected registration and
--    counts "already exists" per registration, so a new run adds its rows next
--    to the old ones.
-- 5. asset.pose.registration_id: the same for the world cloud (validated and
--    normalised on insert).
-- 6. Gate: restrictive select policies on measurement and asset. Org roles see
--    every row; parcel readers (owner, viewer, demo visitor) see a row that
--    names a registration only while that registration is accepted. Rows
--    without a registration (demo, synthetic, older uploads) keep today's
--    visibility. authz.parcel_reader_media_object applies the same rule to the
--    world cloud file. Measurements uploaded before ops decides become visible
--    on accept without re-running the pipeline.
--
-- New table: demo write guard attached. It grants no access and carries no
-- identity, so no demo account guard.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table public.lidar_registration (
  id uuid primary key default gen_random_uuid(),
  -- Each `lidar register` run has its own id (spec §5.11); the unique key.
  run_id uuid not null unique,
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  -- registration_method (e.g. point_lio+gtsam_ppk), its version and parameters.
  method text not null check (length(btrim(method)) > 0),
  method_version text not null check (length(btrim(method_version)) > 0),
  params_hash text not null check (length(btrim(params_hash)) > 0),
  ppk_status text not null check (ppk_status in ('ppk', 'no_ppk', 'ppk_failed')),
  -- registration.json metrics (gnss_residual_*, lio_coverage, trunk_spread_p95_m, ...).
  metrics jsonb not null default '{}' check (jsonb_typeof(metrics) = 'object'),
  auto_verdict text not null check (auto_verdict in ('accepted_auto', 'review', 'rejected_auto')),
  reasons text[] not null default '{}',
  status text not null check (status in ('accepted', 'rejected', 'pending_review', 'superseded')),
  -- Ops' decision of a pending run; empty for an automatic verdict. A
  -- superseded row keeps the decision it had.
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  -- Target of measurement (registration_id, session_id): same session.
  unique (id, session_id),
  -- Only a run the pipeline sent to review carries ops' decision, and once
  -- it left pending_review it always does (decided_by may later be emptied
  -- when the account is deleted).
  check (auto_verdict = 'review' or (decided_at is null and decided_by is null and decision_note is null)),
  check (status <> 'pending_review' or (decided_at is null and decided_by is null and decision_note is null)),
  check (auto_verdict <> 'review' or status = 'pending_review' or decided_at is not null),
  check (status <> 'rejected' or auto_verdict = 'rejected_auto' or length(btrim(coalesce(decision_note, ''))) > 0)
);
comment on table public.lidar_registration is
  'LiDAR registration runs of a session: quality report, automatic verdict and ops decision; gates LiDAR measurements and the world cloud for parcel readers. Never deleted.';
create index lidar_registration_session_idx on public.lidar_registration (session_id, created_at desc);
create index lidar_registration_pending_idx on public.lidar_registration (created_at) where status = 'pending_review';
-- One current accepted registration per session.
create unique index lidar_registration_one_accepted on public.lidar_registration (session_id)
  where status = 'accepted';

alter table public.lidar_registration enable row level security;
select private.attach_demo_guard('public.lidar_registration');
revoke all on public.lidar_registration from anon, authenticated;
grant select on public.lidar_registration to authenticated;
grant all on public.lidar_registration to service_role;

-- Org roles (field staff, expert, ops) read the runs; parcel readers do not.
create policy lidar_registration_select on public.lidar_registration for select to authenticated
  using (org_id in (select authz.user_org_ids()));

-- Only the decision changes, and only along pending_review -> accepted |
-- rejected and accepted -> superseded.
create function private.lidar_registration_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'lidar_registration rows are not deleted' using errcode = '42501';
  end if;
  if (to_jsonb(new) - '{status,decided_by,decided_at,decision_note}'::text[])
     is distinct from (to_jsonb(old) - '{status,decided_by,decided_at,decision_note}'::text[]) then
    raise exception 'only the decision of a lidar_registration changes' using errcode = '42501';
  end if;
  if old.status = 'pending_review' and new.status in ('accepted', 'rejected') then
    return new;
  end if;
  if old.status = 'accepted' and new.status = 'superseded'
     and new.decided_by is not distinct from old.decided_by
     and new.decided_at is not distinct from old.decided_at
     and new.decision_note is not distinct from old.decision_note then
    return new;
  end if;
  raise exception 'lidar_registration: % -> % is not allowed', old.status, new.status using errcode = '42501';
end;
$$;
revoke all on function private.lidar_registration_guard() from public;

create trigger lidar_registration_guard
before update or delete on public.lidar_registration
for each row execute function private.lidar_registration_guard();
create trigger lidar_registration_no_truncate
before truncate on public.lidar_registration
for each statement execute function private.forbid_mutation();

-- ---------------------------------------------------------------------------
-- 2. record_lidar_registration
-- ---------------------------------------------------------------------------

-- p_payload: the registration.json subset
--   {"run_id": uuid, "method": text, "method_version": text, "params_hash": text,
--    "ppk_status": "ppk" | "no_ppk" | "ppk_failed", "metrics": {...},
--    "verdict": "accepted_auto" | "review" | "rejected_auto", "reasons": [text, ...],
--    "session_id": uuid (optional; must be p_session_id),
--    "parcel_id": uuid (optional; must be the session's parcel)}
-- Re-running is safe: a run_id already recorded for this session with the same
-- method, version, parameters and verdict returns that row's id and writes
-- nothing (its decision is kept). Returns the registration id.
-- Errors: not_found (P0002), forbidden (42501: not ops of the session's org),
-- demo_read_only (42501), invalid_input (22023, detail names the field).
create function public.record_lidar_registration(p_session_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  r public.lidar_registration;
  v_run uuid;
  v_verdict text;
  v_status text;
  v_reasons text[];
  v_metrics jsonb;
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
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_payload';
  end if;
  begin
    v_run := (p_payload ->> 'run_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_input' using errcode = '22023', detail = 'run_id';
  end;
  if v_run is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'run_id is required';
  end if;
  if p_payload ? 'session_id' and (p_payload ->> 'session_id') is distinct from s.id::text then
    raise exception 'invalid_input' using errcode = '22023', detail = 'session_id is not p_session_id';
  end if;
  if p_payload ? 'parcel_id' and (p_payload ->> 'parcel_id') is distinct from s.parcel_id::text then
    raise exception 'invalid_input' using errcode = '22023', detail = 'parcel_id is not the session''s parcel';
  end if;
  v_verdict := p_payload ->> 'verdict';
  v_status := case v_verdict
    when 'accepted_auto' then 'accepted'
    when 'review' then 'pending_review'
    when 'rejected_auto' then 'rejected'
  end;
  if v_status is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'verdict';
  end if;
  if coalesce(jsonb_typeof(p_payload -> 'reasons'), 'null') not in ('array', 'null')
     or exists (select 1 from jsonb_array_elements(coalesce(p_payload -> 'reasons', '[]')) e
                where jsonb_typeof(e) <> 'string') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reasons';
  end if;
  v_reasons := array(select jsonb_array_elements_text(coalesce(p_payload -> 'reasons', '[]')));
  v_metrics := coalesce(p_payload -> 'metrics', '{}');
  if jsonb_typeof(v_metrics) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'metrics';
  end if;

  -- Serialises uploads and decisions of the same visit.
  perform pg_advisory_xact_lock(hashtextextended('lidar_registration:' || s.id::text, 0));

  select * into r from public.lidar_registration where run_id = v_run;
  if found then
    if r.session_id <> s.id
       or r.method is distinct from p_payload ->> 'method'
       or r.method_version is distinct from p_payload ->> 'method_version'
       or r.params_hash is distinct from p_payload ->> 'params_hash'
       or r.auto_verdict <> v_verdict then
      raise exception 'invalid_input' using errcode = '22023',
        detail = format('run_id %s is already recorded with other content', v_run);
    end if;
    return r.id;
  end if;

  if v_status = 'accepted' then
    update public.lidar_registration set status = 'superseded'
    where session_id = s.id and status = 'accepted';
  end if;

  begin
    insert into public.lidar_registration (
      run_id, org_id, parcel_id, session_id, method, method_version, params_hash, ppk_status,
      metrics, auto_verdict, reasons, status, recorded_by
    )
    values (
      v_run, s.org_id, s.parcel_id, s.id, p_payload ->> 'method', p_payload ->> 'method_version',
      p_payload ->> 'params_hash', p_payload ->> 'ppk_status', v_metrics, v_verdict, v_reasons,
      v_status, (select auth.uid())
    )
    returning * into r;
  exception
    when not_null_violation or check_violation then
      raise exception 'invalid_input' using errcode = '22023', detail = sqlerrm;
  end;
  return r.id;
end;
$$;
comment on function public.record_lidar_registration(uuid, jsonb) is
  'Ops (the pipeline): records a LiDAR registration run of a session (registration.json); idempotent on run_id.';

revoke all on function public.record_lidar_registration(uuid, jsonb) from public, anon;
grant execute on function public.record_lidar_registration(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. decide_lidar_registration
-- ---------------------------------------------------------------------------

-- Ops accepts or rejects a pending_review run, once. A note is required to
-- reject. Accepting supersedes the session's previous accepted run; its
-- measurements and world cloud become visible to parcel readers at once.
-- Errors: not_found (P0002), forbidden (42501: not ops of the run's org),
-- demo_read_only (42501), not_pending (55000: already decided),
-- invalid_input (22023: note missing on reject).
create function public.decide_lidar_registration(p_id uuid, p_accept boolean, p_note text)
returns public.lidar_registration
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.lidar_registration;
begin
  perform private.assert_not_demo();
  select * into r from public.lidar_registration where id = p_id;
  if not found or r.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_accept is required';
  end if;
  if not p_accept and length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'a note is required to reject';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lidar_registration:' || r.session_id::text, 0));
  select * into r from public.lidar_registration where id = p_id for update;
  if r.status <> 'pending_review' then
    raise exception 'not_pending' using errcode = '55000', detail = format('registration is %s', r.status);
  end if;

  if p_accept then
    update public.lidar_registration set status = 'superseded'
    where session_id = r.session_id and status = 'accepted';
  end if;
  update public.lidar_registration
  set status = case when p_accept then 'accepted' else 'rejected' end,
      decided_by = (select auth.uid()),
      decided_at = clock_timestamp(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = r.id
  returning * into r;
  return r;
end;
$$;
comment on function public.decide_lidar_registration(uuid, boolean, text) is
  'Ops: accepts or rejects a pending LiDAR registration once (note required to reject); accepting supersedes the previous accepted run.';

revoke all on function public.decide_lidar_registration(uuid, boolean, text) from public, anon;
grant execute on function public.decide_lidar_registration(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Measurements name their registration
-- ---------------------------------------------------------------------------

alter table public.measurement add column registration_id uuid;
alter table public.measurement
  add constraint measurement_registration_fk foreign key (registration_id, session_id)
    references public.lidar_registration (id, session_id),
  add constraint measurement_registration_lidar check (registration_id is null or method like 'lidar\_%');
comment on column public.measurement.registration_id is
  'LiDAR measurements: the lidar_registration run of the same session the cloud came from; null for other methods and unregistered (demo, synthetic) rows.';
create index measurement_registration_id_idx on public.measurement (registration_id)
  where registration_id is not null;

-- A rejected registration takes no measurements (direct inserts included).
create function private.measurement_registration_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.registration_id is not null and exists (
    select 1 from public.lidar_registration r where r.id = new.registration_id and r.status = 'rejected'
  ) then
    raise exception 'registration_rejected' using errcode = '22023',
      detail = format('registration %s is rejected', new.registration_id);
  end if;
  return new;
end;
$$;
revoke all on function private.measurement_registration_check() from public;

create trigger measurement_registration_check
before insert on public.measurement
for each row execute function private.measurement_registration_check();

-- p_payload as in 20261107300000_lidar_measurements, plus
--   "registration_id": uuid (optional): the lidar_registration run the cloud
--   came from; a registration of this session that is not rejected.
-- "Already exists" now also compares registration_id: the rows of a new run
-- are added next to those of an older run.
-- New error: registration_rejected (22023).
create or replace function public.record_lidar_measurements(p_session_id uuid, p_payload jsonb)
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
  v_registration uuid;
  v_registration_status text;
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
  begin
    v_registration := (p_payload ->> 'registration_id')::uuid;
  exception when others then
    raise exception 'invalid_input' using errcode = '22023', detail = 'registration_id';
  end;

  perform pg_advisory_xact_lock(hashtextextended('record_lidar_measurements:' || s.id::text, 0));

  if v_registration is not null then
    select r.status into v_registration_status
    from public.lidar_registration r where r.id = v_registration and r.session_id = s.id;
    if not found then
      raise exception 'invalid_input' using errcode = '22023',
        detail = format('registration_id %s is not a registration of the session', v_registration);
    end if;
    if v_registration_status = 'rejected' then
      raise exception 'registration_rejected' using errcode = '22023',
        detail = format('registration %s is rejected', v_registration);
    end if;
  end if;

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
        and m.registration_id is not distinct from v_registration
    ) then
      v_existing := v_existing + 1;
      continue;
    end if;

    begin
      insert into public.measurement (
        org_id, parcel_id, tree_id, metric_definition_id, value_numeric, value_category, unit,
        uncertainty, confidence, method, method_version, params_hash, source, session_id,
        measured_at, recorded_by, registration_id
      )
      values (
        s.org_id, s.parcel_id, v_tree, md.id, v_numeric, v_category, v_item ->> 'unit',
        v_uncertainty, v_confidence, v_method, v_version, v_hash, 'algorithm', s.id,
        v_at, (select auth.uid()), v_registration
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
  'Ops (the pipeline): LiDAR measurements (crown, skeleton, pruning stages) of a session and registration run, source algorithm; idempotent.';

-- ---------------------------------------------------------------------------
-- 5. The world cloud names its registration (asset.pose.registration_id)
-- ---------------------------------------------------------------------------

-- The value must be a registration of the asset's session that is not
-- rejected; it is stored in canonical form so the gate can compare text.
create function private.asset_registration_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration uuid;
  v_status text;
begin
  if new.pose is null or jsonb_typeof(new.pose) <> 'object' or (new.pose ->> 'registration_id') is null then
    return new;
  end if;
  begin
    v_registration := (new.pose ->> 'registration_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_input' using errcode = '22023', detail = 'pose.registration_id is not a uuid';
  end;
  select r.status into v_status
  from public.lidar_registration r where r.id = v_registration and r.session_id = new.session_id;
  if not found then
    raise exception 'invalid_input' using errcode = '22023',
      detail = format('pose.registration_id %s is not a registration of the session', v_registration);
  end if;
  if v_status = 'rejected' then
    raise exception 'registration_rejected' using errcode = '22023',
      detail = format('registration %s is rejected', v_registration);
  end if;
  new.pose := jsonb_set(new.pose, '{registration_id}', to_jsonb(v_registration::text));
  return new;
end;
$$;
revoke all on function private.asset_registration_check() from public;

create trigger asset_registration_check
before insert on public.asset
for each row execute function private.asset_registration_check();

-- ---------------------------------------------------------------------------
-- 6. Gate
-- ---------------------------------------------------------------------------

-- The current accepted registration of every session (at most one each).
create function authz.accepted_lidar_registration_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.lidar_registration r where r.status = 'accepted';
$$;
comment on function authz.accepted_lidar_registration_ids() is
  'LiDAR registration runs that are the current accepted run of their session; parcel readers see rows naming them.';
revoke all on function authz.accepted_lidar_registration_ids() from public, anon;
grant execute on function authz.accepted_lidar_registration_ids() to authenticated, service_role;

create policy measurement_lidar_registration_gate on public.measurement as restrictive for select to authenticated
  using (
    registration_id is null
    or org_id in (select authz.user_org_ids())
    or registration_id in (select authz.accepted_lidar_registration_ids())
  );
comment on policy measurement_lidar_registration_gate on public.measurement is
  'LiDAR registration gate: parcel readers see a measurement of a registration run only while it is the session''s accepted run; org roles see all; rows without a run are unchanged.';

create policy asset_lidar_registration_gate on public.asset as restrictive for select to authenticated
  using (
    (pose ->> 'registration_id') is null
    or org_id in (select authz.user_org_ids())
    or (pose ->> 'registration_id') in (select r::text from authz.accepted_lidar_registration_ids() r)
  );
comment on policy asset_lidar_registration_gate on public.asset is
  'LiDAR registration gate: parcel readers see a world cloud of a registration run only while it is the session''s accepted run; org roles see all; rows without a run are unchanged.';

-- The world cloud file follows its row (20261107500100).
create or replace function authz.parcel_reader_media_object(p_org_id uuid, p_parcel_id uuid, p_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.asset a
    where a.org_id = p_org_id and a.content_hash = p_hash and a.parcel_id = p_parcel_id
      and a.kind in ('panorama', 'world_cloud')
      and a.session_id in (select authz.user_published_session_ids())
      and ((a.pose ->> 'registration_id') is null
           or (a.pose ->> 'registration_id') in (select r::text from authz.accepted_lidar_registration_ids() r))
  ) or exists (
    select 1 from public.capture c
    where c.org_id = p_org_id and c.content_hash = p_hash and c.parcel_id = p_parcel_id
      and c.kind = 'photo' and c.tree_id is not null
      and c.session_id in (select authz.user_published_session_ids())
  );
$$;
