-- Deterministic synthetic seed for local development (IP1).
-- Not real orchard data. Fixed ids, attributes derived from slot row/position.
--
-- Users (local only, password for all: orchados-dev)
--   owner@example.com        parcel owner
--   viewer@example.com       parcel viewer (co-owner of a shared deed)
--   field@example.com        org field_staff
--   expert@example.com       org expert
--   ops@example.com          org ops
--
-- Parcel: ~20 donum (136 m x 144 m = 19,584 m2) near Gaziantep, rows on an
-- 8 x 8 m grid rotated 15 degrees: 18 rows x 17 positions = 306 row slots,
-- plus 4 interstitial slots (S5-12a ...). 8 row slots have no active tree;
-- one of them keeps a lost tree record.

-- ---------------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('orchados-dev', extensions.gen_salt('bf')), '2026-10-01 00:00:00+00',
  '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('display_name', u.label),
  '2026-10-01 00:00:00+00', '2026-10-01 00:00:00+00', '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'owner@example.com', 'Owner'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'viewer@example.com', 'Viewer'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'field@example.com', 'Field staff'),
  ('a0000000-0000-4000-8000-000000000004'::uuid, 'expert@example.com', 'Expert'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'ops@example.com', 'Ops')
) as u (id, email, label);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id, u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', '2026-10-01 00:00:00+00', '2026-10-01 00:00:00+00', '2026-10-01 00:00:00+00'
from auth.users u
where u.id::text like 'a0000000-0000-4000-8000-%';

-- ---------------------------------------------------------------------------
-- Org, memberships
-- ---------------------------------------------------------------------------

insert into public.org (id, name, kind)
values ('b0000000-0000-4000-8000-000000000001', 'orchadOS Denetim (örnek)', 'service_provider');

insert into public.membership (org_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'field_staff'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'expert'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'ops');

-- ---------------------------------------------------------------------------
-- Parcel geometry helper: parcel-local metres -> WGS84.
-- Local origin at 37.00 N, 37.45 E (south-west corner), x along rows.
-- Computed in UTM zone 37N (EPSG:32637), rows rotated 15 degrees from east
-- (row azimuth 75 degrees).
-- ---------------------------------------------------------------------------

create function pg_temp.local_point(x double precision, y double precision)
returns extensions.geometry
language sql
immutable
as $$
  select extensions.st_transform(
    extensions.st_setsrid(
      extensions.st_makepoint(
        extensions.st_x(o) + x * cos(radians(15.0)) - y * sin(radians(15.0)),
        extensions.st_y(o) + x * sin(radians(15.0)) + y * cos(radians(15.0))
      ),
      32637
    ),
    4326
  )
  from (
    select extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(37.45, 37.00), 4326), 32637) as o
  ) as origin;
$$;

create function pg_temp.local_rect(x0 double precision, y0 double precision, x1 double precision, y1 double precision)
returns extensions.geometry
language sql
immutable
as $$
  select extensions.st_makepolygon(extensions.st_makeline(array[
    pg_temp.local_point(x0, y0), pg_temp.local_point(x1, y0),
    pg_temp.local_point(x1, y1), pg_temp.local_point(x0, y1),
    pg_temp.local_point(x0, y0)
  ]));
$$;

-- ---------------------------------------------------------------------------
-- Parcel, access, private details
-- ---------------------------------------------------------------------------

insert into public.parcel (
  id, org_id, name, province, district, village, estimated_area_m2, irrigation, estimated_tree_count,
  status, position, position_uncertainty_m, numbering_origin_corner, row_azimuth_deg,
  local_origin, local_origin_uncertainty_m
)
values (
  'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'Örnek Bahçe 1', 'Gaziantep', 'Şahinbey', 'Örnek Köyü', 20000, 'irrigated', 300,
  'inventory_done', pg_temp.local_point(68, 72), 50, 'sw', 75,
  pg_temp.local_point(0, 0), 0.05
);

insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'owner', 'a0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002', 'viewer', 'a0000000-0000-4000-8000-000000000001');

insert into private.owner_profile (
  org_id, user_id, full_name, phone, email, contact_preference, kvkk_consent, kvkk_consent_at, kvkk_text_version
) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Örnek Sahip', '+905550000001', 'owner@example.com', 'whatsapp', true, '2026-10-01 09:00:00+00', 'kvkk-v0'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'Örnek Hissedar', '+905550000002', 'viewer@example.com', 'sms', true, '2026-10-02 09:00:00+00', 'kvkk-v0');

insert into private.parcel_detail (
  parcel_id, org_id, deed_block, deed_parcel, is_shared_deed, used_portion_note,
  authorization_basis, entry_permission_at, access_note, site_contact_name, site_contact_phone
) values (
  'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  '101', '7', true, 'Rızai taksimle kuzey bölüm',
  'title_holder', '2026-10-01 09:00:00+00', 'Köy yolundan girilir, kapı anahtarı bekçide.',
  'Örnek Bekçi', '+905550000099'
);

-- ---------------------------------------------------------------------------
-- Kit: one human scan kit with a 360 camera and a GNSS logger.
-- ---------------------------------------------------------------------------

insert into public.device (id, org_id, kind, name, manufacturer, model, serial_number, firmware_version) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'human_kit', 'Kit 1', 'orchadOS', 'scan-kit-v0', 'KIT-0001', '0.1.0');

insert into public.sensor (id, org_id, device_id, kind, manufacturer, model, serial_number) values
  ('d1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'camera_360', 'Example', '360-cam', 'CAM-0001'),
  ('d1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000001', 'gnss', 'Example', 'gnss-logger', 'GNSS-0001');

insert into public.rig (id, org_id, name, description) values
  ('d2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Kit 1 pole', '360 camera and GNSS antenna on the same pole');

insert into public.rig_sensor (org_id, rig_id, sensor_id, mount) values
  ('b0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001', '{"lever_arm_m": [0, 0, -0.15]}'),
  ('b0000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000002', '{"lever_arm_m": [0, 0, 0]}');

insert into public.calibration (id, org_id, rig_id, sensor_id, version, extrinsics, valid_from) values
  ('d3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'd2000000-0000-4000-8000-000000000001', null, 'v1', '{"camera_to_antenna_m": [0, 0, 0.15]}',
   '2026-10-01 00:00:00+00');

-- ---------------------------------------------------------------------------
-- Inventory session
-- ---------------------------------------------------------------------------

insert into public.session (
  id, org_id, parcel_id, kind, performer, status, planned_date, started_at, ended_at,
  methodology_version, rig_id, lead_user_id, weather, notes, created_by
) values (
  'e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'inventory', 'crew', 'in_review', '2026-10-10',
  '2026-10-10 06:30:00+00', '2026-10-10 09:00:00+00', 'methodology-v0',
  'd2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003',
  '{"sky": "clear", "temp_c": 18, "wind": "light"}', 'Synthetic inventory session.',
  'a0000000-0000-4000-8000-000000000005'
);

-- ---------------------------------------------------------------------------
-- Boundary: v1 owner-declared (rough), v2 field survey (approved by owner).
-- ---------------------------------------------------------------------------

insert into public.boundary (
  id, org_id, parcel_id, version, geom, source, vertex_uncertainty_m, session_id, surveyed_at,
  owner_approved_at, owner_approved_by, created_by
) values
  ('c1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 1, pg_temp.local_rect(-3, -2, 139, 147), 'owner_declared', 10,
   null, null, null, null, 'a0000000-0000-4000-8000-000000000005'),
  ('c1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 2, pg_temp.local_rect(0, 0, 136, 144), 'field_survey', 0.05,
   'e0000000-0000-4000-8000-000000000001', '2026-10-10 06:45:00+00',
   '2026-10-12 18:00:00+00', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------------------
-- Slots: 18 rows x 17 positions on an 8 x 8 m grid + 4 interstitial slots.
-- Interstitial trees sit half way to the next position in the same row.
-- ---------------------------------------------------------------------------

insert into public.slot (
  id, org_id, parcel_id, row_no, position_no, suffix, kind, position, position_uncertainty_m, local_x_m, local_y_m
)
select
  md5('orchados-seed:slot:' || g.code)::uuid,
  'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  g.r, g.p, g.suffix, g.kind,
  pg_temp.local_point(g.x, g.y),
  0.15 + ((g.r * 31 + g.p * 17) % 7) * 0.05,
  g.x, g.y
from (
  select r, p, null::text as suffix, 'row'::public.slot_kind as kind,
         4 + (p - 1) * 8.0 as x, 4 + (r - 1) * 8.0 as y, 'S' || r || '-' || p as code
  from generate_series(1, 18) as r, generate_series(1, 17) as p
  union all
  select r, p, 'a', 'interstitial'::public.slot_kind,
         8 + (p - 1) * 8.0, 4 + (r - 1) * 8.0, 'S' || r || '-' || p || 'a'
  from (values (5, 12), (9, 3), (14, 8), (17, 15)) as v (r, p)
) as g;

-- ---------------------------------------------------------------------------
-- Trees. Empty slots: S2-7, S4-15, S7-1, S8-9 (lost tree kept), S11-11, S12-4,
-- S15-16, S18-6. Attributes derived from h = (row * 31 + position * 17) % 100.
-- ---------------------------------------------------------------------------

insert into public.tree (
  id, org_id, parcel_id, slot_id, sex, graft, age_class, cultivar, status,
  first_seen_at, first_seen_session_id, lost_at
)
select
  md5('orchados-seed:tree:' || s.code)::uuid,
  s.org_id, s.parcel_id, s.id,
  case
    when (s.row_no * 7 + s.position_no * 3) % 11 = 0 then 'male'
    when s.h < 12 then 'female'
    else 'unknown'
  end::public.tree_sex,
  case
    when s.kind = 'interstitial' then 'ungrafted'
    when s.h % 23 = 0 then 'ungrafted'
    when s.h % 17 = 0 then 'unknown'
    else 'grafted'
  end::public.graft_status,
  case
    when s.kind = 'interstitial' then 'sapling'
    when s.h = 50 then 'unknown'
    when s.h >= 93 then 'old'
    when s.h >= 80 then 'young'
    when s.h < 3 then 'sapling'
    else 'productive'
  end::public.age_class,
  case
    when (s.row_no * 7 + s.position_no * 3) % 11 = 0 then null
    when s.h % 5 = 0 then 'Uzun'
    when s.h % 7 = 0 then 'Siirt'
    else 'Kırmızı'
  end,
  case when s.code = 'S8-9' then 'lost' else 'active' end::public.tree_status,
  '2026-10-10 07:00:00+00', 'e0000000-0000-4000-8000-000000000001',
  case when s.code = 'S8-9' then '2026-10-10 07:00:00+00'::timestamptz end
from (
  select sl.*, (sl.row_no * 31 + sl.position_no * 17) % 100 as h
  from public.slot as sl
  where sl.parcel_id = 'c0000000-0000-4000-8000-000000000001'
) as s
where s.code not in ('S2-7', 'S4-15', 'S7-1', 'S11-11', 'S12-4', 'S15-16', 'S18-6');

-- ---------------------------------------------------------------------------
-- Zones: gate (entry point) and well.
-- ---------------------------------------------------------------------------

insert into public.zone (id, org_id, parcel_id, kind, name, geom, position_uncertainty_m) values
  ('c2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'gate', 'Ana kapı', pg_temp.local_point(0, 2), 0.05),
  ('c2000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000001', 'well', 'Kuyu', pg_temp.local_point(134, 140), 0.05);

-- ---------------------------------------------------------------------------
-- Metric registry: reference data, created by migration 20261021180000.
-- ---------------------------------------------------------------------------
