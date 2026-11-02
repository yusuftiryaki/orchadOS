-- IP15 / 2: service layer, first service: weed mowing (docs/MVP.md, Module 6;
-- docs/veri-modeli.md, "Hizmet katmanı").
--
-- 1. Switch org_billing_setting.services_enabled (SQL only; off on hosted
--    projects, on in seed.sql) and the audit entity types of this package.
-- 2. weed_height: parcel-level field question (short / medium / tall), asked
--    once per visit in spring and summer.
-- 3. public.service_type: generic, org-scoped service catalogue. A new
--    service (tillage, pruning) is a new row, not a schema change. Prices in
--    kuruş, VAT excluded, per dönüm, with a minimum fee; a season window per
--    service (it may wrap the year end); the weed threshold and observation
--    age that trigger a recommendation. The migration seeds weed_mowing for
--    existing orgs with a draft price (price_is_draft).
-- 4. public.service_request (+ service_request_event, append-only history):
--    pre_request -> requested -> scheduled -> done, or cancelled. The quote
--    is frozen at the request (pricing rule service-v1, the rounding of
--    pricing-v1: tenths of a dönüm); ops confirms the amount and the date.
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
--    ops_record_service_payment, ops_update_service_type, ops_service_demand
--    (pre-requests per service and season).
--
-- Error codes: not_found (P0002), forbidden and demo_read_only (42501),
-- invalid_input (22023, detail names the field), services_disabled,
-- service_inactive, area_unknown, request_open, invalid_status,
-- too_late_to_cancel, proof_missing, payment_recorded (P0001).

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
  -- Per dönüm (1000 m²), VAT excluded, as price_list_item.
  price_per_donum_kurus bigint not null check (price_per_donum_kurus > 0),
  minimum_fee_kurus bigint not null default 0 check (minimum_fee_kurus >= 0),
  vat_rate_bp integer not null default 2000 check (vat_rate_bp between 0 and 10000),
  -- A draft price is shown as an estimate ("tahmini") in the portal.
  price_is_draft boolean not null default true,
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
  'Service catalogue of an org (IP15): one row per service type (weed mowing first). Price per dönüm excluding VAT, minimum fee, season window, recommendation rule.';
alter table public.service_type enable row level security;
select private.attach_demo_guard('public.service_type');
create trigger service_type_touch before update on public.service_type
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
  -- The service terms the owner accepted (legal.ts version string).
  terms_version text not null check (length(terms_version) between 1 and 60),
  -- What the portal showed when the request was made, if anything.
  recommended_measurement_id uuid references public.measurement (id) on delete set null,
  recommended_weed_height text check (recommended_weed_height in ('short', 'medium', 'tall')),
  -- Quote frozen at the request (pricing rule service-v1).
  area_m2 numeric(12, 2) not null check (area_m2 > 0),
  area_source text not null check (area_source in ('boundary', 'declared')),
  price_per_donum_kurus bigint not null check (price_per_donum_kurus > 0),
  minimum_fee_kurus bigint not null check (minimum_fee_kurus >= 0),
  vat_rate_bp integer not null check (vat_rate_bp between 0 and 10000),
  price_is_draft boolean not null,
  estimate_subtotal_kurus bigint not null check (estimate_subtotal_kurus >= 0),
  estimate_vat_kurus bigint not null check (estimate_vat_kurus >= 0),
  estimate_total_kurus bigint not null check (estimate_total_kurus >= 0),
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

revoke all on public.service_type, public.service_request, public.service_request_event,
  public.service_request_photo, public.parcel_robot_note from anon, authenticated;
grant all on public.service_type, public.service_request, public.service_request_event,
  public.service_request_photo, public.parcel_robot_note to service_role;

-- Catalogue: staff of the org, and parcel readers of the org (names and
-- prices are shown on the portal). Writes through ops_update_service_type.
create policy service_type_select on public.service_type for select to authenticated
  using (org_id in (select authz.user_org_ids()) or org_id in (select authz.user_parcel_org_ids()));
grant select on public.service_type to authenticated;

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
  customer_note, terms_version, recommended_measurement_id, recommended_weed_height, area_m2, area_source,
  price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, price_is_draft, estimate_subtotal_kurus,
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
  if p_area_m2 is null or p_area_m2 <= 0 or p_price_per_donum_kurus is null or p_price_per_donum_kurus <= 0
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
  'IP15 pricing rule service-v1: max(ceil(area_m2/100) x price per dönüm / 10, minimum fee) + VAT, in kuruş.';

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
  price_per_donum_kurus bigint,
  minimum_fee_kurus bigint,
  vat_rate_bp integer,
  price_is_draft boolean,
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
    select p.id, p.name, p.org_id
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
      when not private.service_in_season(t, v_today) then 'pre_request'
      when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then 'recommended'
      else 'available'
    end,
    private.service_in_season(t, v_today),
    private.service_season_start(t, v_today),
    private.service_season_end(t, private.service_season_start(t, v_today)),
    w.weed_height, w.observed_at, w.measurement_id,
    a.area_m2, a.area_source,
    t.price_per_donum_kurus, t.minimum_fee_kurus, t.vat_rate_bp, t.price_is_draft,
    q.subtotal_kurus, q.vat_kurus, q.total_kurus,
    o.id, o.status::text, o.number
  from parcels p
  join public.service_type t on t.org_id = p.org_id and t.active
  cross join lateral private.parcel_service_area(p.id) a
  cross join lateral private.service_quote(a.area_m2, t.price_per_donum_kurus, t.minimum_fee_kurus,
    t.vat_rate_bp) q
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
  'IP15 portal: service cards per owned parcel (state recommended / available / pre_request / open, estimate, latest weed observation).';

-- Owner: request a service (or, out of season, a pre-request for the next
-- season). Returns the request id.
create function public.customer_request_service(
  p_parcel_id uuid,
  p_service_type_id uuid,
  p_window public.service_window,
  p_note text,
  p_terms_version text
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
  if p_terms_version is null or length(btrim(p_terms_version)) not between 1 and 60 then
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
  select * into q from private.service_quote(a.area_m2, t.price_per_donum_kurus, t.minimum_fee_kurus, t.vat_rate_bp) x;
  select * into w from private.latest_weed_observation(p.id) x;
  v_in_season := private.service_in_season(t, v_today);

  insert into public.service_request (
    org_id, parcel_id, service_type_id, number, status, requested_by, season_year, preferred_window,
    customer_note, terms_version, recommended_measurement_id, recommended_weed_height,
    area_m2, area_source, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, price_is_draft,
    estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus
  ) values (
    p.org_id, p.id, t.id, private.next_service_request_number(p.org_id),
    case when v_in_season then 'requested' else 'pre_request' end::public.service_request_status,
    (select auth.uid()), extract(year from private.service_season_start(t, v_today))::integer,
    coalesce(p_window, 'flexible'), nullif(btrim(p_note), ''), btrim(p_terms_version),
    case when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then w.measurement_id end,
    case when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then w.weed_height end,
    a.area_m2, a.area_source, t.price_per_donum_kurus, t.minimum_fee_kurus, t.vat_rate_bp, t.price_is_draft,
    q.subtotal_kurus, q.vat_kurus, q.total_kurus
  )
  returning * into r;
  perform private.log_service_event(r, null, 'owner', null);
  perform private.audit(r.org_id, (select auth.uid()), 'customer', 'service_request.create', 'service_request', r.id,
    jsonb_build_object('status', r.status, 'service', t.code, 'season_year', r.season_year));
  return r.id;
exception
  when unique_violation then
    raise exception 'request_open' using errcode = 'P0001';
end;
$$;
comment on function public.customer_request_service(uuid, uuid, public.service_window, text, text) is
  'IP15 owner: requests a service for a parcel (pre_request out of season); quote frozen with service-v1.';

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
  price_is_draft boolean,
  estimate_total_kurus bigint,
  quote_total_kurus bigint,
  scheduled_date date,
  completed_on date,
  payment_received_on date,
  payment_amount_kurus bigint,
  payment_method text,
  cancel_reason text,
  cancelled_by_role text,
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
    r.recommended_weed_height, r.area_m2, r.area_source, r.price_is_draft, r.estimate_total_kurus,
    r.quote_total_kurus, r.scheduled_date, r.completed_on, r.payment_received_on, r.payment_amount_kurus,
    r.payment_method, r.cancel_reason, r.cancelled_by_role,
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

-- Ops: edits a catalogue row (price, minimum fee, VAT, draft flag, season,
-- recommendation rule, active).
create function public.ops_update_service_type(
  p_id uuid,
  p_price_per_donum_kurus bigint,
  p_minimum_fee_kurus bigint,
  p_vat_rate_bp integer,
  p_price_is_draft boolean,
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
  if p_price_per_donum_kurus is null or p_price_per_donum_kurus <= 0 or p_price_per_donum_kurus > 10000000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'price';
  end if;
  if p_minimum_fee_kurus is null or p_minimum_fee_kurus < 0 or p_minimum_fee_kurus > 10000000000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'minimum_fee';
  end if;
  if p_vat_rate_bp is null or p_vat_rate_bp not between 0 and 10000 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'vat_rate';
  end if;
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
  set price_per_donum_kurus = p_price_per_donum_kurus, minimum_fee_kurus = p_minimum_fee_kurus,
      vat_rate_bp = p_vat_rate_bp, price_is_draft = coalesce(p_price_is_draft, true),
      season_start_month = p_season_start_month, season_start_day = p_season_start_day,
      season_end_month = p_season_end_month, season_end_day = p_season_end_day,
      recommend_from_weed_height = p_recommend_from_weed_height,
      observation_max_age_days = p_observation_max_age_days, active = coalesce(p_active, x.active),
      updated_by = (select auth.uid())
  where x.id = t.id;
  perform private.audit(t.org_id, (select auth.uid()), 'ops', 'service_type.update', 'service_type', t.id,
    jsonb_build_object(
      'price_per_donum_kurus', p_price_per_donum_kurus, 'minimum_fee_kurus', p_minimum_fee_kurus,
      'vat_rate_bp', p_vat_rate_bp, 'price_is_draft', p_price_is_draft, 'active', p_active,
      'season', format('%s-%s..%s-%s', p_season_start_month, p_season_start_day, p_season_end_month, p_season_end_day)));
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
revoke all on function private.touch_robot_note() from public;
revoke all on function private.services_enabled(uuid) from public;
revoke all on function private.service_in_season(public.service_type, date) from public;
revoke all on function private.service_season_start(public.service_type, date) from public;
revoke all on function private.service_season_end(public.service_type, date) from public;
revoke all on function private.parcel_service_area(uuid) from public;
revoke all on function private.service_quote(numeric, bigint, bigint, integer) from public;
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
    'public.customer_request_service(uuid, uuid, public.service_window, text, text)',
    'public.customer_cancel_service_request(uuid, text)',
    'public.ops_service_requests(public.service_request_status, uuid, integer)',
    'public.ops_schedule_service_request(uuid, date, bigint, text)',
    'public.ops_add_service_photo(uuid, text, text, bigint, text)',
    'public.ops_link_service_photo(uuid, uuid, text)',
    'public.ops_unlink_service_photo(uuid, uuid, text)',
    'public.ops_complete_service_request(uuid, date, text)',
    'public.ops_cancel_service_request(uuid, text)',
    'public.ops_record_service_payment(uuid, bigint, text, date)',
    'public.ops_update_service_type(uuid, bigint, bigint, integer, boolean, smallint, smallint, smallint, smallint, text, integer, boolean)',
    'public.ops_service_demand()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed: weed mowing for the orgs that exist now, with a draft price
-- (docs/MVP.md Module 6: 375 TL + VAT per dönüm, minimum 2,500 TL + VAT, one
-- day's wage; season 1 March - 30 June). Fresh databases get it from
-- seed.sql; the demo loader adds it to the demo org.
-- ---------------------------------------------------------------------------

insert into public.service_type (
  org_id, code, name, description, operation_kind, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp,
  price_is_draft, season_start_month, season_start_day, season_end_month, season_end_day,
  recommend_from_weed_height, observation_max_age_days, sort_order
)
select o.id, 'weed_mowing', 'Yabani ot biçme',
  'orchadOS ot biçme hizmeti: parseldeki yabani otlar motorlu tırpanla biçilir. Öncesi ve sonrası fotoğrafları parsel kaydına eklenir.',
  'mowing', 37500, 250000, 2000, true, 3, 1, 6, 30, 'medium', 60, 10
from public.org o
where not private.is_demo_org(o.id)
on conflict (org_id, code) do nothing;
