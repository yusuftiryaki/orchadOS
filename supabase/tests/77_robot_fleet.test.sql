-- Robot fleet groundwork (IP15, docs/MVP.md Module 6; docs/veri-modeli.md
-- "Robot filosu"): the robot_model lookup seeded with MARABA-I and its RLS,
-- the models of a service, price resolution per (service, robot model) with
-- the any-robot fallback, the chosen model on a request, the performer of a
-- mowing job (robot by default, ops sets crew or robot), the ops queue.
-- Seed: org b0..01, ops a0..05, owner a0..01 of parcel c0..01, weed_mowing
-- 91500000-..01 (unpriced; launch list v1 91200000-..0101, VAT 20 %),
-- MARABA-I 91600000-..01. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id uuid) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlstate || ' ' || sqlerrm || coalesce(' / ' || nullif(v_detail, ''), '');
end;
$$;
create temporary table ids (k text primary key, v uuid) on commit drop;
grant select, insert, update on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v from ids where k = p_k $$;
create temporary table tday on commit drop as select private.istanbul_today() as d;
grant select on tday to authenticated;
create function pg_temp.today() returns date language sql stable as $$ select d from tday $$;
create temporary table terms on commit drop as select (private.legal_text_current('service_terms')).version as v;
grant select on terms to authenticated;
create function pg_temp.terms() returns text language sql stable as $$ select v from terms $$;

-- Weed mowing in season around today.
do $$
declare
  v_from date := private.istanbul_today() - 10;
  v_to date := private.istanbul_today() + 10;
begin
  if extract(month from v_from) = 2 and extract(day from v_from) = 29 then v_from := v_from - 1; end if;
  if extract(month from v_to) = 2 and extract(day from v_to) = 29 then v_to := v_to + 1; end if;
  update public.service_type_season set
    season_start_month = extract(month from v_from), season_start_day = extract(day from v_from),
    season_end_month = extract(month from v_to), season_end_day = extract(day from v_to)
  where service_type_id = '91500000-0000-4000-8000-000000000001';
end;
$$;

-- Ops publishes a list (copy of p_from) with the given service items, valid
-- from p_valid_from. Ends as postgres.
create function pg_temp.publish_items(p_from uuid, p_items jsonb, p_valid_from date)
returns uuid language plpgsql
as $$
declare
  v_id uuid;
begin
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  set local role authenticated;
  v_id := public.ops_create_price_list_draft('b0000000-0000-4000-8000-000000000001', p_from);
  perform public.ops_save_price_list_service_items(v_id, p_items);
  reset role;
  update public.price_list set valid_from = p_valid_from where id = v_id;
  set local role authenticated;
  perform public.ops_publish_price_list(v_id);
  reset role;
  return v_id;
end;
$$;

-- The price weed_mowing resolves to today for a model, as text.
create function pg_temp.price_for(p_model uuid) returns text language sql stable
as $$
  select row(sp.price_list_version, sp.unit_price_kurus, sp.minimum_fee_kurus)::text
  from public.service_type t left join lateral private.service_price(t, pg_temp.today(), p_model) sp on true
  where t.id = '91500000-0000-4000-8000-000000000001'
$$;

-- ---------------------------------------------------------------------------
-- Robot models: seed and RLS
-- ---------------------------------------------------------------------------

select is(
  (select row(code, name, operator_org_id, short_description, cardinality(capabilities), image_path, active)::text
   from public.robot_model where id = '91600000-0000-4000-8000-000000000001'),
  row('maraba_i', 'MARABA-I', null::uuid, 'orchadOS tarama kitini taşıyan otonom bahçe robotu', 5,
      '/robots/maraba-dijital-ikiz.jpg', true)::text,
  'seed: MARABA-I, operated by orchadOS, five capabilities, representative image');
select is((select capabilities[1] from public.robot_model where code = 'maraba_i'),
  'RTK GNSS ile santimetre konum ve otonom sürüş', 'seed: capabilities in display order');
select is(
  (select array_agg(robot_model_id::text) from public.service_type_robot_model
   where service_type_id = '91500000-0000-4000-8000-000000000001'),
  array['91600000-0000-4000-8000-000000000001'], 'seed: MARABA-I can do weed mowing');
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.robot_model'::regclass and tgname = 'zz_demo_read_only')
  and exists (select 1 from pg_trigger where tgrelid = 'public.service_type_robot_model'::regclass
              and tgname = 'zz_demo_read_only'),
  'demo write guard on both new tables');

-- A second model for price resolution, able to mow; a third that cannot.
insert into public.robot_model (id, code, name, short_description, capabilities, sort_order) values
  ('91600000-0000-4000-8000-0000000000aa', 'test_bot', 'TEST-BOT', 'Test robotu', '{}', 20),
  ('91600000-0000-4000-8000-0000000000bb', 'idle_bot', 'IDLE-BOT', 'Biçmeyen robot', '{}', 30);
insert into public.service_type_robot_model (org_id, service_type_id, robot_model_id, sort_order)
values ('b0000000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000001',
  '91600000-0000-4000-8000-0000000000aa', 20);

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::integer from public.robot_model), 3, 'RLS: a signed-in owner reads every robot model');
select is((select count(*)::integer from public.service_type_robot_model), 2,
  'RLS: the owner reads the models of the catalogue of their parcel''s org');
select is(pg_temp.error_of($$insert into public.robot_model (code, name, short_description) values ('x_bot', 'X', 'x')$$),
  '42501 permission denied for table robot_model', 'RLS: owners do not write robot models');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$update public.robot_model set name = 'Y' where code = 'maraba_i'$$),
  '42501 permission denied for table robot_model', 'RLS: ops does not write robot models either (migrations only)');
select is(pg_temp.error_of(format($$insert into public.service_type_robot_model (org_id, service_type_id, robot_model_id)
  values (%L, %L, %L)$$, 'b0000000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000001',
  '91600000-0000-4000-8000-0000000000bb')),
  '42501 permission denied for table service_type_robot_model', 'RLS: the service models are written by migrations');
reset role;
set local role anon;
select is(pg_temp.error_of($$select count(*) from public.robot_model$$),
  '42501 permission denied for table robot_model', 'RLS: not readable without signing in');
reset role;

-- ---------------------------------------------------------------------------
-- Price resolution: exact model, any-robot fallback, none
-- ---------------------------------------------------------------------------

select is(pg_temp.price_for('91600000-0000-4000-8000-000000000001'), '(,,)', 'price: none seeded (unpriced)');

-- v2: an any-robot price and a MARABA-I price.
insert into ids select 'v2', pg_temp.publish_items('91200000-0000-4000-8000-000000000101', jsonb_build_array(
  jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001', 'unit_price_kurus', 37500,
    'minimum_fee_kurus', 250000),
  jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001',
    'robot_model_id', '91600000-0000-4000-8000-000000000001', 'unit_price_kurus', 50000,
    'minimum_fee_kurus', 300000)), pg_temp.today());
select is(pg_temp.price_for('91600000-0000-4000-8000-000000000001'), '(2,50000,300000)',
  'price: the exact model''s row wins');
select is(pg_temp.price_for('91600000-0000-4000-8000-0000000000aa'), '(2,37500,250000)',
  'price: a model without its own row falls back to the any-robot row');
select is(pg_temp.price_for(null), '(2,37500,250000)', 'price: no model, the any-robot row');

-- v3: only a MARABA-I price.
insert into ids select 'v3', pg_temp.publish_items(pg_temp.id('v2'), jsonb_build_array(
  jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001',
    'robot_model_id', '91600000-0000-4000-8000-000000000001', 'unit_price_kurus', 45000)), pg_temp.today());
select is(pg_temp.price_for('91600000-0000-4000-8000-0000000000aa'), '(,,)',
  'price: neither an own row nor an any-robot row, unpriced');
select is(
  (select count(*)::integer from public.price_list_service_item where price_list_id = pg_temp.id('v3')), 1,
  'price: a draft copy keeps the per-model rows');

-- Saving: a model that cannot do the service, and a duplicate pair.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
insert into ids select 'draft', public.ops_create_price_list_draft('b0000000-0000-4000-8000-000000000001', pg_temp.id('v2'));
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L, %L)$$, pg_temp.id('draft'),
  jsonb_build_array(jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001',
    'robot_model_id', '91600000-0000-4000-8000-0000000000bb', 'unit_price_kurus', 1000)))),
  '22023 invalid_input / robot_model_id', 'save: only a model that can do the service');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L, %L)$$, pg_temp.id('draft'),
  jsonb_build_array(
    jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001', 'unit_price_kurus', 1000),
    jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001', 'unit_price_kurus', 2000)))),
  '22023 invalid_input / service_type_id', 'save: one any-robot row per service');
reset role;

-- ---------------------------------------------------------------------------
-- Request form and request
-- ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select string_agg(row(code, is_default, price_per_donum_kurus)::text, ' ' order by code)
   from public.service_robot_offers('c0000000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000001')),
  '(maraba_i,t,45000) (test_bot,f,)',
  'form: the models of the service, MARABA-I by default, each with its own price');
select is(
  (select row(robot_model_code, robot_model_name, price_per_donum_kurus)::text from public.service_offers()),
  '(maraba_i,MARABA-I,45000)', 'offers: the card names and prices the default model');
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, pg_temp.terms(), false,
  '91600000-0000-4000-8000-0000000000bb')$$),
  '22023 invalid_input / robot_model', 'request: only a model that can do the service');
insert into ids select 'r1', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, pg_temp.terms(), true,
  '91600000-0000-4000-8000-0000000000aa');
select is(
  (select row(robot_model_id, price_per_donum_kurus)::text from public.service_request where id = pg_temp.id('r1')),
  '(91600000-0000-4000-8000-0000000000aa,)', 'request: stores the chosen model and its (none) price');
select is((select robot_model_code from public.service_offers()), 'test_bot',
  'offers: an open request shows its own model');
reset role;
-- Without a model: the default.
update public.service_request set status = 'cancelled', cancelled_at = now(), cancelled_by_role = 'owner'
where id = pg_temp.id('r1');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
insert into ids select 'r2', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, pg_temp.terms(), true);
select is(
  (select row(robot_model_id, price_per_donum_kurus)::text from public.service_request where id = pg_temp.id('r2')),
  '(91600000-0000-4000-8000-000000000001,45000)', 'request: without a choice, the default model and its price');
reset role;

-- ---------------------------------------------------------------------------
-- Performer: robot by default for mowing, ops may say crew
-- ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select lives_ok(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r2'), pg_temp.today() + 1), 'schedule: ops plans the job');
reset role;
select is((select s.performer::text from public.service_request r join public.session s on s.id = r.session_id
  where r.id = pg_temp.id('r2')), 'robot', 'schedule: the mowing session is done by the robot by default');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select public.ops_add_service_photo(pg_temp.id('r2'), 'before', repeat('a', 64), 1000, 'image/jpeg');
select public.ops_add_service_photo(pg_temp.id('r2'), 'after', repeat('b', 64), 1000, 'image/jpeg');
select is(
  (select row(robot_model_name, performer)::text from public.ops_service_requests() where id = pg_temp.id('r2')),
  '(MARABA-I,robot)', 'queue: ops sees the chosen model and the planned performer');
select lives_ok(format($$select public.ops_complete_service_request(%L, %L, 'Dik köşeyi ekip bitirdi', 'crew')$$,
  pg_temp.id('r2'), pg_temp.today()), 'complete: ops records that the crew did the job');
select is(
  (select row(robot_model_name, performer)::text from public.ops_service_requests() where id = pg_temp.id('r2')),
  '(MARABA-I,crew)', 'queue: the recorded performer');
reset role;
select is(
  (select row(o.performer, s.performer, o.details ->> 'robot_model')::text
   from public.service_request r
   join public.operation o on o.id = r.operation_id
   join public.session s on s.id = r.session_id
   where r.id = pg_temp.id('r2')),
  '(crew,crew,maraba_i)', 'complete: the operation and the session carry the performer ops set');

select * from finish();
rollback;
