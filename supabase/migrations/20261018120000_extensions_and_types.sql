-- IP1 / 1: extensions, schemas and closed value sets.
-- Source of truth for the model: docs/veri-modeli.md.
-- Conventions: uuid keys via gen_random_uuid() (built into Postgres 13+),
-- created_at timestamptz default now(), all timestamps UTC, geometry in EPSG:4326.

create extension if not exists postgis with schema extensions;
-- pgcrypto is not needed for keys; it is used by seed.sql (crypt/gen_salt) and is
-- enabled on Supabase by default. Declared here so the dependency is explicit.
create extension if not exists pgcrypto with schema extensions;

-- Personal data (owner identity, phone, KVKK consent, deed and access notes).
-- Not listed in [api].schemas, so PostgREST never exposes it. Only service_role
-- (backend) gets direct access; see 20261018120400_private_schema.sql.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

-- Row level security helpers. Not exposed through PostgREST either, but
-- authenticated needs USAGE so that policies can call the helpers.
create schema if not exists authz;
revoke all on schema authz from public;
grant usage on schema authz to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerated types (closed sets). Open-ended vocabularies use text instead.
-- ---------------------------------------------------------------------------

create type public.org_kind as enum ('company', 'cooperative', 'insurer', 'service_provider', 'other');

-- Org-level roles: see every parcel of the org.
create type public.org_role as enum ('field_staff', 'expert', 'ops');
-- Parcel-level roles: see only their parcels and everything under them.
create type public.parcel_role as enum ('owner', 'viewer');

-- Parcel life cycle (MVP Module 1).
create type public.parcel_status as enum ('registered', 'inventory_planned', 'inventory_done', 'active_monitoring', 'passive');
create type public.irrigation_type as enum ('irrigated', 'rainfed', 'unknown');
create type public.corner as enum ('ne', 'nw', 'se', 'sw');
create type public.boundary_source as enum ('owner_declared', 'field_survey');

create type public.slot_kind as enum ('row', 'interstitial');
create type public.tree_sex as enum ('female', 'male', 'unknown');
create type public.graft_status as enum ('grafted', 'ungrafted', 'unknown');
-- 'unknown' added for trees whose class cannot be judged from imagery (MVP Module 2, step 6).
create type public.age_class as enum ('sapling', 'young', 'productive', 'old', 'unknown');
create type public.tree_status as enum ('active', 'lost');
create type public.zone_kind as enum (
  'cell', 'no_go', 'entry_point', 'irrigation_line', 'well', 'pool', 'fence', 'gate', 'shed', 'other'
);

create type public.session_kind as enum (
  'inventory', 'periodic_scan', 'verification', 'mowing', 'spraying', 'tillage', 'manual_entry'
);
create type public.performer_kind as enum ('crew', 'robot');
-- MVP visit status: planned / scanned / processed / in review / published.
create type public.session_status as enum ('planned', 'captured', 'processed', 'in_review', 'published', 'cancelled');

create type public.device_kind as enum ('human_kit', 'robot', 'phone', 'base_station', 'other');
create type public.sensor_kind as enum ('camera_360', 'lidar', 'gnss', 'thermal', 'phone_camera', 'imu', 'other');
create type public.capture_kind as enum ('video_360', 'mcap', 'gnss_raw', 'photo', 'audio_note', 'other');
create type public.asset_kind as enum (
  'panorama', 'tree_crop', 'trajectory', 'point_cloud', 'tree_point_cloud', 'photo', 'other'
);

create type public.metric_value_type as enum ('numeric', 'scale', 'category');
-- Visit seasons (MVP Module 3): winter, spring, summer, harvest.
create type public.season as enum ('winter', 'spring', 'summer', 'harvest');
-- Whether a metric is shown on the report card ("Karnede": yes / no / to be evaluated).
create type public.card_visibility as enum ('shown', 'hidden', 'under_evaluation');
create type public.measurement_source as enum ('staff', 'algorithm', 'ai', 'expert');
create type public.measurement_subject as enum ('tree', 'slot', 'zone', 'parcel');

create type public.assessment_source as enum ('ai', 'model', 'expert');
-- Overall class rule (MVP Module 4): absent > dead > problem > attention > healthy.
create type public.health_class as enum ('healthy', 'attention', 'problem', 'dead', 'absent');
create type public.finding_severity as enum ('info', 'low', 'medium', 'high');
create type public.operation_kind as enum (
  'mowing', 'spraying', 'tillage', 'pruning', 'fertilizing', 'irrigation', 'harvest', 'other'
);

-- ---------------------------------------------------------------------------
-- Shared trigger functions.
-- ---------------------------------------------------------------------------

-- Insert-only tables (capture, asset, measurement and their join tables).
-- Corrections are new rows; reprocessing never overwrites earlier results.
create function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on %.% is not allowed: table is insert-only', tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001', hint = 'Insert a new row instead of changing an existing one.';
end;
$$;
