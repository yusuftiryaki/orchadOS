-- T23 (H05): the approving expert's name and title. private.staff_profile,
-- ops_staff, ops_save_staff_profile, visit_approver; the new settings default
-- to false without a settings row.
-- Seed: org b0..01 (profiles for a0..03 no title, a0..04 expert, a0..05 ops),
-- owner a0..01, viewer a0..02 of parcel c0..01. One transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select testing.reset_to_seed();

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function pg_temp.error_of(p_sql text) returns text language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

select ok(not has_table_privilege('authenticated', 'private.staff_profile', 'SELECT'), 'API users do not read staff profiles');
select ok(not has_function_privilege('anon', 'public.visit_approver(uuid)', 'EXECUTE'), 'anon cannot call visit_approver');
select is((private.billing_setting('ab000000-0000-4000-8000-0000000000ff')).coowner_notice_flow_enabled, false,
  'without a settings row the co-owner flow is off');
select is((private.billing_setting('ab000000-0000-4000-8000-0000000000ff')).boundary_declaration_required, false,
  'and the boundary declaration');
select is((private.billing_setting('ab000000-0000-4000-8000-0000000000ff')).kvkk_request_form_enabled, false,
  'and the KVKK form');

-- A published visit signed by the seed expert, and one in review.
insert into public.session (id, org_id, parcel_id, kind, status, started_at)
values ('61000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-11-01 07:00:00+00'),
       ('61000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'periodic_scan', 'in_review', '2026-11-02 07:00:00+00');
update public.session set status = 'published', published_at = now(),
  published_by = 'a0000000-0000-4000-8000-000000000004'
where id = '61000000-0000-4000-8000-000000000001';

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select is(public.visit_approver('61000000-0000-4000-8000-000000000001'),
  '{"name": "Örnek Uzman", "title": "Ziraat Mühendisi"}'::jsonb, 'the owner reads the approving expert''s name and title');
select is(public.visit_approver('61000000-0000-4000-8000-000000000002'), null, 'nothing for a visit in review');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(public.visit_approver('61000000-0000-4000-8000-000000000001') ->> 'name', 'Örnek Uzman', 'the viewer too');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006');
select is(public.visit_approver('61000000-0000-4000-8000-000000000001'), null, 'a customer of another parcel reads nothing');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select is((select count(*) from public.ops_staff('b0000000-0000-4000-8000-000000000001')), 3::bigint,
  'ops lists the three staff members');
select is((select title from public.ops_staff('b0000000-0000-4000-8000-000000000001')
           where user_id = 'a0000000-0000-4000-8000-000000000003'), null, 'the field staff member has no title');
select lives_ok($$ select public.ops_save_staff_profile('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000004', '  Ayşe   Uzman ', 'Dr. Ziraat Mühendisi') $$, 'ops saves a name and title');
select is((select full_name || ' / ' || title from public.ops_staff('b0000000-0000-4000-8000-000000000001')
           where user_id = 'a0000000-0000-4000-8000-000000000004'), 'Ayşe Uzman / Dr. Ziraat Mühendisi',
  'spaces are tidied');
select is(pg_temp.error_of($$ select public.ops_save_staff_profile('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001', 'Sahip Kişi', null) $$), 'P0002 not_found', 'an owner is not staff');
select is(pg_temp.error_of($$ select public.ops_save_staff_profile('b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000004', ' ', null) $$), '22023 invalid_input', 'a name is required');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(pg_temp.error_of($$ select * from public.ops_staff('b0000000-0000-4000-8000-000000000001') $$),
  '42501 forbidden', 'the expert does not manage staff');

reset role;
select is((select details from public.audit_event where action = 'staff_profile.saved' order by created_at desc limit 1),
  '{"has_title": true}'::jsonb, 'the audit row carries no name');

-- The demo shows no name (H05: "demo dışında").
insert into public.org (id, name, kind) values ('61000000-0000-4000-8000-0000000000d0', 'Demo 61', 'service_provider');
insert into public.membership (org_id, user_id, role)
values ('61000000-0000-4000-8000-0000000000d0', 'a0000000-0000-4000-8000-000000000004', 'expert');
insert into public.parcel (id, org_id, name) values ('61000000-0000-4000-8000-0000000000d1', '61000000-0000-4000-8000-0000000000d0', 'Demo');
insert into public.session (id, org_id, parcel_id, kind, status, started_at, published_at, published_by)
values ('61000000-0000-4000-8000-0000000000d2', '61000000-0000-4000-8000-0000000000d0',
        '61000000-0000-4000-8000-0000000000d1', 'periodic_scan', 'published', now(), now(),
        'a0000000-0000-4000-8000-000000000004');
insert into private.demo_org (org_id) values ('61000000-0000-4000-8000-0000000000d0');
set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004');
select is(public.visit_approver('61000000-0000-4000-8000-0000000000d2'), null, 'no approver in a demo org');

select * from finish();
rollback;
