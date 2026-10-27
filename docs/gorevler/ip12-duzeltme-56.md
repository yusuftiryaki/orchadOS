# İP12-A2 review fixes (PR #56)

An independent review of PR #56 found the defects below, and an adversarial verifier confirmed each one against the code. Fix every one of them on the PR's branch.

## Rules
- `git fetch origin && git checkout claude/ip12-siparis-odeme-db && git pull --ff-only`. Commit on top. **No force-push, no rebase, never merge PRs, never push to main.**
- First merge the latest `origin/claude/ip12-veri-modeli` and `origin/claude/ip12-odeme-saglayici`. Both now carry review fixes (see `docs/gorevler/ip12-duzeltme-54.md` and `ip12-duzeltme-55.md`). In particular, #54 fixes B's callback so that `not_completed` is no longer written as a final `failed`. Check what B did and keep A2 consistent with it. Even so, add A2's safety net as described below.
- Read `CLAUDE.md`, `docs/gorevler/README.md`, the original brief `docs/gorevler/ip12-a2-siparis-odeme-db.md` and the design `docs/musteri-yonetimi.md` (all on `origin/docs/ip12-musteri-yonetimi`). Keep every cross-stream contract unless a finding says the contract itself is wrong; in that case change the code, then list the contract change in the PR comment.
- İP12-D (portal) and İP12-E (back office) agents are building on this branch right now. Keep changes minimal, add new migrations only inside A2's file range, and don't rename anything.
- Add a pgTAP regression test for each critical or major finding.
- Run `pnpm db:reset && pnpm db:test`, `pnpm web:lint` and `pnpm web:test`. Everything must pass. Push, then make sure CI (`db-web`) is green.
- When you are done, add a PR comment in Turkish through `gh api repos/yusuftiryaki/orchadOS/issues/56/comments -f body=...`. For each finding, say how you fixed it or why you did not, and give the test results. End the comment with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Findings

### 1. [major] `supabase/migrations/20261030105400_payments.sql:460`

**Problem:** Contract mismatch on statuses: payment_finalize treats 'failed' as final, but B's payment-callback sends 'failed' for any `not_completed` retrieve answer. That includes iyzico API errors (status != success) and a callback posted before the form was completed. A capture the provider later reports as SUCCESS is then dropped with no record and no refund.

**Scenario:** 1) payment-callback has no authentication and needs only the token. The customer re-posts the form, or the callback arrives while retrieve returns status=failure (a transient error, or a token iyzico can no longer retrieve). evaluateRetrieve returns not_completed, and handleCallback calls payment_finalize(id,'failed',{failure_code:'not_completed'}). The row becomes failed. 2) iyzico then captures the payment and a webhook or a second callback arrives. B skips rows with FINAL_STATUSES (handlers.ts:645/703). If finalize were reached anyway, it returns early at line 460. payment_attempts_to_reconcile never selects failed rows. Result: the card is charged, the order stays awaiting_payment, no receipt is issued and no order_closed/overpayment refund is opened. Only a chargeback recovers the money.

**Suggested fix:** Make 'failed' recoverable for card rows. On p_outcome='succeeded' with matching amounts against a failed card row, either move it to pending_review with a failure_code such as late_success, or run complete_payment so the order_closed or overpayment refund logic applies; do not return early. Also report to B (in the PR) that not_completed or an API error must not be sent as 'failed'. Leave the row as it is and let reconciliation or expiry settle it.

**Verifier note:** Confirmed. iyzico.ts confirm() returns kind 'ok' for any JSON body, so an error body like {status:'failure', errorCode} skips ProviderUnavailableError. evaluateRetrieve (acceptance.ts:151) turns it into not_completed, and handleCallback (handlers.ts:649-653) writes finalize(id,'failed',{failure_code:'not_completed'}). From then on payment_finalize returns early for 'failed' (payments.sql:460), B skips FINAL_STATUSES on callback and webhook, and payment_attempts_to_reconcile never selects failed rows. A payment iyzico actually captured has no path to succeeded, activation or a refund. Mitigation: the design asks for this callback mapping (§8.4 step 2) and for final rows to stay unchanged (§5.4), so the contract matches the design. The root cause is B sending provider API errors as not_completed, combined with a design gap. Major because the money is lost silently, but it is mostly a B/design fix plus an A2 safety net.

### 2. [major] `supabase/migrations/20261030105400_payments.sql:492`

**Problem:** A payment held in pending_review for a mismatch (amount_mismatch / reference_mismatch, with a provider_mismatch void already open) is not protected from later finalize calls. A later 'failed' or 'succeeded' changes the row, which goes against §5.4 ('Sonuç failed yazılmaz'). ops_resolve_payment_review protects these rows (line 734); payment_finalize does not.

**Scenario:** A mismatch success gives pending_review plus a void refund in 'requested'. Before ops processes the void, anyone with the token re-posts payment-callback. pending_review is not in B's FINAL_STATUSES, so retrieve runs. A non-success answer is mapped to finalize('failed'), the row becomes failed, and payment_refund_claim (refunds.sql:495) now refuses the void because p.status is not in (succeeded, pending_review). The amount the provider captured cannot be refunded through the system. If a later answer is instead 'succeeded' with a matching amount, the order is activated while the void is still open. When the void succeeds, the payment becomes voided but the order stays active with paid_kurus unchanged, so the service is delivered for free.

**Suggested fix:** In payment_finalize, return p.status unchanged when p.status = 'pending_review' and p.failure_code in ('amount_mismatch','reference_mismatch'). These rows may leave pending_review only through the void (refund_completed → voided). Add a pgTAP case for it in 33_orders_payments.

**Verifier note:** Confirmed. The idempotency guard at payments.sql:458-462 returns early for pending_review only when p_outcome is pending_review or expired, so 'failed' (and 'succeeded') overwrite a mismatch row. B gets there two ways: the callback, since pending_review is not in FINAL_STATUSES and a not_completed or API-error answer is written as 'failed', and reconcile (handlers.ts:576), where a SUCCESS with an invalid signature returns 'failed', which differs from row.status. After that, payment_refund_claim (refunds.sql:495) refuses the open provider_mismatch void because p.status is not succeeded or pending_review. The captured amount cannot be refunded, which contradicts §5.4 'Sonuç failed yazılmaz'. The 'later succeeded with matching amount' half is improbable, because retrieve on the same token gives the same amounts.

### 3. [minor] `supabase/migrations/20261030105500_refunds.sql:495`

**Problem:** Double-refund risk. payment_refund_claim retries any 'failed' refund and ignores retryable=false. ops_resolve_refund lets ops mark a 'processing' card refund as failed at any time, without waiting for the 15-minute uncertainty window.

**Scenario:** Ops A starts a card refund: the row is processing and the iyzico call is in flight. Ops B sees it in the processing list and calls ops_resolve_refund(p_succeeded=>false). The row becomes failed with retryable=false. iyzico then confirms the refund, and payment_refund_report raises refund_not_open because the row is no longer processing, so the success is lost. Someone presses 'retry'. payment_refund_claim accepts the failed row because the ceiling excludes the row itself, and B sends a second provider refund. For a partial item refund, iyzico accepts it, so the customer is refunded twice.

**Suggested fix:** In payment_refund_claim, refuse retries when r.retryable is false (refund_not_open). In ops_resolve_refund, allow a resolution from 'processing' only when processing_since < now() - interval '15 minutes', the 'uncertain' state in §5.5.

**Verifier note:** Both code facts hold. payment_refund_claim accepts any failed refund and never reads retryable. ops_resolve_refund lets ops resolve a processing refund at any time and then sets retryable=false. B's timeout path does not persist retryable=false (the row stays processing), so a double refund needs ops to resolve an in-flight refund as failed by mistake and then retry it. The design (§5.5) allows resolving from processing with no time gate. This is defense-in-depth hardening, not a defect the system triggers on its own.

### 4. [minor] `supabase/migrations/20261030105400_payments.sql:692`

**Problem:** ops_void_manual_payment refuses only status 'active'. The intent is 'an order not yet active', but it lets ops void receipted transfers on completed and terminated orders.

**Scenario:** An order was paid by bank transfer, activated, served and then completed by billing_housekeeping. An ops user calls ops_void_manual_payment on that transfer. The receipt M-… becomes voided and the order's paid_kurus drops below total, so the books show a delivered service as unpaid. If the order holds succeeded refunds on another payment, the update hits refunded_kurus <= paid_kurus and returns a raw check-violation error. That error includes the failing row instead of a code.

**Suggested fix:** Require o.status = 'awaiting_payment' (raise order_active or order_not_payable otherwise). Also check o.paid_kurus - p.amount_kurus >= o.refunded_kurus before the update, so the error is a code.

**Verifier note:** Confirmed at payments.sql:692-694: the only status check is o.status = 'active'. Completed and terminated orders, which were active before, pass. The transfer is voided and paid_kurus drops, contradicting the function's own comment ('an order not yet active'). If refunds on other payments of the order exist, paid_kurus can fall below refunded_kurus, and the service_order check (billing_tables.sql:332, refunded_kurus <= paid_kurus) then raises a raw check violation. This needs an ops action, so minor.

### 5. [minor] `supabase/migrations/20261030105700_ops_billing_views.sql:341`

**Problem:** ops_payment_events returns dedup_key unchanged to the ops browser. B builds it as `retrieve:<provider_token>:<outcome>`, so the provider token reaches the client. ops_billing_internal deliberately keeps the token in the database ('has_provider_token' only).

**Scenario:** An ops user, or anything that can read the ops page or its network responses, copies the token from dedup_key. That person can then POST payment-callback, which has no authentication and needs only the token, for any payment of the org. This triggers a retrieve and a finalize, and can drive a pending_review row to failed as in the findings above. The token also opens the live iyzico checkout page for that attempt.

**Suggested fix:** Do not return dedup_key. Return a redacted form, for example the event type plus outcome, or a hash or prefix. Alternatively, redact the token segment in SQL with regexp_replace(dedup_key, '^(retrieve|init):[^:]+', '\1:…').

**Verifier note:** Confirmed. ops_payment_events returns e.dedup_key unchanged, and B builds it as `retrieve:${token}:${outcome}` (handlers.ts:181,192). The design marks provider_token as internal (§6.3 [iç], §6.8 column grants), and ops_billing_internal deliberately exposes only has_provider_token, so this reveals the token through a side channel. Impact is limited: only org ops can read it, and the token only lets someone trigger a provider retrieve, not forge an outcome, apart from the error-to-failed path in [0]/[1].

### 6. [major] `supabase/migrations/20261030105500_refunds.sql:386`

**Problem:** ops_cancel_refund also cancels the system provider_mismatch void. Once that void is cancelled, the pending_review payment has no way out and the order stays blocked for good.

**Scenario:** 1. iyzico reports SUCCESS with the wrong price. payment_finalize sets the payment to pending_review (amount_mismatch) and opens a 'requested' void (provider_mismatch).
2. Ops cancels that refund with ops_cancel_refund, which allows any requested refund, including system ones.
3. Every route back is now closed:
   - ops_resolve_payment_review refuses mismatch codes (payments.sql:734, payment_not_open).
   - ops_request_refund requires status='succeeded' (refunds.sql:247).
   - Reconciliation keeps getting pending_review again, which changes nothing.
4. The customer's money is held with no refund path in the system. Because live_payment_attempt counts pending_review as a live attempt, the order can never be cancelled (payment_in_progress) and can never take a bank transfer.

**Suggested fix:** Refuse ops_cancel_refund for reason='provider_mismatch' (or for any refund with requested_by null) while its payment is pending_review. Alternatively, let ops_request_refund open a void or refund on a pending_review mismatch payment.

**Verifier note:** Confirmed. ops_cancel_refund (refunds.sql:367-392) checks only r.status = 'requested', with no check on reason or requested_by. Cancelling the system provider_mismatch void leaves the payment in pending_review with amount_mismatch or reference_mismatch. ops_resolve_payment_review refuses those codes (payments.sql:734), ops_request_refund requires 'succeeded' (refunds.sql:247), and reconcile gets the same answer and skips. live_payment_attempt counts pending_review as live, so cancel_order and ops_record_manual_payment raise payment_in_progress for good. One ops click leaves the money held with no path out.

### 7. [major] `supabase/migrations/20261030105300_quotes_orders.sql:653`

**Problem:** Order arithmetic ignores refunds. After a transfer on an order awaiting payment is refunded, the order can never be cancelled, and the outstanding balance and activation still count the refunded money as paid.

**Scenario:** 1. Order total is 1,200,000. Ops records a 200,000 transfer.
2. The customer wants out. customer_cancel_order and ops_cancel_order return has_payments, so ops refunds it: ops_request_refund (manual) and ops_complete_manual_refund.
3. The order still has paid_kurus=200000 and refunded_kurus=200000, and the payment is still 'succeeded'.
4. cancel_order still raises has_payments, because it checks paid_kurus > 0 or a succeeded payment.
5. ops_void_manual_payment refuses because a non-cancelled refund exists. The order is stuck in awaiting_payment and counted as overdue forever.
6. If the customer instead pays by card, payment_begin (payments.sql:221) charges total - paid = 1,000,000. activate_order (order_activation.sql:90) then activates the order with only 1,000,000 actually kept. customer_payment_instructions shows the same wrong outstanding amount.

**Suggested fix:** Compute outstanding and the activation test from paid_kurus - refunded_kurus. In cancel_order, treat an order as having payments only when paid_kurus > refunded_kurus, or block ops_request_refund on orders awaiting payment and send ops to ops_void_manual_payment instead.

**Verifier note:** Confirmed. ops_request_refund checks only p.status = 'succeeded', not the order status, so a transfer on an awaiting_payment order can be refunded through manual refund and ops_complete_manual_refund. refund_completed then raises order.refunded_kurus, and the payment stays 'succeeded'. Afterwards cancel_order (quotes_orders.sql:653) raises has_payments, and ops_void_manual_payment refuses because a non-cancelled refund exists, so the order is stuck. payment_begin (total - paid_kurus), ops_record_manual_payment, customer_payment_instructions and activate_order (paid_kurus >= total_kurus) all ignore refunded_kurus, so the order activates while the money actually kept is short of the total.

### 8. [minor] `supabase/migrations/20261030105300_quotes_orders.sql:215`

**Problem:** write_quote calls private.price_lines three times in separate statements without the price_list advisory lock. A price list published between those calls produces a quote whose header and lines come from different lists.

**Scenario:** Ops publishes a new price list (valid_from = today) while another ops issues a quote. Under READ COMMITTED, the header (v_first and the summed totals, lines 215-220) is computed from list v1, and the quote_item insert (lines 262-268) from v2. quote.total_kurus then differs from the sum of line_total_kurus, and so do the order total and the order item amounts. The resulting iyzico basket (payment items) does not add up to the price, and the receipt lines disagree with the total.

**Suggested fix:** Call price_lines once into a temp array or CTE and derive both header and items from it. Alternatively, take pg_advisory_xact_lock('price_list:<org>') before pricing, as ops_publish_price_list does.

**Verifier note:** Confirmed. write_quote calls private.price_lines in three separate statements: v_first, the sum, and the quote_item insert. It is a STABLE function inside a volatile plpgsql body under READ COMMITTED, so each statement takes a new snapshot, and there is no price_list advisory lock. ops_publish_price_list takes that lock and allows valid_from = today, so a publish committing between the statements produces a header whose totals and list version differ from the lines. Crossing Istanbul midnight between the statements has the same effect. The race window is narrow, so minor.

### 9. [minor] `supabase/migrations/20261030105400_payments.sql:597`

**Problem:** payment_attempts_to_reconcile orders by initiated_at and returns every pending_review row indefinitely, plus initiated rows with no token. Old stuck rows can fill the limit and starve new attempts of reconciliation.

**Scenario:** 50 rows accumulate across the org: mismatch reviews waiting for their void, fraud reviews nobody has resolved yet, and initiated rows whose payment_attach_token never ran. Because the query is ordered oldest first with B's RECONCILE_LIMIT, it returns only these rows. B skips the null-token rows and gets no change on the reviews. Newly initiated attempts are never confirmed or expired, so their orders keep showing payment_in_progress.

**Suggested fix:** Exclude initiated rows with provider_token null (or limit them to the 15-minute window), and order by a last-checked or priority key, for example initiated rows first. Alternatively, cap pending_review rows separately.

**Verifier note:** The query is as described. It orders oldest first, applies no org filter, returns every pending_review row indefinitely and returns initiated rows with a null token, which B then skips. RECONCILE_LIMIT is 50. Starvation needs about 50 stuck rows across all orgs (unresolved fraud reviews, mismatch reviews whose void never succeeded, rows whose attach crashed). B already finalizes attach failures as failed, and callback and webhook remain the main path, so this is unlikely at pilot scale. It is a robustness issue.

### 10. [minor] `supabase/migrations/20261030105500_refunds.sql:274`

**Problem:** ops_request_refund picks kind 'refund' whenever p_payment_item_id is given, before the same-day full-amount 'void' rule. That inverts the order the design (§6.9) lists.

**Scenario:** A back-office UI (stream E) always passes the payment's single line id. Ops refunds a single-line card payment in full on the day it was made. The design says card + full amount + same day gives void, but the function opens a line 'refund'. Then:
- The payment never becomes voided.
- The provider performs a refund instead of a cancel.
- Order and payment statuses differ from what D and E expect.

**Suggested fix:** Evaluate the void condition (full room, same Istanbul day, card) before the p_payment_item_id branch, or only use the item branch for partial amounts.

**Verifier note:** Confirmed. In refunds.sql:271-276 the p_payment_item_id branch comes before the void check. §6.9 lists the order as transfer → manual, then card with full amount on the same day → void, then a given line → refund. A same-day full refund that passes the single line id therefore becomes a line 'refund', the payment never becomes voided, and the provider performs a refund instead of a cancel. No money is lost; the kind and statuses differ from the design.
