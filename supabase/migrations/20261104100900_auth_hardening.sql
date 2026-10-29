-- Auth hardening after PR #93 (docs/gorevler/auth-sertlestirme.md): the
-- account-takeover paths that already existed before it.
--
-- 1. Phone changes. Only a staff account (a membership, and no customer or
--    owner account) changes its phone through Auth (PUT /auth/v1/user), and
--    only by confirming a pending change with the code sent to the new number:
--    customer_account_guard, BEFORE UPDATE ON auth.users, in the style of
--    demo_account_freeze. Every other account (self sign-up, owner, viewer, an
--    invited account without parcels yet) changes its phone only through ops,
--    private.change_account_phone (SQL editor). Locally [auth.sms]
--    enable_confirmations = false applies a phone change without any code,
--    and the Admin API sets a phone directly; both are refused, since the
--    account would get a confirmed phone it does not own, that phone's later
--    login would land in it and ops_find_user_id would hand it to invite-user.
--    The Send SMS hook sends a phone change code (GoTrue v2.197 sends no
--    sms_type: sms.phone is the new number and equals user.new_phone) only for
--    a staff account (account_phone_change_allowed), and always to sms.phone,
--    the new number. Where the trigger cannot be installed the hook's refusal
--    covers hosted projects with phone confirmations on; with them off (local)
--    nothing does: docs/deployment.md.
-- 2. E-mail codes. A self sign-up account never gets an e-mail login code or
--    magic link (recovery token) or an e-mail change: GoTrue records both an
--    e-mail code and a phone code as amr "otp", so on these accounts "otp" has
--    to mean the phone. Their e-mail was never verified by anyone.
-- 3. signup_code_grant is service role only (customer-signup `send_code`,
--    which sends the code itself in the same request), rate limited per
--    pending sign-up, and its marker lives 30 seconds.
-- 4. The Send SMS hook only peeks at the marker (signup_sms_allowed) and
--    consumes it after the provider sent the code (signup_sms_sent).
-- 5. Quarantine first: signup_owner_check quarantines a mismatch in the
--    database before customer-signup deletes the account. A quarantined row
--    (review_required_at) is never removed by housekeeping or cleanup.
-- 6. A wrong code entered by the registrant of a pending sign-up (their
--    ticket) does not count toward the phone login lock: Auth's public resend
--    can replace the code without sending one (accepted, docs/deployment.md).

-- ---------------------------------------------------------------------------
-- 1, 2. customer_account_guard
-- ---------------------------------------------------------------------------

-- A customer or owner account: a self sign-up, an owner profile or access to
-- a parcel (owner or viewer).
create function private.is_customer_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_user_id and u.raw_app_meta_data ->> 'signup' = 'self')
    or exists (select 1 from private.owner_profile p where p.user_id = p_user_id)
    or exists (select 1 from public.parcel_access a where a.user_id = p_user_id);
$$;
comment on function private.is_customer_account(uuid) is
  'A self sign-up, an owner profile or parcel access: the phone changes only through ops (customer_account_guard).';

-- A staff account: a role in a service org (field_staff, expert, ops) and no
-- customer or owner account. The only accounts whose phone changes through
-- Auth, with a code sent to the new number.
create function private.is_staff_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.membership m where m.user_id = p_user_id)
    and not private.is_customer_account(p_user_id);
$$;
comment on function private.is_staff_account(uuid) is
  'A membership and no customer or owner account: the phone changes through Auth, confirmed with a code sent to the new number (customer_account_guard).';

create function private.customer_account_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Phone: a new number, or a pending change to one. Clearing a pending
  -- change is allowed. A staff account may start a change (the hook sends its
  -- code to the new number) and confirm it: the new phone is the pending one.
  -- A direct change (autoconfirm, the Admin API) is refused for everyone. A
  -- demo account is left to demo_account_freeze (demo_account_locked).
  if current_setting('orchados.account_phone_change', true) is distinct from 'on'
     and old.raw_app_meta_data ->> 'demo' is distinct from 'true'
     and ((coalesce(new.phone, '') is distinct from coalesce(old.phone, '')
           and (coalesce(old.phone_change, '') = '' or new.phone is distinct from old.phone_change
                or not private.is_staff_account(old.id)))
          or (coalesce(new.phone_change, '') <> '' and new.phone_change is distinct from old.phone_change
              and not private.is_staff_account(old.id))) then
    raise exception 'phone_change_locked' using errcode = '42501';
  end if;
  -- E-mail codes of a self sign-up: magic link, e-mail login code and
  -- password recovery (recovery token), e-mail change.
  if old.raw_app_meta_data ->> 'signup' = 'self'
     and ((coalesce(new.recovery_token, '') <> '' and new.recovery_token is distinct from old.recovery_token)
          or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change)
          or (coalesce(new.email_change_token_new, '') <> ''
              and new.email_change_token_new is distinct from old.email_change_token_new)
          or (coalesce(new.email_change_token_current, '') <> ''
              and new.email_change_token_current is distinct from old.email_change_token_current)) then
    raise exception 'email_code_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function private.customer_account_guard() is
  'Trigger on auth.users: a phone changes only through private.change_account_phone, or on a staff account by confirming a pending change (phone_change_locked); a self sign-up gets no e-mail code, magic link or e-mail change (email_code_locked).';
revoke all on function private.customer_account_guard() from public;

do $$
begin
  drop trigger if exists customer_account_guard on auth.users;
  create trigger customer_account_guard
  before update on auth.users
  for each row
  when (old.phone is distinct from new.phone
        or old.phone_change is distinct from new.phone_change
        or (old.raw_app_meta_data ->> 'signup' = 'self'
            and (old.recovery_token is distinct from new.recovery_token
                 or old.email_change is distinct from new.email_change
                 or old.email_change_token_new is distinct from new.email_change_token_new
                 or old.email_change_token_current is distinct from new.email_change_token_current)))
  execute function private.customer_account_guard();
exception
  when insufficient_privilege then
    raise warning 'customer_account_guard: no trigger on auth.users (insufficient privilege); phone changes are closed only where phone confirmations are on (docs/deployment.md)';
end;
$$;

-- Ops (SQL editor): the account's new phone, confirmed, after checking who
-- holds it. Pending phone changes go; the account's sessions stay.
create function private.change_account_phone(p_user_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform set_config('orchados.account_phone_change', 'on', true);
  update auth.users
  set phone = ltrim(p_phone, '+'), phone_confirmed_at = now(),
      phone_change = '', phone_change_token = '', phone_change_sent_at = null
  where id = p_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform set_config('orchados.account_phone_change', '', true);
end;
$$;
comment on function private.change_account_phone(uuid, text) is
  'Ops only (SQL editor): sets and confirms an account''s phone; the only way a non-staff account''s phone changes.';
revoke all on function private.change_account_phone(uuid, text) from public, anon, authenticated, service_role;

-- Send SMS hook, for a phone change code (user.new_phone is the destination):
-- only for a staff account; the trigger would refuse any other change after
-- the code went out.
create function public.account_phone_change_allowed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff_account(p_user_id);
$$;
comment on function public.account_phone_change_allowed(uuid) is
  'Send SMS hook: true only for a phone change code of a staff account (private.is_staff_account). Service role only.';

-- ---------------------------------------------------------------------------
-- 3, 4. Code grant and the hook's marker
-- ---------------------------------------------------------------------------

alter table private.customer_signup
  add column code_grants smallint not null default 0,
  add column code_granted_at timestamptz;
comment on column private.customer_signup.code_grants is
  'How many phone codes customer-signup send_code granted this pending sign-up (at most 6).';
comment on column private.customer_signup.code_granted_at is
  'When send_code last granted this pending sign-up a phone code (one a minute).';

drop function public.signup_code_grant(text, text);

-- customer-signup send_code: the ticket belongs to this phone's pending self
-- sign-up. Then Auth may send it one phone code within 30 seconds; the
-- function asks Auth for it in the same request and releases the marker.
-- granted | refused (no such sign-up, or not with this ticket) | too_soon
-- (one a minute) | too_many (six per sign-up).
create function public.signup_code_grant(p_phone text, p_ticket text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.customer_signup;
begin
  if p_phone is null or p_phone !~ '^\+905[0-9]{9}$'
     or p_ticket is null or length(p_ticket) not between 32 and 128 then
    return 'refused';
  end if;
  select c.* into s
  from private.customer_signup c
  join auth.users u on u.id = c.user_id
  where c.phone = p_phone
    and c.completed_at is null
    and c.ticket_hash = encode(extensions.digest(p_ticket, 'sha256'), 'hex')
    and u.phone = ltrim(p_phone, '+')
    and u.raw_app_meta_data ->> 'signup' = 'self'
  for update of c;
  if not found then
    return 'refused';
  end if;
  if s.code_granted_at > now() - interval '55 seconds' then
    return 'too_soon';
  end if;
  if s.code_grants >= 6 then
    return 'too_many';
  end if;
  update private.customer_signup
  set code_send_until = now() + interval '30 seconds', code_grants = code_grants + 1,
      code_granted_at = now()
  where user_id = s.user_id;
  return 'granted';
end;
$$;
comment on function public.signup_code_grant(text, text) is
  'customer-signup send_code: the ticket belongs to this phone''s pending self sign-up; lets Auth send it one phone code within 30 seconds (one a minute, six per sign-up). Service role only.';

-- customer-signup send_code, after Auth answered: whatever happened, the
-- marker does not outlive the request.
create function public.signup_code_release(p_phone text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.customer_signup set code_send_until = null
  where phone = p_phone and completed_at is null and code_send_until is not null;
$$;
comment on function public.signup_code_release(text) is
  'customer-signup send_code: drops the marker of the phone''s pending sign-up once Auth answered. Service role only.';

-- The Send SMS hook, before any code goes out: whether this user may get a
-- code now. Only peeks at the marker; signup_sms_sent consumes it once the
-- provider sent the code, so a failed send or Auth's retry keeps it.
create or replace function public.signup_sms_allowed(p_user_id uuid)
returns boolean
language plpgsql
stable
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
  return exists (
    select 1 from private.customer_signup s
    where s.user_id = p_user_id and s.completed_at is null and s.code_send_until > now()
  );
end;
$$;
comment on function public.signup_sms_allowed(uuid) is
  'Send SMS hook: false for a phone confirmation code of an unfinished self sign-up that customer-signup send_code did not grant. Does not consume the marker (signup_sms_sent does). Service role only.';

create function public.signup_sms_sent(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.customer_signup set code_send_until = null
  where user_id = p_user_id and completed_at is null and code_send_until is not null;
$$;
comment on function public.signup_sms_sent(uuid) is
  'Send SMS hook, after the provider sent a code: consumes the pending sign-up''s marker. Service role only.';

-- ---------------------------------------------------------------------------
-- 5. Quarantine first; quarantined rows stay for ops
-- ---------------------------------------------------------------------------

-- As in 20261103300100, except that a mismatch is quarantined here, in the
-- same transaction, before the caller deletes the account: when the delete
-- fails the phone confirmation is already gone and the row stays flagged
-- (delete_failed: a row ops still sees with this reason is one whose delete
-- did not happen).
create or replace function public.signup_owner_check(
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
    perform private.signup_quarantine(p_user_id, 'delete_failed');
    return 'mismatch';
  end if;
  perform private.signup_quarantine(p_user_id, 'unproven_code');
  return 'refused';
end;
$$;
comment on function public.signup_owner_check(uuid, text, boolean) is
  'customer-signup complete: whether the session proves the registrant (ticket or password). mismatch quarantines the account (phone confirmation cleared, sessions ended, delete_failed) before the caller deletes it; refused quarantines a confirmed sign-up written before tickets. Service role only.';

-- As in 20261103300100, except that a quarantined row (review_required_at)
-- is never deleted: ops resolves it.
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
  delete from private.customer_signup s
  where s.completed_at is null and s.created_at < now() - interval '24 hours'
    and s.review_required_at is null
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
  'Hourly (pg_cron): drops pending sign-ups older than 24 hours whose phone was never verified and that are not under review, flags the verified ones for review, and drops sign-up attempts older than two days.';

-- customer-signup cleanup: accounts whose pending sign-up is under review,
-- which the unverified-account cleanup leaves alone.
create function public.signup_review_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id from private.customer_signup s
  where s.review_required_at is not null and s.completed_at is null;
$$;
comment on function public.signup_review_user_ids() is
  'customer-signup cleanup: accounts of pending sign-ups under ops review; never deleted by the cleanup. Service role only.';

-- ---------------------------------------------------------------------------
-- 6. Wrong codes of the registrant of a pending sign-up
-- ---------------------------------------------------------------------------

drop function public.phone_login_record_failure(text);

-- Login and sign-up pages: a wrong code for this number; returns the attempts
-- left. With the ticket of the phone's pending, unconfirmed self sign-up the
-- code is not counted: Auth's public resend can replace that sign-up's code
-- without sending one, and its registrant then sends a new one. Without that
-- ticket (32 random bytes) every call counts, so the answer tells nothing.
create function public.phone_login_record_failure(p_phone text, p_ticket text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := private.phone_hash(p_phone);
  v_failed integer;
begin
  if p_ticket is not null and length(p_ticket) between 32 and 128 and exists (
    select 1 from private.customer_signup s
    join auth.users u on u.id = s.user_id
    where s.phone = p_phone and s.completed_at is null
      and s.ticket_hash = encode(extensions.digest(p_ticket, 'sha256'), 'hex')
      and u.phone = ltrim(p_phone, '+') and u.phone_confirmed_at is null
  ) then
    select count(*) into v_failed from private.phone_login_attempt a
    where a.phone_hash = v_hash and a.kind = 'code_failed' and a.created_at > now() - interval '15 minutes';
    return greatest(0, 5 - v_failed);
  end if;
  insert into private.phone_login_attempt (phone_hash, kind) values (v_hash, 'code_failed');
  select count(*) into v_failed from private.phone_login_attempt a
  where a.phone_hash = v_hash and a.kind = 'code_failed' and a.created_at > now() - interval '15 minutes';
  return greatest(0, 5 - v_failed);
end;
$$;
comment on function public.phone_login_record_failure(text, text) is
  'Login and sign-up pages: counts a wrong code for the number (not with the ticket of its pending, unconfirmed self sign-up); returns the attempts left (0: locked for 15 minutes).';

revoke all on function private.is_customer_account(uuid) from public, anon, authenticated;
revoke all on function private.is_staff_account(uuid) from public, anon, authenticated;
revoke all on function public.account_phone_change_allowed(uuid) from public, anon, authenticated;
revoke all on function public.signup_code_grant(text, text) from public, anon, authenticated;
revoke all on function public.signup_code_release(text) from public, anon, authenticated;
revoke all on function public.signup_sms_sent(uuid) from public, anon, authenticated;
revoke all on function public.signup_review_user_ids() from public, anon, authenticated;
revoke all on function public.phone_login_record_failure(text, text) from public;
grant execute on function public.account_phone_change_allowed(uuid) to service_role;
grant execute on function public.signup_code_grant(text, text) to service_role;
grant execute on function public.signup_code_release(text) to service_role;
grant execute on function public.signup_sms_sent(uuid) to service_role;
grant execute on function public.signup_review_user_ids() to service_role;
grant execute on function public.phone_login_record_failure(text, text) to anon, authenticated, service_role;
