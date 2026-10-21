-- Operations screens v0.1 (/operasyon): owner and parcel registration, portal
-- access, visit planning.
--
-- 1. Private data for ops. private.* stays off the API (no grants, RLS without
--    policies); ops reads and writes it only through the security definer
--    functions below, each of which checks that the caller holds the `ops` role
--    in the row's org. Errors carry a reason code and at most a field name,
--    never a value: personal data does not end up in messages or logs.
-- 2. People: ops_find_user_id() (an account by e-mail or phone, id only),
--    ops_org_members() (who is field staff, for the lead of a visit),
--    ops_parcel_access() (who has portal access to a parcel).
-- 3. Parcels: add_owner_declared_boundary() (next boundary version, source
--    owner_declared) and register_parcel() (parcel + private detail + rough
--    boundary + owner access in one transaction). Both run as the caller
--    (security invoker): row level security decides, as for the web app.
-- 4. Visits: only ops plans inventory / periodic scan / verification visits
--    (session_insert narrowed; field staff keeps other session kinds). A
--    visit's plan (kind, day, lead, parcel) changes and a visit is cancelled
--    only while it is planned, and only by ops; a cancelled visit is final.
--    The lead must be field staff of the visit's org.
-- 5. Parcel life cycle: the first planned inventory visit moves a registered
--    parcel to inventory_planned; cancelling the last open one moves it back.
--    inventory_done is set by the inventory approval, not here.

-- ---------------------------------------------------------------------------
-- 1. Private data: owner profiles, parcel details
-- ---------------------------------------------------------------------------

create function public.ops_owner_profiles(p_profile_id uuid default null)
returns table (
  id uuid,
  org_id uuid,
  user_id uuid,
  full_name text,
  phone text,
  email text,
  contact_preference text,
  kvkk_consent boolean,
  kvkk_consent_at timestamptz,
  kvkk_text_version text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.org_id, p.user_id, p.full_name, p.phone, p.email, p.contact_preference::text,
         p.kvkk_consent, p.kvkk_consent_at, p.kvkk_text_version, p.created_at, p.updated_at
  from private.owner_profile p
  where p.org_id in (select authz.user_org_ids('{ops}'))
    and (p_profile_id is null or p.id = p_profile_id)
  order by p.full_name, p.id;
$$;
comment on function public.ops_owner_profiles(uuid) is
  'Owner profiles of the orgs where the caller is ops (all, or one by id). Personal data: ops only.';

-- Shared validation of the profile fields; raises invalid_input with the field name.
create function private.check_owner_profile_input(
  p_full_name text,
  p_phone text,
  p_contact_preference text,
  p_kvkk_consent boolean,
  p_kvkk_consent_at timestamptz,
  p_kvkk_text_version text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_full_name is null or length(btrim(p_full_name)) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
  end if;
  if p_contact_preference is null or p_contact_preference not in ('whatsapp', 'sms', 'phone_call') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'contact_preference';
  end if;
  if coalesce(p_kvkk_consent, false) <> (p_kvkk_consent_at is not null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kvkk_consent_at';
  end if;
  if coalesce(p_kvkk_consent, false) and coalesce(btrim(p_kvkk_text_version), '') = '' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kvkk_text_version';
  end if;
end;
$$;

-- Optional fields come last with defaults (null), so API callers may omit them.
create function public.ops_create_owner_profile(
  p_org_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_contact_preference text,
  p_kvkk_consent boolean,
  p_phone text default null,
  p_email text default null,
  p_kvkk_consent_at timestamptz default null,
  p_kvkk_text_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'user_id';
  end if;
  perform private.check_owner_profile_input(
    p_full_name, p_phone, p_contact_preference, p_kvkk_consent, p_kvkk_consent_at, p_kvkk_text_version
  );
  if exists (select 1 from private.owner_profile p where p.org_id = p_org_id and p.user_id = p_user_id) then
    raise exception 'exists' using errcode = '23505';
  end if;

  begin
    insert into private.owner_profile (
      org_id, user_id, full_name, phone, email, contact_preference,
      kvkk_consent, kvkk_consent_at, kvkk_text_version
    )
    values (
      p_org_id, p_user_id, btrim(p_full_name), p_phone, nullif(btrim(p_email), ''),
      p_contact_preference::private.contact_preference,
      coalesce(p_kvkk_consent, false), p_kvkk_consent_at, nullif(btrim(p_kvkk_text_version), '')
    )
    returning id into v_id;
  exception
    -- The default messages quote the failing row; replace them.
    when unique_violation then
      raise exception 'exists' using errcode = '23505';
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end;
$$;
comment on function public.ops_create_owner_profile(uuid, uuid, text, text, boolean, text, text, timestamptz, text) is
  'Ops registers an owner (private.owner_profile) for an existing account. Returns the profile id.';

-- Replaces every field: an omitted optional field is cleared.
create function public.ops_update_owner_profile(
  p_profile_id uuid,
  p_full_name text,
  p_contact_preference text,
  p_kvkk_consent boolean,
  p_phone text default null,
  p_email text default null,
  p_kvkk_consent_at timestamptz default null,
  p_kvkk_text_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.owner_profile p
    where p.id = p_profile_id and p.org_id in (select authz.user_org_ids('{ops}'))
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.check_owner_profile_input(
    p_full_name, p_phone, p_contact_preference, p_kvkk_consent, p_kvkk_consent_at, p_kvkk_text_version
  );

  begin
    update private.owner_profile
    set full_name = btrim(p_full_name),
        phone = p_phone,
        email = nullif(btrim(p_email), ''),
        contact_preference = p_contact_preference::private.contact_preference,
        kvkk_consent = coalesce(p_kvkk_consent, false),
        kvkk_consent_at = p_kvkk_consent_at,
        kvkk_text_version = nullif(btrim(p_kvkk_text_version), ''),
        updated_at = now()
    where id = p_profile_id;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
end;
$$;
comment on function public.ops_update_owner_profile(uuid, text, text, boolean, text, text, timestamptz, text) is
  'Ops corrects an owner profile; the account and org do not change.';

create function public.ops_parcel_detail(p_parcel_id uuid)
returns table (
  parcel_id uuid,
  deed_block text,
  deed_parcel text,
  is_shared_deed boolean,
  used_portion_note text,
  authorization_basis text,
  entry_permission_at timestamptz,
  access_note text,
  site_contact_name text,
  site_contact_phone text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.parcel_id, d.deed_block, d.deed_parcel, d.is_shared_deed, d.used_portion_note,
         d.authorization_basis::text, d.entry_permission_at, d.access_note,
         d.site_contact_name, d.site_contact_phone, d.updated_at
  from private.parcel_detail d
  where d.parcel_id = p_parcel_id
    and d.org_id in (select authz.user_org_ids('{ops}'));
$$;
comment on function public.ops_parcel_detail(uuid) is
  'Deed reference, access note and site contact of a parcel. Personal and third-party data: ops only.';

create function public.ops_save_parcel_detail(
  p_parcel_id uuid,
  p_deed_block text default null,
  p_deed_parcel text default null,
  p_is_shared_deed boolean default null,
  p_used_portion_note text default null,
  p_authorization_basis text default null,
  p_entry_permission_at timestamptz default null,
  p_access_note text default null,
  p_site_contact_name text default null,
  p_site_contact_phone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  select p.org_id into v_org_id from public.parcel p where p.id = p_parcel_id;
  if v_org_id is null or v_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_authorization_basis is not null
     and p_authorization_basis not in ('title_holder', 'power_of_attorney', 'heir_declaration') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'authorization_basis';
  end if;
  if p_site_contact_phone is not null and p_site_contact_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'site_contact_phone';
  end if;

  begin
    insert into private.parcel_detail (
      parcel_id, org_id, deed_block, deed_parcel, is_shared_deed, used_portion_note,
      authorization_basis, entry_permission_at, access_note, site_contact_name, site_contact_phone
    )
    values (
      p_parcel_id, v_org_id, nullif(btrim(p_deed_block), ''), nullif(btrim(p_deed_parcel), ''),
      p_is_shared_deed, nullif(btrim(p_used_portion_note), ''),
      p_authorization_basis::private.authorization_basis, p_entry_permission_at,
      nullif(btrim(p_access_note), ''), nullif(btrim(p_site_contact_name), ''), p_site_contact_phone
    )
    on conflict (parcel_id) do update
    set deed_block = excluded.deed_block,
        deed_parcel = excluded.deed_parcel,
        is_shared_deed = excluded.is_shared_deed,
        used_portion_note = excluded.used_portion_note,
        authorization_basis = excluded.authorization_basis,
        entry_permission_at = excluded.entry_permission_at,
        access_note = excluded.access_note,
        site_contact_name = excluded.site_contact_name,
        site_contact_phone = excluded.site_contact_phone,
        updated_at = now();
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
end;
$$;
comment on function public.ops_save_parcel_detail(uuid, text, text, boolean, text, text, timestamptz, text, text, text) is
  'Ops writes the private detail of a parcel (insert or replace).';

-- ---------------------------------------------------------------------------
-- 2. People
-- ---------------------------------------------------------------------------

-- The account to link (portal access, owner profile). Returns the id only,
-- or null; e-mail wins when both are given. Without the ops role: forbidden.
-- Used by the invite-user Edge Function, and by the web app when the function
-- is not reachable (account opened in the Supabase dashboard).
create function public.ops_find_user_id(p_org_id uuid, p_email text default null, p_phone text default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(p_email), '') is not null then
    select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email));
  elsif nullif(btrim(p_phone), '') is not null then
    -- Auth stores phone numbers without the leading +.
    select u.id into v_id from auth.users u where u.phone = ltrim(btrim(p_phone), '+');
  end if;
  return v_id;
end;
$$;
comment on function public.ops_find_user_id(uuid, text, text) is
  'Ops: id of the account with this e-mail (or phone), or null. Returns nothing else about the account.';

create function public.ops_org_members(p_org_id uuid)
returns table (user_id uuid, email text, role public.org_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role
  from public.membership m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org_id
    and p_org_id in (select authz.user_org_ids('{ops}'))
  order by u.email, m.role;
$$;
comment on function public.ops_org_members(uuid) is
  'Ops: members of the org with their login e-mail (e.g. field staff to lead a visit).';

create function public.ops_parcel_access(p_parcel_id uuid)
returns table (
  id uuid,
  user_id uuid,
  role public.parcel_role,
  created_at timestamptz,
  email text,
  full_name text,
  profile_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id, pa.user_id, pa.role, pa.created_at, u.email::text, op.full_name, op.id
  from public.parcel_access pa
  left join auth.users u on u.id = pa.user_id
  left join private.owner_profile op on op.user_id = pa.user_id and op.org_id = pa.org_id
  where pa.parcel_id = p_parcel_id
    and pa.org_id in (select authz.user_org_ids('{ops}'))
  order by pa.role, op.full_name, u.email;
$$;
comment on function public.ops_parcel_access(uuid) is
  'Ops: portal access of a parcel with the login e-mail and the owner profile name of each person.';

-- ---------------------------------------------------------------------------
-- 3. Parcels
-- ---------------------------------------------------------------------------

-- Rough boundary drawn on the map with the owner (MVP Module 1): the next
-- version of the parcel's boundary, source owner_declared. A usage boundary,
-- not an ownership claim (comment on public.boundary).
create function public.add_owner_declared_boundary(
  p_parcel_id uuid,
  p_ring jsonb,
  p_vertex_uncertainty_m real default null
)
returns public.boundary
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.parcel;
  b public.boundary;
  v_ring jsonb := p_ring;
  v_point jsonb;
  v_geom extensions.geometry;
begin
  select * into p from public.parcel where id = p_parcel_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Field staff may insert boundaries too (survey from the field app); the
  -- owner's declaration is recorded by ops at registration.
  if p.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- A json ring of [lon, lat] pairs, at least three distinct points; closed
  -- here when open.
  if v_ring is null or jsonb_typeof(v_ring) <> 'array' or jsonb_array_length(v_ring) < 3 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'at least three points';
  end if;
  for v_point in select value from jsonb_array_elements(v_ring) loop
    if jsonb_typeof(v_point) <> 'array' or jsonb_array_length(v_point) <> 2
       or jsonb_typeof(v_point -> 0) <> 'number' or jsonb_typeof(v_point -> 1) <> 'number'
       or abs((v_point ->> 0)::double precision) > 180 or abs((v_point ->> 1)::double precision) > 90 then
      raise exception 'boundary_invalid' using errcode = '22023', detail = 'points are [lon, lat]';
    end if;
  end loop;
  if v_ring -> 0 <> v_ring -> -1 then
    v_ring := v_ring || jsonb_build_array(v_ring -> 0);
  end if;
  if jsonb_array_length(v_ring) < 4 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'at least three points';
  end if;
  v_geom := extensions.st_setsrid(
    extensions.st_geomfromgeojson(
      jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(v_ring))::text
    ),
    4326
  );
  -- st_isvaliddetail, unlike st_isvalid, raises no notice quoting a coordinate.
  if not (extensions.st_isvaliddetail(v_geom)).valid or extensions.st_area(v_geom) = 0 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'self-intersecting or empty';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('boundary:' || p.id::text, 0));
  insert into public.boundary (org_id, parcel_id, version, geom, source, vertex_uncertainty_m)
  values (
    p.org_id, p.id,
    coalesce((select max(x.version) from public.boundary x where x.parcel_id = p.id), 0) + 1,
    v_geom, 'owner_declared', p_vertex_uncertainty_m
  )
  returning * into b;
  return b;
end;
$$;
comment on function public.add_owner_declared_boundary(uuid, jsonb, real) is
  'Ops records the owner''s rough boundary as the next boundary version (source owner_declared).';

-- p_parcel: {"name", "province", "district", "village", "estimated_area_m2",
--   "irrigation", "estimated_tree_count", "lon", "lat", "position_uncertainty_m"}
-- p_detail: the arguments of ops_save_parcel_detail without the p_ prefix, or null.
-- p_boundary: ring for add_owner_declared_boundary, or null. Without a
--   position the parcel is placed at the boundary's centroid, with its
--   farthest vertex as the uncertainty.
-- p_owner_user_id: account that gets `owner` access, or null.
-- Errors: forbidden, invalid_input (detail: field), boundary_invalid.
create function public.register_parcel(
  p_org_id uuid,
  p_parcel jsonb,
  p_detail jsonb default null,
  p_boundary jsonb default null,
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(p_parcel ->> 'name');
  v_position extensions.geometry;
  v_uncertainty real;
  v_boundary public.boundary;
  v_number text;
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_parcel is null or jsonb_typeof(p_parcel) <> 'object' or coalesce(v_name, '') = '' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'name';
  end if;
  foreach v_number in array array['estimated_area_m2', 'estimated_tree_count', 'lon', 'lat', 'position_uncertainty_m'] loop
    if p_parcel ? v_number and jsonb_typeof(p_parcel -> v_number) not in ('number', 'null') then
      raise exception 'invalid_input' using errcode = '22023', detail = v_number;
    end if;
  end loop;
  if coalesce((p_parcel ->> 'estimated_area_m2')::numeric, 1) <= 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'estimated_area_m2';
  end if;
  if coalesce((p_parcel ->> 'estimated_tree_count')::numeric, 0) < 0
     or coalesce((p_parcel ->> 'estimated_tree_count')::numeric, 0) <> trunc(coalesce((p_parcel ->> 'estimated_tree_count')::numeric, 0)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'estimated_tree_count';
  end if;
  if coalesce(p_parcel ->> 'irrigation', 'unknown') not in ('irrigated', 'rainfed', 'unknown') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'irrigation';
  end if;

  if p_parcel ->> 'lon' is not null or p_parcel ->> 'lat' is not null then
    if p_parcel ->> 'lon' is null or p_parcel ->> 'lat' is null
       or abs((p_parcel ->> 'lon')::double precision) > 180 or abs((p_parcel ->> 'lat')::double precision) > 90 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'position';
    end if;
    v_position := extensions.st_setsrid(
      extensions.st_makepoint((p_parcel ->> 'lon')::double precision, (p_parcel ->> 'lat')::double precision),
      4326
    );
    v_uncertainty := coalesce((p_parcel ->> 'position_uncertainty_m')::real, 100);
    if v_uncertainty < 0 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'position_uncertainty_m';
    end if;
  end if;

  insert into public.parcel (
    org_id, name, province, district, village, estimated_area_m2, irrigation,
    estimated_tree_count, position, position_uncertainty_m
  )
  values (
    p_org_id, v_name,
    nullif(btrim(p_parcel ->> 'province'), ''), nullif(btrim(p_parcel ->> 'district'), ''),
    nullif(btrim(p_parcel ->> 'village'), ''),
    (p_parcel ->> 'estimated_area_m2')::numeric,
    coalesce(p_parcel ->> 'irrigation', 'unknown')::public.irrigation_type,
    (p_parcel ->> 'estimated_tree_count')::integer,
    v_position, v_uncertainty
  )
  returning id into v_id;

  if p_detail is not null and jsonb_typeof(p_detail) = 'object' then
    perform public.ops_save_parcel_detail(
      v_id,
      p_detail ->> 'deed_block',
      p_detail ->> 'deed_parcel',
      (p_detail ->> 'is_shared_deed')::boolean,
      p_detail ->> 'used_portion_note',
      p_detail ->> 'authorization_basis',
      (p_detail ->> 'entry_permission_at')::timestamptz,
      p_detail ->> 'access_note',
      p_detail ->> 'site_contact_name',
      p_detail ->> 'site_contact_phone'
    );
  end if;

  if p_boundary is not null then
    v_boundary := public.add_owner_declared_boundary(v_id, p_boundary);
    if v_position is null then
      v_position := extensions.st_centroid(v_boundary.geom);
      select ceil(max(extensions.st_distance(v_position::extensions.geography, (dp).geom::extensions.geography)))
      into v_uncertainty
      from extensions.st_dumppoints(v_boundary.geom) dp;
      update public.parcel set position = v_position, position_uncertainty_m = v_uncertainty where id = v_id;
    end if;
  end if;

  if p_owner_user_id is not null then
    insert into public.parcel_access (org_id, parcel_id, user_id, role)
    values (p_org_id, v_id, p_owner_user_id, 'owner');
  end if;
  return v_id;
end;
$$;
comment on function public.register_parcel(uuid, jsonb, jsonb, jsonb, uuid) is
  'Ops registers a parcel with its private detail, rough boundary (v1, owner_declared) and owner access in one transaction.';

-- ---------------------------------------------------------------------------
-- 4. Visit planning
-- ---------------------------------------------------------------------------

-- Visits (inventory, periodic scan, verification) are planned by ops. Field
-- staff keeps inserting other session kinds (mowing, spraying, manual entry).
drop policy session_insert on public.session;
create policy session_insert on public.session for insert to authenticated
  with check (
    status <> 'published'
    and (
      org_id in (select authz.user_org_ids('{ops}'))
      or (
        org_id in (select authz.user_org_ids('{field_staff}'))
        and kind not in ('inventory', 'periodic_scan', 'verification')
      )
    )
  );

-- API users only (security invoker: current_user is the API role). Trusted
-- roles (service_role: pipeline, tests; postgres: migrations, demo) are not
-- restricted. Status changes along the visit (captured, processed, in_review)
-- stay with the roles that make them; publication rules are in
-- guard_session_publication.
create function private.guard_visit_planning()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_ops boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_is_ops := new.org_id in (select authz.user_org_ids('{ops}'));

  if tg_op = 'UPDATE' then
    if old.status = 'cancelled' then
      raise exception 'visit_cancelled' using errcode = 'P0001', hint = 'A cancelled visit is final; plan a new one.';
    end if;
    if new.status = 'cancelled' then
      if old.status <> 'planned' then
        raise exception 'visit_not_planned' using errcode = 'P0001',
          hint = 'Only a planned visit can be cancelled.';
      end if;
      if not v_is_ops then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    end if;
    if (new.org_id, new.parcel_id, new.kind, new.performer, new.planned_date, new.lead_user_id)
       is distinct from (old.org_id, old.parcel_id, old.kind, old.performer, old.planned_date, old.lead_user_id) then
      if old.status <> 'planned' then
        raise exception 'visit_not_planned' using errcode = 'P0001',
          hint = 'The plan of a visit changes only before it is captured.';
      end if;
      if not v_is_ops then
        raise exception 'forbidden' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.status = 'planned' and new.kind in ('inventory', 'periodic_scan', 'verification')
     and new.planned_date is null then
    raise exception 'planned_date_required' using errcode = '23514';
  end if;

  -- The lead is field staff of the visit's org. Only ops sets it, and ops
  -- reads every membership row of its org (RLS).
  if new.lead_user_id is not null
     and (tg_op = 'INSERT' or new.lead_user_id is distinct from old.lead_user_id)
     and not exists (
       select 1 from public.membership m
       where m.org_id = new.org_id and m.user_id = new.lead_user_id and m.role = 'field_staff'
     ) then
    raise exception 'lead_not_field_staff' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger session_guard_visit_planning
before insert or update on public.session
for each row execute function private.guard_visit_planning();

-- ---------------------------------------------------------------------------
-- 5. Parcel life cycle (MVP Module 1): registered -> inventory_planned
-- ---------------------------------------------------------------------------

-- Security definer: the status follows the visit whoever plans or cancels it.
create function private.sync_parcel_inventory_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'inventory' then
    return null;
  end if;

  if new.status = 'planned' and (tg_op = 'INSERT' or old.status is distinct from 'planned') then
    update public.parcel set status = 'inventory_planned'
    where id = new.parcel_id and status = 'registered';
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and not exists (
       select 1 from public.session s
       where s.parcel_id = new.parcel_id and s.kind = 'inventory' and s.status <> 'cancelled'
     ) then
    update public.parcel set status = 'registered'
    where id = new.parcel_id and status = 'inventory_planned';
  end if;
  return null;
end;
$$;

create trigger session_sync_parcel_inventory_status
after insert or update of status on public.session
for each row execute function private.sync_parcel_inventory_status();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.ops_owner_profiles(uuid) from public, anon;
revoke all on function public.ops_create_owner_profile(uuid, uuid, text, text, boolean, text, text, timestamptz, text) from public, anon;
revoke all on function public.ops_update_owner_profile(uuid, text, text, boolean, text, text, timestamptz, text) from public, anon;
revoke all on function public.ops_parcel_detail(uuid) from public, anon;
revoke all on function public.ops_save_parcel_detail(uuid, text, text, boolean, text, text, timestamptz, text, text, text) from public, anon;
revoke all on function public.ops_find_user_id(uuid, text, text) from public, anon;
revoke all on function public.ops_org_members(uuid) from public, anon;
revoke all on function public.ops_parcel_access(uuid) from public, anon;
revoke all on function public.add_owner_declared_boundary(uuid, jsonb, real) from public, anon;
revoke all on function public.register_parcel(uuid, jsonb, jsonb, jsonb, uuid) from public, anon;

grant execute on function public.ops_owner_profiles(uuid) to authenticated;
grant execute on function public.ops_create_owner_profile(uuid, uuid, text, text, boolean, text, text, timestamptz, text) to authenticated;
grant execute on function public.ops_update_owner_profile(uuid, text, text, boolean, text, text, timestamptz, text) to authenticated;
grant execute on function public.ops_parcel_detail(uuid) to authenticated;
grant execute on function public.ops_save_parcel_detail(uuid, text, text, boolean, text, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.ops_find_user_id(uuid, text, text) to authenticated;
grant execute on function public.ops_org_members(uuid) to authenticated;
grant execute on function public.ops_parcel_access(uuid) to authenticated;
grant execute on function public.add_owner_declared_boundary(uuid, jsonb, real) to authenticated;
grant execute on function public.register_parcel(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;

-- Runs inside the security definer functions above only.
revoke all on function private.check_owner_profile_input(text, text, text, boolean, timestamptz, text) from public;
