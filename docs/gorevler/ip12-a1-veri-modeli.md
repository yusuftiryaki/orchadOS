# İP12-A1 Veri modeli (bütün DDL), kayıt ve rıza, katalog ve başvuru fonksiyonları, customer-signup

> **Orchestrator notes (27 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip12-a1-veri-modeli.md`. Wave 1. Design: `docs/musteri-yonetimi.md`.

1. **Base branch.** The design doc and these task files live on `docs/ip12-musteri-yonetimi` (PR #52), which may not be merged to main yet. Wherever the brief says to branch from, rebase on, or read the design doc from `origin/main`, use `origin/docs/ip12-musteri-yonetimi` instead. If PR #52 is already merged, `origin/main` is fine. Do not stop because the doc is missing on main.
2. **No dependencies.** You run in parallel with the other wave-1 streams.
3. **Branch.** Push to `claude/ip12-veri-modeli`. If the session forces a different branch name, use it and state it in the PR and in your final message.
4. **PR.** Open a PR against `main` through the REST API (`gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...`; see `docs/gorevler/README.md` §9). Write the description in Turkish and mention the PRs you depend on. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice open, pick the recommended or most conservative option and list it in the PR.
6. **Time.** Run only the test suites that matter for your stream. Do not run the Python pipeline suite (11 min). Run commands longer than 10 min in the background.
7. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any departure from the design doc contracts, and open follow-ups.

---

BRANCH = `claude/ip12-veri-modeli`. Wave 1. Two agents run at the same time from main:
- İP12-B builds the payment Edge Functions.
- İP12-C builds the site and the sign-up UI.

İP12-A2 (wave 2) builds on your tables: quote, order, payment and refund functions, notifications and cron. Never rename anything in the contract.

## Working rules (all İP12 streams)
- **Design doc.** The design is `docs/musteri-yonetimi.md` on main. It is the source of truth for every name, column, signature, JSON shape and error code.
  - If the file is missing on `origin/main`, stop. Make one empty commit (`git commit --allow-empty`), push BRANCH, open a draft PR titled `BLOCKED: docs/musteri-yonetimi.md missing on main`, and end the session.
  - Do not edit the design doc.
- **Repo and branch.** Repo `github.com/yusuftiryaki/orchadOS`. Branch from the latest `origin/main`. If the session already assigned you a `claude/...` branch, use it and say so in the PR. Rebase on the latest main before opening the PR.
- **Read first:** `CLAUDE.md`, the design doc (§2, §5, §6, §7, §13, §14, §17 for you), `docs/gorevler/README.md`, `docs/veri-modeli.md`, `supabase/testing/README.md`, `apps/web/AGENTS.md`.
- **Read these migrations first:**
  - `20261018120400_private_schema.sql`
  - `20261021220000_operations_screens.sql` (ops_* patterns, `ops_find_user_id`, `register_parcel`, `add_owner_declared_boundary`, `ops_create_owner_profile`, `ops_save_parcel_detail` exception mapping)
  - `20261023140200_phone_login.sql`
  - `20261024120100_viewer_invitations.sql`
  - `20261024120000_parcel_lifecycle.sql`
- **Also read:** `supabase/functions/invite-user/index.ts` and `send-sms/index.ts` (import pattern).
- **Language.** Code, identifiers, comments and commits are in English. Docs and UI text are in Turkish.
- **KVKK.** PII lives only in the `private` schema and is reached through security definer functions.
  - Validate every PII field inside the function before any insert. Raise `invalid_input` with `detail` set to the field name, never the value.
  - Catch `check_violation` and `not_null_violation` and re-raise them, so Postgres' `Failing row contains` detail never reaches the client or the logs.
  - Never log PII.
- **No new dependencies.** Do not ask questions. Decide, and write the decisions in the PR.
- **mustNotTouch.** Never touch those paths. If a change there is unavoidable, describe it in the PR instead.
- **Setup:**
  1. `cat /tmp/orchados-session-start.log; docker info`
  2. `pnpm install`
  3. `pnpm db:start && pnpm db:reset`. If image pulls fail, export `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`.
- **Fallback when Docker or Supabase will not start.** Run `pnpm web:lint`, `pnpm web:build` and `pnpm --filter web test:unit`. Open the PR anyway. Watch `ci-db-web` through `gh api repos/yusuftiryaki/orchadOS/actions/runs?branch=BRANCH` and the job logs, and fix until it is green. State in Test özeti exactly what did not run locally.
- **Full CI order (when Docker works):** `pnpm db:reset && pnpm db:test && pnpm web:typegen && git diff --exit-code apps/web/src/lib/database.types.ts && pnpm web:lint && pnpm web:build && pnpm web:test && pnpm db:test && pnpm db:reset && pnpm web:e2e && pnpm db:test`. Commit the regenerated types.
- **Commits.** Small. Each ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **PR.** `gh pr` is blocked. Use `gh api repos/yusuftiryaki/orchadOS/pulls -f title='...' -f head=BRANCH -f base=main -F body=@pr-body.md`.
  - Title in English.
  - Body in Turkish with these sections: Ne yapıldı, Kararlar, Test özeti, Eksikler / bilinen sorunlar, Sözleşmeden sapmalar.
  - Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Scope

1. **Migrations.** New files only, in the range `20261030100000`–`20261030104999`, each with a numbered English header comment. Suggested split:
   - `100000_billing_types.sql`: the enums in §6.2, without the notification values (A2 adds those).
   - `100100_billing_tables.sql`: every public and private table in §6.3 and §6.4.
     - Constraints exactly as written. Note the two `service_application` checks that allow `draft → withdrawn`.
     - Indexes, guard, insert-only and touch triggers (§6.11).
     - RLS policies and grants exactly as §6.8: `revoke all on <t> from anon, authenticated`, then column-level `grant select (...)` for customer tables, omitting the internal columns.
     - Helpers `private.audit` (explicit actor id and role), `next_document_number`, `signup_org_id` and `is_valid_tckn`.
   - `100200_account_lookup_hardening.sql`: `create or replace public.ops_find_user_id` with the same signature and the §6.5 rules:
     - An e-mail match never returns a `raw_app_meta_data->>'signup' = 'self'` account.
     - A phone match requires `phone_confirmed_at`.
     - A self account matched by phone additionally needs a completed `customer_signup`.
   - `100300_signup_consent_profiles.sql`:
     - the consent backfill from `owner_profile`
     - `signup_register_attempt`, `signup_find_account` (including `profile_phone`), `signup_prepare`, `signup_complete`
     - `my_consents`, `customer_set_consent`
     - `my_billing_profile`, `customer_save_billing_profile` (TCKN only when `identity_number_required`)
     - `customer_update_contact`
     - `ops_billing_profile`, `ops_customer_consents`
     - `create or replace` of `ops_create_owner_profile` and `ops_update_owner_profile` with the same signatures, adding `consent_record` and audit rows
     - `private.signup_housekeeping` and `private.dispatch_signup_cleanup`, with an hourly pg_cron job (copy the `private.dispatch_notifications` pattern: Vault `signup_cleanup_url` + `orchados_cron_secret`; do nothing when either is missing)
   - `100400_catalog_applications.sql`:
     - `ops_billing_setting`, `ops_save_billing_setting` (refuses the `allow_fake_payments` key)
     - `ops_save_package` and the four price list functions
     - every `customer_*` application and garden function in §6.9 marked A1
     - `ops_applications`, `ops_application_garden_detail`, `ops_verify_application_garden`, `ops_reject_application` (reject and withdraw also cancel an open quote through a conditional update on `quote`)

   Do NOT create `price_lines`, `price_preview`, `public_package_prices` or any quote, order or payment functions: A2 owns them.

2. **Function rules** (§6.1):
   - `security definer`, `set search_path = ''`, `comment on function`.
   - `revoke all on function ... from public, anon, authenticated`, then grants: `signup_*` to service_role only, `customer_*`/`my_*`/`ops_*` to authenticated.
   - Row locks in the order application → quote; conditional state updates (`... where status = ... returning`), raising P0001 `state_changed` when no row comes back.
   - Explicit audit actor.
   - `ops_*` writes on a customer entity refuse with `forbidden` when `customer_user_id = auth.uid()`.
   - Error codes exactly as §6.10.

3. **Seed** (§6.12), with exactly those ids.
   - Write the price list as a draft, add its items, then publish it.
   - Set `allow_fake_payments = true` locally.
   - Update the tests that count seed rows (e.g. `17_operations`).

4. **testing and fixtures** (§6.13):
   - `testing.purge_billing_users`, covering `customer_user_id`, `user_id` and `subject_id`.
   - `purgeBillingUsers` in `tests/local-db.ts`.
   - In `tests/integration/fixtures.ts`, add a separate `export const CUSTOMER = { email: 'customer@example.com', id: 'a0000000-0000-4000-8000-000000000006' }`, a `signInCustomer()` helper, and the İP12 seed ids under a new `BILLING_SEED` constant. Do NOT add to `USERS`: `sections.test.ts` and `parcel-visibility.test.ts` use `Record<UserKey, …>`.
   - Update `27_testing_purge`. No migration may mention the testing schema (CI greps for it).

5. **`supabase/config.toml`** (you own it in wave 1). Write every İP12 entry here, including B's:
   - `[functions.customer-signup]`, `[functions.payments]`, `[functions.payment-callback]`, `[functions.payment-webhook]`, all with `verify_jwt = false` and short header comments.
   - Under `[edge_runtime.secrets]`: `SIGNUP_HASH_SECRET = "signup-hash-local"`, `SIGNUP_PROXY_SECRET = "signup-proxy-local"`, `ORCHADOS_CRON_SECRET = "cron-local"`, `PAYMENT_PROVIDER = "fake"`, `PAYMENT_FAKE_ALLOWED = "1"`, `PAYMENT_CALLBACK_URL = "http://127.0.0.1:54321/functions/v1/payment-callback"`, `PAYMENT_RETURN_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3100,http://localhost:3100"`, `FAKE_WEBHOOK_SECRET = "fake-webhook-local"`.
   - `[auth.rate_limit] sms_sent = 300` locally, with a comment.
   - Leave `[auth] enable_signup = false`.

6. **`customer-signup`** (§7). `index.ts` imports only `../_shared/signup.ts`. `signup.ts` has no imports at all (web Vitest imports it).
   - Actions `register`, `complete` and `cleanup`, exactly as §7: Turnstile when `TURNSTILE_SECRET_KEY` is set, proxy-secret IP trust (constant-time compare), HMAC hashes with `SIGNUP_HASH_SECRET`, the match rules, Admin create, delete on failure, the amr check.
   - Responses exactly as §7. Never log PII.
   - `invite-user`: change it only if needed so that a 422 from Auth stays 409 `conflict`. Update its header comment to describe the self-signup rule.

7. **Shared web code (no UI):**
   - `apps/web/src/lib/billing/money.ts`:
     - `formatKurus(kurus, currency?)` → `'12.000,00 ₺'`
     - `parseTlToKurus(input)` → number or null. Accepts `'12.000,50'`, `'12000,5'` and `'12000'`; uses an exact decimal parse, no floats.
     - `donumFromM2(m2)`
     - `formatDonum(m2)` → `'20,1 dönüm'`
   - `errors.ts`: `BillingError` = every §6.10 code plus `'write_failed'`; `billingReasonOf(error)`, mirroring `src/lib/operations/mutations.ts` `reasonOf`.
   - `types.ts`: row aliases.
   - `columns.ts`: `export const BILLING_COLUMNS = { service_application: '...', application_garden: '...', quote, quote_item, service_order, service_order_item, payment, payment_item, refund, service_package, price_list, price_list_item, org_billing_setting, audit_event } as const`, comma-separated column strings exactly equal to the granted columns.
   - `messages/billing.ts`: `billingText = { applicationStatus, rejectionReason, quoteStatus, orderStatus, paymentProvider, paymentStatus, refundKind, refundStatus, refundReason, priceListStatus, billingPartyKind, consentKind, errors } as const`, all in Turkish.
   - Vitest: a label for every İP12 enum value in `Constants.public.Enums`, a message for every `BillingError`, plus money and errors tests, plus `signup.ts` validation tests.

8. **pgTAP** (each file starts with `select testing.reset_to_seed();` and reuses the `pg_temp.as_user` / `pg_temp.error_of` helpers):
   - `30_billing_schema`: tables, checks (including draft → withdrawn), guards, insert-only triggers.
   - `30_signup_consent`: rate limits, find/prepare/complete, consents, the `kvkk_notice` backfill, `customer_set_consent`, contact update, billing profile with the required and not-required TCKN cases. Error `message` and `detail` for a bad TCKN, phone or e-mail must contain no value.
   - `31_billing_rls`:
     - Customer, other customer, viewer, field, expert, ops and anon visibility.
     - A customer selecting `ops_note`, `provider_token`, `manual_note` or `note` gets 42501 (or use `column_privs_are`).
     - anon and authenticated have no insert, update or delete on any new table.
     - anon cannot execute your new functions (explicit name list).
     - `ops_find_user_id` ignores an unverified self account by e-mail and by phone, and a completed self account by e-mail.
     - The application functions' transitions, and the self-dealing refusal.
   - Update `00_schema` (+14 public / +8 private tables, `has_trigger`), `17_operations` and `26_viewer_invitations` as needed.

9. **Integration tests:**
   - `customer-signup.test.ts` follows `notifications-phone-login.test.ts` for reading the OTP via `message_outbox_list`. Every test sends header `x-orchados-proxy-secret: signup-proxy-local` and its own `client_ip` 203.0.113.N; the `too_many_attempts` test uses a dedicated IP. Cover:
     - register → OTP → verify → complete, then the profile and 3 consent rows
     - complete after a password sign-in gives 403
     - stale account replaced
     - `email_taken`
     - `phone_registered` (seed owner phone `+905550000001`)
     - non-TR phone gives `invalid_input`
     - `cleanup` with the cron secret
     
     If GoTrue assumptions fail (the phone stays unconfirmed until verifyOtp; `amr` method is otp), adapt the function, keep the JSON contract, and explain in the PR.
   - `account-takeover.test.ts`: self-register with victim e-mail X, then `invite-user` as ops@ with e-mail X → 409 `conflict` and no link. The same with the phone of an unverified self account.
   - Clean up with `purgeBillingUsers` and admin `deleteUser`.

10. **Docs** (Turkish), per §18: `veri-modeli.md` (section 'Müşteri, teklif ve ödeme'), `plan.md`, `CLAUDE.md`, `MVP.md`, `mvp-denetimi.md`.

## Contracts you provide
- All tables, columns, grants and `BILLING_COLUMNS`.
- The A1 functions in §6.9.
- The §7 JSON.
- `config.toml` entries.
- `CUSTOMER`, `signInCustomer`, `BILLING_SEED`, `purgeBillingUsers`.
- The `billing/*` and `messages/billing.ts` exports.

## Acceptance criteria
- CI is green and the types are committed.
- Seed customer@ can sign in with a password.
- A customer can never read an internal column.
- An unverified or self e-mail account is never linked by ops.
- The sign-up integration test passes.
- No PII appears in any error, log or audit detail.
- No migration references the testing schema.
