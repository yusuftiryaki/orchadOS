-- Fixed grid route of a parcel (docs/MVP.md, Modül 3; docs/arayuzler.md, "Grid rotası").
--
-- The field app lays out the scan route (corridors along the rows, cross corridors,
-- edges) and the first route used on a parcel is kept as a version, so that every
-- later visit, from any phone, walks the same corridors. A new version is only made
-- when the inventory replaces a route laid out from the boundary alone.
--
-- 1. public.parcel_route: insert-only route versions, one row per (parcel, version).
-- 2. save_parcel_route(): the only way in. Idempotent on the id the phone derives
--    from parcel and route content; a new route takes the parcel's next version
--    (two phones that made different routes offline both keep theirs).
-- Which version a visit followed is in its `route` session event (route_id).

-- ---------------------------------------------------------------------------
-- 1. parcel_route
-- ---------------------------------------------------------------------------

create table public.parcel_route (
  -- uuid v5 of '<parcel_id>/<content_hash>', made on the phone.
  id uuid primary key,
  org_id uuid not null,
  parcel_id uuid not null,
  version integer not null check (version > 0),
  -- The route as the app lays it out (format 1): parameters and corridors in walking order.
  route jsonb not null check (
    jsonb_typeof(route) = 'object'
    and jsonb_typeof(route -> 'corridors') = 'array'
    and pg_column_size(route) <= 1048576
  ),
  -- SHA-256 (hex) of the route's canonical JSON on the phone.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Generator version (grid-route-v1, ...); stored so that a changed rule never rewrites old routes.
  generator text not null check (length(btrim(generator)) > 0),
  -- inventory: between the rows of the located slots; boundary: before the inventory.
  basis text not null check (basis in ('inventory', 'boundary')),
  -- The visit that first used it.
  session_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  unique (parcel_id, version),
  unique (parcel_id, content_hash)
);
comment on table public.parcel_route is
  'Grid route versions of a parcel (field app). The highest version is the route of the next visit. Insert-only.';
create index parcel_route_org_id_idx on public.parcel_route (org_id);
create index parcel_route_session_id_idx on public.parcel_route (session_id);

create trigger parcel_route_insert_only
before update or delete on public.parcel_route
for each row execute function private.forbid_mutation();
create trigger parcel_route_no_truncate
before truncate on public.parcel_route
for each statement execute function private.forbid_mutation();

alter table public.parcel_route enable row level security;
revoke all on public.parcel_route from anon, authenticated;
grant select on public.parcel_route to authenticated;
grant all on public.parcel_route to service_role;

-- Operational data like session events: org members only.
create policy parcel_route_select on public.parcel_route for select to authenticated
  using (org_id in (select authz.user_org_ids()));

-- ---------------------------------------------------------------------------
-- 2. save_parcel_route
-- ---------------------------------------------------------------------------

-- Stores a route the field app used on a visit. Returns {id, version, created}.
--   a known id            -> its row, created = false (a resend)
--   a new route           -> the parcel's next version, created = true
-- Errors: not_found (parcel not visible), forbidden (not field staff or ops of the
-- org), session_invalid (visit of another parcel or cancelled), invalid_input
-- (malformed route, hash or basis).
create function public.save_parcel_route(
  p_id uuid,
  p_parcel_id uuid,
  p_session_id uuid,
  p_route jsonb,
  p_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  s public.session;
  r public.parcel_route;
  v_version integer;
begin
  select * into p from public.parcel where id = p_parcel_id;
  if not found or p.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002', detail = format('parcel %s', p_parcel_id);
  end if;
  if p.org_id not in (select authz.user_org_ids('{field_staff,ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_session_id is not null then
    select * into s from public.session where id = p_session_id and parcel_id = p.id;
    if not found or s.status = 'cancelled' then
      raise exception 'session_invalid' using errcode = '22023', detail = format('session %s', p_session_id);
    end if;
  end if;
  if p_id is null or p_route is null or jsonb_typeof(p_route) <> 'object'
     or jsonb_typeof(p_route -> 'corridors') <> 'array'
     or coalesce(p_route ->> 'basis', '') not in ('inventory', 'boundary')
     or coalesce(btrim(p_route ->> 'generator'), '') = ''
     or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'malformed route';
  end if;

  -- One writer per parcel at a time: versions are handed out in order.
  perform pg_advisory_xact_lock(hashtextextended('save_parcel_route:' || p.id::text, 0));

  select * into r from public.parcel_route where id = p_id;
  if found then
    if r.parcel_id <> p.id then
      raise exception 'invalid_input' using errcode = '22023', detail = 'route id of another parcel';
    end if;
    return jsonb_build_object('id', r.id, 'version', r.version, 'created', false);
  end if;
  select * into r from public.parcel_route where parcel_id = p.id and content_hash = p_content_hash;
  if found then
    return jsonb_build_object('id', r.id, 'version', r.version, 'created', false);
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.parcel_route where parcel_id = p.id;
  insert into public.parcel_route (
    id, org_id, parcel_id, version, route, content_hash, generator, basis, session_id
  )
  values (
    p_id, p.org_id, p.id, v_version, p_route, p_content_hash,
    btrim(p_route ->> 'generator'), p_route ->> 'basis', p_session_id
  );
  return jsonb_build_object('id', p_id, 'version', v_version, 'created', true);
end;
$$;
comment on function public.save_parcel_route(uuid, uuid, uuid, jsonb, text) is
  'Stores a grid route the field app used on a visit as the parcel''s next version; idempotent on the id (field staff, ops).';

revoke all on function public.save_parcel_route(uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.save_parcel_route(uuid, uuid, uuid, jsonb, text) to authenticated;
