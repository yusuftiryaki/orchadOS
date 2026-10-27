# İP12-C review fixes (PR #53)

An independent review of PR #53 found the defects below, and an adversarial verifier confirmed each one against the code. Fix every one of them on the PR's branch.

## Rules
- `git fetch origin && git checkout claude/ip12-site-kayit && git pull --ff-only`. Commit on top. **No force-push, no rebase, never merge PRs, never push to main.**
- Read `CLAUDE.md`, `docs/gorevler/README.md`, the original brief `docs/gorevler/ip12-c-site-kayit.md` and the design `docs/musteri-yonetimi.md` (all on `origin/docs/ip12-musteri-yonetimi`). Keep every cross-stream contract (names, signatures, JSON shapes, error codes) unless a finding says the contract itself is wrong. In that case change the code, then list the contract change in the PR comment.
- Other streams are building on this branch (İP12-A2 merges #54 and #55; İP12-D and İP12-E come later). Keep changes minimal and focused.
- Add a regression test for each critical or major finding.
- Run this stream's relevant checks: `pnpm web:lint`, `pnpm web:test`, `pnpm db:test`, plus e2e where relevant. Everything must pass. Push, then make sure CI (`db-web`) is green.
- When you are done, add a PR comment in Turkish through `gh api repos/yusuftiryaki/orchadOS/issues/53/comments -f body=...`. For each finding, say how you fixed it, or why you did not with your reasoning, and give the test results. End the comment with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- If a fix belongs in another stream's owned paths, don't edit them. Describe the problem in the PR comment instead.

## Findings

### 1. [major] `apps/web/src/app/(site)/kayit/actions.ts:64`

**Problem:** The sign-up `resend` intent lets anyone check whether a phone number has an account, which the login page deliberately hides. It also skips Turnstile, the signup rate limit and the signup flag.

**Scenario:** An attacker who is not signed in posts `intent=resend&phone=+905XXXXXXXXX` straight to `signupAction`; the action ID can be read from the /kayit client bundle. resend() (lines 122-128) goes to sendCode(), and signInWithOtp runs with shouldCreateUser:false. For a number with no account, GoTrue returns otp_disabled/user_not_found, phoneCodeError maps that to "not_registered", and line 64 returns `s.errors.failed`. A registered number gets codeStep() with the "code sent" notice. `/giris` (requestPhoneCode) gives the same answer in both cases on purpose. This endpoint gives different answers, so a script can find out whether any Turkish mobile number belongs to an orchadOS customer or staff member (personal data under KVKK). It needs no captcha, does not touch the HMAC-keyed signup_register_attempt limit, and works even when ORCHADOS_SIGNUP_ENABLED is off, because only register() checks the flag. The `verify` intent likewise works with the flag off.

**Suggested fix:** Treat "not_registered" in resend() the way requestPhoneCode does: return codeStep(previous, phone) so the response looks the same. Or only allow resend for the phone that register() just accepted, for example by keeping it in a short-lived httpOnly cookie or signed token on the server rather than trusting the form field. Also reject `resend`/`verify` when `siteFlags().signupEnabled` is false, at the top of signupAction.

**Verifier note:** Confirmed. resend() takes the phone from the form, runs no flag, Turnstile or signup-limit check, and calls sendCode(). sendCode maps not_registered to s.errors.failed (actions.ts:64), while a confirmed registered phone gets codeStep() with the 'code sent' notice. /giris requestPhoneCode (giris/actions.ts:62) hides not_registered on purpose. /kayit renders even with the flag off, and only register() checks siteFlags(), so the action stays reachable. That is a working account-existence oracle for verified phones. The only thing slowing it down is GoTrue's per-phone SMS frequency limit.

### 2. [critical] `apps/web/src/app/(site)/kayit/actions.ts:55`

**Problem:** sendCode asks for the SMS code with signInWithOtp({shouldCreateUser:false}), but GoTrue treats a code request for an unconfirmed phone as a new sign-up and refuses it with signup_disabled. phoneCodeError maps that to not_registered, and the user sees the generic 'failed' text. A new self-service account (created by A1 with phone_confirm:false) can never get its first code. /kayit/dogrula/actions.ts:33 has the same bug.

**Scenario:** A visitor fills /kayit and register returns 200 {next:'verify_phone'}. GoTrue refuses signInWithOtp for the unconfirmed phone with signup_disabled. The form shows 'Kayıt tamamlanamadı. Biraz sonra yeniden deneyin.', no SMS goes out, and the code step never appears. Every retry deletes and recreates the account and fails the same way. A1's own integration test (origin/claude/ip12-veri-modeli apps/web/tests/integration/customer-signup.test.ts:65-76) documents this: 'GoTrue treats a code request for a phone that is not confirmed yet as a sign-up (refused: signup_disabled), so a new account asks with resend'. No test on this branch covers it: e2e stops before the function is called, and every existing phone-login fixture uses phone_confirm:true.

**Suggested fix:** In sendCode, and in the 'send' branch of the dogrula action, call signInWithOtp first. If error.code === 'signup_disabled', fall back to supabase.auth.resend({ type: 'sms', phone }) (phone confirmation through the Send SMS hook), then map the error. verifyOtp({type:'sms'}) then confirms the phone and yields an otp amr. Keep signInWithOtp for the §7.1 5.2 case (phone already verified).

**Verifier note:** Confirmed. supabase/config.toml sets [auth] enable_signup = false, and A1 creates the account with phone_confirm:false. In GoTrue, shouldCreateUser passes because the user exists, but SmsOtp treats a phone that is not confirmed as a new user and routes it through Signup, which returns signup_disabled when signups are off. A1's integration test (ip12-veri-modeli customer-signup.test.ts) documents exactly this and falls back to auth.resend({type:'sms'}). phoneCodeError maps signup_disabled to not_registered, which becomes s.errors.failed. So no first code is ever sent, in either /kayit or /kayit/dogrula/actions.ts:33. The design text (§7.1 step 2) is itself wrong, but that doesn't excuse it: the main sign-up flow cannot complete.

### 3. [minor] `apps/web/src/app/(site)/kayit/dogrula/page.tsx:21`

**Problem:** /kayit/dogrula decides from phone_confirmed_at whether to offer a code. customer-signup complete answers 403 phone_not_verified whenever the session's amr lacks a phone code newer than account creation, even if the phone is confirmed. A user with a confirmed phone but a password session gets the 'zaten doğrulanmış → Devam' screen, which links back to '/', and '/' shows the verify card again: an endless loop.

**Scenario:** The user verifies the OTP, but completeSignup fails transiently (a 500, or the tab closes before the redirect). Later they sign in with e-mail and password (amr=password). '/' calls complete and gets 403 phone_not_verified (A1 index.ts:199-205 checks the amr), so it shows the verify card. /kayit/dogrula sees phone_confirmed_at set and shows 'Telefonunuz zaten doğrulanmış' with a link to '/'. The loop never ends. The 24h cleanup only removes unverified phones, so the pending sign-up is never completed and the customer never reaches /portal.

**Suggested fix:** Show VerifyForm whenever the account has a phone, or at least when complete reports phone_not_verified, not only when phone_confirmed_at is null. signInWithOtp works for a confirmed phone and produces the required otp amr. The 'done' branch should not link back to '/' when complete still returns phone_not_verified.

**Verifier note:** Confirmed. dogrula/page.tsx branches only on phone_confirmed_at. A1 complete returns 403 phone_not_verified whenever the session has no phone-code amr newer than account creation. A confirmed-phone user on a password session therefore gets the 'done → /' link, and '/' shows the verify card again, a loop. It is narrow, though. It needs the OTP verify to succeed, complete to fail transiently (the same-session '/' retry would normally succeed), and the user to come back later with password login. The user can also break out by signing in by phone at /giris. Minor, not major.

### 4. [minor] `apps/web/src/app/(site)/page.tsx:28`

**Problem:** Regression for existing users who have no role. '/' now calls complete for every signed-in user without a section and shows the 'Telefonunuzu doğrulayın' card on 403 phone_not_verified. A1's complete returns that 403 for any password-session user before it checks for a pending sign-up, so users who never self-registered lose the noRoles card.

**Scenario:** A field-staff or expert user whose membership was removed, or an invited account that has no role yet, signs in with e-mail and password while ORCHADOS_SIGNUP_ENABLED=1 (CI and e2e run with it on). '/' calls complete and gets 403 phone_not_verified. The page shows the verify card instead of t.home.noRoles. /kayit/dogrula then shows 'no phone' or 'already verified → /' (the loop above), and the user is pushed into a sign-up flow they never started.

**Suggested fix:** Show the verify card only for self-service accounts: read app_metadata.signup === 'self' from the claims or getUser before calling complete. Otherwise render noRoles. Alternatively, agree with A1 that complete returns no_pending before the amr check when there is no pending sign-up.

**Verifier note:** Confirmed. With signupEnabled on, '/' calls complete for every signed-in user without a section. A1 complete checks phone_confirmed_at and the amr before signup_complete, so it returns phone_not_verified, never no_pending, for any password-session or phoneless account. Staff or invited users with no role therefore see the verify card instead of noRoles. This follows the design's §9 ordering combined with A1's check order, and it only affects role-less accounts, which are an edge population. It is a UX regression with no security impact.

### 5. [major] `apps/web/src/app/(site)/paketler/page.tsx:36`

**Problem:** /paketler shows unitPriceKurus labelled 'dönüm başına, yıllık', and the model copy says annual fee = area × per-dönüm price. Design §6.6 computes visit_amount = visits × tenths × unit_price_kurus / 10, so unit_price is per dönüm per visit. Once İP12-D wires loadPublicPackages, the published annual price is understated by a factor of periodicVisitsPerYear. The distance-sales and pre-information texts (legal.ts:421, 581) repeat the same formula without visits.

**Scenario:** With the seed v1 list, standart has unit 12500 kuruş and 4 visits. The page shows '₺125 dönüm başına, yıllık'. A 20-dönüm customer expects about 2.500 ₺ + KDV, but price_preview and the quote compute 4 × 200 × 12500 / 10 = 1.000.000 kuruş (10.000 ₺) + KDV. The public price and the pre-contract information are off by 4x, which is a consumer-law (mesafeli satış price disclosure) and trust problem.

**Suggested fix:** Label the unit as 'dönüm başına, ziyaret başına' and show the annual per-dönüm figure as unitPriceKurus × periodicVisitsPerYear. Update siteText.packages.lead/model and the legal.ts / docs/hukuk price clauses to 'ziyaret sayısı × alan × birim fiyat', or ask the design owner to resolve the §2 vs §6.6 wording before D wires the data.

**Verifier note:** Confirmed as an inconsistency. §6.6 computes visit_amount = visits × tenths × unit_price_kurus / 10 (seed example: 4 × 200 × 12500 / 10), so unit_price is per dönüm per visit. The page labels unitPriceKurus 'dönüm başına, yıllık'. siteText.packages.model, legal.ts Madde 8 and the pre-information '3. Fiyat' section all say annual fee = per-dönüm annual price × area, with no visit factor. The price display is latent because loadPublicPackages returns [] until İP12-D wires it. The legal and model texts with the wrong formula are rendered now, and a price disclosure understated by the visit factor is a consumer-law risk. The ambiguous §2 wording ('dönüm başına ve yıllık') explains how this happened but does not resolve the conflict with §6.6.

### Cross-stream note
The `/paketler` price display must match the price computation in design §6.6 and A1's `catalog` functions on `origin/claude/ip12-veri-modeli`. Read those to get the formula right. Don't edit A1's files.
