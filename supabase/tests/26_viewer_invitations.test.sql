-- Owner invites a co-owner as viewer (20261024120100_viewer_invitations): the
-- invitation is private, the owner sees it masked, ops sees it in full and
-- approves (viewer access) or rejects it.
-- Seed: owner a0..01, viewer a0..02, field_staff a0..03, expert a0..04, ops a0..05;
-- org b0..01, parcel c0..01.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.as_user(p_id text) returns void language sql
as $$ select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;

-- An account for the co-owner, opened by ops later.
insert into auth.users (id, instance_id, aud, role, phone, created_at, updated_at)
values ('a2600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', '905550002601', now(), now());

select has_table('private', 'viewer_invitation', 'private.viewer_invitation exists');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');

select isa_ok(
  public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', '  Hisse Sahibi  ', '+905550002601'),
  'uuid', 'the owner invites a co-owner');
select is(
  public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Hisse Sahibi', '+905550002601'),
  (select id from public.owner_parcel_viewers('c0000000-0000-4000-8000-000000000001') where kind = 'invitation'),
  'inviting the same phone again returns the open invitation');
select throws_ok(
  $$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'X', '0555 000') $$,
  '22023', 'invalid_input', 'a malformed phone is refused');
select throws_ok(
  $$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', '   ', '+905550002602') $$,
  '22023', 'invalid_input', 'a name is required');
select results_eq(
  $$ select kind, full_name, phone_last2, status from public.owner_parcel_viewers('c0000000-0000-4000-8000-000000000001') $$,
  $$ values ('viewer', 'Örnek Hissedar', '02', 'active'), ('invitation', 'Hisse Sahibi', '01', 'pending') $$,
  'the owner sees viewers and the invitation, phone as two digits');
select throws_ok(
  $$ select * from private.viewer_invitation $$,
  '42501', null, 'the table is not readable from the API');

-- Viewer, staff: no invitations.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Y', '+905550002603') $$,
  '42501', 'forbidden', 'a viewer cannot invite');
select is((select count(*)::int from public.owner_parcel_viewers('c0000000-0000-4000-8000-000000000001')), 0,
          'a viewer does not see the list');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001')), 0,
          'field staff does not see invitations');
select throws_ok(
  $$ select public.ops_resolve_viewer_invitation(
       (select id from public.owner_parcel_viewers('c0000000-0000-4000-8000-000000000001') limit 1), false) $$,
  'P0002', 'not_found', 'field staff cannot resolve (nothing to find)');

-- Ops: full phone, approve.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000005');
select results_eq(
  $$ select parcel_name, full_name, phone, invited_by_name from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001') $$,
  $$ values ('Örnek Bahçe 1', 'Hisse Sahibi', '+905550002601', 'Örnek Sahip') $$,
  'ops sees the open invitation with the full phone and who invited');
select throws_ok(
  $$ select public.ops_resolve_viewer_invitation(
       (select id from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001')), true) $$,
  '22023', 'invalid_input', 'approving needs the account');
select throws_ok(
  $$ select public.ops_resolve_viewer_invitation(
       (select id from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001')), true,
       'a0000000-0000-4000-8000-000000000001') $$,
  'P0001', 'already_owner', 'the owner cannot become a viewer of the same parcel');
select lives_ok(
  $$ select public.ops_resolve_viewer_invitation(
       (select id from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001')), true,
       'a2600000-0000-4000-8000-000000000001') $$,
  'ops approves with the co-owner''s account');
select is(
  (select role::text from public.parcel_access
   where parcel_id = 'c0000000-0000-4000-8000-000000000001' and user_id = 'a2600000-0000-4000-8000-000000000001'),
  'viewer', 'the co-owner is a viewer of the parcel');
select is((select count(*)::int from public.ops_viewer_invitations('b0000000-0000-4000-8000-000000000001')), 0,
          'the approved invitation is no longer open');

-- Owner: reject path and removal.
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.owner_cancel_viewer_invitation(
       public.owner_invite_viewer('c0000000-0000-4000-8000-000000000001', 'Vazgeçilen', '+905550002609')) $$,
  'the owner withdraws an invitation');
select lives_ok(
  $$ delete from public.parcel_access
     where parcel_id = 'c0000000-0000-4000-8000-000000000001' and user_id = 'a2600000-0000-4000-8000-000000000001' $$,
  'the owner removes a viewer');

select * from finish();
rollback;
