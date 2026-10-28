-- Legal follow-ups, wave 3 / 6: automatic sweep of missing contract documents
-- (docs/hukuk/kararlar.md H12: every accepted or activated order ends with its
-- documents; T04; docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)").
--
-- Wave 2 renders the documents on acceptance, on page visits and from the
-- ops list; an order nobody visits may still miss one (especially the
-- withdrawal confirmation after the payment). The Next server renders the
-- PDFs and has no service key (docs/deployment.md), so the sweep reads what
-- it needs through a short-lived ticket:
--
-- 1. private.dispatch_contract_document_sweep() (pg_cron every 30 minutes)
--    picks at most 5 orders whose missing documents are registrable
--    (the ops_orders_missing_contract_documents rule), that have an
--    acceptance snapshot and no manual-copy marker, accepted at least 15
--    minutes ago; stores a ticket (SHA-256 of a random token, the order ids,
--    10 minutes) and POSTs {ticket} to the Next route with the cron secret
--    (Vault: contract_documents_sweep_url, orchados_cron_secret, as
--    private.dispatch_signup_cleanup). Without them it does nothing.
-- 2. The route (apps/web/src/app/sistem/sozlesme-tarama/route.ts) sends the
--    ticket as the header x-orchados-sweep-ticket with the anon key:
--    public.sweep_contract_orders() returns the ticket's orders (ids,
--    number, days and the missing kinds; no personal data) and a storage
--    policy lets it read their acceptance snapshots and markers only. It
--    renders and uploads through the system mode of the contract-documents
--    Edge Function (x-orchados-sweep: 1), which re-checks every document.

create table private.contract_sweep_ticket (
  id uuid primary key default gen_random_uuid(),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  order_ids uuid[] not null check (cardinality(order_ids) between 1 and 20),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
comment on table private.contract_sweep_ticket is
  'T04 sweep: a short-lived ticket (hash of the token) naming the orders one sweep call may read. No personal data.';
alter table private.contract_sweep_ticket enable row level security;
revoke all on private.contract_sweep_ticket from public, anon, authenticated;
select private.attach_demo_guard('private.contract_sweep_ticket');

-- The orders of the request's ticket (header x-orchados-sweep-ticket, set by
-- PostgREST and Storage in request.headers), or none. Callable by anyone: it
-- only answers for a ticket the caller already holds.
create function public.contract_sweep_ticket_orders()
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_token text;
begin
  if v_headers is null or not pg_input_is_valid(v_headers, 'json') then
    return '{}';
  end if;
  v_token := v_headers::json ->> 'x-orchados-sweep-ticket';
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    return '{}';
  end if;
  return coalesce((
    select t.order_ids from private.contract_sweep_ticket t
    where t.token_sha256 = encode(extensions.digest(v_token, 'sha256'), 'hex') and t.expires_at > now()
  ), '{}');
end;
$$;
comment on function public.contract_sweep_ticket_orders() is
  'T04 sweep: the order ids of the valid ticket in the request header x-orchados-sweep-ticket, else empty.';
revoke all on function public.contract_sweep_ticket_orders() from public;
grant execute on function public.contract_sweep_ticket_orders() to anon, authenticated;

-- The ticket's orders for the sweep route: what the renderer needs, no
-- personal data (the buyer comes from the snapshot).
create function public.sweep_contract_orders()
returns table (
  order_id uuid,
  org_id uuid,
  customer_user_id uuid,
  order_number text,
  accepted_at timestamptz,
  activated_at timestamptz,
  service_start date,
  service_end date,
  missing text[],
  existing text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.org_id, o.customer_user_id, o.number, o.created_at, o.activated_at, o.service_start, o.service_end,
         array(
           select k from unnest(array['pre_information', 'distance_sales', 'withdrawal_confirmation']) k
           where (k <> 'withdrawal_confirmation' or o.activated_at is not null)
             and not exists (select 1 from private.contract_document d where d.order_id = o.id and d.kind = k)
             and private.contract_document_registrable(o.id, k)),
         array(select d.kind from private.contract_document d where d.order_id = o.id order by d.kind)
  from public.service_order o
  where o.id = any (public.contract_sweep_ticket_orders())
    and o.quote_id is not null and not private.is_demo_org(o.org_id)
  order by o.created_at, o.id;
$$;
comment on function public.sweep_contract_orders() is
  'T04 sweep: the orders of the request''s ticket with their missing and existing contract document kinds.';
revoke all on function public.sweep_contract_orders() from public;
grant execute on function public.sweep_contract_orders() to anon, authenticated;

-- The sweep reads the acceptance snapshots and manual-copy markers of the
-- ticket's orders, nothing else (no PDF).
create policy contract_documents_sweep_select on storage.objects for select to anon
  using (
    bucket_id = 'contract-documents'
    and (storage.filename(objects.name) like 'acceptance-%.json' or storage.filename(objects.name) = 'manual-copy.json')
    and (storage.foldername(objects.name))[2] = any ((public.contract_sweep_ticket_orders())::text[])
  );

-- Orders to sweep: missing registrable documents, a snapshot, no marker,
-- accepted at least 15 minutes ago (the acceptance's own writer first).
create function private.contract_sweep_candidates(p_limit integer)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select array(
    select o.id from public.service_order o
    where o.quote_id is not null and not private.is_demo_org(o.org_id)
      and o.created_at < now() - interval '15 minutes'
      and exists (
        select 1 from unnest(array['pre_information', 'distance_sales', 'withdrawal_confirmation']) k
        where (k <> 'withdrawal_confirmation' or o.activated_at is not null)
          and not exists (select 1 from private.contract_document d where d.order_id = o.id and d.kind = k)
          and private.contract_document_registrable(o.id, k))
      and exists (
        select 1 from storage.objects s
        where s.bucket_id = 'contract-documents' and s.name like o.org_id || '/' || o.id || '/acceptance-%.json')
      and not exists (
        select 1 from storage.objects s
        where s.bucket_id = 'contract-documents' and s.name = o.org_id || '/' || o.id || '/manual-copy.json')
    order by o.created_at, o.id
    limit greatest(1, least(coalesce(p_limit, 5), 20)));
$$;
revoke all on function private.contract_sweep_candidates(integer) from public;

-- The pg_cron job. Returns the pg_net request id, or null when not
-- configured (Vault) or nothing is missing.
create function private.dispatch_contract_document_sweep()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_orders uuid[];
  v_token text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'contract_documents_sweep_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'orchados_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  delete from private.contract_sweep_ticket where expires_at < now() - interval '1 day';
  v_orders := private.contract_sweep_candidates(5);
  if cardinality(v_orders) = 0 then
    return null;
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.contract_sweep_ticket (token_sha256, order_ids, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_orders, now() + interval '10 minutes');
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-orchados-cron-secret', v_secret),
    body := jsonb_build_object('ticket', v_token),
    timeout_milliseconds := 120000
  );
end;
$$;
comment on function private.dispatch_contract_document_sweep() is
  'T04 sweep (pg_cron): a ticket for at most 5 orders with missing documents, POSTed to the Next sweep route; no-op without its Vault secrets.';
revoke all on function private.dispatch_contract_document_sweep() from public;

select cron.schedule('contract-document-sweep', '*/30 * * * *', 'select private.dispatch_contract_document_sweep()');
