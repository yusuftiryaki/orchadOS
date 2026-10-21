-- Notifications v0.1: the queue (docs/MVP.md Module 5, section 7).
--
-- 1. public.notification: one message to one portal user (owner or viewer of
--    a parcel) over SMS or WhatsApp. Personal data rules (KVKK):
--    - no phone number here; the sender reads it from private.owner_profile
--      at send time (notification_claim, next migration);
--    - template variables are the parcel name, the visit day and the portal
--      path, nothing else (check constraint): no names, no finding text;
--    - last_error holds a reason code, never a provider message.
-- 2. Triggers enqueue:
--    - report_ready when a periodic scan or verification visit is published
--      (status changes to 'published'), for every owner and viewer of the
--      parcel;
--    - critical_finding when a finding of severity 'high' is approved, before
--      the report. A critical finding approved by publish_session itself is
--      covered by the report_ready message of the same transaction and is not
--      sent twice.
--    Partial unique indexes keep one message per recipient and event; the
--    inserts skip duplicates.
-- 3. The channel follows the recipient's contact_preference in the parcel's
--    org: whatsapp -> whatsapp, sms / phone_call / no profile -> sms (a link
--    cannot be read out on a call).
-- 4. approve_finding(): the expert approves one finding before signing the
--    report, so that a critical one is notified at once.
-- 5. Access: the recipient reads their own rows, ops reads the org's rows.
--    Nobody writes through the API; triggers and service-role functions do.

create type public.notification_channel as enum ('sms', 'whatsapp');
create type public.notification_template as enum ('report_ready', 'critical_finding');
create type public.notification_status as enum ('pending', 'sent', 'failed');

create table public.notification (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  finding_id uuid,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  channel public.notification_channel not null,
  template public.notification_template not null,
  -- Only parcel_name, date (YYYY-MM-DD, Turkey day of the visit) and path (portal path).
  vars jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  -- Reason code such as no_phone or provider_error:30; never free text.
  last_error text check (last_error ~ '^[a-z][a-z0-9_]*(:[a-z0-9_.-]{1,40})?$'),
  next_attempt_at timestamptz not null default now(),
  -- Set while a sender works on the row, so that two runs do not send it twice.
  locked_until timestamptz,
  -- Provider and channel that carried the message, e.g. record/sms, netgsm/sms.
  sent_via text check (sent_via ~ '^[a-z0-9_-]+/[a-z]+$'),
  provider_message_id text check (length(provider_message_id) <= 100),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade,
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id) on delete cascade,
  foreign key (finding_id, parcel_id, org_id) references public.finding (id, parcel_id, org_id) on delete cascade,
  check ((template = 'critical_finding') = (finding_id is not null)),
  check ((status = 'sent') = (sent_at is not null)),
  check (jsonb_typeof(vars) = 'object' and (vars - array['parcel_name', 'date', 'path']) = '{}'::jsonb)
);
comment on table public.notification is
  'Outgoing SMS / WhatsApp notifications (queue). No phone numbers and no personal data in vars.';
comment on column public.notification.vars is 'parcel_name, date (YYYY-MM-DD), path (portal path); nothing else.';

create unique index notification_report_once on public.notification (recipient_user_id, session_id)
  where template = 'report_ready';
create unique index notification_finding_once on public.notification (recipient_user_id, finding_id)
  where template = 'critical_finding';
create index notification_due_idx on public.notification (next_attempt_at) where status = 'pending';
create index notification_org_created_idx on public.notification (org_id, created_at desc);
create index notification_parcel_id_idx on public.notification (parcel_id);
create index notification_session_id_idx on public.notification (session_id);
create index notification_finding_id_idx on public.notification (finding_id);

alter table public.notification enable row level security;
revoke all on public.notification from anon, authenticated;
grant select on public.notification to authenticated;
grant all on public.notification to service_role;

create policy notification_select on public.notification for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or org_id in (select authz.user_org_ids('{ops}'))
  );

-- ---------------------------------------------------------------------------
-- Enqueueing
-- ---------------------------------------------------------------------------

-- One row per owner / viewer of the session's parcel; duplicates are skipped.
create function private.enqueue_notifications(
  p_template public.notification_template,
  p_session_id uuid,
  p_finding_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification (
    org_id, parcel_id, session_id, finding_id, recipient_user_id, channel, template, vars
  )
  select
    s.org_id, s.parcel_id, s.id, p_finding_id, pa.user_id,
    case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
    p_template,
    jsonb_build_object(
      'parcel_name', p.name,
      'date', to_char(coalesce(
        (s.started_at at time zone 'Europe/Istanbul')::date,
        s.planned_date,
        (s.created_at at time zone 'Europe/Istanbul')::date
      ), 'YYYY-MM-DD'),
      'path', '/portal/parsel/' || p.id
    )
  from public.session s
  join public.parcel p on p.id = s.parcel_id
  join public.parcel_access pa on pa.parcel_id = s.parcel_id
  left join private.owner_profile op on op.org_id = s.org_id and op.user_id = pa.user_id
  where s.id = p_session_id
  order by pa.created_at, pa.user_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function private.notify_session_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_notifications('report_ready', new.id);
  -- Critical findings approved by publish_session in this same transaction:
  -- the report message covers them.
  delete from public.notification n
  where n.session_id = new.id
    and n.template = 'critical_finding'
    and n.status = 'pending'
    and n.attempts = 0
    and n.created_at = now();
  return null;
end;
$$;

create trigger session_notify_published
after update of status on public.session
for each row
when (new.status = 'published' and old.status is distinct from new.status
      and new.kind in ('periodic_scan', 'verification'))
execute function private.notify_session_published();

create function private.notify_critical_finding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.approved_at is null or old.severity <> 'high' then
    perform private.enqueue_notifications('critical_finding', new.session_id, new.id);
  end if;
  return null;
end;
$$;

create trigger finding_notify_critical
after insert or update of approved_at, severity on public.finding
for each row
when (new.severity = 'high' and new.approved_at is not null)
execute function private.notify_critical_finding();

-- ---------------------------------------------------------------------------
-- approve_finding: the expert approves one finding ahead of the report.
-- ---------------------------------------------------------------------------

create function public.approve_finding(p_finding_id uuid)
returns public.finding
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.finding;
  v_uid uuid := (select auth.uid());
begin
  select * into f from public.finding where id = p_finding_id for update;
  if not found or f.org_id not in (select authz.user_org_ids('{expert}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if f.approved_at is not null then
    return f;
  end if;
  update public.finding
  set approved_by = v_uid, approved_at = now()
  where id = f.id
  returning * into f;
  return f;
end;
$$;
comment on function public.approve_finding(uuid) is
  'Expert approves a finding before the report is signed; a high severity finding is notified at once.';
revoke all on function public.approve_finding(uuid) from public, anon;
grant execute on function public.approve_finding(uuid) to authenticated;

revoke all on function private.enqueue_notifications(public.notification_template, uuid, uuid) from public;
