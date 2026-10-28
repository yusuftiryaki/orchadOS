-- Legal follow-ups wave 2: review fixes of PR #97.
--
-- 1. Append-only tables vs. deleting a user: media_suppression.created_by,
--    boundary_approval.user_id and boundary_dispute.created_by are
--    "on delete set null", but their append-only triggers refused the UPDATE
--    that the foreign key action runs, so deleting the auth user failed. They
--    now use private.insert_only_unlink_user like audit_event and
--    consent_record: only that one column may be nulled, nothing else changes.
--    (Deleting an org or parcel stays refused: capture and asset already
--    forbid it, and these records must outlive neither.)
-- 2. Staff GNSS (H05). Parcel readers (owner, co-owner, viewer, demo visitor)
--    could still read asset.pose (pose.gps_time_ns is the capture time of each
--    panorama) and capture.position/started_at, enough to rebuild the crew's
--    time-stamped path. Now:
--    - Parcel readers no longer read panorama asset rows. The tour gets its
--      viewpoints from public.portal_panorama_frames: one row per frame with
--      its full and preview asset ids, position and heading, paired on the
--      server, with no time, no frame key and no order beyond the asset id.
--    - Parcel readers no longer read capture rows (started_at, position and
--      metadata.gps_time_ns / phone_time are the time and place of each
--      close-up). The tree card gets close-ups from public.portal_closeups:
--      id, visit, tree, file and the staff member, nothing else.
--    - The media bucket lets them sign those files through
--      authz.parcel_reader_media_object (the hidden-media policy still
--      applies). Staff (org members) read both tables as before: the office
--      tool, the expert panel, the pipeline, the AI worker and the field app
--      are unchanged.
--    Crops keep their pose (direction, panorama id, angles: no time) and the
--    camera position, a discrete viewpoint like a panorama's.
-- 3. private.staff_profile is keyed by (org_id, user_id): ops of one org can
--    no longer rename a member of another org on that org's reports.
--    visit_approver reads the profile of the visit's org.
-- 4. auth-session-purge deletes only sessions that have ended (not_after more
--    than 30 days ago). Idle sessions stay: a seasonal owner is not logged
--    out (T09: "sona ermiş oturumlar").
-- 5. Demo media: the demo org's files are also in the public demo-media
--    bucket (docs/demo-turu.md §11.6), which the hidden-media policies do not
--    cover. Hiding a demo-org target whose public copy still exists is
--    refused (demo_mirror_public); ops removes the copy first.
-- 6. KVKK requests: answered and rejected are final. settled_at (start of the
--    10-year register retention) is set once and never reset.
-- 7. First-login KVKK notice: also due in orgs where the user has an owner
--    profile but no parcel yet (an ops-opened customer).

-- ---------------------------------------------------------------------------
-- 1. Append-only tables: unlink a deleted user
-- ---------------------------------------------------------------------------

drop trigger media_suppression_append_only on private.media_suppression;
create trigger media_suppression_append_only
before update or delete on private.media_suppression
for each row execute function private.insert_only_unlink_user('created_by');
drop function private.media_suppression_append_only();

drop trigger boundary_approval_append_only on private.boundary_approval;
create trigger boundary_approval_append_only
before update or delete on private.boundary_approval
for each row execute function private.insert_only_unlink_user('user_id');

drop trigger boundary_dispute_append_only on private.boundary_dispute;
create trigger boundary_dispute_append_only
before update or delete on private.boundary_dispute
for each row execute function private.insert_only_unlink_user('created_by');

-- ---------------------------------------------------------------------------
-- 2. Staff GNSS
-- ---------------------------------------------------------------------------

drop policy asset_parcel_reader_kinds on public.asset;
create policy asset_parcel_reader_kinds on public.asset as restrictive for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or kind in ('tree_crop', 'photo')
  );
comment on policy asset_parcel_reader_kinds on public.asset is
  'T23 (H05): parcel readers read crops and photos only; panoramas through portal_panorama_frames (no capture time), trajectories and point clouds never.';

drop policy capture_parcel_reader_kinds on public.capture;
create policy capture_parcel_reader_kinds on public.capture as restrictive for select to authenticated
  using (org_id in (select authz.user_org_ids()));
comment on policy capture_parcel_reader_kinds on public.capture is
  'T23 (H05): staff only; parcel readers get close-ups through portal_closeups (no capture time or position).';

-- Panorama frames of the given visits the caller may read: org members (the
-- hidden ones only for ops and field staff), parcel readers of published
-- visits (not hidden). Full and preview rows of a frame share
-- pose.gps_time_ns, else the position; neither leaves the function.
create function public.portal_panorama_frames(p_session_ids uuid[])
returns table (
  session_id uuid, full_asset_id uuid, full_uri text, preview_asset_id uuid, preview_uri text,
  viewpoint jsonb, heading_deg double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select a.id, a.session_id, a.uri, a.position, a.pose,
           coalesce(a.pose ->> 'variant', 'full') = 'preview' as is_preview,
           coalesce(a.pose ->> 'gps_time_ns', 'p:' || extensions.st_astext(a.position)) as frame
    from public.asset a
    where a.kind = 'panorama'
      and a.position is not null
      and a.session_id = any (p_session_ids)
      and (a.org_id in (select authz.user_org_ids())
           or a.session_id in (select authz.user_published_session_ids()))
      and (a.org_id in (select authz.user_org_ids('{ops,field_staff}'))
           or a.id not in (select authz.hidden_asset_ids()))
  ),
  frames as (
    select v.session_id,
           (array_agg(v.id order by v.id) filter (where not v.is_preview))[1] as full_id,
           (array_agg(v.id order by v.id) filter (where v.is_preview))[1] as preview_id
    from visible v
    group by v.session_id, v.frame
  )
  select f.session_id, f.full_id, fa.uri, f.preview_id, pa.uri,
         extensions.st_asgeojson(coalesce(fa.position, pa.position))::jsonb,
         coalesce(
           case when jsonb_typeof(fa.pose -> 'heading_deg') = 'number' then (fa.pose ->> 'heading_deg')::float8 end,
           case when jsonb_typeof(pa.pose -> 'heading_deg') = 'number' then (pa.pose ->> 'heading_deg')::float8 end)
  from frames f
  left join visible fa on fa.id = f.full_id
  left join visible pa on pa.id = f.preview_id
  order by coalesce(f.full_id, f.preview_id);
$$;
comment on function public.portal_panorama_frames(uuid[]) is
  'T23 (H05): panorama viewpoints of the given visits, one row per frame (full and preview paired), without capture time.';
revoke all on function public.portal_panorama_frames(uuid[]) from public, anon;
grant execute on function public.portal_panorama_frames(uuid[]) to authenticated;

-- Close-up photos of trees in the given visits (optionally one tree), for the
-- same readers as portal_panorama_frames; no time, no position, no metadata.
create function public.portal_closeups(p_session_ids uuid[], p_tree_id uuid default null)
returns table (id uuid, session_id uuid, tree_id uuid, uri text, content_hash text, captured_by uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.session_id, c.tree_id, c.uri, c.content_hash, c.captured_by
  from public.capture c
  where c.kind = 'photo'
    and c.tree_id is not null
    and (p_tree_id is null or c.tree_id = p_tree_id)
    and c.session_id = any (p_session_ids)
    and (c.org_id in (select authz.user_org_ids())
         or c.session_id in (select authz.user_published_session_ids()))
    and (c.org_id in (select authz.user_org_ids('{ops,field_staff}'))
         or c.id not in (select authz.hidden_capture_ids()))
  order by c.id;
$$;
comment on function public.portal_closeups(uuid[], uuid) is
  'T23 (H05): close-up photos of trees in the given visits, without capture time, position or metadata.';
revoke all on function public.portal_closeups(uuid[], uuid) from public, anon;
grant execute on function public.portal_closeups(uuid[], uuid) to authenticated;

-- A parcel reader may sign a panorama or close-up file of a published visit;
-- the rows themselves are not readable to them (media_select looks rows up
-- under the caller's row level security).
create function authz.parcel_reader_media_object(p_org_id uuid, p_parcel_id uuid, p_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.asset a
    where a.org_id = p_org_id and a.content_hash = p_hash and a.parcel_id = p_parcel_id
      and a.kind = 'panorama'
      and a.session_id in (select authz.user_published_session_ids())
  ) or exists (
    select 1 from public.capture c
    where c.org_id = p_org_id and c.content_hash = p_hash and c.parcel_id = p_parcel_id
      and c.kind = 'photo' and c.tree_id is not null
      and c.session_id in (select authz.user_published_session_ids())
  );
$$;
revoke all on function authz.parcel_reader_media_object(uuid, uuid, text) from public, anon;
grant execute on function authz.parcel_reader_media_object(uuid, uuid, text) to authenticated, service_role;

-- As in 20261019120400_media_storage.sql, plus the panorama and close-up branch.
drop policy media_select on storage.objects;
create policy media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (
      authz.uuid_or_null((storage.foldername(objects.name))[2]) in (select authz.user_org_ids())
      -- (org_id, content_hash) is unique on both tables, so these are index lookups.
      or exists (
        select 1 from public.asset a
        where a.org_id = authz.uuid_or_null((storage.foldername(objects.name))[2])
          and a.content_hash = storage.filename(objects.name)
          and a.parcel_id = authz.uuid_or_null((storage.foldername(objects.name))[4])
      )
      or exists (
        select 1 from public.capture c
        where c.org_id = authz.uuid_or_null((storage.foldername(objects.name))[2])
          and c.content_hash = storage.filename(objects.name)
          and c.parcel_id = authz.uuid_or_null((storage.foldername(objects.name))[4])
      )
      or authz.parcel_reader_media_object(authz.uuid_or_null((storage.foldername(objects.name))[2]),
                                          authz.uuid_or_null((storage.foldername(objects.name))[4]),
                                          storage.filename(objects.name))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Staff profile per org
-- ---------------------------------------------------------------------------

alter table private.staff_profile drop constraint staff_profile_pkey;
alter table private.staff_profile add column org_id uuid references public.org (id) on delete cascade;
-- A profile saved before this migration applies in every org of the user.
insert into private.staff_profile (org_id, user_id, full_name, title, updated_at, updated_by)
select distinct m.org_id, sp.user_id, sp.full_name, sp.title, sp.updated_at, sp.updated_by
from private.staff_profile sp
join public.membership m on m.user_id = sp.user_id
where sp.org_id is null;
delete from private.staff_profile where org_id is null;
alter table private.staff_profile alter column org_id set not null;
alter table private.staff_profile add primary key (org_id, user_id);
comment on table private.staff_profile is
  'Staff display name and title per org (H05: the approving expert is named on the report). Edited by ops of that org.';

-- As in 20261104100100, joined on the org.
create or replace function public.ops_staff(p_org_id uuid)
returns table (user_id uuid, roles text[], email text, full_name text, title text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  return query
  select m.user_id,
         array_agg(m.role::text order by m.role::text),
         u.email::text,
         sp.full_name,
         sp.title,
         sp.updated_at
  from public.membership m
  join auth.users u on u.id = m.user_id
  left join private.staff_profile sp on sp.org_id = m.org_id and sp.user_id = m.user_id
  where m.org_id = p_org_id
  group by m.user_id, u.email, sp.full_name, sp.title, sp.updated_at
  order by sp.full_name nulls last, u.email;
end;
$$;

create or replace function public.ops_save_staff_profile(p_org_id uuid, p_user_id uuid, p_full_name text, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), '');
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
begin
  perform private.require_ops(p_org_id);
  perform private.assert_not_demo();
  if not exists (select 1 from public.membership m where m.org_id = p_org_id and m.user_id = p_user_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if v_title is not null and char_length(v_title) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'title';
  end if;
  insert into private.staff_profile (org_id, user_id, full_name, title, updated_at, updated_by)
  values (p_org_id, p_user_id, v_name, v_title, now(), (select auth.uid()))
  on conflict (org_id, user_id) do update
    set full_name = excluded.full_name, title = excluded.title,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'staff_profile.saved', 'staff_profile', p_user_id,
    jsonb_build_object('has_title', v_title is not null));
end;
$$;

create or replace function public.visit_approver(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', sp.full_name, 'title', sp.title)
  from public.session s
  join private.staff_profile sp on sp.org_id = s.org_id and sp.user_id = s.published_by
  where s.id = p_session_id
    and s.status = 'published'
    and not private.is_demo_org(s.org_id)
    and (
      s.org_id in (select authz.user_org_ids())
      or s.id in (select authz.user_published_session_ids())
    );
$$;

-- ---------------------------------------------------------------------------
-- 4. Auth sessions: ended ones only
-- ---------------------------------------------------------------------------

create or replace function private.purge_auth_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.sessions s
  where s.not_after is not null and s.not_after < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
exception
  when insufficient_privilege or undefined_table or undefined_column then
    raise warning 'purge_auth_sessions: skipped (%)', sqlstate;
    return null;
end;
$$;
comment on function private.purge_auth_sessions() is
  'T09 (pg_cron auth-session-purge): deletes GoTrue sessions that ended (not_after) more than 30 days ago; idle sessions stay. Null without privilege.';

-- ---------------------------------------------------------------------------
-- 5. Demo media: no public copy of a hidden file
-- ---------------------------------------------------------------------------

-- After a hide record of a demo org: every hidden file of that org (with the
-- other variant and the crops a panorama takes along) must be gone from
-- demo-media, the public bucket with the same object names.
create function private.media_suppression_demo_mirror()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.action = 'hide' and private.is_demo_org(new.org_id) and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'demo-media'
      and o.name in (
        select substr(a.uri, char_length('storage://media/') + 1) from public.asset a
        where a.org_id = new.org_id and a.uri like 'storage://media/%'
          and a.id in (select authz.hidden_asset_ids())
        union all
        select substr(c.uri, char_length('storage://media/') + 1) from public.capture c
        where c.org_id = new.org_id and c.uri like 'storage://media/%'
          and c.id in (select authz.hidden_capture_ids())
      )
  ) then
    raise exception 'demo_mirror_public' using errcode = 'P0001',
      hint = 'Remove the file''s copy from the demo-media bucket first (docs/veri-modeli.md, T20).';
  end if;
  return null;
end;
$$;
revoke all on function private.media_suppression_demo_mirror() from public;
create trigger media_suppression_demo_mirror
after insert on private.media_suppression
for each row execute function private.media_suppression_demo_mirror();

-- ---------------------------------------------------------------------------
-- 6. KVKK requests: settled is final
-- ---------------------------------------------------------------------------

-- As in 20261104100700; answered and rejected accept no further change.
create or replace function public.ops_set_kvkk_request_status(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.kvkk_request;
begin
  perform private.assert_not_demo();
  select * into r from private.kvkk_request x where x.id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(r.org_id);
  if p_status is null or p_status not in ('open', 'in_progress', 'answered', 'rejected') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  if p_status = r.status then
    return;
  end if;
  if r.settled_at is not null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'settled';
  end if;
  update private.kvkk_request
  set status = p_status,
      settled_at = case when p_status in ('answered', 'rejected') then now() end,
      updated_at = now()
  where id = r.id;
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'kvkk_request.status_changed', 'kvkk_request', r.id,
    jsonb_build_object('from', r.status, 'to', p_status, 'overdue', r.due_at < now()));
end;
$$;
comment on function public.ops_set_kvkk_request_status(uuid, text) is
  'T11: ops moves a KVKK request open → in_progress → answered or rejected; a settled request is final (invalid_input).';

-- ---------------------------------------------------------------------------
-- 7. First-login notice: owner profile without a parcel
-- ---------------------------------------------------------------------------

-- As in 20261104100410, over the orgs of the user's parcels and owner profiles.
create or replace function private.notice_due_orgs(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select x.org_id
  from (
    select pa.org_id from public.parcel_access pa where pa.user_id = p_user_id
    union
    select op.org_id from private.owner_profile op where op.user_id = p_user_id
  ) x
  where not private.is_demo_org(x.org_id)
    and (private.billing_setting(x.org_id)).coowner_notice_flow_enabled
    and (
      exists (select 1 from private.owner_profile op where op.org_id = x.org_id and op.user_id = p_user_id)
      or exists (select 1 from private.viewer_invitation vi
                 where vi.org_id = x.org_id and vi.user_id = p_user_id and vi.status = 'approved')
    )
    and not exists (
      select 1 from private.consent_record cr
      where cr.org_id = x.org_id and cr.user_id = p_user_id and cr.kind = 'kvkk_notice' and cr.granted
        and cr.source in ('signup', 'portal', 'quote_acceptance')
    );
$$;
