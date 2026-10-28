# Auth hardening after PR #93 (remaining account-takeover paths)

PR #93 is merged. It closes the pre-hijack regression it introduced. A second adversarial round found **pre-existing** weaknesses in the auth flows, which already existed on main before #93. Fix all of them in one new PR.

## Required
1. **Phone change for customer and owner accounts.**
   - A completed account can currently get a confirmed phone it does not own. The phone-change code goes to the *current* phone. Locally, `enable_confirmations=false` applies the change without any code.
   - Block self-service phone changes on customer and owner accounts with an `auth.users` BEFORE UPDATE trigger, in the style of `demo_account_freeze`. Phone changes go only through ops or a server flow.
   - Make `send-sms` never send a `phone_change` code to the old number.
   - Add a test proving that a completed account cannot end up with a different confirmed phone.
2. **Phone-code proof.**
   - `latestPhoneCodeAt` must accept only `sms` amr entries. An e-mail OTP or magic link also yields `otp`, so it is not phone proof.
   - Check the hosted and local auth config. Disable e-mail OTP and magic-link login for self sign-up accounts if they are enabled.
   - Add a test: an e-mail-OTP session with a valid ticket gets `phone_not_verified`.
3. **`signup_code_grant`.** Bind the marker to a single server-initiated send. Make it service-role only, called from the server action. Rate-limit it.
4. **Quarantine robustness.**
   - Quarantine in the DB first (inside `signup_owner_check`), before deleteUser, and alert ops if that fails.
   - Exclude rows with `review_required_at` from housekeeping and cleanup deletes, so ops actually sees them.
   - Align `docs/deployment.md` with this behaviour.
5. **send-sms marker.** Consume it only after the provider send succeeds.
6. **Public `/auth/v1/resend` sign-up DoS.** Either make the hook return an error that GoTrue treats as "not sent", so the stored token is kept, after checking that this still satisfies H33. Or document it as an accepted trade-off and do not count wrong codes toward the lock while a sign-up code step is pending.
7. Fix the stale comment in `apps/web/src/lib/signup/send-code.ts`.
8. Confirm that every regression test fails against the pre-fix code. Run the relevant functions from `origin/main~` (or `git stash`) and say so in the PR.

## Rules
- Branch `claude/auth-sertlestirme` from origin/main. New migrations get timestamps after the latest one on main.
- Read `CLAUDE.md`, `docs/gorevler/README.md`, `docs/musteri-yonetimi.md` §7, `docs/hukuk/kararlar.md` H33, and the #93 brief `docs/gorevler/hukuk-duzeltme-93b.md` on origin/docs/hukuk-takip.
- Run `pnpm db:reset && pnpm db:test`, `pnpm web:lint`, `pnpm web:test`, plus the sign-up, phone-login, invite, demo and notification e2e tests. CI must be green. Do not break invite-user, viewer invitations, ops-created owners, phone login or demo-start.
- Open the PR with `gh api repos/yusuftiryaki/orchadOS/pulls ...` and a Turkish description. Never merge PRs, push to main or force-push.

## Raw findings

- [major] `supabase/functions/send-sms/index.ts (sends to payload.user.phone); public.signup_sms_allowed in supabase/migrations/20261103300100_signup_owner_proof.sql (returns true for completed or non-self accounts); GoTrue PUT /auth/v1/user`: The new SMS gate only applies to unfinished self sign-ups. For a completed account, a phone change still sends its confirmation code to the account's current phone, not the new one (the repo's own note in docs/gorevler/ip12-duzeltme-55.md says this). So the account owner can confirm a phone number they don't own. The number then belongs to that account, and its real owner's later phone login or registration lands in that account. Locally it's worse: [auth.sms] enable_confirmations=false applies phone changes with no code at all, and on hosted projects protection depends only on the 'Confirm phone' dashboard setting.
  - Fix: Close phone changes for customer accounts: an auth.users BEFORE UPDATE trigger (like demo_account_freeze) that rejects changes to phone/phone_change for owner accounts, with phone changes done only by ops or a server flow. Have send-sms refuse or route phone_change codes to the new number (user.new_phone), never the old one. Add a test showing that a completed account cannot end up with a different confirmed phone.

- [major] `supabase/functions/_shared/signup.ts latestPhoneCodeAt (accepts amr method 'otp') used by customer-signup complete`: Complete counts any amr 'otp' entry as proof of a phone code, and an e-mail OTP or magic-link session also produces 'otp'. The registering account's own ticket plus an e-mail-code session therefore passes the owner check and the code check without anyone entering a phone code in that session. Combined with the time between a phone confirmation and the complete call that deletes the account, this undermines the claim that only the phone's holder confirms the sign-up.
  - Fix: Accept only amr method 'sms' (or check the session's authentication method against the phone) in latestPhoneCodeAt. Turn off e-mail OTP and magic-link login for self sign-up accounts, or have complete require the phone code in the same request. Add a test where an e-mail-OTP session with a valid ticket gets phone_not_verified.

- [minor] `public.signup_code_grant (granted to anon) and the per-user code_send_until marker`: Anyone holding a ticket can call the grant over and over, keeping a two-minute send window open on their own pending row for any code request on that number, including ones they make themselves through the public resend. The defence then rests entirely on complete's check.
  - Fix: Bind the marker to a single send started by the server (set and used inside the server action, ideally service-role only), and rate-limit the grant.

- [minor] `supabase/functions/customer-signup/index.ts complete, mismatch branch`: If both deleteUser and signup_quarantine fail, the function returns 500 'failed' and the confirmed phone stays on the unproven account. The web only signs the browser out.
  - Fix: Retry the quarantine, or run it in the database first (as part of signup_owner_check) before trying the delete, and alert ops on failure.

- [minor] `apps/web/tests/integration/customer-signup.test.ts, account-takeover.test.ts, tests/e2e/signup-hijack.spec.ts`: I did not finish checking that each regression test fails without the fix. Neither the phone-change path nor the e-mail-OTP path above has a test.
  - Fix: Add regression tests for both paths, and run the existing ones against origin/main's functions to confirm they fail there.

- [minor] `supabase/functions/send-sms/index.ts (signup_sms_allowed returns false → 200 {}) together with GoTrue /auth/v1/resend`: Anyone who knows a phone number can call the public /auth/v1/resend?type=sms once every 60 seconds while that phone's real owner is part-way through a sign-up. GoTrue creates a new confirmation token each time and stores it, because the hook answers 200 {}, but no SMS goes out. The code the owner already received stops working without warning. Every attempt then counts as a wrong code (phone_login_record_failure) and can lock the number for 15 minutes. Before this change the owner at least received the new code. This blocks a sign-up but does not let anyone take over an account.
  - Fix: Document this as an accepted trade-off, or have the hook return an error that GoTrue treats as 'not sent', so the stored token stays as it was. Check that the error still keeps H33 (does not reveal whether the number is registered). Optionally, do not count wrong codes toward the lock while a sign-up code step is waiting.

- [minor] `supabase/migrations/20261103300100_signup_owner_proof.sql (private.signup_quarantine + signup_housekeeping) vs docs/deployment.md 'kayıt sahibi parolasıyla tamamlar'`: Quarantine clears phone_confirmed_at. If the row is more than 24 hours old, the next hourly run of signup_housekeeping deletes it (it now counts as an unverified pending sign-up), and the cleanup action deletes the auth user (self, unconfirmed, created over 24h ago). A 'delete_failed' or 'unproven_code' account therefore disappears within an hour, the review flag goes with it so ops never sees it, and a registrant whose row predates tickets cannot actually 'finish with their password' as the docs say. Hosted sign-ups are not open yet, so almost nobody is affected today.
  - Fix: Keep rows with review_required_at set out of the housekeeping and cleanup deletes, or rewrite the docs to say that a quarantined sign-up older than a day is removed.

- [minor] `apps/web/src/lib/signup/send-code.ts header comment`: The comment still refers to signup_code_allowed, which the round-2 migration drops. The current check is signup_code_grant plus the hook marker. Someone reading it gets the wrong picture of where the gate is.
  - Fix: Point the comment at signup_code_grant and signup_sms_allowed.

- [minor] `supabase/functions/send-sms/index.ts (marker consumed before phone_login_code_requested / provider send)`: signup_sms_allowed uses up the one-shot marker before the rate-limit check and the provider call. If either of those fails (too_many_codes, a 502 from the provider, or a GoTrue hook timeout followed by a retry), the marker is already gone and any second hook call sends nothing, silently. The user recovers by pressing resend, which grants a new marker, so the effect is limited.
  - Fix: Optional: use up the marker only after the provider send succeeds, or accept the current behaviour and note it in the comments.
