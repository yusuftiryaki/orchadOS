-- T16 (H07, H09; pilot): the boundary declaration, the person who pointed
-- out the boundary, and boundary disputes.
--
-- a) approve_boundary(p_boundary_id, p_declared): while
--    org_billing_setting.boundary_declaration_required is on (false on hosted
--    projects, true in seed.sql) the owner must declare "Gösterdiğim sınırın
--    fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin
--    vermeye yetkili olduğumu beyan ederim." (contract Md. 6/2). A declared
--    approval is recorded append-only in private.boundary_approval with the
--    current registered distance_sales version, the text's SHA-256 and the
--    time. With the switch off the approval works as before.
-- b) private.boundary_pointer: name and role of the person who showed the
--    boundary, copied from the field app's boundary_pointer events
--    (docs/arayuzler.md "Saha olayları") by an AFTER INSERT trigger on
--    session_event. An invalid payload is skipped silently: the field app's
--    insert never fails and nothing of the payload is logged. Staff read it
--    (staff_boundary_pointers: name and role, never a phone). The event
--    payload stays as the transport (staff only since T23).
-- c) private.boundary_dispute: ops opens and closes a dispute on a parcel
--    (append-only open/close rows with a note). While one is open, new
--    inventory and periodic visits are refused (boundary_dispute_open);
--    staff see the note, the owner portal a neutral notice that the
--    evaluation is suspended (contract Md. 6/4).

-- ---------------------------------------------------------------------------
-- a) Declaration on approval
-- ---------------------------------------------------------------------------

create table private.boundary_approval (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  boundary_id uuid not null references public.boundary (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- The registered distance_sales version (contract Md. 6/2) and the text.
  text_version text not null check (text_version ~ '^[a-z0-9][a-z0-9.-]{1,40}$'),
  declaration_sha256 text not null check (declaration_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade
);
comment on table private.boundary_approval is
  'T16 (H07): the owner''s boundary declaration on approval, append-only, with the distance_sales version and the text''s SHA-256.';
create index boundary_approval_parcel_idx on private.boundary_approval (parcel_id, approved_at desc);
alter table private.boundary_approval enable row level security;
revoke all on private.boundary_approval from public, anon, authenticated;
select private.attach_demo_guard('private.boundary_approval');

create function private.boundary_declaration()
returns table (body text, sha256 text)
language sql
immutable
set search_path = ''
as $$
  select 'Gösterdiğim sınırın fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin vermeye yetkili olduğumu beyan ederim.',
         encode(sha256(convert_to('Gösterdiğim sınırın fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin vermeye yetkili olduğumu beyan ederim.', 'UTF8')), 'hex');
$$;
revoke all on function private.boundary_declaration() from public;

create function private.append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
revoke all on function private.append_only() from public;
create trigger boundary_approval_append_only before update or delete on private.boundary_approval
for each row execute function private.append_only();

drop function public.approve_boundary(uuid);
-- As in 20261101120100_demo_write_guard.sql, plus p_declared (T16).
create function public.approve_boundary(p_boundary_id uuid, p_declared boolean default false)
returns public.boundary
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.boundary;
  v_org uuid;
  d record;
begin
  perform private.assert_not_demo();
  select x.org_id into v_org from public.boundary x where x.id = p_boundary_id;
  if v_org is not null and (private.billing_setting(v_org)).boundary_declaration_required
     and not coalesce(p_declared, false)
     and exists (select 1 from public.boundary x where x.id = p_boundary_id and x.owner_approved_at is null
                 and x.parcel_id in (select authz.user_parcel_ids('{owner}'))) then
    raise exception 'declaration_required' using errcode = 'P0001';
  end if;

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

  if coalesce(p_declared, false) then
    select * into d from private.boundary_declaration();
    insert into private.boundary_approval (org_id, parcel_id, boundary_id, user_id, text_version, declaration_sha256, approved_at)
    values (b.org_id, b.parcel_id, b.id, (select auth.uid()),
            coalesce((private.legal_text_current('distance_sales')).version, 'unknown'), d.sha256, b.owner_approved_at);
  end if;
  return b;
end;
$$;
comment on function public.approve_boundary(uuid, boolean) is
  'Owner approves a boundary version; with boundary_declaration_required on, the declaration (contract Md. 6/2) is required and recorded (T16).';
revoke all on function public.approve_boundary(uuid, boolean) from public, anon;
grant execute on function public.approve_boundary(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- b) Boundary pointer
-- ---------------------------------------------------------------------------

create table private.boundary_pointer (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  source_event_id uuid not null unique references public.session_event (id) on delete cascade,
  -- Personal data of a third person (KVKK scripts: pseudonymize).
  name text not null check (char_length(name) between 1 and 120),
  role text not null check (role in ('owner', 'owner_relative', 'worker', 'neighbor', 'other')),
  recorded_at timestamptz not null,
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade
);
comment on table private.boundary_pointer is
  'T16 (H07): name and role of the person who showed the boundary, from the field app''s boundary_pointer events. Staff only; never a phone.';
create index boundary_pointer_parcel_idx on private.boundary_pointer (parcel_id, recorded_at desc);
alter table private.boundary_pointer enable row level security;
revoke all on private.boundary_pointer from public, anon, authenticated;
select private.attach_demo_guard('private.boundary_pointer');
-- Insert-only, except the KVKK scripts (session_replication_role = replica).
create trigger boundary_pointer_append_only before update or delete on private.boundary_pointer
for each row execute function private.append_only();

-- From a session_event row: valid payload (JSON object with name 1-120
-- characters after trimming and a known role) -> one row; anything else
-- (other types, bad JSON, missing fields, a resend) -> nothing. Never raises.
create function private.copy_boundary_pointer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_name text;
  v_role text;
begin
  if new.event_type <> 'boundary_pointer' then
    return null;
  end if;
  begin
    v := new.payload::jsonb;
    if jsonb_typeof(v) <> 'object' then
      return null;
    end if;
    v_name := btrim(regexp_replace(coalesce(v ->> 'name', ''), '\s+', ' ', 'g'));
    v_role := v ->> 'role';
    if char_length(v_name) between 1 and 120
       and v_role in ('owner', 'owner_relative', 'worker', 'neighbor', 'other') then
      insert into private.boundary_pointer (org_id, parcel_id, session_id, source_event_id, name, role, recorded_at)
      values (new.org_id, new.parcel_id, new.session_id, new.id, v_name, v_role,
              new.phone_time)
      on conflict (source_event_id) do nothing;
    end if;
  exception when others then
    -- Never fail the field app's insert; nothing of the payload is logged.
    null;
  end;
  return null;
end;
$$;
revoke all on function private.copy_boundary_pointer() from public;
create trigger session_event_boundary_pointer after insert on public.session_event
for each row execute function private.copy_boundary_pointer();

-- Events recorded before this migration.
insert into private.boundary_pointer (org_id, parcel_id, session_id, source_event_id, name, role, recorded_at)
select e.org_id, e.parcel_id, e.session_id, e.id, x.name, x.j ->> 'role', e.phone_time
from public.session_event e
cross join lateral (
  select j, btrim(regexp_replace(coalesce(j ->> 'name', ''), '\s+', ' ', 'g')) as name
  from (select case when pg_input_is_valid(e.payload, 'jsonb') then e.payload::jsonb end as j) v
) x
where e.event_type = 'boundary_pointer'
  and jsonb_typeof(x.j) = 'object'
  and char_length(x.name) between 1 and 120
  and x.j ->> 'role' in ('owner', 'owner_relative', 'worker', 'neighbor', 'other')
on conflict (source_event_id) do nothing;

-- Staff of the parcel's org (field, expert, ops): who showed the boundary,
-- newest first. Name and role only.
create function public.staff_boundary_pointers(p_parcel_id uuid)
returns table (id uuid, session_id uuid, name text, role text, recorded_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select bp.id, bp.session_id, bp.name, bp.role, bp.recorded_at
  from private.boundary_pointer bp
  where bp.parcel_id = p_parcel_id
    and bp.org_id in (select authz.user_org_ids('{field_staff,expert,ops}'))
  order by bp.recorded_at desc, bp.id;
$$;
comment on function public.staff_boundary_pointers(uuid) is
  'T16 (H07): the people who showed the parcel''s boundary (name, role), for staff of its org.';
revoke all on function public.staff_boundary_pointers(uuid) from public, anon;
grant execute on function public.staff_boundary_pointers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- c) Boundary dispute
-- ---------------------------------------------------------------------------

create table private.boundary_dispute (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  action text not null check (action in ('open', 'close')),
  -- Free text by ops (may name the third party: KVKK scripts).
  note text check (note is null or char_length(note) between 1 and 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade
);
comment on table private.boundary_dispute is
  'T16 (H09, contract Md. 6/4): append-only open/close rows of a boundary dispute or suspension; the newest row decides.';
create index boundary_dispute_parcel_idx on private.boundary_dispute (parcel_id, created_at desc);
alter table private.boundary_dispute enable row level security;
revoke all on private.boundary_dispute from public, anon, authenticated;
select private.attach_demo_guard('private.boundary_dispute');
create trigger boundary_dispute_append_only before update or delete on private.boundary_dispute
for each row execute function private.append_only();

-- The open dispute row of a parcel, if any.
create function private.open_boundary_dispute(p_parcel_id uuid)
returns private.boundary_dispute
language sql
stable
security definer
set search_path = ''
as $$
  select d.* from (
    select x.* from private.boundary_dispute x
    where x.parcel_id = p_parcel_id
    order by x.created_at desc, x.id desc
    limit 1
  ) d
  where d.action = 'open';
$$;
revoke all on function private.open_boundary_dispute(uuid) from public;

create function authz.boundary_dispute_open(p_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.open_boundary_dispute(p_parcel_id)).id is not null;
$$;
revoke all on function authz.boundary_dispute_open(uuid) from public, anon;
grant execute on function authz.boundary_dispute_open(uuid) to authenticated, service_role;

-- Like guard_withdrawal_visit: API users; inserts of planned inventory and
-- periodic visits and moves of their day while planned. Status changes are
-- never refused (the field app keeps working on visits planned before).
create function private.guard_dispute_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.kind not in ('inventory', 'periodic_scan') or new.status <> 'planned' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.planned_date is not distinct from old.planned_date or old.status <> 'planned') then
    return new;
  end if;
  if authz.boundary_dispute_open(new.parcel_id) then
    raise exception 'boundary_dispute_open' using errcode = 'P0001',
      hint = 'The parcel has an open boundary dispute: close it before planning a scan.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_dispute_visit() from public;
create trigger session_guard_dispute before insert or update of planned_date on public.session
for each row execute function private.guard_dispute_visit();

create function public.ops_open_boundary_dispute(p_parcel_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform private.assert_not_demo();
  select p.org_id into v_org from public.parcel p where p.id = p_parcel_id;
  if v_org is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(v_org);
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('boundary_dispute:' || p_parcel_id::text, 0));
  if authz.boundary_dispute_open(p_parcel_id) then
    raise exception 'dispute_open' using errcode = 'P0001';
  end if;
  insert into private.boundary_dispute (org_id, parcel_id, action, note, created_by)
  values (v_org, p_parcel_id, 'open', v_note, (select auth.uid()))
  returning id into v_id;
  perform private.audit(v_org, (select auth.uid()), 'ops', 'boundary_dispute.opened', 'boundary_dispute', v_id,
    jsonb_build_object('parcel_id', p_parcel_id));
  return v_id;
end;
$$;

create function public.ops_close_boundary_dispute(p_parcel_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform private.assert_not_demo();
  select p.org_id into v_org from public.parcel p where p.id = p_parcel_id;
  if v_org is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(v_org);
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('boundary_dispute:' || p_parcel_id::text, 0));
  if not authz.boundary_dispute_open(p_parcel_id) then
    raise exception 'no_open_dispute' using errcode = 'P0001';
  end if;
  insert into private.boundary_dispute (org_id, parcel_id, action, note, created_by)
  values (v_org, p_parcel_id, 'close', v_note, (select auth.uid()))
  returning id into v_id;
  perform private.audit(v_org, (select auth.uid()), 'ops', 'boundary_dispute.closed', 'boundary_dispute', v_id,
    jsonb_build_object('parcel_id', p_parcel_id));
  return v_id;
end;
$$;

-- Readers of the parcel: {"open": bool, "since": time}; staff (field,
-- expert, ops) also get the history with notes ("history": [...]).
create function public.boundary_dispute_status(p_parcel_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'open', d.id is not null,
    'since', d.created_at
  ) || case when p.org_id in (select authz.user_org_ids()) then jsonb_build_object(
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('action', x.action, 'note', x.note, 'at', x.created_at,
                                          'by', (select u.email from auth.users u where u.id = x.created_by))
                       order by x.created_at desc, x.id desc)
      from private.boundary_dispute x where x.parcel_id = p.id), '[]'::jsonb))
  else '{}'::jsonb end
  from public.parcel p
  left join lateral (select * from private.open_boundary_dispute(p.id)) d on true
  where p.id = p_parcel_id
    and (p.id in (select authz.user_parcel_ids()) or p.org_id in (select authz.user_org_ids()));
$$;
comment on function public.boundary_dispute_status(uuid) is
  'T16: whether a boundary dispute is open on the parcel (readers); staff also read the history with notes.';

revoke all on function public.ops_open_boundary_dispute(uuid, text) from public, anon;
revoke all on function public.ops_close_boundary_dispute(uuid, text) from public, anon;
revoke all on function public.boundary_dispute_status(uuid) from public, anon;
grant execute on function public.ops_open_boundary_dispute(uuid, text) to authenticated;
grant execute on function public.ops_close_boundary_dispute(uuid, text) to authenticated;
grant execute on function public.boundary_dispute_status(uuid) to authenticated;
