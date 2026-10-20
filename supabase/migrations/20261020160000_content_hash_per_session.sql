-- Content hashes are unique per session (capture) and per session + pipeline
-- version (asset), not per org.
--
-- capture: the same raw file can belong to several sessions, e.g. one base
--   station RINEX file used for every parcel scanned that day. Lineage rows
--   point to a capture of the same parcel, so each session registers its own row.
-- asset: reprocessing with a new pipeline version adds new rows and keeps the
--   old ones ("Ölçümler sürümlüdür"). An unchanged algorithm often yields
--   byte-identical files (panoramas, crops); the new version still gets its own
--   row. The uploader finds an asset by session + content_hash + pipeline_version.
--
-- Objects in the media bucket stay one per (org, parcel, hash): rows with the
-- same hash share the file. The media_select policy looks rows up by
-- (org_id, content_hash); the indexes below keep that an index scan.

alter table public.capture drop constraint capture_org_id_content_hash_key;
alter table public.capture
  add constraint capture_session_id_content_hash_key unique (session_id, content_hash);
create index capture_org_id_content_hash_idx on public.capture (org_id, content_hash);

alter table public.asset drop constraint asset_org_id_content_hash_key;
alter table public.asset
  add constraint asset_session_id_content_hash_pipeline_version_key
  unique (session_id, content_hash, pipeline_version);
create index asset_org_id_content_hash_idx on public.asset (org_id, content_hash);
