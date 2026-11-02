-- IP15 / 2: service layer, first service: weed mowing (docs/MVP.md, Module 6;
-- docs/veri-modeli.md, "Hizmet katmanı").
--
-- 1. Switch org_billing_setting.services_enabled (SQL only; off on hosted
--    projects, on in seed.sql) and the audit entity types of this package.
-- 2. weed_height: parcel-level field question (short / medium / tall), asked
--    once per visit in spring and summer.
-- 3. public.service_type: generic, org-scoped service catalogue. A new
--    service (tillage, pruning) is a new row, not a schema change. A default
--    season window per service (it may wrap the year end), overridden per
--    fruit species by public.service_type_season (seeded 1 March - 30 June
--    for every species, editable by ops); the weed threshold and observation
--    age that trigger a recommendation. The migration seeds weed_mowing for
--    existing orgs without a price.
--    Prices live in the versioned billing price list: public.
--    price_list_service_item (per dönüm, VAT excluded, minimum fee) is a child
--    of public.price_list next to price_list_item, written only while its list
--    is a draft. The published list in force prices the service; without a
--    price there the portal shows no amount ("Fiyat teklifle bildirilir"),
--    requests still work and ops enters the amount when scheduling.
-- 4. public.service_request (+ service_request_event, append-only history):
--    pre_request -> requested -> scheduled -> done, or cancelled. The quote
--    is frozen at the request with the price list version it came from
--    (pricing rule service-v1, the rounding of pricing-v1: tenths of a
--    dönüm); ops confirms the amount and the date.
--    Scheduling opens a public.session of kind 'mowing' (never published,
--    so it never shows as an audit visit); completing it writes a
--    public.operation row (performer crew). Payment is recorded by hand
--    after the job. No online payment.
-- 5. public.service_request_photo: before / after proof. A photo is a
--    public.asset (kind photo, content-hash addressed, insert-only) on the
--    job's session, or a photo / tree crop of a published visit of the same
--    parcel. Owners read the linked assets of their own done requests
--    (asset_service_proof_select), and through them the storage objects.
-- 6. public.parcel_robot_note: robot suitability notes per parcel (slope,
--    stoniness, lowest branch); org members read, field staff and ops write.
-- 7. Notifications: service_scheduled, _completed, _cancelled on status
--    changes of a request (service messages, kararlar.md H06). No message
--    recommends the service: that would be a commercial message needing İYS
--    consent (H06); the recommendation is shown in the portal only. Demo orgs
--    and accounts get none.
-- 8. Functions: service_offers (portal cards), customer_request_service,
--    customer_cancel_service_request, ops_service_requests (queue),
--    ops_schedule / ops_complete / ops_cancel_service_request,
--    ops_add_service_photo, ops_link_service_photo, ops_unlink_service_photo,
--    ops_record_service_payment, ops_update_service_type,
--    ops_save_service_season, ops_save_price_list_service_items,
--    ops_service_demand (pre-requests per service and season);
--    ops_create_price_list_draft copies the service prices too.
--
-- Legal rules (docs/hukuk/kararlar.md H37): the request is an offer; the
-- contract is made when ops confirms the amount and the day (scheduled).
-- Ops may confirm the frozen estimate or less, never more (a higher price
-- needs a new request). Without the owner's early-performance request the
-- day is at the earliest 15 days after the request (14-day withdrawal
-- period). The accepted terms version must be the current service_terms.
--
-- Error codes: not_found (P0002), forbidden and demo_read_only (42501),
-- invalid_input (22023, detail names the field), services_disabled,
-- service_inactive, area_unknown, request_open, invalid_status,
-- too_late_to_cancel, proof_missing, payment_recorded, quote_above_estimate,
-- withdrawal_period (P0001). Without a frozen estimate ops must give the
-- amount (invalid_input, detail quote_total).

-- ---------------------------------------------------------------------------
-- 1. Switch and audit entity types
-- ---------------------------------------------------------------------------

alter table public.org_billing_setting
  add column services_enabled boolean not null default false;
comment on column public.org_billing_setting.services_enabled is
  'SQL only. IP15: the service layer (weed mowing) in the portal and back office. Off on hosted projects until the legal drafts are reviewed and the price comes from the field.';

-- As in 20261105100100_visit_records.sql, plus services_enabled.
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
    r.services_enabled := false;
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
    'session', 'missed_visit', 'visit_reconciliation', 'parcel',
    -- IP15.
    'service_type', 'service_request'
  ));

-- ---------------------------------------------------------------------------
-- 2. weed_height
-- ---------------------------------------------------------------------------

-- Same id rule as 20261021180000_metric_registry.sql. Asked once per visit
-- about the whole parcel (field app spring-v0.2, summer-v0.3), stored without
-- a tree. Shown on the care row of the card.
insert into public.metric_definition (
  id, code, name, description, unit, value_type, scale_min, scale_max, categories,
  valid_seasons, card_visibility, subject_kinds
) values (
  md5('orchados-seed:metric:weed_height')::uuid, 'weed_height', 'Yabani ot boyu',
  'Field question, once per visit: weed height in the parcel. short = up to the ankle, medium = up to the knee, tall = above the knee.',
  null, 'category', null, null, '{short,medium,tall}', '{spring,summer}', 'shown', '{parcel}'
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Service catalogue
-- ---------------------------------------------------------------------------

create type public.service_request_status as enum ('pre_request', 'requested', 'scheduled', 'done', 'cancelled');
create type public.service_window as enum ('asap', 'within_2_weeks', 'within_month', 'flexible');

-- Month and day of a season boundary are valid in every year (no 29 Feb).
create function private.valid_month_day(p_month smallint, p_day smallint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_month between 1 and 12 and p_day >= 1 and p_day <= case
    when p_month = 2 then 28
    when p_month in (4, 6, 9, 11) then 30
    else 31
  end;
$$;

create table public.service_type (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text check (length(description) <= 2000),
  -- What the job writes into public.operation when it is done.
  operation_kind public.operation_kind not null,
  -- Default season window; public.service_type_season overrides it per
  -- fruit species.
  season_start_month smallint not null,
  season_start_day smallint not null,
  season_end_month smallint not null,
  season_end_day smallint not null,
  -- Recommendation: the latest published weed_height at or above this level,
  -- not older than observation_max_age_days, in season. Null: never
  -- recommended from an observation (only offered).
  recommend_from_weed_height text check (recommend_from_weed_height in ('medium', 'tall')),
  observation_max_age_days integer not null default 60 check (observation_max_age_days between 1 and 365),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  unique (id, org_id),
  check (private.valid_month_day(season_start_month, season_start_day)),
  check (private.valid_month_day(season_end_month, season_end_day)),
  check ((season_start_month, season_start_day) <> (season_end_month, season_end_day))
);
comment on table public.service_type is
  'Service catalogue of an org (IP15): one row per service type (weed mowing first). Default season window, recommendation rule. Prices: price_list_service_item.';
alter table public.service_type enable row level security;
select private.attach_demo_guard('public.service_type');
create trigger service_type_touch before update on public.service_type
for each row execute function private.touch_updated_at();

-- Season window of a service per fruit species (the recommendation and the
-- pre-request use the parcel's species).
create table public.service_type_season (
  org_id uuid not null,
  service_type_id uuid not null,
  species text not null references public.fruit_species (code),
  season_start_month smallint not null,
  season_start_day smallint not null,
  season_end_month smallint not null,
  season_end_day smallint not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (service_type_id, species),
  foreign key (service_type_id, org_id) references public.service_type (id, org_id) on delete cascade,
  check (private.valid_month_day(season_start_month, season_start_day)),
  check (private.valid_month_day(season_end_month, season_end_day)),
  check ((season_start_month, season_start_day) <> (season_end_month, season_end_day))
);
comment on table public.service_type_season is
  'Season window of a service per fruit species (IP15); none: the service_type default. Writes through ops_save_service_season.';
create index service_type_season_org_idx on public.service_type_season (org_id);
create index service_type_season_species_idx on public.service_type_season (species);
alter table public.service_type_season enable row level security;
select private.attach_demo_guard('public.service_type_season');
create trigger service_type_season_touch before update on public.service_type_season
for each row execute function private.touch_updated_at();

-- Service prices of a price list version (per dönüm, VAT excluded, as
-- price_list_item; VAT is the list's). Optional: a published list without a
-- row for a service leaves the service unpriced.
create table public.price_list_service_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  price_list_id uuid not null,
  service_type_id uuid not null,
  unit_price_kurus bigint not null check (unit_price_kurus > 0),
  minimum_fee_kurus bigint not null default 0 check (minimum_fee_kurus >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (price_list_id, service_type_id),
  foreign key (price_list_id, org_id) references public.price_list (id, org_id) on delete cascade,
  foreign key (service_type_id, org_id) references public.service_type (id, org_id)
);
comment on table public.price_list_service_item is
  'Service price (per dönüm, VAT excluded, minimum fee) in a price list version (IP15). Written only while the list is a draft.';
create index price_list_service_item_service_idx on public.price_list_service_item (service_type_id);
create index price_list_service_item_org_idx on public.price_list_service_item (org_id);
alter table public.price_list_service_item enable row level security;
select private.attach_demo_guard('public.price_list_service_item');
create trigger price_list_service_item_guard before insert or update or delete on public.price_list_service_item
for each row execute function private.price_list_item_guard();
create trigger price_list_service_item_touch before update on public.price_list_service_item
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Requests and their history
-- ---------------------------------------------------------------------------

create table public.service_request (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  service_type_id uuid not null,
  -- H-<YYYY>-<NNNNNN>, per org and year.
  number text not null,
  status public.service_request_status not null,
  requested_by uuid references auth.users (id) on delete set null,
  -- The season the request is for: the year its season window starts.
  season_year integer not null check (season_year between 2000 and 9999),
  preferred_window public.service_window not null default 'flexible',
  customer_note text check (length(customer_note) <= 1000),
  -- The service terms the owner accepted (legal.ts version string, checked
  -- against the current service_terms registry row).
  terms_version text not null check (length(terms_version) between 1 and 60),
  -- kararlar.md H37: the owner asked for the job inside the 14-day withdrawal
  -- period (unticked by default). Without it the job is dated at the
  -- earliest 15 days after the request.
  early_performance_requested boolean not null default false,
  -- What the portal showed when the request was made, if anything.
  recommended_measurement_id uuid references public.measurement (id) on delete set null,
  recommended_weed_height text check (recommended_weed_height in ('short', 'medium', 'tall')),
  -- Quote frozen at the request (pricing rule service-v1) from the published
  -- price list in force that day. All null when that list has no price for
  -- the service: ops enters the amount when scheduling.
  area_m2 numeric(12, 2) not null check (area_m2 > 0),
  area_source text not null check (area_source in ('boundary', 'declared')),
  price_list_id uuid,
  price_list_version integer check (price_list_version > 0),
  price_per_donum_kurus bigint check (price_per_donum_kurus > 0),
  minimum_fee_kurus bigint check (minimum_fee_kurus >= 0),
  vat_rate_bp integer check (vat_rate_bp between 0 and 10000),
  estimate_subtotal_kurus bigint check (estimate_subtotal_kurus >= 0),
  estimate_vat_kurus bigint check (estimate_vat_kurus >= 0),
  estimate_total_kurus bigint check (estimate_total_kurus >= 0),
  pricing_rule text not null default 'service-v1',
  -- Set by ops when scheduling (VAT included).
  quote_total_kurus bigint check (quote_total_kurus >= 0),
  scheduled_date date,
  session_id uuid,
  operation_id uuid references public.operation (id) on delete set null,
  completed_on date,
  cancelled_at timestamptz,
  cancelled_by_role text check (cancelled_by_role in ('owner', 'ops')),
  cancel_reason text check (length(cancel_reason) <= 500),
  payment_received_on date,
  payment_amount_kurus bigint check (payment_amount_kurus > 0),
  payment_method text check (payment_method in ('cash', 'transfer', 'other')),
  payment_recorded_by uuid references auth.users (id) on delete set null,
  -- Internal note of ops; not granted to owners.
  ops_note text check (length(ops_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number),
  unique (id, parcel_id, org_id),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id),
  foreign key (service_type_id, org_id) references public.service_type (id, org_id),
  foreign key (session_id, parcel_id, org_id) references public.session (id, parcel_id, org_id),
  foreign key (price_list_id, org_id) references public.price_list (id, org_id),
  check (num_nulls(price_list_id, price_list_version, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp,
    estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus) in (0, 8)),
  check (estimate_total_kurus = estimate_subtotal_kurus + estimate_vat_kurus),
  check (status not in ('scheduled', 'done') or (scheduled_date is not null and quote_total_kurus is not null
    and session_id is not null)),
  check ((status = 'done') = (completed_on is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by_role is not null)),
  check ((payment_received_on is null) = (payment_amount_kurus is null)
    and (payment_received_on is null) = (payment_method is null)),
  check (payment_received_on is null or status = 'done')
);
comment on table public.service_request is
  'Owner request for one service on one parcel (IP15): pre_request, requested, scheduled, done, cancelled. Quote frozen at the request; payment recorded by hand after the job.';
-- One open request per parcel and service.
create unique index service_request_open_uq on public.service_request (parcel_id, service_type_id)
  where status in ('pre_request', 'requested', 'scheduled');
create index service_request_org_status_idx on public.service_request (org_id, status, created_at desc);
create index service_request_parcel_idx on public.service_request (parcel_id, created_at desc);
create index service_request_type_season_idx on public.service_request (service_type_id, season_year);
create index service_request_session_idx on public.service_request (session_id);
create index service_request_operation_idx on public.service_request (operation_id);
create index service_request_measurement_idx on public.service_request (recommended_measurement_id);
create index service_request_price_list_idx on public.service_request (price_list_id);
alter table public.service_request enable row level security;
select private.attach_demo_guard('public.service_request');
create trigger service_request_touch before update on public.service_request
for each row execute function private.touch_updated_at();

create table public.service_request_event (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  request_id uuid not null,
  from_status public.service_request_status,
  to_status public.service_request_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('owner', 'ops', 'system')),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key (request_id, parcel_id, org_id) references public.service_request (id, parcel_id, org_id) on delete cascade
);
comment on table public.service_request_event is 'Status history of a service request (IP15). Append-only.';
create index service_request_event_request_idx on public.service_request_event (request_id, created_at);
create index service_request_event_org_idx on public.service_request_event (org_id);
alter table public.service_request_event enable row level security;
select private.attach_demo_guard('public.service_request_event');
create trigger service_request_event_append_only before update or delete on public.service_request_event
for each row execute function private.insert_only_unlink_user('actor_user_id');

-- ---------------------------------------------------------------------------
-- 5. Proof photos
-- ---------------------------------------------------------------------------

create table public.service_request_photo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  parcel_id uuid not null,
  request_id uuid not null,
  asset_id uuid not null,
  phase text not null check (phase in ('before', 'after')),
  linked_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id, asset_id, phase),
  foreign key (request_id, parcel_id, org_id) references public.service_request (id, parcel_id, org_id) on delete cascade,
  foreign key (asset_id, parcel_id, org_id) references public.asset (id, parcel_id, org_id)
);
comment on table public.service_request_photo is
  'Before / after proof of a service job (IP15): an asset of the job''s session or of a published visit of the same parcel.';
create index service_request_photo_asset_idx on public.service_request_photo (asset_id);
create index service_request_photo_org_idx on public.service_request_photo (org_id);
alter table public.service_request_photo enable row level security;
select private.attach_demo_guard('public.service_request_photo');

-- ---------------------------------------------------------------------------
-- 6. Robot suitability notes
-- ---------------------------------------------------------------------------

create table public.parcel_robot_note (
  parcel_id uuid primary key,
  org_id uuid not null,
  slope text check (slope in ('flat', 'gentle', 'steep')),
  stoniness text check (stoniness in ('low', 'medium', 'high')),
  lowest_branch_cm smallint check (lowest_branch_cm between 0 and 500),
  note text check (length(note) <= 1000),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (parcel_id, org_id) references public.parcel (id, org_id) on delete cascade
);
comment on table public.parcel_robot_note is
  'Robot suitability of a parcel (IP15): slope, stoniness, lowest branch height; used later to pick where the robot goes first. Staff only.';
create index parcel_robot_note_org_idx on public.parcel_robot_note (org_id);
alter table public.parcel_robot_note enable row level security;
select private.attach_demo_guard('public.parcel_robot_note');

create function private.touch_robot_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger parcel_robot_note_touch before insert or update on public.parcel_robot_note
for each row execute function private.touch_robot_note();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on public.service_type, public.service_type_season, public.price_list_service_item,
  public.service_request, public.service_request_event, public.service_request_photo, public.parcel_robot_note
  from anon, authenticated;
grant all on public.service_type, public.service_type_season, public.price_list_service_item,
  public.service_request, public.service_request_event, public.service_request_photo, public.parcel_robot_note
  to service_role;

-- Catalogue: staff of the org, and parcel readers of the org (names and
-- prices are shown on the portal). Writes through ops_update_service_type.
create policy service_type_select on public.service_type for select to authenticated
  using (org_id in (select authz.user_org_ids()) or org_id in (select authz.user_parcel_org_ids()));
grant select on public.service_type to authenticated;
create policy service_type_season_select on public.service_type_season for select to authenticated
  using (org_id in (select authz.user_org_ids()) or org_id in (select authz.user_parcel_org_ids()));
grant select on public.service_type_season to authenticated;
-- Service prices: as price_list_item, ops only (the portal reads amounts
-- through service_offers).
create policy price_list_service_item_select on public.price_list_service_item for select to authenticated
  using (org_id in (select authz.user_org_ids('{ops}')));
grant select on public.price_list_service_item to authenticated;

-- Requests, history, photos: owners of the parcel and staff of the org.
-- Viewers do not see commercial rows. Writes through the functions below.
create policy service_request_select on public.service_request for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids('{owner}')));
create policy service_request_event_select on public.service_request_event for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids('{owner}')));
create policy service_request_photo_select on public.service_request_photo for select to authenticated
  using (org_id in (select authz.user_org_ids()) or parcel_id in (select authz.user_parcel_ids('{owner}')));
grant select (
  id, org_id, parcel_id, service_type_id, number, status, requested_by, season_year, preferred_window,
  customer_note, terms_version, early_performance_requested, recommended_measurement_id, recommended_weed_height, area_m2, area_source,
  price_list_id, price_list_version, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, estimate_subtotal_kurus,
  estimate_vat_kurus, estimate_total_kurus, pricing_rule, quote_total_kurus, scheduled_date, session_id,
  operation_id, completed_on, cancelled_at, cancelled_by_role, cancel_reason, payment_received_on,
  payment_amount_kurus, payment_method, created_at, updated_at
) on public.service_request to authenticated;
grant select on public.service_request_event, public.service_request_photo to authenticated;

-- Robot notes: staff read; field staff and ops write.
create policy parcel_robot_note_select on public.parcel_robot_note for select to authenticated
  using (org_id in (select authz.user_org_ids()));
create policy parcel_robot_note_insert on public.parcel_robot_note for insert to authenticated
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));
create policy parcel_robot_note_update on public.parcel_robot_note for update to authenticated
  using (org_id in (select authz.user_org_ids('{field_staff,ops}')))
  with check (org_id in (select authz.user_org_ids('{field_staff,ops}')));
grant select, insert, update (slope, stoniness, lowest_branch_cm, note, parcel_id, org_id)
  on public.parcel_robot_note to authenticated;

-- Proof assets of the caller's own done requests (owner role on the parcel).
create function authz.user_service_proof_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.asset_id
  from public.service_request_photo p
  join public.service_request r on r.id = p.request_id
  join public.parcel_access pa on pa.parcel_id = r.parcel_id
  where pa.user_id = (select auth.uid())
    and pa.role = 'owner'
    and r.status = 'done';
$$;
comment on function authz.user_service_proof_asset_ids() is
  'IP15: assets linked as before / after proof to done service requests on parcels the caller owns.';
revoke all on function authz.user_service_proof_asset_ids() from public, anon;
grant execute on function authz.user_service_proof_asset_ids() to authenticated, service_role;

-- Permissive: adds the proof photos to what parcel readers see. The
-- restrictive policies (asset_parcel_reader_kinds, asset_not_hidden) still
-- apply; proof photos are of kind photo or tree_crop.
create policy asset_service_proof_select on public.asset for select to authenticated
  using (id in (select authz.user_service_proof_asset_ids()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.services_enabled(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.services_enabled from public.org_billing_setting s where s.org_id = p_org_id), false);
$$;

-- The service row with the season window of p_species (its
-- service_type_season row, else the service's default window).
create function private.service_type_for_species(t public.service_type, p_species text)
returns public.service_type
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.service_type_season;
begin
  select * into s from public.service_type_season x where x.service_type_id = t.id and x.species = p_species;
  if found then
    t.season_start_month := s.season_start_month;
    t.season_start_day := s.season_start_day;
    t.season_end_month := s.season_end_month;
    t.season_end_day := s.season_end_day;
  end if;
  return t;
end;
$$;

-- The service's price in the published price list in force on p_on, or all
-- null (no list, or no price for the service in it).
create function private.service_price(
  t public.service_type,
  p_on date,
  out price_list_id uuid,
  out price_list_version integer,
  out unit_price_kurus bigint,
  out minimum_fee_kurus bigint,
  out vat_rate_bp integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.version, i.unit_price_kurus, i.minimum_fee_kurus, l.vat_rate_bp
  from private.current_price_list(t.org_id, p_on) l
  join public.price_list_service_item i on i.price_list_id = l.id and i.service_type_id = t.id
  where l.id is not null;
$$;
comment on function private.service_price(public.service_type, date) is
  'IP15: price per dönüm, minimum fee and VAT of a service from the published price list in force (null when unpriced).';

-- Month-day as an integer (MMDD) for season comparisons.
create function private.service_in_season(t public.service_type, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when t.season_start_month * 100 + t.season_start_day <= t.season_end_month * 100 + t.season_end_day
      then (extract(month from p_day) * 100 + extract(day from p_day))
           between t.season_start_month * 100 + t.season_start_day
               and t.season_end_month * 100 + t.season_end_day
    else (extract(month from p_day) * 100 + extract(day from p_day)) >= t.season_start_month * 100 + t.season_start_day
      or (extract(month from p_day) * 100 + extract(day from p_day)) <= t.season_end_month * 100 + t.season_end_day
  end;
$$;

-- Start of the season p_day is in, or else of the next season.
create function private.service_season_start(t public.service_type, p_day date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_start date := make_date(extract(year from p_day)::integer, t.season_start_month, t.season_start_day);
begin
  if private.service_in_season(t, p_day) then
    -- In season: the window started this year, or last year if it wraps.
    return case when v_start > p_day then v_start - interval '1 year' else v_start end;
  end if;
  return case when v_start > p_day then v_start else v_start + interval '1 year' end;
end;
$$;

-- End of the season that starts on p_start.
create function private.service_season_end(t public.service_type, p_start date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when make_date(extract(year from p_start)::integer, t.season_end_month, t.season_end_day) >= p_start
      then make_date(extract(year from p_start)::integer, t.season_end_month, t.season_end_day)
    else make_date(extract(year from p_start)::integer + 1, t.season_end_month, t.season_end_day)
  end;
$$;

-- Area used for a quote: the latest boundary version, else the owner's
-- declared area.
create function private.parcel_service_area(p_parcel_id uuid, out area_m2 numeric, out area_source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select round(b.area_m2::numeric, 2), 'boundary' into area_m2, area_source
  from public.boundary b
  where b.parcel_id = p_parcel_id
  order by b.version desc
  limit 1;
  if area_m2 is null or area_m2 <= 0 then
    select p.estimated_area_m2, 'declared' into area_m2, area_source
    from public.parcel p where p.id = p_parcel_id;
  end if;
  if area_m2 is null or area_m2 <= 0 then
    area_m2 := null;
    area_source := null;
  end if;
end;
$$;

-- service-v1: as pricing-v1 (20261030105200_pricing.sql), one job instead of
-- visits a year: tenths of a dönüm rounded up, minimum fee, VAT on top.
create function private.service_quote(
  p_area_m2 numeric,
  p_price_per_donum_kurus bigint,
  p_minimum_fee_kurus bigint,
  p_vat_rate_bp integer,
  out subtotal_kurus bigint,
  out vat_kurus bigint,
  out total_kurus bigint
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tenths bigint;
begin
  -- Unpriced service or unknown area: no estimate.
  if p_area_m2 is null or p_price_per_donum_kurus is null then
    return;
  end if;
  if p_area_m2 <= 0 or p_price_per_donum_kurus <= 0
     or p_minimum_fee_kurus is null or p_minimum_fee_kurus < 0
     or p_vat_rate_bp is null or p_vat_rate_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'quote';
  end if;
  v_tenths := ceil(round(p_area_m2, 2) / 100);
  subtotal_kurus := greatest(round(v_tenths::numeric * p_price_per_donum_kurus / 10)::bigint, p_minimum_fee_kurus);
  vat_kurus := round(subtotal_kurus::numeric * p_vat_rate_bp / 10000)::bigint;
  total_kurus := subtotal_kurus + vat_kurus;
end;
$$;
comment on function private.service_quote(numeric, bigint, bigint, integer) is
  'IP15 pricing rule service-v1: max(ceil(area_m2/100) x price per dönüm / 10, minimum fee) + VAT, in kuruş; null without a price or area.';

-- Weed height levels in order.
create function private.weed_level(p_value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_value when 'short' then 1 when 'medium' then 2 when 'tall' then 3 end;
$$;

-- Latest weed_height of a parcel from a published visit (any source but AI).
create function private.latest_weed_observation(
  p_parcel_id uuid,
  out measurement_id uuid,
  out weed_height text,
  out observed_at timestamptz,
  out session_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.value_category, m.measured_at, m.session_id
  from public.measurement m
  join public.metric_definition d on d.id = m.metric_definition_id and d.code = 'weed_height'
  join public.session s on s.id = m.session_id and s.status = 'published'
  where m.parcel_id = p_parcel_id
    and m.tree_id is null and m.slot_id is null and m.zone_id is null
    and m.source <> 'ai'
  order by m.measured_at desc, (m.source = 'expert') desc, m.created_at desc
  limit 1;
$$;

-- The observation triggers a recommendation for the service on p_day: in
-- season, at or above the threshold, fresh enough, and no job of the same
-- service was completed on or after the observation day.
create function private.service_recommended(
  t public.service_type,
  p_parcel_id uuid,
  p_weed_height text,
  p_observed_at timestamptz,
  p_day date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select t.active
    and t.recommend_from_weed_height is not null
    and p_weed_height is not null
    and private.service_in_season(t, p_day)
    and private.weed_level(p_weed_height) >= private.weed_level(t.recommend_from_weed_height)
    and (p_observed_at at time zone 'Europe/Istanbul')::date >= p_day - t.observation_max_age_days
    and not exists (
      select 1 from public.service_request r
      where r.parcel_id = p_parcel_id and r.service_type_id = t.id and r.status = 'done'
        and r.completed_on >= (p_observed_at at time zone 'Europe/Istanbul')::date
    );
$$;

create function private.next_service_request_number(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Istanbul'))::integer;
  v_last integer;
begin
  perform pg_advisory_xact_lock(hashtext('service_request_number:' || p_org_id::text || ':' || v_year));
  select coalesce(max(substring(r.number from 8)::integer), 0) into v_last
  from public.service_request r
  where r.org_id = p_org_id and r.number like 'H-' || v_year || '-%';
  return 'H-' || v_year || '-' || lpad((v_last + 1)::text, 6, '0');
end;
$$;

create function private.log_service_event(
  r public.service_request,
  p_from public.service_request_status,
  p_role text,
  p_note text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.service_request_event (org_id, parcel_id, request_id, from_status, to_status, actor_user_id,
    actor_role, note)
  values (r.org_id, r.parcel_id, r.id, p_from, r.status, (select auth.uid()), p_role, nullif(btrim(p_note), ''));
$$;

-- One message to every owner of the parcel (and the requester); demo orgs
-- and demo accounts get none. Variables: parcel name, date, request number,
-- portal path; never amounts.
create function private.enqueue_service_notification(
  p_template public.notification_template,
  p_org_id uuid,
  p_parcel_id uuid,
  p_ref_id uuid,
  p_ref text,
  p_date date,
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
  if private.is_demo_org(p_org_id) then
    return 0;
  end if;
  insert into public.notification (org_id, parcel_id, recipient_user_id, channel, template, vars, ref_id)
  select
    p_org_id, p_parcel_id, pa.user_id,
    case when op.contact_preference = 'whatsapp' then 'whatsapp' else 'sms' end::public.notification_channel,
    p_template,
    jsonb_strip_nulls(jsonb_build_object('parcel_name', p.name, 'date', to_char(p_date, 'YYYY-MM-DD'),
      'ref', p_ref, 'path', p_path)),
    p_ref_id
  from public.parcel_access pa
  join public.parcel p on p.id = pa.parcel_id
  left join private.owner_profile op on op.org_id = p_org_id and op.user_id = pa.user_id
  where pa.parcel_id = p_parcel_id
    and pa.role = 'owner'
    and not authz.is_demo_account(pa.user_id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The request for an ops function: exists in an org where the caller is ops.
create function private.service_request_for_ops(p_id uuid)
returns public.service_request
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.service_request;
begin
  select * into r from public.service_request x where x.id = p_id;
  if not found or r.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(r.org_id);
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Functions
-- ---------------------------------------------------------------------------

-- Portal: what each service means for each parcel the caller owns (or, for
-- staff, the given parcel). state: recommended (in season, threshold
-- reached), available (in season), pre_request (out of season), open (a
-- request is open). Nothing when the switch is off or the area is unknown.
create function public.service_offers(p_parcel_id uuid default null)
returns table (
  parcel_id uuid,
  parcel_name text,
  service_type_id uuid,
  service_code text,
  service_name text,
  service_description text,
  state text,
  in_season boolean,
  season_start date,
  season_end date,
  weed_height text,
  observed_at timestamptz,
  measurement_id uuid,
  area_m2 numeric,
  area_source text,
  species text,
  price_list_version integer,
  price_per_donum_kurus bigint,
  minimum_fee_kurus bigint,
  vat_rate_bp integer,
  estimate_subtotal_kurus bigint,
  estimate_vat_kurus bigint,
  estimate_total_kurus bigint,
  open_request_id uuid,
  open_request_status text,
  open_request_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.istanbul_today();
begin
  return query
  with parcels as (
    select p.id, p.name, p.org_id, p.species
    from public.parcel p
    where (p_parcel_id is null or p.id = p_parcel_id)
      and (
        p.id in (select authz.user_parcel_ids('{owner}'))
        or (p_parcel_id is not null and p.org_id in (select authz.user_org_ids()))
      )
      and p.status <> 'passive'
      and private.services_enabled(p.org_id)
  )
  select
    p.id, p.name, t.id, t.code, t.name, t.description,
    case
      when o.id is not null then 'open'
      when not private.service_in_season(ts, v_today) then 'pre_request'
      when private.service_recommended(ts, p.id, w.weed_height, w.observed_at, v_today) then 'recommended'
      else 'available'
    end,
    private.service_in_season(ts, v_today),
    private.service_season_start(ts, v_today),
    private.service_season_end(ts, private.service_season_start(ts, v_today)),
    w.weed_height, w.observed_at, w.measurement_id,
    a.area_m2, a.area_source,
    p.species,
    sp.price_list_version, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp,
    q.subtotal_kurus, q.vat_kurus, q.total_kurus,
    o.id, o.status::text, o.number
  from parcels p
  join public.service_type t on t.org_id = p.org_id and t.active
  cross join lateral private.service_type_for_species(t, p.species) ts
  cross join lateral private.parcel_service_area(p.id) a
  left join lateral private.service_price(t, v_today) sp on true
  cross join lateral private.service_quote(a.area_m2, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp) q
  left join lateral private.latest_weed_observation(p.id) w on true
  left join lateral (
    select r.id, r.status, r.number from public.service_request r
    where r.parcel_id = p.id and r.service_type_id = t.id
      and r.status in ('pre_request', 'requested', 'scheduled')
    limit 1
  ) o on true
  where a.area_m2 is not null
  order by p.name, p.id, t.sort_order, t.code;
end;
$$;
comment on function public.service_offers(uuid) is
  'IP15 portal: service cards per owned parcel (state recommended / available / pre_request / open; season of the parcel''s species; estimate from the published price list, null when unpriced; latest weed observation).';

-- Portal navigation: the caller owns a parcel of an org with the service
-- layer switched on (the "Hizmetlerim" link).
create function public.portal_services_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.parcel_access pa
    where pa.user_id = (select auth.uid()) and pa.role = 'owner' and private.services_enabled(pa.org_id)
  );
$$;
comment on function public.portal_services_enabled() is
  'IP15 portal: true when the caller owns a parcel of an org with services_enabled.';

-- Owner: request a service (or, out of season, a pre-request for the next
-- season). Returns the request id.
create function public.customer_request_service(
  p_parcel_id uuid,
  p_service_type_id uuid,
  p_window public.service_window,
  p_note text,
  p_terms_version text,
  p_early_performance boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  t public.service_type;
  a record;
  q record;
  w record;
  sp record;
  r public.service_request;
  v_today date := private.istanbul_today();
  v_in_season boolean;
begin
  perform private.assert_not_demo();
  select * into p from public.parcel x where x.id = p_parcel_id;
  if not found or p.id not in (select authz.user_parcel_ids('{owner}')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.services_enabled(p.org_id) then
    raise exception 'services_disabled' using errcode = 'P0001';
  end if;
  select * into t from public.service_type x where x.id = p_service_type_id and x.org_id = p.org_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not t.active or p.status = 'passive' then
    raise exception 'service_inactive' using errcode = 'P0001';
  end if;
  if p_terms_version is null or length(btrim(p_terms_version)) not between 1 and 60
     or btrim(p_terms_version) is distinct from coalesce(
       (private.legal_text_current('service_terms')).version, btrim(p_terms_version)) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'terms_version';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  select * into a from private.parcel_service_area(p.id) x;
  if a.area_m2 is null then
    raise exception 'area_unknown' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.service_request x
    where x.parcel_id = p.id and x.service_type_id = t.id and x.status in ('pre_request', 'requested', 'scheduled')
  ) then
    raise exception 'request_open' using errcode = 'P0001';
  end if;
  -- Season of the parcel's species; price from the published list in force.
  t := private.service_type_for_species(t, p.species);
  select * into sp from private.service_price(t, v_today) x;
  select * into q from private.service_quote(a.area_m2, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp) x;
  select * into w from private.latest_weed_observation(p.id) x;
  v_in_season := private.service_in_season(t, v_today);

  insert into public.service_request (
    org_id, parcel_id, service_type_id, number, status, requested_by, season_year, preferred_window,
    customer_note, terms_version, early_performance_requested, recommended_measurement_id, recommended_weed_height,
    area_m2, area_source, price_list_id, price_list_version, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp,
    estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus
  ) values (
    p.org_id, p.id, t.id, private.next_service_request_number(p.org_id),
    case when v_in_season then 'requested' else 'pre_request' end::public.service_request_status,
    (select auth.uid()), extract(year from private.service_season_start(t, v_today))::integer,
    coalesce(p_window, 'flexible'), nullif(btrim(p_note), ''), btrim(p_terms_version), coalesce(p_early_performance, false),
    case when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then w.measurement_id end,
    case when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then w.weed_height end,
    a.area_m2, a.area_source, sp.price_list_id, sp.price_list_version, sp.unit_price_kurus, sp.minimum_fee_kurus,
    sp.vat_rate_bp, q.subtotal_kurus, q.vat_kurus, q.total_kurus
  )
  returning * into r;
  perform private.log_service_event(r, null, 'owner', null);
  perform private.audit(r.org_id, (select auth.uid()), 'customer', 'service_request.create', 'service_request', r.id,
    jsonb_build_object('status', r.status, 'service', t.code, 'season_year', r.season_year,
      'terms_version', r.terms_version, 'early_performance', r.early_performance_requested,
      'price_list_version', r.price_list_version, 'estimate_total_kurus', r.estimate_total_kurus));
  return r.id;
exception
  when unique_violation then
    raise exception 'request_open' using errcode = 'P0001';
end;
$$;
comment on function public.customer_request_service(uuid, uuid, public.service_window, text, text, boolean) is
  'IP15 owner: requests a service for a parcel (pre_request out of season); quote and price list version frozen with service-v1 (none when unpriced).';

-- Owner: cancels an own request before the scheduled day (pre_request,
-- requested, or scheduled with a day after today).
create function public.customer_cancel_service_request(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
  v_from public.service_request_status;
begin
  perform private.assert_not_demo();
  select * into r from public.service_request x where x.id = p_id for update;
  if not found or r.parcel_id not in (select authz.user_parcel_ids('{owner}')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status not in ('pre_request', 'requested', 'scheduled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if r.status = 'scheduled' and r.scheduled_date <= private.istanbul_today() then
    raise exception 'too_late_to_cancel' using errcode = 'P0001';
  end if;
  if p_reason is not null and length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  v_from := r.status;
  update public.service_request x
  set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'owner', cancel_reason = nullif(btrim(p_reason), '')
  where x.id = r.id
  returning * into r;
  if r.session_id is not null then
    update public.session s set status = 'cancelled' where s.id = r.session_id and s.status = 'planned';
  end if;
  perform private.log_service_event(r, v_from, 'owner', p_reason);
  perform private.audit(r.org_id, (select auth.uid()), 'customer', 'service_request.cancel', 'service_request', r.id,
    jsonb_build_object('from', v_from));
end;
$$;
comment on function public.customer_cancel_service_request(uuid, text) is
  'IP15 owner: cancels an own request free of charge until the day before the scheduled day.';

-- Ops queue: requests of the caller's ops orgs with parcel and requester.
create function public.ops_service_requests(
  p_status public.service_request_status default null,
  p_service_type_id uuid default null,
  p_season_year integer default null
)
returns table (
  id uuid,
  org_id uuid,
  number text,
  status text,
  parcel_id uuid,
  parcel_name text,
  village text,
  district text,
  service_type_id uuid,
  service_code text,
  service_name text,
  season_year integer,
  preferred_window text,
  customer_note text,
  ops_note text,
  recommended_weed_height text,
  area_m2 numeric,
  area_source text,
  price_list_version integer,
  estimate_total_kurus bigint,
  quote_total_kurus bigint,
  scheduled_date date,
  completed_on date,
  payment_received_on date,
  payment_amount_kurus bigint,
  payment_method text,
  cancel_reason text,
  cancelled_by_role text,
  early_performance_requested boolean,
  before_photos integer,
  after_photos integer,
  requester_user_id uuid,
  requester_name text,
  requester_phone text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id, r.org_id, r.number, r.status::text, r.parcel_id, p.name, p.village, p.district,
    t.id, t.code, t.name, r.season_year, r.preferred_window::text, r.customer_note, r.ops_note,
    r.recommended_weed_height, r.area_m2, r.area_source, r.price_list_version, r.estimate_total_kurus,
    r.quote_total_kurus, r.scheduled_date, r.completed_on, r.payment_received_on, r.payment_amount_kurus,
    r.payment_method, r.cancel_reason, r.cancelled_by_role, r.early_performance_requested,
    (select count(*)::integer from public.service_request_photo x where x.request_id = r.id and x.phase = 'before'),
    (select count(*)::integer from public.service_request_photo x where x.request_id = r.id and x.phase = 'after'),
    r.requested_by, op.full_name, op.phone, r.created_at
  from public.service_request r
  join public.parcel p on p.id = r.parcel_id
  join public.service_type t on t.id = r.service_type_id
  left join private.owner_profile op on op.org_id = r.org_id and op.user_id = r.requested_by
  where r.org_id in (select authz.user_org_ids('{ops}'))
    and (p_status is null or r.status = p_status)
    and (p_service_type_id is null or r.service_type_id = p_service_type_id)
    and (p_season_year is null or r.season_year = p_season_year)
  order by
    case r.status when 'requested' then 0 when 'scheduled' then 1 when 'pre_request' then 2 when 'done' then 3 else 4 end,
    r.scheduled_date nulls last, r.created_at desc;
$$;
comment on function public.ops_service_requests(public.service_request_status, uuid, integer) is
  'IP15 ops: service request queue with parcel, requester contact and photo counts.';

-- Ops: confirm the quote and set (or move) the date. Opens the job's
-- mowing session the first time. From pre_request, requested or scheduled.
create function public.ops_schedule_service_request(
  p_id uuid,
  p_scheduled_date date,
  p_quote_total_kurus bigint,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
  t public.service_type;
  v_from public.service_request_status;
  v_session uuid;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  perform 1 from public.service_request x where x.id = r.id for update;
  select * into r from public.service_request x where x.id = p_id;
  if r.status not in ('pre_request', 'requested', 'scheduled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_scheduled_date is null or p_scheduled_date < private.istanbul_today()
     or p_scheduled_date > private.istanbul_today() + 365 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'scheduled_date';
  end if;
  if p_quote_total_kurus is not null and (p_quote_total_kurus < 0 or p_quote_total_kurus > 100000000000) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'quote_total';
  end if;
  -- Unpriced at the request ("Fiyat teklifle bildirilir"): ops gives the amount.
  if r.estimate_total_kurus is null and coalesce(p_quote_total_kurus, r.quote_total_kurus) is null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'quote_total';
  end if;
  -- The owner first learns the amount from this confirmation: the day is at
  -- the earliest tomorrow, so the free cancellation (until the day before)
  -- stays open even with early performance (kararlar.md H37).
  if r.estimate_total_kurus is null and p_scheduled_date <= private.istanbul_today() then
    raise exception 'invalid_input' using errcode = '22023', detail = 'scheduled_date';
  end if;
  -- H37: never above what the owner accepted.
  if p_quote_total_kurus > r.estimate_total_kurus then
    raise exception 'quote_above_estimate' using errcode = 'P0001';
  end if;
  -- H37: the 14-day withdrawal period runs unless the owner asked for an
  -- earlier job.
  if not r.early_performance_requested
     and p_scheduled_date < (r.created_at at time zone 'Europe/Istanbul')::date + 15 then
    raise exception 'withdrawal_period' using errcode = 'P0001',
      detail = to_char((r.created_at at time zone 'Europe/Istanbul')::date + 15, 'YYYY-MM-DD');
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  select * into t from public.service_type x where x.id = r.service_type_id;
  v_from := r.status;
  v_session := r.session_id;
  if v_session is null then
    insert into public.session (org_id, parcel_id, kind, performer, status, planned_date, notes)
    values (r.org_id, r.parcel_id,
      case t.operation_kind when 'mowing' then 'mowing' when 'tillage' then 'tillage' when 'spraying' then 'spraying'
        else 'manual_entry' end::public.session_kind,
      'crew', 'planned', p_scheduled_date, 'Hizmet işi ' || r.number)
    returning id into v_session;
  else
    update public.session s set planned_date = p_scheduled_date where s.id = v_session;
  end if;
  update public.service_request x
  set status = 'scheduled', scheduled_date = p_scheduled_date, session_id = v_session,
      quote_total_kurus = coalesce(p_quote_total_kurus, x.quote_total_kurus, x.estimate_total_kurus),
      ops_note = coalesce(nullif(btrim(p_note), ''), x.ops_note)
  where x.id = r.id
  returning * into r;
  perform private.log_service_event(r, v_from,
    'ops', case when v_from = 'scheduled' then 'Tarih değişti: ' || to_char(p_scheduled_date, 'YYYY-MM-DD') end);
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'service_request.schedule', 'service_request', r.id,
    jsonb_build_object('from', v_from, 'scheduled_date', p_scheduled_date, 'quote_total_kurus', r.quote_total_kurus));
  -- A moved date is notified again (one message per request and template
  -- otherwise: the date is part of neither the key nor the message id).
  if v_from <> 'scheduled' then
    perform private.enqueue_service_notification('service_scheduled', r.org_id, r.parcel_id, r.id, r.number,
      p_scheduled_date, '/portal/hizmetler/' || r.id::text);
  end if;
end;
$$;
comment on function public.ops_schedule_service_request(uuid, date, bigint, text) is
  'IP15 ops: confirms the quote (VAT included; default the frozen estimate) and the day; opens the job session.';

-- Ops: uploads a proof photo already stored at
-- media/org/<org>/parcel/<parcel>/<hash> as an asset of the job's session
-- and links it. Returns the asset id.
create function public.ops_add_service_photo(
  p_id uuid,
  p_phase text,
  p_content_hash text,
  p_byte_size bigint,
  p_mime_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
  v_asset uuid;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  if r.status <> 'scheduled' or r.session_id is null then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_phase is null or p_phase not in ('before', 'after') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phase';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'content_hash';
  end if;
  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'mime_type';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 20000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'byte_size';
  end if;
  select a.id into v_asset from public.asset a where a.session_id = r.session_id and a.content_hash = p_content_hash;
  if v_asset is null then
    insert into public.asset (org_id, parcel_id, session_id, kind, uri, content_hash, byte_size, mime_type,
      pipeline, pipeline_version)
    values (r.org_id, r.parcel_id, r.session_id, 'photo',
      'storage://media/org/' || r.org_id || '/parcel/' || r.parcel_id || '/' || p_content_hash,
      p_content_hash, p_byte_size, p_mime_type, 'service-proof', 'v1')
    returning id into v_asset;
  end if;
  insert into public.service_request_photo (org_id, parcel_id, request_id, asset_id, phase)
  values (r.org_id, r.parcel_id, r.id, v_asset, p_phase)
  on conflict do nothing;
  return v_asset;
end;
$$;
comment on function public.ops_add_service_photo(uuid, text, text, bigint, text) is
  'IP15 ops: registers an uploaded proof photo (content-hash addressed) on the job session and links it before or after.';

-- Ops: links a photo or tree crop of the job session or of a published visit
-- of the same parcel.
create function public.ops_link_service_photo(p_id uuid, p_asset_id uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
  a public.asset;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  if r.status <> 'scheduled' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_phase is null or p_phase not in ('before', 'after') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'phase';
  end if;
  select * into a from public.asset x where x.id = p_asset_id and x.parcel_id = r.parcel_id;
  if not found or a.kind not in ('photo', 'tree_crop') or not (
    a.session_id = r.session_id
    or exists (select 1 from public.session s where s.id = a.session_id and s.status = 'published')
  ) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'asset';
  end if;
  insert into public.service_request_photo (org_id, parcel_id, request_id, asset_id, phase)
  values (r.org_id, r.parcel_id, r.id, a.id, p_phase)
  on conflict do nothing;
end;
$$;

-- Ops: removes a link before the job is done (the asset stays).
create function public.ops_unlink_service_photo(p_id uuid, p_asset_id uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  if r.status <> 'scheduled' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  delete from public.service_request_photo x
  where x.request_id = r.id and x.asset_id = p_asset_id and x.phase = p_phase;
end;
$$;

-- Ops: the job is done on p_done_on (not in the future). Needs at least one
-- before and one after photo. Writes the operation, closes the session as
-- captured (never published: it is not an audit visit).
create function public.ops_complete_service_request(p_id uuid, p_done_on date, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
  t public.service_type;
  v_op uuid;
  v_start timestamptz;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  select * into r from public.service_request x where x.id = p_id for update;
  if r.status <> 'scheduled' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_done_on is null or p_done_on > private.istanbul_today() or p_done_on < r.created_at::date - 1 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'done_on';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'note';
  end if;
  if not exists (select 1 from public.service_request_photo x where x.request_id = r.id and x.phase = 'before')
     or not exists (select 1 from public.service_request_photo x where x.request_id = r.id and x.phase = 'after') then
    raise exception 'proof_missing' using errcode = 'P0001';
  end if;
  select * into t from public.service_type x where x.id = r.service_type_id;
  -- The job day at 08:00 Turkey time (the exact hour is not recorded).
  v_start := (p_done_on + time '08:00') at time zone 'Europe/Istanbul';
  insert into public.operation (org_id, parcel_id, session_id, kind, performer, performed_by, started_at, area_m2,
    details, notes)
  values (r.org_id, r.parcel_id, r.session_id, t.operation_kind, 'crew', null, v_start, r.area_m2,
    jsonb_build_object('service_request_id', r.id, 'service_request_number', r.number, 'service_code', t.code,
      'by', 'orchados'),
    nullif(btrim(p_note), ''))
  returning id into v_op;
  update public.session s
  set status = 'captured', started_at = coalesce(s.started_at, v_start), planned_date = p_done_on
  where s.id = r.session_id;
  update public.service_request x
  set status = 'done', completed_on = p_done_on, operation_id = v_op,
      ops_note = coalesce(nullif(btrim(p_note), ''), x.ops_note)
  where x.id = r.id
  returning * into r;
  perform private.log_service_event(r, 'scheduled', 'ops', null);
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'service_request.complete', 'service_request', r.id,
    jsonb_build_object('completed_on', p_done_on, 'operation_id', v_op));
  perform private.enqueue_service_notification('service_completed', r.org_id, r.parcel_id, r.id, r.number,
    p_done_on, '/portal/hizmetler/' || r.id::text);
end;
$$;
comment on function public.ops_complete_service_request(uuid, date, text) is
  'IP15 ops: marks the job done (before and after photos required), writes the operation row.';

create function public.ops_cancel_service_request(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
  v_from public.service_request_status;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  select * into r from public.service_request x where x.id = p_id for update;
  if r.status not in ('pre_request', 'requested', 'scheduled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'reason';
  end if;
  v_from := r.status;
  update public.service_request x
  set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'ops', cancel_reason = btrim(p_reason)
  where x.id = r.id
  returning * into r;
  if r.session_id is not null then
    update public.session s set status = 'cancelled' where s.id = r.session_id and s.status = 'planned';
  end if;
  perform private.log_service_event(r, v_from, 'ops', p_reason);
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'service_request.cancel', 'service_request', r.id,
    jsonb_build_object('from', v_from));
  perform private.enqueue_service_notification('service_cancelled', r.org_id, r.parcel_id, r.id, r.number,
    private.istanbul_today(), '/portal/hizmetler/' || r.id::text);
end;
$$;

-- Ops: payment received after the job (once).
create function public.ops_record_service_payment(
  p_id uuid,
  p_amount_kurus bigint,
  p_method text,
  p_received_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.service_request;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  select * into r from public.service_request x where x.id = p_id for update;
  if r.status <> 'done' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if r.payment_received_on is not null then
    raise exception 'payment_recorded' using errcode = 'P0001';
  end if;
  if p_amount_kurus is null or p_amount_kurus <= 0 or p_amount_kurus > 100000000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'amount';
  end if;
  if p_method is null or p_method not in ('cash', 'transfer', 'other') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'method';
  end if;
  if p_received_on is null or p_received_on > private.istanbul_today() or p_received_on < r.completed_on - 30 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'received_on';
  end if;
  update public.service_request x
  set payment_received_on = p_received_on, payment_amount_kurus = p_amount_kurus, payment_method = p_method,
      payment_recorded_by = (select auth.uid())
  where x.id = r.id;
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'service_request.payment', 'service_request', r.id,
    jsonb_build_object('amount_kurus', p_amount_kurus, 'method', p_method, 'received_on', p_received_on));
end;
$$;

-- Ops: edits a catalogue row (default season, recommendation rule, active).
-- Prices are edited in the price list (ops_save_price_list_service_items).
create function public.ops_update_service_type(
  p_id uuid,
  p_season_start_month smallint,
  p_season_start_day smallint,
  p_season_end_month smallint,
  p_season_end_day smallint,
  p_recommend_from_weed_height text,
  p_observation_max_age_days integer,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.service_type;
begin
  perform private.assert_not_demo();
  select * into t from public.service_type x where x.id = p_id;
  if not found or t.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(t.org_id);
  if not coalesce(private.valid_month_day(p_season_start_month, p_season_start_day), false)
     or not coalesce(private.valid_month_day(p_season_end_month, p_season_end_day), false)
     or (p_season_start_month, p_season_start_day) = (p_season_end_month, p_season_end_day) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'season';
  end if;
  if p_recommend_from_weed_height is not null and p_recommend_from_weed_height not in ('medium', 'tall') then
    raise exception 'invalid_input' using errcode = '22023', detail = 'recommend_from';
  end if;
  if p_observation_max_age_days is null or p_observation_max_age_days not between 1 and 365 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'observation_max_age_days';
  end if;
  update public.service_type x
  set season_start_month = p_season_start_month, season_start_day = p_season_start_day,
      season_end_month = p_season_end_month, season_end_day = p_season_end_day,
      recommend_from_weed_height = p_recommend_from_weed_height,
      observation_max_age_days = p_observation_max_age_days, active = coalesce(p_active, x.active),
      updated_by = (select auth.uid())
  where x.id = t.id;
  perform private.audit(t.org_id, (select auth.uid()), 'ops', 'service_type.update', 'service_type', t.id,
    jsonb_build_object(
      'active', p_active, 'recommend_from', p_recommend_from_weed_height,
      'observation_max_age_days', p_observation_max_age_days,
      'season', format('%s-%s..%s-%s', p_season_start_month, p_season_start_day, p_season_end_month, p_season_end_day)));
end;
$$;

-- Ops: sets the season window of a service for one fruit species.
create function public.ops_save_service_season(
  p_service_type_id uuid,
  p_species text,
  p_season_start_month smallint,
  p_season_start_day smallint,
  p_season_end_month smallint,
  p_season_end_day smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.service_type;
begin
  perform private.assert_not_demo();
  select * into t from public.service_type x where x.id = p_service_type_id;
  if not found or t.org_id not in (select authz.user_org_ids()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_ops(t.org_id);
  if not exists (select 1 from public.fruit_species s where s.code = p_species) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'species';
  end if;
  if not coalesce(private.valid_month_day(p_season_start_month, p_season_start_day), false)
     or not coalesce(private.valid_month_day(p_season_end_month, p_season_end_day), false)
     or (p_season_start_month, p_season_start_day) = (p_season_end_month, p_season_end_day) then
    raise exception 'invalid_input' using errcode = '22023', detail = 'season';
  end if;
  insert into public.service_type_season (org_id, service_type_id, species, season_start_month, season_start_day,
    season_end_month, season_end_day, updated_by)
  values (t.org_id, t.id, p_species, p_season_start_month, p_season_start_day, p_season_end_month, p_season_end_day,
    (select auth.uid()))
  on conflict (service_type_id, species) do update
  set season_start_month = excluded.season_start_month, season_start_day = excluded.season_start_day,
      season_end_month = excluded.season_end_month, season_end_day = excluded.season_end_day,
      updated_by = excluded.updated_by;
  perform private.audit(t.org_id, (select auth.uid()), 'ops', 'service_type.season', 'service_type', t.id,
    jsonb_build_object('species', p_species,
      'season', format('%s-%s..%s-%s', p_season_start_month, p_season_start_day, p_season_end_month, p_season_end_day)));
end;
$$;
comment on function public.ops_save_service_season(uuid, text, smallint, smallint, smallint, smallint) is
  'IP15 ops: season window of a service for one fruit species (used by the recommendation and the pre-request).';

-- Ops: replaces the service prices of a price list draft.
-- p_items: [{service_type_id, unit_price_kurus, minimum_fee_kurus?}]; an empty
-- array leaves every service unpriced. Errors: not_found, forbidden,
-- price_list_not_draft, invalid_input (detail: field or items).
create function public.ops_save_price_list_service_items(p_price_list_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.price_list;
  v_item jsonb;
  v_service uuid;
  v_unit numeric;
  v_min numeric;
  v_seen uuid[] := '{}';
begin
  perform private.assert_not_demo();
  l := private.lock_price_list_draft(p_price_list_id);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'items';
  end if;
  delete from public.price_list_service_item where price_list_id = l.id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023', detail = 'items';
    end if;
    begin
      v_service := (v_item ->> 'service_type_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service_type_id';
    end;
    if v_service is null or v_service = any (v_seen)
       or not exists (select 1 from public.service_type t where t.id = v_service and t.org_id = l.org_id) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service_type_id';
    end if;
    v_seen := v_seen || v_service;
    v_unit := private.input_number(v_item, 'unit_price_kurus', true);
    v_min := coalesce(private.input_number(v_item, 'minimum_fee_kurus'), 0);
    if v_unit <> trunc(v_unit) or v_unit <= 0 or v_unit > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'unit_price_kurus';
    end if;
    if v_min <> trunc(v_min) or v_min < 0 or v_min > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'minimum_fee_kurus';
    end if;
    insert into public.price_list_service_item (org_id, price_list_id, service_type_id, unit_price_kurus,
      minimum_fee_kurus)
    values (l.org_id, l.id, v_service, v_unit, v_min);
  end loop;
  perform private.audit(l.org_id, (select auth.uid()), 'ops', 'price_list.service_items_saved', 'price_list', l.id,
    jsonb_build_object('items', jsonb_array_length(p_items)));
end;
$$;
comment on function public.ops_save_price_list_service_items(uuid, jsonb) is
  'IP15 ops: saves the service prices (per dönüm, minimum fee) of a price list draft.';

-- As in 20261030100400_catalog_applications.sql, and a copy takes the
-- service prices too.
create or replace function public.ops_create_price_list_draft(p_org_id uuid, p_copy_from_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  src public.price_list;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform private.require_ops(p_org_id);
  if p_copy_from_id is not null then
    select * into src from public.price_list where id = p_copy_from_id and org_id = p_org_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  insert into public.price_list (org_id, status, valid_from, vat_rate_bp, note, created_by)
  values (
    p_org_id, 'draft',
    case when src.valid_from >= v_today then src.valid_from end,
    coalesce(src.vat_rate_bp, 2000), src.note, (select auth.uid())
  )
  returning id into v_id;
  if src.id is not null then
    insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus)
    select p_org_id, v_id, i.package_id, i.unit_price_kurus, i.minimum_fee_kurus, i.inventory_fee_kurus
    from public.price_list_item i where i.price_list_id = src.id;
    insert into public.price_list_service_item (org_id, price_list_id, service_type_id, unit_price_kurus,
      minimum_fee_kurus)
    select p_org_id, v_id, i.service_type_id, i.unit_price_kurus, i.minimum_fee_kurus
    from public.price_list_service_item i where i.price_list_id = src.id;
  end if;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'price_list.draft_created', 'price_list', v_id,
    jsonb_build_object('copy_from', p_copy_from_id));
  return v_id;
end;
$$;

-- Ops: demand per service and season (pre-requests validate demand).
create function public.ops_service_demand()
returns table (
  service_type_id uuid,
  service_code text,
  service_name text,
  season_year integer,
  pre_requests integer,
  requested integer,
  scheduled integer,
  done integer,
  cancelled integer,
  total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.code, t.name, r.season_year,
    count(*) filter (where r.status = 'pre_request')::integer,
    count(*) filter (where r.status = 'requested')::integer,
    count(*) filter (where r.status = 'scheduled')::integer,
    count(*) filter (where r.status = 'done')::integer,
    count(*) filter (where r.status = 'cancelled')::integer,
    count(*)::integer
  from public.service_request r
  join public.service_type t on t.id = r.service_type_id
  where r.org_id in (select authz.user_org_ids('{ops}'))
  group by t.id, t.code, t.name, t.sort_order, r.season_year
  order by r.season_year desc, t.sort_order, t.code;
$$;
comment on function public.ops_service_demand() is
  'IP15 ops: requests per service and season by status; pre_requests is the demand signal for the next season.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.valid_month_day(smallint, smallint) from public;
-- Called by the check constraints of service_type: every role that writes the
-- table (service role, the loader) evaluates it.
grant execute on function private.valid_month_day(smallint, smallint) to authenticated, service_role;
revoke all on function private.touch_robot_note() from public;
revoke all on function private.services_enabled(uuid) from public;
revoke all on function private.service_in_season(public.service_type, date) from public;
revoke all on function private.service_season_start(public.service_type, date) from public;
revoke all on function private.service_season_end(public.service_type, date) from public;
revoke all on function private.parcel_service_area(uuid) from public;
revoke all on function private.service_quote(numeric, bigint, bigint, integer) from public;
revoke all on function private.service_type_for_species(public.service_type, text) from public;
revoke all on function private.service_price(public.service_type, date) from public;
revoke all on function private.weed_level(text) from public;
revoke all on function private.latest_weed_observation(uuid) from public;
revoke all on function private.service_recommended(public.service_type, uuid, text, timestamptz, date) from public;
revoke all on function private.next_service_request_number(uuid) from public;
revoke all on function private.log_service_event(public.service_request, public.service_request_status, text, text)
  from public;
revoke all on function private.enqueue_service_notification(public.notification_template, uuid, uuid, uuid, text,
  date, text) from public;
revoke all on function private.service_request_for_ops(uuid) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.service_offers(uuid)',
    'public.portal_services_enabled()',
    'public.customer_request_service(uuid, uuid, public.service_window, text, text, boolean)',
    'public.customer_cancel_service_request(uuid, text)',
    'public.ops_service_requests(public.service_request_status, uuid, integer)',
    'public.ops_schedule_service_request(uuid, date, bigint, text)',
    'public.ops_add_service_photo(uuid, text, text, bigint, text)',
    'public.ops_link_service_photo(uuid, uuid, text)',
    'public.ops_unlink_service_photo(uuid, uuid, text)',
    'public.ops_complete_service_request(uuid, date, text)',
    'public.ops_cancel_service_request(uuid, text)',
    'public.ops_record_service_payment(uuid, bigint, text, date)',
    'public.ops_update_service_type(uuid, smallint, smallint, smallint, smallint, text, integer, boolean)',
    'public.ops_save_service_season(uuid, text, smallint, smallint, smallint, smallint)',
    'public.ops_save_price_list_service_items(uuid, jsonb)',
    'public.ops_service_demand()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed: weed mowing for the orgs that exist now, without a price (the price
-- is not decided; it goes into a price list version when it is), season
-- 1 March - 30 June for every fruit species. Fresh databases get it from
-- seed.sql; the demo loader adds it to the demo org.
-- ---------------------------------------------------------------------------

insert into public.service_type (
  org_id, code, name, description, operation_kind, season_start_month, season_start_day, season_end_month,
  season_end_day, recommend_from_weed_height, observation_max_age_days, sort_order
)
select o.id, 'weed_mowing', 'Yabani ot biçme',
  'orchadOS ot biçme hizmeti: parseldeki yabani otlar motorlu tırpanla biçilir. Öncesi ve sonrası fotoğrafları parsel kaydına eklenir.',
  'mowing', 3, 1, 6, 30, 'medium', 60, 10
from public.org o
where not private.is_demo_org(o.id)
on conflict (org_id, code) do nothing;

insert into public.service_type_season (org_id, service_type_id, species, season_start_month, season_start_day,
  season_end_month, season_end_day)
select t.org_id, t.id, f.code, 3, 1, 6, 30
from public.service_type t
cross join public.fruit_species f
where t.code = 'weed_mowing' and not private.is_demo_org(t.org_id)
on conflict (service_type_id, species) do nothing;
