# İP12-D review fixes (PR #58)

An independent review of PR #58 found the defects below, and an adversarial verifier confirmed each one against the code. Fix every one of them on the PR's branch.

## Rules
- Run `git fetch origin && git checkout claude/ip12-portal-odeme && git pull --ff-only`, then commit on top. **No force-push, no rebase, never merge PRs, never push to main.**
- Merge the latest dependency branches first: `origin/claude/ip12-veri-modeli`, `origin/claude/ip12-siparis-odeme-db`, `origin/claude/ip12-odeme-saglayici` and `origin/claude/ip12-site-kayit`. They carry review fixes (`docs/gorevler/ip12-duzeltme-5{3,4,5,6}.md`). Adapt your code if a fix changed a behaviour you rely on.
- Read `CLAUDE.md`, `docs/gorevler/README.md`, the original brief `docs/gorevler/ip12-d-portal-odeme.md` and the design doc `docs/musteri-yonetimi.md`. All of them are on `origin/docs/ip12-musteri-yonetimi`.
- Touch only your stream's owned paths. İP12-E (back office, PR #57) is in flight; never touch its paths. If you need a database-level guard (e.g. payment_begin raising payment_in_progress while a live attempt exists), add a fix-forward migration in your own range supabase/migrations/202610311000*.sql with a pgTAP test in supabase/tests/40_*.
- Add a regression test for each critical or major finding.
- Run `pnpm web:lint`, `pnpm web:test` and `pnpm db:test`, plus the e2e specs for your screens. Everything must pass. Push, then make sure CI (`db-web`) is green.
- When done, add a PR comment in Turkish with `gh api repos/yusuftiryaki/orchadOS/issues/58/comments -f body=...`. For each finding, say how you fixed it or why you did not, and include the test results. End the comment with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Findings

### 1. [minor] `apps/web/src/app/portal/siparis/[id]/page.tsx:108`

**Problem:** The order page shows 'Kartla öde' whenever the order is awaiting_payment, even while a card attempt is still live (pending_review, or initiated/expired with token_expires_at > now). payment_begin only expires initiated rows. It does not refuse a new start while an attempt is live, so the customer can be charged twice.

**Scenario:** A customer pays, iyzico returns fraudStatus=0 and the payment becomes pending_review, but the order is still awaiting_payment. The order page still offers the card button, so the customer pays again and that payment succeeds. Ops then approve the first one with ops_resolve_payment_review, and the customer has paid twice; the overpayment refund is only issued later. A second variant: start a payment in tab A, start another in tab B (A becomes expired/superseded), then finish A's checkout. A late 'expired → succeeded' is allowed, so both payments succeed.

**Suggested fix:** Work out the live attempt from view.payments with the same rule as private.live_payment_attempt (provider <> 'manual' AND (status = 'pending_review' OR (status IN ('initiated','expired') AND token_expires_at > now()))). While one exists, hide or disable PayButton and link to /portal/odeme/<id> with the 'payment_in_progress' text. Also check this in startPaymentAction, and ideally have payment_begin raise payment_in_progress.

**Verifier note:** Confirmed. siparis/[id]/page.tsx renders OrderPay/PayButton whenever status is awaiting_payment and never checks for a live attempt. payment_begin (20261030105400_payments.sql) only supersedes initiated rows and never raises payment_in_progress for a pending_review row, so a customer whose first payment went to fraud review can start and finish a second payment. The tab A/B variant matches the design: §5.4 allows a late expired→succeeded and §5.4 says overpayment opens an overpayment refund. So the money is recovered, but the customer is still charged twice for a while. It needs a rare fraudStatus=0 review, so it is graded minor, not major.

### 2. [minor] `apps/web/src/lib/portal-billing/validation.ts:79`

**Problem:** In parseScaledDecimal (and so parseDonumToM2), the thousands-group regex accepts a leading '0' group. A typed '0.750' or '0.500' is read as 750 or 500 dönüm (×1000), not rejected or read as a decimal.

**Scenario:** A customer types area '0.750' meaning three quarters of a dönüm. The parser returns 750000 m² (750 dönüm), which is inside GARDEN_AREA_M2.max. The garden is saved and the live price_preview shows a price about 1000 times too high. If ops verifies using the declared area (as the e2e helper opsQuote does), the quote is wrong too.

**Suggested fix:** Require the first thousands group to start with 1-9 (/^([1-9]\d{0,2}(?:\.\d{3})+)(?:,(\d+))?$/) so '0.750' fails to match. Then either reject it or treat it as a dot decimal. Add a unit test for '0.750'.

**Verifier note:** Confirmed in validation.ts parseScaledDecimal: '0.750' fails the first regex and matches the second, /^(\d{1,3}(?:\.\d{3})+)…$/, with group '0'. The whole part becomes '0750', giving 750 dönüm = 750000 m², which is within GARDEN_AREA_M2.max. '0.75' and '0.5' are parsed correctly by the third branch, so only the three-digit form is wrong. Ops verify the area before the quote, which limits the impact.

### 3. [minor] `apps/web/src/components/portal-billing/customer-home.tsx:78`

**Problem:** Design §10 says to show 'Bahçenizi kaydedin' only when there is nothing yet. The CTA condition ignores orders and parcels, and summary.hasAnything (data.ts:550) is computed but never used. In the seed, owner@ and viewer@ both have an owner_profile, so roles.customer is true for them. Every existing ops-created owner and co-owner therefore gets the billing nav plus a permanent 'register your garden' card above their parcel list.

**Scenario:** The journey customer pays, the order is active and the parcel is registered, yet /portal still shows the 'Bahçenizi kaydedin' CTA next to the parcel list. Pilot owner@ (and co-owner viewer@, whose seed owner_profile makes them a 'customer') now see this CTA above their existing gardens every time. That contradicts the layout comment that a co-owner sees only the gardens.

**Suggested fix:** Show the CTA only when there are no applications, no orders and no parcels: use summary.hasAnything || hasParcels. Decide explicitly whether co-owners with a profile should get PortalNav, and fix the layout comment.

**Verifier note:** Confirmed. The customer-home.tsx CTA condition ignores awaitingOrders, active orders and parcels, and summary.hasAnything is computed in data.ts but never read. The seed gives owner@ and viewer@ owner_profile rows, and loadUserRoles sets customer = (my_owner_profile has a row), so both get PortalNav plus the 'Bahçenizi kaydedin' card above their parcel list. That contradicts design §10 ('hiçbir şey yoksa') and the layout comment. The impact is UX only; the owner portal still works.

### 4. [minor] `apps/web/src/lib/pdf/receipt-pdf.tsx:157`

**Problem:** The receipt's total row prints receipt.paid_kurus, which is iyzico's paidPrice and includes any installment interest. The item lines above it add up to amount_kurus, and refunds are listed as negatives with no net figure, so the receipt does not add up.

**Scenario:** A 12.000,00 ₺ order is paid in 6 installments, and iyzico reports paidPrice 12.480,00. The receipt lists the garden line at 12.000,00 ₺ and then 'Toplam 12.480,00 ₺ (KDV dahil)', which suggests a 480 ₺ VAT-inclusive service charge. After a 1.000 ₺ partial refund there is still no net-kept figure.

**Suggested fix:** Print the lines total from amount_kurus. If paid_kurus differs, add a separate 'Taksit farkı' or 'Karttan çekilen' row. When refunds exist, add a net row (amount minus refunded_kurus).

**Verifier note:** Confirmed: the receipt-pdf.tsx total row prints paid_kurus while the item lines add up to amount_kurus, and no net-after-refunds row is printed. The problem is latent: installments are a non-goal (§1 'taksit (ayarı hazır)'), IYZICO_ENABLED_INSTALLMENTS defaults to 1, and manual payments have paid=amount. The mismatch appears only once installments are enabled.

### 5. [minor] `apps/web/src/lib/portal-billing/data.ts:484`

**Problem:** getConsents merges my_consents rows from every org into a single row per kind, and the quote page uses that to decide whether the KVKK notice is acknowledged. customer_accept_quote checks the quote's org, and customer_set_consent always writes to customer_org_id (the signup org is preferred).

**Scenario:** A pilot owner has an owner_profile in an ops org (created by ops_create_owner_profile, with no kvkk_notice consent_record) and a later self sign-up profile in the signup org (granted). Ops issue a parcel quote in the ops org. The quote page treats KVKK as done, so the acknowledgement box is hidden and the accept button is enabled. Accepting fails with consent_required(kvkk_notice), and nothing on the portal can record it for that org, so the customer is stuck.

**Suggested fix:** Keep org_id in ConsentView and check kvkk_notice for quote.org_id on the quote page. Raise with A1 that customer_set_consent needs an org parameter, or should target the quote's org.

**Verifier note:** Confirmed. my_consents returns one row per (org_id, kind), getConsents drops org_id and keeps the latest per kind, and the quote page uses that to hide the KVKK box. customer_accept_quote checks consent in the quote's org, while customer_set_consent writes to customer_org_id, which prefers the signup org. This only breaks for a user with owner profiles in two orgs. The pilot is single-org, so it is an edge case, and part of the cause is A1's single-org consent RPC.

### 6. [minor] `apps/web/src/lib/pdf/receipt-pdf.test.ts:54`

**Problem:** The unit test says it checks that the document title 'names it a receipt'. It only asserts that a /Title key exists, so it would still pass if R.title were changed or dropped. The brief's required title 'Ödeme makbuzu (fatura değildir)' is not covered by any test.

**Scenario:** Someone changes receiptText.title to 'Fatura'. This is the very wording the brief forbids, and the test stays green.

**Suggested fix:** Decode the PDF info Title (react-pdf writes it as a UTF-16BE hex string), or render the document text and assert it contains 'Ödeme makbuzu (fatura değildir)' and the receipt number.

**Verifier note:** Confirmed. receipt-pdf.test.ts only asserts /\/Title/ exists in the PDF bytes. No test checks the 'fatura değildir' title or the text, so renaming R.title would leave the test green. This is a test-coverage gap only; the rendered code is correct.
