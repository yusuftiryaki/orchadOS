-- Demo scan data for local development (wave 4: expert panel, owner portal).
-- Not part of `pnpm db:reset`: tests count seed rows. Load on demand:
--   pnpm db:reset && pnpm db:demo
-- Builds on supabase/seed.sql (same org, parcel, trees, metrics). Not real data.
--
-- Two periodic scans of "Örnek Bahçe 1":
--   e1..01  2026-10-14  published   expert assessments (approved), findings
--   e1..02  2026-10-18  in_review   AI pre-assessments waiting for the expert
-- Each scan: one 360 video + GNSS capture, panoramas every 8 m along 19 aisles
-- (a full 4K and a 2K preview row each), two tree crops (N, S) per active tree,
-- a dead-branch measurement and an assessment per tree. Asset rows follow the
-- pipeline's upload (docs/arayuzler.md, "Asset pose alanı"): WebP panoramas,
-- JPEG crops, pose fields with variant, gps_time_ns, pixel size, the crop's
-- panorama and viewing angles. Storage objects are NOT created: rows point to
-- storage://media/... names that do not exist, so the UI must show a
-- placeholder when a file is missing. Real files come from the pipeline upload.
--
-- Hosted test project: run it after the data part of seed.sql, in the same SQL
-- editor session or another one. The pg_temp helpers are created with
-- `create or replace`, and people are looked up by their org role
-- (membership), so the seed's local user ids are not needed.

begin;

-- Same helper as seed.sql (pg_temp functions do not survive across sessions).
create or replace function pg_temp.local_point(x double precision, y double precision)
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

create or replace function pg_temp.sha(t text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to('orchados-demo:' || t, 'UTF8')), 'hex') $$;

create or replace function pg_temp.uri(hash text)
returns text
language sql
immutable
as $$
  select 'storage://media/org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/' || hash
$$;

-- GPS time in ns as text (docs/arayuzler.md, "Zaman"): GPS epoch 1980-01-06, GPS - UTC = 18 s.
create or replace function pg_temp.gps_ns(t timestamptz)
returns text
language sql
immutable
as $$ select ((extract(epoch from t) - 315964800 + 18) * 1000000000)::bigint::text $$;

-- First member of the demo org with this role (null when there is none).
create or replace function pg_temp.member(r public.org_role)
returns uuid
language sql
stable
as $$
  select m.user_id from public.membership m
  where m.org_id = 'b0000000-0000-4000-8000-000000000001' and m.role = r
  order by m.user_id
  limit 1
$$;

create temp table demo_scan (id uuid, n int, status public.session_status, day date) on commit drop;
insert into demo_scan values
  ('e1000000-0000-4000-8000-000000000001', 1, 'published', '2026-10-14'),
  ('e1000000-0000-4000-8000-000000000002', 2, 'in_review', '2026-10-18');

-- Active trees with their parcel-local position and a per-scan class hash.
create temp table demo_tree on commit drop as
select t.id as tree_id, s.row_no, s.position_no, s.suffix, s.local_x_m as x, s.local_y_m as y,
       'S' || s.row_no || '-' || s.position_no || coalesce(s.suffix, '') as code
from public.tree as t
join public.slot as s on s.id = t.slot_id
where t.parcel_id = 'c0000000-0000-4000-8000-000000000001' and t.status = 'active';

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

insert into public.session (
  id, org_id, parcel_id, kind, performer, status, planned_date, started_at, ended_at,
  methodology_version, rig_id, lead_user_id, weather, notes, created_by, published_at, published_by
)
select d.id, 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       'periodic_scan', 'crew', d.status, d.day,
       (d.day + time '06:30') at time zone 'UTC', (d.day + time '09:15') at time zone 'UTC',
       'methodology-v0', 'd2000000-0000-4000-8000-000000000001', pg_temp.member('field_staff'),
       '{"sky": "clear", "temp_c": 16, "wind": "light"}', 'Demo periodic scan ' || d.n || '.',
       pg_temp.member('ops'),
       -- Signed by the expert in the evening of the published scan.
       case when d.status = 'published' then (d.day + time '18:00') at time zone 'UTC' end,
       case when d.status = 'published' then pg_temp.member('expert') end
from demo_scan as d;

-- ---------------------------------------------------------------------------
-- Captures: 360 video and raw GNSS
-- ---------------------------------------------------------------------------

insert into public.capture (
  id, org_id, parcel_id, session_id, kind, rig_id, sensor_id, calibration_id,
  uri, content_hash, byte_size, mime_type, started_at, ended_at, captured_by, metadata
)
select md5('orchados-demo:capture:' || d.n || ':' || c.kind)::uuid,
       'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', d.id,
       c.kind::public.capture_kind, 'd2000000-0000-4000-8000-000000000001', c.sensor::uuid,
       'd3000000-0000-4000-8000-000000000001',
       pg_temp.uri(pg_temp.sha('capture:' || d.n || ':' || c.kind)), pg_temp.sha('capture:' || d.n || ':' || c.kind),
       c.bytes, c.mime,
       (d.day + time '06:35') at time zone 'UTC', (d.day + time '09:10') at time zone 'UTC',
       pg_temp.member('field_staff'), '{"demo": true}'
from demo_scan as d
cross join (values
  ('video_360', 'd1000000-0000-4000-8000-000000000001', 21474836480, 'video/mp4'),
  ('gnss_raw', 'd1000000-0000-4000-8000-000000000002', 52428800, 'application/octet-stream')
) as c (kind, sensor, bytes, mime);

-- ---------------------------------------------------------------------------
-- Panoramas: aisles y = 0, 8, ..., 144; every 8 m from x = 4 to 132.
-- Even aisles driven east (heading 75), odd aisles west (heading 255), one
-- frame every 4 s from 06:35. Each panorama is a full row (4K) and a preview
-- row (2K) with the same gps_time_ns, like the pipeline upload with --only
-- panorama,preview,tree_crop.
-- ---------------------------------------------------------------------------

create temp table demo_pano on commit drop as
select d.id as session_id, d.n, d.day, a.a, p.p,
       md5('orchados-demo:pano:' || d.n || ':' || a.a || ':' || p.p)::uuid as id,
       md5('orchados-demo:preview:' || d.n || ':' || a.a || ':' || p.p)::uuid as preview_id,
       4 + p.p * 8.0 as x, a.a * 8.0 as y,
       case when a.a % 2 = 0 then 75 else 255 end as heading,
       0.6 + ((a.a * 13 + p.p * 7) % 40) / 100.0 as quality,
       pg_temp.gps_ns((d.day + time '06:35') at time zone 'UTC'
                      + make_interval(secs => 4 * (a.a * 17 + case when a.a % 2 = 0 then p.p else 16 - p.p end)))
         as gps_time_ns
from demo_scan as d, generate_series(0, 18) as a (a), generate_series(0, 16) as p (p);

insert into public.asset (
  id, org_id, parcel_id, session_id, kind, uri, content_hash, byte_size, mime_type,
  position, position_uncertainty_m, pose, quality_score, pipeline, pipeline_version, params_hash, produced_at
)
select v.id,
       'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pn.session_id, 'panorama',
       pg_temp.uri(pg_temp.sha(v.tag || ':' || pn.n || ':' || pn.a || ':' || pn.p)),
       pg_temp.sha(v.tag || ':' || pn.n || ':' || pn.a || ':' || pn.p),
       v.bytes, 'image/webp',
       pg_temp.local_point(pn.x, pn.y), 0.03,
       jsonb_build_object(
         'variant', v.variant,
         'heading_deg', pn.heading,
         'height_m', 850.0, 'sd_h_m', 0.03, 'quality', 'fix',
         'gps_time_ns', pn.gps_time_ns,
         'width_px', v.width, 'height_px', v.width / 2,
         'local_x_m', pn.x, 'local_y_m', pn.y
       ),
       pn.quality,
       'orchados-pipeline', '0.1.0', pg_temp.sha('params'),
       (pn.day + time '12:00') at time zone 'UTC'
from demo_pano as pn
cross join lateral (values
  (pn.id, 'pano', 'full', 3840, 3145728),
  (pn.preview_id, 'preview', 'preview', 1920, 524288)
) as v (id, tag, variant, width, bytes);

insert into public.asset_source (org_id, parcel_id, asset_id, source_capture_id)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', v.id,
       md5('orchados-demo:capture:' || pn.n || ':video_360')::uuid
from demo_pano as pn
cross join lateral (values (pn.id), (pn.preview_id)) as v (id);

-- ---------------------------------------------------------------------------
-- Tree crops: N from the aisle north of the row, S from the aisle south of it.
-- Interstitial trees use the nearest panorama in the aisle. Viewing angles as
-- the pipeline computes them (services/pipeline/README.md, "Kesit yan dosyası"):
-- camera 2.0 m, crop centre 1.5 m above ground, 5 m crown, ideal distance 4 m.
-- ---------------------------------------------------------------------------

create temp table demo_crop on commit drop as
select md5('orchados-demo:crop:' || d.n || ':' || t.code || ':' || dir.code)::uuid as id,
       d.id as session_id, d.n, d.day, t.tree_id, t.code, dir.code as direction,
       pn.id as pano_id, pn.x as pano_x, pn.y as pano_y, pn.heading, pn.quality,
       t.x - pn.x as dx, t.y - pn.y as dy
from demo_scan as d
cross join demo_tree as t
cross join (values ('N', 1), ('S', 0)) as dir (code, aisle_offset)
join demo_pano as pn
  on pn.session_id = d.id
 and pn.a = t.row_no - 1 + dir.aisle_offset
 and pn.p = least(16, round((t.x - 4) / 8.0)::int);

create temp table demo_crop_view on commit drop as
select c.*, g.dist, g.azimuth,
       mod((g.azimuth - c.heading + 540)::numeric, 360) - 180 as yaw,
       degrees(atan2(1.5 - 2.0, g.dist)) as pitch,
       least(110, greatest(50, 2 * degrees(atan2(2.5, g.dist)) * 1.2)) as fov,
       exp(-power((g.dist - 4) / 3, 2)) * (0.5 + 0.5 * c.quality) as score
from demo_crop as c
cross join lateral (
  select sqrt(c.dx * c.dx + c.dy * c.dy) as dist,
         -- local x is 15 degrees north of east (row azimuth 75)
         mod((degrees(atan2(c.dx * cos(radians(15.0)) - c.dy * sin(radians(15.0)),
                            c.dx * sin(radians(15.0)) + c.dy * cos(radians(15.0)))) + 360)::numeric, 360)
           as azimuth
) as g;

insert into public.asset (
  id, org_id, parcel_id, session_id, kind, tree_id, uri, content_hash, byte_size, mime_type,
  position, position_uncertainty_m, pose, quality_score, pipeline, pipeline_version, params_hash, produced_at
)
select c.id, 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       c.session_id, 'tree_crop', c.tree_id,
       pg_temp.uri(pg_temp.sha('crop:' || c.n || ':' || c.code || ':' || c.direction)),
       pg_temp.sha('crop:' || c.n || ':' || c.code || ':' || c.direction),
       262144, 'image/jpeg',
       pg_temp.local_point(c.pano_x, c.pano_y), 0.03, -- where the camera stood
       jsonb_build_object(
         'direction', c.direction,
         'slot_code', c.code,
         'panorama_asset_id', c.pano_id,
         'distance_m', round(c.dist::numeric, 3),
         'azimuth_deg', round(c.azimuth, 3),
         'yaw_in_panorama_deg', round(c.yaw, 3),
         'pitch_deg', round(c.pitch::numeric, 3),
         'fov_deg', round(c.fov::numeric, 3),
         'score', round(c.score::numeric, 4)
       ),
       round(c.score::numeric, 4), 'orchados-pipeline', '0.1.0', pg_temp.sha('params'),
       (c.day + time '12:30') at time zone 'UTC'
from demo_crop_view as c;

insert into public.asset_source (org_id, parcel_id, asset_id, source_asset_id)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', c.id, c.pano_id
from demo_crop as c;

-- ---------------------------------------------------------------------------
-- Class per tree and scan. h in [0, 100): <4 dead, <10 problem, <24 attention.
-- Scan 2 shifts the hash so a few trees change class between visits.
-- ---------------------------------------------------------------------------

create temp table demo_eval on commit drop as
select d.id as session_id, d.n, d.status, d.day, t.tree_id, t.code, h.h,
       case when h.h < 4 then 'dead' when h.h < 10 then 'problem' when h.h < 24 then 'attention' else 'healthy' end
         ::public.health_class as class,
       case when h.h < 4 then 3 when h.h < 10 then 2 when h.h < 24 then 1 else 0 end::smallint as dead_branch
from demo_scan as d
cross join demo_tree as t
cross join lateral (
  select (t.row_no * 37 + t.position_no * 11 + coalesce(ascii(t.suffix), 0)
          + case when d.n = 2 and (t.row_no + t.position_no) % 9 = 0 then 5 else 0 end) % 100 as h
) as h
where not (t.code = 'S3-3' and d.n = 1); -- one tree without a published assessment

-- Dead-branch measurement: expert in the published scan, AI in the scan under review.
insert into public.measurement (
  id, org_id, parcel_id, tree_id, metric_definition_id, value_scale, uncertainty, confidence,
  method, method_version, source, session_id, measured_at, recorded_by
)
select md5('orchados-demo:measurement:' || e.n || ':' || e.code)::uuid,
       'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', e.tree_id,
       md5('orchados-seed:metric:dead_branch_scale')::uuid, e.dead_branch, 0.5,
       case when e.status = 'published' then 0.95 else 0.6 + (e.h % 35) / 100.0 end,
       case when e.status = 'published' then 'expert_review' else 'ai_preassessment' end,
       case when e.status = 'published' then 'methodology-v0' else 'demo-0.0' end,
       case when e.status = 'published' then 'expert' else 'ai' end::public.measurement_source,
       e.session_id, (e.day + time '15:00') at time zone 'UTC',
       case when e.status = 'published' then pg_temp.member('expert') else pg_temp.member('ops') end
from demo_eval as e;

insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-demo:measurement:' || e.n || ':' || e.code)::uuid, c.id
from demo_eval as e
join demo_crop as c on c.session_id = e.session_id and c.tree_id = e.tree_id;

-- Assessments: approved expert rows in the published scan, unapproved AI rows in review.
insert into public.assessment (
  id, org_id, parcel_id, session_id, tree_id, source, overall_class, confidence,
  model_name, model_version, methodology_version, assessed_by, approved_by, approved_at, notes, assessed_at
)
select md5('orchados-demo:assessment:' || e.n || ':' || e.code)::uuid,
       'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', e.session_id, e.tree_id,
       case when e.status = 'published' then 'expert' else 'ai' end::public.assessment_source,
       e.class,
       case when e.status = 'published' then null else 0.6 + (e.h % 35) / 100.0 end,
       case when e.status = 'published' then null else 'demo-preassessment' end,
       case when e.status = 'published' then null else '0.0' end,
       'methodology-v0',
       case when e.status = 'published' then pg_temp.member('expert') else pg_temp.member('ops') end,
       case when e.status = 'published' then pg_temp.member('expert') end,
       case when e.status = 'published' then (e.day + time '18:00') at time zone 'UTC' end,
       case when e.class = 'dead' then 'Taçta yaprak ve canlı sürgün yok.' end,
       (e.day + time '16:00') at time zone 'UTC'
from demo_eval as e;

insert into public.assessment_measurement (org_id, parcel_id, assessment_id, measurement_id)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-demo:assessment:' || e.n || ':' || e.code)::uuid,
       md5('orchados-demo:measurement:' || e.n || ':' || e.code)::uuid
from demo_eval as e;

-- ---------------------------------------------------------------------------
-- Findings in the published scan: one per dead or problem tree, plus one
-- parcel-level finding at the well.
-- ---------------------------------------------------------------------------

insert into public.finding (
  id, org_id, parcel_id, session_id, tree_id, assessment_id, kind, severity, description, recommendation,
  approved_by, approved_at, created_by
)
select md5('orchados-demo:finding:' || e.n || ':' || e.code)::uuid,
       'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', e.session_id, e.tree_id,
       md5('orchados-demo:assessment:' || e.n || ':' || e.code)::uuid,
       case when e.class = 'dead' then 'dead_tree' else 'dead_branch' end,
       case when e.class = 'dead' then 'high' else 'medium' end::public.finding_severity,
       case when e.class = 'dead' then e.code || ': ağaç kurumuş görünüyor.'
            else e.code || ': taçta %10-30 kuru dal.' end,
       case when e.class = 'dead' then 'Bir sonraki ziyarette yakından bakılsın; söküm ve yerine dikim değerlendirilsin.'
            else 'Kış budamasında kuru dallar alınsın.' end,
       pg_temp.member('expert'), (e.day + time '18:00') at time zone 'UTC',
       pg_temp.member('expert')
from demo_eval as e
where e.status = 'published' and e.class in ('dead', 'problem');

insert into public.finding_evidence (org_id, parcel_id, finding_id, asset_id)
select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
       md5('orchados-demo:finding:' || e.n || ':' || e.code)::uuid, c.id
from demo_eval as e
join demo_crop as c on c.session_id = e.session_id and c.tree_id = e.tree_id
where e.status = 'published' and e.class in ('dead', 'problem');

insert into public.finding (
  id, org_id, parcel_id, session_id, zone_id, location, position_uncertainty_m, kind, severity,
  description, recommendation, approved_by, approved_at, created_by
) values (
  md5('orchados-demo:finding:1:well')::uuid,
  'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002',
  pg_temp.local_point(134, 140), 0.05, 'irrigation_leak', 'low',
  'Kuyu çevresinde su birikintisi; boru bağlantısında sızıntı olabilir.',
  'Bahçıvan bağlantıyı kontrol etsin.',
  pg_temp.member('expert'), '2026-10-14 18:00:00+00', pg_temp.member('expert')
);

commit;
