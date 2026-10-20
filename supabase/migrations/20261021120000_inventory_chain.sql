-- IP5 v0.2: inventory chain.
--
-- 1. trunk_label: every trunk click of the office triangulation tool, kept as a
--    label for a future trunk detector (which panorama, where in it, which
--    tree / slot, who clicked, when). Append-only for API users; read by org
--    roles only (owners and viewers never see it).
-- 2. save_inventory(): slots, trees and trunk labels of a first inventory in
--    one transaction, as the caller (security invoker). Replaces the office
--    tool's two separate inserts.

-- ---------------------------------------------------------------------------
-- 1. trunk_label
-- ---------------------------------------------------------------------------

create table public.trunk_label (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  -- Session whose panoramas were clicked (usually the inventory session).
  session_id uuid not null,
  -- The panorama asset clicked (full or preview variant). Null only when the
  -- panorama did not come from the database (local development source).
  panorama_asset_id uuid,
  -- Capture time of the panorama frame, GPS time in ns (docs/arayuzler.md,
  -- "Zaman"); identifies the frame across its full and preview variants.
  panorama_gps_time_ns bigint,
  -- Click relative to the panorama's centre column (pose.heading_deg): yaw to
  -- the right positive, pitch up positive. Pixels follow from the image size:
  -- x = (yaw / 360 + 0.5) * width, y = (0.5 - pitch / 180) * height.
  yaw_deg double precision not null check (yaw_deg >= -180 and yaw_deg <= 180),
  pitch_deg double precision not null check (pitch_deg >= -90 and pitch_deg <= 90),
  -- Absolute direction of the click: heading_deg + yaw_deg, clockwise from north.
  azimuth_deg double precision not null check (azimuth_deg >= 0 and azimuth_deg < 360),
  -- What was clicked. A label outlives neither: deleting a labelled tree or
  -- slot fails until its labels are removed by a trusted role.
  tree_id uuid,
  slot_id uuid,
  -- The labeller marked the tree "not sure", or moved the triangulated position by hand.
  unsure boolean not null default false,
  moved boolean not null default false,
  method text not null default 'office_triangulation',
  method_version text,
  labelled_by uuid not null default auth.uid() references auth.users (id),
  labelled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (panorama_asset_id, parcel_id, org_id) references public.asset (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  foreign key (slot_id, parcel_id, org_id) references public.slot (id, parcel_id, org_id),
  check (num_nonnulls(panorama_asset_id, panorama_gps_time_ns) >= 1),
  check (num_nonnulls(tree_id, slot_id) >= 1)
);
comment on table public.trunk_label is
  'Trunk click in a panorama (office triangulation tool): labelled data for a trunk detector. Append-only; org roles only.';
create index trunk_label_org_id_idx on public.trunk_label (org_id);
create index trunk_label_parcel_id_idx on public.trunk_label (parcel_id);
create index trunk_label_session_id_idx on public.trunk_label (session_id);
create index trunk_label_panorama_asset_id_idx on public.trunk_label (panorama_asset_id);
create index trunk_label_tree_id_idx on public.trunk_label (tree_id);
create index trunk_label_slot_id_idx on public.trunk_label (slot_id);

-- The clicked asset must be a panorama, and the slot must hold the tree.
create function private.validate_trunk_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.panorama_asset_id is not null and not exists (
    select 1 from public.asset a where a.id = new.panorama_asset_id and a.kind = 'panorama'
  ) then
    raise exception 'asset % is not a panorama', new.panorama_asset_id using errcode = '23514';
  end if;
  if new.tree_id is not null and new.slot_id is not null and not exists (
    select 1 from public.tree t where t.id = new.tree_id and t.slot_id = new.slot_id
  ) then
    raise exception 'tree % is not in slot %', new.tree_id, new.slot_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trunk_label_validate
before insert on public.trunk_label
for each row execute function private.validate_trunk_label();

-- Append-only for API users. Trusted roles (service_role: tests, data erasure;
-- postgres: migrations) may still delete, so a labelled tree can be removed
-- deliberately; nobody updates a label.
create function private.trunk_label_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' or current_user in ('authenticated', 'anon') then
    raise exception '% on public.trunk_label is not allowed: table is append-only', tg_op
      using errcode = 'P0001', hint = 'Insert a new label instead of changing an existing one.';
  end if;
  return old;
end;
$$;

create trigger trunk_label_append_only
before update or delete on public.trunk_label
for each row execute function private.trunk_label_append_only();

alter table public.trunk_label enable row level security;
grant select, insert on public.trunk_label to authenticated;
grant all on public.trunk_label to service_role;

create policy trunk_label_select on public.trunk_label for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy trunk_label_insert on public.trunk_label for insert to authenticated
  with check (
    org_id in (select authz.user_org_ids('{field_staff,ops}'))
    and labelled_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 2. save_inventory
-- ---------------------------------------------------------------------------

-- p_slots: json array, one element per slot of the computed layout:
--   {"row_no": int, "position_no": int, "suffix": "a" | null, "kind": "row" | "interstitial",
--    "lon": number, "lat": number, "uncertainty_m": number,
--    "local_x_m": number | null, "local_y_m": number | null,
--    "tree": null | {"unsure": bool, "moved": bool, "labels": [label, ...]}}
-- label:
--   {"panorama_asset_id": uuid | null, "panorama_gps_time_ns": "digits" | null,
--    "yaw_deg": number, "pitch_deg": number, "azimuth_deg": number, "labelled_at": timestamptz | null}
--
-- Writes the slots, an active tree for every slot with a tree
-- (first_seen_session_id = p_session_id, first_seen_at = session start) and the
-- tree's trunk labels. Errors (message = reason, for the web app):
--   forbidden            caller is not field staff or ops of the parcel's org
--   not_found            parcel not visible
--   session_invalid      session not of this parcel, cancelled, or not an inventory / scan session
--   existing_inventory   the parcel already has slots or trees (detail: "<slots>/<trees>")
--   numbering_mismatch   numbering differs from the one recorded on the parcel
--   numbering_forbidden  numbering not recorded yet and the caller may not update the parcel (ops only)
--   invalid_input        malformed p_slots
-- Any other failing row (constraint, foreign key) rolls the whole call back.
create function public.save_inventory(
  p_parcel_id uuid,
  p_session_id uuid,
  p_corner public.corner,
  p_row_azimuth_deg real,
  p_slots jsonb,
  p_method_version text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.parcel;
  s public.session;
  v_slot jsonb;
  v_label jsonb;
  v_slot_id uuid;
  v_tree_id uuid;
  v_slots integer := 0;
  v_trees integer := 0;
  v_labels integer := 0;
  v_existing_slots integer;
  v_existing_trees integer;
  v_first_seen timestamptz;
begin
  select * into p from public.parcel where id = p_parcel_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = format('parcel %s', p_parcel_id);
  end if;
  -- Row level security would also let experts write slots and trees; an
  -- inventory is saved by field staff or ops.
  if p.org_id not in (select authz.user_org_ids('{field_staff,ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into s from public.session where id = p_session_id and parcel_id = p.id;
  if not found or s.status = 'cancelled' or s.kind not in ('inventory', 'periodic_scan') then
    raise exception 'session_invalid' using errcode = '22023', detail = format('session %s', p_session_id);
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_slots must be a non-empty json array';
  end if;

  -- Two saves of the same parcel run one after the other, so the second one
  -- sees the first one's slots.
  perform pg_advisory_xact_lock(hashtextextended('save_inventory:' || p.id::text, 0));
  select count(*) into v_existing_slots from public.slot where parcel_id = p.id;
  select count(*) into v_existing_trees from public.tree where parcel_id = p.id;
  if v_existing_slots > 0 or v_existing_trees > 0 then
    raise exception 'existing_inventory' using errcode = 'P0001',
      detail = format('%s/%s', v_existing_slots, v_existing_trees);
  end if;

  if p.numbering_origin_corner is not null and p.row_azimuth_deg is not null then
    if p.numbering_origin_corner <> p_corner or abs(p.row_azimuth_deg - p_row_azimuth_deg) > 1e-4 then
      raise exception 'numbering_mismatch' using errcode = 'P0001';
    end if;
  else
    -- Chosen once per parcel (MVP Module 2). Row level security lets only ops
    -- update a parcel; for anyone else no row is updated.
    update public.parcel
    set numbering_origin_corner = p_corner, row_azimuth_deg = p_row_azimuth_deg
    where id = p.id;
    if not found then
      raise exception 'numbering_forbidden' using errcode = '42501';
    end if;
  end if;

  v_first_seen := coalesce(s.started_at, now());

  for v_slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) <> 'object' or jsonb_typeof(v_slot -> 'lon') <> 'number'
       or jsonb_typeof(v_slot -> 'lat') <> 'number' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'slot without a position';
    end if;

    insert into public.slot (
      org_id, parcel_id, row_no, position_no, suffix, kind,
      position, position_uncertainty_m, local_x_m, local_y_m
    )
    values (
      p.org_id, p.id, (v_slot ->> 'row_no')::integer, (v_slot ->> 'position_no')::integer,
      v_slot ->> 'suffix', coalesce(v_slot ->> 'kind', 'row')::public.slot_kind,
      extensions.st_setsrid(
        extensions.st_makepoint((v_slot ->> 'lon')::double precision, (v_slot ->> 'lat')::double precision),
        4326
      ),
      (v_slot ->> 'uncertainty_m')::real,
      (v_slot ->> 'local_x_m')::double precision, (v_slot ->> 'local_y_m')::double precision
    )
    returning id into v_slot_id;
    v_slots := v_slots + 1;

    if jsonb_typeof(v_slot -> 'tree') = 'object' then
      insert into public.tree (org_id, parcel_id, slot_id, first_seen_at, first_seen_session_id)
      values (p.org_id, p.id, v_slot_id, v_first_seen, s.id)
      returning id into v_tree_id;
      v_trees := v_trees + 1;

      for v_label in
        select value from jsonb_array_elements(coalesce(v_slot -> 'tree' -> 'labels', '[]'::jsonb))
      loop
        insert into public.trunk_label (
          org_id, parcel_id, session_id, panorama_asset_id, panorama_gps_time_ns,
          yaw_deg, pitch_deg, azimuth_deg, tree_id, slot_id, unsure, moved,
          method_version, labelled_at
        )
        values (
          p.org_id, p.id, s.id, (v_label ->> 'panorama_asset_id')::uuid,
          (v_label ->> 'panorama_gps_time_ns')::bigint,
          (v_label ->> 'yaw_deg')::double precision, (v_label ->> 'pitch_deg')::double precision,
          (v_label ->> 'azimuth_deg')::double precision, v_tree_id, v_slot_id,
          coalesce((v_slot -> 'tree' ->> 'unsure')::boolean, false),
          coalesce((v_slot -> 'tree' ->> 'moved')::boolean, false),
          p_method_version, coalesce((v_label ->> 'labelled_at')::timestamptz, now())
        );
        v_labels := v_labels + 1;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('slots', v_slots, 'trees', v_trees, 'labels', v_labels);
end;
$$;
comment on function public.save_inventory(uuid, uuid, public.corner, real, jsonb, text) is
  'First inventory of a parcel (slots, trees, trunk labels) in one transaction, as the caller.';
revoke all on function public.save_inventory(uuid, uuid, public.corner, real, jsonb, text) from public, anon;
grant execute on function public.save_inventory(uuid, uuid, public.corner, real, jsonb, text) to authenticated;
