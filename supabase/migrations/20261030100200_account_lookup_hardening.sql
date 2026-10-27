-- IP12 / 3: account lookup for linking after self sign-up (docs/musteri-yonetimi.md
-- §6.5, §7.4).
--
-- A self sign-up account (app_metadata.signup = 'self') is opened with the
-- e-mail marked confirmed (password login needs it), but nobody verified that
-- the e-mail belongs to the person. So ops_find_user_id, which invite-user and
-- the co-owner approval use to link an existing account:
-- 1. never returns a self sign-up account for an e-mail match;
-- 2. returns a phone match only when the phone is confirmed (SMS code);
-- 3. returns a self sign-up account for a phone match only when its sign-up
--    was completed (private.customer_signup.completed_at).
-- When nothing is returned, invite-user tries to open a new account; Auth
-- answers 422 for the taken e-mail or phone and invite-user returns 409
-- conflict, so an attacker's account is never linked to the victim's parcels.
-- Same signature as before (20261021220000_operations_screens.sql).

create or replace function public.ops_find_user_id(p_org_id uuid, p_email text default null, p_phone text default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_org_id is null or p_org_id not in (select authz.user_org_ids('{ops}')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(p_email), '') is not null then
    select u.id into v_id from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and coalesce(u.raw_app_meta_data ->> 'signup', '') <> 'self';
  elsif nullif(btrim(p_phone), '') is not null then
    -- Auth stores phone numbers without the leading +.
    select u.id into v_id from auth.users u
    where u.phone = ltrim(btrim(p_phone), '+')
      and u.phone_confirmed_at is not null
      and (
        coalesce(u.raw_app_meta_data ->> 'signup', '') <> 'self'
        or exists (
          select 1 from private.customer_signup s
          where s.user_id = u.id and s.completed_at is not null
        )
      );
  end if;
  return v_id;
end;
$$;
comment on function public.ops_find_user_id(uuid, text, text) is
  'Ops: id of the account with this e-mail (or confirmed phone), or null. Self sign-up accounts are never matched by e-mail, and by phone only after a completed sign-up.';
