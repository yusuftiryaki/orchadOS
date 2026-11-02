-- Fruit species (meyve türü): orchadOS serves all fruit orchards; Antep
-- pistachio is the pilot (docs/veri-modeli.md, "Meyve türü";
-- docs/metodoloji.md, "Kapsam").
--
-- 1. public.fruit_species: lookup of species codes with their Turkish names.
--    Written by migrations only. has_methodology marks the species with a
--    defined assessment methodology (today only antep_fistigi); the others get
--    generic monitoring (inventory, panorama tour, general health, care,
--    weed) until the agronomist defines theirs.
-- 2. parcel.species: the main species of the orchard. Existing parcels are
--    the pilot's: backfilled to antep_fistigi (the column default, kept for
--    older direct inserts; the forms require a choice).
-- 3. tree.species: optional override for mixed orchards (null = the parcel's
--    species). tree.cultivar stays the variety (çeşit), e.g. Siirt.
-- 4. application_garden.species: chosen at sign-up, copied to the parcel on
--    activation (private.create_customer_parcel).
-- 5. register_parcel, customer_save_application_garden and
--    create_customer_parcel take the species (detail 'species' on an unknown
--    or inactive code). Ops edits a parcel's species and staff a tree's
--    override through the existing parcel_update / tree_update policies.

create table public.fruit_species (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  -- A methodology exists for this species (docs/metodoloji.md).
  has_methodology boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0
);
comment on table public.fruit_species is
  'Fruit species lookup (code, Turkish name). has_methodology: a species-specific methodology exists (only antep_fistigi so far).';
alter table public.fruit_species enable row level security;
select private.attach_demo_guard('public.fruit_species');
create policy fruit_species_select on public.fruit_species for select to anon, authenticated using (true);
grant select on public.fruit_species to anon, authenticated;

insert into public.fruit_species (code, name, has_methodology, sort_order) values
  ('antep_fistigi', 'Antep fıstığı', true, 10),
  ('zeytin', 'Zeytin', false, 20),
  ('mandalina', 'Mandalina', false, 30),
  ('portakal', 'Portakal', false, 40),
  ('limon', 'Limon', false, 50),
  ('greyfurt', 'Greyfurt', false, 60),
  ('nar', 'Nar', false, 70),
  ('incir', 'İncir', false, 80),
  ('kayisi', 'Kayısı', false, 90),
  ('kiraz', 'Kiraz', false, 100),
  ('elma', 'Elma', false, 110),
  ('ceviz', 'Ceviz', false, 120),
  ('badem', 'Badem', false, 130),
  ('diger', 'Diğer', false, 1000);

alter table public.parcel
  add column species text not null default 'antep_fistigi' references public.fruit_species (code);
comment on column public.parcel.species is 'Main fruit species of the orchard (public.fruit_species).';
create index parcel_species_idx on public.parcel (species);

alter table public.tree
  add column species text references public.fruit_species (code);
comment on column public.tree.species is
  'Fruit species of this tree when it differs from the parcel''s (mixed orchards); null = parcel.species.';
create index tree_species_idx on public.tree (species) where species is not null;

alter table public.application_garden
  add column species text not null default 'antep_fistigi' references public.fruit_species (code);
comment on column public.application_garden.species is 'Main fruit species declared at sign-up; copied to the parcel.';
create index application_garden_species_idx on public.application_garden (species);

-- Effective species of a tree.
create function public.tree_species(p_tree_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(t.species, p.species)
  from public.tree t join public.parcel p on p.id = t.parcel_id
  where t.id = p_tree_id;
$$;
comment on function public.tree_species(uuid) is 'Effective fruit species of a tree: its override, else the parcel''s (RLS of the caller applies).';
revoke all on function public.tree_species(uuid) from public, anon;
grant execute on function public.tree_species(uuid) to authenticated;

create or replace function public.register_parcel(
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
  -- Main fruit species; omitted by older callers: the pilot species.
  if not exists (
    select 1 from public.fruit_species s
    where s.code = coalesce(nullif(btrim(p_parcel ->> 'species'), ''), 'antep_fistigi') and s.active
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'species';
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
    estimated_tree_count, position, position_uncertainty_m, species
  )
  values (
    p_org_id, v_name,
    nullif(btrim(p_parcel ->> 'province'), ''), nullif(btrim(p_parcel ->> 'district'), ''),
    nullif(btrim(p_parcel ->> 'village'), ''),
    (p_parcel ->> 'estimated_area_m2')::numeric,
    coalesce(p_parcel ->> 'irrigation', 'unknown')::public.irrigation_type,
    (p_parcel ->> 'estimated_tree_count')::integer,
    v_position, v_uncertainty, coalesce(nullif(btrim(p_parcel ->> 'species'), ''), 'antep_fistigi')
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

create or replace function private.create_customer_parcel(p_garden_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.application_garden;
  d private.application_garden_detail;
  v_id uuid;
begin
  select * into g from public.application_garden where id = p_garden_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if g.parcel_id is not null then
    return g.parcel_id;
  end if;

  insert into public.parcel (
    org_id, name, province, district, village, estimated_area_m2, irrigation, estimated_tree_count, position,
    position_uncertainty_m, species
  )
  values (
    g.org_id, g.name, g.province, g.district, g.village, coalesce(g.verified_area_m2, g.declared_area_m2),
    g.irrigation, g.estimated_tree_count, g.position, g.position_uncertainty_m, g.species
  )
  returning id into v_id;

  select * into d from private.application_garden_detail x where x.application_garden_id = g.id;
  if found then
    insert into private.parcel_detail (
      parcel_id, org_id, deed_block, deed_parcel, is_shared_deed, used_portion_note, authorization_basis,
      entry_permission_at, access_note, site_contact_name, site_contact_phone
    )
    values (
      v_id, g.org_id, d.deed_block, d.deed_parcel, d.is_shared_deed, d.used_portion_note, d.authorization_basis,
      d.entry_permission_at, d.access_note, d.site_contact_name, d.site_contact_phone
    );
  end if;

  -- The rough boundary (validated when saved or verified) as version 1.
  if g.boundary is not null then
    perform pg_advisory_xact_lock(hashtextextended('boundary:' || v_id::text, 0));
    insert into public.boundary (org_id, parcel_id, version, geom, source)
    values (g.org_id, v_id, 1, g.boundary, 'owner_declared');
  end if;

  insert into public.parcel_access (org_id, parcel_id, user_id, role, granted_by)
  values (g.org_id, v_id, g.customer_user_id, 'owner', null);

  update public.application_garden set parcel_id = v_id where id = g.id;
  return v_id;
end;
$$;

create or replace function public.customer_save_application_garden(
  p_application_id uuid,
  p_garden jsonb,
  p_detail jsonb,
  p_garden_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.service_application;
  v_id uuid := p_garden_id;
  v_name text;
  v_province text;
  v_district text;
  v_village text;
  v_area numeric;
  v_irrigation text;
  v_trees numeric;
  v_lon numeric;
  v_lat numeric;
  v_uncertainty numeric;
  v_boundary extensions.geometry;
  v_basis text;
  v_shared boolean;
  v_entry boolean;
  v_contact_phone text;
  v_species text;
begin
  a := private.lock_own_application(p_application_id);
  if a.status <> 'draft' then
    raise exception 'application_not_draft' using errcode = 'P0001';
  end if;
  if v_id is not null and not exists (
    select 1 from public.application_garden g where g.id = v_id and g.application_id = a.id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_id is null and (select count(*) from public.application_garden g where g.application_id = a.id) >= 10 then
    raise exception 'too_many_gardens' using errcode = 'P0001';
  end if;
  if p_garden is null or jsonb_typeof(p_garden) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'garden';
  end if;
  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'detail';
  end if;

  v_name := private.input_text(p_garden, 'name', 1, 120, true);
  v_province := private.input_text(p_garden, 'province', 1, 100);
  v_district := private.input_text(p_garden, 'district', 1, 100);
  v_village := private.input_text(p_garden, 'village', 1, 100);
  v_area := private.input_number(p_garden, 'declared_area_m2', true);
  if v_area not between 500 and 10000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'declared_area_m2';
  end if;
  v_irrigation := coalesce(private.input_text(p_garden, 'irrigation', 1, 20), 'unknown');
  if v_irrigation not in ('irrigated', 'rainfed', 'unknown') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'irrigation';
  end if;
  -- Main fruit species (required by the form; omitted by older callers: the
  -- garden's current species, else the pilot species).
  v_species := coalesce(
    private.input_text(p_garden, 'species', 1, 32),
    (select g.species from public.application_garden g where g.id = v_id),
    'antep_fistigi'
  );
  if not exists (select 1 from public.fruit_species s where s.code = v_species and s.active) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'species';
  end if;
  v_trees := private.input_number(p_garden, 'estimated_tree_count');
  if v_trees is not null and (v_trees <> trunc(v_trees) or v_trees not between 0 and 1000000) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'estimated_tree_count';
  end if;
  v_lon := private.input_number(p_garden, 'lon', true);
  v_lat := private.input_number(p_garden, 'lat', true);
  if abs(v_lon) > 180 or abs(v_lat) > 90 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'position';
  end if;
  v_uncertainty := coalesce(private.input_number(p_garden, 'position_uncertainty_m'), 100);
  if v_uncertainty <= 0 or v_uncertainty > 100000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'position_uncertainty_m';
  end if;
  if p_garden -> 'boundary' is not null and jsonb_typeof(p_garden -> 'boundary') <> 'null' then
    v_boundary := private.ring_polygon(p_garden -> 'boundary');
  end if;

  v_basis := private.input_text(p_detail, 'authorization_basis', 1, 40);
  if v_basis is not null and v_basis not in ('title_holder', 'power_of_attorney', 'heir_declaration') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'authorization_basis';
  end if;
  v_entry := private.input_bool(p_detail, 'entry_permission');
  if v_entry is distinct from true then
    raise exception 'invalid_input' using errcode = '22023', detail = 'entry_permission';
  end if;
  v_shared := private.input_bool(p_detail, 'is_shared_deed');
  v_contact_phone := private.input_text(p_detail, 'site_contact_phone', 8, 16);
  if v_contact_phone is not null and v_contact_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'site_contact_phone';
  end if;

  begin
    if v_id is null then
      insert into public.application_garden (
        org_id, application_id, customer_user_id, sort_order, name, province, district, village,
        declared_area_m2, irrigation, estimated_tree_count, position, position_uncertainty_m, boundary, species
      )
      values (
        a.org_id, a.id, a.customer_user_id,
        coalesce((select max(g.sort_order) + 1 from public.application_garden g where g.application_id = a.id), 1),
        v_name, v_province, v_district, v_village, v_area, v_irrigation::public.irrigation_type, v_trees,
        extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326), v_uncertainty, v_boundary, v_species
      )
      returning id into v_id;
    else
      update public.application_garden
      set name = v_name, province = v_province, district = v_district, village = v_village,
          declared_area_m2 = v_area, irrigation = v_irrigation::public.irrigation_type,
          estimated_tree_count = v_trees,
          position = extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326),
          position_uncertainty_m = v_uncertainty, boundary = v_boundary, species = v_species
      where id = v_id;
    end if;

    insert into private.application_garden_detail (
      application_garden_id, org_id, authorization_basis, deed_block, deed_parcel, is_shared_deed,
      used_portion_note, entry_permission_at, access_note, site_contact_name, site_contact_phone
    )
    values (
      v_id, a.org_id, v_basis::private.authorization_basis,
      private.input_text(p_detail, 'deed_block', 1, 50), private.input_text(p_detail, 'deed_parcel', 1, 50),
      v_shared, private.input_text(p_detail, 'used_portion_note', 1, 1000), now(),
      private.input_text(p_detail, 'access_note', 1, 1000), private.input_text(p_detail, 'site_contact_name', 1, 120),
      v_contact_phone
    )
    on conflict (application_garden_id) do update
    set authorization_basis = excluded.authorization_basis, deed_block = excluded.deed_block,
        deed_parcel = excluded.deed_parcel, is_shared_deed = excluded.is_shared_deed,
        used_portion_note = excluded.used_portion_note, access_note = excluded.access_note,
        site_contact_name = excluded.site_contact_name, site_contact_phone = excluded.site_contact_phone;
  exception
    when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023';
  end;
  return v_id;
end;
$$;

