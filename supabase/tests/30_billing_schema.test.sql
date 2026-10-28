-- Billing tables (IP12, docs/musteri-yonetimi.md §6.3, §6.4, §6.11): checks,
-- guards, insert-only tables, document numbers, the TCKN check.
-- Seed: org b0..01, packages 9120..01/02, price lists 9120..0101 (published v1)
-- and 9120..0102 (draft), customer a0..06 with application 9120..0301.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

select testing.reset_to_seed();

create function pg_temp.id(p_n int) returns uuid language sql immutable
as $$ select ('f3000000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $$;
create function pg_temp.err(p_sql text) returns text language plpgsql
as $$ begin execute p_sql; return null; exception when others then return sqlstate || ' ' || sqlerrm; end $$;

-- Types and helpers ---------------------------------------------------------------

select enum_has_labels('public', 'application_status',
  array['draft', 'submitted', 'quoted', 'accepted', 'rejected', 'withdrawn'], 'application statuses');
select enum_has_labels('public', 'payment_status',
  array['initiated', 'pending_review', 'succeeded', 'failed', 'expired', 'voided'], 'payment statuses');
select enum_has_labels('public', 'garden_removal_status',
  array['requested', 'scheduled', 'completed', 'cancelled'], 'garden removal statuses (IP14)');
select enum_has_labels('public', 'garden_removal_reason',
  array['sold', 'not_needed', 'dissatisfied', 'cost', 'transfer', 'duplicate', 'other'], 'garden removal reasons (IP14)');
select enum_has_labels('public', 'consent_kind',
  array['kvkk_notice', 'explicit_service_improvement', 'explicit_marketing', 'distance_sales', 'pre_information'],
  'consent kinds');

select ok(private.is_valid_tckn('10000000146'), 'a valid TCKN passes');
select ok(not private.is_valid_tckn('10000000147'), 'a wrong check digit fails');
select ok(not private.is_valid_tckn('01234567890'), 'a leading zero fails');
select ok(not private.is_valid_tckn('1234'), 'a short value fails');
select ok(not private.is_valid_tckn(null), 'null is not a TCKN');

select matches(private.next_document_number('b0000000-0000-4000-8000-000000000001', 'T'),
  '^T-[0-9]{4}-000001$', 'the first quote number of the year');
select matches(private.next_document_number('b0000000-0000-4000-8000-000000000001', 'T'),
  '^T-[0-9]{4}-000002$', 'numbers count up');
select is(pg_temp.err($$ select private.next_document_number('b0000000-0000-4000-8000-000000000001', 'X') $$),
  '22023 invalid_input', 'unknown document kinds are refused');
select ok(private.signup_org_id() = 'b0000000-0000-4000-8000-000000000001', 'the seed org takes sign-ups');
insert into public.org (id, name, kind) values (pg_temp.id(9), 'Second org', 'company');
select throws_ok(
  format($$ insert into public.org_billing_setting (org_id, accepts_signups) values (%L, true) $$, pg_temp.id(9)),
  '23505', null, 'at most one org takes sign-ups');

-- Applications ------------------------------------------------------------------

insert into public.service_application (id, org_id, customer_user_id)
values (pg_temp.id(1), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ insert into public.service_application (org_id, customer_user_id)
     values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006') $$,
  '23505', null, 'one draft per customer and org');
select lives_ok(
  format($$ update public.service_application set status = 'withdrawn' where id = %L $$, pg_temp.id(1)),
  'a draft is withdrawn without a number');
select throws_ok(
  format($$ update public.service_application set status = 'submitted' where id = %L $$, pg_temp.id(1)),
  '23514', null, 'a submitted application needs a number and submission time');
select throws_ok(
  format($$ update public.service_application set status = 'draft', number = 'B-2026-000099' where id = %L $$, pg_temp.id(1)),
  '23514', null, 'a draft has no number');
select throws_ok(
  $$ update public.service_application set status = 'rejected' where id = '91200000-0000-4000-8000-000000000301' $$,
  '23514', null, 'a rejection needs a reason');
select throws_ok(
  $$ insert into public.application_garden (org_id, application_id, customer_user_id, name, declared_area_m2, position)
     values ('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000301',
             'a0000000-0000-4000-8000-000000000006', 'Küçük', 100,
             extensions.st_setsrid(extensions.st_makepoint(37.5, 37.0), 4326)) $$,
  '23514', null, 'a garden is at least 500 m²');
select throws_ok(
  $$ insert into public.application_garden (org_id, application_id, customer_user_id, name, declared_area_m2, position)
     values ('b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000301',
             'a0000000-0000-4000-8000-000000000001', 'Başkasının', 1000,
             extensions.st_setsrid(extensions.st_makepoint(37.5, 37.0), 4326)) $$,
  '23503', null, 'a garden belongs to its application''s customer');
select throws_ok(
  $$ update public.application_garden set verified_area_m2 = 1000 where id = '91200000-0000-4000-8000-000000000401' $$,
  '23514', null, 'a verified area comes with its time');
select throws_ok(
  $$ delete from auth.users where id = 'a0000000-0000-4000-8000-000000000006' $$,
  '23503', null, 'a customer with billing rows cannot be deleted (on delete restrict)');

-- Price lists -------------------------------------------------------------------

select throws_ok(
  $$ update public.price_list set note = 'x' where id = '91200000-0000-4000-8000-000000000101' $$,
  'P0001', 'price_list_not_draft', 'a published price list does not change');
select throws_ok(
  $$ delete from public.price_list where id = '91200000-0000-4000-8000-000000000101' $$,
  'P0001', 'price_list_not_draft', 'nor is it deleted');
select throws_ok(
  $$ update public.price_list_item set unit_price_kurus = 1 where price_list_id = '91200000-0000-4000-8000-000000000101' $$,
  'P0001', 'price_list_not_draft', 'its items do not change');
select throws_ok(
  $$ insert into public.price_list_item (org_id, price_list_id, package_id, unit_price_kurus)
     select 'b0000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000101', id, 1
     from public.service_package where code = 'standart' $$,
  'P0001', 'price_list_not_draft', 'no item is added to a published list');
select lives_ok(
  $$ update public.price_list_item set unit_price_kurus = 14000 where price_list_id = '91200000-0000-4000-8000-000000000102' $$,
  'draft items change');
select throws_ok(
  $$ update public.price_list set status = 'published' where id = '91200000-0000-4000-8000-000000000102' $$,
  '23514', null, 'a published list has a version and publication time');
select lives_ok(
  $$ delete from public.price_list where id = '91200000-0000-4000-8000-000000000102' $$,
  'a draft is deleted with its items');

-- Quotes, orders ----------------------------------------------------------------

update public.service_application set status = 'quoted' where id = '91200000-0000-4000-8000-000000000301';
insert into public.quote (id, org_id, customer_user_id, application_id, number, price_list_id, price_list_version,
  package_id, package_code, package_name, periodic_visits_per_year, includes_inventory, first_year, vat_rate_bp,
  base_kurus, discount_kurus, subtotal_kurus, vat_kurus, total_kurus, inputs, valid_until)
values (pg_temp.id(2), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
  '91200000-0000-4000-8000-000000000301', 'T-2026-900001', '91200000-0000-4000-8000-000000000101', 1,
  '91200000-0000-4000-8000-000000000001', 'standart', 'Standart', 4, true, true, 2000,
  750000, 0, 750000, 150000, 900000, '{"formula": "pricing-v1"}', current_date + 30);
insert into public.quote_item (id, org_id, quote_id, customer_user_id, line_no, application_garden_id, garden_name,
  area_m2, billable_area_tenths, visits, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus, visit_amount_kurus,
  line_base_kurus, line_discount_kurus, line_subtotal_kurus, line_vat_kurus, line_total_kurus)
values (pg_temp.id(3), 'b0000000-0000-4000-8000-000000000001', pg_temp.id(2), 'a0000000-0000-4000-8000-000000000006',
  1, '91200000-0000-4000-8000-000000000401', 'Nizip Bahçesi', 15000, 150, 4, 12500, 500000, 0, 750000,
  750000, 0, 750000, 150000, 900000);

select throws_ok(
  $$ insert into public.quote (org_id, customer_user_id, application_id, number, price_list_id, price_list_version,
       package_id, package_code, package_name, periodic_visits_per_year, includes_inventory, first_year, vat_rate_bp,
       base_kurus, discount_kurus, subtotal_kurus, vat_kurus, total_kurus, inputs, valid_until)
     values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
       '91200000-0000-4000-8000-000000000301', 'T-2026-900002', '91200000-0000-4000-8000-000000000101', 1,
       '91200000-0000-4000-8000-000000000001', 'standart', 'Standart', 4, true, true, 2000,
       1, 0, 1, 0, 1, '{}', current_date) $$,
  '23505', null, 'one open quote per application');
select throws_ok(
  format($$ update public.quote set total_kurus = 1 where id = %L $$, pg_temp.id(2)),
  'P0001', 'quote_frozen', 'quote amounts never change');
select throws_ok(
  format($$ update public.quote set status = 'accepted' where id = %L $$, pg_temp.id(2)),
  '23514', null, 'a decided quote carries its decision time');
select lives_ok(
  format($$ update public.quote set status = 'accepted', decided_at = now() where id = %L $$, pg_temp.id(2)),
  'an issued quote is decided once');
select throws_ok(
  format($$ update public.quote set status = 'cancelled' where id = %L $$, pg_temp.id(2)),
  'P0001', 'quote_not_open', 'a decided quote is final');
select throws_ok(
  format($$ delete from public.quote where id = %L $$, pg_temp.id(2)),
  'P0001', null, 'quotes are not deleted');
select throws_ok(
  format($$ update public.quote_item set garden_name = 'x' where id = %L $$, pg_temp.id(3)),
  'P0001', null, 'quote items are insert-only');
select throws_ok(
  $$ insert into public.quote_item (org_id, quote_id, customer_user_id, line_no, garden_name, area_m2,
       billable_area_tenths, visits, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus, visit_amount_kurus,
       line_base_kurus, line_discount_kurus, line_subtotal_kurus, line_vat_kurus, line_total_kurus)
     values ('b0000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
       'a0000000-0000-4000-8000-000000000006', 2, 'x', 1000, 10, 4, 1, 0, 0, 4, 4, 0, 4, 0, 4) $$,
  '23514', null, 'a quote item names a garden or a parcel');

insert into public.service_order (id, org_id, customer_user_id, quote_id, number, total_kurus)
values (pg_temp.id(4), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
        pg_temp.id(2), 'S-2026-900001', 900000);
insert into public.service_order_item (id, org_id, order_id, customer_user_id, quote_item_id, line_no, garden_name, amount_kurus)
values (pg_temp.id(5), 'b0000000-0000-4000-8000-000000000001', pg_temp.id(4), 'a0000000-0000-4000-8000-000000000006',
        pg_temp.id(3), 1, 'Nizip Bahçesi', 900000);
select throws_ok(
  format($$ update public.service_order set refunded_kurus = 1 where id = %L $$, pg_temp.id(4)),
  '23514', null, 'nothing is refunded beyond what was paid');
select throws_ok(
  format($$ update public.service_order_item set amount_kurus = 1 where id = %L $$, pg_temp.id(5)),
  'P0001', null, 'order items keep their amount');
select lives_ok(
  format($$ update public.service_order_item set parcel_id = 'c0000000-0000-4000-8000-000000000001' where id = %L $$, pg_temp.id(5)),
  'an order item gets its parcel once');
select throws_ok(
  format($$ update public.service_order_item set parcel_id = null where id = %L $$, pg_temp.id(5)),
  'P0001', null, 'and keeps it');

-- Payments ----------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.payment (org_id, order_id, customer_user_id, provider, status, amount_kurus)
            values ('b0000000-0000-4000-8000-000000000001', %L, 'a0000000-0000-4000-8000-000000000006',
                    'manual', 'succeeded', 900000) $$, pg_temp.id(4)),
  '23514', null, 'a manual payment needs its bank reference, value date and recorder (and a receipt)');

-- Insert-only private tables and the audit log ------------------------------------

select throws_ok(
  $$ update private.consent_record set granted = false
     where subject_id = 'a0000000-0000-4000-8000-000000000006' and kind = 'explicit_marketing' $$,
  'P0001', null, 'consent records are insert-only');
insert into public.audit_event (org_id, actor_user_id, actor_role, action, entity_type)
values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'ops',
        'billing_setting.saved', 'billing_setting');
select throws_ok(
  $$ delete from public.audit_event where action = 'billing_setting.saved' $$,
  'P0001', null, 'audit events are insert-only');
select throws_ok(
  $$ insert into public.audit_event (org_id, actor_role, action, entity_type, details)
     values ('b0000000-0000-4000-8000-000000000001', 'system', 'x.y', 'order', jsonb_build_object('x', repeat('a', 5000))) $$,
  '23514', null, 'audit details stay under 4 KB');

-- Deleting a staff account clears its user columns (FK set null) -----------------

insert into auth.users (instance_id, id, aud, role, email)
values ('00000000-0000-0000-0000-000000000000', pg_temp.id(20), 'authenticated', 'authenticated',
        'gone-staff@example.com');
insert into public.price_list (id, org_id, version, status, valid_from, created_by, published_by, published_at)
values (pg_temp.id(21), 'b0000000-0000-4000-8000-000000000001', 90, 'published', current_date,
        pg_temp.id(20), pg_temp.id(20), now());
insert into public.quote (id, org_id, customer_user_id, application_id, number, price_list_id, price_list_version,
  package_id, package_code, package_name, periodic_visits_per_year, includes_inventory, first_year, vat_rate_bp,
  base_kurus, discount_kurus, subtotal_kurus, vat_kurus, total_kurus, inputs, valid_until,
  status, issued_by, decided_at, decided_by)
values (pg_temp.id(22), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006',
  '91200000-0000-4000-8000-000000000301', 'T-2026-900003', '91200000-0000-4000-8000-000000000101', 1,
  '91200000-0000-4000-8000-000000000001', 'standart', 'Standart', 4, true, true, 2000,
  750000, 0, 750000, 150000, 900000, '{"formula": "pricing-v1"}', current_date + 30,
  'cancelled', pg_temp.id(20), now(), pg_temp.id(20));

select throws_ok(
  format($$ update public.price_list set published_by = null, note = 'x' where id = %L $$, pg_temp.id(21)),
  'P0001', 'price_list_not_draft', 'clearing a user column does not open a published list to other changes');
select throws_ok(
  format($$ update public.quote set issued_by = 'a0000000-0000-4000-8000-000000000005' where id = %L $$, pg_temp.id(22)),
  'P0001', 'quote_frozen', 'a quote''s issuer is only ever cleared, never replaced');
select throws_ok(
  format($$ update public.quote set decided_by = null, total_kurus = 1 where id = %L $$, pg_temp.id(22)),
  'P0001', 'quote_frozen', 'clearing a user column does not unfreeze a quote');
select lives_ok(
  format($$ delete from auth.users where id = %L $$, pg_temp.id(20)),
  'a staff account that published a list and issued and decided a quote can be deleted');
select is(
  (select array[created_by, published_by] from public.price_list where id = pg_temp.id(21)),
  array[null, null]::uuid[], 'the published list loses its creator and publisher');
select is(
  (select array[issued_by, decided_by] from public.quote where id = pg_temp.id(22)),
  array[null, null]::uuid[], 'the decided quote loses its issuer and decider');

select * from finish();
rollback;
