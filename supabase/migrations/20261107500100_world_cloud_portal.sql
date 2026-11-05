-- İP17 3D world (docs/3d-dunya.md): parcel readers (owner, viewer, demo
-- visitor) read the world cloud of a published visit and sign its file.
--
-- Owner decision (5 Kasım 2026, docs/3d-dunya.md §2): the coloured, thinned
-- cloud is shown to the owner. It carries no capture time, no trajectory and
-- no frame order (docs/arayuzler.md, "3D dünya bulutu"), so the staff-track
-- rule of T23 (H05) still holds: the raw point_cloud, trajectories and GNSS
-- logs stay staff only.
--
-- 1. asset_parcel_reader_kinds (20261104100800) also lets world_cloud rows
--    through; asset_select still limits parcel readers to published visits
--    and asset_not_hidden to media that are not hidden. Panoramas stay out
--    (portal_panorama_frames, no capture time).
-- 2. authz.parcel_reader_media_object (20261104100800) signs the world cloud
--    file of a published visit.
-- 3. private.media_target (20261104100300): ops can hide a world cloud like a
--    panorama (T20, H01).
-- No new table; the asset table already has its demo guard.

-- 1. Rows ------------------------------------------------------------------------------

drop policy asset_parcel_reader_kinds on public.asset;
create policy asset_parcel_reader_kinds on public.asset as restrictive for select to authenticated
  using (
    org_id in (select authz.user_org_ids())
    or kind in ('tree_crop', 'photo', 'world_cloud')
  );
comment on policy asset_parcel_reader_kinds on public.asset is
  'T23 (H05), İP17: parcel readers read crops, photos and the timeless 3D world cloud; panoramas through portal_panorama_frames (no capture time), trajectories and raw point clouds never.';

-- 2. Files ------------------------------------------------------------------------------

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
  ) or exists (
    select 1 from public.capture c
    where c.org_id = p_org_id and c.content_hash = p_hash and c.parcel_id = p_parcel_id
      and c.kind = 'photo' and c.tree_id is not null
      and c.session_id in (select authz.user_published_session_ids())
  );
$$;

-- 3. Hiding -----------------------------------------------------------------------------

create or replace function private.media_target(p_id uuid)
returns table (target_table text, org_id uuid, parcel_id uuid, session_id uuid, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'asset', a.org_id, a.parcel_id, a.session_id, a.kind::text
  from public.asset a where a.id = p_id and a.kind in ('panorama', 'tree_crop', 'photo', 'world_cloud')
  union all
  select 'capture', c.org_id, c.parcel_id, c.session_id, c.kind::text
  from public.capture c where c.id = p_id and c.kind = 'photo'
$$;
