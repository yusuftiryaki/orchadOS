# İP12-B review fixes (PR #54)

An independent review of PR #54 found the defects below, and an adversarial verifier confirmed each one against the code. Fix every one of them on the PR's branch.

## Rules
- `git fetch origin && git checkout claude/ip12-odeme-saglayici && git pull --ff-only`. Commit on top. **No force-push, no rebase, never merge PRs, never push to main.**
- Read `CLAUDE.md`, `docs/gorevler/README.md`, the original brief `docs/gorevler/ip12-b-odeme-saglayici.md` and the design `docs/musteri-yonetimi.md` (all on `origin/docs/ip12-musteri-yonetimi`). Keep every cross-stream contract (names, signatures, JSON shapes, error codes) unless a finding says the contract itself is wrong. In that case change the code, then list the contract change in the PR comment.
- Other streams are building on this branch (İP12-A2 merges #54 and #55; İP12-D and İP12-E come later). Keep changes minimal and focused.
- Add a regression test for each critical or major finding.
- Run this stream's relevant checks: `pnpm web:lint`, `pnpm web:test`, `pnpm db:test`, plus e2e where relevant. Everything must pass. Push, then make sure CI (`db-web`) is green.
- When you are done, add a PR comment in Turkish through `gh api repos/yusuftiryaki/orchadOS/issues/54/comments -f body=...`. For each finding, say how you fixed it, or why you did not with your reasoning, and give the test results. End the comment with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- If a fix belongs in another stream's owned paths, don't edit them. Describe the problem in the PR comment instead.

## Findings

### 1. [major] `supabase/functions/_shared/payments/handlers.ts:649`

**Problem:** The callback writes a final `failed` whenever retrieve comes back `not_completed`. evaluateRetrieve (acceptance.ts:151-159) also gives `not_completed` for iyzico API-level errors (`status: "failure"` with no paymentStatus), and iyzicoClient (iyzico.ts:76-78) treats an HTTP 4xx/5xx with a JSON body as a normal answer. So a passing provider error turns a captured payment into a final `failed`.

**Scenario:** The buyer finishes 3DS and iyzico captures the money. iyzico POSTs the callback, but the retrieve call hits a temporary iyzico error (HTTP 500 `{status:"failure",errorCode:"1"}`, rate limit, etc.). evaluateRetrieve returns `not_completed`, the callback calls payment_finalize('failed', not_completed), and failed is final. The later webhook hits `FINAL_STATUSES.has(row.status)` and returns 200 without confirming, and payment_attempts_to_reconcile never lists failed rows. The customer is charged, the order stays unpaid, and no refund is opened. The same path also turns a `pending_review` row (money already captured, fraud review) into `failed`.

**Suggested fix:** Keep 'API error / unknown token' separate from 'buyer did not finish' (for example a distinct outcome, or throw ProviderUnavailableError when `status !== 'success'` and there is no paymentStatus, or when the HTTP status is not 2xx). Only map a real NOT_COMPLETED paymentStatus to failed in the callback, and never do it for a row that is already pending_review. Leave the row as it is so the webhook or reconcile can settle it.

**Verifier note:** Confirmed. iyzicoClient (iyzico.ts:70-78) never checks res.ok, so any JSON body counts as kind 'ok'. confirm() passes it to evaluateRetrieve, and acceptance.ts:151 sends `status !== 'success'` with no paymentStatus to not_completed. The code's own comment says this is an API error, yet the callback (handlers.ts:649-653) writes it as payment_finalize('failed'). §8.5 limits not_completed to 'Ödeme henüz yapılmamış' (payment not yet made), and §8.4 step 2 (not_completed -> failed on the callback channel) assumes that meaning, so classing a read error as not_completed goes beyond the design. failed is final: the webhook skips it (FINAL_STATUSES, line 703) and payment_attempts_to_reconcile (§6.9) never returns failed rows. §5.4 also allows pending_review -> failed, so a replayed callback can flip a captured fraud-review payment too. Charged card, unpaid order, no refund opened: major.

### 2. [minor] `supabase/functions/_shared/payments/handlers.ts:645`

**Problem:** Callback and webhook re-confirm and re-finalize `pending_review` rows (FINAL_STATUSES leaves them out) without the same-status guard reconcile uses (`result.outcome !== row.status`, line 577). The callback needs no auth and anyone holding the token can replay it as often as they like.

**Scenario:** Someone who has a payment's token (it appears in the iyzico paymentPageUrl and in the posted callback form) POSTs `token=…` to payment-callback over and over for a pending_review (amount_mismatch or fraud_review) row. Each request makes an iyzico retrieve with merchant credentials and calls payment_finalize('pending_review') again. If A2's payment_finalize opens the provider_mismatch void again or re-audits on each call, duplicate system refunds or audit noise follow. Together with the first finding, any retrieve hiccup during such a replay flips the captured payment to failed.

**Suggested fix:** In handleCallback and handleWebhook, only call finalize when the row is `initiated`/`expired`, or when the new outcome differs from row.status, matching reconcile. Consider treating pending_review as terminal for the callback channel.

**Verifier note:** Confirmed. FINAL_STATUSES (line 57) leaves out pending_review and expired. The callback needs no auth, and on every POST with a known token it runs an iyzico retrieve with merchant credentials and calls finalize again, with none of the `outcome !== row.status` guard that reconcile has (line 577). Nothing limits replays. The duplicate refund/audit effect is not verified: A2's payment_finalize SQL is not on any branch, and §5.4 does not list pending_review -> pending_review, so the call may simply error and be swallowed. The real harm is unbounded unauthenticated provider calls, and each replay is another chance to hit the [0] flip. Minor.

### 3. [minor] `supabase/functions/_shared/payments/handlers.ts:560`

**Problem:** Reconcile silently skips `initiated` rows that have no provider_token and never ends them. Such rows stay `initiated` forever and keep taking slots in the 50-row RECONCILE_LIMIT.

**Scenario:** Start creates the row with payment_begin. Then initialize fails or times out, or payment_attach_token fails, and the compensating payment_finalize(failed) also fails (DB blip), or the function dies between the two calls. The row is `initiated` with a null token. payment_attempts_to_reconcile returns every initiated row older than 2 minutes (§6.9), but the loop `continue`s on it without counting or expiring it. Each such row permanently takes a slot. Once enough pile up, depending on A2's ordering, real attempts are no longer reconciled.

**Suggested fix:** For a token-less `initiated` row older than a grace period, call payment_finalize(failed, 'start_incomplete'), or 'expired'. Alternatively ask A2 to exclude token-less rows from payment_attempts_to_reconcile and add a housekeeping cleanup.

**Verifier note:** Confirmed. reconcile (handlers.ts:560) `continue`s on rows with no provider_token and does not count or end them. §6.9 says payment_attempts_to_reconcile returns every initiated row older than 2 minutes. A row can be left initiated with a null token if the function dies, or the compensating finalize(failed) fails, after payment_begin (lines 366-377). Such a row stays initiated for good and keeps taking a slot in the 50-row limit. If the customer starts again, payment_begin's supersede may expire it, and with token_expires_at null it then drops out of the expired window. Rare, two failures needed: minor.
