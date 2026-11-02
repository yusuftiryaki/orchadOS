-- Fruit species (20261106090000_fruit_species, docs/veri-modeli.md "Meyve
-- türü"): the public.fruit_species lookup, parcel.species (the pilot's
-- antep_fistigi for existing parcels), the tree override and
-- public.tree_species, the species through register_parcel and
-- customer_save_application_garden, the copy to the parcel on activation,
-- who may change it, and the demo guard.
-- Seed: owner a0..01, field staff a0..03, expert a0..04, ops a0..05, customer
-- a0..06 of org b0..01; parcel c0..01 with tree S1-1; package standart
-- 9120..0001 (an order of 20 dönüm: inventory installment 720 000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.as_demo(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated',
       'app_metadata', json_build_object('demo', true))::text, true) $$;
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
create function pg_temp.tree(p_code text) returns uuid language sql immutable
as $$ select md5('orchados-seed:tree:' || p_code)::uuid $$;
create temporary table ids (name text primary key, id uuid) on commit drop;
create function pg_temp.id(p_name text) returns uuid language sql stable
as $$ select id from ids where name = p_name $$;
grant execute on all functions in schema pg_temp to authenticated, anon;
grant select, insert on ids to authenticated;

-- The lookup ---------------------------------------------------------------------

select is((select array_agg(code order by sort_order) from public.fruit_species),
  array['antep_fistigi', 'zeytin', 'mandalina', 'portakal', 'limon', 'greyfurt', 'nar', 'incir', 'kayisi',
        'kiraz', 'elma', 'ceviz', 'badem', 'diger'],
  'the species, in display order (diğer last)');
select is((select array_agg(code) from public.fruit_species where has_methodology), array['antep_fistigi'],
  'only Antep pistachio has a methodology');
select has_trigger('public', 'fruit_species', 'zz_demo_read_only', 'the lookup carries the demo guard');

set local role anon;
select is((select count(*)::integer from public.fruit_species), 14, 'anon reads the lookup (the sign-up form)');
select is(pg_temp.error_of($$ insert into public.fruit_species (code, name) values ('muz', 'Muz') $$),
  '42501 permission denied for table fruit_species', 'anon cannot add a species');
reset role;

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select name from public.fruit_species where code = 'antep_fistigi'), 'Antep fıstığı',
  'a signed-in user reads the lookup');
select is(pg_temp.error_of($$ insert into public.fruit_species (code, name) values ('muz', 'Muz') $$),
  '42501 permission denied for table fruit_species', 'not even ops adds a species (migrations only)');
select is(pg_temp.error_of($$ update public.fruit_species set name = 'Fıstık' where code = 'antep_fistigi' $$),
  '42501 permission denied for table fruit_species', 'nor renames one');
reset role;

-- Parcels and trees --------------------------------------------------------------

select is((select species from public.parcel where id = 'c0000000-0000-4000-8000-000000000001'), 'antep_fistigi',
  'the seed parcel is the pilot''s species');
select is((select count(*)::integer from public.parcel where species is null), 0, 'every parcel has a species');
select is(pg_temp.error_of($$ update public.parcel set species = 'muz' where id = 'c0000000-0000-4000-8000-000000000001' $$),
  '23503 insert or update on table "parcel" violates foreign key constraint "parcel_species_fkey" / Key (species)=(muz) is not present in table "fruit_species".',
  'a parcel takes listed species only');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is(public.tree_species(pg_temp.tree('S1-1')), 'antep_fistigi', 'no override: the parcel''s species');
with u as (update public.tree set species = 'zeytin' where id = pg_temp.tree('S1-1') returning 1)
select is(count(*)::integer, 1,
  'field staff set a tree''s species (mixed orchard)') from u;
select is(public.tree_species(pg_temp.tree('S1-1')), 'zeytin', 'the override wins');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.tree_species(pg_temp.tree('S1-1')), 'zeytin', 'the owner sees the effective species');
with u as (update public.tree set species = null where id = pg_temp.tree('S1-1') returning 1)
select is(count(*)::integer, 0,
  'the owner cannot change a tree''s species') from u;
with u as (update public.parcel set species = 'nar' where id = 'c0000000-0000-4000-8000-000000000001' returning 1)
select is(count(*)::integer, 0,
  'the owner cannot change the parcel''s species') from u;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
with u as (update public.parcel set species = 'nar' where id = 'c0000000-0000-4000-8000-000000000001' returning 1)
select is(count(*)::integer, 0,
  'nor can the expert') from u;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
with u as (update public.parcel set species = 'nar' where id = 'c0000000-0000-4000-8000-000000000001' returning 1)
select is(count(*)::integer, 1,
  'ops changes the parcel''s species') from u;
select is(public.tree_species(pg_temp.tree('S1-1')), 'zeytin', 'the tree keeps its override');
update public.tree set species = null where id = pg_temp.tree('S1-1');
select is(public.tree_species(pg_temp.tree('S1-1')), 'nar', 'without it the tree follows the parcel');
select pg_temp.as_demo('a0000000-0000-4000-8000-000000000005');
select ok(pg_temp.error_of($$ update public.parcel set species = 'elma' where id = 'c0000000-0000-4000-8000-000000000001' $$)
  is not null, 'a demo session writes no species');

-- register_parcel ----------------------------------------------------------------

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
insert into ids select 'r1', public.register_parcel('b0000000-0000-4000-8000-000000000001', '{"name": "Tür yok"}');
insert into ids select 'r2', public.register_parcel('b0000000-0000-4000-8000-000000000001',
  '{"name": "Zeytinlik", "species": "zeytin"}');
select is((select species from public.parcel where id = pg_temp.id('r1')), 'antep_fistigi',
  'register_parcel without a species: the pilot''s');
select is((select species from public.parcel where id = pg_temp.id('r2')), 'zeytin',
  'register_parcel with a species');
select is(pg_temp.error_of($$ select public.register_parcel('b0000000-0000-4000-8000-000000000001',
    '{"name": "Muzluk", "species": "muz"}') $$),
  '22023 invalid_input / species', 'an unknown species is refused');
reset role;

-- Sign-up garden → parcel on activation ------------------------------------------

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'a', public.customer_create_application('91200000-0000-4000-8000-000000000001');
select is(pg_temp.error_of($$ select public.customer_save_application_garden(pg_temp.id('a'),
    '{"name": "Muzluk", "declared_area_m2": 20000, "lon": 37.6, "lat": 37.1, "species": "muz"}',
    '{"authorization_basis": "title_holder", "entry_permission": true}') $$),
  '22023 invalid_input / species', 'the garden form refuses an unknown species');
insert into ids select 'g', public.customer_save_application_garden(pg_temp.id('a'),
  '{"name": "Narlık", "declared_area_m2": 20000, "lon": 37.6, "lat": 37.1, "species": "nar"}',
  '{"authorization_basis": "title_holder", "entry_permission": true}');
select is((select species from public.application_garden where id = pg_temp.id('g')), 'nar',
  'the chosen species is saved and readable by the customer');
select public.customer_save_application_garden(pg_temp.id('a'),
  '{"name": "Narlık", "declared_area_m2": 20000, "lon": 37.6, "lat": 37.1}',
  '{"authorization_basis": "title_holder", "entry_permission": true}', pg_temp.id('g'));
select is((select species from public.application_garden where id = pg_temp.id('g')), 'nar',
  'a save without the species keeps the garden''s');
select public.customer_submit_application(pg_temp.id('a'));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.ops_verify_application_garden(pg_temp.id('g'), 20000);
insert into ids select 'q', public.ops_issue_quote(pg_temp.id('a'));
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
insert into ids select 'o', public.customer_accept_quote(pg_temp.id('q'),
  '{"distance_sales": "mesafeli-v5-taslak", "pre_information": "onbilgi-v5-taslak"}');
reset role;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select public.ops_record_manual_payment(pg_temp.id('o'), 720000, current_date, 'EFT-76');
select is((select status::text from public.service_order where id = pg_temp.id('o')), 'active',
  'the inventory installment paid: the order is active');
select is(
  (select p.species from public.parcel p join public.application_garden g on g.parcel_id = p.id
   where g.id = pg_temp.id('g')),
  'nar', 'the parcel made on activation carries the garden''s species');

select * from finish();
rollback;
