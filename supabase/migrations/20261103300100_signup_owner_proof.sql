-- Second review round of PR #93 (account pre-hijack): every completion of a
-- pending self sign-up proves that the session belongs to the registrant, and
-- Auth itself sends a phone confirmation code only when the registration flow
-- asked for it (docs/musteri-yonetimi.md §7.2, §7.5).
--
-- 1. signup_owner_check replaces signup_ticket_check and runs on every
--    complete, ticket or not ("no ticket" never skips it). The proof is the
--    ticket of the register that wrote the row, or a session opened with the
--    account's password (amr password). customer-signup's `claim` action
--    turns a password session into a fresh ticket (/kayit/dogrula), because
--    verifyOtp replaces the session and its amr with the code's.
-- 2. Auth-level sending: signup_code_grant (the web's code step, with the
--    ticket) leaves a short-lived "send allowed" marker on the pending row;
--    the Send SMS hook asks signup_sms_allowed, which consumes it. Without the
--    marker a phone confirmation code of an unfinished self sign-up (Auth's
--    public /auth/v1/resend, a phone change) is never sent.
-- 3. Fail closed: a phone code that cannot prove the registrant never leaves
--    the phone confirmed on an unfinished self sign-up. The account goes
--    (customer-signup deletes it); when that fails, or the row was written
--    before tickets, the phone confirmation is cleared, the account's sessions
--    end, and the row is flagged for ops review (private.signup_quarantine).
--
-- signup_code_allowed and signup_ticket_check go: deploy-db (migrations, then
-- functions) lands before the web (docs/deployment.md).

alter table private.customer_signup
  add column code_send_until timestamptz,
  add column review_required_at timestamptz,
  add column review_reason text
    check (review_reason in ('delete_failed', 'unproven_code', 'unfinished'));
comment on column private.customer_signup.code_send_until is
  'Until when Auth may send this pending sign-up one phone confirmation code (signup_code_grant sets it, the Send SMS hook consumes it).';
comment on column private.customer_signup.review_required_at is
  'Set when the sign-up needs an ops look: a hijack candidate that could not be deleted, a phone code that could not prove the registrant, or a confirmed phone left unfinished for a day.';
comment on column private.customer_signup.review_reason is
  'Why review_required_at was set: delete_failed, unproven_code or unfinished.';

drop function public.signup_code_allowed(text, text);
drop function public.signup_ticket_check(uuid, timestamptz, text);

-- 2a. The web's code step: the ticket belongs to this phone's pending self
-- sign-up. Then Auth may send it one phone code within two minutes. Always
-- false without the ticket (32 random bytes), so it tells nothing about the
-- phone.
create function public.signup_code_grant(p_phone text, p_ticket text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_phone is null or p_phone !~ '^\+905[0-9]{9}$'
     or p_ticket is null or length(p_ticket) not between 32 and 128 then
    return false;
  end if;
  update private.customer_signup s
  set code_send_until = now() + interval '2 minutes'
  from auth.users u
  where u.id = s.user_id
    and s.phone = p_phone
    and s.completed_at is null
    and s.ticket_hash = encode(extensions.digest(p_ticket, 'sha256'), 'hex')
    and u.phone = ltrim(p_phone, '+')
    and u.raw_app_meta_data ->> 'signup' = 'self'
  returning s.user_id into v_user;
  return v_user is not null;
end;
$$;
comment on function public.signup_code_grant(text, text) is
  'Sign-up code step: the ticket belongs to this phone''s pending self sign-up; lets Auth send it one phone code within two minutes. Always false without the ticket.';

-- 2b. The Send SMS hook, before any code goes out. A self sign-up account
-- whose phone is not confirmed (or that is changing it) and has not completed
-- its sign-up gets a code only with a fresh marker, which this consumes.
-- Everyone else (invited users, completed customers, a confirmed phone's
-- login code) is unaffected.
create function public.signup_sms_allowed(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  u auth.users;
begin
  select * into u from auth.users where id = p_user_id;
  if not found or coalesce(u.raw_app_meta_data ->> 'signup', '') <> 'self' then
    return true;
  end if;
  if exists (select 1 from private.customer_signup s where s.user_id = p_user_id and s.completed_at is not null) then
    return true;
  end if;
  if u.phone_confirmed_at is not null and coalesce(u.phone_change, '') = '' then
    return true;
  end if;
  update private.customer_signup
  set code_send_until = null
  where user_id = p_user_id and completed_at is null and code_send_until > now();
  return found;
end;
$$;
comment on function public.signup_sms_allowed(uuid) is
  'Send SMS hook: false for a phone confirmation code of an unfinished self sign-up that the registration flow did not ask for (consumes the signup_code_grant marker). Service role only.';

-- 3. Clears the phone confirmation of an unfinished self sign-up without an
-- owner profile, ends its sessions and flags the row for review.
create function private.signup_quarantine(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.owner_profile p where p.user_id = p_user_id) then
    update auth.users set phone_confirmed_at = null
    where id = p_user_id and raw_app_meta_data ->> 'signup' = 'self';
    delete from auth.sessions where user_id = p_user_id;
  end if;
  update private.customer_signup
  set review_required_at = coalesce(review_required_at, now()), review_reason = p_reason,
      code_send_until = null
  where user_id = p_user_id and completed_at is null;
end;
$$;

-- customer-signup complete, when deleting a hijack candidate failed.
create function public.signup_quarantine(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.signup_quarantine(p_user_id, 'delete_failed');
$$;
comment on function public.signup_quarantine(uuid) is
  'customer-signup complete: the hijack candidate could not be deleted; clears its phone confirmation, ends its sessions and flags it for review. Service role only.';

-- 1. Every complete, before signup_complete:
--   no_pending, already_completed  as signup_complete;
--   ok        the request carries the ticket of the register that wrote the
--             row, or the session was opened with the account's password;
--   mismatch  neither, on an unfinished self sign-up without an owner profile
--             whose phone is confirmed (the session's phone code did that or
--             logged in with it: Auth stamps phone_confirmed_at on every
--             phone code, so an earlier confirmation cannot be told apart):
--             the caller deletes the account. Whoever holds the phone is
--             never left in an account they cannot prove they opened; a
--             registrant who lost their ticket registers again;
--   refused   neither, otherwise: nothing to undo (the phone is not confirmed,
--             or the account is not a bare self sign-up). A row written before
--             tickets (ticket_hash null) is quarantined here instead of
--             deleted: its registrant could not hold a ticket, and finishes
--             with their password (/kayit/dogrula, `claim`).
create function public.signup_owner_check(
  p_user_id uuid,
  p_ticket_hash text,
  p_password boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.customer_signup;
  u auth.users;
begin
  select * into s from private.customer_signup where user_id = p_user_id;
  if not found then
    return 'no_pending';
  end if;
  if s.completed_at is not null then
    return 'already_completed';
  end if;
  if p_ticket_hash ~ '^[0-9a-f]{64}$' and s.ticket_hash = p_ticket_hash then
    return 'ok';
  end if;
  if coalesce(p_password, false) then
    return 'ok';
  end if;
  select * into u from auth.users where id = p_user_id;
  if u.raw_app_meta_data ->> 'signup' is distinct from 'self'
     or u.phone_confirmed_at is null
     or exists (select 1 from private.owner_profile p where p.user_id = p_user_id) then
    return 'refused';
  end if;
  if s.ticket_hash is not null then
    return 'mismatch';
  end if;
  perform private.signup_quarantine(p_user_id, 'unproven_code');
  return 'refused';
end;
$$;
comment on function public.signup_owner_check(uuid, text, boolean) is
  'customer-signup complete: whether the session proves the registrant (ticket or password); mismatch names an account the caller deletes, refused quarantines a confirmed sign-up written before tickets. Service role only.';

-- 3. Housekeeping also flags a confirmed phone whose sign-up stayed unfinished
-- for a day: complete never ran or was refused, and ops takes a look.
create or replace function private.signup_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signups integer;
  v_flagged integer;
  v_attempts integer;
begin
  -- A verified phone keeps its pending sign-up: cleanup no longer removes that
  -- account, and complete (with its ticket or password) still needs the row.
  delete from private.customer_signup s
  where s.completed_at is null and s.created_at < now() - interval '24 hours'
    and not exists (select 1 from auth.users u where u.id = s.user_id and u.phone_confirmed_at is not null);
  get diagnostics v_signups = row_count;
  update private.customer_signup s
  set review_required_at = now(), review_reason = 'unfinished'
  where s.completed_at is null and s.review_required_at is null
    and s.created_at < now() - interval '24 hours';
  get diagnostics v_flagged = row_count;
  delete from private.signup_attempt where created_at < now() - interval '2 days';
  get diagnostics v_attempts = row_count;
  return jsonb_build_object('signups_deleted', v_signups, 'signups_flagged', v_flagged,
    'attempts_deleted', v_attempts);
end;
$$;
comment on function private.signup_housekeeping() is
  'Hourly (pg_cron): drops pending sign-ups older than 24 hours whose phone was never verified, flags the verified ones for review, and drops sign-up attempts older than two days.';

revoke all on function public.signup_code_grant(text, text) from public;
revoke all on function public.signup_sms_allowed(uuid) from public, anon, authenticated;
revoke all on function private.signup_quarantine(uuid, text) from public, anon, authenticated;
revoke all on function public.signup_quarantine(uuid) from public, anon, authenticated;
revoke all on function public.signup_owner_check(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.signup_code_grant(text, text) to anon, authenticated, service_role;
grant execute on function public.signup_sms_allowed(uuid) to service_role;
grant execute on function public.signup_quarantine(uuid) to service_role;
grant execute on function public.signup_owner_check(uuid, text, boolean) to service_role;
