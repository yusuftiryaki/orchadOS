-- Review of PR #93 (legal T19/T12): bind the sign-up's code step to the
-- registration that wrote the pending row, and keep spent self-hosted captcha
-- challenges in the database.
--
-- 1. Sign-up ticket (docs/musteri-yonetimi.md §7, docs/hukuk/kararlar.md H33).
--    Every 200 of customer-signup `register` carries an opaque ticket; the web
--    keeps it in an httpOnly cookie. Only the SHA-256 of the ticket of a
--    register that opened an account is stored (customer_signup.ticket_hash,
--    signup_set_ticket right after signup_prepare).
--    - signup_ticket_users: the account whose pending sign-up a register's
--      ticket belongs to; the same registrant changing their details replaces
--      their own sign-up in progress.
--    - signup_code_allowed: the web asks Auth for a phone confirmation code
--      (resend) only for the registrant's own pending sign-up, never for an
--      account someone else opened with that phone (account pre-hijack).
--    - signup_ticket_check: complete refuses a pending sign-up whose ticket
--      the request does not carry; ticket_mismatch when the account is an
--      uncompleted self sign-up whose phone this very code confirmed
--      (customer-signup deletes it), ticket_refused otherwise.
-- 2. private.captcha_spent: ALTCHA solutions already used, shared by every
--    Edge instance (captcha_spend), until their challenge expires.
--
-- New functions only: signup_find_account, signup_prepare and signup_complete
-- keep their signatures and bodies.

alter table private.customer_signup
  add column ticket_hash text check (ticket_hash ~ '^[0-9a-f]{64}$');
comment on column private.customer_signup.ticket_hash is
  'SHA-256 (hex) of the ticket the register that wrote this row returned; null for rows written before tickets.';

-- 1a. Stores the register's ticket hash on the pending sign-up it just wrote.
create function public.signup_set_ticket(p_user_id uuid, p_ticket_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ticket_hash is null or p_ticket_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input' using errcode = '22023', detail = 'ticket_hash';
  end if;
  update private.customer_signup set ticket_hash = p_ticket_hash
  where user_id = p_user_id and completed_at is null;
  if not found then
    raise exception 'invalid_input' using errcode = '22023', detail = 'user_id';
  end if;
end;
$$;
comment on function public.signup_set_ticket(uuid, text) is
  'customer-signup register: stores the hash of the register''s ticket on the pending sign-up it wrote. Service role only.';

-- 1b. The accounts whose uncompleted pending sign-up carries this ticket hash.
create function public.signup_ticket_users(p_ticket_hash text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id from private.customer_signup s
  where p_ticket_hash ~ '^[0-9a-f]{64}$' and s.ticket_hash = p_ticket_hash and s.completed_at is null;
$$;
comment on function public.signup_ticket_users(text) is
  'customer-signup register: the account whose pending sign-up the sent ticket belongs to (the same registrant again). Service role only.';

-- 1c. complete with a ticket (the /kayit code step), before signup_complete:
--   no_pending, already_completed  as signup_complete (no ticket needed);
--   ok                the pending sign-up carries this ticket hash;
--   ticket_mismatch   it does not, and the account is an uncompleted self
--                     sign-up without an owner profile whose phone this code
--                     confirmed (not before): the caller deletes the account;
--   ticket_refused    any other mismatch: refused, nothing deleted.
-- Without a ticket (the signed-in /kayit/dogrula page, whose session came from
-- the account's password) customer-signup does not call it.
create function public.signup_ticket_check(p_user_id uuid, p_code_at timestamptz, p_ticket_hash text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s private.customer_signup;
begin
  select * into s from private.customer_signup where user_id = p_user_id;
  if not found then
    return 'no_pending';
  end if;
  if s.completed_at is not null then
    return 'already_completed';
  end if;
  if p_ticket_hash is not null and s.ticket_hash is not distinct from p_ticket_hash then
    return 'ok';
  end if;
  if p_code_at is not null
     and exists (
       select 1 from auth.users u
       where u.id = s.user_id
         and u.raw_app_meta_data ->> 'signup' = 'self'
         -- amr timestamps are whole seconds and follow the confirmation.
         and u.phone_confirmed_at >= date_trunc('second', p_code_at) - interval '1 minute'
     )
     and not exists (select 1 from private.owner_profile p where p.user_id = s.user_id) then
    return 'ticket_mismatch';
  end if;
  return 'ticket_refused';
end;
$$;
comment on function public.signup_ticket_check(uuid, timestamptz, text) is
  'customer-signup complete: whether the code step''s ticket belongs to the pending sign-up; ticket_mismatch names an account the caller deletes. Service role only.';

-- 1d. The web's code step: the phone has a pending, unconfirmed self sign-up
-- written by the register that returned this ticket. Only then may the web
-- ask Auth for a phone confirmation code (resend). Without the ticket (32
-- random bytes) the answer is always false, so it tells nothing about the
-- phone.
create function public.signup_code_allowed(p_phone text, p_ticket text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_phone ~ '^\+905[0-9]{9}$'
    and coalesce(length(p_ticket) between 32 and 128, false)
    and exists (
      select 1
      from private.customer_signup s
      join auth.users u on u.id = s.user_id
      where s.phone = p_phone
        and s.completed_at is null
        and s.ticket_hash = encode(extensions.digest(p_ticket, 'sha256'), 'hex')
        and u.phone = ltrim(p_phone, '+')
        and u.phone_confirmed_at is null
        and u.raw_app_meta_data ->> 'signup' = 'self'
    );
$$;
comment on function public.signup_code_allowed(text, text) is
  'Sign-up code step: the ticket belongs to this phone''s pending, unconfirmed self sign-up (then a phone confirmation code may be asked for). Always false without the ticket.';

-- 2. Spent ALTCHA challenges (supabase/functions/_shared/captcha.ts).
create table private.captcha_spent (
  challenge text primary key check (challenge ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('signup', 'demo')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table private.captcha_spent is
  'Self-hosted captcha (ALTCHA) challenges already solved, kept until they expire: a solution is accepted once across all Edge instances. No personal data.';
create index captcha_spent_expires_idx on private.captcha_spent (expires_at);
alter table private.captcha_spent enable row level security;
select private.attach_demo_guard('private.captcha_spent');

-- True the first time a challenge is spent; false on a replay. Removes a
-- bounded batch of expired rows on the way.
create function public.captcha_spend(p_challenge text, p_purpose text, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_challenge is null or p_challenge !~ '^[0-9a-f]{64}$'
     or p_purpose is null or p_purpose not in ('signup', 'demo')
     or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '1 hour' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  delete from private.captcha_spent
  where ctid in (select ctid from private.captcha_spent where expires_at < now() limit 200);
  insert into private.captcha_spent (challenge, purpose, expires_at)
  values (p_challenge, p_purpose, p_expires_at)
  on conflict (challenge) do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
comment on function public.captcha_spend(text, text, timestamptz) is
  'customer-signup and demo-start: records a solved ALTCHA challenge; false when it was already used. Service role only.';

revoke all on function public.signup_set_ticket(uuid, text) from public, anon, authenticated;
revoke all on function public.signup_ticket_users(text) from public, anon, authenticated;
revoke all on function public.signup_ticket_check(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.signup_code_allowed(text, text) from public;
revoke all on function public.captcha_spend(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.signup_set_ticket(uuid, text) to service_role;
grant execute on function public.signup_ticket_users(text) to service_role;
grant execute on function public.signup_ticket_check(uuid, timestamptz, text) to service_role;
grant execute on function public.signup_code_allowed(text, text) to anon, authenticated, service_role;
grant execute on function public.captcha_spend(text, text, timestamptz) to service_role;
