-- Test data cleanup: local and CI databases only.
--
-- Loaded after supabase/seed.sql by `supabase db reset` / `supabase start`
-- ([db.seed] sql_paths in supabase/config.toml). It is not a migration:
-- `supabase db push` (deploy-db) never sends it to the test or production
-- project. See supabase/testing/README.md.
--
-- Insert-only tables (capture, asset, measurement, session_event, trunk_label
-- ...) and the publication lock refuse deletes from every API user. These
-- functions delete a test's rows with triggers off (session_replication_role =
-- replica, for the calling transaction only). With triggers off foreign keys do
-- not cascade either, so every table is emptied explicitly: tables are found by
-- their session_id / parcel_id / org_id column, so new tables are covered
-- without changing this file; tables reached only through a parent id are
-- listed by hand.
--
-- Callable by service_role (web and Python tests through PostgREST:
-- schema "testing") and by the postgres role (pgTAP).

create schema if not exists testing;
revoke all on schema testing from public;
grant usage on schema testing to service_role;

-- Rows in public and private tables that have the column, as (table, count).
create or replace function testing._delete_by(p_column text, p_ids uuid[])
returns table (table_name text, deleted bigint)
language plpgsql
set search_path = ''
as $$
declare
  t record;
  n bigint;
begin
  for t in
    select c.table_schema, c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema in ('public', 'private')
      and c.column_name = p_column
      and tb.table_type = 'BASE TABLE'
    order by 1, 2
  loop
    execute format('delete from %I.%I where %I = any($1)', t.table_schema, t.table_name, p_column)
      using p_ids;
    get diagnostics n = row_count;
    if n > 0 then
      table_name := t.table_schema || '.' || t.table_name;
      deleted := n;
      return next;
    end if;
  end loop;
end;
$$;

-- Media objects of the given "<parcel_id>/<content_hash>" pairs that no asset or
-- capture row points to any more (object name org/<org>/parcel/<parcel>/<hash>).
create or replace function testing._delete_orphan_objects(p_files text[])
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from storage.objects o
  where o.bucket_id = 'media'
    and (storage.foldername(o.name))[4] || '/' || storage.filename(o.name) = any(p_files)
    and not exists (
      select 1 from public.asset a
      where a.parcel_id::text = (storage.foldername(o.name))[4]
        and a.content_hash = storage.filename(o.name))
    and not exists (
      select 1 from public.capture c
      where c.parcel_id::text = (storage.foldername(o.name))[4]
        and c.content_hash = storage.filename(o.name));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Children reached only through a parent id (no session_id / parcel_id of their own
-- that would catch them), deleted before their parents.
create or replace function testing._delete_children(
  p_assessments uuid[], p_measurements uuid[], p_findings uuid[], p_assets uuid[],
  p_captures uuid[], p_notifications uuid[]
)
returns void
language sql
set search_path = ''
as $$
  delete from public.assessment_measurement
    where assessment_id = any(p_assessments) or measurement_id = any(p_measurements);
  delete from public.measurement_evidence
    where measurement_id = any(p_measurements) or asset_id = any(p_assets);
  delete from public.finding_evidence where finding_id = any(p_findings) or asset_id = any(p_assets);
  delete from public.question_reply where question_id in
    (select id from public.question where finding_id = any(p_findings));
  delete from public.question where finding_id = any(p_findings);
  delete from public.asset_source
    where asset_id = any(p_assets) or source_asset_id = any(p_assets)
       or source_capture_id = any(p_captures);
  delete from private.message_outbox where notification_id = any(p_notifications);
$$;

-- Test sessions and everything hanging off them; media objects nothing points to
-- any more. The parcel, its slots and trees of other sessions stay.
create or replace function testing.purge_sessions(p_session_ids uuid[])
returns table (table_name text, deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_files text[];
  n bigint;
begin
  set local session_replication_role = replica;
  v_files := array(
    select parcel_id || '/' || content_hash from public.asset
      where session_id = any(p_session_ids)
    union
    select parcel_id || '/' || content_hash from public.capture
      where session_id = any(p_session_ids));
  perform testing._delete_children(
    array(select id from public.assessment where session_id = any(p_session_ids)),
    array(select id from public.measurement where session_id = any(p_session_ids)),
    array(select id from public.finding where session_id = any(p_session_ids)),
    array(select id from public.asset where session_id = any(p_session_ids)),
    array(select id from public.capture where session_id = any(p_session_ids)),
    array(select id from public.notification where session_id = any(p_session_ids))
  );
  -- Follow-up requests name their visits in source_session_id / target_session_id.
  delete from public.followup_request
    where source_session_id = any(p_session_ids) or target_session_id = any(p_session_ids);
  get diagnostics n = row_count;
  if n > 0 then
    table_name := 'public.followup_request'; deleted := n; return next;
  end if;
  return query select * from testing._delete_by('session_id', p_session_ids);
  delete from public.session where id = any(p_session_ids);
  get diagnostics n = row_count;
  table_name := 'public.session'; deleted := n; return next;
  table_name := 'storage.objects'; deleted := testing._delete_orphan_objects(v_files); return next;
  set local session_replication_role = origin;
end;
$$;

-- Test parcels with everything under them: sessions and their rows, slots, trees,
-- boundaries, notifications, questions, private details, media objects.
create or replace function testing.purge_parcels(p_parcel_ids uuid[])
returns table (table_name text, deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  set local session_replication_role = replica;
  perform testing._delete_children(
    '{}', '{}', '{}', '{}', '{}',
    array(select id from public.notification where parcel_id = any(p_parcel_ids))
  );
  return query select * from testing._delete_by('parcel_id', p_parcel_ids);
  delete from public.parcel where id = any(p_parcel_ids);
  get diagnostics n = row_count;
  table_name := 'public.parcel'; deleted := n; return next;
  delete from storage.objects
    where bucket_id = 'media' and (storage.foldername(name))[4] = any(p_parcel_ids::text[]);
  get diagnostics n = row_count;
  table_name := 'storage.objects'; deleted := n; return next;
  set local session_replication_role = origin;
end;
$$;

-- A test organisation: its parcels (as purge_parcels), then devices, rigs,
-- memberships, owner profiles, its notifications and media, the org row.
-- Auth users are not deleted (the tests remove theirs with the admin API).
create or replace function testing.purge_org(p_org_id uuid)
returns table (table_name text, deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  return query select * from testing.purge_parcels(
    array(select id from public.parcel where org_id = p_org_id));
  set local session_replication_role = replica;
  perform testing._delete_children(
    '{}', '{}', '{}', '{}', '{}',
    array(select id from public.notification where org_id = p_org_id)
  );
  return query select * from testing._delete_by('org_id', array[p_org_id]);
  delete from public.org where id = p_org_id;
  get diagnostics n = row_count;
  table_name := 'public.org'; deleted := n; return next;
  delete from storage.objects
    where bucket_id = 'media' and (storage.foldername(name))[2] = p_org_id::text;
  get diagnostics n = row_count;
  table_name := 'storage.objects'; deleted := n; return next;
  set local session_replication_role = origin;
end;
$$;

-- Co-owner invitations of the given phones (tests that invite on the seed
-- parcel, which purge_parcels must not touch).
create or replace function testing.purge_viewer_invitations(p_phones text[])
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from private.viewer_invitation where phone = any(p_phones);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Customers of the billing tests (IP12): every row with their id in
-- customer_user_id, user_id or subject_id (applications, quotes, orders,
-- payments, refunds, profiles, consents, pending sign-ups, memberships, parcel
-- access), the rows reached through those (garden details, payment snapshots
-- and events) and the audit rows about them. Run before deleting the auth
-- users: customer_user_id is on delete restrict. Parcels opened for them stay
-- (purge_parcels).
create or replace function testing.purge_billing_users(p_user_ids uuid[])
returns table (table_name text, deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entities uuid[];
  n bigint;
begin
  set local session_replication_role = replica;
  v_entities := p_user_ids || array(
    select id from public.service_application where customer_user_id = any(p_user_ids)
    union all select id from public.application_garden where customer_user_id = any(p_user_ids)
    union all select id from public.quote where customer_user_id = any(p_user_ids)
    union all select id from public.service_order where customer_user_id = any(p_user_ids)
    union all select id from public.payment where customer_user_id = any(p_user_ids)
    union all select id from public.refund where customer_user_id = any(p_user_ids)
    union all select id from private.owner_profile where user_id = any(p_user_ids));
  delete from private.application_garden_detail where application_garden_id = any(v_entities);
  get diagnostics n = row_count;
  if n > 0 then table_name := 'private.application_garden_detail'; deleted := n; return next; end if;
  delete from private.payment_billing_snapshot where payment_id = any(v_entities);
  get diagnostics n = row_count;
  if n > 0 then table_name := 'private.payment_billing_snapshot'; deleted := n; return next; end if;
  delete from private.payment_event where payment_id = any(v_entities) or refund_id = any(v_entities);
  get diagnostics n = row_count;
  if n > 0 then table_name := 'private.payment_event'; deleted := n; return next; end if;
  delete from public.audit_event where actor_user_id = any(p_user_ids) or entity_id = any(v_entities);
  get diagnostics n = row_count;
  if n > 0 then table_name := 'public.audit_event'; deleted := n; return next; end if;
  return query select * from testing._delete_by('customer_user_id', p_user_ids);
  return query select * from testing._delete_by('user_id', p_user_ids);
  return query select * from testing._delete_by('subject_id', p_user_ids);
  set local session_replication_role = origin;
end;
$$;

-- Sign-up attempts (rate limit rows; hashed IPs and phones), so that the
-- sign-up integration tests can run again within the hour.
create or replace function testing.purge_signup_attempts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
begin
  delete from private.signup_attempt where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on all functions in schema testing from public;
grant execute on function
  testing.purge_sessions(uuid[]), testing.purge_parcels(uuid[]), testing.purge_org(uuid),
  testing.purge_viewer_invitations(text[]), testing.purge_billing_users(uuid[]),
  testing.purge_signup_attempts()
  to service_role;
