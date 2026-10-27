-- IP12-A2 / 8: back office reads (docs/musteri-yonetimi.md §6.8, §6.9, §11).
--
-- ops_billing_summary (dashboard card, including sign-up attempts of the last
-- 24 hours), ops_customers (the owners list with sign-up source, orders and
-- payments), ops_billing_internal (internal columns that the column grants
-- keep from the API, user ids as {id, name}), ops_orders, ops_payments,
-- ops_payment_events, ops_refunds, ops_audit_events. All check the ops role of
-- the org; none writes.

-- A user as {id, name}: the owner profile's name in the org, else the
-- account's display name.
create function private.user_ref(p_org_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_user_id is null then null else jsonb_build_object(
    'id', p_user_id,
    'name', coalesce(
      (select op.full_name from private.owner_profile op where op.org_id = p_org_id and op.user_id = p_user_id),
      (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'display_name')
       from auth.users u where u.id = p_user_id))
  ) end;
$$;

create function public.ops_billing_summary(p_org_id uuid)
returns table (
  applications_submitted integer,
  quotes_open integer,
  orders_awaiting_payment integer,
  orders_overdue integer,
  payments_pending_review integer,
  refunds_open integer,
  refunds_failed integer,
  parcels_awaiting_inventory integer,
  renewals_due integer,
  signup_attempts_24h integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_notice integer := coalesce(
    (select s.renewal_notice_days from public.org_billing_setting s where s.org_id = p_org_id), 45);
begin
  perform private.require_ops(p_org_id);
  return query
  select
    (select count(*)::integer from public.service_application a where a.org_id = p_org_id and a.status = 'submitted'),
    (select count(*)::integer from public.quote q where q.org_id = p_org_id and q.status = 'issued'),
    (select count(*)::integer from public.service_order o where o.org_id = p_org_id and o.status = 'awaiting_payment'),
    (select count(*)::integer from public.service_order o
     where o.org_id = p_org_id and o.status = 'awaiting_payment' and o.payment_due_at < now()),
    (select count(*)::integer from public.payment p where p.org_id = p_org_id and p.status = 'pending_review'),
    (select count(*)::integer from public.refund r where r.org_id = p_org_id and r.status in ('requested', 'processing')),
    (select count(*)::integer from public.refund r where r.org_id = p_org_id and r.status = 'failed'),
    (select count(distinct oi.parcel_id)::integer
     from public.service_order o
     join public.service_order_item oi on oi.order_id = o.id
     join public.parcel pa on pa.id = oi.parcel_id
     where o.org_id = p_org_id and o.status = 'active' and pa.status = 'registered'),
    (select count(*)::integer from public.service_order o
     where o.org_id = p_org_id and o.status = 'active'
       and o.service_end < private.istanbul_today() + v_notice
       and not exists (select 1 from public.service_order n
                       where n.renewal_of_order_id = o.id and n.status in ('awaiting_payment', 'active', 'completed'))
       and not exists (select 1 from public.quote q where q.renewal_of_order_id = o.id and q.status = 'issued')),
    -- Attempts carry no org: counted for the org that takes sign-ups.
    (case when private.signup_org_id() = p_org_id then
       (select count(*)::integer from private.signup_attempt s where s.created_at > now() - interval '24 hours')
     else 0 end);
end;
$$;
comment on function public.ops_billing_summary(uuid) is
  'Ops: counts for the customers and payments card (open work, renewals due, sign-up attempts in 24 hours).';

-- Owner profiles of the org with their billing figures. p_query matches the
-- name, phone or e-mail (substring, case-insensitive).
create function public.ops_customers(p_org_id uuid, p_query text default null, p_limit integer default 200)
returns table (
  profile_id uuid,
  user_id uuid,
  full_name text,
  phone text,
  email text,
  signup_source text,
  created_at timestamptz,
  parcel_count integer,
  application_count integer,
  open_order_count integer,
  paid_kurus bigint,
  has_billing_profile boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := lower(nullif(btrim(p_query), ''));
begin
  perform private.require_ops(p_org_id);
  if length(v_query) > 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'query';
  end if;
  return query
  select op.id, op.user_id, op.full_name, op.phone, op.email,
         case when u.raw_app_meta_data ->> 'signup' = 'self' then 'self' else 'ops' end,
         op.created_at,
         (select count(*)::integer from public.parcel_access pa join public.parcel p on p.id = pa.parcel_id
          where pa.user_id = op.user_id and pa.role = 'owner' and p.org_id = p_org_id),
         (select count(*)::integer from public.service_application a
          where a.customer_user_id = op.user_id and a.org_id = p_org_id and a.status <> 'draft'),
         (select count(*)::integer from public.service_order o
          where o.customer_user_id = op.user_id and o.org_id = p_org_id and o.status in ('awaiting_payment', 'active')),
         (select coalesce(sum(o.paid_kurus - o.refunded_kurus), 0)::bigint from public.service_order o
          where o.customer_user_id = op.user_id and o.org_id = p_org_id),
         exists (select 1 from private.billing_profile b where b.org_id = p_org_id and b.user_id = op.user_id)
  from private.owner_profile op
  left join auth.users u on u.id = op.user_id
  where op.org_id = p_org_id
    and (v_query is null
         or position(v_query in lower(op.full_name)) > 0
         or position(v_query in lower(coalesce(op.phone, ''))) > 0
         or position(v_query in lower(coalesce(op.email, ''))) > 0)
  order by op.created_at desc, op.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_customers(uuid, text, integer) is
  'Ops: owner profiles with sign-up source, parcels, applications, open orders and the net paid amount.';

-- The internal columns of one billing record (types: application,
-- application_garden, quote, order, payment, refund). Errors: invalid_input
-- (entity_type), not_found (missing, or not of the caller's ops orgs).
create function public.ops_billing_internal(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_org uuid;
begin
  case p_entity_type
    when 'application' then
      select x.org_id, jsonb_build_object('ops_note', x.ops_note, 'decided_by', private.user_ref(x.org_id, x.decided_by))
      into v_org, v from public.service_application x where x.id = p_entity_id;
    when 'application_garden' then
      select x.org_id, jsonb_build_object('verified_by', private.user_ref(x.org_id, x.verified_by),
               'verification_note', x.verification_note)
      into v_org, v from public.application_garden x where x.id = p_entity_id;
    when 'quote' then
      select x.org_id, jsonb_build_object('issued_by', private.user_ref(x.org_id, x.issued_by),
               'decided_by', private.user_ref(x.org_id, x.decided_by))
      into v_org, v from public.quote x where x.id = p_entity_id;
    when 'order' then
      select x.org_id, jsonb_build_object('termination_note', x.termination_note)
      into v_org, v from public.service_order x where x.id = p_entity_id;
    when 'payment' then
      -- The provider token itself stays inside the database.
      select x.org_id, jsonb_build_object('has_provider_token', x.provider_token is not null,
               'return_origin', x.return_origin, 'recorded_by', private.user_ref(x.org_id, x.recorded_by),
               'manual_note', x.manual_note)
      into v_org, v from public.payment x where x.id = p_entity_id;
    when 'refund' then
      select x.org_id, jsonb_build_object('note', x.note, 'requested_by', private.user_ref(x.org_id, x.requested_by))
      into v_org, v from public.refund x where x.id = p_entity_id;
    else
      raise exception 'invalid_input' using errcode = '22023', detail = 'entity_type';
  end case;
  if v_org is null or v_org not in (select authz.user_org_ids('{ops}')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
comment on function public.ops_billing_internal(text, uuid) is
  'Ops: internal columns (notes, deciders) of a billing record; user ids as {id, name}.';

create function public.ops_orders(
  p_org_id uuid,
  p_status text default null,
  p_customer_user_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  number text,
  status text,
  customer_user_id uuid,
  customer_name text,
  quote_id uuid,
  quote_number text,
  application_id uuid,
  package_name text,
  total_kurus bigint,
  paid_kurus bigint,
  refunded_kurus bigint,
  currency text,
  payment_due_at timestamptz,
  overdue boolean,
  live_payment boolean,
  service_start date,
  service_end date,
  renewal_due boolean,
  renewal_of_order_id uuid,
  activated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  terminated_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_notice integer := coalesce(
    (select s.renewal_notice_days from public.org_billing_setting s where s.org_id = p_org_id), 45);
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and not p_status = any (enum_range(null::public.order_status)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select o.id, o.number, o.status::text, o.customer_user_id, op.full_name, o.quote_id, q.number, q.application_id,
         q.package_name, o.total_kurus, o.paid_kurus, o.refunded_kurus, o.currency, o.payment_due_at,
         o.status = 'awaiting_payment' and o.payment_due_at < now(),
         private.live_payment_attempt(o.id),
         o.service_start, o.service_end,
         o.status = 'active' and o.service_end < private.istanbul_today() + v_notice
           and not exists (select 1 from public.service_order n
                           where n.renewal_of_order_id = o.id and n.status in ('awaiting_payment', 'active', 'completed')),
         o.renewal_of_order_id, o.activated_at, o.completed_at, o.cancelled_at, o.cancel_reason, o.terminated_at,
         o.created_at
  from public.service_order o
  join public.quote q on q.id = o.quote_id
  left join private.owner_profile op on op.org_id = o.org_id and op.user_id = o.customer_user_id
  where o.org_id = p_org_id
    and (p_status is null or o.status::text = p_status)
    and (p_customer_user_id is null or o.customer_user_id = p_customer_user_id)
  order by o.created_at desc, o.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_orders(uuid, text, uuid, integer) is
  'Ops: orders of the org with amounts, due and renewal flags and whether a card payment is in progress.';

create function public.ops_payments(
  p_org_id uuid,
  p_status text default null,
  p_order_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  order_id uuid,
  order_number text,
  customer_user_id uuid,
  customer_name text,
  provider text,
  status text,
  amount_kurus bigint,
  provider_amount_kurus bigint,
  paid_kurus bigint,
  refunded_kurus bigint,
  refundable_kurus bigint,
  currency text,
  installment smallint,
  card_association text,
  card_last4 text,
  fraud_status smallint,
  failure_code text,
  receipt_number text,
  bank_reference text,
  value_date date,
  token_expires_at timestamptz,
  initiated_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  voided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and not p_status = any (enum_range(null::public.payment_status)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select p.id, p.order_id, o.number, p.customer_user_id, op.full_name, p.provider::text, p.status::text,
         p.amount_kurus, p.provider_amount_kurus, p.paid_kurus, p.refunded_kurus,
         case when p.status = 'succeeded' then greatest(private.refund_room(p), 0) else 0 end,
         p.currency, p.installment, p.card_association, p.card_last4, p.fraud_status, p.failure_code,
         p.receipt_number, p.bank_reference, p.value_date, p.token_expires_at, p.initiated_at, p.succeeded_at,
         p.failed_at, p.voided_at
  from public.payment p
  join public.service_order o on o.id = p.order_id
  left join private.owner_profile op on op.org_id = p.org_id and op.user_id = p.customer_user_id
  where p.org_id = p_org_id
    and (p_status is null or p.status::text = p_status)
    and (p_order_id is null or p.order_id = p_order_id)
  order by p.initiated_at desc, p.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_payments(uuid, text, uuid, integer) is
  'Ops: payments of the org (card attempts and transfers) with what is still refundable.';

-- Provider events of a payment and of its refunds (allow-listed payloads).
-- dedup_key with the provider token cut out (retrieve:<token>:…,
-- wh:fake:<token>:…): the token alone lets anyone post the payment callback.
create function public.ops_payment_events(p_payment_id uuid)
returns table (
  id uuid,
  provider text,
  event_type text,
  dedup_key text,
  refund_id uuid,
  signature_valid boolean,
  http_status integer,
  outcome text,
  payload jsonb,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.provider::text, e.event_type,
         regexp_replace(e.dedup_key, '^(retrieve|wh:fake):[^:]+', '\1:…'), e.refund_id, e.signature_valid, e.http_status, e.outcome,
         e.payload, e.received_at
  from public.payment p
  join private.payment_event e
    on e.payment_id = p.id or e.refund_id in (select r.id from public.refund r where r.payment_id = p.id)
  where p.id = p_payment_id and p.org_id in (select authz.user_org_ids('{ops}'))
  order by e.received_at, e.id;
$$;
comment on function public.ops_payment_events(uuid) is
  'Ops: provider calls and notifications of a payment and its refunds.';

create function public.ops_refunds(
  p_org_id uuid,
  p_status text default null,
  p_payment_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  number text,
  payment_id uuid,
  order_id uuid,
  order_number text,
  customer_user_id uuid,
  customer_name text,
  provider text,
  payment_item_id uuid,
  kind text,
  status text,
  amount_kurus bigint,
  currency text,
  reason text,
  by_system boolean,
  requested_at timestamptz,
  attempts integer,
  processing_since timestamptz,
  uncertain boolean,
  processed_at timestamptz,
  provider_ref text,
  failure_code text,
  retryable boolean,
  bank_reference text,
  completed_on date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  if p_status is not null and not p_status = any (enum_range(null::public.refund_status)::text[]) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'status';
  end if;
  return query
  select r.id, r.number, r.payment_id, r.order_id, o.number, r.customer_user_id, op.full_name, p.provider::text,
         r.payment_item_id, r.kind::text, r.status::text, r.amount_kurus, r.currency, r.reason::text,
         r.requested_by is null, r.requested_at, r.attempts, r.processing_since,
         r.status = 'processing' and r.processing_since < now() - interval '15 minutes',
         r.processed_at, r.provider_ref, r.failure_code, r.retryable, r.bank_reference, r.completed_on
  from public.refund r
  join public.payment p on p.id = r.payment_id
  join public.service_order o on o.id = r.order_id
  left join private.owner_profile op on op.org_id = r.org_id and op.user_id = r.customer_user_id
  where r.org_id = p_org_id
    and (p_status is null or r.status::text = p_status)
    and (p_payment_id is null or r.payment_id = p_payment_id)
  order by r.requested_at desc, r.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_refunds(uuid, text, uuid, integer) is
  'Ops: refunds of the org; a card refund processing for more than 15 minutes is uncertain.';

create function public.ops_audit_events(
  p_org_id uuid,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_action_prefix text default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ops(p_org_id);
  return query
  select e.id, e.actor_user_id, private.user_ref(e.org_id, e.actor_user_id) ->> 'name', e.actor_role, e.action,
         e.entity_type, e.entity_id, e.details, e.created_at
  from public.audit_event e
  where e.org_id = p_org_id
    and (p_entity_type is null or e.entity_type = p_entity_type)
    and (p_entity_id is null or e.entity_id = p_entity_id)
    and (p_action_prefix is null or left(e.action, length(p_action_prefix)) = p_action_prefix)
  order by e.created_at desc, e.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end;
$$;
comment on function public.ops_audit_events(uuid, text, uuid, text, integer) is
  'Ops: audit log of the org, newest first, filtered by entity and action prefix.';

revoke all on function private.user_ref(uuid, uuid) from public;
revoke all on function public.ops_billing_summary(uuid) from public, anon, authenticated;
revoke all on function public.ops_customers(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.ops_billing_internal(text, uuid) from public, anon, authenticated;
revoke all on function public.ops_orders(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.ops_payments(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.ops_payment_events(uuid) from public, anon, authenticated;
revoke all on function public.ops_refunds(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.ops_audit_events(uuid, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.ops_billing_summary(uuid) to authenticated;
grant execute on function public.ops_customers(uuid, text, integer) to authenticated;
grant execute on function public.ops_billing_internal(text, uuid) to authenticated;
grant execute on function public.ops_orders(uuid, text, uuid, integer) to authenticated;
grant execute on function public.ops_payments(uuid, text, uuid, integer) to authenticated;
grant execute on function public.ops_payment_events(uuid) to authenticated;
grant execute on function public.ops_refunds(uuid, text, uuid, integer) to authenticated;
grant execute on function public.ops_audit_events(uuid, text, uuid, text, integer) to authenticated;
