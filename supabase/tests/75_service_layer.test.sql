-- Service layer, weed mowing (IP15, docs/MVP.md Module 6): the weed_height
-- question, the quote rule service-v1, the season calendar (default and per
-- fruit species), the recommendation rule (observation + season; portal only,
-- no message), prices from the versioned price list (unpriced: no estimate,
-- ops enters the amount; quotes frozen with the list version), status
-- transitions (pre_request, requested, scheduled, done, cancelled) with
-- history, proof photos and their visibility, manual payment, notifications,
-- the switch, demand counts, RLS of requests and robot notes.
-- Seed: org b0..01 (services on), ops a0..05, field staff a0..03, owner a0..01
-- and viewer a0..02 of parcel c0..01 (antep_fistigi; boundary v2 ≈ 19 590.5
-- m²), catalogue row weed_mowing 91500000-..01 (1 March – 30 June for every
-- species, from medium) without a price: the published launch list v1
-- (91200000-..0101, VAT 20 %) has no service row. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(128);

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

-- Today, whatever the date the suite runs: a season window that contains it
-- and one that does not.
create temporary table tday on commit drop as select private.istanbul_today() as d;
grant select on tday to authenticated;
create function pg_temp.today() returns date language sql stable as $$ select d from tday $$;

-- Seasons around today (no 29 Feb: valid_month_day).
create function pg_temp.set_season(p_in boolean) returns void language plpgsql
as $$
declare
  v_from date := case when p_in then pg_temp.today() - 10 else pg_temp.today() + 40 end;
  v_to date := case when p_in then pg_temp.today() + 10 else pg_temp.today() + 80 end;
begin
  if extract(month from v_from) = 2 and extract(day from v_from) = 29 then v_from := v_from - 1; end if;
  if extract(month from v_to) = 2 and extract(day from v_to) = 29 then v_to := v_to + 1; end if;
  update public.service_type set
    season_start_month = extract(month from v_from), season_start_day = extract(day from v_from),
    season_end_month = extract(month from v_to), season_end_day = extract(day from v_to)
  where id = '91500000-0000-4000-8000-000000000001';
  -- The seed has a row per species; they follow the default here.
  update public.service_type_season set
    season_start_month = extract(month from v_from), season_start_day = extract(day from v_from),
    season_end_month = extract(month from v_to), season_end_day = extract(day from v_to)
  where service_type_id = '91500000-0000-4000-8000-000000000001';
end;
$$;

-- A day of the year that exists in every year (29 February -> 1 March).
create function pg_temp.safe_day(p_day date) returns date language sql immutable
as $$ select case when extract(month from p_day) = 2 and extract(day from p_day) = 29 then p_day + 1 else p_day end $$;

-- Ops: a published price list copied from p_from (packages and services),
-- with the given weed_mowing price (null: none) and validity date. Returns
-- its id. Runs as the ops user; ends as postgres.
create function pg_temp.publish_list(p_from uuid, p_unit bigint, p_min bigint, p_valid_from date)
returns uuid language plpgsql
as $$
declare
  v_id uuid;
begin
  perform pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
  set local role authenticated;
  v_id := public.ops_create_price_list_draft('b0000000-0000-4000-8000-000000000001', p_from);
  perform public.ops_save_price_list_service_items(v_id, case when p_unit is null then '[]'::jsonb else
    jsonb_build_array(jsonb_build_object('service_type_id', '91500000-0000-4000-8000-000000000001',
      'unit_price_kurus', p_unit, 'minimum_fee_kurus', p_min)) end);
  reset role;
  update public.price_list set valid_from = p_valid_from where id = v_id;
  set local role authenticated;
  perform public.ops_publish_price_list(v_id);
  reset role;
  return v_id;
end;
$$;

-- The price weed_mowing resolves to on p_day, as text.
create function pg_temp.price_on(p_day date) returns text language sql stable
as $$
  select row(sp.price_list_version, sp.unit_price_kurus, sp.minimum_fee_kurus, sp.vat_rate_bp)::text
  from public.service_type t left join lateral private.service_price(t, p_day) sp on true
  where t.id = '91500000-0000-4000-8000-000000000001'
$$;

-- A published periodic visit of the seed parcel with a weed_height answer.
create function pg_temp.published_visit_with_weeds(p_height text, p_days_ago integer) returns uuid language plpgsql
as $$
declare
  v_session uuid;
  v_at timestamptz := now() - make_interval(days => p_days_ago);
begin
  insert into public.session (org_id, parcel_id, kind, status, planned_date, started_at, methodology_version)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'periodic_scan',
          'in_review', v_at::date, v_at, 'methodology-v0.2')
  returning id into v_session;
  insert into public.measurement (org_id, parcel_id, metric_definition_id, value_category, method, method_version,
    source, session_id, measured_at)
  select 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', d.id, p_height,
         'field_question', 'spring-v0.2', 'staff', v_session, v_at
  from public.metric_definition d where d.code = 'weed_height';
  update public.session set status = 'published' where id = v_session;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- Metric, quote, season
-- ---------------------------------------------------------------------------

select is(
  (select row(value_type::text, categories, valid_seasons::text[], subject_kinds::text[], card_visibility::text)::text
   from public.metric_definition where code = 'weed_height'),
  row('category', '{short,medium,tall}'::text[], '{spring,summer}'::text[], '{parcel}'::text[], 'shown')::text,
  'weed_height: parcel-level category short / medium / tall in spring and summer');

select is((select row(q.*)::text from private.service_quote(20000, 37500, 250000, 2000) q),
  '(750000,150000,900000)', 'quote: 20 dönüm x 375 TL + 20 % VAT');
select is((select row(q.*)::text from private.service_quote(3000, 37500, 250000, 2000) q),
  '(250000,50000,300000)', 'quote: the minimum fee applies to a small parcel');
select is((select q.subtotal_kurus from private.service_quote(2050.4, 100000, 0, 2000) q),
  210000::bigint, 'quote: area in tenths of a dönüm, rounded up');
select is(pg_temp.error_of($$select private.service_quote(0, 37500, 0, 2000)$$),
  '22023 invalid_input / quote', 'quote: no area, no quote');
select is((select row(q.*)::text from private.service_quote(20000, null, null, 2000) q), '(,,)',
  'quote: an unpriced service has no estimate');
select is((select row(q.*)::text from private.service_quote(null, 37500, 250000, 2000) q), '(,,)',
  'quote: nor an unknown area');

select ok(private.service_in_season(t, '2027-03-01') and private.service_in_season(t, '2027-06-30')
          and not private.service_in_season(t, '2027-07-01') and not private.service_in_season(t, '2027-02-28'),
  'season: 1 March – 30 June inclusive')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';
select is(private.service_season_start(t, '2026-11-02'), '2027-03-01'::date,
  'season: out of season, the next window starts next March')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';
select is(private.service_season_start(t, '2027-05-10'), '2027-03-01'::date,
  'season: in season, the current window')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';

-- A window across the year end (November – February).
insert into public.service_type (org_id, code, name, operation_kind, season_start_month,
  season_start_day, season_end_month, season_end_day, active)
values ('b0000000-0000-4000-8000-000000000001', 'wrap_test', 'Kış işi', 'other', 11, 1, 2, 28, false);
select ok(
  private.service_in_season(w, '2026-12-31') and private.service_in_season(w, '2027-01-15')
  and not private.service_in_season(w, '2027-03-01')
  and private.service_season_start(w, '2027-01-15') = '2026-11-01'
  and private.service_season_end(w, '2026-11-01') = '2027-02-28',
  'season: a window may wrap the year end')
from public.service_type w where w.code = 'wrap_test';

-- ---------------------------------------------------------------------------
-- Recommendation rule
-- ---------------------------------------------------------------------------

select ok(
  private.service_recommended(t, 'c0000000-0000-4000-8000-000000000001', 'tall', '2027-04-20 08:00+03', '2027-05-01')
  and private.service_recommended(t, 'c0000000-0000-4000-8000-000000000001', 'medium', '2027-04-20 08:00+03', '2027-05-01'),
  'recommendation: medium and tall in season')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';
select ok(not private.service_recommended(t, 'c0000000-0000-4000-8000-000000000001', 'short', '2027-04-20 08:00+03', '2027-05-01'),
  'recommendation: short weeds do not trigger')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';
select ok(not private.service_recommended(t, 'c0000000-0000-4000-8000-000000000001', 'tall', '2027-04-20 08:00+03', '2027-07-05'),
  'recommendation: not out of season')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';
select ok(not private.service_recommended(t, 'c0000000-0000-4000-8000-000000000001', 'tall', '2027-03-01 08:00+03', '2027-05-15'),
  'recommendation: an observation older than 60 days does not trigger')
from public.service_type t where t.id = '91500000-0000-4000-8000-000000000001';

-- Portal offers, out of season and unpriced: a pre-request card without an
-- amount ("Fiyat teklifle bildirilir").
select pg_temp.set_season(false);
select is(pg_temp.price_on(pg_temp.today()), '(,,,)',
  'price: the published launch list has no service price: unpriced');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select row(state, area_source, species, price_list_version, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp,
              estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus)::text
   from public.service_offers()),
  '(pre_request,boundary,antep_fistigi,,,,,,,)',
  'offers: out of season and unpriced the owner sees a pre-request without an amount');
reset role;

-- In season, a fresh tall observation from a published visit: recommended.
select pg_temp.set_season(true);
insert into ids values ('visit1', pg_temp.published_visit_with_weeds('tall', 3));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select row(state, weed_height)::text from public.service_offers()), '(recommended,tall)',
  'offers: in season with tall weeds the card recommends the service');
reset role;
select is(
  (select count(*)::integer from public.notification where template::text like 'service_%'),
  0, 'no message recommends the service (H06: a commercial message needs İYS consent); the card is in the portal');

-- The viewer sees no offers; a short observation is only "available".
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::integer from public.service_offers()), 0, 'offers: viewers get none');
reset role;
select pg_temp.published_visit_with_weeds('short', 1);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select state from public.service_offers()), 'available',
  'offers: the latest observation counts (short now): available, not recommended');
reset role;
-- Back to tall for the request below.
insert into ids values ('visit3', pg_temp.published_visit_with_weeds('tall', 0));

-- ---------------------------------------------------------------------------
-- Unpriced request: ops enters the amount
-- ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
insert into ids select 'r0', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v1-taslak', true);
select is(
  (select row(status, area_source, num_nulls(price_list_id, price_list_version, price_per_donum_kurus,
              minimum_fee_kurus, vat_rate_bp, estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus))::text
   from public.service_request where id = pg_temp.id('r0')),
  '(requested,boundary,8)', 'unpriced: the request is made without a price, price list version or estimate');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r0'), pg_temp.today() + 3)), '22023 invalid_input / quote_total',
  'unpriced: ops cannot schedule without entering the amount');
select is((select row(price_list_version, estimate_total_kurus)::text from public.ops_service_requests()
           where id = pg_temp.id('r0')), '(,)', 'unpriced: the queue shows no price list version and no estimate');
select lives_ok(format($$select public.ops_schedule_service_request(%L, %L, 1234500, null)$$,
  pg_temp.id('r0'), pg_temp.today() + 3), 'unpriced: ops schedules with the amount entered by hand (no cap)');
select lives_ok(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r0'), pg_temp.today() + 4), 'unpriced: moving the day keeps the amount already entered');
select is((select row(status, quote_total_kurus, scheduled_date = pg_temp.today() + 4, estimate_total_kurus)::text
           from public.service_request where id = pg_temp.id('r0')),
  '(scheduled,1234500,t,)', 'unpriced: scheduled with the manual amount, still without an estimate');
select lives_ok(format($$select public.ops_cancel_service_request(%L, 'Fiyat kabul edilmedi')$$, pg_temp.id('r0')),
  'unpriced: ops cancels (the slot is free for the priced flow below)');
reset role;

-- ---------------------------------------------------------------------------
-- Price list: service prices, publication, resolution
-- ---------------------------------------------------------------------------

-- A published list is final: no service price is added, changed or removed.
select is(pg_temp.error_of($$insert into public.price_list_service_item (org_id, price_list_id, service_type_id,
  unit_price_kurus) values ('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000101',
  '91500000-0000-4000-8000-000000000001', 37500)$$),
  'P0001 price_list_not_draft', 'price list item: not written on a published list');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
insert into ids select 'draft', public.ops_create_price_list_draft('b0000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000101');
select is(pg_temp.error_of($$select public.ops_save_price_list_service_items(
  '91200000-0000-4000-8000-000000000101', '[]')$$), 'P0001 price_list_not_draft',
  'save service prices: not on a published list');
select is(pg_temp.error_of($$insert into public.price_list_service_item (org_id, price_list_id, service_type_id,
  unit_price_kurus) select 'b0000000-0000-4000-8000-000000000001', v, '91500000-0000-4000-8000-000000000001', 1
  from ids where k = 'draft'$$),
  '42501 permission denied for table price_list_service_item', 'price list item: no direct write, even for ops');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L, '{}')$$, pg_temp.id('draft'))),
  '22023 invalid_input / items', 'save service prices: an array');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "x", "unit_price_kurus": 1}]')$$, pg_temp.id('draft'))),
  '22023 invalid_input / service_type_id', 'save service prices: a uuid');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-0000000000ff", "unit_price_kurus": 1}]')$$, pg_temp.id('draft'))),
  '22023 invalid_input / service_type_id', 'save service prices: a service of the list''s org');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-000000000001", "unit_price_kurus": 1},
    {"service_type_id": "91500000-0000-4000-8000-000000000001", "unit_price_kurus": 2}]')$$, pg_temp.id('draft'))),
  '22023 invalid_input / service_type_id', 'save service prices: each service once');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-000000000001"}]')$$, pg_temp.id('draft'))),
  '22023 invalid_input / unit_price_kurus', 'save service prices: the price per dönüm is required');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-000000000001", "unit_price_kurus": 0}]')$$, pg_temp.id('draft'))),
  '22023 invalid_input / unit_price_kurus', 'save service prices: a positive price');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-000000000001", "unit_price_kurus": 100.5}]')$$, pg_temp.id('draft'))),
  '22023 invalid_input / unit_price_kurus', 'save service prices: whole kuruş');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-000000000001", "unit_price_kurus": 100, "minimum_fee_kurus": -1}]')$$,
  pg_temp.id('draft'))), '22023 invalid_input / minimum_fee_kurus', 'save service prices: no negative minimum fee');
select lives_ok(format($$select public.ops_save_price_list_service_items(%L,
  '[{"service_type_id": "91500000-0000-4000-8000-000000000001", "unit_price_kurus": 37500, "minimum_fee_kurus": 250000}]')$$,
  pg_temp.id('draft')), 'save service prices: ops prices weed mowing in the draft');
select is((select row(unit_price_kurus, minimum_fee_kurus)::text from public.price_list_service_item
           where price_list_id = pg_temp.id('draft')), '(37500,250000)', 'save service prices: stored, ops read them');
-- Other roles.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L, '[]')$$, pg_temp.id('draft'))),
  '42501 forbidden', 'save service prices: not for field staff');
select is((select count(*)::integer from public.price_list_service_item), 0, 'service prices: only ops read them');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L, '[]')$$, pg_temp.id('draft'))),
  'P0002 not_found', 'save service prices: not for owners');
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-8000-000000000005',
  'role', 'authenticated', 'app_metadata', json_build_object('demo', true))::text, true);
select is(pg_temp.error_of(format($$select public.ops_save_price_list_service_items(%L, '[]')$$, pg_temp.id('draft'))),
  '42501 demo_read_only', 'save service prices: refused to a demo session');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
reset role;

-- A draft does not price anything.
select is(pg_temp.price_on(pg_temp.today()), '(,,,)', 'price: a draft list is ignored');

-- Published (valid from today): version 2 prices the service.
update public.price_list set valid_from = pg_temp.today() where id = pg_temp.id('draft');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select is(public.ops_publish_price_list(pg_temp.id('draft')), 2, 'publish: the draft becomes version 2');
reset role;
select is(pg_temp.price_on(pg_temp.today()), '(2,37500,250000,2000)',
  'price: the published list in force prices the service (VAT of the list)');
select is(pg_temp.price_on(pg_temp.today() - 1), '(,,,)', 'price: not before the list is valid (v1 has none)');
select is(pg_temp.error_of(format($$update public.price_list_service_item set unit_price_kurus = 1
  where price_list_id = %L$$, pg_temp.id('draft'))), 'P0001 price_list_not_draft',
  'price list item: a published service price never changes');
select is(pg_temp.error_of(format($$delete from public.price_list_service_item where price_list_id = %L$$,
  pg_temp.id('draft'))), 'P0001 price_list_not_draft', 'price list item: nor is it removed');

-- A copy of a list takes its service prices.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
insert into ids select 'copy', public.ops_create_price_list_draft('b0000000-0000-4000-8000-000000000001',
  pg_temp.id('draft'));
select is((select row(service_type_id, unit_price_kurus, minimum_fee_kurus)::text from public.price_list_service_item
           where price_list_id = pg_temp.id('copy')),
  '(91500000-0000-4000-8000-000000000001,37500,250000)', 'draft copy: the service prices are copied');
select lives_ok(format($$select public.ops_save_price_list_service_items(%L, '[]')$$, pg_temp.id('copy')),
  'save service prices: an empty array leaves the services unpriced');
select is((select count(*)::integer from public.price_list_service_item where price_list_id = pg_temp.id('copy')), 0,
  'save service prices: the draft has none now');
select lives_ok(format($$select public.ops_delete_price_list_draft(%L)$$, pg_temp.id('copy')), 'the copy is dropped');
reset role;

-- The portal shows the estimate and the list version.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select row(state, price_list_version, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, estimate_subtotal_kurus,
              estimate_vat_kurus, estimate_total_kurus)::text
   from public.service_offers()),
  '(recommended,2,37500,250000,2000,735000,147000,882000)',
  'offers: priced, the estimate of boundary v2 (196 tenths) with the price list version');
reset role;

-- ---------------------------------------------------------------------------
-- Request, schedule, proof, complete, payment
-- ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v1-taslak')$$),
  'P0002 not_found', 'request: a viewer cannot request');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$insert into public.service_request (org_id, parcel_id, service_type_id, number, status,
  season_year, terms_version, area_m2, area_source) values ('b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000001', 'H-x', 'requested', 2027, 'x',
  1, 'declared')$$),
  '42501 permission denied for table service_request', 'request: no direct insert');
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, '')$$),
  '22023 invalid_input / terms_version', 'request: the accepted terms version is required');
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v0-eski')$$),
  '22023 invalid_input / terms_version', 'request: only the current service terms (H37)');
insert into ids
select 'r1', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'within_2_weeks', 'Kapı anahtarı komşuda.', 'bakim-v1-taslak', true);
select is(
  (select row(status, preferred_window, recommended_weed_height, price_list_id = pg_temp.id('draft'), price_list_version,
              estimate_total_kurus, number ~ '^H-[0-9]{4}-000002$')::text
   from public.service_request where id = pg_temp.id('r1')),
  '(requested,within_2_weeks,tall,t,2,882000,t)',
  'request: in season it is requested, with the frozen estimate, its price list version and the recommendation basis');
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v1-taslak')$$),
  'P0001 request_open', 'request: one open request per parcel and service');
select is((select state from public.service_offers()), 'open', 'offers: an open request shows on the card');
select is(pg_temp.error_of($$select ops_note from public.service_request$$),
  '42501 permission denied for table service_request', 'request: the owner does not read the ops note');
reset role;

-- Quote freezing: a new version (valid today) prices the service higher; the
-- request keeps version 2 and its amounts, new offers use version 3.
insert into ids select 'v3', pg_temp.publish_list(pg_temp.id('draft'), 40000, 300000, pg_temp.today());
select is(pg_temp.price_on(pg_temp.today()), '(3,40000,300000,2000)',
  'price: the highest published version in force wins');
select is(
  (select row(price_list_id = pg_temp.id('draft'), price_list_version, price_per_donum_kurus, minimum_fee_kurus,
              vat_rate_bp, estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus)::text
   from public.service_request where id = pg_temp.id('r1')),
  '(t,2,37500,250000,2000,735000,147000,882000)', 'freeze: the request keeps its price list version and amounts');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select row(state, price_list_version, estimate_total_kurus)::text from public.service_offers()),
  '(open,3,940800)', 'freeze: the card prices from version 3 (196 tenths x 400 TL + VAT)');
reset role;
-- A later version (valid in 30 days) is not in force yet.
select pg_temp.publish_list(pg_temp.id('v3'), 50000, 300000, pg_temp.today() + 30);
select is(pg_temp.price_on(pg_temp.today()) || ' ' || pg_temp.price_on(pg_temp.today() + 30),
  '(3,40000,300000,2000) (4,50000,300000,2000)', 'price: a newer version applies from its valid_from');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select is((select price_list_version from public.ops_service_requests() where id = pg_temp.id('r1')), 2,
  'queue: ops sees the frozen price list version');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;

-- The viewer does not see the request.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.service_request), 0, 'RLS: viewers do not see requests');
select is(pg_temp.error_of(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r1'), pg_temp.today() + 3)), 'P0002 not_found', 'schedule: not for parcel readers');

-- The owner cannot schedule.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r1'), pg_temp.today() + 3)), 'P0002 not_found', 'schedule: not for the owner');

-- Ops schedules: confirms the quote, opens a mowing session.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r1'), pg_temp.today() - 1)), '22023 invalid_input / scheduled_date', 'schedule: not in the past');
select is(pg_temp.error_of(format($$select public.ops_schedule_service_request(%L, %L, 882001, null)$$,
  pg_temp.id('r1'), pg_temp.today() + 3)), 'P0001 quote_above_estimate', 'schedule: never above the accepted estimate (H37)');
select lives_ok(format($$select public.ops_schedule_service_request(%L, %L, 850000, 'Ali Usta')$$,
  pg_temp.id('r1'), pg_temp.today() + 3), 'schedule: ops confirms 8 500 TL and a day');
reset role;
select is(
  (select row(r.status, r.quote_total_kurus, r.scheduled_date = pg_temp.today() + 3, s.kind, s.status,
              s.planned_date = pg_temp.today() + 3)::text
   from public.service_request r join public.session s on s.id = r.session_id where r.id = pg_temp.id('r1')),
  '(scheduled,850000,t,mowing,planned,t)',
  'schedule: status scheduled, quote confirmed, a planned mowing session');
select is(
  (select count(*)::integer from public.notification
   where template = 'service_scheduled' and ref_id = pg_temp.id('r1')
     and recipient_user_id = 'a0000000-0000-4000-8000-000000000001' and vars ? 'ref' and not vars ? 'amount'),
  1, 'schedule: the owner is notified (number and day, no amount)');

-- Complete needs before and after photos.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select is(pg_temp.error_of(format($$select public.ops_complete_service_request(%L, %L, null)$$,
  pg_temp.id('r1'), pg_temp.today())), 'P0001 proof_missing', 'complete: proof photos are required');
select is(pg_temp.error_of(format($$select public.ops_add_service_photo(%L, 'during', %L, 1000, 'image/jpeg')$$,
  pg_temp.id('r1'), repeat('a', 64))), '22023 invalid_input / phase', 'photo: phase is before or after');
select is(pg_temp.error_of(format($$select public.ops_add_service_photo(%L, 'before', 'xyz', 1000, 'image/jpeg')$$,
  pg_temp.id('r1'))), '22023 invalid_input / content_hash', 'photo: a SHA-256 content hash');
insert into ids select 'before', public.ops_add_service_photo(pg_temp.id('r1'), 'before', repeat('b', 64), 120000, 'image/jpeg');
insert into ids select 'after', public.ops_add_service_photo(pg_temp.id('r1'), 'after', repeat('c', 64), 130000, 'image/jpeg');
select is(public.ops_add_service_photo(pg_temp.id('r1'), 'before', repeat('b', 64), 120000, 'image/jpeg'),
  pg_temp.id('before'), 'photo: the same content is the same asset (content-hash addressed)');
reset role;
select is(
  (select row(a.kind, a.uri, a.session_id = r.session_id)::text
   from public.asset a join public.service_request r on r.id = pg_temp.id('r1') where a.id = pg_temp.id('before')),
  row('photo', 'storage://media/org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/'
    || repeat('b', 64), true)::text,
  'photo: an asset on the job session, stored by content hash');
select is(pg_temp.error_of(format($$update public.asset set mime_type = 'image/png' where id = %L$$, pg_temp.id('before'))),
  'P0001 UPDATE on public.asset is not allowed: table is insert-only', 'photo: media is never changed');

-- Before completion the owner does not see the photos yet.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::integer from public.asset where id in (pg_temp.id('before'), pg_temp.id('after'))), 0,
  'proof: not visible to the owner before the job is done');
select is(pg_temp.error_of(format($$select public.customer_cancel_service_request(%L, null)$$, pg_temp.id('r1'))),
  null, 'cancel: the owner may still cancel a job scheduled after today (rolled back below)');
reset role;
-- Undo the owner's cancellation for the rest of the flow.
update public.service_request set status = 'scheduled', cancelled_at = null, cancelled_by_role = null,
  cancel_reason = null where id = pg_temp.id('r1');
update public.session set status = 'planned' where id = (select session_id from public.service_request where id = pg_temp.id('r1'));

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select is(pg_temp.error_of(format($$select public.ops_complete_service_request(%L, %L, null)$$,
  pg_temp.id('r1'), pg_temp.today() + 1)), '22023 invalid_input / done_on', 'complete: not in the future');
select lives_ok(format($$select public.ops_complete_service_request(%L, %L, 'Bitti')$$, pg_temp.id('r1'), pg_temp.today()),
  'complete: ops marks the job done');
reset role;
select is(
  (select row(r.status, r.completed_on = pg_temp.today(), s.status, o.kind, o.performer, o.session_id = r.session_id,
              o.details ->> 'by')::text
   from public.service_request r
   join public.session s on s.id = r.session_id
   join public.operation o on o.id = r.operation_id
   where r.id = pg_temp.id('r1')),
  '(done,t,captured,mowing,crew,t,orchados)',
  'complete: done, the session captured (never published), an operation by the crew for orchadOS');
select is(
  (select count(*)::integer from public.notification where template = 'service_completed' and ref_id = pg_temp.id('r1')),
  1, 'complete: the owner is notified');
select is(
  (select array_agg(to_status::text order by to_status::text) from public.service_request_event
   where request_id = pg_temp.id('r1')),
  '{cancelled,done,requested,scheduled}'::text[], 'history: every status change is a row (one transaction: same time)');

-- The owner sees the proof now; the viewer does not; the storage object too.
insert into storage.objects (bucket_id, name, owner_id)
values ('media', 'org/b0000000-0000-4000-8000-000000000001/parcel/c0000000-0000-4000-8000-000000000001/' || repeat('b', 64), null);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::integer from public.asset where id in (pg_temp.id('before'), pg_temp.id('after'))), 2,
  'proof: the owner reads both photos of the done job');
select is((select count(*)::integer from storage.objects where name like '%' || repeat('b', 64)), 1,
  'proof: and the stored file');
select is((select count(*)::integer from public.service_request_photo where request_id = pg_temp.id('r1')), 2,
  'proof: the links');
select is((select count(*)::integer from public.session where kind = 'mowing' and status = 'published'), 0,
  'the job is never an audit visit');
select is(pg_temp.error_of(format($$select public.customer_cancel_service_request(%L, null)$$, pg_temp.id('r1'))),
  'P0001 invalid_status', 'cancel: not after the job is done');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is((select count(*)::integer from public.asset where id in (pg_temp.id('before'), pg_temp.id('after'))), 0,
  'proof: the viewer does not read them');

-- Payment after the job, once.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select lives_ok(format($$select public.ops_record_service_payment(%L, 850000, 'cash', %L)$$, pg_temp.id('r1'), pg_temp.today()),
  'payment: recorded by hand');
select is(pg_temp.error_of(format($$select public.ops_record_service_payment(%L, 850000, 'cash', %L)$$,
  pg_temp.id('r1'), pg_temp.today())), 'P0001 payment_recorded', 'payment: once');
reset role;

-- ---------------------------------------------------------------------------
-- Cancellations, pre-requests, demand, switch
-- ---------------------------------------------------------------------------

-- After the job a new request may be opened; the owner cancels it.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
insert into ids select 'r2', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'flexible', null, 'bakim-v1-taslak');
select is((select recommended_weed_height from public.service_request where id = pg_temp.id('r2')), null,
  'request: no recommendation basis once a job was done after the observation');
select lives_ok(format($$select public.customer_cancel_service_request(%L, 'Vazgeçtim')$$, pg_temp.id('r2')),
  'cancel: the owner cancels a requested job');
reset role;

-- ---------------------------------------------------------------------------
-- Season per fruit species
-- ---------------------------------------------------------------------------

-- ops_save_service_season: ops only, valid species and window, no demo.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(pg_temp.error_of($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'zeytin',
  9::smallint, 1::smallint, 10::smallint, 31::smallint)$$), 'P0002 not_found', 'season per species: not for owners');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(pg_temp.error_of($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'zeytin',
  9::smallint, 1::smallint, 10::smallint, 31::smallint)$$), '42501 forbidden', 'season per species: not for field staff');
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-8000-000000000005',
  'role', 'authenticated', 'app_metadata', json_build_object('demo', true))::text, true);
select is(pg_temp.error_of($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'zeytin',
  9::smallint, 1::smallint, 10::smallint, 31::smallint)$$), '42501 demo_read_only',
  'season per species: refused to a demo session');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'muz',
  9::smallint, 1::smallint, 10::smallint, 31::smallint)$$), '22023 invalid_input / species',
  'season per species: a known species');
select is(pg_temp.error_of($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'zeytin',
  2::smallint, 29::smallint, 10::smallint, 31::smallint)$$), '22023 invalid_input / season',
  'season per species: a day valid in every year');
select is(pg_temp.error_of($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'zeytin',
  9::smallint, 1::smallint, 9::smallint, 1::smallint)$$), '22023 invalid_input / season',
  'season per species: start and end differ');
select is(pg_temp.error_of($$update public.service_type_season set season_end_day = 1$$),
  '42501 permission denied for table service_type_season', 'season per species: no direct write');
-- Olives: a window starting in 40 days; pistachio stays in season.
select lives_ok(format($$select public.ops_save_service_season('91500000-0000-4000-8000-000000000001', 'zeytin',
  %s::smallint, %s::smallint, %s::smallint, %s::smallint)$$,
  extract(month from pg_temp.safe_day(pg_temp.today() + 40)), extract(day from pg_temp.safe_day(pg_temp.today() + 40)),
  extract(month from pg_temp.safe_day(pg_temp.today() + 80)), extract(day from pg_temp.safe_day(pg_temp.today() + 80))),
  'season per species: ops sets the olive window');
select is((select count(*)::integer from public.service_type_season
           where service_type_id = '91500000-0000-4000-8000-000000000001' and species = 'zeytin'
             and updated_by = 'a0000000-0000-4000-8000-000000000005'), 1, 'season per species: one row, updated by ops');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select row(state, species)::text from public.service_offers()), '(available,antep_fistigi)',
  'season per species: the pistachio parcel is in season');
reset role;
update public.parcel set species = 'zeytin' where id = 'c0000000-0000-4000-8000-000000000001';
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select row(state, species, in_season, season_start = pg_temp.safe_day(pg_temp.today() + 40))::text
           from public.service_offers()), '(pre_request,zeytin,f,t)',
  'season per species: the same parcel as an olive orchard is out of season, its window starts in 40 days');

-- Ops cancel needs a reason; a scheduled job on today cannot be cancelled by the owner.
insert into ids select 'r3', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'flexible', null, 'bakim-v1-taslak');
select is((select row(status, season_year = extract(year from pg_temp.safe_day(pg_temp.today() + 40)))::text
           from public.service_request where id = pg_temp.id('r3')), '(pre_request,t)',
  'pre-request: out of the species'' season the same form opens a pre-request for the next window');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$,
  pg_temp.id('r3'), pg_temp.today() + 14)),
  'P0001 withdrawal_period / ' || to_char(pg_temp.today() + 15, 'YYYY-MM-DD'),
  'schedule: without the early-performance request not inside the 14-day withdrawal period (H37)');
reset role;
update public.service_request set early_performance_requested = true where id = pg_temp.id('r3');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
set local role authenticated;
select lives_ok(format($$select public.ops_schedule_service_request(%L, %L, null, null)$$, pg_temp.id('r3'), pg_temp.today()),
  'schedule: ops may schedule a pre-request (season opened early)');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of(format($$select public.customer_cancel_service_request(%L, null)$$, pg_temp.id('r3'))),
  'P0001 too_late_to_cancel', 'cancel: the owner cannot cancel on the scheduled day');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is(pg_temp.error_of(format($$select public.ops_cancel_service_request(%L, ' ')$$, pg_temp.id('r3'))),
  '22023 invalid_input / reason', 'cancel: ops gives a reason');
select lives_ok(format($$select public.ops_cancel_service_request(%L, 'Yağmur')$$, pg_temp.id('r3')),
  'cancel: ops cancels');
select is((select count(*)::integer from public.session s join public.service_request r on r.session_id = s.id
           where r.id = pg_temp.id('r3') and s.status = 'cancelled'), 1, 'cancel: the job session is cancelled');

select is(
  (select row(sum(done), sum(cancelled), sum(total))::text from public.ops_service_demand()),
  '(1,3,4)', 'demand: counts per service and season');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.ops_service_demand()), 0, 'demand: ops only');
select is((select count(*)::integer from public.ops_service_requests()), 0, 'queue: ops only');
reset role;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select ok(public.portal_services_enabled(), 'nav: the owner gets the Hizmetlerim link');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select ok(not public.portal_services_enabled(), 'nav: the viewer does not');
reset role;

-- Switch off: no offers, no requests.
update public.org_billing_setting set services_enabled = false where org_id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*)::integer from public.service_offers()), 0, 'switch off: no offers');
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v1-taslak')$$),
  'P0001 services_disabled', 'switch off: no requests');
select ok(not public.portal_services_enabled(), 'switch off: no Hizmetlerim link');
reset role;

-- ---------------------------------------------------------------------------
-- Robot notes
-- ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$insert into public.parcel_robot_note (parcel_id, org_id, slope, stoniness, lowest_branch_cm)
  values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'gentle', 'high', 45)$$,
  'robot note: field staff write');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is((select count(*)::integer from public.parcel_robot_note), 0, 'robot note: not shown to owners');
reset role;

select * from finish();
rollback;
