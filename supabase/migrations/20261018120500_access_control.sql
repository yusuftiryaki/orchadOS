-- IP1 / 6: grants and row level security.
--
-- Access model
--   membership(org_id, user_id, role)      field_staff | expert | ops  -> every parcel of the org
--   parcel_access(parcel_id, user_id, role) owner | viewer             -> only that parcel and what is under it
--
-- Reads: org members, or users with parcel_access on the row's parcel.
-- Writes by org role:
--   field_staff  slot/tree/zone, session, kit (device/sensor/rig/calibration), boundary, capture,
--                asset, measurement, operation
--   expert       slot/tree (inventory check), session status, measurement, assessment, finding
--   ops          everything field_staff and expert can do, plus org, membership, parcel, parcel_access
-- Owners may add / remove viewers on their own parcels and approve a boundary (RPC).
-- Viewers are read-only. anon has no access at all.
-- capture, asset, measurement (+ join tables) are insert-only: no UPDATE / DELETE grant,
-- no policy, and a trigger that rejects changes even from service_role.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer: they read membership / parcel_access
-- without recursing into those tables' own policies). Return sets so that
-- policies can use "x in (select ...)", which Postgres evaluates once per query.
-- ---------------------------------------------------------------------------

create function authz.user_org_ids(p_roles public.org_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.membership m
  where m.user_id = (select auth.uid())
    and (p_roles is null or m.role = any (p_roles));
$$;

create function authz.user_parcel_ids(p_roles public.parcel_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pa.parcel_id
  from public.parcel_access pa
  where pa.user_id = (select auth.uid())
    and (p_roles is null or pa.role = any (p_roles));
$$;

create function authz.user_parcel_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pa.org_id
  from public.parcel_access pa
  where pa.user_id = (select auth.uid());
$$;

revoke all on all functions in schema authz from public, anon;
grant execute on all functions in schema authz to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants. Start from nothing (the platform may add default grants on public),
-- then grant exactly what the policies below are meant to allow.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- Tenant and access
grant select, update on public.org to authenticated;
grant select, insert, update, delete on public.membership to authenticated;
grant select, insert, update on public.parcel to authenticated;
grant select, insert, update, delete on public.parcel_access to authenticated;
-- Subject layer. boundary: new versions are inserts; owner approval goes through approve_boundary().
grant select, insert on public.boundary to authenticated;
grant select, insert, update, delete on public.slot, public.tree, public.zone to authenticated;
-- Acquisition
grant select, insert, update, delete on public.session to authenticated;
grant select, insert, update, delete on public.device, public.sensor, public.rig, public.rig_sensor, public.calibration
  to authenticated;
-- Insert-only
grant select, insert on public.capture, public.asset, public.asset_source,
  public.measurement, public.measurement_evidence to authenticated;
-- Registry (managed by migrations / service_role)
grant select on public.metric_definition to authenticated;
-- Findings
grant select, insert, update on public.assessment to authenticated;
grant select, insert, delete on public.assessment_measurement to authenticated;
grant select, insert, update, delete on public.finding to authenticated;
grant select, insert, delete on public.finding_evidence to authenticated;
grant select, insert, update, delete on public.operation to authenticated;

-- Functions in public are callable by PUBLIC by default; keep the API surface explicit.
revoke all on all functions in schema public from public, anon;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere in public.
-- ---------------------------------------------------------------------------

alter table public.org enable row level security;
alter table public.membership enable row level security;
alter table public.parcel enable row level security;
alter table public.parcel_access enable row level security;
alter table public.boundary enable row level security;
alter table public.slot enable row level security;
alter table public.tree enable row level security;
alter table public.zone enable row level security;
alter table public.device enable row level security;
alter table public.sensor enable row level security;
alter table public.rig enable row level security;
alter table public.rig_sensor enable row level security;
alter table public.calibration enable row level security;
alter table public.session enable row level security;
alter table public.capture enable row level security;
alter table public.asset enable row level security;
alter table public.asset_source enable row level security;
alter table public.metric_definition enable row level security;
alter table public.measurement enable row level security;
alter table public.measurement_evidence enable row level security;
alter table public.assessment enable row level security;
alter table public.assessment_measurement enable row level security;
alter table public.finding enable row level security;
alter table public.finding_evidence enable row level security;
alter table public.operation enable row level security;

-- ---------------------------------------------------------------------------
-- org, membership
-- ---------------------------------------------------------------------------

create policy org_select on public.org for select to authenticated
  using (id in (select authz.user_org_ids()) or id in (select authz.user_parcel_org_ids()));
create policy org_update on public.org for update to authenticated
  using (id in (select authz.user_org_ids('{ops}')))
  with check (id in (select authz.user_org_ids('{ops}')));

create policy membership_select on public.membership for select to authenticated
  using (user_id = (select auth.uid()) or org_id in (select authz.user_org_ids('{ops}')));
create policy membership_insert on public.membership for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{ops}')));
create policy membership_update on public.membership for update to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')))
  with check (org_id in (select authz.user_org_ids('{ops}')));
create policy membership_delete on public.membership for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));

-- ---------------------------------------------------------------------------
-- parcel, parcel_access
-- ---------------------------------------------------------------------------

create policy parcel_select on public.parcel for select to authenticated
  using (org_id in (select authz.user_org_ids()) or id in (select authz.user_parcel_ids()));
create policy parcel_insert on public.parcel for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{ops}')));
create policy parcel_update on public.parcel for update to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')))
  with check (org_id in (select authz.user_org_ids('{ops}')));

create policy parcel_access_select on public.parcel_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or org_id in (select authz.user_org_ids())
    or parcel_id in (select authz.user_parcel_ids('{owner}'))
  );
create policy parcel_access_insert on public.parcel_access for insert to authenticated
  with check (
    org_id in (select authz.user_org_ids('{ops}'))
    or (role = 'viewer' and parcel_id in (select authz.user_parcel_ids('{owner}')))
  );
create policy parcel_access_update on public.parcel_access for update to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')))
  with check (org_id in (select authz.user_org_ids('{ops}')));
create policy parcel_access_delete on public.parcel_access for delete to authenticated
  using (
    org_id in (select authz.user_org_ids('{ops}'))
    or (role = 'viewer' and parcel_id in (select authz.user_parcel_ids('{owner}')))
  );

-- ---------------------------------------------------------------------------
-- Parcel-scoped tables: read = org member or parcel_access on the row's parcel.
-- ---------------------------------------------------------------------------

-- boundary
create policy boundary_select on public.boundary for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy boundary_insert on public.boundary for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

-- slot, tree, zone
create policy slot_select on public.slot for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy slot_insert on public.slot for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
create policy slot_update on public.slot for update to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
create policy slot_delete on public.slot for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));

create policy tree_select on public.tree for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy tree_insert on public.tree for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
create policy tree_update on public.tree for update to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
create policy tree_delete on public.tree for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));

create policy zone_select on public.zone for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy zone_insert on public.zone for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
create policy zone_update on public.zone for update to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));
create policy zone_delete on public.zone for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));

-- session
create policy session_select on public.session for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy session_insert on public.session for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));
create policy session_update on public.session for update to authenticated
  using (org_id in (select authz.user_org_ids()))
  with check (org_id in (select authz.user_org_ids()));
create policy session_delete on public.session for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));

-- capture, asset, asset_source: insert-only
create policy capture_select on public.capture for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy capture_insert on public.capture for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

create policy asset_select on public.asset for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy asset_insert on public.asset for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

create policy asset_source_select on public.asset_source for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy asset_source_insert on public.asset_source for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

-- measurement, measurement_evidence: insert-only. source = 'expert' only by an expert.
create policy measurement_select on public.measurement for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy measurement_insert on public.measurement for insert to authenticated
  with check (
    org_id in (select authz.user_org_ids('{field_staff,expert,ops}'))
    and (source <> 'expert' or org_id in (select authz.user_org_ids('{expert}')))
  );

create policy measurement_evidence_select on public.measurement_evidence for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy measurement_evidence_insert on public.measurement_evidence for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,expert,ops}')));

-- assessment: expert and ops (ops loads AI results). source = 'expert' only by an expert.
create policy assessment_select on public.assessment for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy assessment_insert on public.assessment for insert to authenticated
  with check (
    org_id in (select authz.user_org_ids('{expert,ops}'))
    and (source <> 'expert' or org_id in (select authz.user_org_ids('{expert}')))
  );
create policy assessment_update on public.assessment for update to authenticated
  using (org_id in (select authz.user_org_ids('{expert}')))
  with check (org_id in (select authz.user_org_ids('{expert}')));

create policy assessment_measurement_select on public.assessment_measurement for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy assessment_measurement_insert on public.assessment_measurement for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{expert,ops}')));
create policy assessment_measurement_delete on public.assessment_measurement for delete to authenticated
  using (org_id in (select authz.user_org_ids('{expert,ops}')));

-- finding, finding_evidence
create policy finding_select on public.finding for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy finding_insert on public.finding for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{expert,ops}')));
create policy finding_update on public.finding for update to authenticated
  using (org_id in (select authz.user_org_ids('{expert,ops}')))
  with check (org_id in (select authz.user_org_ids('{expert,ops}')));
create policy finding_delete on public.finding for delete to authenticated
  using (org_id in (select authz.user_org_ids('{expert,ops}')));

create policy finding_evidence_select on public.finding_evidence for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy finding_evidence_insert on public.finding_evidence for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{expert,ops}')));
create policy finding_evidence_delete on public.finding_evidence for delete to authenticated
  using (org_id in (select authz.user_org_ids('{expert,ops}')));

-- operation
create policy operation_select on public.operation for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids()));
create policy operation_insert on public.operation for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));
create policy operation_update on public.operation for update to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));
create policy operation_delete on public.operation for delete to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));

-- ---------------------------------------------------------------------------
-- Org-scoped kit tables: only org members (owners never see the kit).
-- ---------------------------------------------------------------------------

create policy device_select on public.device for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy device_write on public.device for all to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

create policy sensor_select on public.sensor for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy sensor_write on public.sensor for all to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

create policy rig_select on public.rig for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy rig_write on public.rig for all to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

create policy rig_sensor_select on public.rig_sensor for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy rig_sensor_write on public.rig_sensor for all to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

create policy calibration_select on public.calibration for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy calibration_write on public.calibration for all to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));

-- ---------------------------------------------------------------------------
-- Global registry
-- ---------------------------------------------------------------------------

create policy metric_definition_select on public.metric_definition for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- RPC: owner approves a boundary version ("Sahip sınırı portalda onaylar").
-- ---------------------------------------------------------------------------

create function public.approve_boundary(p_boundary_id uuid)
returns public.boundary
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boundary;
begin
  update public.boundary
  set owner_approved_at = now(),
      owner_approved_by = (select auth.uid())
  where id = p_boundary_id
    and owner_approved_at is null
    and parcel_id in (select authz.user_parcel_ids('{owner}'))
  returning * into b;

  if not found then
    raise exception 'boundary % not found, already approved, or caller is not an owner of its parcel', p_boundary_id
      using errcode = '42501';
  end if;
  return b;
end;
$$;
comment on function public.approve_boundary(uuid) is 'Owner approval of a boundary version.';
revoke all on function public.approve_boundary(uuid) from public, anon;
grant execute on function public.approve_boundary(uuid) to authenticated;
