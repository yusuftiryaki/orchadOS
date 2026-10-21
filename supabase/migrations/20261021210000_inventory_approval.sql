-- Inventory approval: verification list, expert approval, frozen coding.
--
-- 1. verification_item: the office tool's verification list as items of a
--    `verification` session (MVP Module 2, steps 8-9). Read by org roles only;
--    written through the functions below (security definer, explicit role checks).
-- 2. create_verification_tour(): opens a planned verification session with its items.
-- 3. record_verification_result() / close_verification_item(): the field (or,
--    until the field app has the screen, the office) records what was found,
--    or closes an item without a field visit.
-- 4. approve_inventory(): expert-only; signs and publishes the inventory
--    session like publish_session() (no per-tree assessment needed) and marks
--    the parcel inventory_done.
-- 5. After approval, slot codes and positions are frozen (as the parcel's
--    numbering is, 20261018120100); tree attributes stay editable.
--
-- Model and contract: docs/veri-modeli.md ("Doğrulama listesi"),
-- docs/arayuzler.md ("Doğrulama kalemleri").

-- ---------------------------------------------------------------------------
-- 1. verification_item
-- ---------------------------------------------------------------------------

create type public.verification_reason as enum (
  'high_uncertainty', 'empty_slot', 'unsure', 'multi_stem', 'possible_sapling',
  'off_row', 'triangulation', 'other'
);
-- open: not looked at yet. checked: looked at (result recorded).
-- closed: closed without a field result (decided in the office, not needed).
create type public.verification_status as enum ('open', 'checked', 'closed');

create table public.verification_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  -- The verification session (kind = verification) the item belongs to.
  session_id uuid not null,
  slot_id uuid not null,
  -- Active tree of the slot when the item was created; null for an empty slot.
  tree_id uuid,
  reasons public.verification_reason[] not null check (cardinality(reasons) > 0),
  -- Office note for the crew ("look at the base, two stems?").
  note text,
  status public.verification_status not null default 'open',
  -- Result: is there a tree in the slot? Null until checked.
  tree_present boolean,
  -- Close-up photo taken on the visit (capture kind = photo).
  closeup_capture_id uuid,
  result_note text,
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (slot_id, parcel_id, org_id) references public.slot (id, parcel_id, org_id),
  foreign key (tree_id, parcel_id, org_id) references public.tree (id, parcel_id, org_id),
  foreign key (closeup_capture_id, parcel_id, org_id) references public.capture (id, parcel_id, org_id),
  unique (session_id, slot_id),
  check (status <> 'open' or (tree_present is null and checked_at is null and checked_by is null)),
  check (status <> 'checked' or (tree_present is not null and checked_at is not null)),
  check (status <> 'closed' or (checked_at is not null and length(btrim(coalesce(result_note, ''))) > 0))
);
comment on table public.verification_item is
  'Slot or tree the crew looks at on a verification visit (MVP Module 2, step 8). Org roles only.';
create index verification_item_org_id_idx on public.verification_item (org_id);
create index verification_item_parcel_id_idx on public.verification_item (parcel_id, status);
create index verification_item_slot_id_idx on public.verification_item (slot_id);
create index verification_item_tree_id_idx on public.verification_item (tree_id);
create index verification_item_capture_id_idx on public.verification_item (closeup_capture_id);

-- The session must be a verification visit and the tree must be in the slot.
create function private.validate_verification_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.session s where s.id = new.session_id and s.kind = 'verification') then
    raise exception 'session % is not a verification session', new.session_id using errcode = '23514';
  end if;
  if new.tree_id is not null and not exists (
    select 1 from public.tree t where t.id = new.tree_id and t.slot_id = new.slot_id
  ) then
    raise exception 'tree % is not in slot %', new.tree_id, new.slot_id using errcode = '23514';
  end if;
  if new.closeup_capture_id is not null and not exists (
    select 1 from public.capture c where c.id = new.closeup_capture_id and c.kind = 'photo'
  ) then
    raise exception 'capture % is not a photo', new.closeup_capture_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger verification_item_validate
before insert or update on public.verification_item
for each row execute function private.validate_verification_item();

alter table public.verification_item enable row level security;
-- Writes go through the functions below.
grant select on public.verification_item to authenticated;
grant all on public.verification_item to service_role;

create policy verification_item_select on public.verification_item for select to authenticated
  using (org_id in (select authz.user_org_ids()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True once an inventory session of the parcel is published (approve_inventory).
-- In authz (not private): the freeze triggers below call it as the API user.
create function authz.inventory_approved(p_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session s
    where s.parcel_id = p_parcel_id and s.kind = 'inventory' and s.status = 'published'
  );
$$;

-- A verification session whose items are all looked at is captured.
create function private.finish_verification_session(p_session_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.session
  set status = 'captured',
      started_at = coalesce(started_at, now()),
      ended_at = greatest(now(), coalesce(started_at, now()))
  where id = p_session_id
    and status = 'planned'
    and not exists (
      select 1 from public.verification_item v where v.session_id = p_session_id and v.status = 'open'
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. create_verification_tour
-- ---------------------------------------------------------------------------

-- p_items: json array of {"slot_id": uuid, "reasons": [reason, ...], "note": text | null}.
-- Opens a planned verification session (performer crew) and its items; the
-- tree of each item is the slot's active tree. Errors (message = reason):
--   forbidden      caller is not field staff or ops of the parcel's org
--   not_found      parcel not visible
--   invalid_input  malformed or empty p_items, a slot of another parcel, a slot twice
create function public.create_verification_tour(
  p_parcel_id uuid,
  p_items jsonb,
  p_planned_date date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  v_session_id uuid;
  v_item jsonb;
  v_slot public.slot;
  v_count integer := 0;
begin
  select * into p from public.parcel where id = p_parcel_id;
  if not found or (p.org_id not in (select authz.user_org_ids())
                   and p.id not in (select authz.user_parcel_ids())) then
    raise exception 'not_found' using errcode = 'P0002', detail = format('parcel %s', p_parcel_id);
  end if;
  if p.org_id not in (select authz.user_org_ids('{field_staff,ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_items must be a non-empty json array';
  end if;

  insert into public.session (org_id, parcel_id, kind, performer, status, planned_date, notes, created_by)
  values (p.org_id, p.id, 'verification', 'crew', 'planned', p_planned_date, p_notes, (select auth.uid()))
  returning id into v_session_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'reasons') <> 'array'
       or jsonb_array_length(v_item -> 'reasons') = 0 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'item without reasons';
    end if;
    begin
      select * into v_slot from public.slot
      where id = (v_item ->> 'slot_id')::uuid and parcel_id = p.id;
      if not found then
        raise exception 'invalid_input' using errcode = '22023', detail = format('slot %s', v_item ->> 'slot_id');
      end if;
      insert into public.verification_item (org_id, parcel_id, session_id, slot_id, tree_id, reasons, note, created_by)
      values (
        p.org_id, p.id, v_session_id, v_slot.id,
        (select t.id from public.tree t where t.slot_id = v_slot.id and t.status = 'active'),
        array(select distinct r::public.verification_reason
              from jsonb_array_elements_text(v_item -> 'reasons') as r order by 1),
        nullif(btrim(v_item ->> 'note'), ''),
        (select auth.uid())
      );
    exception
      when unique_violation then
        raise exception 'invalid_input' using errcode = '22023', detail = format('slot %s twice', v_slot.code);
      when invalid_text_representation then
        raise exception 'invalid_input' using errcode = '22023', detail = 'malformed slot id or reason';
    end;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('session_id', v_session_id, 'items', v_count);
end;
$$;
comment on function public.create_verification_tour(uuid, jsonb, date, text) is
  'Opens a planned verification session with its items (field staff, ops).';

-- ---------------------------------------------------------------------------
-- 3. record_verification_result / close_verification_item
-- ---------------------------------------------------------------------------

-- What the crew found at the slot. Applies it to the inventory:
--   tree_present = false and the slot has an active tree -> the tree becomes lost
--   tree_present = true and the slot is empty            -> a new active tree
--     (first seen on the verification session)
-- Can be recorded again while the item is not closed; the newest result counts.
-- Errors: forbidden (not field staff or ops of the org), not_found, item_closed,
-- invalid_input (tree_present missing).
create function public.record_verification_result(
  p_item_id uuid,
  p_tree_present boolean,
  p_note text default null,
  p_closeup_capture_id uuid default null
)
returns public.verification_item
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verification_item;
  s public.session;
  v_tree public.tree;
begin
  select * into v from public.verification_item where id = p_item_id for update;
  if not found or v.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002', detail = format('item %s', p_item_id);
  end if;
  if v.org_id not in (select authz.user_org_ids('{field_staff,ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v.status = 'closed' then
    raise exception 'item_closed' using errcode = '55000';
  end if;
  if p_tree_present is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'tree_present is required';
  end if;
  select * into s from public.session where id = v.session_id;

  select * into v_tree from public.tree where slot_id = v.slot_id and status = 'active';
  if found and not p_tree_present then
    update public.tree set status = 'lost', lost_at = now() where id = v_tree.id;
  elsif not found and p_tree_present then
    insert into public.tree (org_id, parcel_id, slot_id, first_seen_at, first_seen_session_id)
    values (v.org_id, v.parcel_id, v.slot_id, now(), s.id);
  end if;

  update public.verification_item
  set status = 'checked',
      tree_present = p_tree_present,
      result_note = nullif(btrim(p_note), ''),
      closeup_capture_id = coalesce(p_closeup_capture_id, closeup_capture_id),
      checked_by = (select auth.uid()),
      checked_at = now()
  where id = v.id
  returning * into v;

  perform private.finish_verification_session(v.session_id);
  return v;
end;
$$;
comment on function public.record_verification_result(uuid, boolean, text, uuid) is
  'Records what was found at a verification item and applies it to the inventory (field staff, ops).';

-- Closes an open item without a field result; the note says why.
-- Errors: forbidden (not an org role that writes the inventory), not_found,
-- item_not_open, invalid_input (empty note).
create function public.close_verification_item(p_item_id uuid, p_note text)
returns public.verification_item
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verification_item;
begin
  select * into v from public.verification_item where id = p_item_id for update;
  if not found or v.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002', detail = format('item %s', p_item_id);
  end if;
  if v.org_id not in (select authz.user_org_ids('{field_staff,expert,ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v.status <> 'open' then
    raise exception 'item_not_open' using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'a note is required';
  end if;

  update public.verification_item
  set status = 'closed', result_note = btrim(p_note), checked_by = (select auth.uid()), checked_at = now()
  where id = v.id
  returning * into v;

  perform private.finish_verification_session(v.session_id);
  return v;
end;
$$;
comment on function public.close_verification_item(uuid, text) is
  'Closes an open verification item without a field result (field staff, expert, ops).';

-- ---------------------------------------------------------------------------
-- 4. approve_inventory
-- ---------------------------------------------------------------------------

-- The expert signs the inventory. Publishes the inventory session as
-- publish_session() does (who and when; the session's findings and expert
-- assessments are approved in the signer's name), without its "every active
-- tree has an expert assessment" rule, and marks the parcel inventory_done
-- (a parcel already in monitoring keeps its status). Errors (message = reason):
--   forbidden             caller is not an expert of the session's org
--   session_invalid       not an inventory session, or planned / cancelled
--   already_published     the session is published
--   inventory_incomplete  detail lists what is missing, separated by "; ":
--                         "no_slots", "open_items: S1-2, S3-4"
create function public.approve_inventory(p_session_id uuid)
returns public.session
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_uid uuid := (select auth.uid());
  v_problems text[] := '{}';
  v_open text[];
begin
  select * into s from public.session where id = p_session_id for update;
  if not found or s.org_id not in (select authz.user_org_ids('{expert}')) then
    raise exception 'forbidden' using errcode = '42501', detail = format('session %s', p_session_id);
  end if;
  if s.kind <> 'inventory' then
    raise exception 'session_invalid' using errcode = '22023', detail = format('session %s is %s', s.id, s.kind);
  end if;
  if s.status = 'published' then
    raise exception 'already_published' using errcode = '55000';
  end if;
  if s.status not in ('captured', 'processed', 'in_review') then
    raise exception 'session_invalid' using errcode = '22023', detail = format('session %s is %s', s.id, s.status);
  end if;

  -- Two approvals of one parcel run one after the other.
  perform pg_advisory_xact_lock(hashtextextended('approve_inventory:' || s.parcel_id::text, 0));
  if authz.inventory_approved(s.parcel_id) then
    raise exception 'already_published' using errcode = '55000', detail = 'the parcel inventory is approved';
  end if;

  if not exists (select 1 from public.slot where parcel_id = s.parcel_id) then
    v_problems := v_problems || 'no_slots';
  end if;
  select array_agg(distinct sl.code order by sl.code)
  into v_open
  from public.verification_item v
  join public.slot sl on sl.id = v.slot_id
  where v.parcel_id = s.parcel_id and v.status = 'open';
  if v_open is not null then
    v_problems := v_problems || ('open_items: ' || array_to_string(v_open, ', '));
  end if;
  if cardinality(v_problems) > 0 then
    raise exception 'inventory_incomplete' using errcode = 'P0001',
      detail = array_to_string(v_problems, '; '),
      hint = 'Save the inventory and close every verification item before approving.';
  end if;

  update public.finding
  set approved_by = v_uid, approved_at = now()
  where session_id = s.id and approved_by is null;

  update public.assessment
  set approved_by = v_uid, approved_at = now()
  where session_id = s.id and source = 'expert' and approved_by is null;

  update public.session
  set status = 'published', published_at = now(), published_by = v_uid
  where id = s.id
  returning * into s;

  update public.parcel
  set status = 'inventory_done'
  where id = s.parcel_id and status in ('registered', 'inventory_planned');

  return s;
end;
$$;
comment on function public.approve_inventory(uuid) is
  'Expert signs the inventory: publishes the inventory session and marks the parcel inventory_done.';

revoke all on function public.create_verification_tour(uuid, jsonb, date, text) from public, anon;
revoke all on function public.record_verification_result(uuid, boolean, text, uuid) from public, anon;
revoke all on function public.close_verification_item(uuid, text) from public, anon;
revoke all on function public.approve_inventory(uuid) from public, anon;
grant execute on function public.create_verification_tour(uuid, jsonb, date, text) to authenticated;
grant execute on function public.record_verification_result(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.close_verification_item(uuid, text) to authenticated;
grant execute on function public.approve_inventory(uuid) to authenticated;

revoke all on function authz.inventory_approved(uuid) from public, anon;
grant execute on function authz.inventory_approved(uuid) to authenticated, service_role;
revoke all on function private.finish_verification_session(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 5. Frozen coding after approval
-- ---------------------------------------------------------------------------

-- Slot codes and positions are fixed once the inventory is approved, for
-- everyone (as the parcel numbering). API users cannot delete a slot either;
-- trusted roles still can (data erasure). New slots may be added (a tree
-- planted between two slots later gets a new interstitial code).
create function private.freeze_approved_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if current_user in ('authenticated', 'anon') and authz.inventory_approved(old.parcel_id) then
      raise exception 'slot % of parcel % cannot be deleted: the inventory is approved', old.code, old.parcel_id
        using errcode = 'P0001';
    end if;
    return old;
  end if;
  if not authz.inventory_approved(old.parcel_id) then
    return new;
  end if;
  if (new.row_no, new.position_no, new.suffix, new.kind, new.parcel_id, new.org_id,
      new.local_x_m, new.local_y_m, new.position_uncertainty_m)
       is distinct from
     (old.row_no, old.position_no, old.suffix, old.kind, old.parcel_id, old.org_id,
      old.local_x_m, old.local_y_m, old.position_uncertainty_m)
     or not extensions.st_orderingequals(new.position, old.position)
     or (new.position is null) <> (old.position is null) then
    raise exception 'code and position of slot % are fixed: the inventory of parcel % is approved',
      old.code, old.parcel_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger slot_freeze_after_inventory_approval
before update or delete on public.slot
for each row execute function private.freeze_approved_slot();

-- A tree stays in its slot once the inventory is approved; its attributes
-- (sex, graft, age class, cultivar, status) stay editable.
create function private.freeze_approved_tree_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slot_id is distinct from old.slot_id and authz.inventory_approved(old.parcel_id) then
    raise exception 'tree % cannot move to another slot: the inventory of parcel % is approved',
      old.id, old.parcel_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tree_freeze_slot_after_inventory_approval
before update on public.tree
for each row execute function private.freeze_approved_tree_slot();
