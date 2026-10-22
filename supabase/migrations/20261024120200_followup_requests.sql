-- Expert follow-up requests and the server-side close-up list
-- (docs/MVP.md Module 3 step 6, Module 4 "gerekirse ek ziyaret ister";
-- docs/metodoloji.md section 7). Contract for the field app: docs/arayuzler.md,
-- "Yakın plan listesi ve uzman istekleri".
--
-- 1. followup_request: the expert (or ops) asks for
--      closeup       a closer look at a tree on the next visit (close-up list)
--      verification  a tree on a verification tour
--      extra_visit   an extra visit to the parcel (optionally about one tree)
--    Requests are not results: they stay with the org (owners do not see
--    them) and can be made after publication.
-- 2. Life cycle: open -> planned (ops linked a visit) -> done; or cancelled.
--    A close-up request is done when a close-up photo of the tree arrives from
--    a later visit. A planned request is done when its visit is captured.
-- 3. closeup_list(session): the trees the crew photographs up close on a
--    periodic scan, with the reasons, computed on the server so every phone
--    and the office see the same list.

create type public.followup_kind as enum ('closeup', 'verification', 'extra_visit');
create type public.followup_status as enum ('open', 'planned', 'done', 'cancelled');

create table public.followup_request (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  -- Visit under review when the request was made.
  source_session_id uuid not null,
  kind public.followup_kind not null,
  tree_id uuid,
  note text check (note is null or length(note) <= 2000),
  status public.followup_status not null default 'open',
  -- Visit that handles the request (planned, done).
  target_session_id uuid,
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (source_session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (target_session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  check (kind = 'extra_visit' or tree_id is not null),
  check (kind <> 'extra_visit' or length(btrim(coalesce(note, ''))) > 0),
  check (status not in ('planned', 'done') or target_session_id is not null),
  check ((status in ('open', 'planned')) = (resolved_at is null))
);
comment on table public.followup_request is
  'Expert asks for a close-up on the next visit, a verification of a tree or an extra visit. Org roles only.';
create index followup_request_org_idx on public.followup_request (org_id, status);
create index followup_request_parcel_idx on public.followup_request (parcel_id, status);
create index followup_request_tree_idx on public.followup_request (tree_id);
create index followup_request_source_idx on public.followup_request (source_session_id);
create index followup_request_target_idx on public.followup_request (target_session_id);
-- One open request per tree and kind.
create unique index followup_request_open_uq on public.followup_request (tree_id, kind)
  where status in ('open', 'planned') and tree_id is not null;

alter table public.followup_request enable row level security;
revoke all on public.followup_request from anon, authenticated;
grant select on public.followup_request to authenticated;
grant all on public.followup_request to service_role;

-- Read: org roles. Writes only through the functions below.
create policy followup_request_select on public.followup_request for select to authenticated
  using (org_id in (select authz.user_org_ids()));

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- Returns the request id (the open one when the same tree and kind is asked
-- again; the note is then appended). Errors: not_found (P0002), forbidden
-- (42501: not expert or ops of the visit's org), invalid_input (22023).
create function public.request_followup(
  p_session_id uuid,
  p_kind public.followup_kind,
  p_tree_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  select * into s from public.session where id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.org_id not in (select authz.user_org_ids('{expert,ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or s.status = 'cancelled' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_kind';
  end if;
  if p_kind <> 'extra_visit' and p_tree_id is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_tree_id';
  end if;
  if p_tree_id is not null and not exists (
    select 1 from public.tree t where t.id = p_tree_id and t.parcel_id = s.parcel_id and t.status = 'active'
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_tree_id';
  end if;
  if p_kind = 'extra_visit' and v_note is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_note';
  end if;
  if length(coalesce(v_note, '')) > 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_note';
  end if;

  if p_tree_id is not null then
    select id into v_id from public.followup_request
    where tree_id = p_tree_id and kind = p_kind and status in ('open', 'planned')
    for update;
    if found then
      if v_note is not null then
        update public.followup_request
        set note = left(concat_ws(E'\n', note, v_note), 2000)
        where id = v_id;
      end if;
      return v_id;
    end if;
  end if;

  insert into public.followup_request (org_id, parcel_id, source_session_id, kind, tree_id, note, requested_by)
  values (s.org_id, s.parcel_id, s.id, p_kind, p_tree_id, v_note, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.request_followup(uuid, public.followup_kind, uuid, text) is
  'Expert or ops: close-up on the next visit, verification of a tree, or an extra visit (note required).';

-- Expert or ops withdraws an open or planned request.
create function public.cancel_followup(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.followup_request
  set status = 'cancelled', resolved_by = (select auth.uid()), resolved_at = now()
  where id = p_request_id and status in ('open', 'planned')
    and org_id in (select authz.user_org_ids('{expert,ops}'));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.cancel_followup(uuid) is 'Expert or ops: withdraw an open or planned follow-up request.';

-- Ops links open requests of one parcel to the visit that handles them
-- (status planned). Verification requests need a verification visit; their
-- trees become items of it (reason other, the request's note). Close-up
-- requests are not planned: the next scan's close-up list carries them.
-- Returns the number of linked requests. Errors: not_found, forbidden,
-- invalid_input (detail: which request or why).
create function public.ops_plan_followups(p_request_ids uuid[], p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  r public.followup_request;
  v_slot uuid;
  v_count integer := 0;
begin
  select * into s from public.session where id = p_session_id for update;
  if not found or s.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if s.status in ('cancelled', 'published') or coalesce(cardinality(p_request_ids), 0) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'session';
  end if;

  for r in select * from public.followup_request where id = any (p_request_ids) order by created_at for update loop
    if r.parcel_id <> s.parcel_id or r.status <> 'open' or r.kind = 'closeup' then
      raise exception 'invalid_input' using errcode = '22023', detail = format('request %s', r.id);
    end if;
    if r.kind = 'verification' then
      if s.kind <> 'verification' then
        raise exception 'invalid_input' using errcode = '22023', detail = 'verification request needs a verification visit';
      end if;
      select t.slot_id into v_slot from public.tree t where t.id = r.tree_id;
      insert into public.verification_item (org_id, parcel_id, session_id, slot_id, tree_id, reasons, note, created_by)
      values (s.org_id, s.parcel_id, s.id, v_slot, r.tree_id, '{other}', r.note, (select auth.uid()))
      on conflict (session_id, slot_id) do nothing;
    end if;
    update public.followup_request
    set status = 'planned', target_session_id = s.id
    where id = r.id;
    v_count := v_count + 1;
  end loop;
  if v_count <> cardinality(p_request_ids) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'unknown request';
  end if;
  return v_count;
end;
$$;
comment on function public.ops_plan_followups(uuid[], uuid) is
  'Ops: link open verification or extra-visit requests of a parcel to the visit that handles them.';

-- ---------------------------------------------------------------------------
-- Done, automatically
-- ---------------------------------------------------------------------------

-- A close-up photo of the tree from a later visit fulfils its close-up request.
create function private.fulfil_closeup_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'photo' and new.tree_id is not null then
    update public.followup_request
    set status = 'done', target_session_id = new.session_id, resolved_at = now()
    where tree_id = new.tree_id and kind = 'closeup' and status in ('open', 'planned')
      and source_session_id <> new.session_id;
  end if;
  return null;
end;
$$;

create trigger capture_fulfil_closeup_requests
after insert on public.capture
for each row execute function private.fulfil_closeup_requests();

-- The planned visit is captured (or later): its requests are done.
create function private.fulfil_planned_followups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('captured', 'processed', 'in_review', 'published')
     and old.status in ('planned', 'cancelled') then
    update public.followup_request
    set status = 'done', resolved_at = now()
    where target_session_id = new.id and status = 'planned';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    -- The visit was cancelled: the requests are open again.
    update public.followup_request
    set status = 'open', target_session_id = null
    where target_session_id = new.id and status = 'planned';
  end if;
  return null;
end;
$$;

create trigger session_fulfil_planned_followups
after update of status on public.session
for each row execute function private.fulfil_planned_followups();

-- ---------------------------------------------------------------------------
-- Close-up list
-- ---------------------------------------------------------------------------

-- The close-up list of a periodic scan (docs/metodoloji.md section 7). One row
-- per active tree with at least one reason:
--   previous_class  newest published scan or verification before this visit:
--                   expert class attention, problem or dead
--   sample          stratified random sample: 10% of the active trees
--                   (rounded up), balanced over 10 x 10 m cells
--   staff_problem   the crew marked "Sorun gördüm" on this visit (problem_seen)
--   expert_request  open close-up request of the expert
--
-- Cells: east/north metres from the south-west corner of the bounding box of
-- the parcel's newest boundary (else of its slots), x = dlon * R * cos(south),
-- y = dlat * R, R = 6 371 008.8 m; cell = (floor(x / 10), floor(y / 10)).
-- Trees without a position share one cell. Within a cell trees are ranked by
-- md5('<session>:<tree>'); the sample takes rank 1 of every cell, then rank 2,
-- ..., cells in md5('<session>:<cx>,<cy>') order. The same visit always gives
-- the same list.
--
-- Security invoker: org roles read it (field staff downloads it with the day's
-- tasks); errors: not_found, forbidden (owners and viewers).
create function public.closeup_list(p_session_id uuid)
returns table (
  tree_id uuid,
  slot_id uuid,
  slot_code text,
  row_no integer,
  position_no integer,
  reasons text[]
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.session;
  v_time timestamptz;
begin
  select * into s from public.session ss where ss.id = p_session_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if s.org_id not in (select authz.user_org_ids()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_time := coalesce(s.started_at, s.planned_date::timestamp at time zone 'UTC', s.created_at);

  return query
  with active as (
    select t.id as tree_id, sl.id as slot_id, sl.code as slot_code, sl.row_no, sl.position_no, sl.position
    from public.tree t
    join public.slot sl on sl.id = t.slot_id
    where t.parcel_id = s.parcel_id and t.status = 'active'
  ),
  frame as (
    select extensions.st_xmin(b.ext) as west, extensions.st_ymin(b.ext) as south
    from (
      select coalesce(
        (select extensions.st_envelope(bd.geom) from public.boundary bd
         where bd.parcel_id = s.parcel_id order by bd.version desc limit 1),
        (select extensions.st_envelope(extensions.st_collect(a.position)) from active a where a.position is not null)
      ) as ext
    ) b
  ),
  cells as (
    select a.tree_id,
      case when a.position is null or f.west is null then null
        else floor((extensions.st_x(a.position) - f.west) * pi() / 180 * 6371008.8
                   * cos(radians(f.south)) / 10)::bigint end as cx,
      case when a.position is null or f.south is null then null
        else floor((extensions.st_y(a.position) - f.south) * pi() / 180 * 6371008.8 / 10)::bigint end as cy
    from active a cross join frame f
  ),
  ranked as (
    select c.tree_id,
      row_number() over (partition by c.cx, c.cy order by md5(p_session_id::text || ':' || c.tree_id::text)) as rk,
      md5(p_session_id::text || ':' || coalesce(c.cx::text, '') || ',' || coalesce(c.cy::text, '')) as cell_key
    from cells c
  ),
  sample as (
    select r.tree_id from ranked r
    order by r.rk, r.cell_key
    limit (select ceil(count(*) * 0.10)::integer from active)
  ),
  previous as (
    select ps.id from public.session ps
    where ps.parcel_id = s.parcel_id and ps.id <> s.id and ps.status = 'published'
      and ps.kind in ('periodic_scan', 'verification')
      and coalesce(ps.started_at, ps.planned_date::timestamp at time zone 'UTC', ps.created_at) < v_time
      and exists (select 1 from public.assessment pa where pa.session_id = ps.id and pa.source = 'expert')
    order by coalesce(ps.started_at, ps.planned_date::timestamp at time zone 'UTC', ps.created_at) desc
    limit 1
  ),
  previous_class as (
    select distinct on (a.tree_id) a.tree_id, a.overall_class
    from public.assessment a
    where a.session_id = (select id from previous) and a.source = 'expert' and a.tree_id is not null
    order by a.tree_id, a.assessed_at desc, a.created_at desc, a.id
  ),
  staff_problem as (
    select distinct on (m.tree_id) m.tree_id, m.value_boolean
    from public.measurement m
    join public.metric_definition md on md.id = m.metric_definition_id and md.code = 'problem_seen'
    where m.session_id = s.id and m.source = 'staff' and m.tree_id is not null
    order by m.tree_id, m.measured_at desc, m.created_at desc, m.id
  ),
  reasons as (
    select pc.tree_id, 'previous_class'::text as reason from previous_class pc
    where pc.overall_class in ('attention', 'problem', 'dead')
    union all
    select sm.tree_id, 'sample' from sample sm
    union all
    select sp.tree_id, 'staff_problem' from staff_problem sp where sp.value_boolean
    union all
    select fr.tree_id, 'expert_request' from public.followup_request fr
    where fr.parcel_id = s.parcel_id and fr.kind = 'closeup' and fr.status in ('open', 'planned')
      and fr.source_session_id <> s.id
  )
  select a.tree_id, a.slot_id, a.slot_code, a.row_no, a.position_no,
    array_agg(distinct r.reason order by r.reason)
  from active a
  join reasons r on r.tree_id = a.tree_id
  group by a.tree_id, a.slot_id, a.slot_code, a.row_no, a.position_no
  order by a.row_no nulls last, a.position_no nulls last, a.slot_code;
end;
$$;
comment on function public.closeup_list(uuid) is
  'Close-up list of a visit: previous class, stratified 10% sample over 10 m cells, crew "problem seen", expert requests.';

revoke all on function public.request_followup(uuid, public.followup_kind, uuid, text) from public, anon;
revoke all on function public.cancel_followup(uuid) from public, anon;
revoke all on function public.ops_plan_followups(uuid[], uuid) from public, anon;
revoke all on function public.closeup_list(uuid) from public, anon;
grant execute on function public.request_followup(uuid, public.followup_kind, uuid, text) to authenticated;
grant execute on function public.cancel_followup(uuid) to authenticated;
grant execute on function public.ops_plan_followups(uuid[], uuid) to authenticated;
grant execute on function public.closeup_list(uuid) to authenticated;
