-- Boundary from the field survey (IP4 pipeline, docs/arayuzler.md "Sınır köşeleri ve kapsama").
--
-- The field app records the boundary walk as session events (corner,
-- boundary_corners). The pipeline positions the corners (PPK trajectory, or
-- the phone / logger position with a large uncertainty) and records the
-- polygon as the next boundary version, source field_survey, with the
-- session, the largest corner uncertainty and the survey time.
--
-- add_field_survey_boundary() does that in one transaction under the same
-- per-parcel lock as add_owner_declared_boundary(), so the version number
-- cannot race. It is idempotent per session: when the newest version from
-- the same session has the same vertices in the same order and the same
-- uncertainty, that row is returned and no version is added (re-running the
-- pipeline with the same corner list and trajectory). Different vertices
-- (e.g. a re-run with base data, now PPK) are a new version.
--
-- Runs as the caller (security invoker): ops only. Errors: not_found,
-- forbidden, session_cancelled, invalid_input (detail: field), boundary_invalid.

create function public.add_field_survey_boundary(
  p_session_id uuid,
  p_ring jsonb,
  p_vertex_uncertainty_m real,
  p_surveyed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.session;
  b public.boundary;
  v_ring jsonb := p_ring;
  v_point jsonb;
  v_geom extensions.geometry;
begin
  select * into s from public.session where id = p_session_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if s.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;
  if p_vertex_uncertainty_m is null or p_vertex_uncertainty_m < 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'vertex_uncertainty_m';
  end if;
  if p_surveyed_at is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'surveyed_at';
  end if;

  -- A json ring of [lon, lat] pairs in walking order, at least three points;
  -- closed here when open. Same rules as add_owner_declared_boundary().
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
  if not (extensions.st_isvaliddetail(v_geom)).valid or extensions.st_area(v_geom) = 0 then
    raise exception 'boundary_invalid' using errcode = '22023', detail = 'self-intersecting or empty';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('boundary:' || s.parcel_id::text, 0));

  select * into b from public.boundary x
  where x.parcel_id = s.parcel_id and x.session_id = s.id
  order by x.version desc
  limit 1;
  if found and b.source = 'field_survey'
     and extensions.st_orderingequals(b.geom, v_geom)
     and b.vertex_uncertainty_m = p_vertex_uncertainty_m then
    return jsonb_build_object('id', b.id, 'version', b.version, 'area_m2', b.area_m2, 'created', false);
  end if;

  insert into public.boundary (
    org_id, parcel_id, version, geom, source, vertex_uncertainty_m, session_id, surveyed_at
  )
  values (
    s.org_id, s.parcel_id,
    coalesce((select max(x.version) from public.boundary x where x.parcel_id = s.parcel_id), 0) + 1,
    v_geom, 'field_survey', p_vertex_uncertainty_m, s.id, p_surveyed_at
  )
  returning * into b;
  return jsonb_build_object('id', b.id, 'version', b.version, 'area_m2', b.area_m2, 'created', true);
end;
$$;
comment on function public.add_field_survey_boundary(uuid, jsonb, real, timestamptz) is
  'Pipeline (ops) records the boundary surveyed in a session as the next boundary version (source field_survey); idempotent per session and vertex list.';
revoke all on function public.add_field_survey_boundary(uuid, jsonb, real, timestamptz) from public, anon;
grant execute on function public.add_field_survey_boundary(uuid, jsonb, real, timestamptz) to authenticated;
