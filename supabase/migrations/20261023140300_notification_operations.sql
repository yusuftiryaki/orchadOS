-- Notifications v0.1: the operations screen (/operasyon/bildirimler).
--
-- ops_notifications(): the latest messages of the caller's ops orgs with the
-- recipient's name and phone from private.owner_profile (ops sees these
-- already, ops_owner_profiles); the web app masks the phone before showing it.
-- ops_retry_notification(): a failed message goes back to the queue with a
-- fresh attempt count; the next scheduled run sends it.
-- Both are security definer (private schema) and check the ops role.

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
  recipient_phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.org_id, n.parcel_id, p.name, n.session_id, n.template::text, n.channel::text,
         n.status::text, n.attempts, n.last_error, n.sent_via, n.next_attempt_at, n.created_at, n.sent_at,
         n.recipient_user_id, pa.role::text, op.full_name, op.phone
  from public.notification n
  join public.parcel p on p.id = n.parcel_id
  left join public.parcel_access pa on pa.parcel_id = n.parcel_id and pa.user_id = n.recipient_user_id
  left join private.owner_profile op on op.org_id = n.org_id and op.user_id = n.recipient_user_id
  where n.org_id in (select authz.user_org_ids('{ops}'))
    and (p_status is null or n.status::text = p_status)
  order by n.created_at desc, n.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
comment on function public.ops_notifications(integer, text) is
  'Latest notifications of the caller''s ops orgs with recipient name and phone (ops only; masked on screen).';

create function public.ops_retry_notification(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.notification;
begin
  select * into n from public.notification where id = p_id for update;
  if not found or n.org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if n.status <> 'failed' then
    raise exception 'not_failed' using errcode = '55000';
  end if;
  update public.notification
  set status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = null
  where id = p_id;
end;
$$;
comment on function public.ops_retry_notification(uuid) is
  'Ops: puts a failed notification back in the queue (fresh attempts); the next run sends it.';

revoke all on function public.ops_notifications(integer, text) from public, anon;
revoke all on function public.ops_retry_notification(uuid) from public, anon;
grant execute on function public.ops_notifications(integer, text) to authenticated;
grant execute on function public.ops_retry_notification(uuid) to authenticated;
