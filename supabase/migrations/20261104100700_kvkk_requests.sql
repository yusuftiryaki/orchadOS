-- T11 (H26; "sonra"): the portal KVKK application form and the ops list with
-- the 30-day counter (docs/hukuk/kvkk-basvuru-proseduru.md). Behind
-- org_billing_setting.kvkk_request_form_enabled (false on hosted projects,
-- true in seed.sql).
--
-- A signed-in portal user (owner, co-owner or customer) of an org with the
-- switch on files a request: type and message. The portal session counts as
-- the applicant's verified identity (prosedür §3). due_at = filed + 30 days
-- (KVKK md. 13/2). Ops moves it through open → in_progress → answered or
-- rejected; every change is audited (status only, never the message). The
-- request is the application register entry: kept 10 years after it is
-- settled (saklama-imha-politikasi.md §2.2), not deleted on request.

create table private.kvkk_request (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  -- The applicant; kept when the account is deleted.
  subject_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  request_type text not null check (request_type in ('access', 'rectification', 'erasure', 'objection', 'other')),
  -- The applicant's free text (personal data).
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'answered', 'rejected')),
  created_at timestamptz not null default now(),
  due_at timestamptz not null,
  settled_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status in ('answered', 'rejected')) = (settled_at is not null))
);
comment on table private.kvkk_request is
  'T11 (H26): KVKK applications from the portal (30-day deadline); the application register entry, kept 10 years after it is settled.';
create index kvkk_request_org_idx on private.kvkk_request (org_id, status, due_at);
create index kvkk_request_subject_idx on private.kvkk_request (subject_id);
alter table private.kvkk_request enable row level security;
revoke all on private.kvkk_request from public, anon, authenticated;
select private.attach_demo_guard('private.kvkk_request');
select private.attach_demo_account_guard('private.kvkk_request', 'subject_id');

-- The org a portal user files with: the customer org, else the org of a
-- parcel they can read; only orgs with the form switched on.
create function private.kvkk_request_org(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o from (
    select private.customer_org_id(p_user_id) as o, 0 as n
    union all
    select pa.org_id, 1 from public.parcel_access pa where pa.user_id = p_user_id
  ) x
  where o is not null and not private.is_demo_org(o) and (private.billing_setting(o)).kvkk_request_form_enabled
  order by n, o
  limit 1;
$$;
revoke all on function private.kvkk_request_org(uuid) from public;

create function public.portal_kvkk_form_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not authz.is_demo_user() and private.kvkk_request_org((select auth.uid())) is not null;
$$;
comment on function public.portal_kvkk_form_enabled() is 'T11: the caller may file a KVKK application in the portal.';

create function public.portal_file_kvkk_request(p_type text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  perform private.assert_not_demo();
  v_org := private.kvkk_request_org(v_user);
  if v_user is null or v_org is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('access', 'rectification', 'erasure', 'objection', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'type';
  end if;
  if char_length(v_message) not between 1 and 2000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'message';
  end if;
  if (select count(*) from private.kvkk_request r
      where r.subject_id = v_user and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  insert into private.kvkk_request (org_id, subject_id, user_id, request_type, message, due_at)
  values (v_org, v_user, v_user, p_type, v_message, now() + interval '30 days')
  returning id into v_id;
  perform private.audit(v_org, v_user, 'customer', 'kvkk_request.filed', 'kvkk_request', v_id,
    jsonb_build_object('type', p_type));
  return v_id;
end;
$$;
comment on function public.portal_file_kvkk_request(text, text) is
  'T11: a portal user files a KVKK application (type, message); 30-day deadline; audited without the message.';

create function public.my_kvkk_requests()
returns table (id uuid, request_type text, status text, created_at timestamptz, due_at timestamptz, settled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.request_type, r.status, r.created_at, r.due_at, r.settled_at
  from private.kvkk_request r
  where r.subject_id = (select auth.uid())
  order by r.created_at desc;
$$;

create function public.ops_kvkk_requests(p_org_id uuid)
returns table (
  id uuid, subject_id uuid, applicant_name text, applicant_email text, request_type text, message text,
  status text, created_at timestamptz, due_at timestamptz, settled_at timestamptz, overdue boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  return query
  select r.id, r.subject_id, op.full_name, u.email::text, r.request_type, r.message, r.status,
         r.created_at, r.due_at, r.settled_at,
         r.settled_at is null and r.due_at < now()
  from private.kvkk_request r
  left join private.owner_profile op on op.org_id = r.org_id and op.user_id = r.subject_id
  left join auth.users u on u.id = r.subject_id
  where r.org_id = p_org_id
  order by (r.settled_at is null) desc, r.due_at, r.created_at;
end;
$$;

create function public.ops_set_kvkk_request_status(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.kvkk_request;
begin
  perform private.assert_not_demo();
  select * into r from private.kvkk_request x where x.id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(r.org_id);
  if p_status is null or p_status not in ('open', 'in_progress', 'answered', 'rejected') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  if p_status = r.status then
    return;
  end if;
  update private.kvkk_request
  set status = p_status,
      settled_at = case when p_status in ('answered', 'rejected') then now() end,
      updated_at = now()
  where id = r.id;
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'kvkk_request.status_changed', 'kvkk_request', r.id,
    jsonb_build_object('from', r.status, 'to', p_status, 'overdue', r.settled_at is null and r.due_at < now()));
end;
$$;

revoke all on function public.portal_kvkk_form_enabled() from public, anon;
revoke all on function public.portal_file_kvkk_request(text, text) from public, anon;
revoke all on function public.my_kvkk_requests() from public, anon;
revoke all on function public.ops_kvkk_requests(uuid) from public, anon;
revoke all on function public.ops_set_kvkk_request_status(uuid, text) from public, anon;
grant execute on function public.portal_kvkk_form_enabled() to authenticated;
grant execute on function public.portal_file_kvkk_request(text, text) to authenticated;
grant execute on function public.my_kvkk_requests() to authenticated;
grant execute on function public.ops_kvkk_requests(uuid) to authenticated;
grant execute on function public.ops_set_kvkk_request_status(uuid, text) to authenticated;
