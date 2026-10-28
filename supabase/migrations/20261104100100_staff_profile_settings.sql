-- Legal follow-ups, wave 2 (T23, T15, T16, T11): settings, audit entity
-- types, and the approving expert's name and title (H05).
--
-- 1. org_billing_setting switches of this wave, SQL only like
--    marketing_consent_enabled: false on hosted projects, true in seed.sql.
--    coowner_notice_flow_enabled (T15: invitation SMS, first-login notice,
--    owner declaration), boundary_declaration_required (T16: declaration on
--    boundary approval), kvkk_request_form_enabled (T11: portal KVKK form).
-- 2. audit_event entity types of this wave.
-- 3. private.staff_profile: a staff member's display name and title, edited by
--    ops (ops_staff, ops_save_staff_profile). H05: "Raporu onaylayan uzmanın
--    adı ve unvanı, demo dışında raporda ve portalda gösterilir."
--    public.visit_approver(session) gives a reader of a published visit the
--    publisher's name and title; null in a demo org or without a profile.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting
  add column coowner_notice_flow_enabled boolean not null default false,
  add column boundary_declaration_required boolean not null default false,
  add column kvkk_request_form_enabled boolean not null default false;
comment on column public.org_billing_setting.coowner_notice_flow_enabled is
  'SQL only. T15 (H30, H32): co-owner invitation SMS, first-login KVKK notice acknowledgement and the owner''s invitation declaration.';
comment on column public.org_billing_setting.boundary_declaration_required is
  'SQL only. T16 (H07): boundary approval requires the declaration (contract Md. 6/2), recorded with the text version.';
comment on column public.org_billing_setting.kvkk_request_form_enabled is
  'SQL only. T11 (H26): the portal KVKK application form under Hesabım › İzinler.';

-- As in 20261103100100_legal_text_registry.sql, with the defaults of the new
-- columns (and legal_gate_enforced of 20261103100700).
create or replace function private.billing_setting(p_org_id uuid)
returns public.org_billing_setting
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.org_billing_setting;
begin
  select * into r from public.org_billing_setting s where s.org_id = p_org_id;
  if not found then
    r.org_id := p_org_id;
    r.accepts_signups := false;
    r.allow_fake_payments := false;
    r.identity_number_required := false;
    r.payment_due_days := 14;
    r.quote_valid_days := 30;
    r.renewal_notice_days := 45;
    r.garden_changes_enabled := false;
    r.addon_min_days := 30;
    r.removal_notice_days := 30;
    r.removal_access_days := 90;
    r.removal_refund_mode := 'unused_visits';
    r.marketing_consent_enabled := false;
    r.inventory_reuse_months := 24;
    r.legal_gate_enforced := false;
    r.coowner_notice_flow_enabled := false;
    r.boundary_declaration_required := false;
    r.kvkk_request_form_enabled := false;
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Audit entity types
-- ---------------------------------------------------------------------------

alter table public.audit_event drop constraint audit_event_entity_type_check;
alter table public.audit_event add constraint audit_event_entity_type_check
  check (entity_type in (
    'signup', 'consent', 'billing_profile', 'owner_profile', 'application', 'application_garden',
    'quote', 'order', 'payment', 'refund', 'price_list', 'package', 'billing_setting', 'garden_removal',
    -- Wave 2 of the legal follow-ups.
    'staff_profile', 'media_suppression', 'boundary', 'boundary_dispute', 'viewer_invitation', 'kvkk_request'
  ));

-- ---------------------------------------------------------------------------
-- 3. Staff profile
-- ---------------------------------------------------------------------------

create table private.staff_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  title text check (title is null or char_length(btrim(title)) between 2 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table private.staff_profile is
  'Staff display name and title (H05: the approving expert is named on the report). Edited by ops of an org the user is a member of.';
alter table private.staff_profile enable row level security;
select private.attach_demo_guard('private.staff_profile');
select private.attach_demo_account_guard('private.staff_profile');
revoke all on private.staff_profile from public, anon, authenticated;

-- Members of the org (any staff role) with their profile; ops only.
create function public.ops_staff(p_org_id uuid)
returns table (user_id uuid, roles text[], email text, full_name text, title text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  return query
  select m.user_id,
         array_agg(m.role::text order by m.role::text),
         u.email::text,
         sp.full_name,
         sp.title,
         sp.updated_at
  from public.membership m
  join auth.users u on u.id = m.user_id
  left join private.staff_profile sp on sp.user_id = m.user_id
  where m.org_id = p_org_id
  group by m.user_id, u.email, sp.full_name, sp.title, sp.updated_at
  order by sp.full_name nulls last, u.email;
end;
$$;
comment on function public.ops_staff(uuid) is
  'Ops: the org''s staff (field, expert, ops) with display name and title (T23).';

-- p_title null or blank: no title (the report shows the name only and ops is warned).
create function public.ops_save_staff_profile(p_org_id uuid, p_user_id uuid, p_full_name text, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), '');
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
begin
  perform private.require_ops(p_org_id);
  perform private.assert_not_demo();
  if not exists (select 1 from public.membership m where m.org_id = p_org_id and m.user_id = p_user_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'full_name';
  end if;
  if v_title is not null and char_length(v_title) not between 2 and 120 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'title';
  end if;
  insert into private.staff_profile (user_id, full_name, title, updated_at, updated_by)
  values (p_user_id, v_name, v_title, now(), (select auth.uid()))
  on conflict (user_id) do update
    set full_name = excluded.full_name, title = excluded.title,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'staff_profile.saved', 'staff_profile', p_user_id,
    jsonb_build_object('has_title', v_title is not null));
end;
$$;
comment on function public.ops_save_staff_profile(uuid, uuid, text, text) is
  'Ops: sets a staff member''s display name and title (T23, H05). Audited without the name.';

-- The expert who signed a published visit, for anyone who reads that visit:
-- {"name": ..., "title": ...} (title may be null); null for a visit the
-- caller cannot read, a demo org, no publisher or no profile.
create function public.visit_approver(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', sp.full_name, 'title', sp.title)
  from public.session s
  join private.staff_profile sp on sp.user_id = s.published_by
  where s.id = p_session_id
    and s.status = 'published'
    and not private.is_demo_org(s.org_id)
    and (
      s.org_id in (select authz.user_org_ids())
      or s.id in (select authz.user_published_session_ids())
    );
$$;
comment on function public.visit_approver(uuid) is
  'T23 (H05): name and title of the expert who published the visit; null in the demo or when unknown.';

revoke all on function public.ops_staff(uuid) from public, anon;
revoke all on function public.ops_save_staff_profile(uuid, uuid, text, text) from public, anon;
revoke all on function public.visit_approver(uuid) from public, anon;
grant execute on function public.ops_staff(uuid) to authenticated;
grant execute on function public.ops_save_staff_profile(uuid, uuid, text, text) to authenticated;
grant execute on function public.visit_approver(uuid) to authenticated;
