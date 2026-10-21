-- Inventory in the field (IP6): structured details on session events.
--
-- The field app now records the boundary walk and the scan coverage as
-- session events (docs/arayuzler.md, "Sınır köşeleri ve kapsama"):
--   corner           a corner press: number, GPS time, logger position and quality
--   boundary_corners the crew's corner list after an edit: order, deleted corners,
--                    note, boundary markers and photos (the newest one counts)
--   coverage         share of the slots passed near during a scan
-- The details go to a new jsonb column. The table stays insert-only: an edit
-- is a new event, never an update. The pipeline re-positions the corners from
-- the PPK trajectory by their GPS time and the office or the pipeline writes
-- the boundary version; the app never writes public.boundary.

alter table public.session_event
  add column data jsonb
    check (data is null or (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144));

comment on column public.session_event.data is
  'Event details as a JSON object (corner position and quality, boundary edits, coverage); null when none. See docs/arayuzler.md.';
