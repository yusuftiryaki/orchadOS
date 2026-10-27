-- IP12-A2 / 2: account notifications on the existing queue
-- (docs/musteri-yonetimi.md §6.5, §12).
--
-- 1. public.notification also carries account messages (quote ready,
--    application result, payment received, refund completed, payment
--    reminder): they name no parcel or visit but a document (ref_id: quote,
--    application, payment, refund or order id). Report templates keep needing
--    the parcel and the visit. Template variables may now also hold `ref`, the
--    document number (T-…, B-…, M-…, I-…, S-…); still no names or amounts.
--    One message per recipient, template and document (notification_ref_once).
-- 2. private.enqueue_billing_notification(): one message to the customer; the
--    channel follows the profile's contact_preference as for reports.
-- 3. ops_notifications() is recreated with a left join on the parcel (account
--    messages have none) and the `ref` variable as a column.

alter table public.notification alter column parcel_id drop not null;
alter table public.notification alter column session_id drop not null;
alter table public.notification add column ref_id uuid;
comment on column public.notification.ref_id is
  'Account messages: the quote, application, payment, refund or order the message is about.';

alter table public.notification drop constraint notification_vars_check;
alter table public.notification add constraint notification_vars_check
  check (jsonb_typeof(vars) = 'object' and (vars - array['parcel_name', 'date', 'path', 'ref']) = '{}'::jsonb);
comment on column public.notification.vars is
  'parcel_name, date (YYYY-MM-DD), path (portal path), ref (document number); nothing else.';

-- Report templates need the parcel and the visit; account templates the
-- document. The text cast keeps this file free of the new enum values.
alter table public.notification add constraint notification_target_check
  check (
    case when template::text in ('report_ready', 'critical_finding')
      then parcel_id is not null and session_id is not null and ref_id is null
      else ref_id is not null and session_id is null and finding_id is null
    end
  );

create unique index notification_ref_once on public.notification (recipient_user_id, template, ref_id)
  where ref_id is not null;

-- One account message to a customer; returns 1, or 0 when it was already
-- queued (notification_ref_once). Only the document number and the portal
-- path go into the variables: no amounts, no reasons (§12).
create function private.enqueue_billing_notification(
  p_template public.notification_template,
  p_org_id uuid,
  p_user_id uuid,
  p_ref_id uuid,
  p_ref text,
  p_path text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification (org_id, recipient_user_id, channel, template, vars, ref_id)
  select
    p_org_id, p_user_id,
    case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
    p_template,
    jsonb_build_object('ref', p_ref, 'path', p_path),
    p_ref_id
  from (select 1) one
  left join private.owner_profile op on op.org_id = p_org_id and op.user_id = p_user_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function private.enqueue_billing_notification(public.notification_template, uuid, uuid, uuid, text, text) is
  'Queues one account message (document number and portal path only) to a customer; duplicates are skipped.';
revoke all on function private.enqueue_billing_notification(public.notification_template, uuid, uuid, uuid, text, text)
  from public;

-- Same as before, plus `ref`; parcel_id and parcel_name are null for account
-- messages.
drop function public.ops_notifications(integer, text);
create function public.ops_notifications(
  p_limit integer default 100,
  p_status text default null
)
returns table (
  id uuid,
  org_id uuid,
  parcel_id uuid,
  parcel_name text,
  session_id uuid,
  template text,
  channel text,
  status text,
  attempts integer,
  last_error text,
  sent_via text,
  next_attempt_at timestamptz,
  created_at timestamptz,
  sent_at timestamptz,
  recipient_user_id uuid,
  recipient_role text,
  recipient_name text,
  recipient_phone text,
  ref text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.org_id, n.parcel_id, p.name, n.session_id, n.template::text, n.channel::text,
         n.status::text, n.attempts, n.last_error, n.sent_via, n.next_attempt_at, n.created_at, n.sent_at,
         n.recipient_user_id, pa.role::text, op.full_name, op.phone, n.vars ->> 'ref'
  from public.notification n
  left join public.parcel p on p.id = n.parcel_id
  left join public.parcel_access pa on pa.parcel_id = n.parcel_id and pa.user_id = n.recipient_user_id
  left join private.owner_profile op on op.org_id = n.org_id and op.user_id = n.recipient_user_id
  where n.org_id in (select authz.user_org_ids('{ops}'))
    and (p_status is null or n.status::text = p_status)
  order by n.created_at desc, n.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
comment on function public.ops_notifications(integer, text) is
  'Latest notifications of the caller''s ops orgs with recipient name and phone (ops only; masked on screen) and the document number of account messages.';

revoke all on function public.ops_notifications(integer, text) from public, anon, authenticated;
grant execute on function public.ops_notifications(integer, text) to authenticated;
