# İP12-A1 review fixes (PR #55)

An independent review of PR #55 found the defects below, and an adversarial verifier confirmed each one against the code. Fix every one of them on the PR's branch.

## Rules
- `git fetch origin && git checkout claude/ip12-veri-modeli && git pull --ff-only`. Commit on top. **No force-push, no rebase, never merge PRs, never push to main.**
- Read `CLAUDE.md`, `docs/gorevler/README.md`, the original brief `docs/gorevler/ip12-a1-veri-modeli.md` and the design `docs/musteri-yonetimi.md` (all on `origin/docs/ip12-musteri-yonetimi`). Keep every cross-stream contract (names, signatures, JSON shapes, error codes) unless a finding says the contract itself is wrong. In that case change the code, then list the contract change in the PR comment.
- Other streams are building on this branch (İP12-A2 merges #54 and #55; İP12-D and İP12-E come later). Keep changes minimal and focused.
- Add a regression test for each critical or major finding.
- Run this stream's relevant checks: `pnpm web:lint`, `pnpm web:test`, `pnpm db:test`, plus e2e where relevant. Everything must pass. Push, then make sure CI (`db-web`) is green.
- When you are done, add a PR comment in Turkish through `gh api repos/yusuftiryaki/orchadOS/issues/55/comments -f body=...`. For each finding, say how you fixed it, or why you did not with your reasoning, and give the test results. End the comment with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- If a fix belongs in another stream's owned paths, don't edit them. Describe the problem in the PR comment instead.

## Findings

### 1. [minor] `supabase/functions/customer-signup/index.ts:201`

**Problem:** `complete` and `signup_complete` never check that the confirmed Auth phone matches the phone stored in the pending sign-up. A customer profile can therefore be created with a phone number nobody verified.

**Scenario:** 1) The attacker calls register with the victim's number P_v (who has no account) and the attacker's own e-mail and password. 2) The account is created with email_confirm:true, so the attacker can sign in with a password right away. 3) With that session the attacker calls auth.updateUser({phone: P_a}) and verifies the phone_change OTP on their own number, which sets phone_confirmed_at. 4) The attacker signs in with an SMS OTP on P_a, so amr has an otp entry newer than the account's created_at. 5) The attacker calls complete. phone_confirmed_at is set and the amr check passes, so signup_complete (20261030100300_signup_consent_profiles.sql:325) inserts owner_profile with phone = s.phone = P_v, the unverified victim number. Result: notification dispatch (which reads owner_profile.phone) sends SMS/WhatsApp to the victim, ops sees a 'verified' customer with the victim's phone, and signup_find_account's profile_phone match now returns 409 phone_registered whenever the real owner of P_v tries to sign up. The amr check does not bind to a phone, because e-mail OTP also produces method 'otp'.

**Suggested fix:** In signup_complete (service role), lock the customer_signup row and require that auth.users.phone = ltrim(s.phone,'+'), that phone_confirmed_at is not null, and that the user is a self sign-up (raw_app_meta_data->>'signup' = 'self'). Return a distinct status such as phone_mismatch otherwise. In the Edge Function, also compare user.phone with the pending phone and compare the amr timestamp with the pending row's created_at (§7.2), not with the Auth user's created_at.

**Verifier note:** Confirmed that the binding is missing. complete (index.ts:199-207) checks only phone_confirmed_at plus an otp/sms amr entry newer than the Auth user's created_at. signup_complete (signup_consent_profiles.sql:307-361) copies s.phone into owner_profile and never compares it with auth.users.phone. The amr window also uses the account's created_at instead of the pending row's time that §7.2 specifies. The described exploit is unlikely to work in this repo, though. GoTrue gives the phone_change OTP to the send_sms hook with user.phone still set to the old (victim) number; the new number goes in new_phone. send-sms/index.ts sends to payload.user.phone, so step 3's code would reach P_v, not the attacker. Since the chain fails at that step, this is defense-in-depth hardening (add a phone-equality and self-signup check in signup_complete), not a working exploit. Downgraded to minor.

### 2. [minor] `supabase/functions/customer-signup/index.ts:161`

**Problem:** An unauthenticated register call deletes another person's in-progress sign-up account if it matches only by e-mail or by phone. Nothing limits this per e-mail.

**Scenario:** The victim registers with (E_v, P_v) and is about to enter the SMS code. The attacker POSTs register with E_v and any fresh phone. decideMatches marks the victim's account stale (self sign-up, phone not confirmed) and deleteUser removes it; the attacker's account now holds E_v. The victim's verifyOtp fails and their retry gets 409 email_taken. Per-phone limits do not apply because the attacker rotates phones, and the IP limit can be spoofed (see the clientIp finding). Variant: the attacker registers with P_v after the victim's register but before signInWithOtp. The victim's code is then issued for the attacker's account (whose password the attacker knows). The victim verifies it, complete succeeds, and the victim is in an attacker-controlled account where they go on to enter billing, deed and TCKN data the attacker can read.

**Suggested fix:** Delete a stale account only when both the e-mail and the phone match the same stale account, or only when it is older than a short grace period (for example 15 to 30 minutes since its pending sign-up). Otherwise answer the same 409. Add a per-e-mail-hash attempt limit next to the per-phone one.

**Verifier note:** Confirmed in decideMatches (signup.ts:187-205). isStale ignores matched_by, so any self, unconfirmed, uncompleted account that matches on the e-mail alone or the phone alone is deleted (index.ts:161) before the new account is created. An unauthenticated register with the victim's e-mail and a fresh phone deletes the victim's in-progress account. The variant also holds: re-registering P_v moves the phone to an attacker-owned, e-mail-confirmed, password-known account, so the victim's later code request and complete land in the attacker's account. The only limits are 3 per phone per day and 10 per IP per hour, with no per-e-mail limit. §7.1.5.1 intends deleting stale accounts, but without this safeguard. It needs a targeted attacker and precise timing, so minor.

### 3. [minor] `supabase/migrations/20261030100300_signup_consent_profiles.sql:879`

**Problem:** Hourly housekeeping deletes pending sign-ups after 24h even when the phone was already verified. Those accounts are no longer 'stale' and cleanup never removes them, so they are permanently locked out of becoming customers while still holding the e-mail and phone.

**Scenario:** A user verifies the SMS code but the complete call fails (network error, tab closed). After 24h signup_housekeeping removes the customer_signup row. The account has phone_confirmed_at set, so cleanup's isExpiredUnverified and register's isStale both skip it. A new register with the same phone returns existing_account, the OTP login works, and complete returns no_pending every time. The user never gets an owner_profile, and their e-mail and phone stay taken (email_taken for any new attempt). Attackers can use the same path to squat a victim's e-mail permanently without ever completing.

**Suggested fix:** In signup_housekeeping, delete only pending rows whose Auth user still has phone_confirmed_at null (join auth.users). Alternatively, let register re-create the pending row via signup_prepare for an existing self account whose phone is confirmed but whose sign-up is not completed.

**Verifier note:** Confirmed. signup_housekeeping (signup_consent_profiles.sql:869-885) deletes every uncompleted customer_signup row older than 24h, without checking phone_confirmed_at. Afterwards isExpiredUnverified and isStale both skip the account because its phone is confirmed. Re-registering returns existing_account (decideMatches) and never calls signup_prepare again, so complete keeps returning no_pending and no owner_profile is created. The design (§7.3 and housekeeping) has no recovery path. It needs a verified-but-not-completed sign-up left for more than 24h, and recovery needs manual admin deletion, so minor. The e-mail-squatting claim adds nothing new: an attacker who controls a phone could just complete the sign-up.

### 4. [major] `supabase/config.toml:458`

**Problem:** B's three payment functions (payments, payment-callback, payment-webhook) are written with `enabled = false`, and the comment says "B removes this line". But B's brief (docs/gorevler/ip12-b-odeme-saglayici.md:19) says A1 owns config.toml and B must not touch it.

**Scenario:** B runs in parallel from main and follows its brief, so it never edits config.toml. After A1 and B both merge, the local stack and CI start with all three payment functions disabled. B's integration tests, D's fake-checkout e2e (`payments` start, then `payment-callback`) and A2's reconcile cron all get 404 from /functions/v1/payments*. Nobody is allowed to fix the file: B is told not to touch it and A1 has already merged.

**Suggested fix:** Do not merge disabled blocks for functions you do not own. Either leave the B blocks out and tell the orchestrator to add them when B lands, or add placeholder `supabase/functions/payments{,-callback,-webhook}/index.ts` stubs that return 501, so the blocks can stay enabled. Also update B's brief or the design doc so the hand-off has an owner.

**Verifier note:** Confirmed. config.toml:452-472 writes [functions.payments], payment-callback and payment-webhook with enabled = false and the comment 'B removes this line'. B's brief (docs/gorevler/ip12-b-odeme-saglayici.md:19) says A1 owns config.toml and tells B not to touch it. B's branch (origin/claude/ip12-odeme-saglayici) adds the three index.ts files and leaves config.toml unchanged. After both merge, all three payment functions stay disabled locally and in CI. This is a cross-stream integration break with no owner; the fix is one line, but nobody is assigned to make it.

### 5. [major] `supabase/migrations/20261030100100_billing_tables.sql:792`

**Problem:** `quote_guard` and `price_list_guard` refuse every UPDATE outside their allow-lists, and that includes the UPDATE Postgres issues for `on delete set null` FKs. Deleting an auth user referenced by `quote.issued_by`/`decided_by` or `price_list.created_by`/`published_by` therefore fails. `audit_event` and `consent_record` got `insert_only_unlink_user` for exactly this case; quote and price_list did not.

**Scenario:** An ops staff member publishes a price list (published_by = their id) or, once A2 lands, issues a quote (issued_by). Their account is then deleted through the Admin API, or a test (A2/E) creates and deletes a temporary ops user. The FK action runs `UPDATE price_list SET published_by = NULL`, price_list_guard raises `price_list_not_draft` (quote_guard raises `quote_frozen`), and GoTrue returns 500 "Database error deleting user". The same happens with `decided_by` when a customer who declined a quote is erased.

**Suggested fix:** In `quote_guard`, allow a transition that only sets `issued_by`/`decided_by` to null, and in `price_list_guard` one that only nulls `created_by`/`published_by` (same jsonb_set comparison as `insert_only_unlink_user`). Add pgTAP tests that delete an auth user referenced by a published list and by a decided quote.

**Verifier note:** Confirmed. price_list_guard raises price_list_not_draft on any UPDATE of a published list, including the FK action's SET NULL on created_by/published_by (billing_tables.sql:139-140). quote_guard rejects a change to issued_by through the frozen-columns comparison. It also rejects nulling decided_by on a decided quote, because old.status <> 'issued' raises quote_not_open. So deleting an ops user who published a price list, issued a quote or decided one fails, and GoTrue returns 500. audit_event and consent_record use insert_only_unlink_user for exactly this case; these two tables were missed. The customer-erasure part is moot because customer_user_id is ON DELETE RESTRICT anyway. The ops-staff deletion bug is real.

### 6. [major] `apps/web/tests/integration/customer-signup.test.ts:69`

**Problem:** The PR found that `signInWithOtp({shouldCreateUser:false})` fails with `signup_disabled` for a freshly registered, unconfirmed phone, and that `auth.resend({type:'sms'})` is needed instead. The test quietly switches to `resend`, but design §7 web flow step 2 and C's brief (ip12-c-site-kayit.md:84) still prescribe only `signInWithOtp`.

**Scenario:** Stream C runs in parallel and builds /kayit exactly as specified: register returns 200, then it calls `signInWithOtp(shouldCreateUser:false)`. For every new self sign-up GoTrue returns 422 `signup_disabled`, so no SMS is sent, the user can never verify, and the account is deleted by cleanup after 24h. Self sign-up is broken end to end, and C's e2e (if it exercises a real new phone) fails only after both PRs merge.

**Suggested fix:** Update docs/musteri-yonetimi.md §7 web flow and C's brief: try `signInWithOtp` first and fall back to `auth.resend({type:'sms', phone})` on `signup_disabled`, or always use `resend` for a new registration. Better still, export a shared `requestSignupCode` helper so C cannot drift from it.

**Verifier note:** Confirmed. The PR's integration test (customer-signup.test.ts:66-76) found that signInWithOtp(shouldCreateUser:false) returns signup_disabled for an unconfirmed new phone, so it falls back to auth.resend({type:'sms'}). The PR does not update design §7 web-flow step 2 (design.md:701) or C's brief (ip12-c-site-kayit.md:84), and both still prescribe signInWithOtp only. Stream C's branch (apps/web/src/app/(site)/kayit/actions.ts:54-64) calls only signInWithOtp, with no resend fallback. Once both merge, every new self sign-up gets no code.

### 7. [minor] `supabase/migrations/20261030100300_signup_consent_profiles.sql:851`

**Problem:** Consent records written by ops take `recorded_at = p_kvkk_consent_at`, a backdated user-supplied date, while withdrawals and portal records use now(). "Latest record wins" (`my_consents`, `ops_customer_consents`, ordered by recorded_at desc) can then show a stale withdrawal over a newer grant.

**Scenario:** Ops withdraws an owner's KVKK consent today, so a record with granted=false and recorded_at=now() is written. The next day ops re-grants it, entering the date of the signed paper form, kvkk_consent_at = last week. The new granted=true record has recorded_at = last week, which sorts before the withdrawal. `my_consents` and `ops_customer_consents` report kvkk_notice as withdrawn, while `owner_profile.kvkk_consent` is true. A2's `consent_required` check on `customer_accept_quote` would then refuse the customer.

**Suggested fix:** Always set `recorded_at = now()` for new consent records. Keep the declared consent date in owner_profile, or add a separate `consented_at` column if the evidence needs it. Keep backdating only for the one-time backfill.

**Verifier note:** Confirmed. ops_create_owner_profile writes recorded_at = p_kvkk_consent_at, and ops_update_owner_profile writes recorded_at = coalesce(p_kvkk_consent_at, now()). A withdrawal (consent false, date usually null) gets now(), while a later re-grant with a backdated paper-form date sorts before it. my_consents (DISTINCT ON ... recorded_at desc) and ops_customer_consents would then show the withdrawal as the latest record while owner_profile.kvkk_consent is true. The design asks for the profile's time only in the one-time backfill (design.md:402). Edge case in an ops-only flow, so minor.

### 8. [minor] `apps/web/tests/integration/billing-columns.test.ts:7`

**Problem:** The test (and the PR description) claims `BILLING_COLUMNS` equals the columns granted to authenticated. It only checks that every listed column is selectable and that `ops_note` and `*` are refused. A column granted but missing from the list, or an internal column granted by mistake, is not detected.

**Scenario:** A later migration (A2/D/E) grants `select (termination_note)` on service_order, or adds a column to `payment` without updating the grant list. The test still passes: listed columns stay readable and `select *` on payment still fails because `provider_token` is withheld. The contract D and E rely on silently drifts, and an internal column can leak with the suite green.

**Suggested fix:** Compare each `BILLING_COLUMNS` list with `information_schema.column_privileges` (grantee = 'authenticated', privilege_type = 'SELECT'), or use pgTAP `column_privs_are`/`any_column_privs_are`, and assert set equality for every table.

**Verifier note:** Confirmed that the test checks a subset, not equality. It only asserts that the listed columns are selectable and that ops_note and payment * are refused. pgTAP 31_billing_rls checks a fixed denylist of known internal columns, which already catches the finding's termination_note example. A newly added column that is granted, or a granted column missing from BILLING_COLUMNS, would still go undetected, and the comment's claim of equality is wrong. Test-quality issue, minor.

### Cross-stream note
Finding about `config.toml` (`enabled = false` for B's payment functions): A1 owns `supabase/config.toml`. Fix it here so that once #54 and #55 are both merged, the payment functions are enabled locally and in CI. Check how B (`origin/claude/ip12-odeme-saglayici`) expects them to be configured.
