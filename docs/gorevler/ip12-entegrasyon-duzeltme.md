# İP12 integrated review fixes (after merging into main)

İP12 (PRs #52–#58) is merged into main. An integrated review of main looked across all streams together, from four angles: contracts, security, regressions and deploy readiness. An adversarial verifier confirmed each finding below against the code. The regression angle found no defects. Fix all of them in **one PR**.

## Rules
- `git fetch origin && git checkout -B claude/ip12-entegrasyon-duzeltme origin/main`. **Never merge PRs, never push to main, never force-push.**
- Read `CLAUDE.md`, `docs/gorevler/README.md` and `docs/musteri-yonetimi.md` (especially §13 environment variables and §15 rollout).
- SQL changes go only in new fix-forward migrations, with timestamps after the latest existing migration. Never edit a migration that is already merged. Regenerate `apps/web/src/lib/database.types.ts` (`pnpm web:typegen`) if the schema changes.
- Add a regression test for each major finding (pgTAP, Vitest or Deno/handler test, whichever fits).
- Run `pnpm db:reset && pnpm db:test`, `pnpm web:lint`, `pnpm web:test` and the related e2e tests. All must pass.
- Open the PR against main with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=claude/ip12-entegrasyon-duzeltme -f base=main -f title=... -f body=...`. Write the description in Turkish and say for each finding how you fixed it. End the description with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Make sure CI is green.
- Ask no questions. Pick the most conservative option.
- Suggested decisions:
  - **E-mail:** for card payments, require an e-mail on the billing profile. `payment_begin` raises `billing_profile_incomplete` with detail `email`. The portal form shows it as required for card payment. Edge maps the code to 409.
  - **Turnstile:** make `customer-signup` fail closed when `TURNSTILE_SECRET_KEY` is missing, except in local dev where an explicit `SIGNUP_TURNSTILE_DISABLED=1` is set in `config.toml`.
  - **Rollback:** make the server-side kill switch real. `customer-signup` must refuse `register` when sign-ups are disabled. Use an Edge secret flag or the org setting `accepts_signups`, whichever the design names. Then update §15.5 to match only if needed.
  - **Docs:** put every new env var, secret and Vault entry in `docs/deployment.md`. Extend `deploy-db-pilot.yml`'s lock check to cover the signup secrets.

## Findings

### 1. [major] (contracts) `supabase/migrations/20261031100000_payment_begin_in_review.sql:86`

**Problem:** payment_begin can send the provider an empty buyer e-mail. The e-mail is coalesce(b.email, op.email, u.email), and that is NULL (or '') for a phone-only customer. The Edge Function passes it unchanged to iyzico's required buyer.email field (handlers.ts:282 -> iyzico.ts:117). The B contract types it as a required string (db.ts:119 `email: string`), which hides the gap.

**Scenario:** Ops registers a pilot owner with a phone number only. This is a supported path: invite-user says "without an e-mail that is the only way in", and ops_create_owner_profile has p_email default null. The owner saves a billing profile without an e-mail (portal-billing/validation.ts:272 makes it optional), accepts a parcel quote, and clicks 'Kartla öde'. payment_begin returns buyer.email = null/''. iyzico's checkoutform/initialize rejects the request because buyer.email is required. startCheckout returns ok:false, the attempt is finalized as failed (iyzico_<code>), and payments answers 502 provider_error. Every card attempt by such a customer fails, with a generic provider error and no hint that an e-mail is missing. The fake provider ignores buyer data, so CI and e2e never catch this.

**Fix:** Choose one contract and enforce it on both sides. Option 1: payment_begin raises billing_profile_incomplete (detail 'email') when no usable e-mail exists, and the portal billing form marks e-mail as required for card payment. Option 2: the Edge Function refuses before calling iyzico with a mapped 409 code that the portal shows as 'add an e-mail to your billing profile'. Change PaymentBeginBuyer.email to string | null so the type matches the SQL.

**Area:** supabase/migrations (payment_begin, fix-forward), supabase/functions/_shared/payments/{db.ts,handlers.ts}, apps/web/src/lib/portal-billing/validation.ts + billing profile form

**Verifier:** Confirmed on origin/main. In 20261031100000_payment_begin_in_review.sql:86 the buyer e-mail is coalesce(b.email, op.email, u.email), and nothing guards it. billing_profile_complete (quotes_orders.sql:74-79) checks only the TCKN. billing_profile.email is nullable, and both customer_save_billing_profile (signup_consent_profiles.sql:558) and validation.ts treat it as optional. Phone-only owners are a supported path: invite-user/index.ts:11-24 allows phone without e-mail, and ops_create_owner_profile has p_email default null and stores nullif(email,''). handlers.ts:282 and iyzico.ts:117 pass buyer.email to iyzico unchanged, and no handler checks it. db.ts:119 and types.ts:20 type it as a required string, which hides the gap. iyzico requires buyer.email, so every card attempt from such a customer fails as a generic provider_error. Bank transfer still works and the customer could add a contact e-mail, but nothing tells them to. That keeps it major for the ops-registered pilot population.

### 2. [minor] (contracts) `supabase/functions/_shared/payments/handlers.ts:244`

**Problem:** The PR #58 fix (20261031100000) made payment_begin raise 'payment_in_progress', and the web's START_ERRORS (portal-billing/payments.ts:37) expects it from the payments function. BEGIN_STATUS has no entry for it, so start() logs begin_payment_in_progress and returns 500 {error:"failed"}, which the portal shows as write_failed.

**Scenario:** A customer opens the order in two tabs. Tab A's checkout goes to fraud review (pending_review, fraud_review). Tab B's startPaymentAction then passes its liveCardAttempt pre-check because its payments read came before the review landed, and calls the payments function. payment_begin raises payment_in_progress, PostgREST returns 400 with message 'payment_in_progress', and DbError.code = 'payment_in_progress', which BEGIN_STATUS[code] does not map. The handler returns 500 'failed', and paymentStartError maps that to write_failed. The customer gets the generic 'Kaydedilemedi' error on the order page instead of the 'card payment in progress' text and the link to the live attempt. Each such request also leaves an error log line.

**Fix:** Add `payment_in_progress: ["payment_in_progress", 409]` to BEGIN_STATUS, and list it in the response contract in payments/index.ts. Add a handlers test where payment_begin answers payment_in_progress.

**Area:** supabase/functions/_shared/payments/handlers.ts, supabase/functions/payments/index.ts, apps/web/src/lib/payments/handlers.test.ts

**Verifier:** Confirmed. BEGIN_STATUS (handlers.ts:244-251) has no payment_in_progress entry. start() logs begin_<code> and returns 500 'failed' for any unmapped code (handlers.ts:341-346). START_ERRORS in portal-billing/payments.ts:37 expects payment_in_progress, but with a 500 'failed' body paymentStartError returns write_failed. 20261031100000 does raise payment_in_progress with P0001, and the integration test billing-db.test.ts:331 shows the message is that exact code. The window is small because startPaymentAction checks liveCardAttempt first (billing-actions.ts:256-262), so this needs a race or a stale read. The result is a wrong message and an error log line, not lost money. Minor.

### 3. [minor] (contracts) `supabase/functions/customer-signup/index.ts:143`

**Problem:** register() throws whenever SIGNUP_HASH_SECRET is unset, and the client IP is trusted only when SIGNUP_PROXY_SECRET matches on both Vercel and Edge. Neither secret is in the hosted deployment runbook. docs/deployment.md lists the Edge secrets (PAYMENT_*, IYZICO_*, ORCHADOS_CRON_SECRET, TURNSTILE_SECRET_KEY) and the Vault entries (payments_reconcile_url, orchados_cron_secret), but not SIGNUP_HASH_SECRET, SIGNUP_PROXY_SECRET or the Vault signup_cleanup_url. Only config.toml (local) sets them. deploy-db-pilot's lock check covers only Turnstile and the fake-payment flags.

**Scenario:** The test or pilot project is set up from docs/deployment.md, and an org turns on accepts_signups (with Turnstile keys, as the runbook says). Every /kayit submit reaches customer-signup, which throws 'SIGNUP_HASH_SECRET is not set' and returns 500 {error:'failed'}. The visitor sees 'Kayıt tamamlanamadı'. If only SIGNUP_PROXY_SECRET is missing on one side, rate limiting falls back to x-forwarded-for, which on the Edge is the Vercel egress IP, so all visitors share the 10/hour IP limit. Without signup_cleanup_url in Vault, dispatch_signup_cleanup does nothing and accounts that never verified their phone are never deleted.

**Fix:** In docs/deployment.md, add SIGNUP_HASH_SECRET and SIGNUP_PROXY_SECRET (Edge, and Vercel for the proxy secret) and the Vault signup_cleanup_url to the 'Fonksiyon secret'ları' and Vault steps. Also have the deploy-db-pilot lock step fail when accepts_signups is on but SIGNUP_HASH_SECRET is not in the secret list, the same way it does for TURNSTILE_SECRET_KEY.

**Area:** docs/deployment.md, .github/workflows/deploy-db-pilot.yml

**Verifier:** Confirmed with a caveat. customer-signup/index.ts:143 throws when SIGNUP_HASH_SECRET is empty, and only supabase/config.toml:422-423 sets it. docs/deployment.md lists the Edge secrets and the sample `supabase secrets set` command (lines 82-102). Its Vault block (105-109) adds only payments_reconcile_url and orchados_cron_secret, even though line 92 says ORCHADOS_CRON_SECRET also serves signup cleanup. SIGNUP_HASH_SECRET, SIGNUP_PROXY_SECRET, signup_cleanup_url and Vercel's SIGNUP_PROXY_SECRET are never mentioned. The Turnstile gate (line 130) and the deploy-db-pilot check (line 128) treat Turnstile as the only signup prerequisite. Partial refutation: the design doc §13 (musteri-yonetimi.md:930-938) does list all of them, and deployment.md:76 links §13. Signup failure is also loud (500 plus a log line), not silent. This is a runbook and deploy-check gap across streams rather than a code bug, so minor.

### 4. [minor] (security) `supabase/functions/customer-signup/index.ts:105`

**Problem:** Self sign-up skips the captcha whenever TURNSTILE_SECRET_KEY is missing (`if (!TURNSTILE_SECRET) return true`). Sign-ups are actually opened by the accepts_signups flag, which ops can switch on at runtime from /operasyon/ayarlar (ops_save_billing_setting, catalog_applications.sql:187). The only check that pairs accepts_signups with Turnstile is a deploy-time step in deploy-db-pilot.yml:67, so it does not cover a later toggle.

**Scenario:** The pilot is deployed while accepts_signups is false, so the guard passes and nobody sets TURNSTILE_SECRET_KEY. Later an ops user ticks 'accepts_signups' in /operasyon/ayarlar. No deploy runs, so the guard never sees the change. From then on, POST /functions/v1/customer-signup {action:'register'} (verify_jwt=false; it needs only the public anon key and ignores the web-only ORCHADOS_SIGNUP_ENABLED flag) creates accounts with no captcha. The only limits left are the HMAC rate limits (10 per IP an hour, 3 per phone and 5 per e-mail a day), and new phones and e-mails get around them. This allows bot account creation and, through auth.resend({type:'sms'}) on each new unconfirmed phone, SMS pumping against the project's GoTrue SMS quota (design §16 names this risk). The design says Turnstile is required on the pilot (§13 table).

**Fix:** Fail closed in the function: when signup_register_attempt returns 'ok' and TURNSTILE_SECRET_KEY is unset, refuse the request unless an explicit local/CI switch is set (for example SIGNUP_CAPTCHA_OPTIONAL=1, never set on hosted projects). As a second guard, have ops_save_billing_setting (or the ayarlar action) refuse accepts_signups=true on hosted projects unless a Vault/setting marker shows Turnstile is configured.

**Area:** supabase/functions/customer-signup/index.ts (captchaPassed); optionally supabase/migrations ops_save_billing_setting and .github/workflows/deploy-db-pilot.yml

**Verifier:** Confirmed on origin/main. customer-signup/index.ts:105 returns true from captchaPassed whenever TURNSTILE_SECRET_KEY is unset. The only check that pairs this with accepts_signups is the deploy-time step in deploy-db-pilot.yml:67-101. ops_save_billing_setting (catalog_applications.sql:187) lets ops turn accepts_signups on at runtime, and that toggle never re-runs the check. The design (§7 step 2, line 673) does intend the skip for local and CI, but it says Turnstile is mandatory on the pilot (line 931, line 972), and the runtime path does not enforce that. Downgraded to minor: it only happens if ops skip a mandatory rollout step, and the per-IP, per-phone and per-e-mail rate limits still apply. It is still a real fail-open gap, and it exposes the SMS-quota abuse that §16 names.

### 5. [minor] (security) `supabase/functions/_shared/payments/handlers.ts:244`

**Problem:** The fix-forward 20261031100000_payment_begin_in_review.sql:48 makes payment_begin raise payment_in_progress. B's BEGIN_STATUS map has no entry for it, so the payments start action logs begin_payment_in_progress and answers 500 {error:'failed'}. The portal (lib/portal-billing/payments.ts START_ERRORS) expects {error:'payment_in_progress'}, so the anti-double-charge guard surfaces as a generic server error.

**Scenario:** A customer has a card attempt in fraud review (pending_review). The portal's liveCardAttempt pre-check is bypassed or racy: a second tab, or a direct call to /functions/v1/payments with the customer's JWT. payment_begin correctly refuses, but the Edge Function maps the error to 500 'failed', and startPaymentAction redirects with hata=write_failed. The customer is told something broke and to retry, not that a payment is already in progress. Ops also get 500s in the function logs for an expected business refusal.

**Fix:** Add `payment_in_progress: ["payment_in_progress", 409]` to BEGIN_STATUS and a handler test for it. The web mapping already handles the code.

**Area:** supabase/functions/_shared/payments/handlers.ts (+ its Vitest suite)

**Verifier:** Confirmed. 20261031100000_payment_begin_in_review.sql:48 raises 'payment_in_progress'. db.ts reasonCode turns the message into DbError.code 'payment_in_progress'. BEGIN_STATUS in handlers.ts:244-251 has no entry for it, so start() logs begin_payment_in_progress and returns 500 {error:'failed'} (handlers.ts:343-347). The portal's START_ERRORS (portal-billing/payments.ts:37) expects {error:'payment_in_progress'}, gets 'failed', and maps it to write_failed. The double-charge guard itself still holds; only the error mapping and status are wrong. This is a correctness/UX issue, not a security one, hence minor.

### 6. [major] (deploy) `docs/deployment.md:78`

**Problem:** The deploy runbook's Edge secret table never mentions SIGNUP_HASH_SECRET or SIGNUP_PROXY_SECRET. customer-signup needs both on the hosted project, SIGNUP_PROXY_SECRET must also be set on Vercel, and the deploy-db-pilot lock step checks neither.

**Scenario:** An operator follows docs/deployment.md, sets only the listed secrets, and turns on accepts_signups. (1) SIGNUP_HASH_SECRET is missing: register throws at supabase/functions/customer-signup/index.ts:143 and every sign-up returns 500 'failed'. (2) SIGNUP_PROXY_SECRET is missing on the Edge side or on Vercel: clientIp() (_shared/signup.ts:152) does not trust the body's client_ip and uses cf-connecting-ip / x-forwarded-for instead, which is the Vercel server's egress IP. All visitors then share one ip_hash, and the 10-per-IP-per-hour limit in signup_register_attempt answers 'too_many_attempts' for everyone after 10 sign-ups an hour. deploy-db-pilot passes in both cases.

**Fix:** Add SIGNUP_HASH_SECRET (Edge) and SIGNUP_PROXY_SECRET (Edge plus Vercel, same value, server-only) to the secret table and to the example `supabase secrets set` command in docs/deployment.md. In deploy-db-pilot's 'Check payment and signup locks' step, fail when accepts_signups is on and SIGNUP_HASH_SECRET or SIGNUP_PROXY_SECRET is missing from the secret names.

**Area:** docs/deployment.md, .github/workflows/deploy-db-pilot.yml

**Verifier:** Confirmed. The Edge secret table in docs/deployment.md:78-93 lists no SIGNUP_HASH_SECRET or SIGNUP_PROXY_SECRET, and neither appears anywhere in deployment.md (git grep finds them only in the design doc §15 table at lines 930/932, config.toml, apps/web/README.md and .env.example). customer-signup/index.ts:143 throws when HASH_SECRET is empty, so every register returns 500. _shared/signup.ts:152 trusts the body's client_ip only when PROXY_SECRET is set and the header matches; lib/signup/client.ts:34-35 sends the header only when the Vercel env var exists. Without it, the IP comes from cf-connecting-ip / x-forwarded-for of the Vercel server. The deploy-db-pilot lock step (lines 67-100) checks only PAYMENT_FAKE_ALLOWED, allow_fake_payments and TURNSTILE_SECRET_KEY.

### 7. [major] (deploy) `supabase/functions/customer-signup/index.ts:105`

**Problem:** Turning ORCHADOS_SIGNUP_ENABLED off does not close self sign-up, although the design's rollback step says it does (§15.5). customer-signup is public (verify_jwt = false) and checks only accepts_signups. It also skips Turnstile when TURNSTILE_SECRET_KEY is unset, and the pilot's Turnstile gate is checked only while deploy-db-pilot runs.

**Scenario:** Ops ticks 'Dışarıdan kayıt' in /operasyon/ayarlar (ayarlar/page.tsx:47) on the pilot after the last deploy, or before TURNSTILE_SECRET_KEY was set. The Vercel flag stays off, so /kayit is hidden. A bot POSTs {action:'register',...} straight to https://<ref>.supabase.co/functions/v1/customer-signup. signup_register_attempt (signup_consent_profiles.sql:167) returns ok, captchaPassed() returns true at line 105, and Admin API accounts are created with chosen phone numbers. Codes can then be requested through GoTrue /otp with the public anon key, so SMS costs grow and the auth table fills up. Turning the web flag off, as §15.5 'Geri alma' says, stops none of this. Only accepts_signups=false does.

**Fix:** In customer-signup register, refuse (503 signup_closed) when TURNSTILE_SECRET_KEY is unset, unless an explicit local-only secret such as SIGNUP_CAPTCHA_OPTIONAL=1 is set (config.toml only). In the ops_save_billing_settings path or the settings page, warn or refuse when accepts_signups is turned on. Correct docs/musteri-yonetimi.md §15.5 and docs/deployment.md: rollback means accepts_signups = false. The web flag only hides the UI.

**Area:** supabase/functions/customer-signup, supabase/config.toml, docs/musteri-yonetimi.md §15, docs/deployment.md

**Verifier:** Confirmed. Design §15.5 (musteri-yonetimi.md:978) says turning the flag off OR setting accepts_signups=false is enough to roll back. customer-signup reads only Edge env vars and signup_register_attempt, which checks signup_org_id() / accepts_signups. It never sees ORCHADOS_SIGNUP_ENABLED, a Vercel-only variable, and the function is public (verify_jwt=false). captchaPassed returns true when TURNSTILE_SECRET_KEY is unset (index.ts:105). Ops can switch accepts_signups on at any time from /operasyon/ayarlar (page.tsx:47, through ops_save_billing_setting); the Turnstile gate runs only when deploy-db-pilot runs. So rolling back with the web flag alone leaves the endpoint open to direct POSTs and SMS pumping.

### 8. [minor] (deploy) `docs/deployment.md:105`

**Problem:** The Vault step documents only payments_reconcile_url and orchados_cron_secret. The signup-cleanup pg_cron job also needs Vault 'signup_cleanup_url' (signup_consent_profiles.sql:933) and does nothing silently without it.

**Scenario:** The test or pilot project is set up exactly as docs/deployment.md says. private.dispatch_signup_cleanup() returns null every hour, so self sign-up Auth accounts whose phone was never verified are never deleted. signup_housekeeping removes only the private.customer_signup row after 24h. The e-mail, phone and password hash stay in auth.users indefinitely, which is a KVKK retention problem, and nothing reports it.

**Fix:** Add `select vault.create_secret('https://<ref>.supabase.co/functions/v1/customer-signup', 'signup_cleanup_url');` to the Vault block in docs/deployment.md and say that both cron jobs share orchados_cron_secret.

**Area:** docs/deployment.md

**Verifier:** Confirmed. deployment.md:105-110 creates only payments_reconcile_url and orchados_cron_secret. private.dispatch_signup_cleanup (20261030100300_signup_consent_profiles.sql:933-937) returns null without Vault 'signup_cleanup_url', and no later migration changes this. signup_housekeeping deletes only the private.customer_signup row, so unverified self sign-up auth.users rows stay unless the same e-mail or phone retries (the 30-minute stale path in register). The design doc table (line 938) lists the secret; the runbook does not.

### 9. [minor] (deploy) `docs/deployment.md:52`

**Problem:** The deployment docs were not updated for IP12 as a whole. The Vercel env list names only the Supabase URL and key. The workflow table and the Edge section say deploy-db runs on migration changes and deploys three functions. docs/plan.md still shows IP12-A1 as 'PR açık', with no status rows for B, C, A2, D or E. The config.toml comment still calls the payment functions 501 placeholders.

**Scenario:** Whoever sets up the Vercel test or pilot project from docs/deployment.md 'Vercel' finds no mention of ORCHADOS_SIGNUP_ENABLED, ORCHADOS_SITE_INDEXABLE, ORCHADOS_SITE_URL or SIGNUP_PROXY_SECRET; they are listed only in apps/web/README.md. ORCHADOS_SITE_URL stays at its http://localhost:3000 default, so robots.txt and the sitemap point to localhost once indexing is enabled. The plan's status table gives a wrong picture of what is merged.

**Fix:** In docs/deployment.md, list all IP12 web variables under 'Vercel' with test and pilot values. Update the deploy-db row (it also runs on supabase/functions/** and config.toml changes) and the function list (7 functions). Add IP12 status rows to docs/plan.md for PRs #52–#58. Remove the stale placeholder comment above [functions.payments] in supabase/config.toml (lines 453-456).

**Area:** docs/deployment.md, docs/plan.md, supabase/config.toml

**Verifier:** Confirmed doc staleness. deployment.md:52 lists only the two Supabase env vars. ORCHADOS_SIGNUP_ENABLED, ORCHADOS_SITE_INDEXABLE, ORCHADOS_SITE_URL and SIGNUP_PROXY_SECRET are absent from deployment.md; only PAYMENTS_ENABLED, PAYMENT_FAKE_CHECKOUT and the Turnstile site key are mentioned, at lines 112/130. flags.ts:22 defaults siteUrl to http://localhost:3000. Line 28 says deploy-db runs only on migration changes, but deploy-db.yml also triggers on functions/config.toml. Line 58 lists three functions, which contradicts line 76. plan.md:85 still says A1 'PR açık'. config.toml:455 still calls the functions 501 placeholders. It partly overlaps [0] (SIGNUP_PROXY_SECRET), but the scope is broader.
