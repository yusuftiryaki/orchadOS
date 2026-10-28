-- Legal follow-ups, wave 3 / 2: visit notices, postponements and missed
-- visits (docs/hukuk/kararlar.md H01, H15; T07; contract Md. 8A/1–4,
-- mesafeli-v4-taslak).
--
-- 1. Settings of this wave, SQL only like coowner_notice_flow_enabled: false
--    on hosted projects, true in seed.sql. visit_notice_sms_enabled (T07: the
--    visit_scheduled message), service_end_access_flow_enabled (T08, used by
--    20261105100400). Audit entity types of this wave.
-- 2. public.notification carries visit_scheduled: a message about a planned
--    visit (parcel and session like report_ready), one per recipient, visit
--    and day (a moved visit is notified again).
-- 3. private.visit_notice (append-only): every notice of a visit date, by
--    message (queued by the trigger below) or by phone (recorded by ops).
--    The trigger on public.session queues visit_scheduled to the parcel's
--    owners when an inventory or periodic visit is planned (or moved) at
--    least 3 days ahead and the setting is on. Closer dates need a phone
--    notice (ops_record_visit_phone_notice; the ops form asks for it).
-- 4. private.visit_postponement (append-only): the owner's one postponement
--    of a visit, at the latest on the day before it (8A/1 "en geç 24 saat
--    önce", read by day in the owner's favour): portal
--    (customer_request_visit_postponement) or recorded by ops.
-- 5. private.missed_visit: a visit that could not be done (8A/2–4), its
--    reason, evidence (the field app's visit_blocked event and photos, ops
--    uploads in the private bucket visit-evidence), note; for the customer
--    reason the same-day notice and a new date in the window (or "no date in
--    the window", then 8A/2 applies) are required. The outcome is set once:
--    rescheduled, deemed_done (8A/3: a second failure for the same reason on
--    the proposed day), refunded, carried_over (the owner's portal or written
--    request; never past the period's last window). report_lost marks a
--    captured visit whose report cannot be published (company reason): it is
--    not a used visit (contract 12/3, 20261105100200).
-- 6. Ops reads: notices, postponements, missed visits, the field app's
--    visit_blocked events (prefill) and legal field notices of a visit.

-- ---------------------------------------------------------------------------
-- 1. Settings and audit entity types
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting
  add column visit_notice_sms_enabled boolean not null default false,
  add column service_end_access_flow_enabled boolean not null default false;
comment on column public.org_billing_setting.visit_notice_sms_enabled is
  'SQL only. T07 (H15, contract 8A/1): visit_scheduled message when an inventory or periodic visit is planned at least 3 days ahead.';
comment on column public.org_billing_setting.service_end_access_flow_enabled is
  'SQL only. T08 (H23, contract 12/4): read-only access window and access end when an order completes, is terminated or a pilot parcel is set passive. Switch on at least 30 days before the first service_end.';

-- As in 20261104100100_staff_profile_settings.sql, with the defaults of the
-- new columns.
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
    r.installment_lead_days := 14;
    r.visit_notice_sms_enabled := false;
    r.service_end_access_flow_enabled := false;
  end if;
  return r;
end;
$$;

alter table public.audit_event drop constraint audit_event_entity_type_check;
alter table public.audit_event add constraint audit_event_entity_type_check
  check (entity_type in (
    'signup', 'consent', 'billing_profile', 'owner_profile', 'application', 'application_garden',
    'quote', 'order', 'payment', 'refund', 'price_list', 'package', 'billing_setting', 'garden_removal',
    'staff_profile', 'media_suppression', 'boundary', 'boundary_dispute', 'viewer_invitation', 'kvkk_request',
    -- Wave 3 of the legal follow-ups.
    'session', 'missed_visit', 'visit_reconciliation', 'parcel'
  ));

-- ---------------------------------------------------------------------------
-- 2. visit_scheduled on the notification queue
-- ---------------------------------------------------------------------------

alter table public.notification drop constraint notification_target_check;
alter table public.notification add constraint notification_target_check
  check (
    case when template::text in ('report_ready', 'critical_finding', 'visit_scheduled')
      then parcel_id is not null and session_id is not null and ref_id is null
      else ref_id is not null and session_id is null and finding_id is null
    end
  );
create unique index notification_visit_once on public.notification (recipient_user_id, session_id, (vars ->> 'date'))
  where template = 'visit_scheduled';

-- ---------------------------------------------------------------------------
-- 3. Visit notices
-- ---------------------------------------------------------------------------

create table private.visit_notice (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  planned_date date not null,
  -- message: visit_scheduled queued (SMS or WhatsApp, the owner's choice);
  -- phone: ops called the owner.
  channel text not null check (channel in ('message', 'phone')),
  notified_at timestamptz not null,
  -- The queued message (no foreign key: the queue is purged after 12 months).
  notification_id uuid,
  recipient_user_id uuid,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  check ((channel = 'message') = (notification_id is not null)),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id) on delete cascade
);
comment on table private.visit_notice is
  'T07 (contract 8A/1): notices of a visit date to the owner, by message (visit_scheduled) or phone. Append-only; staff read through functions.';
create index visit_notice_session_idx on private.visit_notice (session_id, notified_at desc);
create index visit_notice_parcel_idx on private.visit_notice (parcel_id);
alter table private.visit_notice enable row level security;
revoke all on private.visit_notice from public, anon, authenticated;
select private.attach_demo_guard('private.visit_notice');
create trigger visit_notice_append_only before update or delete on private.visit_notice
for each row execute function private.append_only();

-- visit_scheduled to every owner of the visit's parcel (demo accounts and
-- orgs skipped), each with a notice row. Returns the number queued.
create function private.enqueue_visit_scheduled(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_count integer := 0;
begin
  for v in
    insert into public.notification (org_id, recipient_user_id, channel, template, vars, parcel_id, session_id)
    select s.org_id, pa.user_id,
           case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
           'visit_scheduled',
           jsonb_build_object('date', s.planned_date, 'path', '/portal/parsel/' || s.parcel_id)
             || case when p.name is not null then jsonb_build_object('parcel_name', p.name) else '{}'::jsonb end,
           s.parcel_id, s.id
    from public.session s
    join public.parcel p on p.id = s.parcel_id
    join public.parcel_access pa on pa.parcel_id = s.parcel_id and pa.role = 'owner'
    left join private.owner_profile op on op.org_id = s.org_id and op.user_id = pa.user_id
    where s.id = p_session_id and s.planned_date is not null
      and not private.is_demo_org(s.org_id) and not authz.is_demo_account(pa.user_id)
    on conflict do nothing
    returning id, org_id, parcel_id, session_id, recipient_user_id, (vars ->> 'date')::date as planned_date
  loop
    insert into private.visit_notice (org_id, parcel_id, session_id, planned_date, channel, notified_at,
      notification_id, recipient_user_id)
    values (v.org_id, v.parcel_id, v.session_id, v.planned_date, 'message', now(), v.id, v.recipient_user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
comment on function private.enqueue_visit_scheduled(uuid) is
  'T07: queues visit_scheduled (date, parcel, portal path) to the owners of the visit''s parcel and records the notices.';

-- After an inventory or periodic visit is planned or moved to a day at least
-- 3 days ahead (Istanbul), with visit_notice_sms_enabled on.
create function private.notify_visit_scheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind not in ('inventory', 'periodic_scan') or new.status <> 'planned' or new.planned_date is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.planned_date is not distinct from old.planned_date and old.status = 'planned' then
    return null;
  end if;
  if new.planned_date < private.istanbul_today() + 3
     or not (private.billing_setting(new.org_id)).visit_notice_sms_enabled then
    return null;
  end if;
  perform private.enqueue_visit_scheduled(new.id);
  return null;
end;
$$;
revoke all on function private.notify_visit_scheduled() from public;
create trigger session_notify_visit_scheduled after insert or update of planned_date, status on public.session
for each row execute function private.notify_visit_scheduled();

-- The visit for ops writes of this file: an inventory or periodic visit of an
-- org the caller is ops of. Errors: not_found, forbidden, invalid_input
-- (kind).
create function private.visit_for_ops(p_session_id uuid)
returns public.session
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.session;
begin
  select * into s from public.session x where x.id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(s.org_id);
  if s.kind not in ('inventory', 'periodic_scan') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  return s;
end;
$$;

-- Ops: the owner was told the visit date by phone (contract 8A/1), at
-- p_notified_at (not in the future, at most 30 days ago). Errors as
-- visit_for_ops, visit_not_planned, invalid_input (notified_at).
create function public.ops_record_visit_phone_notice(p_session_id uuid, p_notified_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_id uuid;
begin
  s := private.visit_for_ops(p_session_id);
  if s.status <> 'planned' or s.planned_date is null then
    raise exception 'visit_not_planned' using errcode = 'P0001';
  end if;
  if p_notified_at is null or p_notified_at > now() + interval '5 minutes'
     or p_notified_at < now() - interval '30 days' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'notified_at';
  end if;
  insert into private.visit_notice (org_id, parcel_id, session_id, planned_date, channel, notified_at, recorded_by)
  values (s.org_id, s.parcel_id, s.id, s.planned_date, 'phone', p_notified_at, (select auth.uid()))
  returning id into v_id;
  perform private.audit(s.org_id, (select auth.uid()), 'ops', 'visit.phone_notice', 'session', s.id,
    jsonb_build_object('planned_date', s.planned_date, 'notified_at', p_notified_at));
  return v_id;
end;
$$;
comment on function public.ops_record_visit_phone_notice(uuid, timestamptz) is
  'Ops (T07, 8A/1): records that the owner was told the visit date by phone.';

-- ---------------------------------------------------------------------------
-- 4. Postponements
-- ---------------------------------------------------------------------------

create table private.visit_postponement (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  -- One postponement per visit (8A/1 "bir kez").
  session_id uuid not null unique,
  original_date date not null,
  requested_at timestamptz not null,
  channel text not null check (channel in ('portal', 'phone', 'written')),
  requested_by uuid,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  check (channel = 'portal' or recorded_by is not null),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id) on delete cascade
);
comment on table private.visit_postponement is
  'T07 (contract 8A/1): the owner''s one postponement of a visit, at the latest the day before it; ops replans in the same window. Append-only.';
create index visit_postponement_parcel_idx on private.visit_postponement (parcel_id);
alter table private.visit_postponement enable row level security;
revoke all on private.visit_postponement from public, anon, authenticated;
select private.attach_demo_guard('private.visit_postponement');
create trigger visit_postponement_append_only before update or delete on private.visit_postponement
for each row execute function private.append_only();

-- A visit the owner may still postpone on p_day: a planned inventory or
-- periodic visit with a day after p_day and no postponement yet.
create function private.visit_postponable(s public.session, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.kind in ('inventory', 'periodic_scan') and s.status = 'planned' and s.planned_date is not null
     and s.planned_date > p_day
     and not exists (select 1 from private.visit_postponement x where x.session_id = s.id);
$$;

-- The owner postpones a visit of their parcel (once, at the latest the day
-- before). Errors: not_found, parcel_read_only, postponement_not_allowed
-- (already postponed, too late, not a planned visit).
create function public.customer_request_visit_postponement(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  s public.session;
  v_id uuid;
begin
  perform private.assert_not_demo();
  select * into s from public.session x where x.id = p_session_id;
  if not found or v_user is null or not exists (
    select 1 from public.parcel_access pa where pa.parcel_id = s.parcel_id and pa.user_id = v_user and pa.role = 'owner'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if private.parcel_read_only(s.parcel_id) then
    raise exception 'parcel_read_only' using errcode = 'P0001';
  end if;
  perform 1 from public.session x where x.id = s.id for update;
  if not private.visit_postponable(s, private.istanbul_today()) then
    raise exception 'postponement_not_allowed' using errcode = 'P0001';
  end if;
  begin
    insert into private.visit_postponement (org_id, parcel_id, session_id, original_date, requested_at, channel,
      requested_by)
    values (s.org_id, s.parcel_id, s.id, s.planned_date, now(), 'portal', v_user)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'postponement_not_allowed' using errcode = 'P0001';
  end;
  perform private.audit(s.org_id, v_user, 'customer', 'visit.postponement_requested', 'session', s.id,
    jsonb_build_object('original_date', s.planned_date, 'channel', 'portal'));
  return v_id;
end;
$$;
comment on function public.customer_request_visit_postponement(uuid) is
  'Owner (T07, 8A/1): postpones a planned visit once, at the latest the day before; ops replans it in the same window.';

-- Ops records a postponement asked by phone or in writing at p_requested_at
-- (a day before the visit). Errors as visit_for_ops, invalid_input (channel,
-- requested_at), postponement_not_allowed.
create function public.ops_record_visit_postponement(p_session_id uuid, p_channel text, p_requested_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  v_id uuid;
  v_day date;
begin
  s := private.visit_for_ops(p_session_id);
  if p_channel is null or p_channel not in ('phone', 'written') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'channel';
  end if;
  if p_requested_at is null or p_requested_at > now() + interval '5 minutes' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'requested_at';
  end if;
  v_day := (p_requested_at at time zone 'Europe/Istanbul')::date;
  perform 1 from public.session x where x.id = s.id for update;
  if not private.visit_postponable(s, v_day) then
    raise exception 'postponement_not_allowed' using errcode = 'P0001';
  end if;
  begin
    insert into private.visit_postponement (org_id, parcel_id, session_id, original_date, requested_at, channel,
      recorded_by)
    values (s.org_id, s.parcel_id, s.id, s.planned_date, p_requested_at, p_channel, (select auth.uid()))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'postponement_not_allowed' using errcode = 'P0001';
  end;
  perform private.audit(s.org_id, (select auth.uid()), 'ops', 'visit.postponement_requested', 'session', s.id,
    jsonb_build_object('original_date', s.planned_date, 'channel', p_channel));
  return v_id;
end;
$$;
comment on function public.ops_record_visit_postponement(uuid, text, timestamptz) is
  'Ops (T07, 8A/1): records the owner''s postponement asked by phone or in writing.';

-- Upcoming planned visits of a parcel for its owner (the portal's
-- postponement action): day, kind, whether it can still be postponed.
create function public.my_parcel_visits(p_parcel_id uuid)
returns table (session_id uuid, kind public.session_kind, planned_date date, postponed boolean, can_postpone boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.kind, s.planned_date,
         exists (select 1 from private.visit_postponement x where x.session_id = s.id),
         private.visit_postponable(s, private.istanbul_today()) and not private.parcel_read_only(s.parcel_id)
  from public.session s
  where s.parcel_id = p_parcel_id and s.status = 'planned' and s.kind in ('inventory', 'periodic_scan')
    and s.planned_date >= private.istanbul_today()
    and exists (
      select 1 from public.parcel_access pa
      where pa.parcel_id = s.parcel_id and pa.user_id = (select auth.uid()) and pa.role = 'owner')
  order by s.planned_date, s.id;
$$;
comment on function public.my_parcel_visits(uuid) is
  'Owner: upcoming planned inventory and periodic visits of the parcel with the postponement state (T07).';

-- ---------------------------------------------------------------------------
-- 5. Missed visits
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-evidence', 'visit-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Objects: <org_id>/<parcel_id>/<sha256>.<ext>; the org's ops read and add,
-- demo visitors never; no update or delete through the API.
create policy visit_evidence_select on storage.objects for select to authenticated
  using (
    bucket_id = 'visit-evidence' and not (select authz.is_demo_user())
    and authz.uuid_or_null((storage.foldername(objects.name))[1]) in (select authz.user_org_ids('{ops}'))
  );
create policy visit_evidence_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'visit-evidence' and not (select authz.is_demo_user())
    and authz.uuid_or_null((storage.foldername(objects.name))[1]) in (select authz.user_org_ids('{ops}'))
    and exists (
      select 1 from public.parcel p
      where p.id = authz.uuid_or_null((storage.foldername(objects.name))[2])
        and p.org_id = authz.uuid_or_null((storage.foldername(objects.name))[1]))
  );

create table private.missed_visit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  session_id uuid not null,
  occurred_on date not null,
  reason text not null check (reason in ('customer', 'company', 'weather', 'force_majeure')),
  -- The field app's detail code (docs/arayuzler.md "Saha olayları").
  detail text check (detail ~ '^[a-z][a-z_]{0,39}$'),
  -- Personal data possible (KVKK scripts: pseudonymize).
  note text check (char_length(note) between 1 and 2000),
  -- A captured visit whose report cannot be published (data loss): not a used
  -- visit (contract 12/3); always a company reason.
  report_lost boolean not null default false,
  source_event_id uuid references public.session_event (id) on delete set null,
  evidence_capture_ids uuid[] not null default '{}',
  evidence_paths text[] not null default '{}',
  customer_notified_on date,
  customer_notified_channel text check (customer_notified_channel in ('sms', 'whatsapp', 'phone')),
  proposed_date date,
  no_date_in_window boolean not null default false,
  outcome text check (outcome in ('rescheduled', 'deemed_done', 'refunded', 'carried_over')),
  outcome_at timestamptz,
  outcome_by uuid,
  refund_id uuid references public.refund (id),
  carry_over_channel text check (carry_over_channel in ('portal', 'written')),
  carried_to_window_start date,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id) on delete cascade,
  check (not report_lost or reason = 'company'),
  check (proposed_date is null or proposed_date > occurred_on),
  check (not (no_date_in_window and proposed_date is not null)),
  -- 8A/3: documented (photo and note), notified the same day; a new date in
  -- the window (or none possible) unless it is the second failure
  -- (ops_record_missed_visit checks that).
  check (reason <> 'customer' or (
    note is not null and customer_notified_on = occurred_on and customer_notified_channel is not null
    and cardinality(evidence_capture_ids) + cardinality(evidence_paths) > 0)),
  check ((outcome is null) = (outcome_at is null)),
  check (outcome is distinct from 'deemed_done' or (reason = 'customer' and not no_date_in_window)),
  check (outcome is distinct from 'carried_over' or (carry_over_channel is not null and carried_to_window_start is not null)),
  check (outcome is distinct from 'refunded' or carry_over_channel is null),
  check (outcome = 'carried_over' or (carry_over_channel is null and carried_to_window_start is null))
);
comment on table private.missed_visit is
  'T07 (contract 8A): a visit that could not be done, its reason, evidence and outcome (set once). deemed_done counts as a used visit, report_lost does not (12/3).';
create index missed_visit_session_idx on private.missed_visit (session_id);
create index missed_visit_parcel_idx on private.missed_visit (parcel_id, occurred_on);
create index missed_visit_refund_idx on private.missed_visit (refund_id);
create index missed_visit_event_idx on private.missed_visit (source_event_id);
alter table private.missed_visit enable row level security;
revoke all on private.missed_visit from public, anon, authenticated;
select private.attach_demo_guard('private.missed_visit');

-- No delete; the record never changes; the outcome (with its refund or carry
-- over) is set once. A deleted source event only clears its link.
create function private.missed_visit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE on private.missed_visit is not allowed' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - array['outcome', 'outcome_at', 'outcome_by', 'refund_id', 'carry_over_channel',
        'carried_to_window_start', 'source_event_id', 'updated_at'])
     is distinct from (to_jsonb(old) - array['outcome', 'outcome_at', 'outcome_by', 'refund_id', 'carry_over_channel',
        'carried_to_window_start', 'source_event_id', 'updated_at'])
     or (new.source_event_id is distinct from old.source_event_id and new.source_event_id is not null)
     or (old.outcome is not null
         and (new.outcome, new.outcome_at, new.outcome_by, new.refund_id, new.carry_over_channel,
              new.carried_to_window_start)
             is distinct from (old.outcome, old.outcome_at, old.outcome_by, old.refund_id, old.carry_over_channel,
              old.carried_to_window_start)) then
    raise exception 'missed_visit_frozen' using errcode = 'P0001',
      hint = 'A missed visit record never changes; its outcome is set once.';
  end if;
  return new;
end;
$$;
revoke all on function private.missed_visit_guard() from public;
create trigger missed_visit_guard before update or delete on private.missed_visit
for each row execute function private.missed_visit_guard();
create trigger missed_visit_touch_updated_at before update on private.missed_visit
for each row execute function private.touch_updated_at();

-- The contract window (Ek-2) holding a day, or null between windows.
create function private.visit_window_of(p_day date)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select x from jsonb_array_elements(private.remaining_visit_windows(p_day, p_day)) x limit 1;
$$;

-- The active line serving the parcel on a day (any customer), or null.
create function private.serving_line(p_parcel_id uuid, p_day date)
returns table (order_item_id uuid, order_id uuid, customer_user_id uuid, service_start date, service_end date)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.id, o.id, o.customer_user_id, o.service_start, o.service_end
  from public.service_order_item oi
  join public.service_order o on o.id = oi.order_id
  where oi.parcel_id = p_parcel_id and o.status in ('active', 'completed')
    and o.service_start <= p_day and p_day <= o.service_end
    and (oi.removed_on is null or oi.removed_on > p_day)
  order by o.service_start desc, oi.line_no, oi.id
  limit 1;
$$;

-- deemed_done (8A/3) is allowed for a customer-reason record on the day an
-- earlier customer-reason record of the parcel proposed, in the same window,
-- whose outcome was rescheduled.
create function private.deemed_done_allowed(p_parcel_id uuid, p_day date, p_except uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.missed_visit m
    where m.parcel_id = p_parcel_id and m.reason = 'customer' and m.outcome = 'rescheduled'
      and m.proposed_date = p_day and m.id is distinct from p_except
      and private.visit_window_of(m.occurred_on) is not distinct from private.visit_window_of(p_day));
$$;

-- Checks and writes an outcome of a missed visit (also at insert).
create function private.check_missed_outcome(
  m private.missed_visit,
  p_outcome text,
  p_refund_id uuid,
  p_carry_over_channel text,
  p_carried_to_window_start date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l record;
  w jsonb;
begin
  if p_outcome is null then
    return;
  end if;
  if p_outcome not in ('rescheduled', 'deemed_done', 'refunded', 'carried_over') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'outcome';
  end if;
  if p_outcome = 'deemed_done' and not (m.reason = 'customer' and not m.no_date_in_window
       and private.deemed_done_allowed(m.parcel_id, m.occurred_on, m.id)) then
    raise exception 'deemed_done_not_allowed' using errcode = 'P0001',
      hint = '8A/3: only a second failure for the owner''s reason on the proposed day in the same window.';
  end if;
  if p_outcome = 'refunded' and p_refund_id is not null and not exists (
    select 1 from public.refund r
    join public.service_order o on o.id = r.order_id
    join public.service_order_item oi on oi.order_id = o.id and oi.parcel_id = m.parcel_id
    where r.id = p_refund_id and r.org_id = m.org_id and r.reason = 'missed_visit'
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'refund_id';
  end if;
  if p_outcome = 'carried_over' then
    if p_carry_over_channel is null or p_carry_over_channel not in ('portal', 'written') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'carry_over_channel';
    end if;
    select * into l from private.serving_line(m.parcel_id, m.occurred_on);
    w := private.visit_window_of(m.occurred_on);
    -- A later window of the same period (8A/2: never past the last one).
    if l.order_item_id is null or p_carried_to_window_start is null or not exists (
      select 1 from jsonb_array_elements(private.remaining_visit_windows(
        coalesce((w ->> 'end')::date, m.occurred_on) + 1, l.service_end)) x
      where (x ->> 'start')::date = p_carried_to_window_start
    ) then
      raise exception 'carry_over_not_allowed' using errcode = 'P0001',
        hint = '8A/2: a later window of the same period only.';
    end if;
  elsif p_carry_over_channel is not null or p_carried_to_window_start is not null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'carry_over_channel';
  end if;
end;
$$;

-- Ops records a missed visit. Evidence: captures of the visit and objects
-- of the bucket visit-evidence under <org>/<parcel>/. For the owner's reason
-- the note, a photo, the same-day notice (channel) and a proposed date in the
-- same window (or p_no_date_in_window) are required. Errors as
-- visit_for_ops, visit_not_planned (a planned or, for report_lost, a captured
-- visit not published), invalid_input (reason, occurred_on, note, detail,
-- evidence, notice, proposed_date), proposed_date_outside_window, and those
-- of the outcome (deemed_done_not_allowed, carry_over_not_allowed).
create function public.ops_record_missed_visit(
  p_session_id uuid,
  p_reason text,
  p_occurred_on date,
  p_note text default null,
  p_detail text default null,
  p_source_event_id uuid default null,
  p_evidence_capture_ids uuid[] default '{}',
  p_evidence_paths text[] default '{}',
  p_customer_notified_on date default null,
  p_customer_notified_channel text default null,
  p_proposed_date date default null,
  p_no_date_in_window boolean default false,
  p_report_lost boolean default false,
  p_outcome text default null,
  p_refund_id uuid default null,
  p_carry_over_channel text default null,
  p_carried_to_window_start date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.session;
  m private.missed_visit;
  v_note text := nullif(btrim(p_note), '');
  v_caps uuid[] := array(select distinct x from unnest(coalesce(p_evidence_capture_ids, '{}')) x where x is not null);
  v_paths text[] := array(select distinct x from unnest(coalesce(p_evidence_paths, '{}')) x where x is not null);
  v_window jsonb;
  v_actor uuid := (select auth.uid());
begin
  s := private.visit_for_ops(p_session_id);
  if coalesce(p_report_lost, false) then
    if s.status not in ('captured', 'processed', 'in_review') then
      raise exception 'visit_not_planned' using errcode = 'P0001';
    end if;
  elsif s.status <> 'planned' then
    raise exception 'visit_not_planned' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('customer', 'company', 'weather', 'force_majeure')
     or (coalesce(p_report_lost, false) and p_reason <> 'company') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  if p_occurred_on is null or p_occurred_on > private.istanbul_today() then
    raise exception 'invalid_input' using errcode = '22023', detail = 'occurred_on';
  end if;
  if length(v_note) > 2000 or (p_reason = 'customer' and v_note is null) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if p_detail is not null and p_detail !~ '^[a-z][a-z_]{0,39}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'detail';
  end if;
  if p_source_event_id is not null and not exists (
    select 1 from public.session_event e
    where e.id = p_source_event_id and e.session_id = s.id and e.event_type = 'visit_blocked'
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'source_event_id';
  end if;
  if cardinality(v_caps) > 20 or cardinality(v_paths) > 20
     or (select count(*) from public.capture c where c.id = any (v_caps) and c.session_id = s.id) <> cardinality(v_caps)
     or exists (select 1 from unnest(v_paths) x where x !~ ('^' || s.org_id || '/' || s.parcel_id || '/[A-Za-z0-9._-]{1,120}$'))
     or (select count(*) from storage.objects o where o.bucket_id = 'visit-evidence' and o.name = any (v_paths))
        <> cardinality(v_paths) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'evidence';
  end if;
  if p_reason = 'customer' then
    if cardinality(v_caps) + cardinality(v_paths) = 0 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'evidence';
    end if;
    if p_customer_notified_on is distinct from p_occurred_on or p_customer_notified_channel is null
       or p_customer_notified_channel not in ('sms', 'whatsapp', 'phone') then
      raise exception 'invalid_input' using errcode = '22023', detail = 'customer_notified';
    end if;
    -- A new date in the window, or none possible, unless this is the second
    -- failure on the proposed day (8A/3: then the visit is deemed done).
    if p_proposed_date is null and not coalesce(p_no_date_in_window, false)
       and not private.deemed_done_allowed(s.parcel_id, p_occurred_on, null) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'proposed_date';
    end if;
  elsif p_customer_notified_channel is not null and p_customer_notified_channel not in ('sms', 'whatsapp', 'phone') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'customer_notified';
  end if;
  if p_proposed_date is not null then
    if p_proposed_date <= p_occurred_on or coalesce(p_no_date_in_window, false) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'proposed_date';
    end if;
    -- "Aynı pencere içinde" (8A/1, 8A/3): the proposed day is in the window
    -- of the missed day (between windows: any later day).
    v_window := private.visit_window_of(p_occurred_on);
    if v_window is not null and p_proposed_date > (v_window ->> 'end')::date then
      raise exception 'proposed_date_outside_window' using errcode = 'P0001';
    end if;
  end if;

  m.id := gen_random_uuid();
  m.org_id := s.org_id;
  m.parcel_id := s.parcel_id;
  m.session_id := s.id;
  m.occurred_on := p_occurred_on;
  m.reason := p_reason;
  m.no_date_in_window := coalesce(p_no_date_in_window, false);
  perform private.check_missed_outcome(m, p_outcome, p_refund_id, p_carry_over_channel, p_carried_to_window_start);

  insert into private.missed_visit (
    id, org_id, parcel_id, session_id, occurred_on, reason, detail, note, report_lost, source_event_id,
    evidence_capture_ids, evidence_paths, customer_notified_on, customer_notified_channel, proposed_date,
    no_date_in_window, outcome, outcome_at, outcome_by, refund_id, carry_over_channel, carried_to_window_start,
    recorded_by
  )
  values (
    m.id, s.org_id, s.parcel_id, s.id, p_occurred_on, p_reason, p_detail, v_note, coalesce(p_report_lost, false),
    p_source_event_id, v_caps, v_paths, p_customer_notified_on, p_customer_notified_channel, p_proposed_date,
    coalesce(p_no_date_in_window, false), p_outcome, case when p_outcome is not null then now() end,
    case when p_outcome is not null then v_actor end, case when p_outcome = 'refunded' then p_refund_id end,
    p_carry_over_channel, p_carried_to_window_start, v_actor
  );
  perform private.audit(s.org_id, v_actor, 'ops', 'missed_visit.recorded', 'missed_visit', m.id,
    jsonb_build_object('session_id', s.id, 'reason', p_reason, 'occurred_on', p_occurred_on,
      'report_lost', coalesce(p_report_lost, false), 'outcome', p_outcome, 'proposed_date', p_proposed_date));
  return m.id;
end;
$$;
comment on function public.ops_record_missed_visit(uuid, text, date, text, text, uuid, uuid[], text[], date, text, date, boolean, boolean, text, uuid, text, date) is
  'Ops (T07, 8A/2–4): records a missed visit with reason, evidence and, for the owner''s reason, the same-day notice and a new date.';

-- Ops sets the outcome of a missed visit once. Errors: not_found, forbidden,
-- missed_visit_frozen (already set), invalid_input, deemed_done_not_allowed,
-- carry_over_not_allowed.
create function public.ops_set_missed_visit_outcome(
  p_missed_visit_id uuid,
  p_outcome text,
  p_refund_id uuid default null,
  p_carry_over_channel text default null,
  p_carried_to_window_start date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m private.missed_visit;
  v_actor uuid := (select auth.uid());
begin
  select * into m from private.missed_visit x where x.id = p_missed_visit_id for update;
  if not found or m.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(m.org_id);
  if m.outcome is not null then
    raise exception 'missed_visit_frozen' using errcode = 'P0001';
  end if;
  if p_outcome is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'outcome';
  end if;
  perform private.check_missed_outcome(m, p_outcome, p_refund_id, p_carry_over_channel, p_carried_to_window_start);
  update private.missed_visit
  set outcome = p_outcome, outcome_at = now(), outcome_by = v_actor,
      refund_id = case when p_outcome = 'refunded' then p_refund_id end,
      carry_over_channel = p_carry_over_channel, carried_to_window_start = p_carried_to_window_start
  where id = m.id;
  perform private.audit(m.org_id, v_actor, 'ops', 'missed_visit.outcome', 'missed_visit', m.id,
    jsonb_build_object('outcome', p_outcome, 'refund_id', p_refund_id,
      'carried_to_window_start', p_carried_to_window_start));
end;
$$;
comment on function public.ops_set_missed_visit_outcome(uuid, text, uuid, text, date) is
  'Ops (T07): sets the outcome of a missed visit once (rescheduled, deemed_done per 8A/3, refunded, carried_over per 8A/2).';

-- ---------------------------------------------------------------------------
-- 6. Ops reads
-- ---------------------------------------------------------------------------

-- Notices, postponement and missed visits of one visit, for its ops.
create function public.ops_visit_records(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.session;
begin
  select * into s from public.session x where x.id = p_session_id;
  if not found or s.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'channel', n.channel, 'planned_date', n.planned_date,
               'notified_at', n.notified_at, 'status', q.status) order by n.notified_at desc, n.id)
      from private.visit_notice n left join public.notification q on q.id = n.notification_id
      where n.session_id = s.id), '[]'::jsonb),
    'postponement', (
      select jsonb_build_object('original_date', x.original_date, 'requested_at', x.requested_at,
               'channel', x.channel)
      from private.visit_postponement x where x.session_id = s.id),
    'missed', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'occurred_on', m.occurred_on, 'reason', m.reason,
               'detail', m.detail, 'note', m.note, 'report_lost', m.report_lost,
               'source_event_id', m.source_event_id, 'evidence_capture_ids', to_jsonb(m.evidence_capture_ids),
               'evidence_paths', to_jsonb(m.evidence_paths), 'customer_notified_on', m.customer_notified_on,
               'customer_notified_channel', m.customer_notified_channel, 'proposed_date', m.proposed_date,
               'no_date_in_window', m.no_date_in_window, 'outcome', m.outcome, 'outcome_at', m.outcome_at,
               'refund_id', m.refund_id, 'carried_to_window_start', m.carried_to_window_start,
               'deemed_done_allowed', m.outcome is null and m.reason = 'customer' and not m.no_date_in_window
                 and private.deemed_done_allowed(m.parcel_id, m.occurred_on, m.id),
               'created_at', m.created_at) order by m.occurred_on desc, m.created_at desc)
      from private.missed_visit m where m.session_id = s.id), '[]'::jsonb),
    'window', private.visit_window_of(coalesce(s.planned_date, private.istanbul_today())),
    'carry_windows', coalesce((
      select private.remaining_visit_windows(
               coalesce((private.visit_window_of(coalesce(s.planned_date, private.istanbul_today())) ->> 'end')::date,
                 coalesce(s.planned_date, private.istanbul_today())) + 1, l.service_end)
      from private.serving_line(s.parcel_id, coalesce(s.planned_date, private.istanbul_today())) l), '[]'::jsonb)
  );
end;
$$;
comment on function public.ops_visit_records(uuid) is
  'Ops (T07): notices, postponement, missed visits, the visit''s window and the later windows of its period.';

-- visit_blocked events of a visit that count (docs/arayuzler.md "Okuma
-- kuralı"): the visit is still planned, no session_start on it, recorded by
-- field staff or ops of the org; with the photos (captures whose
-- metadata.event_id is the event). The ops form is prefilled from them.
create function public.ops_visit_blocked_events(p_session_id uuid)
returns table (
  event_id uuid,
  reason text,
  detail text,
  note text,
  photo_capture_ids uuid[],
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, j ->> 'reason', j ->> 'detail', j ->> 'note',
         array(select c.id from public.capture c
               where c.session_id = e.session_id and c.metadata ->> 'event_id' = e.id::text order by c.started_at, c.id),
         e.phone_time
  from public.session s
  join public.session_event e on e.session_id = s.id and e.event_type = 'visit_blocked'
  cross join lateral (select case when pg_input_is_valid(e.payload, 'jsonb') then e.payload::jsonb end as j) v
  where s.id = p_session_id and s.org_id in (select authz.user_org_ids('{ops}'))
    and s.status = 'planned'
    and jsonb_typeof(j) = 'object' and j ->> 'reason' in ('customer', 'company', 'weather', 'force_majeure')
    and not exists (select 1 from public.session_event x where x.session_id = s.id and x.event_type = 'session_start')
    and exists (select 1 from public.membership m
                where m.org_id = s.org_id and m.user_id = e.recorded_by and m.role in ('field_staff', 'ops'))
  order by e.phone_time desc, e.id;
$$;
comment on function public.ops_visit_blocked_events(uuid) is
  'Ops (T07): the field app''s visit_blocked events of a visit that count, with their photos (prefill of a missed visit).';

-- Legal field notices of a visit (H01, T07): field_notice_sign,
-- field_notice_verbal and field_notice_objection, newest first.
create function public.ops_visit_field_notices(p_session_id uuid)
returns table (event_id uuid, event_type text, payload jsonb, recorded_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.event_type, case when pg_input_is_valid(e.payload, 'jsonb') then e.payload::jsonb end, e.phone_time
  from public.session s
  join public.session_event e on e.session_id = s.id
  where s.id = p_session_id and s.org_id in (select authz.user_org_ids('{ops}'))
    and e.event_type in ('field_notice_sign', 'field_notice_verbal', 'field_notice_objection')
  order by e.phone_time desc, e.id;
$$;
comment on function public.ops_visit_field_notices(uuid) is
  'Ops (H01, T07): the visit''s sign, verbal notice and objection records from the field app.';

-- Ops visit list badges: planned visits with a postponement still on the
-- original day, and visits planned inside 3 days without any notice.
create function public.ops_visit_notice_flags(p_org_id uuid)
returns table (session_id uuid, postponed boolean, notice_missing boolean, missed_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         exists (select 1 from private.visit_postponement x where x.session_id = s.id and x.original_date = s.planned_date),
         s.planned_date is not null and s.planned_date >= private.istanbul_today()
           and not exists (select 1 from private.visit_notice n where n.session_id = s.id and n.planned_date = s.planned_date),
         (select count(*) from private.missed_visit m where m.session_id = s.id)::integer
  from public.session s
  where s.org_id = p_org_id and p_org_id in (select authz.user_org_ids('{ops}'))
    and s.kind in ('inventory', 'periodic_scan') and s.status = 'planned';
$$;
comment on function public.ops_visit_notice_flags(uuid) is
  'Ops (T07): per planned visit: postponed and not yet moved, no notice of its day, number of missed-visit records.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.enqueue_visit_scheduled(uuid) from public;
revoke all on function private.visit_for_ops(uuid) from public;
revoke all on function private.visit_postponable(public.session, date) from public;
revoke all on function private.visit_window_of(date) from public;
revoke all on function private.serving_line(uuid, date) from public;
revoke all on function private.deemed_done_allowed(uuid, date, uuid) from public;
revoke all on function private.check_missed_outcome(private.missed_visit, text, uuid, text, date) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ops_record_visit_phone_notice(uuid, timestamptz)',
    'public.customer_request_visit_postponement(uuid)',
    'public.ops_record_visit_postponement(uuid, text, timestamptz)',
    'public.my_parcel_visits(uuid)',
    'public.ops_record_missed_visit(uuid, text, date, text, text, uuid, uuid[], text[], date, text, date, boolean, boolean, text, uuid, text, date)',
    'public.ops_set_missed_visit_outcome(uuid, text, uuid, text, date)',
    'public.ops_visit_records(uuid)',
    'public.ops_visit_blocked_events(uuid)',
    'public.ops_visit_field_notices(uuid)',
    'public.ops_visit_notice_flags(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
