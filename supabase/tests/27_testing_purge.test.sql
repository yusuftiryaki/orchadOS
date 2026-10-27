-- Test cleanup functions (supabase/testing/): local and CI databases only.
-- Seed: org b0..01, parcel c0..01 (310 slots, 303 trees), session e0..01, owner a0..01.
-- Fixtures: test org f7..01 with parcel f7..11 and session f7..21; a test parcel
-- f7..12 of the seed org; a test session f7..22 on the seed parcel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- Rows other suites left behind (web, pipeline, AI worker tests, db:demo) are
-- removed first; rolled back with the file (supabase/testing/reset.sql).
select testing.reset_to_seed();

create function pg_temp.id(p_n int) returns uuid language sql immutable
as $$ select ('f7000000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid $$;
create function pg_temp.h(p_text text) returns text language sql immutable
as $$ select encode(sha256(p_text::bytea), 'hex') $$;
create function pg_temp.obj(p_parcel uuid, p_hash text) returns text language sql immutable
as $$ select 'org/' || (select org_id from public.parcel where id = p_parcel) || '/parcel/' || p_parcel || '/' || p_hash $$;
create function pg_temp.n(p_sql text) returns bigint language plpgsql
as $$ declare n bigint; begin execute p_sql into n; return n; end $$;

-- Privileges ---------------------------------------------------------------------

select ok(not has_function_privilege('anon', 'testing.purge_sessions(uuid[])', 'execute'),
  'anon cannot purge');
select ok(not has_function_privilege('authenticated', 'testing.purge_parcels(uuid[])', 'execute'),
  'signed-in users cannot purge');
select ok(not has_schema_privilege('authenticated', 'testing', 'usage'),
  'signed-in users cannot use the testing schema');
select ok(has_function_privilege('service_role', 'testing.purge_sessions(uuid[])', 'execute')
      and has_function_privilege('service_role', 'testing.purge_parcels(uuid[])', 'execute')
      and has_function_privilege('service_role', 'testing.purge_org(uuid)', 'execute')
      and has_function_privilege('service_role', 'testing.purge_billing_users(uuid[])', 'execute'),
  'the service role purges (web and Python tests)');
select ok(not has_function_privilege('service_role', 'testing.reset_to_seed()', 'execute'),
  'reset_to_seed is for pgTAP only');

-- Fixtures -----------------------------------------------------------------------

insert into public.org (id, name, kind) values (pg_temp.id(1), 'Purge test org', 'company');
insert into public.parcel (id, org_id, name) values
  (pg_temp.id(11), pg_temp.id(1), 'Purge test parcel'),
  (pg_temp.id(12), 'b0000000-0000-4000-8000-000000000001', 'Purge test parcel of the seed org');
insert into public.membership (org_id, user_id, role)
values (pg_temp.id(1), 'a0000000-0000-4000-8000-000000000005', 'ops');
insert into public.device (id, org_id, kind, manufacturer, model)
values (pg_temp.id(2), pg_temp.id(1), 'phone', 'x', 'y');
insert into public.rig (id, org_id, name) values (pg_temp.id(3), pg_temp.id(1), 'Purge rig');
insert into public.slot (id, org_id, parcel_id, row_no, position_no) values
  (pg_temp.id(31), pg_temp.id(1), pg_temp.id(11), 1, 1),
  (pg_temp.id(32), 'b0000000-0000-4000-8000-000000000001', pg_temp.id(12), 1, 1);
insert into public.tree (id, org_id, parcel_id, slot_id) values
  (pg_temp.id(41), pg_temp.id(1), pg_temp.id(11), pg_temp.id(31)),
  (pg_temp.id(42), 'b0000000-0000-4000-8000-000000000001', pg_temp.id(12), pg_temp.id(32));

insert into public.session (id, org_id, parcel_id, kind, status) values
  (pg_temp.id(21), pg_temp.id(1), pg_temp.id(11), 'periodic_scan', 'processed'),
  (pg_temp.id(22), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'periodic_scan', 'processed');

-- Session f7..22 on the seed parcel: a capture, an asset, lineage, a measurement
-- with evidence, an assessment, a finding, a notification, a media object.
insert into public.capture (id, org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
select pg_temp.id(51), org_id, parcel_id, id, 'video_360', 's3://raw/x.mp4', pg_temp.h('purge-capture'), now()
from public.session where id = pg_temp.id(22);
insert into public.asset (id, org_id, parcel_id, session_id, kind, uri, content_hash, pipeline, pipeline_version)
select pg_temp.id(52), org_id, parcel_id, id, 'panorama', 'storage://media/x', pg_temp.h('purge-asset'),
       'pipeline', '0.1.0'
from public.session where id = pg_temp.id(22);
insert into public.asset_source (org_id, parcel_id, asset_id, source_capture_id)
select org_id, parcel_id, pg_temp.id(52), pg_temp.id(51) from public.session where id = pg_temp.id(22);
insert into public.measurement (id, org_id, parcel_id, tree_id, metric_definition_id, value_numeric, uncertainty,
  method, method_version, source, session_id, measured_at)
values (pg_temp.id(53), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        md5('orchados-seed:tree:S1-1')::uuid, md5('orchados-seed:metric:trunk_diameter_h30')::uuid,
        24.5, 0.3, 'tape_measure', '1', 'staff', pg_temp.id(22), now());
insert into public.measurement_evidence (org_id, parcel_id, measurement_id, asset_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        pg_temp.id(53), pg_temp.id(52));
insert into public.assessment (id, org_id, parcel_id, session_id, tree_id, source, overall_class, assessed_at)
values (pg_temp.id(54), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        pg_temp.id(22), md5('orchados-seed:tree:S1-1')::uuid, 'expert', 'problem', now());
insert into public.assessment_measurement (org_id, parcel_id, assessment_id, measurement_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        pg_temp.id(54), pg_temp.id(53));
insert into public.finding (id, org_id, parcel_id, session_id, tree_id, assessment_id, kind, severity, description)
values (pg_temp.id(55), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        pg_temp.id(22), md5('orchados-seed:tree:S1-1')::uuid, pg_temp.id(54), 'dead_branch', 'medium', 'x');
insert into public.finding_evidence (org_id, parcel_id, finding_id, asset_id)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        pg_temp.id(55), pg_temp.id(52));
insert into public.notification (id, org_id, parcel_id, session_id, recipient_user_id, channel, template)
values (pg_temp.id(56), 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        pg_temp.id(22), 'a0000000-0000-4000-8000-000000000001', 'sms', 'report_ready');
insert into storage.objects (bucket_id, name) values
  ('media', pg_temp.obj('c0000000-0000-4000-8000-000000000001', pg_temp.h('purge-asset'))),
  ('media', pg_temp.obj(pg_temp.id(11), pg_temp.h('purge-org'))),
  ('media', pg_temp.obj(pg_temp.id(12), pg_temp.h('purge-parcel')));

-- Session f7..21 of the test org.
insert into public.capture (org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
values (pg_temp.id(1), pg_temp.id(11), pg_temp.id(21), 'gnss_raw', 's3://raw/x.ubx', pg_temp.h('purge-org'), now());

select throws_ok(
  format($$ delete from public.capture where id = %L $$, pg_temp.id(51)),
  null, null,
  'without the purge, captures cannot be deleted (insert-only)'
);

-- purge_sessions -----------------------------------------------------------------

create temp table seed_counts as
select (select count(*) from public.capture) as captures,
       (select count(*) from public.asset) as assets,
       (select count(*) from public.measurement) as measurements,
       (select count(*) from public.assessment) as assessments,
       (select count(*) from public.finding) as findings;

select ok(
  (select count(*) from testing.purge_sessions(array[pg_temp.id(22)])) > 0,
  'purge_sessions reports what it deleted'
);
select is(pg_temp.n(format($$ select count(*) from public.session where id = %L $$, pg_temp.id(22))), 0::bigint,
  'the session is gone');
select is((select count(*) from public.capture where session_id = pg_temp.id(22)), 0::bigint, 'its captures');
select is((select count(*) from public.asset where session_id = pg_temp.id(22)), 0::bigint, 'its assets');
select is((select count(*) from public.asset_source where asset_id = pg_temp.id(52)), 0::bigint, 'its lineage');
select is((select count(*) from public.measurement where session_id = pg_temp.id(22)), 0::bigint, 'its measurements');
select is((select count(*) from public.measurement_evidence where measurement_id = pg_temp.id(53)), 0::bigint,
  'measurement evidence');
select is((select count(*) from public.assessment_measurement where assessment_id = pg_temp.id(54)), 0::bigint,
  'assessment inputs');
select is((select count(*) from public.finding_evidence where finding_id = pg_temp.id(55)), 0::bigint,
  'finding evidence');
select is((select count(*) from public.notification where session_id = pg_temp.id(22)), 0::bigint,
  'its notifications');
select is((select count(*) from storage.objects
           where name = pg_temp.obj('c0000000-0000-4000-8000-000000000001', pg_temp.h('purge-asset'))),
  0::bigint, 'the media object nothing points to any more');
select is((select captures + assets + measurements + assessments + findings from seed_counts),
  (select count(*) from public.capture) + (select count(*) from public.asset)
  + (select count(*) from public.measurement) + (select count(*) from public.assessment)
  + (select count(*) from public.finding) + 5,
  'only the session''s rows went');
select is((select count(*) from public.session where id = 'e0000000-0000-4000-8000-000000000001'), 1::bigint,
  'the seed session stays');
select is((select count(*) from public.tree where parcel_id = 'c0000000-0000-4000-8000-000000000001'), 303::bigint,
  'the seed trees stay');
select is(current_setting('session_replication_role'), 'origin', 'triggers are on again afterwards');

-- purge_parcels ------------------------------------------------------------------

select lives_ok($$ select testing.purge_parcels(array[pg_temp.id(12)]) $$, 'purge_parcels runs');
select is((select count(*) from public.parcel where id = pg_temp.id(12)), 0::bigint, 'the parcel is gone');
select is((select count(*) from public.slot where parcel_id = pg_temp.id(12))
          + (select count(*) from public.tree where parcel_id = pg_temp.id(12)), 0::bigint,
  'with its slots and trees');
select is((select count(*) from storage.objects where (storage.foldername(name))[4] = pg_temp.id(12)::text),
  0::bigint, 'and its media objects');
select is((select count(*) from public.slot where parcel_id = 'c0000000-0000-4000-8000-000000000001'), 310::bigint,
  'the seed parcel''s slots stay');
select is((select count(*) from public.org where id = 'b0000000-0000-4000-8000-000000000001'), 1::bigint,
  'the seed org stays');

-- purge_org ----------------------------------------------------------------------

select lives_ok($$ select testing.purge_org(pg_temp.id(1)) $$, 'purge_org runs');
select is((select count(*) from public.org where id = pg_temp.id(1)), 0::bigint, 'the org is gone');
select is((select count(*) from public.parcel where org_id = pg_temp.id(1))
          + (select count(*) from public.session where org_id = pg_temp.id(1))
          + (select count(*) from public.capture where org_id = pg_temp.id(1))
          + (select count(*) from public.tree where org_id = pg_temp.id(1)), 0::bigint,
  'with its parcels, sessions, captures and trees');
select is((select count(*) from public.membership where org_id = pg_temp.id(1))
          + (select count(*) from public.device where org_id = pg_temp.id(1))
          + (select count(*) from public.rig where org_id = pg_temp.id(1)), 0::bigint,
  'its memberships, devices and rigs');
select is((select count(*) from storage.objects where (storage.foldername(name))[2] = pg_temp.id(1)::text),
  0::bigint, 'and its media objects');
select is((select count(*) from public.membership where org_id = 'b0000000-0000-4000-8000-000000000001'), 3::bigint,
  'the seed memberships stay');

-- purge_billing_users ------------------------------------------------------------

-- A customer f7..61 with a profile, consents, a billing profile, a submitted
-- application with a garden and its private detail, and audit rows.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', pg_temp.id(61), 'authenticated', 'authenticated',
        'purge-customer@example.test', now(), now());
insert into private.owner_profile (org_id, user_id, full_name, contact_preference)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id(61), 'Purge Customer', 'sms');
insert into private.consent_record (org_id, subject_id, user_id, kind, granted, text_version, source)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id(61), pg_temp.id(61), 'kvkk_notice', true, 'kvkk-v1', 'signup');
insert into private.billing_profile (org_id, user_id, kind, first_name, last_name, address, city)
values ('b0000000-0000-4000-8000-000000000001', pg_temp.id(61), 'individual', 'P', 'C', 'Adres', 'Gaziantep');
insert into public.service_application (id, org_id, customer_user_id, number, status, package_id, submitted_at)
values (pg_temp.id(62), 'b0000000-0000-4000-8000-000000000001', pg_temp.id(61), 'B-2026-999901', 'submitted',
        '91200000-0000-4000-8000-000000000001', now());
insert into public.application_garden (id, org_id, application_id, customer_user_id, name, declared_area_m2, position)
values (pg_temp.id(63), 'b0000000-0000-4000-8000-000000000001', pg_temp.id(62), pg_temp.id(61), 'Purge garden', 1000,
        extensions.st_setsrid(extensions.st_makepoint(37.5, 37.0), 4326));
insert into private.application_garden_detail (application_garden_id, org_id, entry_permission_at)
values (pg_temp.id(63), 'b0000000-0000-4000-8000-000000000001', now());
insert into public.audit_event (org_id, actor_user_id, actor_role, action, entity_type, entity_id) values
  ('b0000000-0000-4000-8000-000000000001', pg_temp.id(61), 'customer', 'application.submitted', 'application', pg_temp.id(62)),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'ops',
   'application_garden.verified', 'application_garden', pg_temp.id(63));

select throws_ok(format($$ delete from auth.users where id = %L $$, pg_temp.id(61)), '23503', null,
  'a customer with an application cannot be deleted before the purge');
select lives_ok($$ select testing.purge_billing_users(array[pg_temp.id(61)]) $$, 'purge_billing_users runs');
select is((select count(*) from public.service_application where customer_user_id = pg_temp.id(61))
          + (select count(*) from public.application_garden where customer_user_id = pg_temp.id(61))
          + (select count(*) from private.application_garden_detail where application_garden_id = pg_temp.id(63)),
  0::bigint, 'the application, its garden and the garden detail are gone');
select is((select count(*) from private.owner_profile where user_id = pg_temp.id(61))
          + (select count(*) from private.billing_profile where user_id = pg_temp.id(61))
          + (select count(*) from private.consent_record where subject_id = pg_temp.id(61)),
  0::bigint, 'the profiles and consent records are gone');
select is((select count(*) from public.audit_event where actor_user_id = pg_temp.id(61) or entity_id = pg_temp.id(63)),
  0::bigint, 'the audit rows by and about the customer are gone');
select lives_ok(format($$ delete from auth.users where id = %L $$, pg_temp.id(61)), 'the account can be deleted then');
select is((select count(*) from public.service_application where id = '91200000-0000-4000-8000-000000000301')
          + (select count(*) from private.consent_record where subject_id = 'a0000000-0000-4000-8000-000000000006'),
  4::bigint, 'the seed customer''s application and consents stay');

-- reset_to_seed ------------------------------------------------------------------

insert into public.org (id, name, kind) values (pg_temp.id(9), 'Left behind', 'company');
insert into public.capture (org_id, parcel_id, session_id, kind, uri, content_hash, started_at)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
        'e0000000-0000-4000-8000-000000000001', 'other', 's3://raw/left', pg_temp.h('left-behind'), now());
select testing.reset_to_seed();
select is((select count(*) from public.org where id = pg_temp.id(9))
          + (select count(*) from public.capture where content_hash = pg_temp.h('left-behind')), 0::bigint,
  'reset_to_seed removes rows that are not in the seed');

select * from finish();
rollback;
