-- Service layer, weed mowing (IP15, docs/MVP.md Module 6): the weed_height
-- question, the quote rule service-v1, the season calendar, the
-- recommendation rule (observation + season; portal only, no message), status transitions
-- (pre_request, requested, scheduled, done, cancelled) with history, proof
-- photos and their visibility, manual payment, notifications, the switch,
-- demand counts, RLS of requests and robot notes.
-- Seed: org b0..01 (services on), ops a0..05, field staff a0..03, owner a0..01
-- and viewer a0..02 of parcel c0..01 (boundary v2 ≈ 19 590.5 m²), catalogue
-- row weed_mowing 91500000-..01 (37 500 kuruş per dönüm, minimum 250 000,
-- VAT 20 %, 1 March – 30 June, from medium). One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

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
end;
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
insert into public.service_type (org_id, code, name, operation_kind, price_per_donum_kurus, season_start_month,
  season_start_day, season_end_month, season_end_day, active)
values ('b0000000-0000-4000-8000-000000000001', 'wrap_test', 'Kış işi', 'other', 1000, 11, 1, 2, 28, false);
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

-- Portal offers, out of season: a pre-request card with the frozen formula.
select pg_temp.set_season(false);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(
  (select row(state, area_source, estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus, price_is_draft)::text
   from public.service_offers()),
  '(pre_request,boundary,735000,147000,882000,t)',
  'offers: out of season the owner sees a pre-request with the estimate of boundary v2 (196 tenths)');
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
-- Request, schedule, proof, complete, payment
-- ---------------------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v1-taslak')$$),
  'P0002 not_found', 'request: a viewer cannot request');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$insert into public.service_request (org_id, parcel_id, service_type_id, number, status,
  season_year, terms_version, area_m2, area_source, price_per_donum_kurus, minimum_fee_kurus, vat_rate_bp, price_is_draft,
  estimate_subtotal_kurus, estimate_vat_kurus, estimate_total_kurus) values ('b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', '91500000-0000-4000-8000-000000000001', 'H-x', 'requested', 2027, 'x',
  1, 'declared', 1, 0, 0, true, 0, 0, 0)$$),
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
  (select row(status, preferred_window, recommended_weed_height, estimate_total_kurus, number ~ '^H-[0-9]{4}-000001$')::text
   from public.service_request where id = pg_temp.id('r1')),
  '(requested,within_2_weeks,tall,882000,t)',
  'request: in season it is requested, with the frozen estimate and the recommendation basis');
select is(pg_temp.error_of($$select public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'asap', null, 'bakim-v1-taslak')$$),
  'P0001 request_open', 'request: one open request per parcel and service');
select is((select state from public.service_offers()), 'open', 'offers: an open request shows on the card');
select is(pg_temp.error_of($$select ops_note from public.service_request$$),
  '42501 permission denied for table service_request', 'request: the owner does not read the ops note');

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

-- Ops cancel needs a reason; a scheduled job on today cannot be cancelled by the owner.
select pg_temp.set_season(false);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
insert into ids select 'r3', public.customer_request_service('c0000000-0000-4000-8000-000000000001',
  '91500000-0000-4000-8000-000000000001', 'flexible', null, 'bakim-v1-taslak');
select is((select status::text from public.service_request where id = pg_temp.id('r3')), 'pre_request',
  'pre-request: out of season the same form opens a pre-request');
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
  '(1,2,3)', 'demand: counts per service and season');
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
