-- IP15 / 3: robot fleet groundwork (docs/MVP.md, Module 6; docs/vizyon.md;
-- docs/veri-modeli.md, "Robot filosu"). Owner decision of 2 November 2026:
-- the mowing service is presented as done by an autonomous robot (MARABA-I)
-- and orchadOS grows into a robot fleet <-> orchard owner matching platform:
-- the owner picks the robot, the price depends on the robot's capabilities.
--
-- 1. public.robot_model: global lookup of robot models (code, name, operator
--    org or null for orchadOS itself, short description, capabilities, image
--    path, active). Seeded with MARABA-I. Read by every signed-in user,
--    written by migrations only.
-- 2. public.service_type_robot_model: which models can do which service of
--    an org's catalogue (read like service_type). Seeded for weed_mowing.
-- 3. public.service_request.robot_model_id: the model the owner chose (null
--    when the service has no robot model). customer_request_service takes
--    p_robot_model_id; null picks the service's first active model.
-- 4. public.price_list_service_item.robot_model_id: a service price per
--    (service, robot model); null means "any robot". private.service_price
--    prefers the exact model's row and falls back to the null row. Still no
--    numeric price seeded (the portal says "Fiyat teklifle bildirilir").
-- 5. public.service_robot_offers(parcel, service): the models of a service
--    with their own estimate for the request form; service_offers prices the
--    default model; ops_service_requests shows the model and the performer.
-- 6. Internal truth: the job session and the operation record performer
--    'robot' by default for mowing jobs; ops sets crew or robot when
--    completing (ops_complete_service_request p_performer). Never shown to
--    the owner.
--
-- Error codes as 20261106100100_service_layer.sql; invalid_input detail
-- robot_model when the model cannot do the service.

-- ---------------------------------------------------------------------------
-- 1. Robot models
-- ---------------------------------------------------------------------------

create table public.robot_model (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  -- The org that operates the robots of this model; null: orchadOS itself.
  operator_org_id uuid references public.org (id) on delete set null,
  short_description text not null check (length(btrim(short_description)) between 1 and 200),
  -- Capabilities shown to the owner, one sentence each, in display order.
  capabilities text[] not null default '{}' check (cardinality(capabilities) <= 12),
  -- Public path of a representative image (apps/web/public), or null.
  image_path text check (image_path ~ '^/[A-Za-z0-9/_.-]+$'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.robot_model is
  'Robot models of the fleet (IP15): name, operator, capabilities, image. Global lookup; written by migrations.';
create index robot_model_operator_idx on public.robot_model (operator_org_id);
alter table public.robot_model enable row level security;
select private.attach_demo_guard('public.robot_model');
create trigger robot_model_touch before update on public.robot_model
for each row execute function private.touch_updated_at();

insert into public.robot_model (id, code, name, operator_org_id, short_description, capabilities, image_path,
  active, sort_order)
values (
  '91600000-0000-4000-8000-000000000001', 'maraba_i', 'MARABA-I', null,
  'orchadOS tarama kitini taşıyan otonom bahçe robotu',
  array[
    'RTK GNSS ile santimetre konum ve otonom sürüş',
    'Misinalı biçme kafası',
    '360° kamerayla iş öncesi ve sonrası kayıt',
    'Acil stop ve çarpma tamponu',
    '36 V elektrikli, sessiz ve emisyonsuz'
  ],
  '/robots/maraba-dijital-ikiz.jpg', true, 10
);

-- ---------------------------------------------------------------------------
-- 2. Which models can do which service
-- ---------------------------------------------------------------------------

create table public.service_type_robot_model (
  org_id uuid not null,
  service_type_id uuid not null,
  robot_model_id uuid not null references public.robot_model (id),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (service_type_id, robot_model_id),
  foreign key (service_type_id, org_id) references public.service_type (id, org_id) on delete cascade
);
comment on table public.service_type_robot_model is
  'Robot models that can do a service of an org''s catalogue (IP15). Written by migrations, seed and the demo loader.';
create index service_type_robot_model_org_idx on public.service_type_robot_model (org_id);
create index service_type_robot_model_model_idx on public.service_type_robot_model (robot_model_id);
alter table public.service_type_robot_model enable row level security;
select private.attach_demo_guard('public.service_type_robot_model');

insert into public.service_type_robot_model (org_id, service_type_id, robot_model_id, sort_order)
select t.org_id, t.id, '91600000-0000-4000-8000-000000000001', 10
from public.service_type t
where t.code = 'weed_mowing'
on conflict do nothing;

revoke all on public.robot_model, public.service_type_robot_model from anon, authenticated;
grant all on public.robot_model, public.service_type_robot_model to service_role;
-- The catalogue is shown on the portal and the ops screens.
create policy robot_model_select on public.robot_model for select to authenticated using (true);
grant select on public.robot_model to authenticated;
create policy service_type_robot_model_select on public.service_type_robot_model for select to authenticated
  using (org_id in (select authz.user_org_ids()) or org_id in (select authz.user_parcel_org_ids()));
grant select on public.service_type_robot_model to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The chosen model on a request
-- ---------------------------------------------------------------------------

alter table public.service_request
  add column robot_model_id uuid references public.robot_model (id);
comment on column public.service_request.robot_model_id is
  'IP15: the robot model the owner chose for the job (null when the service has no robot model).';
create index service_request_robot_model_idx on public.service_request (robot_model_id);
grant select (robot_model_id) on public.service_request to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Prices per (service, robot model); null model: any robot
-- ---------------------------------------------------------------------------

alter table public.price_list_service_item
  add column robot_model_id uuid references public.robot_model (id);
comment on column public.price_list_service_item.robot_model_id is
  'IP15: the robot model this price is for; null: any robot (the fallback).';
alter table public.price_list_service_item
  drop constraint price_list_service_item_price_list_id_service_type_id_key;
alter table public.price_list_service_item
  add constraint price_list_service_item_list_service_model_key
  unique nulls not distinct (price_list_id, service_type_id, robot_model_id);
create index price_list_service_item_robot_model_idx on public.price_list_service_item (robot_model_id);

-- The default model of a service: its first active model, or null.
create function private.service_default_robot_model(p_service_type_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.service_type_robot_model sm
  join public.robot_model m on m.id = sm.robot_model_id and m.active
  where sm.service_type_id = p_service_type_id
  order by sm.sort_order, m.sort_order, m.code
  limit 1;
$$;
comment on function private.service_default_robot_model(uuid) is
  'IP15: the first active robot model that can do the service, or null.';

-- The price of a service for a robot model in the published price list in
-- force on p_on: the model's own row, else the "any robot" row, else all null.
create function private.service_price(
  t public.service_type,
  p_on date,
  p_robot_model_id uuid,
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
    and (i.robot_model_id is null or i.robot_model_id = p_robot_model_id)
  where l.id is not null
  order by i.robot_model_id nulls last
  limit 1;
$$;
comment on function private.service_price(public.service_type, date, uuid) is
  'IP15: price per dönüm, minimum fee and VAT of a service for a robot model (exact model first, then the any-robot row) from the published price list in force; null when unpriced.';

-- The old two-argument form: the any-robot price.
create or replace function private.service_price(
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
  select * from private.service_price(t, p_on, null::uuid);
$$;

-- ---------------------------------------------------------------------------
-- 5. Portal and ops functions
-- ---------------------------------------------------------------------------

-- Portal cards: as before; the price is the default robot model's and the
-- model is returned.
drop function public.service_offers(uuid);
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
  open_request_number text,
  robot_model_id uuid,
  robot_model_code text,
  robot_model_name text
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
      when o.id is not null and not (o.status = 'pre_request' and private.service_in_season(ts, v_today)) then 'open'
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
    o.id, o.status::text, o.number,
    -- The open request's model, else the service's default model.
    m.id, m.code, m.name
  from parcels p
  join public.service_type t on t.org_id = p.org_id and t.active
  cross join lateral private.service_type_for_species(t, p.species) ts
  cross join lateral private.parcel_service_area(p.id) a
  left join lateral (
    select r.id, r.status, r.number, r.robot_model_id from public.service_request r
    where r.parcel_id = p.id and r.service_type_id = t.id
      and r.status in ('pre_request', 'requested', 'scheduled')
    limit 1
  ) o on true
  left join public.robot_model m on m.id = coalesce(o.robot_model_id, private.service_default_robot_model(t.id))
  left join lateral private.service_price(t, v_today, m.id) sp on true
  cross join lateral private.service_quote(a.area_m2, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp) q
  left join lateral private.latest_weed_observation(p.id) w on true
  where a.area_m2 is not null
  order by p.name, p.id, t.sort_order, t.code;
end;
$$;
comment on function public.service_offers(uuid) is
  'IP15 portal: service cards per owned parcel (state recommended / available / pre_request / open; season of the parcel''s species; estimate for the default robot model from the published price list, null when unpriced; latest weed observation).';

-- Request form: the robot models that can do a service on a parcel, each
-- with its own estimate (null when unpriced). Owners of the parcel and staff
-- of its org.
create function public.service_robot_offers(p_parcel_id uuid, p_service_type_id uuid)
returns table (
  robot_model_id uuid,
  code text,
  name text,
  short_description text,
  capabilities text[],
  image_path text,
  is_default boolean,
  price_list_version integer,
  price_per_donum_kurus bigint,
  minimum_fee_kurus bigint,
  vat_rate_bp integer,
  estimate_subtotal_kurus bigint,
  estimate_vat_kurus bigint,
  estimate_total_kurus bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.parcel;
  t public.service_type;
  v_today date := private.istanbul_today();
begin
  select * into p from public.parcel x where x.id = p_parcel_id;
  if not found or not (
    p.id in (select authz.user_parcel_ids('{owner}')) or p.org_id in (select authz.user_org_ids())
  ) then
    return;
  end if;
  select * into t from public.service_type x where x.id = p_service_type_id and x.org_id = p.org_id;
  if not found then
    return;
  end if;
  return query
  select m.id, m.code, m.name, m.short_description, m.capabilities, m.image_path,
    m.id is not distinct from private.service_default_robot_model(t.id),
    sp.price_list_version, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp,
    q.subtotal_kurus, q.vat_kurus, q.total_kurus
  from public.service_type_robot_model sm
  join public.robot_model m on m.id = sm.robot_model_id and m.active
  cross join lateral private.parcel_service_area(p.id) a
  left join lateral private.service_price(t, v_today, m.id) sp on true
  cross join lateral private.service_quote(a.area_m2, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp) q
  where sm.service_type_id = t.id
  order by sm.sort_order, m.sort_order, m.code;
end;
$$;
comment on function public.service_robot_offers(uuid, uuid) is
  'IP15 request form: robot models that can do the service, with the estimate of each (exact-model price, else any-robot price, else none).';

-- Owner request: as before, with the chosen robot model (null: the default
-- model). The quote is the chosen model's.
drop function public.customer_request_service(uuid, uuid, public.service_window, text, text, boolean);
create function public.customer_request_service(
  p_parcel_id uuid,
  p_service_type_id uuid,
  p_window public.service_window,
  p_note text,
  p_terms_version text,
  p_early_performance boolean default false,
  p_robot_model_id uuid default null
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
  pr public.service_request;
  v_today date := private.istanbul_today();
  v_in_season boolean;
  v_model uuid;
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
  -- The robot model: one that can do this service and is active.
  if p_robot_model_id is null then
    v_model := private.service_default_robot_model(t.id);
  elsif exists (
    select 1 from public.service_type_robot_model sm
    join public.robot_model m on m.id = sm.robot_model_id and m.active
    where sm.service_type_id = t.id and sm.robot_model_id = p_robot_model_id
  ) then
    v_model := p_robot_model_id;
  else
    raise exception 'invalid_input' using errcode = '22023', detail = 'robot_model';
  end if;
  select * into a from private.parcel_service_area(p.id) x;
  if a.area_m2 is null then
    raise exception 'area_unknown' using errcode = 'P0001';
  end if;
  t := private.service_type_for_species(t, p.species);
  v_in_season := private.service_in_season(t, v_today);
  if exists (
    select 1 from public.service_request x
    where x.parcel_id = p.id and x.service_type_id = t.id
      and (x.status in ('requested', 'scheduled') or (x.status = 'pre_request' and not v_in_season))
  ) then
    raise exception 'request_open' using errcode = 'P0001';
  end if;
  for pr in
    update public.service_request x
    set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'owner',
        cancel_reason = 'Talebe çevrildi'
    where x.parcel_id = p.id and x.service_type_id = t.id and x.status = 'pre_request'
    returning *
  loop
    perform private.log_service_event(pr, 'pre_request', 'owner', 'Talebe çevrildi');
  end loop;
  select * into sp from private.service_price(t, v_today, v_model) x;
  select * into q from private.service_quote(a.area_m2, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp) x;
  select * into w from private.latest_weed_observation(p.id) x;

  insert into public.service_request (
    org_id, parcel_id, service_type_id, number, status, requested_by, season_year, preferred_window,
    customer_note, terms_version, early_performance_requested, recommended_measurement_id, recommended_weed_height,
    area_m2, area_source, price_list_id, price_list_version, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp,
    estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus, robot_model_id
  ) values (
    p.org_id, p.id, t.id, private.next_service_request_number(p.org_id),
    case when v_in_season then 'requested' else 'pre_request' end::public.service_request_status,
    (select auth.uid()), extract(year from private.service_season_start(t, v_today))::integer,
    coalesce(p_window, 'flexible'), nullif(btrim(p_note), ''), btrim(p_terms_version), coalesce(p_early_performance, false),
    case when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then w.measurement_id end,
    case when private.service_recommended(t, p.id, w.weed_height, w.observed_at, v_today) then w.weed_height end,
    a.area_m2, a.area_source, sp.price_list_id, sp.price_list_version, sp.unit_price_kurus, sp.minimum_fee_kurus,
    sp.vat_rate_bp, q.subtotal_kurus, q.vat_kurus, q.total_kurus, v_model
  )
  returning * into r;
  perform private.log_service_event(r, null, 'owner', null);
  perform private.audit(r.org_id, (select auth.uid()), 'customer', 'service_request.create', 'service_request', r.id,
    jsonb_build_object('status', r.status, 'service', t.code, 'season_year', r.season_year,
      'terms_version', r.terms_version, 'early_performance', r.early_performance_requested,
      'price_list_version', r.price_list_version, 'estimate_total_kurus', r.estimate_total_kurus,
      'robot_model', (select m.code from public.robot_model m where m.id = v_model)));
  return r.id;
exception
  when unique_violation then
    raise exception 'request_open' using errcode = 'P0001';
end;
$$;
comment on function public.customer_request_service(uuid, uuid, public.service_window, text, text, boolean, uuid) is
  'IP15 owner: requests a service for a parcel (pre_request out of season) with a robot model (null: the default); quote and price list version frozen with service-v1 for that model (none when unpriced).';

-- Ops queue: as before, with the robot model and the performer of the job.
drop function public.ops_service_requests(public.service_request_status, uuid, integer);
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
  created_at timestamptz,
  robot_model_id uuid,
  robot_model_code text,
  robot_model_name text,
  performer text
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
    r.requested_by, op.full_name, op.phone, r.created_at,
    m.id, m.code, m.name,
    coalesce(o.performer, s.performer)::text
  from public.service_request r
  join public.parcel p on p.id = r.parcel_id
  join public.service_type t on t.id = r.service_type_id
  left join public.robot_model m on m.id = r.robot_model_id
  left join public.operation o on o.id = r.operation_id
  left join public.session s on s.id = r.session_id
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
  'IP15 ops: service request queue with parcel, requester contact, photo counts, robot model and performer.';

-- ---------------------------------------------------------------------------
-- 6. Performer: robot by default for mowing jobs
-- ---------------------------------------------------------------------------

-- The default performer of a service job: robot for mowing, crew otherwise.
create function private.service_default_performer(p_kind public.operation_kind)
returns public.performer_kind
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'mowing' then 'robot' else 'crew' end::public.performer_kind;
$$;

-- Ops scheduling: as before; the job session takes the default performer.
create or replace function public.ops_schedule_service_request(
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
  v_old_date date;
begin
  perform private.assert_not_demo();
  r := private.service_request_for_ops(p_id);
  perform 1 from public.service_request x where x.id = r.id for update;
  select * into r from public.service_request x where x.id = p_id;
  -- A pre-request is not an offer (H37): the owner turns it into a request first.
  if r.status not in ('requested', 'scheduled') then
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
  -- H37: never above what the owner accepted, nor above the amount already
  -- confirmed when the day moves.
  if p_quote_total_kurus > r.estimate_total_kurus
     or (r.status = 'scheduled' and p_quote_total_kurus > r.quote_total_kurus) then
    raise exception 'quote_above_estimate' using errcode = 'P0001';
  end if;
  -- A moved day is at the earliest tomorrow and is notified again, so the
  -- owner keeps the free cancellation until the day before.
  if r.status = 'scheduled' and p_scheduled_date is distinct from r.scheduled_date
     and p_scheduled_date <= private.istanbul_today() then
    raise exception 'invalid_input' using errcode = '22023', detail = 'scheduled_date';
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
  v_old_date := r.scheduled_date;
  if v_session is null then
    insert into public.session (org_id, parcel_id, kind, performer, status, planned_date, notes)
    values (r.org_id, r.parcel_id,
      case t.operation_kind when 'mowing' then 'mowing' when 'tillage' then 'tillage' when 'spraying' then 'spraying'
        else 'manual_entry' end::public.session_kind,
      private.service_default_performer(t.operation_kind), 'planned', p_scheduled_date, 'Hizmet işi ' || r.number)
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
  -- One message per request and template (notification_ref_once on the
  -- request id); a moved date is notified again under a key of its own.
  if v_from <> 'scheduled' then
    perform private.enqueue_service_notification('service_scheduled', r.org_id, r.parcel_id, r.id, r.number,
      p_scheduled_date, '/portal/hizmetler/' || r.id::text);
  elsif p_scheduled_date is distinct from v_old_date then
    perform private.enqueue_service_notification('service_scheduled', r.org_id, r.parcel_id, gen_random_uuid(),
      r.number, p_scheduled_date, '/portal/hizmetler/' || r.id::text);
  end if;
end;
$$;

-- Ops: the job is done; as before, and ops says who did it (null: the
-- default, robot for mowing). The session takes the same performer.
drop function public.ops_complete_service_request(uuid, date, text);
create function public.ops_complete_service_request(
  p_id uuid,
  p_done_on date,
  p_note text,
  p_performer public.performer_kind default null
)
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
  v_performer public.performer_kind;
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
  v_performer := coalesce(p_performer, private.service_default_performer(t.operation_kind));
  v_start := (p_done_on + time '08:00') at time zone 'Europe/Istanbul';
  insert into public.operation (org_id, parcel_id, session_id, kind, performer, performed_by, started_at, area_m2,
    details, notes)
  values (r.org_id, r.parcel_id, r.session_id, t.operation_kind, v_performer, null, v_start, r.area_m2,
    jsonb_build_object('service_request_id', r.id, 'service_request_number', r.number, 'service_code', t.code,
      'by', 'orchados', 'robot_model', (select m.code from public.robot_model m where m.id = r.robot_model_id)),
    nullif(btrim(p_note), ''))
  returning id into v_op;
  update public.session s
  set status = 'captured', started_at = coalesce(s.started_at, v_start), planned_date = p_done_on,
      performer = v_performer
  where s.id = r.session_id;
  update public.service_request x
  set status = 'done', completed_on = p_done_on, operation_id = v_op,
      ops_note = coalesce(nullif(btrim(p_note), ''), x.ops_note)
  where x.id = r.id
  returning * into r;
  perform private.log_service_event(r, 'scheduled', 'ops', null);
  perform private.audit(r.org_id, (select auth.uid()), 'ops', 'service_request.complete', 'service_request', r.id,
    jsonb_build_object('completed_on', p_done_on, 'operation_id', v_op, 'performer', v_performer));
  perform private.enqueue_service_notification('service_completed', r.org_id, r.parcel_id, r.id, r.number,
    p_done_on, '/portal/hizmetler/' || r.id::text);
end;
$$;
comment on function public.ops_complete_service_request(uuid, date, text, public.performer_kind) is
  'IP15 ops: marks the job done (before and after photos required), writes the operation row with the performer (default robot for mowing).';

-- Ops price lists: items may name a robot model (null: any robot).
-- p_items: [{service_type_id, robot_model_id?, unit_price_kurus, minimum_fee_kurus?}].
create or replace function public.ops_save_price_list_service_items(p_price_list_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.price_list;
  v_item jsonb;
  v_service uuid;
  v_model uuid;
  v_unit numeric;
  v_min numeric;
  v_seen text[] := '{}';
  v_key text;
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
    if v_service is null
       or not exists (select 1 from public.service_type t where t.id = v_service and t.org_id = l.org_id) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service_type_id';
    end if;
    begin
      v_model := nullif(v_item ->> 'robot_model_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_input' using errcode = '22023', detail = 'robot_model_id';
    end;
    if v_model is not null and not exists (
      select 1 from public.service_type_robot_model sm
      where sm.service_type_id = v_service and sm.robot_model_id = v_model
    ) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'robot_model_id';
    end if;
    v_key := v_service::text || '/' || coalesce(v_model::text, '');
    if v_key = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023', detail = 'service_type_id';
    end if;
    v_seen := v_seen || v_key;
    v_unit := private.input_number(v_item, 'unit_price_kurus', true);
    v_min := coalesce(private.input_number(v_item, 'minimum_fee_kurus'), 0);
    if v_unit <> trunc(v_unit) or v_unit <= 0 or v_unit > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'unit_price_kurus';
    end if;
    if v_min <> trunc(v_min) or v_min < 0 or v_min > 1e12 then
      raise exception 'invalid_input' using errcode = '22023', detail = 'minimum_fee_kurus';
    end if;
    insert into public.price_list_service_item (org_id, price_list_id, service_type_id, robot_model_id,
      unit_price_kurus, minimum_fee_kurus)
    values (l.org_id, l.id, v_service, v_model, v_unit, v_min);
  end loop;
  perform private.audit(l.org_id, (select auth.uid()), 'ops', 'price_list.service_items_saved', 'price_list', l.id,
    jsonb_build_object('items', jsonb_array_length(p_items)));
end;
$$;
comment on function public.ops_save_price_list_service_items(uuid, jsonb) is
  'IP15 ops: saves the service prices (per dönüm, minimum fee; per robot model or any robot) of a price list draft.';

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
    insert into public.price_list_service_item (org_id, price_list_id, service_type_id, robot_model_id,
      unit_price_kurus, minimum_fee_kurus)
    select p_org_id, v_id, i.service_type_id, i.robot_model_id, i.unit_price_kurus, i.minimum_fee_kurus
    from public.price_list_service_item i where i.price_list_id = src.id;
  end if;
  perform private.audit(p_org_id, (select auth.uid()), 'ops', 'price_list.draft_created', 'price_list', v_id,
    jsonb_build_object('copy_from', p_copy_from_id));
  return v_id;
end;
$$;

-- The catalogue description no longer names the tool (owner decision of
-- 2 November 2026); only the seeded text is replaced, an edited one stays.
update public.service_type
set description = 'orchadOS ot biçme hizmeti: parseldeki yabani otları otonom robotumuz MARABA-I biçer. Öncesi ve sonrası fotoğrafları parsel kaydına eklenir.'
where code = 'weed_mowing'
  and description = 'orchadOS ot biçme hizmeti: parseldeki yabani otlar motorlu tırpanla biçilir. Öncesi ve sonrası fotoğrafları parsel kaydına eklenir.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function private.service_default_robot_model(uuid) from public;
revoke all on function private.service_price(public.service_type, date, uuid) from public;
revoke all on function private.service_default_performer(public.operation_kind) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.service_offers(uuid)',
    'public.service_robot_offers(uuid, uuid)',
    'public.customer_request_service(uuid, uuid, public.service_window, text, text, boolean, uuid)',
    'public.ops_service_requests(public.service_request_status, uuid, integer)',
    'public.ops_complete_service_request(uuid, date, text, public.performer_kind)',
    'public.ops_save_price_list_service_items(uuid, jsonb)',
    'public.ops_create_price_list_draft(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
