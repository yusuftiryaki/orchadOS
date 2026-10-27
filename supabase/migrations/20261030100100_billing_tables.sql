-- IP12 / 2: tables of customer acquisition and billing (docs/musteri-yonetimi.md
-- §6.3, §6.4, §6.8, §6.11). Column names are a contract shared with IP12-A2
-- (functions), B (payment Edge Functions), D (portal) and E (back office).
--
-- 1. Helpers: touch trigger, insert-only variants, audit, document numbers,
--    signup org, TCKN check.
-- 2. public tables: settings, packages, price lists, applications, quotes,
--    orders, payments, refunds, audit log. Every one carries org_id; customer
--    tables also carry customer_user_id (on delete restrict).
-- 3. private tables: billing profile, payment snapshot, consent records,
--    pending sign-ups and attempts, garden detail, payment events, document
--    counters. RLS on without policies; service_role only.
-- 4. Guards: published price lists, quotes, order items; insert-only tables.
-- 5. Row level security and column grants. API users never write these
--    tables; customers read their own rows without the internal columns, ops
--    reads its org's rows (internal columns through functions, IP12-A2).
--
-- Money is kuruş in bigint with currency 'TRY'; areas are m² numeric(12,2).

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Insert-only, except that deleting the referenced auth user may clear the
-- user column named in the trigger argument (on delete set null): the record
-- (consent evidence, audit trail) outlives the account.
create function private.insert_only_unlink_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(old) ->> tg_argv[0] is not null
     and to_jsonb(new) = jsonb_set(to_jsonb(old), array[tg_argv[0]], 'null'::jsonb) then
    return new;
  end if;
  raise exception '% on %.% is not allowed: table is insert-only', tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001', hint = 'Insert a new row instead of changing an existing one.';
end;
$$;

-- Turkish identity number (TCKN): 11 digits, no leading zero, two check digits.
create function private.is_valid_tckn(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d integer[];
  v_odd integer;
  v_even integer;
begin
  if p_value is null or p_value !~ '^[1-9][0-9]{10}$' then
    return false;
  end if;
  d := array(select substr(p_value, i, 1)::integer from generate_series(1, 11) i);
  v_odd := d[1] + d[3] + d[5] + d[7] + d[9];
  v_even := d[2] + d[4] + d[6] + d[8];
  return (((v_odd * 7 - v_even) % 10) + 10) % 10 = d[10]
     and (d[1] + d[2] + d[3] + d[4] + d[5] + d[6] + d[7] + d[8] + d[9] + d[10]) % 10 = d[11];
end;
$$;
comment on function private.is_valid_tckn(text) is 'True for a well-formed Turkish identity number (check digits).';

-- ---------------------------------------------------------------------------
-- 2. public tables
-- ---------------------------------------------------------------------------

create table public.org_billing_setting (
  org_id uuid primary key references public.org (id) on delete cascade,
  accepts_signups boolean not null default false,
  -- Set with SQL only (test project, local); ops_save_billing_setting refuses it.
  allow_fake_payments boolean not null default false,
  -- iyzico asks for the real TCKN: collected in private.billing_profile.
  identity_number_required boolean not null default false,
  legal_name text check (length(btrim(legal_name)) between 1 and 200),
  tax_office text check (length(btrim(tax_office)) between 1 and 100),
  tax_number text check (tax_number ~ '^[0-9]{10}$'),
  mersis_number text check (mersis_number ~ '^[0-9]{16}$'),
  address text check (length(btrim(address)) between 1 and 500),
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  bank_name text check (length(btrim(bank_name)) between 1 and 100),
  iban text check (iban ~ '^TR[0-9]{24}$'),
  iban_holder text check (length(btrim(iban_holder)) between 1 and 200),
  payment_due_days integer not null default 14 check (payment_due_days between 1 and 60),
  quote_valid_days integer not null default 30 check (quote_valid_days between 1 and 90),
  renewal_notice_days integer not null default 45 check (renewal_notice_days between 7 and 120),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.org_billing_setting is
  'Billing settings of an org: sign-ups, seller identity on receipts, bank account for transfers, durations.';
-- Self sign-up opens at most one org (private.signup_org_id).
create unique index org_billing_setting_accepts_signups_uq
  on public.org_billing_setting (accepts_signups) where accepts_signups;

create table public.service_package (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_-]{1,31}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text check (length(description) <= 2000),
  periodic_visits_per_year smallint not null check (periodic_visits_per_year between 1 and 12),
  includes_inventory boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id)
);
comment on table public.service_package is 'Service package: periodic visits a year (and the inventory in the first year).';

create table public.price_list (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  version integer check (version > 0),
  status public.price_list_status not null default 'draft',
  valid_from date,
  currency text not null default 'TRY' check (currency = 'TRY'),
  -- VAT in basis points (2000 = 20 %).
  vat_rate_bp integer not null default 2000 check (vat_rate_bp between 0 and 10000),
  note text check (length(note) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, version),
  unique (id, org_id),
  check ((status = 'published') = (version is not null and published_at is not null)),
  check (status <> 'published' or valid_from is not null)
);
comment on table public.price_list is
  'Versioned price list (per dönüm, per year). A published version never changes; quotes freeze its values.';

create table public.price_list_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  price_list_id uuid not null,
  package_id uuid not null,
  -- Per visit and per dönüm (1000 m²).
  unit_price_kurus bigint not null check (unit_price_kurus > 0),
  minimum_fee_kurus bigint not null default 0 check (minimum_fee_kurus >= 0),
  inventory_fee_kurus bigint not null default 0 check (inventory_fee_kurus >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (price_list_id, package_id),
  foreign key (price_list_id, org_id) references public.price_list (id, org_id) on delete cascade,
  foreign key (package_id, org_id) references public.service_package (id, org_id)
);
create index price_list_item_package_idx on public.price_list_item (package_id);

create table public.service_application (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  number text unique check (number ~ '^B-[0-9]{4}-[0-9]{6}$'),
  status public.application_status not null default 'draft',
  package_id uuid,
  customer_note text check (length(customer_note) <= 1000),
  rejection_reason public.application_rejection_reason,
  ops_note text check (length(ops_note) <= 2000),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_user_id, org_id),
  foreign key (package_id, org_id) references public.service_package (id, org_id),
  check (status <> 'draft' or (submitted_at is null and number is null)),
  -- A draft may be withdrawn: no number then.
  check (status in ('draft', 'withdrawn') or (submitted_at is not null and number is not null)),
  check (status <> 'rejected' or rejection_reason is not null)
);
comment on table public.service_application is
  'A customer''s application: gardens and a package, reviewed by ops (draft → submitted → quoted → accepted).';
create unique index service_application_one_draft_uq
  on public.service_application (customer_user_id, org_id) where status = 'draft';
create index service_application_org_status_idx on public.service_application (org_id, status, submitted_at);
create index service_application_package_idx on public.service_application (package_id);

create table public.application_garden (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  application_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  sort_order smallint not null default 0,
  name text not null check (length(btrim(name)) between 1 and 120),
  province text check (length(province) <= 100),
  district text check (length(district) <= 100),
  village text check (length(village) <= 100),
  declared_area_m2 numeric(12, 2) not null check (declared_area_m2 between 500 and 10000000),
  irrigation public.irrigation_type not null default 'unknown',
  estimated_tree_count integer check (estimated_tree_count between 0 and 1000000),
  position extensions.geometry(Point, 4326) not null,
  position_uncertainty_m real not null default 100 check (position_uncertainty_m > 0),
  -- Rough boundary drawn by the customer (becomes v1 owner_declared on activation).
  boundary extensions.geometry(Polygon, 4326),
  verified_area_m2 numeric(12, 2) check (verified_area_m2 > 0),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  verification_note text check (length(verification_note) <= 2000),
  -- The parcel opened for this garden when the order was activated.
  parcel_id uuid references public.parcel (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (application_id, customer_user_id, org_id)
    references public.service_application (id, customer_user_id, org_id) on delete cascade,
  check ((verified_area_m2 is null) = (verified_at is null))
);
comment on table public.application_garden is
  'A garden in an application, waiting for the paid order that turns it into a parcel.';
create index application_garden_application_idx on public.application_garden (application_id, sort_order);
create index application_garden_customer_idx on public.application_garden (customer_user_id);
create index application_garden_parcel_idx on public.application_garden (parcel_id);
create index application_garden_position_gist on public.application_garden using gist (position);

create table public.quote (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  application_id uuid,
  renewal_of_order_id uuid,
  number text not null unique check (number ~ '^T-[0-9]{4}-[0-9]{6}$'),
  status public.quote_status not null default 'issued',
  price_list_id uuid not null,
  price_list_version integer not null,
  package_id uuid not null,
  package_code text not null,
  package_name text not null,
  periodic_visits_per_year smallint not null check (periodic_visits_per_year between 1 and 12),
  includes_inventory boolean not null,
  first_year boolean not null,
  vat_rate_bp integer not null check (vat_rate_bp between 0 and 10000),
  discount_bp integer not null default 0 check (discount_bp between 0 and 10000),
  discount_note text check (length(discount_note) <= 500),
  base_kurus bigint not null check (base_kurus >= 0),
  discount_kurus bigint not null check (discount_kurus >= 0),
  subtotal_kurus bigint not null check (subtotal_kurus >= 0),
  vat_kurus bigint not null check (vat_kurus >= 0),
  total_kurus bigint not null check (total_kurus >= 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  -- Frozen inputs (price list, package, areas and their source, formula).
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  proposed_service_start date,
  valid_until date not null,
  note_to_customer text check (length(note_to_customer) <= 2000),
  issued_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_user_id, org_id),
  foreign key (application_id, customer_user_id, org_id)
    references public.service_application (id, customer_user_id, org_id),
  foreign key (price_list_id, org_id) references public.price_list (id, org_id),
  foreign key (package_id, org_id) references public.service_package (id, org_id),
  check (subtotal_kurus = base_kurus - discount_kurus and total_kurus = subtotal_kurus + vat_kurus),
  check (discount_bp = 0 or discount_note is not null),
  check ((status = 'issued') = (decided_at is null))
);
comment on table public.quote is 'Quote with frozen inputs and amounts; lines and amounts never change (quote_guard).';
create unique index quote_open_application_uq on public.quote (application_id) where status = 'issued';
create unique index quote_open_renewal_uq on public.quote (renewal_of_order_id) where status = 'issued';
create index quote_customer_idx on public.quote (customer_user_id);
create index quote_org_status_idx on public.quote (org_id, status, valid_until);
create index quote_price_list_idx on public.quote (price_list_id);
create index quote_package_idx on public.quote (package_id);

create table public.quote_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  quote_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  line_no smallint not null check (line_no > 0),
  -- Exactly one: a garden of the application, or an existing parcel (renewal).
  application_garden_id uuid references public.application_garden (id),
  parcel_id uuid references public.parcel (id),
  garden_name text not null,
  area_m2 numeric(12, 2) not null check (area_m2 > 0),
  billable_area_tenths integer not null check (billable_area_tenths > 0),
  visits smallint not null check (visits > 0),
  unit_price_kurus bigint not null check (unit_price_kurus >= 0),
  minimum_fee_kurus bigint not null check (minimum_fee_kurus >= 0),
  inventory_fee_kurus bigint not null check (inventory_fee_kurus >= 0),
  visit_amount_kurus bigint not null check (visit_amount_kurus >= 0),
  line_base_kurus bigint not null check (line_base_kurus >= 0),
  line_discount_kurus bigint not null check (line_discount_kurus >= 0),
  line_subtotal_kurus bigint not null check (line_subtotal_kurus >= 0),
  line_vat_kurus bigint not null check (line_vat_kurus >= 0),
  line_total_kurus bigint not null check (line_total_kurus >= 0),
  created_at timestamptz not null default now(),
  unique (quote_id, line_no),
  foreign key (quote_id, customer_user_id, org_id)
    references public.quote (id, customer_user_id, org_id) on delete cascade,
  check (num_nonnulls(application_garden_id, parcel_id) = 1),
  check (line_subtotal_kurus = line_base_kurus - line_discount_kurus
         and line_total_kurus = line_subtotal_kurus + line_vat_kurus)
);
comment on table public.quote_item is 'Quote line per garden or parcel. Insert-only.';
create index quote_item_garden_idx on public.quote_item (application_garden_id);
create index quote_item_parcel_idx on public.quote_item (parcel_id);
create index quote_item_customer_idx on public.quote_item (customer_user_id);

create table public.service_order (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  quote_id uuid not null unique,
  number text not null unique check (number ~ '^S-[0-9]{4}-[0-9]{6}$'),
  status public.order_status not null default 'awaiting_payment',
  total_kurus bigint not null check (total_kurus >= 0),
  paid_kurus bigint not null default 0 check (paid_kurus >= 0),
  refunded_kurus bigint not null default 0 check (refunded_kurus >= 0 and refunded_kurus <= paid_kurus),
  currency text not null default 'TRY' check (currency = 'TRY'),
  payment_due_at timestamptz,
  reminder_sent_at timestamptz,
  service_start date,
  service_end date,
  activated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason ~ '^[a-z][a-z0-9_]*$'),
  terminated_at timestamptz,
  termination_note text check (length(termination_note) <= 2000),
  renewal_of_order_id uuid references public.service_order (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_user_id, org_id),
  foreign key (quote_id, customer_user_id, org_id) references public.quote (id, customer_user_id, org_id),
  check (service_end is null or service_start is null or service_end >= service_start)
);
comment on table public.service_order is 'Order from an accepted quote; active once paid in full (private.activate_order, IP12-A2).';
create index service_order_customer_idx on public.service_order (customer_user_id);
create index service_order_org_status_idx on public.service_order (org_id, status);
create index service_order_renewal_idx on public.service_order (renewal_of_order_id);

alter table public.quote
  add foreign key (renewal_of_order_id) references public.service_order (id);

create table public.service_order_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  order_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  quote_item_id uuid not null unique references public.quote_item (id),
  line_no smallint not null check (line_no > 0),
  garden_name text not null,
  amount_kurus bigint not null check (amount_kurus >= 0),
  -- Set once, when the order is activated (service_order_item_guard).
  parcel_id uuid references public.parcel (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, line_no),
  foreign key (order_id, customer_user_id, org_id)
    references public.service_order (id, customer_user_id, org_id) on delete cascade
);
create index service_order_item_customer_idx on public.service_order_item (customer_user_id);
create index service_order_item_parcel_idx on public.service_order_item (parcel_id);

create table public.payment (
  -- Also iyzico's conversationId.
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  order_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  provider public.payment_provider not null,
  status public.payment_status not null default 'initiated',
  -- Requested amount (basket price).
  amount_kurus bigint not null check (amount_kurus > 0),
  -- Price reported by the provider (differs on a mismatch).
  provider_amount_kurus bigint check (provider_amount_kurus >= 0),
  -- paidPrice (with an instalment surcharge).
  paid_kurus bigint check (paid_kurus > 0),
  refunded_kurus bigint not null default 0 check (refunded_kurus >= 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  installment smallint not null default 1 check (installment between 1 and 12),
  provider_token text unique,
  token_expires_at timestamptz,
  provider_payment_id text,
  card_association text,
  card_family text,
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  fraud_status smallint check (fraud_status in (-1, 0, 1)),
  failure_code text check (failure_code ~ '^[a-z][a-z0-9_]*(:[a-z0-9_.-]{1,40})?$'),
  return_origin text,
  receipt_number text unique check (receipt_number ~ '^M-[0-9]{4}-[0-9]{6}$'),
  bank_reference text check (length(btrim(bank_reference)) between 1 and 100),
  value_date date,
  recorded_by uuid references auth.users (id),
  manual_note text check (length(manual_note) <= 2000),
  initiated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  failed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  unique (id, customer_user_id, org_id),
  unique (id, order_id),
  foreign key (order_id, customer_user_id, org_id)
    references public.service_order (id, customer_user_id, org_id),
  check (status <> 'succeeded' or (receipt_number is not null and succeeded_at is not null)),
  check (receipt_number is null or status in ('succeeded', 'voided')),
  check (provider <> 'manual' or (bank_reference is not null and value_date is not null and recorded_by is not null))
);
comment on table public.payment is
  'A payment attempt (card through the provider) or a bank transfer recorded by ops. Receipt number when succeeded.';
create index payment_order_idx on public.payment (order_id);
create index payment_customer_idx on public.payment (customer_user_id);
create index payment_org_status_idx on public.payment (org_id, status, initiated_at);
create index payment_recorded_by_idx on public.payment (recorded_by);

create table public.payment_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  payment_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  line_no smallint not null check (line_no > 0),
  -- Null: the line for a remaining balance (partial transfer before).
  order_item_id uuid references public.service_order_item (id),
  name text not null,
  amount_kurus bigint not null check (amount_kurus > 0),
  provider_item_id text,
  refunded_kurus bigint not null default 0 check (refunded_kurus >= 0 and refunded_kurus <= amount_kurus),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, line_no),
  unique (id, payment_id),
  foreign key (payment_id, customer_user_id, org_id)
    references public.payment (id, customer_user_id, org_id) on delete cascade
);
create index payment_item_order_item_idx on public.payment_item (order_item_id);
create index payment_item_customer_idx on public.payment_item (customer_user_id);

create table public.refund (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  payment_id uuid not null,
  order_id uuid not null,
  customer_user_id uuid not null references auth.users (id) on delete restrict,
  payment_item_id uuid,
  number text not null unique check (number ~ '^I-[0-9]{4}-[0-9]{6}$'),
  kind public.refund_kind not null,
  status public.refund_status not null default 'requested',
  amount_kurus bigint not null check (amount_kurus > 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  reason public.refund_reason not null,
  note text check (length(note) <= 2000),
  -- Null: opened by the system (payment_finalize).
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  processing_since timestamptz,
  processed_at timestamptz,
  provider_ref text,
  failure_code text check (failure_code ~ '^[a-z][a-z0-9_]*(:[a-z0-9_.-]{1,40})?$'),
  retryable boolean,
  bank_reference text check (length(btrim(bank_reference)) between 1 and 100),
  completed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (payment_id, customer_user_id, org_id) references public.payment (id, customer_user_id, org_id),
  foreign key (payment_id, order_id) references public.payment (id, order_id),
  foreign key (order_id, customer_user_id, org_id) references public.service_order (id, customer_user_id, org_id),
  foreign key (payment_item_id, payment_id) references public.payment_item (id, payment_id)
);
comment on table public.refund is 'Refund of a payment: void, item refund (card) or manual (transfer).';
create index refund_payment_idx on public.refund (payment_id);
create index refund_order_idx on public.refund (order_id);
create index refund_customer_idx on public.refund (customer_user_id);
create index refund_org_status_idx on public.refund (org_id, status);
create index refund_payment_item_idx on public.refund (payment_item_id);

create table public.audit_event (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('ops', 'customer', 'system', 'provider')),
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (entity_type in (
    'signup', 'consent', 'billing_profile', 'owner_profile', 'application', 'application_garden',
    'quote', 'order', 'payment', 'refund', 'price_list', 'package', 'billing_setting'
  )),
  entity_id uuid,
  -- Field names, codes and amounts; never personal data.
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  created_at timestamptz not null default now()
);
comment on table public.audit_event is 'Audit log of billing actions with an explicit actor and role. Insert-only, no personal data.';
create index audit_event_org_time_idx on public.audit_event (org_id, created_at desc);
create index audit_event_entity_idx on public.audit_event (entity_type, entity_id);
create index audit_event_actor_idx on public.audit_event (actor_user_id);

-- ---------------------------------------------------------------------------
-- 3. private tables
-- ---------------------------------------------------------------------------

create table private.billing_profile (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.billing_party_kind not null,
  first_name text not null check (length(btrim(first_name)) between 1 and 60),
  last_name text not null check (length(btrim(last_name)) between 1 and 60),
  -- Only while org_billing_setting.identity_number_required.
  identity_number text check (identity_number is null or private.is_valid_tckn(identity_number)),
  company_title text check (length(btrim(company_title)) between 1 and 200),
  tax_office text check (length(btrim(tax_office)) between 1 and 100),
  tax_number text check (tax_number ~ '^[0-9]{10}$'),
  address text not null check (length(btrim(address)) between 1 and 500),
  district text check (length(btrim(district)) between 1 and 100),
  city text not null check (length(btrim(city)) between 1 and 100),
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  country text not null default 'Türkiye' check (length(btrim(country)) between 1 and 100),
  email text check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id),
  check ((kind = 'company') = (company_title is not null and tax_office is not null and tax_number is not null))
);
comment on table private.billing_profile is 'Buyer on receipts and at the payment provider. Personal data.';
create index billing_profile_user_idx on private.billing_profile (user_id);

create table private.payment_billing_snapshot (
  payment_id uuid primary key references public.payment (id) on delete cascade,
  org_id uuid not null references public.org (id) on delete cascade,
  kind public.billing_party_kind not null,
  first_name text not null,
  last_name text not null,
  identity_number_last4 text check (identity_number_last4 ~ '^[0-9]{4}$'),
  company_title text,
  tax_office text,
  tax_number text,
  address text not null,
  district text,
  city text not null,
  postal_code text,
  country text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
comment on table private.payment_billing_snapshot is
  'Buyer as on the receipt of a payment (TCKN masked). Insert-only. Personal data.';

create table private.consent_record (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  -- The user id, kept when the account is deleted (no foreign key).
  subject_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  kind public.consent_kind not null,
  granted boolean not null,
  text_version text not null check (text_version ~ '^[a-z0-9][a-z0-9.-]{1,40}$'),
  source public.consent_source not null,
  quote_id uuid references public.quote (id),
  order_id uuid references public.service_order (id),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now()
);
comment on table private.consent_record is
  'KVKK notice acknowledgements and explicit consents, with text version. Insert-only evidence; the latest row per kind counts.';
create index consent_record_subject_idx on private.consent_record (org_id, subject_id, kind, recorded_at desc);
create index consent_record_user_idx on private.consent_record (user_id);
create index consent_record_quote_idx on private.consent_record (quote_id);
create index consent_record_order_idx on private.consent_record (order_id);

create table private.customer_signup (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.org (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  email text not null check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  phone text not null check (phone ~ '^\+905[0-9]{9}$'),
  contact_preference private.contact_preference not null,
  -- {kvkk_notice_version, explicit_text_version, explicit_service_improvement, explicit_marketing}
  consents jsonb not null check (jsonb_typeof(consents) = 'object'),
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
comment on table private.customer_signup is
  'Self sign-up waiting for the phone code; completed into an owner profile. Personal data.';
create index customer_signup_org_idx on private.customer_signup (org_id);

create table private.signup_attempt (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
comment on table private.signup_attempt is 'Sign-up attempts (HMAC of IP and phone) for the rate limits. Kept two days.';
create index signup_attempt_ip_idx on private.signup_attempt (ip_hash, created_at desc);
create index signup_attempt_phone_idx on private.signup_attempt (phone_hash, created_at desc);
create index signup_attempt_time_idx on private.signup_attempt (created_at);

create table private.application_garden_detail (
  application_garden_id uuid primary key,
  org_id uuid not null,
  authorization_basis private.authorization_basis,
  deed_block text check (length(deed_block) <= 50),
  deed_parcel text check (length(deed_parcel) <= 50),
  is_shared_deed boolean,
  used_portion_note text check (length(used_portion_note) <= 1000),
  entry_permission_at timestamptz not null,
  access_note text check (length(access_note) <= 1000),
  site_contact_name text check (length(site_contact_name) <= 120),
  site_contact_phone text check (site_contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_garden_id, org_id) references public.application_garden (id, org_id) on delete cascade
);
comment on table private.application_garden_detail is
  'Deed reference, authorization, access note and site contact of an application garden. Personal and third-party data.';

create table private.payment_event (
  id uuid primary key default gen_random_uuid(),
  -- Null when the event names no payment of ours.
  org_id uuid references public.org (id) on delete cascade,
  provider public.payment_provider not null,
  event_type text not null check (event_type in (
    'initialize', 'callback', 'webhook', 'retrieve', 'reconcile', 'cancel', 'refund', 'detail'
  )),
  dedup_key text not null check (length(dedup_key) between 1 and 200),
  payment_id uuid references public.payment (id),
  refund_id uuid references public.refund (id),
  signature_valid boolean,
  http_status integer,
  outcome text check (length(outcome) <= 100),
  -- Allow-listed fields only (B: safePayload); never buyer data or card tokens.
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  unique (provider, dedup_key)
);
comment on table private.payment_event is
  'Provider calls and notifications with an allow-listed payload. Insert-only; requests with a bad signature are never written.';
create index payment_event_payment_idx on private.payment_event (payment_id, received_at);
create index payment_event_refund_idx on private.payment_event (refund_id);
create index payment_event_time_idx on private.payment_event (received_at);

create table private.document_sequence (
  org_id uuid not null references public.org (id) on delete cascade,
  kind text not null check (kind in ('B', 'T', 'S', 'M', 'I')),
  year integer not null check (year between 2000 and 9999),
  last_value integer not null default 0 check (last_value between 0 and 999999),
  primary key (org_id, kind, year)
);
comment on table private.document_sequence is 'Counters of document numbers per org, kind and year (B, T, S, M, I).';

-- ---------------------------------------------------------------------------
-- Helpers that use the tables
-- ---------------------------------------------------------------------------

-- Audit row with an explicit actor and role: the role is never guessed.
create function private.audit(
  p_org_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_event (org_id, actor_user_id, actor_role, action, entity_type, entity_id, details)
  values (p_org_id, p_actor_user_id, p_actor_role, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'))
  returning id;
$$;
comment on function private.audit(uuid, uuid, text, text, text, uuid, jsonb) is
  'Writes an audit_event row; callers pass the actor and role explicitly and no personal data.';

-- <kind>-<YYYY>-<NNNNNN>; the year in Istanbul time. The upsert locks the
-- counter row until the calling transaction ends.
create function private.next_document_number(p_org_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Istanbul'))::integer;
  v_value integer;
begin
  if p_kind is null or p_kind not in ('B', 'T', 'S', 'M', 'I') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'kind';
  end if;
  insert into private.document_sequence as s (org_id, kind, year, last_value)
  values (p_org_id, p_kind, v_year, 1)
  on conflict (org_id, kind, year) do update set last_value = s.last_value + 1
  returning s.last_value into v_value;
  return p_kind || '-' || v_year || '-' || lpad(v_value::text, 6, '0');
end;
$$;
comment on function private.next_document_number(uuid, text) is
  'Next document number of the org: B (application), T (quote), S (order), M (receipt), I (refund).';

-- The org that takes self sign-ups (at most one), or null.
create function private.signup_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.org_id from public.org_billing_setting s where s.accepts_signups;
$$;
comment on function private.signup_org_id() is 'The org with accepts_signups, or null when sign-ups are closed.';

revoke all on function private.touch_updated_at() from public;
revoke all on function private.insert_only_unlink_user() from public;
revoke all on function private.is_valid_tckn(text) from public;
revoke all on function private.audit(uuid, uuid, text, text, text, uuid, jsonb) from public;
revoke all on function private.next_document_number(uuid, text) from public;
revoke all on function private.signup_org_id() from public;
grant execute on function private.is_valid_tckn(text) to service_role;
grant execute on function private.audit(uuid, uuid, text, text, text, uuid, jsonb) to service_role;
grant execute on function private.next_document_number(uuid, text) to service_role;
grant execute on function private.signup_org_id() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- A published price list never changes and is never deleted.
create function private.price_list_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'price_list_not_draft' using errcode = 'P0001',
      hint = 'A published price list is final; create a new draft.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Items are written only while their list is a draft. A list deleted with its
-- items (cascade) is no longer found: allowed.
create function private.price_list_item_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.price_list l
    where l.status = 'published'
      and (l.id = case when tg_op = 'DELETE' then old.price_list_id else new.price_list_id end
           or (tg_op = 'UPDATE' and l.id = old.price_list_id))
  ) then
    raise exception 'price_list_not_draft' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Lines and amounts never change; only an issued quote moves (once) to a final
-- status with its decision time and decider.
create function private.quote_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE on public.quote is not allowed' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - array['status', 'decided_at', 'decided_by', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'decided_at', 'decided_by', 'updated_at']) then
    raise exception 'quote_frozen' using errcode = 'P0001', hint = 'Issue a new quote instead.';
  end if;
  if old.status <> 'issued'
     and (new.status, new.decided_at, new.decided_by) is distinct from (old.status, old.decided_at, old.decided_by) then
    raise exception 'quote_not_open' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- An order line gets its parcel once, on activation; nothing else changes.
create function private.service_order_item_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or old.parcel_id is not null
     or (to_jsonb(new) - array['parcel_id', 'updated_at']) is distinct from (to_jsonb(old) - array['parcel_id', 'updated_at']) then
    raise exception '% on public.service_order_item is not allowed', tg_op using errcode = 'P0001',
      hint = 'Only parcel_id is set, once.';
  end if;
  return new;
end;
$$;

-- Events of no payment are dropped after seven days (IP12-A2 housekeeping);
-- every other change is refused.
create function private.payment_event_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.payment_id is null and old.received_at < now() - interval '7 days' then
    return old;
  end if;
  raise exception '% on private.payment_event is not allowed: table is insert-only', tg_op
    using errcode = 'P0001';
end;
$$;

create trigger price_list_guard before update or delete on public.price_list
for each row execute function private.price_list_guard();
create trigger price_list_item_guard before insert or update or delete on public.price_list_item
for each row execute function private.price_list_item_guard();
create trigger quote_guard before update or delete on public.quote
for each row execute function private.quote_guard();
create trigger service_order_item_guard before update or delete on public.service_order_item
for each row execute function private.service_order_item_guard();

create trigger quote_item_insert_only before update or delete on public.quote_item
for each row execute function private.forbid_mutation();
create trigger quote_item_no_truncate before truncate on public.quote_item
for each statement execute function private.forbid_mutation();
create trigger audit_event_insert_only before update or delete on public.audit_event
for each row execute function private.insert_only_unlink_user('actor_user_id');
create trigger audit_event_no_truncate before truncate on public.audit_event
for each statement execute function private.forbid_mutation();
create trigger consent_record_insert_only before update or delete on private.consent_record
for each row execute function private.insert_only_unlink_user('user_id');
create trigger consent_record_no_truncate before truncate on private.consent_record
for each statement execute function private.forbid_mutation();
create trigger payment_event_insert_only before update or delete on private.payment_event
for each row execute function private.payment_event_guard();
create trigger payment_event_no_truncate before truncate on private.payment_event
for each statement execute function private.forbid_mutation();
create trigger payment_billing_snapshot_insert_only before update or delete on private.payment_billing_snapshot
for each row execute function private.forbid_mutation();
create trigger payment_billing_snapshot_no_truncate before truncate on private.payment_billing_snapshot
for each statement execute function private.forbid_mutation();

do $$
declare
  t text;
begin
  foreach t in array array[
    'public.org_billing_setting', 'public.service_package', 'public.price_list', 'public.price_list_item',
    'public.service_application', 'public.application_garden', 'public.quote', 'public.service_order',
    'public.service_order_item', 'public.payment', 'public.payment_item', 'public.refund',
    'private.billing_profile', 'private.application_garden_detail'
  ] loop
    execute format(
      'create trigger %s_touch_updated_at before update on %s for each row execute function private.touch_updated_at()',
      split_part(t, '.', 2), t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting enable row level security;
alter table public.service_package enable row level security;
alter table public.price_list enable row level security;
alter table public.price_list_item enable row level security;
alter table public.service_application enable row level security;
alter table public.application_garden enable row level security;
alter table public.quote enable row level security;
alter table public.quote_item enable row level security;
alter table public.service_order enable row level security;
alter table public.service_order_item enable row level security;
alter table public.payment enable row level security;
alter table public.payment_item enable row level security;
alter table public.refund enable row level security;
alter table public.audit_event enable row level security;

alter table private.billing_profile enable row level security;
alter table private.payment_billing_snapshot enable row level security;
alter table private.consent_record enable row level security;
alter table private.customer_signup enable row level security;
alter table private.signup_attempt enable row level security;
alter table private.application_garden_detail enable row level security;
alter table private.payment_event enable row level security;
alter table private.document_sequence enable row level security;

revoke all on
  public.org_billing_setting, public.service_package, public.price_list, public.price_list_item,
  public.service_application, public.application_garden, public.quote, public.quote_item,
  public.service_order, public.service_order_item, public.payment, public.payment_item,
  public.refund, public.audit_event
  from public, anon, authenticated;
revoke all on
  private.billing_profile, private.payment_billing_snapshot, private.consent_record,
  private.customer_signup, private.signup_attempt, private.application_garden_detail,
  private.payment_event, private.document_sequence
  from public, anon, authenticated;

-- Writes go through security definer functions; the service role (Edge
-- Functions, tests) keeps the usual table privileges.
grant select, insert, update, delete on
  public.org_billing_setting, public.service_package, public.price_list, public.price_list_item,
  public.service_application, public.application_garden, public.quote, public.quote_item,
  public.service_order, public.service_order_item, public.payment, public.payment_item,
  public.refund, public.audit_event
  to service_role;
grant select, insert, update, delete on
  private.billing_profile, private.payment_billing_snapshot, private.consent_record,
  private.customer_signup, private.signup_attempt, private.application_garden_detail,
  private.payment_event, private.document_sequence
  to service_role;

-- Ops only.
create policy org_billing_setting_select on public.org_billing_setting for select to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));
create policy service_package_select on public.service_package for select to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));
create policy price_list_select on public.price_list for select to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));
create policy price_list_item_select on public.price_list_item for select to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));
create policy audit_event_select on public.audit_event for select to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));
grant select on public.org_billing_setting, public.service_package, public.price_list,
  public.price_list_item, public.audit_event to authenticated;

-- Customer tables: the customer's own rows, and ops of the org.
do $$
declare
  t text;
begin
  foreach t in array array[
    'service_application', 'application_garden', 'quote', 'quote_item', 'service_order',
    'service_order_item', 'payment', 'payment_item', 'refund'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using ('
      'customer_user_id = (select auth.uid()) or org_id in (select authz.user_org_ids(''{ops}'')))', t);
  end loop;
end;
$$;

-- A row policy does not hide columns: the internal ones are left out of the
-- grants (ops reads them through ops_billing_internal, IP12-A2). The lists
-- equal BILLING_COLUMNS in apps/web/src/lib/billing/columns.ts.
grant select (
  id, org_id, customer_user_id, number, status, package_id, customer_note, rejection_reason,
  submitted_at, decided_at, created_at, updated_at
) on public.service_application to authenticated;
grant select (
  id, org_id, application_id, customer_user_id, sort_order, name, province, district, village,
  declared_area_m2, irrigation, estimated_tree_count, position, position_uncertainty_m, boundary,
  verified_area_m2, verified_at, parcel_id, created_at, updated_at
) on public.application_garden to authenticated;
grant select (
  id, org_id, customer_user_id, application_id, renewal_of_order_id, number, status, price_list_id,
  price_list_version, package_id, package_code, package_name, periodic_visits_per_year,
  includes_inventory, first_year, vat_rate_bp, discount_bp, discount_note, base_kurus, discount_kurus,
  subtotal_kurus, vat_kurus, total_kurus, currency, inputs, proposed_service_start, valid_until,
  note_to_customer, issued_at, decided_at, created_at, updated_at
) on public.quote to authenticated;
grant select on public.quote_item to authenticated;
grant select (
  id, org_id, customer_user_id, quote_id, number, status, total_kurus, paid_kurus, refunded_kurus,
  currency, payment_due_at, reminder_sent_at, service_start, service_end, activated_at, completed_at,
  cancelled_at, cancel_reason, terminated_at, renewal_of_order_id, created_at, updated_at
) on public.service_order to authenticated;
grant select on public.service_order_item to authenticated;
grant select (
  id, org_id, order_id, customer_user_id, provider, status, amount_kurus, provider_amount_kurus,
  paid_kurus, refunded_kurus, currency, installment, token_expires_at, provider_payment_id,
  card_association, card_family, card_last4, fraud_status, failure_code, receipt_number,
  bank_reference, value_date, initiated_at, succeeded_at, failed_at, voided_at, created_at, updated_at
) on public.payment to authenticated;
grant select on public.payment_item to authenticated;
grant select (
  id, org_id, payment_id, order_id, customer_user_id, payment_item_id, number, kind, status,
  amount_kurus, currency, reason, requested_at, attempts, processing_since, processed_at, provider_ref,
  failure_code, retryable, bank_reference, completed_on, created_at, updated_at
) on public.refund to authenticated;
