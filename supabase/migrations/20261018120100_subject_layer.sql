-- IP1 / 2: subject layer -- what we describe (org, parcel, boundary, slot, tree, zone)
-- plus the access tables (membership, parcel_access).
--
-- Every row carries org_id, and every parcel-scoped row also carries parcel_id, so
-- RLS policies never need joins. Composite foreign keys such as
-- (parcel_id, org_id) -> parcel(id, org_id) guarantee that these copies always
-- agree with the parent row.

-- ---------------------------------------------------------------------------
-- Tenant and org-level access
-- ---------------------------------------------------------------------------

create table public.org (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  kind public.org_kind not null default 'company',
  created_at timestamptz not null default now()
);
comment on table public.org is 'Tenant: company, cooperative, insurer, service provider.';

create table public.membership (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, role)
);
comment on table public.membership is 'Org-level role of a user (field_staff, expert, ops). A user may hold several roles.';
create index membership_user_id_idx on public.membership (user_id);

-- ---------------------------------------------------------------------------
-- Parcel and parcel-level access
-- ---------------------------------------------------------------------------

create table public.parcel (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id),
  name text not null check (length(btrim(name)) > 0),
  province text,
  district text,
  village text,
  estimated_area_m2 numeric(12, 2) check (estimated_area_m2 > 0),
  irrigation public.irrigation_type not null default 'unknown',
  estimated_tree_count integer check (estimated_tree_count >= 0),
  status public.parcel_status not null default 'registered',
  -- Rough location given by the owner at registration.
  position extensions.geometry(Point, 4326),
  position_uncertainty_m real check (position_uncertainty_m >= 0),
  -- Slot numbering is chosen once per parcel and never changes (MVP Module 2).
  numbering_origin_corner public.corner,
  row_azimuth_deg real check (row_azimuth_deg >= 0 and row_azimuth_deg < 360),
  -- Origin of the parcel-local metric frame (corner origin, x along rows, metres).
  local_origin extensions.geometry(Point, 4326),
  local_origin_uncertainty_m real check (local_origin_uncertainty_m >= 0),
  created_at timestamptz not null default now(),
  unique (id, org_id),
  check (position is null or position_uncertainty_m is not null),
  check (local_origin is null or local_origin_uncertainty_m is not null)
);
comment on table public.parcel is 'Orchard section used by the owner. Deed reference and access notes live in private.parcel_detail.';
create index parcel_org_id_idx on public.parcel (org_id);
create index parcel_position_gist on public.parcel using gist (position);

create function private.freeze_parcel_numbering()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.numbering_origin_corner is not null
      and new.numbering_origin_corner is distinct from old.numbering_origin_corner)
     or (old.row_azimuth_deg is not null
      and new.row_azimuth_deg is distinct from old.row_azimuth_deg) then
    raise exception 'slot numbering of parcel % is fixed once set', old.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger parcel_freeze_numbering
before update on public.parcel
for each row execute function private.freeze_parcel_numbering();

create table public.parcel_access (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.parcel_role not null,
  granted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  unique (parcel_id, user_id)
);
comment on table public.parcel_access is 'Parcel-level role (owner, viewer). Co-owners of a shared deed are added as viewers.';
create index parcel_access_user_id_idx on public.parcel_access (user_id);
create index parcel_access_org_id_idx on public.parcel_access (org_id);

-- ---------------------------------------------------------------------------
-- Boundary (versioned)
-- ---------------------------------------------------------------------------

create table public.boundary (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  version integer not null check (version > 0),
  geom extensions.geometry(Polygon, 4326) not null check (extensions.st_isvalid(geom)),
  area_m2 double precision generated always as (extensions.st_area(geom::extensions.geography)) stored,
  source public.boundary_source not null,
  vertex_uncertainty_m real check (vertex_uncertainty_m >= 0),
  session_id uuid,
  surveyed_at timestamptz,
  owner_approved_at timestamptz,
  owner_approved_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  unique (parcel_id, version),
  check ((owner_approved_at is null) = (owner_approved_by is null))
);
comment on table public.boundary is
  'Usage boundary shown by the owner; not a title or ownership claim. A change is a new version, never an update of geom.';
create index boundary_org_id_idx on public.boundary (org_id);
create index boundary_geom_gist on public.boundary using gist (geom);

-- ---------------------------------------------------------------------------
-- Slot and tree
-- ---------------------------------------------------------------------------

create table public.slot (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  row_no integer not null check (row_no > 0),
  position_no integer not null check (position_no > 0),
  -- Interstitial trees get the previous slot code plus a letter: S5-12a.
  suffix text check (suffix ~ '^[a-z]$'),
  kind public.slot_kind not null default 'row',
  code text generated always as ('S' || row_no::text || '-' || position_no::text || coalesce(suffix, '')) stored,
  position extensions.geometry(Point, 4326),
  position_uncertainty_m real check (position_uncertainty_m >= 0),
  -- Position in the parcel-local frame (metres from parcel.local_origin).
  local_x_m double precision,
  local_y_m double precision,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  unique (parcel_id, code),
  unique (id, parcel_id, org_id),
  check ((kind = 'interstitial') = (suffix is not null)),
  check (position is null or position_uncertainty_m is not null)
);
comment on table public.slot is 'Planting position. The code is kept even when the slot is empty (no active tree).';
create index slot_org_id_idx on public.slot (org_id);
create index slot_position_gist on public.slot using gist (position);

create table public.tree (
  -- Stable identity: never reused. A replanted tree in the same slot is a new row.
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  slot_id uuid not null,
  sex public.tree_sex not null default 'unknown',
  graft public.graft_status not null default 'unknown',
  age_class public.age_class not null default 'unknown',
  cultivar text,
  status public.tree_status not null default 'active',
  first_seen_at timestamptz,
  first_seen_session_id uuid,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  foreign key (slot_id, parcel_id, org_id) references public.slot (id, parcel_id, org_id) on delete cascade,
  unique (id, parcel_id, org_id),
  check (status = 'lost' or lost_at is null)
);
comment on table public.tree is 'Tree with a permanent id, bound to a slot. Lost trees keep their row (status = lost).';
-- At most one active tree per slot.
create unique index tree_one_active_per_slot on public.tree (slot_id) where status = 'active';
create index tree_slot_id_idx on public.tree (slot_id);
create index tree_parcel_id_idx on public.tree (parcel_id);
create index tree_org_id_idx on public.tree (org_id);

-- ---------------------------------------------------------------------------
-- Zone: non-tree areas and infrastructure
-- ---------------------------------------------------------------------------

create table public.zone (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  kind public.zone_kind not null,
  name text,
  geom extensions.geometry(Geometry, 4326) not null check (extensions.st_isvalid(geom)),
  position_uncertainty_m real check (position_uncertainty_m >= 0),
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  unique (id, parcel_id, org_id)
);
comment on table public.zone is 'Non-tree areas: no-go zone, entry point, irrigation line, well, fence, gate, shed.';
create index zone_parcel_id_idx on public.zone (parcel_id);
create index zone_org_id_idx on public.zone (org_id);
create index zone_geom_gist on public.zone using gist (geom);
