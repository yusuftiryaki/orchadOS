-- IP13-A / 2: demo visitors write nothing (docs/demo-turu.md §6.1, §6.3, §6.5).
--
-- 1. Statement guard: zz_demo_read_only, a BEFORE INSERT OR UPDATE OR DELETE
--    OR TRUNCATE ... FOR EACH STATEMENT trigger on every base table of public
--    and private, raises demo_read_only (42501) when the request's JWT is a
--    demo visitor's. It also catches writes made inside security definer
--    functions: the claims hold for the whole request. Exceptions: tables
--    owned by extensions, and private.demo_session (demo_end, demo_hit).
--    Service role, cron, pipeline and loader requests carry no demo claim.
--
--    EVERY FUTURE MIGRATION THAT CREATES A TABLE in public or private calls
--      select private.attach_demo_guard('<schema>.<table>');
--    and, for a table that grants access to or holds the identity of a user,
--      select private.attach_demo_account_guard('<schema>.<table>', '<user column>');
--    (20261101120200_demo_account_lockdown.sql). pgTAP 43_demo_write_guard
--    fails on a table without zz_demo_read_only. Migration order alone is not
--    enough: deploys run db push --include-all, so a late-merged migration
--    with an older timestamp lands after this one on hosted projects. Every
--    deploy workflow therefore runs private.attach_demo_guards() after the
--    push and fails on private.demo_guard_drift()
--    (20261101120300_demo_guard_drift.sql).
-- 2. Restrictive policies on parcel_access, question, question_reply and
--    storage.objects. parcel_access select also hides other visitors' rows;
--    session select shows a visitor published visits only.
-- 3. approve_boundary, owner_invite_viewer, owner_cancel_viewer_invitation
--    start with private.assert_not_demo() (signature, grants, comment as
--    before).
-- 4. Notifications skip demo orgs and demo accounts (enqueue_notifications,
--    enqueue_billing_notification: the only writers of public.notification).
-- 5. save_ai_assessment refuses a demo org's session (demo_org_no_ai).
--
-- create or replace keeps each function's owner, security definer flag,
-- grants and comment.

-- ---------------------------------------------------------------------------
-- 1. Statement guard
-- ---------------------------------------------------------------------------

create function private.deny_demo_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if authz.is_demo_user() then
    raise exception 'demo_read_only' using errcode = '42501',
      detail = format('%I.%I', tg_table_schema, tg_table_name);
  end if;
  return null;
end;
$$;
comment on function private.deny_demo_write() is
  'Statement trigger zz_demo_read_only: demo_read_only (42501) for any write of a demo visitor''s request.';

-- Idempotent: (re)creates zz_demo_read_only on the table.
create function private.attach_demo_guard(p_table regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  execute format('drop trigger if exists zz_demo_read_only on %s', p_table);
  execute format(
    'create trigger zz_demo_read_only before insert or update or delete or truncate on %s '
    'for each statement execute function private.deny_demo_write()', p_table);
end;
$$;
comment on function private.attach_demo_guard(regclass) is
  'Attaches the demo write guard (zz_demo_read_only) to a table; every table-creating migration calls it.';

-- Idempotent: guards every base table of public and private that lacks
-- zz_demo_read_only and returns the tables it guarded. Run here and again by
-- every deploy workflow after db push: --include-all applies a late-merged
-- migration with an older timestamp after this one, so this migration's own
-- pass cannot be the only one (see private.demo_guard_drift()).
create function private.attach_demo_guards()
returns setof regclass
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as tbl
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind in ('r', 'p')
      and not c.relispartition
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
      and c.oid <> 'private.demo_session'::regclass
      and not exists (
        select 1 from pg_catalog.pg_trigger g where g.tgrelid = c.oid and g.tgname = 'zz_demo_read_only')
    order by n.nspname, c.relname
  loop
    perform private.attach_demo_guard(t.tbl);
    return next t.tbl;
  end loop;
end;
$$;
comment on function private.attach_demo_guards() is
  'Attaches zz_demo_read_only to every public/private base table without it; returns those tables. Deploy workflows run it after db push.';

revoke all on function private.deny_demo_write() from public;
revoke all on function private.attach_demo_guard(regclass) from public;
revoke all on function private.attach_demo_guards() from public;

select private.attach_demo_guards();

-- ---------------------------------------------------------------------------
-- 2. Restrictive policies
-- ---------------------------------------------------------------------------

-- A demo visitor sees its own access rows and those of non-demo accounts (the
-- fictional owner and co-owner), never other visitors'.
create policy parcel_access_demo_select on public.parcel_access as restrictive for select to authenticated
  using (
    not (select authz.is_demo_user())
    or user_id = (select auth.uid())
    or not authz.is_demo_account(user_id)
  );
create policy parcel_access_demo_insert on public.parcel_access as restrictive for insert to authenticated
  with check (not (select authz.is_demo_user()));
create policy parcel_access_demo_update on public.parcel_access as restrictive for update to authenticated
  using (not (select authz.is_demo_user()))
  with check (not (select authz.is_demo_user()));
create policy parcel_access_demo_delete on public.parcel_access as restrictive for delete to authenticated
  using (not (select authz.is_demo_user()));

create policy question_demo_insert on public.question as restrictive for insert to authenticated
  with check (not (select authz.is_demo_user()));
create policy question_demo_update on public.question as restrictive for update to authenticated
  using (not (select authz.is_demo_user()))
  with check (not (select authz.is_demo_user()));
create policy question_reply_demo_insert on public.question_reply as restrictive for insert to authenticated
  with check (not (select authz.is_demo_user()));
create policy question_reply_demo_update on public.question_reply as restrictive for update to authenticated
  using (not (select authz.is_demo_user()))
  with check (not (select authz.is_demo_user()));

-- A demo visitor sees published visits only (§14): owners in general see that
-- a visit is planned or in review, a visitor of the showcase does not.
create policy session_demo_select on public.session as restrictive for select to authenticated
  using (not (select authz.is_demo_user()) or status = 'published');

-- Restrictive only: they grant nothing (media stays without update or delete
-- policies for API users).
create policy media_demo_no_insert on storage.objects as restrictive for insert to authenticated
  with check (not (select authz.is_demo_user()));
create policy media_demo_no_update on storage.objects as restrictive for update to authenticated
  using (not (select authz.is_demo_user()))
  with check (not (select authz.is_demo_user()));
create policy media_demo_no_delete on storage.objects as restrictive for delete to authenticated
  using (not (select authz.is_demo_user()));

-- ---------------------------------------------------------------------------
-- 3. Explicit guards (definitions as in 20261018120500_access_control.sql and
--    20261024120100_viewer_invitations.sql, plus the first line)
-- ---------------------------------------------------------------------------

create or replace function public.approve_boundary(p_boundary_id uuid)
returns public.boundary
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boundary;
begin
  perform private.assert_not_demo();
  update public.boundary
  set owner_approved_at = now(),
      owner_approved_by = (select auth.uid())
  where id = p_boundary_id
    and owner_approved_at is null
    and parcel_id in (select authz.user_parcel_ids('{owner}'))
  returning * into b;

  if not found then
    raise exception 'boundary % not found, already approved, or caller is not an owner of its parcel', p_boundary_id
      using errcode = '42501';
  end if;
  return b;
end;
$$;

create or replace function public.owner_invite_viewer(p_parcel_id uuid, p_full_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_id uuid;
begin
  perform private.assert_not_demo();
  if p_parcel_id is null or p_parcel_id not in (select authz.user_parcel_ids('{owner}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
  end if;
  select org_id into v_org from public.parcel where id = p_parcel_id;

  -- Serialise invitations of one parcel (limit and duplicate check).
  perform pg_advisory_xact_lock(hashtextextended('viewer_invitation:' || p_parcel_id::text, 0));

  select id into v_id from private.viewer_invitation
  where parcel_id = p_parcel_id and phone = v_phone and status = 'pending';
  if found then
    return v_id;
  end if;
  if (select count(*) from private.viewer_invitation
      where parcel_id = p_parcel_id and status = 'pending') >= 10 then
    raise exception 'too_many_invitations' using errcode = 'P0001';
  end if;

  insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, invited_by)
  values (v_org, p_parcel_id, v_name, v_phone, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.owner_cancel_viewer_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_not_demo();
  update private.viewer_invitation
  set status = 'cancelled', resolved_by = (select auth.uid()), resolved_at = now()
  where id = p_invitation_id and status = 'pending'
    and parcel_id in (select authz.user_parcel_ids('{owner}'));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Notifications skip demo orgs
-- ---------------------------------------------------------------------------

-- As in 20261023140000_notification_queue.sql, plus the demo org filter.
create or replace function private.enqueue_notifications(
  p_template public.notification_template,
  p_session_id uuid,
  p_finding_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification (
    org_id, parcel_id, session_id, finding_id, recipient_user_id, channel, template, vars
  )
  select
    s.org_id, s.parcel_id, s.id, p_finding_id, pa.user_id,
    case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
    p_template,
    jsonb_build_object(
      'parcel_name', p.name,
      'date', to_char(coalesce(
        (s.started_at at time zone 'Europe/Istanbul')::date,
        s.planned_date,
        (s.created_at at time zone 'Europe/Istanbul')::date
      ), 'YYYY-MM-DD'),
      'path', '/portal/parsel/' || p.id
    )
  from public.session s
  join public.parcel p on p.id = s.parcel_id
  join public.parcel_access pa on pa.parcel_id = s.parcel_id
  left join private.owner_profile op on op.org_id = s.org_id and op.user_id = pa.user_id
  where s.id = p_session_id
    and not private.is_demo_org(s.org_id)
    -- Demo accounts never have access outside demo orgs (scope guard); a
    -- leftover row is skipped rather than failing the publication.
    and not authz.is_demo_account(pa.user_id)
  order by pa.created_at, pa.user_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- As in 20261030105100_billing_notifications.sql, plus the demo org filter.
create or replace function private.enqueue_billing_notification(
  p_template public.notification_template,
  p_org_id uuid,
  p_user_id uuid,
  p_ref_id uuid,
  p_ref text,
  p_path text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification (org_id, recipient_user_id, channel, template, vars, ref_id)
  select
    p_org_id, p_user_id,
    case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
    p_template,
    jsonb_build_object('ref', p_ref, 'path', p_path),
    p_ref_id
  from (select 1) one
  left join private.owner_profile op on op.org_id = p_org_id and op.user_id = p_user_id
  where not private.is_demo_org(p_org_id)
    and not authz.is_demo_account(p_user_id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. AI results are never written to a demo org's visit (as in
--    20261023150000_ai_preassessment.sql, plus the demo check; security
--    invoker as before, hence authz.is_demo_org)
-- ---------------------------------------------------------------------------

create or replace function public.save_ai_assessment(
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
  -- Demo tour: demo visits carry their assessments in the dataset; nothing
  -- from the AI worker is written to them (docs/demo-turu.md §6.5).
  if authz.is_demo_org(s.org_id) then
    raise exception 'demo_org_no_ai' using errcode = '42501';
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
