-- IP12-E fix-forward: per-customer lookups for the back office.
-- ops_customers and ops_applications are org-wide lists capped at 1000 rows,
-- so the customer account panel and the quote page lost older customers once
-- an org passed that. These two read one customer by user id. Same columns,
-- checks and grants as the org-wide lists (docs/musteri-yonetimi.md §6.9).

-- One owner profile of the org with its billing figures (ops_customers' row).
create function public.ops_customer(p_org_id uuid, p_user_id uuid)
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
begin
  perform private.require_ops(p_org_id);
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
  where op.org_id = p_org_id and op.user_id = p_user_id;
end;
$$;
comment on function public.ops_customer(uuid, uuid) is
  'Ops: one owner profile of the org by user id, with the columns of ops_customers.';

-- Applications of one customer (all but drafts), newest first; the columns
-- of ops_applications.
create function public.ops_customer_applications(p_org_id uuid, p_user_id uuid)
returns table (
  id uuid,
  number text,
  status text,
  customer_user_id uuid,
  customer_name text,
  package_id uuid,
  package_name text,
  garden_count integer,
  declared_area_m2 numeric,
  verified_garden_count integer,
  open_quote_id uuid,
  rejection_reason text,
  submitted_at timestamptz,
  decided_at timestamptz,
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
  select a.id, a.number, a.status::text, a.customer_user_id, op.full_name, a.package_id, sp.name,
         coalesce(g.n, 0)::integer, coalesce(g.area, 0), coalesce(g.verified, 0)::integer,
         q.id, a.rejection_reason::text, a.submitted_at, a.decided_at, a.created_at
  from public.service_application a
  left join private.owner_profile op on op.user_id = a.customer_user_id and op.org_id = a.org_id
  left join public.service_package sp on sp.id = a.package_id
  left join lateral (
    select count(*) as n, sum(x.declared_area_m2) as area, count(x.verified_at) as verified
    from public.application_garden x where x.application_id = a.id
  ) g on true
  left join public.quote q on q.application_id = a.id and q.status = 'issued'
  where a.org_id = p_org_id and a.customer_user_id = p_user_id and a.status <> 'draft'
  order by coalesce(a.submitted_at, a.created_at) desc, a.id;
end;
$$;
comment on function public.ops_customer_applications(uuid, uuid) is
  'Ops: applications of one customer of the org (all but drafts), with the columns of ops_applications.';

revoke all on function public.ops_customer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ops_customer_applications(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ops_customer(uuid, uuid) to authenticated;
grant execute on function public.ops_customer_applications(uuid, uuid) to authenticated;
