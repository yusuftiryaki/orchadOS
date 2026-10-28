# İP14 integrated review fixes (after merging to main)

İP14 (#68–#74) is merged into main. An integrated review of main looked at four lenses: flows, security, regressions and deploy. An adversarial verifier confirmed each finding below against the code. Fix all of them, plus the server-side guard reported in #74, in **one PR**.

## Rules
- `git fetch origin && git checkout -B claude/ip14-entegrasyon-duzeltme origin/main`. **Never merge PRs, never push to main, never force-push.**
- Read `CLAUDE.md`, `docs/gorevler/README.md`, and `docs/bahce-yonetimi.md`, especially the §2 user decisions.
- SQL changes go in new fix-forward migrations with timestamps after the latest one on main. Call `private.attach_demo_guard` for any new table. Regenerate `database.types.ts`.
- Add a regression test for each major finding.
- Run `pnpm db:reset && pnpm db:test`, `pnpm web:lint`, `pnpm web:test`, and the İP14 e2e specs. All must pass, and CI must be green.
- Open the PR against main with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=claude/ip14-entegrasyon-duzeltme -f base=main ...`. Write the description in Turkish, cover each finding, and end it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- In parallel, an agent on `claude/hukuk-kararlar-uygula` is updating `docs/hukuk/**` and `apps/web/src/lib/i18n/messages/legal.ts`. Don't touch those.

## Extra item (from the PR #74 agent)
- **Server-side switch guard:** while `garden_changes_enabled` is off, `customer_addon_preview` must return `garden_changes_closed`. So must `customer_submit_application`, when the applicant is a member and the application would become an add-on. Today only the portal blocks this; a direct RPC call is not blocked.

## Findings

### 1. [major] (flows) `supabase/migrations/20261102120400_garden_review_fixes.sql:501`

**Problem:** The fix-forward makes removal_calc subtract failed refunds as 'already refunded', including ones that can never be paid. Under IP12, a refund that fails with retryable=false (a definitive decline reported by the provider through payment_refund_report, or ops closing it with ops_resolve_refund(p_succeeded=false)) can no longer be claimed (payment_refund_claim refuses it, 20261030105500_refunds.sql:500). ops_cancel_refund only works from 'requested', so the row stays failed for good.

**Scenario:** Ops opens an 8A missed_visit card refund of 50,000 kuruş on a garden's payment line. iyzico declines it for good (retryable=false), or ops resolves it as failed. Later the customer removes that garden. removal_calc (lines 501-515) counts the dead failed row in v_item_refunds, so already_refunded_kurus=50,000 and refund_kurus is 50,000 too low. open_removal_refunds then opens smaller refund rows. The customer is under-refunded by money they never got back, and the frozen calculation on the removal page shows it as already refunded.

**Fix:** Count a failed refund only while it can still settle: status 'failed' and retryable is distinct from false. That matches the claim rule in payment_refund_claim. Alternatively, keep dead failed rows out of v_item_refunds and v_loose.

**Area:** A data model (removal_calc) × IP12 refunds

**Verifier:** Confirmed. removal_calc (20261102120400:501-515) counts every 'failed' refund as already refunded. docs/bahce-yonetimi.md:421 justifies this with 'a definitively abandoned refund becomes cancelled and is not counted', but IP12 has no way from failed to cancelled: ops_cancel_refund only works from 'requested' (20261030105500:386-391), and payment_refund_claim refuses retryable=false (:503). The usual recovery for a dead refund is a new ops_request_refund, which is allowed because refund_room leaves failed rows out (:41). After that both rows are counted, so the line is deducted twice. Either way refund_kurus is too low and the frozen calculation records it.

### 2. [minor] (flows) `apps/web/src/app/operasyon/teklif/yeni/page.tsx:260`

**Problem:** When the period has already ended (base order 'completed'), the renewal form only pre-checks the base order's own lines, so gardens added through add-ons are dropped from the renewal by default. customer_gardens returns no prio-1/2 row for completed orders, so ofPeriod is empty. The fallback then uses view.items, which getOrder loads only for that order_id. Add-on parcels land in 'other' unchecked. The design says a renewal covers every garden.

**Scenario:** A customer has base S-1 (gardens A, B) and add-on S-2 (garden C, addon_of_order_id=S-1). The period ends without a renewal and billing_housekeeping sets S-1 and S-2 to 'completed'. Ops opens 'Yenile' from S-1 (allowed for completed orders). A and B are checked, but C is listed under 'Diğer parseller' unchecked. ops_issue_parcel_quote issues a renewal without C, the customer accepts and pays, and C silently drops out of service.

**Fix:** In the fallback, also gather the non-removed lines of the base's add-on orders (service_order where addon_of_order_id = o.id and status in active/completed) and pre-check them. In the active case, also include gardens whose state is 'upcoming' within the period.

**Area:** D back office (renewal)

**Verifier:** Confirmed. For a completed base, customer_gardens gives prio NULL to lines on completed orders (20261102120200:704-713), so ofPeriod is empty. The fallback uses view.items, which getOrder loads with .eq('order_id', id) only (data.ts:409-411). The add-on gardens therefore land in 'other' unchecked, while the base gardens are checked. Renewal is offered and accepted for completed orders (siparis/[id]/page.tsx:372, quotes_orders.sql:440). Graded minor because the garden is still listed in 'Diğer parseller', so ops can check it; nothing drops it without a trace.

### 3. [minor] (flows) `supabase/migrations/20261102120300_garden_removals.sql:411`

**Problem:** close_base_addons (called when the last garden removal ends the base order, and by ops_terminate_order) leaves alone any add-on awaiting payment that has money kept. Its comment says the activation will refuse and refund it, but activate_order only runs once the order is paid in full. A partly paid add-on therefore keeps the customer's money with no automatic way out.

**Scenario:** Add-on S-3 (new garden, total 20,000 TL) receives a 5,000 TL transfer recorded with ops_record_manual_payment. Ops then runs 'Tüm bahçeleri çıkar'; the last completion calls terminate_emptied_order on the base and then close_base_addons. S-3 is skipped because paid_kurus > refunded_kurus. payment_begin now refuses with addon_base_closed, ops_cancel_order refuses with has_payments, and nothing opens an order_closed refund. The 5,000 TL stays held indefinitely unless ops finds the order and refunds it by hand.

**Fix:** In close_base_addons, cancel add-ons that hold money too and open order_closed refunds with private.open_system_refund for each succeeded payment, as activate_order does for addon_base_closed. Leave only orders with a live card attempt (live_payment_attempt) to be picked up by reconciliation.

**Area:** A data model (removals) × IP12 payments

**Verifier:** Confirmed. close_base_addons (20261102120300:424-431) skips an add-on with paid_kurus > refunded_kurus. Its comment says the activation refunds it, but activate_order returns early unless the order is paid in full (20261102120200:2414). payment_begin refuses addon_base_closed (:2215), so the customer cannot pay the rest. Skipping money-held add-ons is intended by the docs (§876 'para tutulmayan'), and ops can still refund by hand with ops_request_refund and the order shows as overdue. So this is a cleanup gap plus a misleading comment, not lost money: minor.

### 4. [minor] (flows) `apps/web/src/components/portal/service-card.tsx:104`

**Problem:** The portal shows 'Talebi geri al' on every open removal, but after fix-forward #2 customer_cancel_garden_removal refuses removals that ops opened (initiated_by <> 'customer' raises removal_not_open, 20261102120400_garden_review_fixes.sql:895). my_gardens/customer_gardens do not return initiated_by, so C cannot tell the two apart.

**Scenario:** Ops opens a transfer or duplicate removal, or uses 'Tüm bahçeleri çıkar' (ops_request_garden_removal, status 'scheduled', initiated_by 'ops'). The customer gets the garden_removal_scheduled SMS linking /portal/parsel/<id> and sees the undo button. Clicking it always fails with 'Bu çıkarma talebi artık açık değil.', which is false: the removal is open and will complete.

**Fix:** Add initiated_by (or a can_cancel boolean) to private.customer_gardens / my_gardens, and render the undo form only when the customer opened the removal. Otherwise show a 'contact us' line.

**Area:** C portal × A fix-forward

**Verifier:** Confirmed. service-card.tsx:104-112 renders the cancel form for any open removal. customer_cancel_garden_removal raises removal_not_open when initiated_by <> 'customer' (20261102120400:895). initiated_by is not in customer_gardens/my_gardens (20261102120200:672-696), and the portal never reads it (grep finds it only in operasyon and the columns file). Ops-opened removals therefore show a button that always fails, with a misleading 'no longer open' message.

### 5. [major] (security) `supabase/migrations/20261102120300_garden_removals.sql:359`

**Problem:** removal_access_scope decides whether to ignore revoke_all_access using only private.parcel_served_on(parcel, today). That check misses another owner whose paid order is already active but starts after the revocation day. With revoke_all on, the nightly housekeeping (20261102120400_garden_review_fixes.sql:849) deletes that paying owner's parcel_access row, and nothing ever puts it back.

**Scenario:** Parcel P has two owners: A (paying) and B (owner role, e.g. a shared deed). A's garden is removed with revoke_all_access=true (ops 'herkesin erişimini kaldır', typical for a transfer with access_days 0). Before A's access_until, ops issues B a parcel quote with proposed_service_start after A's access_until, and B pays. activate_order runs at payment: B already has an owner row, so nothing is inserted, and the order becomes active with a future service_start. On A's access_until, garden_removal_housekeeping calls removal_access_scope. served is false because B's period has not started, so revoke_all is true and B's owner row is deleted along with B's viewers. When B's period starts, B is a paying customer with no parcel_access: the portal returns 404 on /portal/parsel/P, report notifications skip B, and customer_request_garden_removal returns not_found. B's later activation never runs again, so nothing self-heals. (The awaiting_payment variant self-heals, because activate_order re-inserts the owner row.)

**Fix:** In removal_access_scope, decide served from coverage, not from today. Treat the parcel as kept when any other customer has an active line ending on or after today, or an order awaiting payment for it, e.g. exists(select 1 from private.coverage_lines(r.parcel_id) c where c.customer_user_id <> r.customer_user_id and c.to_day >= today). At minimum, never delete an owner row whose user has an active or awaiting-payment line on the parcel.

**Area:** IP14-A data model / removals (access revocation)

**Verifier:** Confirmed on origin/main. removal_access_scope (20261102120300:356-381) sets revoke_all = r.revoke_all_access and not parcel_served_on(parcel, today). parcel_served_on (20261102120200:260-274) requires o.service_start <= today, so an active order whose period has not started does not count. B can be quoted for P: ops_issue_parcel_quote only requires B to have an owner row and allows a future p_proposed_service_start. parcel_in_service and parcel_transferred do not block it, because A's line is already removed and parcel_transferred looks at A, not B. At B's payment, activate_order (20261102120200:2477-2481) inserts the owner row only 'where not exists', so B's existing row stays. Housekeeping (20261102120400:827-851) only checks whether A's own order is serving the parcel, then deletes every row removal_access_scope marks removed, which includes B's owner row and B's viewers. Nothing re-creates access when B's service_start arrives, because the activation insert ran only once. Doc §5.4 says revoke_all is ignored when 'Parsel başka bir müşterinin satırıyla hizmetteyse' (the parcel is in service under another customer's line). Its intent is to protect a paying owner, and a paid active order with a later start falls outside the literal check. The case is narrow (needs revoke_all plus a second owner plus a future-dated paid order), and ops can restore access by hand. Still, a paying customer silently loses access, so this stays major.

### 6. [minor] (regressions) `apps/web/src/app/operasyon/basvuru/[id]/page.tsx:333`

**Problem:** With the switch OFF, the ops application page still shows a member's application as an add-on: an add-on preview and an "issue add-on quote" form that will always fail. The only path that works, the ordinary İP12 quote, loses its price preview (line 99 skips previewQuote for members) and is pushed down to a secondary "separate period" form with a required checkbox.

**Scenario:** Hosted, switch off. A customer with an active order (my_service_period returns a period) has a submitted application. private.service_periods computes addon_base_order_id without checking the switch, so `base` is set and the add-on section renders (line 333). ops_preview_addon_quote does not check the switch either, so a prorated preview appears. Ops presses the primary submit (line 394) and ops_issue_addon_quote raises garden_changes_closed (addons.sql:1457). The İP12 full-year quote is still possible, but only through the secondary form at line 480 with no preview total, so ops issues it without seeing the price. Before İP14 this page showed the regular preview and the 'Teklif ver' button for every application.

**Fix:** Read garden_changes_enabled from the membership period or getSetting. When it is false, hide the add-on section and show the İP12 preview and issue form as before (no separate_period checkbox, previewQuote called for members too).

**Area:** back office (İP14-D)

**Verifier:** Confirmed on origin/main. In basvuru/[id]/page.tsx, line 99 skips previewQuote whenever `member`. Lines 333-427 render the add-on section and the addon-quote-form from addonBase(), which reads private.service_periods.addon_base_order_id; that never checks the switch, and neither does the page. ops_preview_addon_quote (addons.sql:1328) has no switch check, so the prorated preview appears. ops_issue_addon_quote raises garden_changes_closed at addons.sql:1457-1458. So with the switch off, the primary action always fails. The only path that works, ops_issue_quote (which still works for members, addons.sql:1822), sits behind the secondary form with a required separate_period checkbox and no price preview. This can be reached through the documented rollback (switch turned back off, bahce-yonetimi §4 'Geri alma') or through applications submitted before the deploy. The rest of the page still works, so it is minor.

### 7. [major] (deploy) `apps/web/src/components/portal/service-card.tsx:104`

**Problem:** The portal offers "Talebi geri al" on every open removal, but since 20261102120400 the DB lets the customer withdraw only removals they asked for themselves. my_gardens does not return initiated_by, so the portal cannot tell the two cases apart.

**Scenario:** Ops opens a removal from /operasyon/siparis/[id] (reason transfer/devir with access 0, a duplicate, or a date ops chose), so initiated_by='ops'. The customer's parcel page shows the open removal, the hint 'Talebi çıkış tarihine kadar geri alabilirsiniz; bahçeniz hizmette kalır' and a 'Talebi geri al' button. Clicking it runs customer_cancel_garden_removal, which raises removal_not_open (20261102120400_garden_review_fixes.sql:897). The customer sees 'Bu çıkarma talebi artık açık değil.' while the removal is still open and will complete. C was built against the 120300 rule; A's fix #2 (customer cannot withdraw an ops removal, bahce-yonetimi.md §5.1 step 3) never reached the UI. No e2e or integration test covers an ops-initiated removal in the portal.

**Fix:** Add initiated_by (or a can_cancel boolean) to private.customer_gardens / my_gardens in a new migration after 20261102120400, and regenerate the types. In ServiceCard, render the cancel form only when initiated_by='customer'; otherwise show 'Bu çıkarmayı ekibimiz başlattı; değişiklik için bize ulaşın'. Add a customer-gardens test with removalFor(..., ops-initiated).

**Area:** portal (IP14-C) + data model (IP14-A)

**Verifier:** Confirmed on origin/main. In service-card.tsx:91-111 the Body component renders the cancelGardenRemovalAction form, cancelHint and 'Talebi geri al' button whenever openRemoval(garden) is true. openRemoval (lib/portal-billing/gardens.ts:60-64) checks only removal_id and status. my_gardens / private.customer_gardens (20261102120200_garden_addons.sql:672-835) is never redefined later and returns removal_id/number/status/effective_on, with no initiated_by, so the UI has no way to tell the cases apart. customer_cancel_garden_removal in 20261102120400_garden_review_fixes.sql:895 raises removal_not_open when initiated_by <> 'customer'. An ops-opened removal (initiated_by='ops' is allowed by the 120100 schema check and covered by the back-office integration test) therefore shows the customer a withdraw action that always fails. The DB guard is correct, so this is not a refutation; the design (§5.1) says the customer cannot withdraw an ops removal, so it is the UI that is wrong. No data is harmed, but every ops-initiated removal shows a false promise and a broken action, so major.

### 8. [minor] (deploy) `docs/plan.md:104`

**Problem:** plan.md still lists the İP14 streams as in progress, and the A row omits the last migration.

**Scenario:** After #69, #71, #73 and #74 merged, rows 104–107 still say İP14-A 'Sürüyor (claude/ip14-veri-modeli)' with migrations '20261102120000–…120300' (20261102120400_garden_review_fixes.sql is on main), İP14-B 'PR açık', and İP14-C and İP14-D 'Sürüyor'. CLAUDE.md tells agents to find the active İP here and update progress here, so the next session will think A/C/D are unmerged and may branch from the dead stream branches. Rows 96 and 101 (İP12/İP13 integration fixes, PRs #61 and #66 merged) are stale the same way.

**Fix:** Mark İP14-A/B/C/D as 'Tamam (PR #71 / #69 / #74 / #73)', set the A migration range to 20261102120000–20261102120400, and add an 'İP14 entegrasyon incelemesi' row. Also mark the İP12/İP13 integration-fix rows Tamam (#61, #66).

**Area:** docs/plan

**Verifier:** Confirmed. docs/plan.md on origin/main still shows İP14-A as 'Sürüyor' with migrations '20261102120000–…120300', İP14-B as 'PR açık', and C/D as 'Sürüyor'. It also still says 'PR açık' for the İP12 and İP13 integration fixes, but git log shows #61, #66, #69, #71, #73 and #74 all merged. CLAUDE.md:8 tells agents to track progress in this file. This is stale docs only, so minor.

### 9. [minor] (deploy) `docs/kullanim-kilavuzu.md:145`

**Problem:** The ops guide gives the nightly removal job as '00:30', but the cron runs at 30 0 * * * in pg_cron's GMT, which is 03:30 Istanbul. The İP14 status table also still says 'geliştiriliyor'.

**Scenario:** An ops user reading the Turkish guide expects due removals to be completed, parcels set passive and access revoked at 00:30 local time. They actually run at 03:30 TRT (no cron.timezone is set in any migration; billing-housekeeping '0 0 * * *' is likewise 03:00 TRT). Someone checking at 01:00 that a removal completed, or that a devir/access-0 customer lost access, finds it still open. Lines 150–151 still show 'Veri modeli…' and 'Müşteri portalı ve back office ekranları' as 🟡 İP14-A/C/D geliştiriliyor although all are merged. The demo table (lines 413–415, 'incelemede PR #63/#64', 'PR açık') is stale as well.

**Fix:** Write '03:30 (İstanbul; cron 00:30 UTC)', or state that cron times are UTC. Update the status rows to ✅ (merged; switch closed on hosted projects) and refresh the demo rows.

**Area:** docs/ops guide

**Verifier:** Confirmed. 20261102120300_garden_removals.sql:729 schedules '30 0 * * *', and no migration or config sets cron.timezone, so pg_cron runs in its default GMT and the job fires at 03:30 Istanbul time. kullanim-kilavuzu.md:145 says 00:30 with no timezone and no UTC note anywhere in the guide. The status rows ('İP14-A geliştiriliyor', 'İP14-C ve İP14-D geliştiriliyor', and the demo rows 'incelemede PR #63/#64', 'PR açık') are stale. The finding is distinct from [1] (different file, plus the time error). Docs only, so minor.
