-- Scan platforms (docs/tarama-kiti.md, "Montaj ve yükseklikler"; owner, 2026-11-20).
-- Scans are no longer ridden on a motorcycle: the kit goes on the robot, on a
-- hand-pulled cart (walk) or on an ATV. 'atv' is new. 'motorcycle' stays
-- allowed so that older visits keep their value and can still be updated; the
-- field app no longer offers it.

alter table public.session
  drop constraint session_scan_platform_check;

alter table public.session
  add constraint session_scan_platform_check
    check (scan_platform in ('walk', 'atv', 'robot', 'motorcycle'));

comment on column public.session.scan_platform is
  'How the scan was carried: walk (hand-pulled cart; backpack pole on older visits), atv, robot; motorcycle only on visits before 2026-11-20. Null when not a scan or not recorded.';
