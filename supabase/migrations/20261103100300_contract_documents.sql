-- Legal follow-ups, wave 1 / 4: data layer of the order-specific contract
-- documents (docs/hukuk/kararlar.md H12, H13, H18, T04; contract in
-- docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"). The wave-2 stream
-- renders the PDFs and registers them through an Edge Function with the
-- service role.
--
-- 1. private.consent_record: text_sha256 (template hash, registry) and
--    display_sha256 (the filled rendering the customer saw).
-- 2. private.contract_document: insert-only, one row per order and kind
--    (pre_information, distance_sales, withdrawal_confirmation), linked to the
--    order's consent rows by id.
-- 3. Storage bucket contract-documents: private; customers and ops of the org
--    read; no API user writes; a trigger refuses every UPDATE and DELETE of
--    its objects (also through the Storage API with the service role). Kept
--    10 years from the acceptance (H12); the later retention job (T10) removes
--    them only through a recorded, controlled exception.
-- 4. public.service_register_contract_document (service_role), readers
--    my_contract_documents, ops_contract_documents,
--    ops_orders_missing_contract_documents; contract_ready SMS once per order.

-- ---------------------------------------------------------------------------
-- 1. Consent hashes
-- ---------------------------------------------------------------------------

alter table private.consent_record
  add column text_sha256 text check (text_sha256 ~ '^[0-9a-f]{64}$'),
  add column display_sha256 text check (display_sha256 ~ '^[0-9a-f]{64}$');
comment on column private.consent_record.text_sha256 is
  'SHA-256 of the versioned template (private.legal_text_version.sha256; apps/web/src/lib/legal/text-hash.ts). Null for rows before T04.';
comment on column private.consent_record.display_sha256 is
  'SHA-256 of the order-specific filled rendering the customer saw (sent by the quote page; stored as given). Null when not sent.';

-- ---------------------------------------------------------------------------
-- 2. Documents
-- ---------------------------------------------------------------------------

create table private.contract_document (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  quote_id uuid not null references public.quote (id),
  order_id uuid not null references public.service_order (id),
  kind text not null check (kind in ('pre_information', 'distance_sales', 'withdrawal_confirmation')),
  text_version text not null check (text_version ~ '^[a-z0-9][a-z0-9.-]{1,40}$'),
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z_]+\.pdf$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  generator text not null check (length(btrim(generator)) between 1 and 100),
  consent_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);
comment on table private.contract_document is
  'T04: the order-specific contract PDFs (insert-only, 10 years from acceptance). Object in bucket contract-documents at storage_path.';
comment on column private.contract_document.kind is
  'pre_information, distance_sales (at acceptance) or withdrawal_confirmation (once the order activates: the concrete last withdrawal day).';
comment on column private.contract_document.text_version is 'Registered version of the template (pre_information, else distance_sales).';
comment on column private.contract_document.text_sha256 is 'Template hash of text_version (registry).';
comment on column private.contract_document.storage_path is '{org_id}/{order_id}/{kind}.pdf in bucket contract-documents.';
comment on column private.contract_document.sha256 is 'SHA-256 of the stored PDF.';
comment on column private.contract_document.generator is 'Code version that rendered the PDF.';
comment on column private.contract_document.consent_ids is
  'The order''s consent_record rows the document belongs to (pre_information; distance_sales and early_performance). consent_record is not updated.';
create index contract_document_customer_idx on private.contract_document (customer_user_id);
create index contract_document_org_idx on private.contract_document (org_id);
create index contract_document_quote_idx on private.contract_document (quote_id);

create trigger contract_document_insert_only before update or delete on private.contract_document
for each row execute function private.forbid_mutation();
create trigger contract_document_no_truncate before truncate on private.contract_document
for each statement execute function private.forbid_mutation();

alter table private.contract_document enable row level security;
revoke all on private.contract_document from public, anon, authenticated;
select private.attach_demo_guard('private.contract_document');
select private.attach_demo_account_guard('private.contract_document', 'customer_user_id');

-- ---------------------------------------------------------------------------
-- 3. Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-documents', 'contract-documents', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- The order's customer and the org's ops read; demo visitors never.
create policy contract_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'contract-documents'
    and not (select authz.is_demo_user())
    and exists (
      select 1 from public.service_order o
      where o.id = authz.uuid_or_null((storage.foldername(objects.name))[2])
        and o.org_id = authz.uuid_or_null((storage.foldername(objects.name))[1])
        and (o.customer_user_id = (select auth.uid()) or o.org_id in (select authz.user_org_ids('{ops}')))
    )
  );

-- Objects of the bucket are never changed or removed once written. Inserts
-- pass (the Storage API writes one row per upload); an upsert over an
-- existing object, a move, a metadata change and a delete are refused for
-- every role, the service role included. The test cleanup turns triggers off
-- (session_replication_role = replica).
create function private.contract_document_object_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.bucket_id = 'contract-documents' then
      raise exception 'contract_document_immutable' using errcode = '42501',
        hint = 'Contract documents are kept unchanged for 10 years (docs/musteri-yonetimi.md, T04).';
    end if;
    return old;
  end if;
  if old.bucket_id = 'contract-documents' or new.bucket_id = 'contract-documents' then
    raise exception 'contract_document_immutable' using errcode = '42501',
      hint = 'Contract documents are kept unchanged for 10 years (docs/musteri-yonetimi.md, T04).';
  end if;
  return new;
end;
$$;
comment on function private.contract_document_object_guard() is
  'Trigger on storage.objects: refuses UPDATE and DELETE of objects in bucket contract-documents.';
revoke all on function private.contract_document_object_guard() from public;

-- Hosted projects: should the migration role not be allowed to create a
-- trigger on storage.objects, the migration still applies (a failed deploy
-- would hold back every later migration); the warning shows in the deploy
-- log and private.contract_documents_guarded() reports false. The fallback
-- is the documented rule plus the SHA-256 check of the download readers.
do $$
begin
  create trigger contract_documents_immutable before update or delete on storage.objects
  for each row execute function private.contract_document_object_guard();
exception when insufficient_privilege then
  raise warning 'contract_documents_immutable: no privilege to create the trigger on storage.objects';
end;
$$;

create function private.contract_documents_guarded()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from pg_catalog.pg_trigger g
    where g.tgrelid = 'storage.objects'::regclass and g.tgname = 'contract_documents_immutable' and g.tgenabled <> 'D');
$$;
comment on function private.contract_documents_guarded() is
  'T04: the immutability trigger of bucket contract-documents exists on storage.objects.';
revoke all on function private.contract_documents_guarded() from public;

-- ---------------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------------

-- Registers a stored PDF of an order (service_role; the wave-2 Edge Function
-- uploads the object first). Idempotent for the same PDF: an existing row of
-- the order and kind with the same sha256 returns its id; another sha256 is
-- exists. Queues contract_ready (S-…, /portal/hesap/sozlesmeler) once the
-- order has both acceptance documents; once per order. Errors: not_found
-- (order), demo_read_only, invalid_input (kind, text_version, text_sha256,
-- storage_path, sha256, size_bytes, generator), order_not_active
-- (withdrawal_confirmation before activation), exists.
create function public.service_register_contract_document(
  p_order_id uuid,
  p_kind text,
  p_text_version text,
  p_text_sha256 text,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes bigint,
  p_generator text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.service_order;
  d private.contract_document;
  v_text_kind text;
  v_object_size bigint;
  v_consents uuid[];
  v_id uuid;
begin
  select * into o from public.service_order x where x.id = p_order_id for update;
  if not found or o.quote_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if private.is_demo_org(o.org_id) or authz.is_demo_account(o.customer_user_id) then
    raise exception 'demo_read_only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('pre_information', 'distance_sales', 'withdrawal_confirmation') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  if p_kind = 'withdrawal_confirmation' and o.activated_at is null then
    raise exception 'order_not_active' using errcode = 'P0001';
  end if;
  v_text_kind := case p_kind when 'pre_information' then 'pre_information' else 'distance_sales' end;
  if not exists (
    select 1 from private.legal_text_version v where v.kind = v_text_kind and v.version = p_text_version
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_version';
  end if;
  if p_text_sha256 is null or p_text_sha256 !~ '^[0-9a-f]{64}$'
     or p_text_sha256 is distinct from coalesce(
       (select v.sha256 from private.legal_text_version v where v.kind = v_text_kind and v.version = p_text_version),
       (select c.text_sha256 from private.consent_record c
        where c.order_id = o.id and c.kind::text = v_text_kind and c.text_version = p_text_version
        order by c.recorded_at limit 1)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'text_sha256';
  end if;
  if p_storage_path is distinct from o.org_id || '/' || o.id || '/' || p_kind || '.pdf' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'storage_path';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'sha256';
  end if;
  if p_generator is null or length(btrim(p_generator)) not between 1 and 100 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'generator';
  end if;

  select * into d from private.contract_document x where x.order_id = o.id and x.kind = p_kind;
  if found then
    if d.sha256 = p_sha256 then
      return d.id;
    end if;
    raise exception 'exists' using errcode = '23505';
  end if;

  select (s.metadata ->> 'size')::bigint into v_object_size
  from storage.objects s where s.bucket_id = 'contract-documents' and s.name = p_storage_path;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'storage_path';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520
     or (v_object_size is not null and v_object_size <> p_size_bytes) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'size_bytes';
  end if;

  v_consents := array(
    select c.id from private.consent_record c
    where c.order_id = o.id
      and c.kind::text = any (case p_kind
        when 'pre_information' then array['pre_information']
        else array['distance_sales', 'early_performance'] end)
    order by c.recorded_at, c.id);
  insert into private.contract_document (org_id, customer_user_id, quote_id, order_id, kind, text_version,
    text_sha256, storage_path, sha256, size_bytes, generator, consent_ids)
  values (o.org_id, o.customer_user_id, o.quote_id, o.id, p_kind, p_text_version, p_text_sha256, p_storage_path,
    p_sha256, p_size_bytes, btrim(p_generator), v_consents)
  returning id into v_id;

  perform private.audit(o.org_id, null, 'system', 'contract_document.registered', 'order', o.id,
    jsonb_build_object('kind', p_kind, 'document_id', v_id, 'text_version', p_text_version));
  if (select count(*) from private.contract_document x
      where x.order_id = o.id and x.kind in ('pre_information', 'distance_sales')) = 2 then
    perform private.enqueue_billing_notification('contract_ready', o.org_id, o.customer_user_id, o.id, o.number,
      '/portal/hesap/sozlesmeler');
  end if;
  return v_id;
end;
$$;
comment on function public.service_register_contract_document(uuid, text, text, text, text, text, bigint, text) is
  'service_role (T04): registers an uploaded contract PDF of an order; queues contract_ready once both acceptance documents exist.';

-- The caller's documents, newest order first.
create function public.my_contract_documents()
returns table (
  id uuid,
  order_id uuid,
  order_number text,
  quote_id uuid,
  kind text,
  text_version text,
  text_sha256 text,
  storage_path text,
  sha256 text,
  size_bytes bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_not_demo();
  return query
  select d.id, d.order_id, o.number, d.quote_id, d.kind, d.text_version, d.text_sha256, d.storage_path, d.sha256,
         d.size_bytes, d.created_at
  from private.contract_document d
  join public.service_order o on o.id = d.order_id
  where d.customer_user_id = (select auth.uid())
  order by o.created_at desc, o.id, d.kind;
end;
$$;
comment on function public.my_contract_documents() is 'Customer: the contract documents of their orders (Sözleşmelerim).';

-- Ops: the documents of an order. Errors: not_found, forbidden.
create function public.ops_contract_documents(p_order_id uuid)
returns table (
  id uuid,
  kind text,
  text_version text,
  text_sha256 text,
  storage_path text,
  sha256 text,
  size_bytes bigint,
  generator text,
  consent_ids uuid[],
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.service_order;
begin
  select * into o from public.service_order x where x.id = p_order_id;
  if not found or o.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(o.org_id);
  return query
  select d.id, d.kind, d.text_version, d.text_sha256, d.storage_path, d.sha256, d.size_bytes, d.generator,
         d.consent_ids, d.created_at
  from private.contract_document d
  where d.order_id = o.id
  order by d.created_at, d.kind;
end;
$$;
comment on function public.ops_contract_documents(uuid) is 'Ops: the contract documents of an order.';

-- Ops: orders of the caller's ops orgs missing a document: every accepted
-- order without pre_information or distance_sales, every activated order
-- without withdrawal_confirmation. Demo orgs are left out.
create function public.ops_orders_missing_contract_documents()
returns table (
  order_id uuid,
  org_id uuid,
  order_number text,
  customer_user_id uuid,
  status public.order_status,
  accepted_at timestamptz,
  activated_at timestamptz,
  missing text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.org_id, o.number, o.customer_user_id, o.status, o.created_at, o.activated_at, m.missing
  from public.service_order o
  cross join lateral (
    select array(
      select k from unnest(array['pre_information', 'distance_sales', 'withdrawal_confirmation']) k
      where (k <> 'withdrawal_confirmation' or o.activated_at is not null)
        and not exists (select 1 from private.contract_document d where d.order_id = o.id and d.kind = k)
    ) as missing
  ) m
  where o.org_id in (select authz.user_org_ids('{ops}'))
    and o.quote_id is not null
    and not private.is_demo_org(o.org_id)
    and cardinality(m.missing) > 0
  order by o.created_at, o.id;
$$;
comment on function public.ops_orders_missing_contract_documents() is
  'Ops: orders missing a contract document (acceptance documents; withdrawal confirmation once active).';

revoke all on function public.service_register_contract_document(uuid, text, text, text, text, text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.my_contract_documents() from public, anon, authenticated;
revoke all on function public.ops_contract_documents(uuid) from public, anon, authenticated;
revoke all on function public.ops_orders_missing_contract_documents() from public, anon, authenticated;
grant execute on function public.service_register_contract_document(uuid, text, text, text, text, text, bigint, text)
  to service_role;
grant execute on function public.my_contract_documents() to authenticated;
grant execute on function public.ops_contract_documents(uuid) to authenticated;
grant execute on function public.ops_orders_missing_contract_documents() to authenticated;
