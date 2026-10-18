-- IP1 / 3: acquisition layer -- how the data was collected
-- (device, sensor, rig, calibration, session, capture).

create table public.device (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id),
  kind public.device_kind not null,
  name text,
  manufacturer text not null,
  model text not null,
  serial_number text,
  firmware_version text,
  created_at timestamptz not null default now(),
  unique (org_id, manufacturer, model, serial_number),
  unique (id, org_id)
);
comment on table public.device is 'Human scan kit, robot, phone or base station.';

create table public.sensor (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  device_id uuid not null,
  kind public.sensor_kind not null,
  manufacturer text,
  model text,
  serial_number text,
  firmware_version text,
  created_at timestamptz not null default now(),
  foreign key (device_id, org_id) references public.device (id, org_id) on delete cascade,
  unique (id, org_id)
);
create index sensor_device_id_idx on public.sensor (device_id);
create index sensor_org_id_idx on public.sensor (org_id);

create table public.rig (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);
comment on table public.rig is 'Arrangement of sensors used together in a session.';

create table public.rig_sensor (
  org_id uuid not null,
  rig_id uuid not null,
  sensor_id uuid not null,
  -- Mounting pose relative to the rig origin (lever arm, rotation), free-form for now.
  mount jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (rig_id, sensor_id),
  foreign key (rig_id, org_id) references public.rig (id, org_id) on delete cascade,
  foreign key (sensor_id, org_id) references public.sensor (id, org_id) on delete cascade
);
create index rig_sensor_sensor_id_idx on public.rig_sensor (sensor_id);
create index rig_sensor_org_id_idx on public.rig_sensor (org_id);

create table public.calibration (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  rig_id uuid not null,
  -- Null: rig-level calibration (e.g. extrinsics between all sensors).
  sensor_id uuid,
  version text not null,
  intrinsics jsonb,
  extrinsics jsonb,
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  foreign key (rig_id, org_id) references public.rig (id, org_id),
  foreign key (sensor_id, org_id) references public.sensor (id, org_id),
  unique nulls not distinct (rig_id, sensor_id, version),
  unique (id, org_id),
  check (valid_to is null or valid_to > valid_from)
);
create index calibration_sensor_id_idx on public.calibration (sensor_id);
create index calibration_org_id_idx on public.calibration (org_id);

-- ---------------------------------------------------------------------------
-- Session (an MVP "visit" is a session of kind inventory / periodic_scan / ...)
-- ---------------------------------------------------------------------------

create table public.session (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  kind public.session_kind not null,
  performer public.performer_kind not null default 'crew',
  status public.session_status not null default 'planned',
  planned_date date,
  started_at timestamptz,
  ended_at timestamptz,
  methodology_version text,
  rig_id uuid,
  lead_user_id uuid references auth.users (id) on delete set null,
  weather jsonb,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (rig_id, org_id) references public.rig (id, org_id),
  unique (id, parcel_id, org_id),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);
comment on table public.session is 'Visit to a parcel: scan, inventory, verification, mowing, spraying, manual entry.';
create index session_parcel_id_idx on public.session (parcel_id, started_at);
create index session_org_id_idx on public.session (org_id);
create index session_rig_id_idx on public.session (rig_id);

-- Links from the subject layer that need session to exist.
alter table public.boundary
  add foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id);
create index boundary_session_id_idx on public.boundary (session_id);

alter table public.tree
  add foreign key (first_seen_session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id);
create index tree_first_seen_session_id_idx on public.tree (first_seen_session_id);

-- ---------------------------------------------------------------------------
-- Capture: raw recording. Insert-only.
-- ---------------------------------------------------------------------------

create table public.capture (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  kind public.capture_kind not null,
  rig_id uuid,
  sensor_id uuid,
  calibration_id uuid,
  -- Subject of a close-up photo, if any.
  tree_id uuid,
  -- Where the file lives: storage object, processing-station path, etc.
  uri text not null,
  -- SHA-256 of the file content, lowercase hex. Files are addressed by content.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size bigint check (byte_size >= 0),
  mime_type text,
  started_at timestamptz not null,
  ended_at timestamptz,
  position extensions.geometry(Point, 4326),
  position_uncertainty_m real check (position_uncertainty_m >= 0),
  captured_by uuid default auth.uid() references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  -- Server receive time; device time is started_at.
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (rig_id, org_id) references public.rig (id, org_id),
  foreign key (sensor_id, org_id) references public.sensor (id, org_id),
  foreign key (calibration_id, org_id) references public.calibration (id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  unique (org_id, content_hash),
  unique (id, parcel_id, org_id),
  check (ended_at is null or ended_at >= started_at),
  check (position is null or position_uncertainty_m is not null)
);
comment on table public.capture is 'Raw recording (360 video, MCAP, raw GNSS, photo). Insert-only.';
create index capture_session_id_idx on public.capture (session_id);
create index capture_parcel_id_idx on public.capture (parcel_id);
create index capture_tree_id_idx on public.capture (tree_id);
create index capture_rig_id_idx on public.capture (rig_id);
create index capture_sensor_id_idx on public.capture (sensor_id);
create index capture_calibration_id_idx on public.capture (calibration_id);
create index capture_position_gist on public.capture using gist (position);

create trigger capture_insert_only
before update or delete on public.capture
for each row execute function private.forbid_mutation();
create trigger capture_no_truncate
before truncate on public.capture
for each statement execute function private.forbid_mutation();
