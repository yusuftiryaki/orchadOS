# İP12-E review fixes (PR #57)

An independent review of PR #57 found the defects below, and an adversarial verifier confirmed each one against the code. Fix every one of them on the PR's branch.

## Rules
- Run `git fetch origin && git checkout claude/ip12-back-office && git pull --ff-only`, then commit on top. **No force-push, no rebase, never merge PRs, never push to main.**
- Merge the latest dependency branches first: `origin/claude/ip12-veri-modeli`, `origin/claude/ip12-siparis-odeme-db`, `origin/claude/ip12-odeme-saglayici` and `origin/claude/ip12-site-kayit`. They carry review fixes (`docs/gorevler/ip12-duzeltme-5{3,4,5,6}.md`). Adapt your code if a fix changed a behaviour you rely on.
- Read `CLAUDE.md`, `docs/gorevler/README.md`, the original brief `docs/gorevler/ip12-e-back-office.md` and the design doc `docs/musteri-yonetimi.md`. All of them are on `origin/docs/ip12-musteri-yonetimi`.
- Touch only your stream's owned paths. İP12-D (portal, PR #58) is in flight. Do not touch its paths.
- Add a regression test for each critical or major finding.
- Run `pnpm web:lint`, `pnpm web:test` and `pnpm db:test`, plus the e2e specs for your screens. Everything must pass. Push, then make sure CI (`db-web`) is green.
- When done, add a PR comment in Turkish with `gh api repos/yusuftiryaki/orchadOS/issues/57/comments -f body=...`. For each finding, say how you fixed it or why you did not, and include the test results. End the comment with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Findings

### 1. [minor] `apps/web/src/app/operasyon/odeme/[id]/page.tsx:207`

**Problem:** The fraud-review form fills in `provider_ref` with the payment's own `provider_payment_id`. Accepting a payment held for fraud review therefore takes one click, and ops never has to confirm the reference against the provider. ops_resolve_payment_review only accepts that same stored value, so the 'reference ops checked' rule does nothing.

**Scenario:** iyzico returns fraud_status=0 and the payment goes to pending_review. An ops user opens /operasyon/odeme/<id> and the reference field is already filled. They click 'Başarılı'. The function sees v_ref equal to p.provider_payment_id, sets the payment to succeeded and activates the order. Nobody looked at the provider panel, which is the whole point of the 'provider ref required' step (brief §7).

**Suggested fix:** Leave the field empty (`defaultValue=""`) and require ops to type or paste the reference from the provider panel. Optionally show the stored id next to the field as a read-only hint. Keep the server-side `parseResolution` rule that a reference is required to accept.

**Verifier note:** Confirmed. odeme/[id]/page.tsx sets the provider_ref input's defaultValue to p.provider_payment_id. ops_resolve_payment_review (20261030105400_payments.sql) accepts only that same stored value (v_ref is distinct from coalesce(p.provider_payment_id, v_ref) -> invalid_input), so a pre-filled field turns 'the provider's payment id ops checked, required to accept' into a single click. No data is corrupted, but the confirmation step the brief asks for (§7, 'provider ref required') does nothing.

### 2. [minor] `apps/web/src/app/operasyon/sahip/page.tsx:50`

**Problem:** The new customer search is a GET form, so the search term goes into the URL as `?q=`. ops_customers matches on name, phone and e-mail, so ops will type personal data, and it ends up in server and proxy access logs and in browser history. This breaks the 'no PII logged' acceptance rule.

**Scenario:** Ops searches for a customer by phone or e-mail. The request goes to `/operasyon/sahip?q=0532...` or `?q=ali@...`. The Next.js or hosting request log records the full URL with the phone or e-mail, outside the private schema and its retention rules.

**Suggested fix:** Send the search with POST (a server action that renders the results) or keep it in client state. If it must stay in the URL, at least refuse search terms that look like a phone number or e-mail and point ops to the masked list.

**Verifier note:** Confirmed. sahip/page.tsx uses a GET form with name="q", and ops_customers matches on full_name, phone and email. Searching by phone or e-mail therefore puts that value in the URL query string and in browser history. No other /operasyon screen used a ?q= search before this PR. Whether it is actually logged depends on the hosting, but it goes against the brief's 'No PII is logged' and KVKK intent. Kept minor because only authenticated ops users can reach the page.

### 3. [minor] `apps/web/tests/integration/back-office.test.ts:503`

**Problem:** The 'other roles' test treats `data === null` as a refusal, so it can never catch a missing role check on an ops_* function that returns void.

**Scenario:** About 13 of the listed functions return void: ops_save_billing_setting, ops_verify_application_garden, ops_reject_application, ops_cancel_refund, ops_resolve_refund, ops_save_price_list_draft, ops_delete_price_list_draft and others. When one of them succeeds, PostgREST returns null. Suppose a fix-forward migration drops `private.require_ops` from ops_save_billing_setting. field@ then saves `{payment_due_days:14}` on SEED.org, gets `data === null`, and the test still passes. The same goes for ops_verify_application_garden and ops_reject_application, which are called on the real seed garden and seed application: the seed would be changed and the test would stay green. Most of the other void calls use a random id, so they fail with not_found before any role check runs and test nothing. The only thing that would catch a regression is the priceListV2 status assertion, which covers just two of the functions.

**Suggested fix:** Count a call as refused only when `error !== null` (for the setof readers, also allow an empty array). Call each void writer with a real, ops-visible id, so that only the role check can fail it. Assert `error.message === 'forbidden'` (or 'not_found'), and do not accept `data === null` as a refusal.

**Verifier note:** Confirmed. back-office.test.ts 'other roles' counts `data === null` as refused, and the void writers (ops_save_billing_setting, ops_verify_application_garden, ops_reject_application, ops_cancel_refund, ops_save_price_list_draft, ops_delete_price_list_draft, etc.) return null on success. If a role check were missing, the test would still pass. Most of the other calls use a random id and fail with not_found before any role check runs. Only the priceListV2 status check would catch a regression. Downgraded to minor: this is a gap in test coverage, not a production bug, and the role checks are present in the functions.

### 4. [minor] `apps/web/src/app/operasyon/iade/page.tsx:106`

**Problem:** 'İşle' is shown for every failed card refund, but payment_refund_claim rejects a failed refund whose `retryable` is false, so the button can only ever fail.

**Scenario:** Ops settles an uncertain refund by hand as failed. ops_resolve_refund then sets status='failed' and retryable=false. The same happens when the provider declines with a non-retryable code. The row still shows 'İşle'. Each click calls the Edge function, which gets refund_not_open from payment_refund_claim and answers 409. Ops sees the 'refund not open' error every time and cannot tell why.

**Suggested fix:** Show the button only when `r.status === 'requested' || (r.status === 'failed' && r.retryable !== false)`. That is the same rule payment_refund_claim applies.

**Verifier note:** Confirmed. In iade/page.tsx, canProcess = card && (status requested || failed) ignores retryable, although ops_refunds returns retryable. payment_refund_claim raises refund_not_open when status = 'failed' and retryable is not distinct from false, and ops_resolve_refund(failed) sets retryable=false. On such a row 'İşle' always fails with the refund_not_open error.

### 5. [minor] `apps/web/src/lib/back-office/validation.ts:420`

**Problem:** An emptied IBAN field is never sent, so the stored IBAN cannot be cleared, although the comment says every key is sent and an empty text clears it.

**Scenario:** Ops empties the IBAN field and saves. `settings.iban` is left out of p_settings, so ops_save_billing_setting keeps the old IBAN, which supports null and would clear it. The page still says 'Ayarlar kaydedildi'. The old IBAN keeps appearing to customers as the place to send transfers.

**Suggested fix:** When `iban` is empty, set `settings.iban = null`, the same way the other text keys are handled.

**Verifier note:** Confirmed. In validation.ts parseSettings, settings.iban is set only when the field is non-empty. ops_save_billing_setting writes only the keys present, and a null iban clears the stored one (input_text returns null, the regex check on null does not raise, r.iban := null). So emptying the field silently keeps the old IBAN, which contradicts the function's own comment ('Every key is sent (an empty text clears it)').

### 6. [minor] `apps/web/src/lib/back-office/data.ts:137`

**Problem:** The customer account panel reads applications and payments for the whole org with a cap of 1000 rows and then filters by customer in JavaScript. getQuote looks up the customer name the same way, from ops_customers capped at 1000. Older rows silently disappear.

**Scenario:** In an org with more than 1000 payments, ops_payments returns only the newest 1000. A customer whose payments are older sees 'none' under Ödemeler on /operasyon/sahip/[id], although the payments exist. In the same way, once the org has more than 1000 owner profiles, the quote page shows the customer as 'none'.

**Suggested fix:** Ask A2 for a `p_customer_user_id` filter on ops_payments and ops_applications, as ops_orders already has (or add one in a 20261031200000 fix-forward migration), and pass it here. For the quote's customer name, query by user id rather than scanning ops_customers.

**Verifier note:** Confirmed. customerAccount reads ops_applications and ops_payments for the whole org (limit 1000, which is also PostgREST's max_rows) and filters by customer_user_id in JS. getQuote scans ops_customers capped at 1000 in the same way. ops_payments takes p_order_id but has no customer filter. Once an org passes 1000 rows, older customers' data silently disappears from the panel. Low impact at pilot scale.

### 7. [minor] `apps/web/src/app/operasyon/sahip/page.tsx:35`

**Problem:** The existing owners list changed behaviour: it is now capped at 1000 rows per org (ops_customers' limit), where the old ops_owner_profiles list had no cap, and the contact-preference column was removed. The brief says existing ops screens keep their behaviour.

**Scenario:** Once an org has more than 1000 owner profiles, the oldest ones no longer appear on /operasyon/sahip, and the page gives no sign that rows are missing. The 'İletişim tercihi' column that ops relied on is also gone, though the brief only asked for new columns to be added.

**Suggested fix:** Keep the contact-preference column (the consent map from listOwnerProfiles already carries contact_preference). Either page through ops_customers or tell the user when 1000 rows came back.

**Verifier note:** Partly confirmed. The 'İletişim tercihi' (contact preference) column was removed from /operasyon/sahip, while the design says the new columns are added ('eklenir') and the brief says existing ops screens keep their behaviour. The cap part is refuted: supabase/config.toml sets max_rows = 1000, so the old ops_owner_profiles list was already capped at 1000.

### 8. [minor] `apps/web/src/app/operasyon/ayarlar/page.tsx:29`

**Problem:** Settings, prices, the package form and the audit log work on `chooseOrg(orgs, ?org)` but offer no way to pick an org, and after a save the redirect drops `?org`.

**Scenario:** An ops user who belongs to two orgs opens /operasyon/ayarlar?org=<B> and saves. The redirect goes to boHref.settings(), which has no org, so the page now shows org A's settings next to 'Ayarlar kaydedildi'. To ops it looks as if the change did not take. Without typing ?org= by hand, org B cannot be reached at all, and /operasyon/fiyat/paket/yeni always creates the package in org A.

**Suggested fix:** Render an org selector when opsOrgs returns more than one org. Keep `org` in the success redirects (boHref.settings, prices, audit) and in the package form.

**Verifier note:** Confirmed. ayarlar (and prices/audit) pick the org with chooseOrg(orgs, ?org), offer no org selector, and the success redirects (boHref.settings/prices) are built without org. A user in two orgs who saves org B's settings lands on org A's settings next to 'Ayarlar kaydedildi'. Only multi-org ops users are affected, which is rare at pilot scale.

### 9. [minor] `apps/web/src/app/operasyon/siparis/[id]/page.tsx:51`

**Problem:** The order page computes 'outstanding' as total − paid and shows gross paid. The database's balance is total − (paid − refunded), and the order list on the same branch shows net paid (paid − refunded).

**Scenario:** Take a 1000 TL order on which 200 TL has been refunded. The list shows 'Ödenen 800', while the detail page shows 'Ödenen 1000' and 'Kalan 0'. For an awaiting_payment order with refunded_kurus > 0, ops_record_manual_payment would accept 200 TL more, but the page hides the transfer form because its outstanding is 0.

**Suggested fix:** Use `o.total_kurus - (o.paid_kurus - o.refunded_kurus)` for the awaiting case, which is the database's formula, and label paid as net, matching the list page. If gross paid is shown, show refunded next to it, as the page already does.

**Verifier note:** Confirmed. siparis/[id]/page.tsx computes outstanding = total - paid, while the DB (ops_record_manual_payment line 664, activate_order) uses total - (paid - refunded), and the list page shows paid - refunded. On an awaiting_payment order with refunded_kurus > 0, the page shows a wrong 'Kalan' (outstanding) and can hide the transfer form even though the DB would accept a payment. The page shows gross paid with refunded next to it, which is acceptable; the outstanding figure is the bug.
