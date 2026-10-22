-- Owners add co-owners (hissedar) as viewers (docs/MVP.md Module 1, step 8:
-- "Sahip isterse hissedarları izleyici olarak ekler").
--
-- The access rule already lets an owner insert a viewer row
-- (parcel_access_insert), but an owner cannot know another person's account id,
-- and accounts are opened only by ops (no self sign-up, invite-user). So the
-- owner leaves an invitation (name + phone) and ops completes it: opens the
-- account if needed, records KVKK consent in the person's profile and grants
-- viewer access. Decision: the owner never learns whether a phone number has an
-- account; every invitation goes through ops.
--
-- The invitation holds a third person's name and phone: private schema, read
-- only through the functions below (owner: own parcel, masked; ops: full).
-- An owner removes a viewer directly (parcel_access_delete allows it).

create type private.viewer_invitation_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table private.viewer_invitation (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  -- E.164, like owner_profile.phone.
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  invited_by uuid references auth.users (id) on delete set null,
  status private.viewer_invitation_status not null default 'pending',
  -- Account that got viewer access when approved.
  user_id uuid references auth.users (id) on delete set null,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  check ((status = 'pending') = (resolved_at is null)),
  check (status <> 'approved' or user_id is not null)
);
comment on table private.viewer_invitation is
  'Owner asks ops to add a co-owner as viewer. Personal data of a third person: functions only, never sent to an LLM.';
create index viewer_invitation_parcel_idx on private.viewer_invitation (parcel_id, status);
create index viewer_invitation_org_idx on private.viewer_invitation (org_id, status);
-- One open invitation per phone and parcel.
create unique index viewer_invitation_pending_uq
  on private.viewer_invitation (parcel_id, phone) where status = 'pending';

alter table private.viewer_invitation enable row level security;
revoke all on private.viewer_invitation from public, anon, authenticated;
grant select, insert, update, delete on private.viewer_invitation to service_role;

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------

-- Returns the invitation id (the open one when the same phone is invited
-- again). Errors: forbidden (42501: not the parcel's owner), invalid_input
-- (22023; detail: field), too_many_invitations (P0001: 10 open per parcel).
create function public.owner_invite_viewer(p_parcel_id uuid, p_full_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_id uuid;
begin
  if p_parcel_id is null or p_parcel_id not in (select authz.user_parcel_ids('{owner}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phone';
  end if;
  select org_id into v_org from public.parcel where id = p_parcel_id;

  -- Serialise invitations of one parcel (limit and duplicate check).
  perform pg_advisory_xact_lock(hashtextextended('viewer_invitation:' || p_parcel_id::text, 0));

  select id into v_id from private.viewer_invitation
  where parcel_id = p_parcel_id and phone = v_phone and status = 'pending';
  if found then
    return v_id;
  end if;
  if (select count(*) from private.viewer_invitation
      where parcel_id = p_parcel_id and status = 'pending') >= 10 then
    raise exception 'too_many_invitations' using errcode = 'P0001';
  end if;

  insert into private.viewer_invitation (org_id, parcel_id, full_name, phone, invited_by)
  values (v_org, p_parcel_id, v_name, v_phone, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.owner_invite_viewer(uuid, text, text) is
  'Owner: ask ops to add a co-owner (name, E.164 phone) as viewer of the parcel.';

create function public.owner_cancel_viewer_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.viewer_invitation
  set status = 'cancelled', resolved_by = (select auth.uid()), resolved_at = now()
  where id = p_invitation_id and status = 'pending'
    and parcel_id in (select authz.user_parcel_ids('{owner}'));
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.owner_cancel_viewer_invitation(uuid) is 'Owner: withdraw an open invitation.';

-- Viewers and open (or rejected) invitations of the owner's parcel. The phone
-- is returned as its last two digits only; the name of a viewer comes from the
-- profile ops recorded. Empty for anyone but the parcel's owner.
create function public.owner_parcel_viewers(p_parcel_id uuid)
returns table (
  kind text,
  id uuid,
  user_id uuid,
  full_name text,
  phone_last2 text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'viewer', pa.id, pa.user_id, op.full_name, right(op.phone, 2), 'active', pa.created_at
  from public.parcel_access pa
  left join private.owner_profile op on op.user_id = pa.user_id and op.org_id = pa.org_id
  where pa.parcel_id = p_parcel_id and pa.role = 'viewer'
    and p_parcel_id in (select authz.user_parcel_ids('{owner}'))
  union all
  select 'invitation', vi.id, null, vi.full_name, right(vi.phone, 2), vi.status::text, vi.created_at
  from private.viewer_invitation vi
  where vi.parcel_id = p_parcel_id and vi.status in ('pending', 'rejected')
    and p_parcel_id in (select authz.user_parcel_ids('{owner}'))
  order by 1 desc, 7;
$$;
comment on function public.owner_parcel_viewers(uuid) is
  'Owner: viewers and open or rejected invitations of the parcel; phone as last two digits.';

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------

create function public.ops_viewer_invitations(p_org_id uuid)
returns table (
  id uuid,
  parcel_id uuid,
  parcel_name text,
  full_name text,
  phone text,
  invited_by_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select vi.id, vi.parcel_id, p.name, vi.full_name, vi.phone, op.full_name, vi.created_at
  from private.viewer_invitation vi
  join public.parcel p on p.id = vi.parcel_id
  left join private.owner_profile op on op.user_id = vi.invited_by and op.org_id = vi.org_id
  where vi.org_id = p_org_id and vi.status = 'pending'
    and p_org_id in (select authz.user_org_ids('{ops}'))
  order by vi.created_at;
$$;
comment on function public.ops_viewer_invitations(uuid) is
  'Ops: open viewer invitations of the org with the full phone (to open the account).';

-- Approve (grants viewer access to p_user_id) or reject an open invitation.
-- Errors: not_found (P0002), forbidden (42501), invalid_input (22023: approve
-- without an account), already_owner (P0001: the account owns the parcel).
create function public.ops_resolve_viewer_invitation(
  p_invitation_id uuid,
  p_approve boolean,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vi private.viewer_invitation;
begin
  select * into vi from private.viewer_invitation where id = p_invitation_id for update;
  if not found or vi.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if vi.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if vi.status <> 'pending' then
    raise exception 'not_found' using errcode = 'P0002', detail = 'not pending';
  end if;
  if p_approve is null or (p_approve and p_user_id is null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'p_user_id';
  end if;

  if p_approve then
    if exists (select 1 from public.parcel_access
               where parcel_id = vi.parcel_id and user_id = p_user_id and role = 'owner') then
      raise exception 'already_owner' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.parcel_access
                   where parcel_id = vi.parcel_id and user_id = p_user_id) then
      insert into public.parcel_access (org_id, parcel_id, user_id, role)
      values (vi.org_id, vi.parcel_id, p_user_id, 'viewer');
    end if;
  end if;

  update private.viewer_invitation
  set status = case when p_approve then 'approved' else 'rejected' end::private.viewer_invitation_status,
      user_id = case when p_approve then p_user_id end,
      resolved_by = (select auth.uid()),
      resolved_at = now()
  where id = vi.id;
end;
$$;
comment on function public.ops_resolve_viewer_invitation(uuid, boolean, uuid) is
  'Ops: approve (viewer access for the account) or reject an owner''s viewer invitation.';

revoke all on function public.owner_invite_viewer(uuid, text, text) from public, anon;
revoke all on function public.owner_cancel_viewer_invitation(uuid) from public, anon;
revoke all on function public.owner_parcel_viewers(uuid) from public, anon;
revoke all on function public.ops_viewer_invitations(uuid) from public, anon;
revoke all on function public.ops_resolve_viewer_invitation(uuid, boolean, uuid) from public, anon;
grant execute on function public.owner_invite_viewer(uuid, text, text) to authenticated;
grant execute on function public.owner_cancel_viewer_invitation(uuid) to authenticated;
grant execute on function public.owner_parcel_viewers(uuid) to authenticated;
grant execute on function public.ops_viewer_invitations(uuid) to authenticated;
grant execute on function public.ops_resolve_viewer_invitation(uuid, boolean, uuid) to authenticated;
