# İP13-A Demo erişimi: veritabanı korumaları, hesap kilidi, demo-start ve dağıtım denetimleri

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip13-a-demo-erisim.md`. Wave 1. Design: `docs/demo-turu.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 is fully merged there, including integration fix #61.
2. **No dependencies.** You run in parallel with the other wave-1 stream.
3. **Branch.** Push to `claude/ip13-demo-erisim`. If the session forces a different name, state it in the PR and in your final message.
4. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
6. **Human-only infrastructure.** The separate demo Supabase project, the Vercel project and the domain do not exist yet. Build and test everything locally and in CI. Write down in the PR every step a human must do.
7. **Time.** Run only the test suites that matter. Run commands longer than 10 minutes in the background.
8. **Final message.** Report: branch, PR URL, commits, each test command with pass/fail counts, any deviations from the design-doc contracts, and follow-ups.

---

You are implementing stream A of İP13 "Demo turu" (demo tour) for orchadOS. It is the database and Edge Function layer that gives prospective customers a short-lived, read-only demo account, plus the lockdown that keeps such an account from ever reaching real data.

## Context
- Repo yusuftiryaki/orchadOS (checked out in your environment). orchadOS is an independent audit service for pistachio orchards: Next.js owner portal and back office (`apps/web`), Supabase (`supabase/`), Python processing pipeline (`services/pipeline`).
- Read first:
    - `CLAUDE.md`
    - `docs/demo-turu.md`, the İP13 design doc. It is on main. Sections §2–§7, §12–§15 and §17 concern you; its names and signatures are binding.
    - `docs/musteri-yonetimi.md` §7. You mirror the `customer-signup` pattern described there.
    - `docs/deployment.md`
    - `supabase/testing/README.md`
- Binding rules from CLAUDE.md:
    - Owner PII lives in the `private` schema and is never sent to an LLM.
    - Real field imagery never enters the repo.
    - Media is immutable and content-hash addressed.
    - Measurements are versioned.
    - Docs are in Turkish. Code, identifiers, comments and commit messages are in English.
- Base: create branch `claude/ip13-demo-erisim` from the latest `origin/main` (at least `e68bf9c`). That contains all of İP12: #53 site and sign-up, #57 back office, #58 customer billing portal. The newest migration is `20261031200000_ops_customer_lookups.sql`.
- Hosting decision (doc §3.4):
    - The public demo runs only on a dedicated demo Supabase project with its own Vercel deployment. The pilot (production) project never hosts it.
    - Your migrations and functions still deploy to every project (test, pilot, demo). Every object must therefore be inert where no demo org exists.
    - Every protection here is defence in depth and must hold on its own, even on a project with real orgs.
- Parallel streams:
    - Stream B (`claude/ip13-demo-verisi`, wave 1) builds the synthetic dataset and its loader. It writes your registry tables, and uploads to your `demo-media` bucket, only when they exist.
    - Stream C (`claude/ip13-demo-arayuz`, wave 2) builds the web UI on your contracts.
    - Keep every name below exactly as written. If you must deviate, say so prominently in the PR.

## Goal
1. An Edge Function opens a short-lived demo account through the Admin API, only where the Edge secret `ORCHADOS_DEMO_MODE` allows it.
2. A database function grants the account `owner` access to the active parcels of the one enabled demo org.
3. The database refuses every write a demo request makes.
4. A demo account can never change its e-mail, phone, password or user metadata, can never be linked to a non-demo org, and never gets a membership, profile, consent or sign-up row. These rules hold for every caller, the service role and ops included.
5. Edge Functions that write with the service role refuse demo callers explicitly.
6. A demo account never causes a notification, an SMS, an AI write or a billing row, and never sees other demo visitors.
7. Real users are unaffected.

## Do NOT use Supabase anonymous sign-in
GoTrue's `SignupAnonymously` returns `signup_disabled` when `enable_signup = false`. This project keeps sign-ups closed by decision (İP12, on every hosted project). Opening them would expose `/auth/v1/signup` to e-mail and phone sign-ups, and phone sign-ups mean SMS pumping. Leave `[auth] enable_signup = false` and `enable_anonymous_sign_ins = false` untouched. Also leave manual identity linking off.

## Why the account lockdown exists (read before coding)
- Locally `[auth.sms] enable_confirmations = false` and `[auth.email] enable_confirmations = false`. With confirmations off, GoTrue applies `PUT /auth/v1/user` phone and e-mail changes immediately and marks them confirmed. No SMS or mail is sent, so the send-sms hook never runs.
- A demo visitor could therefore set the confirmed phone or e-mail of a person ops is about to invite. `public.ops_find_user_id` (20261030100200_account_lookup_hardening.sql) would return the demo account. `invite-user`, or the co-owner approval in `apps/web/src/lib/operations/invitations.ts`, would then link it to a real parcel, and the visitor could read real orchard data.
- The same trick lets a visitor squat a phone: `decideMatches` in `_shared/signup.ts` returns `existing_account`, so the real person cannot sign up.
- Cleanup would later delete the account and silently remove those real `parcel_access` rows.
- Your controls must not depend on Auth confirmations.

## Deliverables

### 1. Migration `supabase/migrations/20261101120000_demo_access.sql`
Tables in `private`: revoke all from `public`, `anon` and `authenticated`; enable RLS with no policies. Use exactly the DDL in doc §5.1:
- `private.demo_org`. It has new columns `max_sign_calls`, `max_pdf_renders`, `visitor_email_domain` (default `demo.orchados.invalid`) and nullable `loaded_at`, plus the check `not enabled or loaded_at is not null`. Keep the partial unique index `demo_org_one_enabled`.
- `private.demo_parcel`, with a trigger requiring `public.parcel.org_id = demo_parcel.org_id`.
- `private.demo_session`, with columns `sign_calls` and `pdf_renders`, indexed on `expires_at`.
- `private.demo_attempt`, with primary key `(ip_hash, outcome, minute)` and a `hits` counter, indexed on `(outcome, minute)`.

`private.demo_org.tour` is jsonb with keys `parcel_id`, `tree_id`, `session_id`, `previous_session_id`, `inventory_session_id`.

Functions. All are `set search_path = ''`. Use security definer where they touch `private` or `auth`. Each has a `comment on function`.

- **`authz.is_demo_user() returns boolean`**
    - Stable: `coalesce(auth.jwt() -> 'app_metadata' ->> 'demo', '') = 'true'`.
    - Grant execute to `anon` and `authenticated`.
- **`authz.is_demo_account(p_user_id uuid) returns boolean`**
    - Security definer, stable, granted to `authenticated`.
    - True when the `auth.users` row has `raw_app_meta_data ->> 'demo' = 'true'`.
- **`private.is_demo_org(p_org_id uuid) returns boolean`**
- **`private.assert_not_demo()`:** `raise exception 'demo_read_only' using errcode = '42501'` when `authz.is_demo_user()`.
- **`public.demo_admit(p_ip_hash text) returns jsonb`** (`service_role` only)
    - Runs under `pg_advisory_xact_lock(hashtext('orchados.demo_admit'))`.
    - Every outcome upserts its `(ip_hash, outcome, date_trunc('minute', now()))` row with `hits = hits + 1`. Rejections never add more than one row per bucket and minute.
    - Limits count only `admitted` hits.
    - No enabled demo org: outcome `closed`, error `demo_closed`.
    - Per-IP admitted hits in the last hour ≥ `ip_hourly_limit`, or in the last day ≥ `ip_daily_limit`: outcome `rate_limited`.
    - Active sessions (`expires_at > now()` and `ended_at is null`) ≥ `max_active_sessions`, or admitted hits of all IPs in the last 24 h ≥ `max_daily_starts`: outcome `capacity`, error `demo_capacity`.
    - Otherwise return `{ok: true, org_id, ttl_seconds, email_domain}`, with `email_domain` taken from `visitor_email_domain`.
- **`public.demo_start(p_user_id uuid, p_ip_hash text) returns jsonb`** (`service_role` only)
    - The account must satisfy all of these, otherwise raise `not_demo_account` (22023):
        - it exists and has `raw_app_meta_data ->> 'demo' = 'true'`
        - `created_at > now() - interval '10 minutes'`
        - `phone is null`
        - `lower(email)` ends with `'@' || visitor_email_domain` of the enabled org
        - `coalesce(encrypted_password, '') = ''`
        - no `public.membership` row and no `private.owner_profile` row
    - Needs an enabled demo org, otherwise `demo_closed` (P0001). Re-checks `max_active_sessions` under the same lock, otherwise `demo_capacity` (P0001).
    - Inserts `demo_session` with `expires_at = now() + session_ttl`, `on conflict (user_id) do nothing`.
    - Inserts `public.parcel_access(org_id, parcel_id, user_id, role 'owner', granted_by null)` for each active `demo_parcel`, `on conflict (parcel_id, user_id) do nothing`.
    - Returns `{org_id, expires_at, parcel_ids, next: '/portal?tur=bahceler'}`. A second call returns the same result.
- **`public.demo_info() returns jsonb`** (`authenticated`)
    - For a caller with a `demo_session`: `{org_id, expires_at, tour, parcels: [{id, name}]}`, active parcels ordered by `sort_order`.
    - For anyone else: `null`.
- **`public.demo_end() returns void`** (`authenticated`): sets `expires_at = least(expires_at, now())` and `ended_at = coalesce(ended_at, now())` on the caller's own row.
- **`public.demo_hit(p_kind text) returns boolean`** (`authenticated`)
    - `p_kind` is `sign` or `pdf`; anything else raises `invalid_input` (22023).
    - Increments `sign_calls` or `pdf_renders` on the caller's active `demo_session`.
    - Returns true while the new value is ≤ `max_sign_calls` or `max_pdf_renders`. Returns false when over the cap or when there is no active session.
- **`public.demo_expired_accounts(p_limit integer default 200, p_exclude uuid[] default '{}') returns setof uuid`** (`service_role`). Returns deletable accounts not in `p_exclude`:
    - **Expired:** `demo_session.expires_at <= now()`, the demo flag, and no row in `public.membership`, `private.owner_profile`, `private.billing_profile`, `private.consent_record` (by `user_id`) or `private.customer_signup`.
    - **Orphans:** the demo flag, `created_at < now() - interval '1 day'` and no `demo_session`. They must also meet the expired-account conditions, plus all of:
        - e-mail matches `ziyaretci-%@` followed by any `visitor_email_domain`
        - `phone is null`
        - no `parcel_access` outside demo orgs
- **`public.demo_undeletable_count() returns integer`** (`service_role`): the number of demo-flag accounts that are expired or older than a day but fail those conditions.
- **`public.demo_purge_audit_log(p_user_ids uuid[]) returns integer`** (`service_role`)
    - Deletes `auth.audit_log_entries` rows whose `payload ->> 'actor_id'` is one of the ids.
    - Returns 0, without raising, on `insufficient_privilege` or when the table is missing.
- **`private.dispatch_demo_cleanup()`**
    - Copy `private.dispatch_signup_cleanup()` from `20261030100300_signup_consent_profiles.sql`.
    - Read the Vault secrets `demo_cleanup_url` and `orchados_cron_secret`. Call `net.http_post` with body `{action: 'cleanup'}` and header `x-orchados-cron-secret`.
    - Return null when either secret is missing.
- **`private.demo_housekeeping()`:** a first version here; the lockdown migration replaces it. It deletes `parcel_access` rows of users whose `demo_session.expires_at <= now()`, and `demo_attempt` rows older than 48 h.
- **Cron:** `cron.schedule('demo-cleanup', '*/15 * * * *', 'select private.dispatch_demo_cleanup()')` and `cron.schedule('demo-housekeeping', '*/5 * * * *', 'select private.demo_housekeeping()')`.
- **Billing guard:** a trigger `private.demo_org_billing_guard()` on `public.org_billing_setting`, insert and update. It raises `demo_billing_forbidden` (23514) for a demo org with `accepts_signups` or `allow_fake_payments`. An insert into `private.demo_org` for an org with such a row also fails. Check the column names in `20261030100100_billing_tables.sql`.

### 2. Migration `supabase/migrations/20261101120100_demo_write_guard.sql`
- **Statement guard:**
    - `private.deny_demo_write() returns trigger`: raises `demo_read_only` (42501) when `authz.is_demo_user()`, otherwise returns null.
    - `private.attach_demo_guard(p_table regclass)` idempotently creates `zz_demo_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ... FOR EACH STATEMENT`.
    - A `DO` block attaches it to every base table (`relkind in ('r','p')`) in `public` and `private`. Exceptions: extension-owned tables (`pg_depend.deptype = 'e'`) and `private.demo_session`.
    - Add a comment that every future table-creating migration must call it.
- **Restrictive policies** (`as restrictive`, `to authenticated`, `(select authz.is_demo_user())` initplans):
    - `public.parcel_access` select: `not (select authz.is_demo_user()) or user_id = (select auth.uid()) or not authz.is_demo_account(user_id)`.
    - `public.parcel_access` insert, update and delete: `not authz.is_demo_user()`.
    - `public.question` and `public.question_reply` insert and update: `not authz.is_demo_user()`.
    - `storage.objects` insert, update and delete, named `media_demo_no_insert`, `media_demo_no_update` and `media_demo_no_delete`.
- **Explicit guards:** `create or replace` `public.approve_boundary(uuid)`, `public.owner_invite_viewer(uuid, text, text)` and `public.owner_cancel_viewer_invitation(uuid)` with `perform private.assert_not_demo();` as the first statement.
    - Copy the newest definition of each; grep all migrations.
    - Keep signature, return type, grants and comment identical.
- **Notifications:**
    - `create or replace private.enqueue_notifications(...)` with `and not private.is_demo_org(s.org_id)`.
    - Make every other function that inserts into `public.notification` skip demo orgs, e.g. `20261030105100_billing_notifications.sql` and later.
- **AI:** `create or replace public.save_ai_assessment(...)` so it raises `demo_org_no_ai` (42501) for a demo org's session. Keep everything else identical.
- **Re-check:** confirm that grants and `security definer` survived every recreated function.

### 3. Migration `supabase/migrations/20261101120200_demo_account_lockdown.sql`
**(a) Account freeze**
- `private.demo_account_freeze() returns trigger`, attached as `demo_account_freeze BEFORE UPDATE ON auth.users FOR EACH ROW WHEN (old.raw_app_meta_data ->> 'demo' = 'true')`.
- It raises `demo_account_locked` (42501) when any of these differ, using `is distinct from` and coalescing nulls to `''`:
    - `email`, `phone`, `email_change`, `phone_change`, `encrypted_password`
    - `coalesce(raw_user_meta_data, '{}') - array['email_verified','phone_verified','email','sub']`. GoTrue maintains those four keys itself; magic-link verification must keep working.
- Sign-in columns, token columns and deletes are unaffected.
- Create the trigger inside a `DO` block: drop it if it exists, then create it. Catch `insufficient_privilege` and `raise warning`, so the migration still applies on a hosted project that forbids triggers on `auth.users`. Everything below must hold without it.

**(b) Account scope**
- `private.demo_account_scope_guard() returns trigger` is a row trigger: `BEFORE INSERT OR UPDATE ... FOR EACH ROW`. It fires for every role, the service role included.
- Trigger args: the user column name and an allow-demo-org flag.
- When the row's user is a demo account (`authz.is_demo_account`), it raises `demo_account_scope` (42501). The only exception is a row allowed by the flag whose `org_id` is a demo org.
- Helper `private.attach_demo_account_guard(p_table regclass, p_user_column text default 'user_id', p_allow_demo_org boolean default false)`.
- Attach to:
    - `public.parcel_access`, with the demo org allowed
    - `public.membership`
    - `private.owner_profile`
    - `private.billing_profile`
    - `private.consent_record`, on its nullable `user_id`
    - `private.customer_signup`
- Grep for any other table that grants access to, or holds the identity of, a user, and list what you attached in the PR.

**(c) Lookups**
- `create or replace` `public.ops_find_user_id(uuid, text, text)` (newest definition in `20261030100200_account_lookup_hardening.sql`) and `public.signup_find_account(text, text)` (from `20261030100300_signup_consent_profiles.sql` or later; grep).
- Each adds `coalesce(u.raw_app_meta_data ->> 'demo', '') <> 'true'` to every branch.
- Keep signatures, grants and comments. `invite-user` and the co-owner approval use `ops_find_user_id`, so they never match a demo account.

**(d) `demo-media` bucket**
- `insert into storage.buckets (id, name, public) values ('demo-media', 'demo-media', true) on conflict (id) do nothing`. Copy the size and mime limits of `media` from `20261019120400_media_storage.sql` if it sets any.
- Add a policy on `storage.objects` for insert, to `authenticated`. It requires all of:
    - `bucket_id = 'demo-media'`
    - a path of the form `org/<uuid>/parcel/<uuid>/<sha256>`
    - `private.is_demo_org` of that org
    - the caller is an ops member of that org (`authz.user_org_ids('{ops}')`)
    - `not authz.is_demo_user()`
- No update or delete policy: objects are immutable. Public reads go through `/object/public`, so add no anon select policy.

**(e) Final `private.demo_housekeeping()` (create or replace)**
Run each step in its own `begin ... exception when others then raise warning ... end` block:
1. Delete `parcel_access` of expired demo sessions.
2. Delete `parcel_access` rows of demo accounts whose `org_id` is not a demo org, and `raise warning` with the count only.
3. For demo accounts whose details changed: set `demo_session.expires_at = least(expires_at, now())` and delete all their `parcel_access`. The cleanup then deletes them. Changed means any of:
    - the e-mail no longer matches `ziyaretci-%@` + domain
    - `phone is not null`
    - non-empty `phone_change` or `email_change`
    - a non-empty `encrypted_password`
4. Re-ban personas: `update auth.users set banned_until = '2999-01-01 00:00:00+00', encrypted_password = ''` where `raw_app_meta_data ->> 'demo_persona' = 'true'`, `(banned_until is null or banned_until <= now())` and `updated_at < now() - interval '1 hour'`.
5. Delete `demo_attempt` rows older than 48 h.

### 4. Edge Function `supabase/functions/demo-start/index.ts` and pure helpers `supabase/functions/_shared/demo.ts`
- **Header:** a header comment in the style of `customer-signup/index.ts`.
- **`_shared/demo.ts`:** pure TypeScript, no Deno APIs, Web Crypto only. Exports:
    - `DEFAULT_DEMO_EMAIL_DOMAIN = 'demo.orchados.invalid'`
    - `demoEmail(id: string, domain: string)`, which returns `ziyaretci-<id>@<domain>`
    - `type DemoErrorCode = 'invalid_input' | 'captcha_failed' | 'rate_limited' | 'demo_closed' | 'demo_capacity' | 'failed' | 'unauthorized' | 'demo_read_only'`
    - `statusFor(code)`: 400, 400, 429, 503, 503, 500, 401, 403
    - `parseDemoRequest(body: unknown)`
    - `ipBucket(ip: string | null): string | null`. IPv4 stays as is. IPv6 is normalised (expand `::`, lowercase) to its first four hextets plus `::/64`. `::ffff:a.b.c.d` becomes the IPv4. Garbage gives null.
    - `demoMode(env: {mode?: string, turnstileSecret?: string}): {open: boolean, requireTurnstile: boolean}`:
        - unset or unknown mode → closed
        - `dev` → open; Turnstile required only when a secret is set
        - `public` → open only with a secret that is not a Cloudflare dummy key (matches `^[123]x0+AA$`); Turnstile always required
    - interfaces `DemoStartResponse {token_hash, verification_type, expires_at, next}` and `DemoErrorResponse {error}`
- **Reuse:** `clientIp`, `hmacHex`, `timingSafeEqual` and `jwtClaims` from `_shared/signup.ts`. If you extract Turnstile verification into `_shared/turnstile.ts`, `customer-signup` must behave exactly as before.
- **`start` action** (`client_ip` is trusted only with header `x-orchados-proxy-secret` equal to `SIGNUP_PROXY_SECRET`):
    0. `demoMode` from `ORCHADOS_DEMO_MODE` and `TURNSTILE_SECRET_KEY`. Not open → 503 `demo_closed`, and log `demo_mode_closed` with no values.
    1. Verify Turnstile when required.
    2. `ip_hash = hmacHex(SIGNUP_HASH_SECRET, 'demo:' + (ipBucket(ip) ?? 'unknown'))`.
    3. Call rpc `demo_admit`. A non-ok result maps to its status.
    4. `POST /auth/v1/admin/users` with `{email: demoEmail(crypto.randomUUID(), email_domain), email_confirm: true, app_metadata: {demo: true}}`. No password, phone or user_metadata.
    5. Call rpc `demo_start`. On any error, delete the user and map the error.
    6. `POST /auth/v1/admin/generate_link` with `{type: 'magiclink', email}` and read `hashed_token` and `verification_type`.
    7. Return 200 `DemoStartResponse`.
- **`cleanup` action** (header `x-orchados-cron-secret` equal to `ORCHADOS_CRON_SECRET`, else 401):
    - Keep a `failed` set.
    - Loop: call `demo_expired_accounts(200, failed)` and delete each id through the Admin API. Add every id that fails to delete to `failed`.
    - Stop when a round deletes nothing new or after 10 rounds.
    - Call `demo_purge_audit_log(deleted)`, then log `demo_undeletable_count()` as a number only.
    - Return `{deleted, failed, skipped}`.
- **Logging:** never log an IP, an e-mail, a token or a secret.
- **E-mail domain:** if local GoTrue rejects `.invalid`, do not change the default silently. Set `visitor_email_domain` in your test fixtures to a reserved alternative and report it in the PR. The hosted fallback is a company-owned subdomain with a null MX record; that is a human action.

### 5. Explicit Edge checks and send-sms
- `customer-signup` (action `complete`), `payments` (action `start`) and `invite-user` each read the claims with `jwtClaims(token)` right after their existing token verification and before any service-role call. When `app_metadata.demo === true`, return 403 `{error: 'demo_read_only'}`. Update their header comments.
- `send-sms`: right after signature verification, and before `phone_login_code_requested` or any provider or outbox call: if `payload.user.app_metadata?.demo === true`, return `hookError(403, 'demo_read_only')`. This is an extra layer, not the control.

### 6. `supabase/config.toml`
- Add `[functions.demo-start] verify_jwt = false` with a comment in the existing style.
- Add `ORCHADOS_DEMO_MODE = "dev"` under `[edge_runtime.secrets]` with a comment.
- Change no `[auth]` setting.

### 7. Test helpers (local and CI only)
- **`supabase/testing/demo.sql`** (picked up by the `./testing/*.sql` seed glob; `service_role` only):
    - `testing.register_demo_org(p_org_id uuid, p_parcel_ids uuid[], p_enabled boolean default true, p_tour jsonb default '{}') returns uuid`. It sets `loaded_at = now()`, disables every other demo org when `p_enabled`, upserts `demo_org` and `demo_parcel`, and returns the id of the demo org that was enabled before (or null).
    - `testing.age_demo_sessions(p_user_ids uuid[], p_minutes integer)`: moves `created_at` and `expires_at` back.
    - `testing.purge_demo_attempts()`
    - `testing.run_demo_housekeeping()`
- Make sure `testing.purge_org` removes the new tables and `testing.reset_to_seed` still works. Update `supabase/testing/README.md`.
- **`apps/web/tests/local-db.ts`:** add `registerDemoOrg(orgId, parcelIds, opts?)` (returns the previous enabled org), `ageDemoSessions(userIds, minutes)`, `purgeDemoAttempts()` and `runDemoHousekeeping()`.
- Tests must leave the registry as they found it: re-register the previously enabled demo org in `afterAll`.

### 8. Types
Run `pnpm web:typegen` and commit `apps/web/src/lib/database.types.ts`. CI fails on a diff.

### 9. Tests
- **`supabase/tests/42_demo_access.test.sql`.** Build fixtures in-test and use the `request.jwt.claims` pattern with `app_metadata.demo`. Cover:
    - function privileges
    - `demo_admit`:
        - closed state
        - per-IP limits that count admitted hits only
        - repeated rejections in one minute leave one row with `hits > 1`
        - capacity
        - `email_domain` in the result
    - `demo_start`: validation (phone, domain, password, membership), grants, idempotency
    - a demo user reads published rows and media but not an `in_review` session
    - another demo user's `parcel_access` is invisible; a non-demo persona's row is visible
    - `demo_info`, `demo_end`, `demo_hit` caps
    - `demo_expired_accounts`: expired, orphan rules, `p_exclude`; and `demo_undeletable_count`
    - publishing a demo org session enqueues 0 notifications, while a real org still does
    - `demo_org_no_ai`, `demo_billing_forbidden`
    - both cron jobs exist
- **`supabase/tests/43_demo_write_guard.test.sql`:**
    - Table ratchet: every base table in `public`/`private` except extension tables and `private.demo_session` has `zz_demo_read_only`.
    - Function ratchet: every function executable by `authenticated` whose `prosrc` contains `pg_notify` or `net.http_` is in an explicit allowlist.
    - As a demo user, each of these fails with `demo_read_only` (or `not_customer` where the function checks the customer first):
        - question insert, reply insert, `question.body` update
        - `parcel_access` insert and delete
        - `approve_boundary`, `owner_invite_viewer`, `owner_cancel_viewer_invitation`
        - every `customer_*` writer
        - `storage.objects` insert
    - Service-role-only functions (`payment_begin` and any other you find) are asserted with `has_function_privilege('authenticated', ..., 'EXECUTE') = false`. Do not expect `demo_read_only` from them.
    - The seed owner (`owner@example.com`) can still ask a question.
- **`supabase/tests/44_demo_account_lockdown.test.sql`:**
    - Freeze trigger:
        - it exists locally
        - updating email, phone, phone_change, email_change, encrypted_password or a user-metadata key raises `demo_account_locked`
        - updating `last_sign_in_at`, or only `email_verified` in the metadata, passes
        - a delete passes
        - non-demo users are unaffected
    - Scope guards: as postgres (no claims), a demo account's `parcel_access` on the seed org, and its membership, owner_profile, billing_profile, consent_record and customer_signup rows, raise `demo_account_scope`. `parcel_access` on a demo org works.
    - Lookups: set a demo account's confirmed phone with `session_replication_role = replica`; `ops_find_user_id` and `signup_find_account` still return nothing for it.
    - Housekeeping steps 2–4.
    - The `demo-media` bucket is public and its insert policy accepts only the demo org's ops member.
- **Existing pgTAP files** (`00_schema`, `23_notifications`, `27_testing_purge`, `17_operations`, …): update them only where new objects legitimately change expectations.
- **`apps/web/src/lib/demo/demo-shared.test.ts`** (Vitest unit; import `_shared/demo.ts` by relative path, as `src/lib/billing/signup.test.ts` imports `_shared/signup`):
    - `parseDemoRequest`, `statusFor`, `demoEmail`
    - `ipBucket`: IPv4, compressed IPv6, two addresses in one /64, IPv4-mapped, invalid
    - `demoMode`: all branches, including the three dummy keys
- **`apps/web/tests/integration/demo-start.test.ts`.** Use TEST-NET IPv4 `198.51.100.x`, IPv6 `2001:db8::/32` and proxy secret `signup-proxy-local`. Build a fixture org, parcel and published session with the service role, then `registerDemoOrg`. Cases:
    1. Start returns 200. `verifyOtp({token_hash, type: verification_type})` on an anon client gives a JWT with `app_metadata.demo = true`.
    2. Published rows are readable and `demo_info()` returns the tour and `org_id`.
    3. A question insert and `owner_invite_viewer` fail with `demo_read_only`.
    4. Account freeze: `updateUser({phone})`, `updateUser({email})`, `updateUser({password})` and `updateUser({data: {x: 1}})` each return an error. Afterwards, `auth.admin.getUserById` shows phone, email and user metadata unchanged and no password. No `message_outbox` row exists (existing helper rpc).
    5. As the seed ops user, `invite-user` with the phone and the e-mail the demo account tried returns 409 or creates a new account. The returned id is never the demo id. Delete any created user.
    6. With the demo session's token: `customer-signup` `{action: 'complete'}`, `payments` `{action: 'start'}` and `invite-user` each return 403 `demo_read_only`.
    7. Rate limits (call `purgeDemoAttempts()` first): the 11th start from one IPv4 within the hour returns 429. Two IPv6 addresses in one /64 share the bucket.
    8. A disabled demo org returns 503 `demo_closed`.
    9. Without the proxy secret, `client_ip` is ignored.
    10. Cleanup: after `ageDemoSessions`, POST cleanup with `x-orchados-cron-secret: cron-local` returns `deleted >= 1`, and the user and its access are gone. A wrong secret returns 401.

  Delete all test users and restore the registry at the end.
- **`edge-function-config.test.ts`:** update it if it enumerates functions or config blocks.

### 10. Workflows
- **`.github/workflows/deploy-db-pilot.yml`:** extend "Check payment and signup locks" with the same Management API pattern, guarded with `to_regclass`. Fail when:
    - `private.demo_org` has any row
    - the secret `ORCHADOS_DEMO_MODE` exists
    - `storage.objects` has any row with `bucket_id = 'demo-media'`
- **New `.github/workflows/deploy-db-demo.yml`:**
    - Copy `deploy-db.yml`: same triggers (push to main on migrations, functions, config or this file, plus `workflow_dispatch`). Concurrency group `deploy-db-demo`.
    - Secrets: `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_PROJECT_REF` and `DEMO_SUPABASE_DB_PASSWORD`. Skip with a warning when they are missing.
    - Before pushing, run a check step with the Management API pattern, guarded with `to_regclass`. Fail when:
        - `public.org` has a row that is not in `private.demo_org`
        - an enabled demo org exists while any of these is missing: the secrets `TURNSTILE_SECRET_KEY`, `ORCHADOS_DEMO_MODE`, `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET` and `ORCHADOS_CRON_SECRET`, or the Vault secret `demo_cleanup_url`
        - any `org_billing_setting` has `accepts_signups` or `allow_fake_payments`
        - the secret `PAYMENT_FAKE_ALLOWED` exists
    - Then push the migrations and deploy all Edge Functions, as `deploy-db.yml` does.

### 11. Docs (Turkish)
- `supabase/README.md`: a "Demo turu" section.
- `docs/veri-modeli.md`, a "Demo turu (İP13)" section:
    - the tables
    - the write guard and the `attach_demo_guard` obligation
    - the account freeze and account scope, and the `attach_demo_account_guard` obligation for user-keyed tables
    - the `demo-media` bucket
- `docs/teknik-mimari.md`, KVKK part:
    - demo accounts carry no PII
    - the IP HMAC (IPv6 /64) is pseudonymous personal data, kept 48 h
    - raw IPs in Auth sessions and logs
    - audit rows purged best-effort
- Do not edit `docs/demo-turu.md`, `docs/deployment.md`, `docs/plan.md` or `CLAUDE.md`. Put deployment notes in the PR.

## Files you own
- the three migrations above
- `supabase/tests/**`, `supabase/testing/**`, `supabase/config.toml`, `supabase/seed.sql` (only if needed)
- `supabase/functions/**`, `supabase/README.md`
- `apps/web/src/lib/database.types.ts`, `apps/web/src/lib/demo/demo-shared.test.ts`
- `apps/web/tests/integration/demo-start.test.ts`, `edge-function-config.test.ts`, `apps/web/tests/local-db.ts`
- existing integration tests of the Edge Functions you change, only if needed
- `.github/workflows/deploy-db-pilot.yml`, `.github/workflows/deploy-db-demo.yml`
- `docs/veri-modeli.md`, `docs/teknik-mimari.md`

Do not touch:
- `supabase/demo/**`, `services/**`
- other files under `apps/web/src/**`, `apps/web/tests/e2e/**`
- C's integration files: `demo-portal.test.ts`, `demo-dataset.test.ts`, `demo-fixture.ts`
- `apps/web/playwright.config.ts`, root `package.json`, `pnpm-lock.yaml`
- other workflows
- `docs/demo-turu.md`, `docs/deployment.md`, `docs/plan.md`, `CLAUDE.md`

## Commands
From the repo root:
- `pnpm install`
- `pnpm db:start`
- `pnpm db:reset`
- `pnpm db:test`
- `pnpm web:typegen`, then `git diff --exit-code apps/web/src/lib/database.types.ts` after committing
- `pnpm web:lint`
- `pnpm web:test` (unit and integration; Edge Functions are served locally)
- `pnpm web:build`

After changing `config.toml`, run `pnpm db:stop && pnpm db:start` once.

## Acceptance criteria
- `pnpm db:reset && pnpm db:test` is green, including 42, 43 and 44. `pnpm web:lint`, `pnpm web:test` and `pnpm web:build` are green. Types are current.
- A demo account from `demo-start` reads the published data and media of a registered demo parcel, and nothing else.
- Every write in doc §6.3 is refused.
- A demo account's e-mail, phone, password and metadata cannot change through GoTrue.
- No caller, the service role included, can link a demo account to a non-demo org or give it a profile, membership, consent or sign-up row.
- `ops_find_user_id` and `signup_find_account` never return a demo account.
- The three Edge paths refuse demo tokens.
- With `ORCHADOS_DEMO_MODE` unset, start returns 503.
- No notification, outbox or AI row results from a demo account.
- Expired accounts lose access within 5 minutes and are deleted by cleanup. The cleanup loop always terminates.
- `[auth]` settings are unchanged and existing tests stay green.
- Both workflow files are valid (`actionlint` if available).

## Process
- Work autonomously and ask no questions. Where the doc leaves a choice, take the simplest option consistent with it, and list each deviation in the PR.
- Commit in logical steps. End commit messages and the PR body with the attribution lines your environment specifies.
- Before opening the PR: `git fetch origin` and integrate the latest `origin/main`. Rebase if you have not pushed yet; otherwise merge `origin/main`. Never force-push, never push to main, never merge the PR.
- If Docker or local Supabase will not start: still run unit tests, lint and build, open the PR, and say that CI must validate.
- `gh pr` is blocked by the proxy. Open the PR with:

  ```
  gh api repos/yusuftiryaki/orchadOS/pulls -X POST -f title='İP13-A: demo erişimi (veritabanı korumaları, hesap kilidi, demo-start)' -f head='claude/ip13-demo-erisim' -f base='main' -F body=@<file>
  ```

  Write the description in Turkish with these headings:
    - Özet
    - Yapılanlar
    - Sözleşmeler (exact names, signatures, error codes, Edge request and response JSON)
    - Testler
    - Sapmalar (including whether the `auth.users` trigger could be created and which tables got the account guard)
    - Dağıtım notları (demo project, `ORCHADOS_DEMO_MODE`, Vault `demo_cleanup_url`, hosted Auth confirmations, pilot and demo checks)
    - İnsan eylemi

