-- T15 (H30, H32; pilot): co-owner invitation SMS, first-login KVKK notice
-- acknowledgement, the owner's invitation declaration. All three only while
-- org_billing_setting.coowner_notice_flow_enabled is on (false on hosted
-- projects, true in seed.sql); with it off everything works as before.
--
-- a) viewer_invited: when ops approves an owner's co-owner invitation (the
--    step that opens the co-owner's portal access, after invite-user opened
--    the account), one SMS is queued to the co-owner. Variables: the parcel
--    name and the portal path only; the KVKK notice link is the fixed site
--    path /kvkk (supabase/functions/_shared/messaging.ts). Never for a demo
--    org. Ops granting access directly (no invitation) sends nothing: the
--    text says the owner gave the number.
-- b) First-login acknowledgement (H30: an "okudum" confirmation, never an
--    approval or consent): portal_notice_status() tells the portal layout
--    whether to show the notice; portal_acknowledge_kvkk_notice() records it
--    in private.consent_record (kind kvkk_notice, source portal, the current
--    registered version). Required for an owner whose profile ops opened and
--    for a co-owner who came through an invitation, until they acknowledged
--    it themselves (sign-up, portal or quote acceptance). Demo users never.
-- c) owner_invite_viewer takes p_declared: the owner's declaration "Bu kişinin
--    bahçede hakkı var ve numarasını vermeye yetkiliyim." is required while
--    the switch is on and stored with the invitation (time, text version and
--    the text's SHA-256).

-- ---------------------------------------------------------------------------
-- c) Declaration on the invitation
-- ---------------------------------------------------------------------------

alter table private.viewer_invitation
  add column declared_at timestamptz,
  add column declaration_version text check (declaration_version ~ '^[a-z0-9][a-z0-9.-]{1,40}$'),
  add column declaration_sha256 text check (declaration_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint viewer_invitation_declaration_check
    check ((declared_at is null) = (declaration_version is null) and (declared_at is null) = (declaration_sha256 is null));
comment on column private.viewer_invitation.declared_at is
  'T15 (H32): when the owner declared "Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim." (version and SHA-256 of the text alongside).';

-- The declaration text and its version (the web shows the same text,
-- apps/web/src/lib/portal/viewers.ts).
create function private.viewer_declaration()
returns table (version text, body text, sha256 text)
language sql
immutable
set search_path = ''
as $$
  select 'davet-beyani-v1-taslak',
         'Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim.',
         encode(sha256(convert_to('Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim.', 'UTF8')), 'hex');
$$;
revoke all on function private.viewer_declaration() from public;

drop function public.owner_invite_viewer(uuid, text, text);
-- As in 20261101120100_demo_write_guard.sql, plus p_declared: required while
-- coowner_notice_flow_enabled is on (declaration_required, P0001), and
-- recorded when given.
create function public.owner_invite_viewer(
  p_parcel_id uuid,
  p_full_name text,
  p_phone text,
  p_declared boolean default false
)
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
  d record;
begin
  perform private.assert_not_demo();
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
  if (private.billing_setting(v_org)).coowner_notice_flow_enabled and not coalesce(p_declared, false) then
    raise exception 'declaration_required' using errcode = 'P0001';
  end if;
  select * into d from private.viewer_declaration();

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

  insert into private.viewer_invitation (
    org_id, parcel_id, full_name, phone, invited_by, declared_at, declaration_version, declaration_sha256
  ) values (
    v_org, p_parcel_id, v_name, v_phone, (select auth.uid()),
    case when coalesce(p_declared, false) then now() end,
    case when coalesce(p_declared, false) then d.version end,
    case when coalesce(p_declared, false) then d.sha256 end
  )
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.owner_invite_viewer(uuid, text, text, boolean) is
  'Owner invites a co-owner (name, phone) for ops to complete; with the co-owner flow on, the owner''s declaration is required and recorded (T15).';
revoke all on function public.owner_invite_viewer(uuid, text, text, boolean) from public, anon;
grant execute on function public.owner_invite_viewer(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- a) Invitation SMS
-- ---------------------------------------------------------------------------

create function private.on_viewer_invitation_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.user_id is not null
     and (private.billing_setting(new.org_id)).coowner_notice_flow_enabled
     and not private.is_demo_org(new.org_id) then
    insert into public.notification (org_id, parcel_id, recipient_user_id, channel, template, vars, ref_id)
    select new.org_id, new.parcel_id, new.user_id, 'sms', 'viewer_invited',
           jsonb_build_object('parcel_name', p.name, 'path', '/portal'), new.id
    from public.parcel p where p.id = new.parcel_id
    on conflict do nothing;
  end if;
  return null;
end;
$$;
comment on function private.on_viewer_invitation_approved() is
  'T15: queues the viewer_invited SMS (parcel name and portal path only) when ops approves an invitation and the co-owner flow is on.';
revoke all on function private.on_viewer_invitation_approved() from public;
create trigger viewer_invitation_approved
after update of status on private.viewer_invitation
for each row execute function private.on_viewer_invitation_approved();

-- ---------------------------------------------------------------------------
-- b) First-login acknowledgement
-- ---------------------------------------------------------------------------

-- Orgs in which the caller still owes the portal acknowledgement.
create function private.notice_due_orgs(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pa.org_id
  from public.parcel_access pa
  where pa.user_id = p_user_id
    and not private.is_demo_org(pa.org_id)
    and (private.billing_setting(pa.org_id)).coowner_notice_flow_enabled
    and (
      exists (select 1 from private.owner_profile op where op.org_id = pa.org_id and op.user_id = p_user_id)
      or exists (select 1 from private.viewer_invitation vi
                 where vi.org_id = pa.org_id and vi.user_id = p_user_id and vi.status = 'approved')
    )
    and not exists (
      select 1 from private.consent_record cr
      where cr.org_id = pa.org_id and cr.user_id = p_user_id and cr.kind = 'kvkk_notice' and cr.granted
        and cr.source in ('signup', 'portal', 'quote_acceptance')
    );
$$;
revoke all on function private.notice_due_orgs(uuid) from public;

-- {"required": bool, "version": current kvkk_notice version}; never required
-- for a demo user.
create function public.portal_notice_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'required', not authz.is_demo_user() and exists (select 1 from private.notice_due_orgs((select auth.uid()))),
    'version', (private.legal_text_current('kvkk_notice')).version
  );
$$;
comment on function public.portal_notice_status() is
  'T15 (H30): whether the portal must show the KVKK notice for an "okudum" acknowledgement, and the current version.';

-- Records the acknowledgement in every org where it is due. Errors:
-- invalid_input (text_version: not the current registered version).
create function public.portal_acknowledge_kvkk_notice(p_text_version text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  n integer := 0;
begin
  perform private.assert_not_demo();
  if v_user is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.text_version_ok(p_text_version)
     or p_text_version is distinct from (private.legal_text_current('kvkk_notice')).version then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_version';
  end if;
  for v_org in select * from private.notice_due_orgs(v_user) loop
    insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
    values (v_org, v_user, v_user, 'kvkk_notice', true, p_text_version, 'portal');
    perform private.audit(v_org, v_user, 'customer', 'consent.acknowledged', 'consent', v_user,
      jsonb_build_object('kind', 'kvkk_notice', 'text_version', p_text_version, 'source', 'portal'));
    n := n + 1;
  end loop;
  return n;
end;
$$;
comment on function public.portal_acknowledge_kvkk_notice(text) is
  'T15 (H30): any portal user records that they read the KVKK notice (current registered version); returns the orgs recorded.';

revoke all on function public.portal_notice_status() from public, anon;
revoke all on function public.portal_acknowledge_kvkk_notice(text) from public, anon;
grant execute on function public.portal_notice_status() to authenticated;
grant execute on function public.portal_acknowledge_kvkk_notice(text) to authenticated;
