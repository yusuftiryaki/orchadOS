-- İP17 3D world (docs/3d-dunya.md): the coloured, thinned point cloud the
-- portal tour shows (docs/arayuzler.md, "3D dünya bulutu"). A kind of its own,
-- so the staff-only raw point_cloud stays staff only. The enum value is added
-- in its own migration: a new value cannot be used in the transaction that
-- adds it (policies and functions in 20261107500100).
alter type public.asset_kind add value if not exists 'world_cloud';
