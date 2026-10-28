# İP14-D Back office: ek teklif, mükerrer kontrolü, çıkarma kuyruğu, üyelik ve bahçeler, yenileme ve dönem birleştirme

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip14-d-back-office.md`. Wave 2. Design: `docs/bahce-yonetimi.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 and İP13 are fully merged there, including #66 and #67. The repo is now **public**: never commit secrets, real data or personal data.
2. **Dependencies.** These may not be on main yet. After branching from `origin/main`, run `git fetch origin` and then `git merge --no-edit` for each of them, in this order:
   - `origin/claude/ip14-veri-modeli` (İP14-A)
   No rebase, no force-push. Skip any that is already merged into main. Fetch and merge again before you open the PR so you pick up late review fixes. If one is missing, stop and report it.
3. **Parallel work.** İP14-C on `claude/ip14-portal` Never touch another stream's owned paths.
4. **Branch.** Push to `claude/ip14-back-office`. If the session forces a different branch name, state it in the PR and in your final message.
5. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
6. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
7. **Time.** Run only the test suites that matter. Run commands that take longer than 10 minutes in the background.
8. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any deviation from the design doc's contracts, and the follow-ups.

---

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Wave 2. Design doc: `docs/bahce-yonetimi.md` (on main, version 2; §4, §5, §12, §13 concern you; §20 lists what stream A delivered or cut). Its names and signatures are binding.

1. **Base.** Create branch `claude/ip14-back-office` from the latest `origin/main`, which must contain stream A (`claude/ip14-veri-modeli`: migrations `20261102120*`, regenerated `database.types.ts`, `lib/billing` contracts, test helpers). If A is not merged yet, branch from `origin/claude/ip14-veri-modeli`, say so in the PR, and merge `origin/main` again before opening it.
2. **Parallel stream.** Stream C (`claude/ip14-portal`) works on `/portal` at the same time. Do not touch its files.
3. **No new migrations, no type regeneration.** Report any database gap in the PR; A fixes forward.
4. **Cut items.** Read §20 `Teslim edilmeyenler` and `database.types.ts`. If `ops_withdraw_application_garden` is not delivered, hide `Başvurudan çıkar` and keep the existing `ops_reject_application`. If the proximity search is cut (`distance_m` is null), show only the containment and intersection hits.
5. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f title='İP14-D: …' -f head=claude/ip14-back-office -f base=main -F body=@<file>` (`gh pr` is blocked). Write the description in Turkish. Follow your session's attribution rules. **Never merge, never push to main, never force-push.** If your branch is already pushed, merge `origin/main` instead of rebasing. GitHub Actions run on PRs: wait for CI and report it.
6. **Autonomy.** Ask no questions. Pick the recommended or most conservative option and list it in the PR.
7. **No Docker?** If Docker does not start, run the unit tests, lint and build, open the PR anyway and let CI verify.
8. **Final message.** Report: branch, PR URL, commits, test commands with pass/fail counts, CI result, deviations, and follow-ups.

---

## Context
- orchadOS back office = the `ops` role under `/operasyon` (no new role or section).
- **Read first:** `CLAUDE.md`; `docs/bahce-yonetimi.md`; `docs/musteri-yonetimi.md` §11 (back-office patterns).
- **Existing code:**
    - `apps/web/src/app/operasyon/**`: `page.tsx`, `basvuru/[id]`, `teklif/yeni/page.tsx` (renewal with `?siparis=` lists the old order's parcels, all checked; `?sahip=` for an owner's parcels), `teklif/[id]`, `siparis` and `siparis/[id]` (`data-testid="order-items"`), `sahip/[profileId]`, `parsel/[parcelId]` (lifecycle form `data-testid="parcel-lifecycle"`), `ayarlar`, `iade`, `back-office-actions.ts`.
    - `components/back-office/*`: `billing-card.tsx`, `customer-account.tsx` (`CustomerAccountPanel`), `gardens-map.tsx` (`GardensMap`), `quote-lines.tsx`, `action-form.tsx`, `verify-garden-form.tsx`.
    - `components/operations/ops-nav.tsx` (`OpsNav`).
    - `lib/back-office/data.ts`, `mutations.ts`, `urls.ts`, `validation.ts`, `form-state.ts`; `lib/i18n/messages/back-office.ts`.
- Table reads use `BILLING_COLUMNS`. Errors go through `billingReasonOf` and `billingText.errors`. Internal columns are not selectable; use the ops RPCs.
- The ops lifecycle and visit forms use `lib/operations` (owned by A). A has added `parcel_removed` and `parcel_removal_scheduled` there; just make sure the parcel page shows them.

## Contracts from stream A (doc §9.6; call exactly these)

### Reads
- **`ops_billing_summary(p_org_id)`:** the existing columns plus `garden_removals_requested`, `garden_removals_due`, `garden_removals_blocked` (integers). `renewals_due` excludes add-ons and periods whose gardens are all covered the next day.
- **`ops_orders(…)`:** the existing columns plus `addon_of_order_id uuid`. `renewal_due` is false for add-ons.
- **`ops_customer_service_period(p_org_id, p_user_id)`:** one row per current base order `{org_id, base_order_id, base_order_number, package_id, package_name, periodic_visits_per_year, period_start, period_end, next_base_order_id, next_period_start, next_period_end, renewal_quote_id, addon_base_order_id, addon_until, garden_count, garden_changes_enabled, is_primary, period_count}`. Zero rows when there is no membership.
- **`ops_customer_gardens(p_org_id, p_user_id)`:** one row per parcel `{order_item_id, order_id, order_number, base_order_id, is_addon, order_status, parcel_id, garden_name, parcel_status, state, service_start, service_end, removed_on, visits_entitled, visits_used, withdrawal_until, in_next_period, next_order_item_id, removal_id, removal_number, removal_status, removal_effective_on, access_until}`.
- **`ops_garden_overlaps(p_garden_id)`:** `{parcel_id, parcel_name, parcel_status, same_customer, in_service, inside_boundary, distance_m}`.
- **`ops_preview_addon_quote(p_base_order_id, p_application_id default null, p_parcel_ids uuid[] default null, p_proposed_service_start date default null, p_discount_bp int default 0)`:** `{line_no, application_garden_id, parcel_id, garden_name, area_m2, area_source, inventory, billable_area_tenths, visits, unit_price_kurus, minimum_fee_kurus, inventory_fee_kurus, visit_amount_kurus, line_base_kurus, line_discount_kurus, line_subtotal_kurus, line_vat_kurus, line_total_kurus, price_list_id, price_list_version, vat_rate_bp, service_start, service_end, periodic_visits_per_year}`.
- **`ops_garden_removals(p_org_id, p_status text default null, p_limit int default 200)`:**
    - columns `{id, number, status, customer_user_id, customer_name, parcel_id, garden_name, order_id, order_number, order_item_id, initiated_by, reason, customer_note, ops_note, at_period_end, withdrawal, requested_effective_on, effective_on, access_days, access_until, refund_mode, refund_kurus, planned_visits_before, planned_visits_after, requested_at, scheduled_at, completed_at, cancelled_at, access_revoked_at, blocked_reason, revoke_all_access}`;
    - a null status returns open rows, `'all'` every row, an enum value only that status.
- **`ops_garden_removal_preview(p_removal_id, p_effective_on date default null)`:** jsonb.
    - The calculation: `{formula, as_of, effective_on, mode, refund_kurus, refund_vat_kurus, unallocated_kurus, unattributed_refunds, lines[{order_item_id, order_id, order_number, removed_on, amount_kurus, vat_rate_bp, inventory_share_kurus, inventory_done, visits_entitled, visits_used, visits_excluded, visit_fee_kurus, gross_kurus, already_refunded_kurus, unattributed, refund_kurus, refund_vat_kurus, mode}]}`.
    - Plus `{access_until, withdrawal, blocked_reason, planned_visits_before, planned_visits_after, captured_unpublished, open_followups, pending_invitations, open_refunds, pending_orders, access_scope {customer_owner, invited_viewers, other_viewers, other_owners}}`.
- **`parcel_service_status(p_parcel_id)`:** `{status: in_service|leaving|removed|none, leaving_on, removed_on, access_until}`.
- **`ops_billing_setting(p_org_id)`:** new fields `garden_changes_enabled, addon_min_days, removal_notice_days, removal_access_days, removal_refund_mode ('unused_visits'|'manual')`.

### Writes
- **`ops_issue_addon_quote(p_base_order_id, p_application_id default null, p_parcel_ids uuid[] default null, p_proposed_service_start date default null, p_valid_days int default null, p_discount_bp int default 0, p_discount_note text default null, p_note_to_customer text default null) returns uuid`.**
    - Errors: `garden_changes_closed`, `addon_period_too_short`, `parcel_in_service`, `parcel_not_reusable`, `account_garden_limit`, `garden_not_verified`, `application_not_open`, `invalid_input`, `package_not_priced`.
- **`ops_link_application_garden_parcel(p_garden_id, p_parcel_id)`** (null unlinks). Errors: `parcel_not_reusable`, `parcel_in_service`.
- **If delivered:** `ops_withdraw_application_garden(p_garden_id, p_note)`. Errors: `last_garden`, `garden_withdrawn`.
- **`ops_request_garden_removal(p_order_item_id, p_reason, p_effective_on date, p_note default null, p_access_days int default null, p_revoke_all_access boolean default false) returns uuid`.**
    - Reasons: `sold`, `not_needed`, `dissatisfied`, `cost`, `transfer`, `duplicate`, `other`.
    - Access days below the setting need reason transfer or duplicate, or a note. A transfer suggests 0.
    - Error `parcel_order_pending`.
- **`ops_schedule_garden_removal(p_removal_id, p_effective_on date, p_note default null, p_access_days int default null, p_revoke_all_access boolean default null)`.** The note is required when the date differs from the requested one. A date change sends the customer an SMS (`garden_removal_rescheduled`).
- **`ops_cancel_garden_removal(p_removal_id, p_note)`** (note required; sends the customer an SMS).
- **`ops_complete_garden_removal(p_removal_id)`.** Errors: `removal_not_due`, `removal_not_open`, `parcel_order_pending` (blocked).
- **`ops_save_billing_setting(p_org_id, p_settings jsonb)`** accepts the five new keys.
- **Changed behavior, same signature:**
    - `ops_terminate_order` now also terminates a base's active add-ons, cancels its awaiting add-ons and open add-on quotes, and cancels orphaned open removals.
    - `ops_issue_parcel_quote` refuses an add-on order as renewal target, parcels already in service in the new period (`parcel_in_service`), parcels with an open removal (`garden_removal_open`) and transferred parcels (`parcel_not_reusable`), and takes up to 50 parcels.
    - `ops_extend_payment_due` refuses a date after the add-on's last day (`invalid_input` due_on).
    - `ops_set_parcel_passive(false)` refuses `parcel_removed` during the read-only period.
    - `ops_issue_quote` stays as the secondary `Ayrı dönemle teklif ver`.

### New columns
`quote.addon_of_order_id`, `quote.inputs.addon` (incl. `addon_last_day`), `service_order.addon_of_order_id`, `application_garden.withdrawn_at`, `service_order_item.removed_on` and `garden_removal_id`, `refund.garden_removal_id`.

### Labels
Removal statuses, reasons, refund modes, garden states and error texts are in `messages/billing.ts` (A's).

### Test helpers (A's; do not edit)
- `tests/e2e/billing-helpers.ts`: `activeMember`, `opsAddonQuote`, `removalFor`.
- `tests/integration/billing-fixture.ts`: `activeOrderFor`, `addonOrderFor`.
- `tests/local-db.ts`: `runGardenRemovalHousekeeping`, `setOrderPeriod`.

## Scope (design doc §12)
1. **Dashboard `/operasyon`:** the billing card shows `Çıkarma talepleri`, `7 gün içinde çıkacak` and `Engelli çıkarmalar`, each linking to the queue.
2. **`OpsNav`:** a `Bahçe çıkarma` item → `/operasyon/cikarma`.
3. **New `/operasyon/cikarma`:** a table with the filters açık / tamamlanan / iptal / tümü, and the columns number, customer, garden, order, effective day, status, refund, planned visits after, and a blocked marker.
4. **New `/operasyon/cikarma/[id]`:**
    - **Details:** customer (link to `/operasyon/sahip/<profileId>`), parcel (link), order, reason and notes.
    - **Preview:** lines with visits (used and excluded), prior refunds, refund and VAT per line; warnings for `unallocated_kurus > 0`, `unattributed_refunds` (`Bu siparişte satıra bağlanamayan iade var; iade elle açılmalı`), `blocked_reason` and `pending_orders`; the access-scope counts; planned visits, captured-unpublished visits, open followups, pending invitations, open refunds.
    - **Actions** (`action-form` pattern):
        - `Tarihi teyit et / değiştir` (date, access days, `Herkesin erişimini kaldır` checkbox, note). The note is required when the date changes. Show `Tarih değişirse müşteriye SMS gider` and the short-access rule.
        - `Hemen tamamla` (only when due, with a confirm).
        - `İptal et` (note required; `Müşteriye SMS gider`).
    - **After completion:** links to its refunds (`refund.garden_removal_id`) on `/operasyon/odeme/<payment_id>` or `/operasyon/iade`.
5. **`/operasyon/basvuru/[id]`:**
    - **Service period:** the panel from `ops_customer_service_period`, with a warning when `period_count > 1`.
    - **Map:** the customer's existing parcels as a muted second layer in `GardensMap`.
    - **Per garden:** overlap warnings (`ops_garden_overlaps`) with `Eski parsele bağla` (only where `same_customer`) and `Bağı kaldır`; `Başvurudan çıkar` (if delivered); withdrawn gardens shown muted.
    - **When a period exists:** the add-on preview and a primary `Ek teklif ver` using `addon_base_order_id` (with optional start, validity, discount and note fields as in the existing quote form). Warn if the application package differs from the period package. Show the last valid day.
    - **Separate period:** the existing quote action stays as the secondary `Ayrı dönemle teklif ver`. For a member it is enabled only after an explicit checkbox `Bu müşteriye ikinci bir hizmet dönemi açılacak`.
    - Show the `addon_period_too_short` reason when `addon_base_order_id` is null but a period exists.
6. **`/operasyon/teklif/yeni`:**
    - **Renewal (`?siparis=`):**
        - If the order is an add-on, redirect to its base.
        - Preselect the parcels of the base and its add-ons in state `in_service` from `ops_customer_gardens` filtered by `base_order_id`.
        - Leave unchecked, with a label, every parcel with an open removal.
        - List the customer's other owner parcels unchecked.
        - Warn when an issued renewal quote exists and gardens were added after it.
        - When the customer has another current period that ends later, offer `Dönemleri birleştir` → `?ek=<later base>&siparis=<this order>`.
    - **New mode `?ek=<baseOrderId>`:** an add-on quote for existing parcels via `ops_issue_addon_quote(p_parcel_ids)`, with the preview. With `&siparis=<X>`, X's in-service parcels are preselected and the start defaults to X's end + 1.
7. **`/operasyon/teklif/[id]`:** add-on info from `inputs.addon` (base order link, period, visits, last valid day).
8. **`/operasyon/siparis` and `/operasyon/siparis/[id]`:**
    - An `Ek sipariş` badge or column from `ops_orders.addon_of_order_id`; no renewal badge on add-ons.
    - A per-line state in `order-items`: Hizmette / Çıkacak · tarih / Çıkarıldı · tarih.
    - `Ek siparişler` on a base order; `Temel sipariş` on an add-on.
    - A per-line `Bahçeyi çıkar` form (`ops_request_garden_removal`: reason, date, access days, `Herkesin erişimini kaldır`, note).
    - The termination form text: `Ek siparişler de sona erer, ödeme bekleyen ekler ve açık ek teklifler iptal edilir; parsellere dokunulmaz. Bahçe bazında çıkarma için satırdaki formu kullanın.`
    - The due-date form shows the add-on's last day as the maximum.
9. **`/operasyon/sahip/[profileId]`** (`CustomerAccountPanel`):
    - an `Üyelik` section: every period row, package, next period, renewal quote, primary marker;
    - a `Bahçeler` table (`ops_customer_gardens`, with an `in_next_period = false` warning);
    - actions `Ek teklif ver` (to `?ek=`) and `Tüm bahçeleri çıkar`: one date, reason and note, calling `ops_request_garden_removal` for each in-service line and reporting per-line results.
10. **`/operasyon/parsel/[parcelId]`:** a `Hizmet` card (`parcel_service_status` plus the covering order from `ops_customer_gardens`, or `Siparişsiz (pilot)`) with a link to the open removal. The lifecycle form shows `parcel_removed`.
11. **`/operasyon/ayarlar`:** the five new settings with ranges and a short explanation. `garden_changes_enabled` comes with the warning `avukat onayı olmadan pilotta açmayın`.
12. **Plumbing:** loaders in `lib/back-office/data.ts`, mutations in `mutations.ts`, routes in `urls.ts`, form parsing in `validation.ts`, texts in `messages/back-office.ts`.

## Tests
- **Unit:** `urls.test.ts` (new routes) and `validation.test.ts` (the schedule, request and add-on forms: date ranges, note rules, access days 0..365 and the short-access rule).
- **Integration (`tests/integration/back-office-gardens.test.ts`):**
    - the loaders and mutations as an ops user against a member made with `activeOrderFor` and `addonOrderFor`;
    - the forbidden case on one's own record, where applicable.
- **E2E (`tests/e2e/back-office-gardens.spec.ts`):**
    - an ops user opens an add-on application of an `activeMember`, verifies the gardens, sees the overlap panel, and issues `Ek teklif`;
    - a removal created with `removalFor` appears in the queue; ops confirms today and completes now; the parcel page shows passive and the refund queue has the new refund;
    - the renewal screen preselects the add-on parcel and leaves a parcel with an open removal unchecked.
- **`back-office-access.spec.ts`:** add `/operasyon/cikarma` to its list of ops-only routes.
- Keep `back-office-flow.spec.ts` and `back-office-access.spec.ts` green.

## Commands
```
pnpm install
pnpm db:start && pnpm db:reset
pnpm web:lint
pnpm web:test
pnpm web:build
pnpm web:e2e   # Chromium; run your new spec plus back-office-flow and back-office-access
```

## Acceptance criteria
- Every screen in doc §12 works as described, with the ops role only. Existing back-office flows are unchanged for customers without a service period.
- Only the listed RPCs and columns are used; internal columns are read only through ops RPCs.
- Lint, unit, integration, build and the listed e2e specs pass; CI is green.
- No file outside your owned paths is changed. The PR (Turkish) describes each screen, the tests run, and any contract gap for stream A.
