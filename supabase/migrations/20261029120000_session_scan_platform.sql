-- Scan platform and camera height per visit (docs/metodoloji.md, section 1 and 11).
-- A scan is walked with the backpack pole, ridden on a motorcycle or driven by
-- the robot; the camera height is adjustable, so the crew records the measured
-- height of the lens above the ground at the pre-check. The pipeline projects
-- crops and presence boxes with it; the expert panel compares it with the
-- parcel's earlier scans.

alter table public.session
  add column scan_platform text
    check (scan_platform in ('walk', 'motorcycle', 'robot')),
  add column camera_height_m numeric(4, 2)
    check (camera_height_m between 0.5 and 3.5);

comment on column public.session.scan_platform is
  'How the scan was carried: walk (backpack pole), motorcycle, robot. Null when not a scan or not recorded.';
comment on column public.session.camera_height_m is
  'Measured height of the 360 camera lens above the ground (m), recorded at the pre-check.';
