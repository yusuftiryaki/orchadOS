# İP14-C Müşteri portalı: bahçe ekle, üyelik özeti, ek teklif, bahçeyi hizmetten çıkar

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip14-c-portal.md`. Wave 2. Design: `docs/bahce-yonetimi.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 and İP13 are fully merged there, including #66 and #67. The repo is now **public**: never commit secrets, real data or personal data.
2. **Dependencies.** These may not be on main yet. After branching from `origin/main`, run `git fetch origin` and then `git merge --no-edit` for each of them, in this order:
   - `origin/claude/ip14-veri-modeli` (İP14-A)
   No rebase, no force-push. Skip any that is already merged into main. Fetch and merge again before you open the PR so you pick up late review fixes. If one is missing, stop and report it.
3. **Parallel work.** İP14-D on `claude/ip14-back-office` Never touch another stream's owned paths.
4. **Branch.** Push to `claude/ip14-portal`. If the session forces a different branch name, state it in the PR and in your final message.
5. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
6. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
7. **Time.** Run only the test suites that matter. Run commands that take longer than 10 minutes in the background.
8. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any deviation from the design doc's contracts, and the follow-ups.

---

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Wave 2. Design doc: `docs/bahce-yonetimi.md` (on main, version 2; §4, §5, §11, §13 concern you; §20 lists what stream A delivered or cut). Its names and signatures are binding.

1. **Base.** Create branch `claude/ip14-portal` from the latest `origin/main`, which must contain stream A (`claude/ip14-veri-modeli`: migrations `20261102120*`, regenerated `database.types.ts`, `lib/billing` contracts, test helpers). If A is not merged yet, branch from `origin/claude/ip14-veri-modeli`, say so in the PR, and merge `origin/main` again before opening it.
2. **Parallel stream.** Stream D (`claude/ip14-back-office`) works on `/operasyon` at the same time. Do not touch its files.
3. **No new migrations, no type regeneration.** If you find a database bug or a missing contract, describe it in the PR (A fixes forward); work around it only in your files.
4. **Cut items.** Read §20 `Teslim edilmeyenler` and `database.types.ts`. For any function that A did not deliver (`customer_revise_order`, `customer_withdraw_application_garden`), hide its button. Fall back to the existing `customer_cancel_order` and `customer_decline_quote(p_request_revision => true)`.
5. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f title='İP14-C: …' -f head=claude/ip14-portal -f base=main -F body=@<file>` (`gh pr` is blocked). Write the description in Turkish. Follow your session's attribution rules. **Never merge, never push to main, never force-push.** If your branch is already pushed, merge `origin/main` instead of rebasing. GitHub Actions run on PRs: wait for CI and report it.
6. **Autonomy.** Ask no questions. Pick the recommended or most conservative option and list it in the PR.
7. **No Docker?** If Docker does not start, run the unit tests, lint and build, open the PR anyway and let CI verify.
8. **Final message.** Report: branch, PR URL, commits, test commands with pass/fail counts, CI result, deviations, and follow-ups.

---

## Context
- orchadOS: Next.js owner portal (`apps/web`), Supabase.
- **Read first:** `CLAUDE.md`; `docs/bahce-yonetimi.md`; `docs/musteri-yonetimi.md` §10 (portal patterns); `docs/demo-turu.md` §11 (the demo tour runs on the same portal pages and must keep working: demo users are read-only owners without a customer profile).
- **Existing code:**
    - `apps/web/src/app/portal/**`: `page.tsx`, `basvuru/**`, `teklif/[id]`, `siparis/[id]`, `parsel/[parcelId]/page.tsx` and `actions.ts`, `hesap/page.tsx`, `billing-actions.ts`.
    - `components/portal-billing/customer-home.tsx` (with its test), `garden-form.tsx`.
    - `components/portal/garden-list.tsx`, `parcel-report.tsx`, `viewers-card.tsx` (the owner-only card pattern; demo users get no buttons), `question-threads.tsx`.
    - `lib/portal-billing/data.ts`, `urls.ts` (`PORTAL_NOTICES`, `portalHref`; notices are read from `?bilgi=` only), `validation.ts`, `payments.ts` (`START_ERRORS`).
    - `lib/portal/data.ts` (`listPortalParcels`), `questions.ts` (`writeError`), `viewers.ts` (`failWith`).
    - `lib/i18n/messages/portal-billing.ts`.
- Table reads always use `BILLING_COLUMNS` (`lib/billing/columns.ts`). Errors are mapped with `billingReasonOf` (`lib/billing/errors.ts`) to `billingText.errors`. Texts are Turkish in `messages/portal-billing.ts`; do not edit `tr.ts`.

## Contracts from stream A (doc §9.6; call exactly these)

### Reads
- **`my_service_period()`:** rows `{org_id, base_order_id, base_order_number, package_id, package_name, periodic_visits_per_year, period_start, period_end, next_base_order_id, next_period_start, next_period_end, renewal_quote_id, addon_base_order_id, addon_until, garden_count, garden_changes_enabled, is_primary, period_count}`.
    - Zero rows: no membership. Use the `is_primary` row everywhere.
    - When `period_count > 1`, show the multi-period note of doc §4.4.
- **`my_gardens()`:** one row per parcel `{order_item_id, order_id, order_number, base_order_id, is_addon, order_status, parcel_id, garden_name, parcel_status, state ('in_service'|'leaving'|'upcoming'|'removed'), service_start, service_end, removed_on, visits_entitled, visits_used, withdrawal_until, in_next_period, next_order_item_id, removal_id, removal_number, removal_status, removal_effective_on, access_until}`.
- **`parcel_service_status(p_parcel_id)`:** one row `{status: 'in_service'|'leaving'|'removed'|'none', leaving_on, removed_on, access_until}` for an owner or co-owner, or none.
- **`customer_addon_preview(p_areas_m2 numeric[])`:** the `price_preview` line columns plus `base_order_id, service_start, service_end, periodic_visits_per_year`. Errors: `no_membership`, `addon_period_too_short`, `package_not_priced`, `invalid_input`.
- **`customer_garden_removal_preview(p_parcel_id, p_at_period_end boolean default false, p_withdrawal boolean default false)`:** `{order_item_id, effective_on, withdrawal, withdrawal_until, access_until, visits_entitled, visits_used, refund_estimate_kurus, line_count}`. Errors: `not_in_service`, `garden_removal_open`, `parcel_order_pending`, `withdrawal_expired`.
- **`public_package_prices()`:** existing; use it to check that the membership package is still offered.

### Writes
- `customer_request_garden_removal(p_parcel_id, p_reason, p_note default null, p_at_period_end default false, p_withdrawal default false) returns uuid`. Reasons: `sold`, `not_needed`, `dissatisfied`, `cost`, `other`. Errors: `demo_read_only`, `garden_changes_closed`, `not_in_service`, `garden_removal_open`, `parcel_order_pending`, `withdrawal_expired`, `invalid_input`.
- `customer_cancel_garden_removal(p_removal_id) returns void`. Error: `removal_not_open`.
- **If delivered:** `customer_withdraw_application_garden(p_garden_id)` (errors `application_not_open`, `garden_withdrawn`, `last_garden`); `customer_revise_order(p_order_id, p_note default null) returns uuid` (application id; errors `not_revisable`, `has_payments`, `payment_in_progress`, `order_not_payable`).
- **Existing:** `customer_create_application(p_package_id)`, `customer_set_application_package` (draft only), `customer_accept_quote` (new errors `addon_base_closed`, `parcel_in_service`, `account_garden_limit`, `garden_removal_open`), `customer_cancel_order`, the `payments` start (new 409 codes `garden_removal_open`, `addon_base_closed`).
- **Database guards:** `parcel_read_only` now comes from the question insert and update and from the viewer invitation.

### New columns
- `quote.addon_of_order_id`; `quote.inputs.addon` `{base_order_id, base_order_number, period_start, period_end, service_start, remaining_days, period_days, visits_per_year, visits, addon_last_day}` with `inputs.formula = 'pricing-v2'`.
- `service_order.addon_of_order_id`; `application_garden.withdrawn_at`; `service_order_item.removed_on` and `garden_removal_id`.
- The table `garden_removal` (read through `BILLING_COLUMNS.garden_removal`).

### Labels and errors
Removal statuses, reasons, garden states and all new error texts are in `messages/billing.ts` (owned by A).

### Test helpers (owned by A; do not edit)
- `tests/e2e/billing-helpers.ts`: `activeMember`, `opsAddonQuote`, `removalFor(email, password, parcelId, {atPeriodEnd?, withdrawal?, complete?})`.
- `tests/integration/billing-fixture.ts`: `activeOrderFor`, `addonOrderFor`.
- `tests/local-db.ts`: `runGardenRemovalHousekeeping`, `setOrderPeriod`.

## Copy rules (doc §11; binding)
- **Vocabulary:** one set of words in the portal: `Üyeliğiniz` (dönem, paket, bitiş), `bahçe`, `teklif`, `ödeme`.
    - Never say temel sipariş or ek sipariş to the customer.
    - Order numbers appear only as a detail on order and payment pages.
- **Dates:** never append a Turkish case suffix to a formatted date (no `'e kadar`, `'a`). Use suffix-free wording such as `Hizmet bitişi: 31 Ekim 2027`, `Çıkış tarihi: 12 Aralık 2026`, `Hizmet dışı · raporlar şu tarihe kadar açık: 10 Mart 2027`, `Sonraki dönemde başlıyor: 1 Kasım 2027`. Add a unit test that the rendered badge and band texts contain no apostrophe after a date.
- **Button texts:** `Bahçeyi hizmetten çıkar (raporlarınız silinmez)`; `Bahçe listesini değiştir (sipariş iptal edilir, yeni teklif hazırlanır)`; add-on quote header `Mevcut üyeliğinize ek bahçe teklifi · hizmet bitişi: …`.

## Scope (design doc §11)
1. **Data loaders** (`lib/portal-billing/data.ts`): `getServicePeriods(supabase)` (all rows plus the primary row), `listMyGardens(supabase)`, `getParcelServiceStatus(supabase, parcelId)`. Extend `CustomerSummary` with `servicePeriod` and `gardens` where convenient. Parsers are typed from `database.types.ts`.
2. **Home `/portal`** (`customer-home.tsx`, `garden-list.tsx`, `app/portal/page.tsx`):
    - the `Üyeliğiniz` card: package, `Hizmet bitişi`, garden count, and `Yenileme teklifiniz hazır` when `renewal_quote_id` is set; the multi-period note when `period_count > 1`;
    - a `Bahçe ekle` card for a member when the switch is on and there is no draft;
    - a `Bahçe ekle` button next to the `Bahçelerim` heading (prop from `page.tsx`; hidden for demo users);
    - per-garden badges from `my_gardens.state`, with suffix-free dates;
    - non-members keep the current `Bahçenizi kaydedin` logic;
    - all add buttons go to `portalHref.newApplication()`.
3. **Application wizard** (`/portal/basvuru/yeni`, `/[id]`, the garden form pages), for a member:
    - **Package:** preselect and disable the package radio with the primary period's `package_id`, and pass it to `customer_create_application(p_package_id)`. Only an already existing draft with another package gets one `customer_set_application_package`. If the package is not in `public_package_prices()`, show `Ek bahçe için ekibimizle iletişime geçin` instead of the wizard.
    - **Band and list:** the membership band, and a read-only list `Hesabınızdaki bahçeler` (`listPortalParcels`).
    - **Preview:** `customer_addon_preview` instead of `price_preview` when `addon_base_order_id` is set. On `addon_period_too_short`: `Döneminizin bitmesine az kaldı; ek bahçeniz yenilemeyle başlayan yeni döneme eklenir.`
    - **Withdraw (if delivered):** on a `submitted` or `quoted` application with ≥2 active gardens, a per-garden `Başvurudan çıkar` (confirm). A withdrawn garden is muted with `Başvurudan çıkarıldı`.
    - **Linked garden:** a garden whose `parcel_id` is set before the order is active must not render a parcel link.
4. **Quote `/portal/teklif/[id]`:**
    - Always show `Hizmet bitişi` (start + 1 year − 1 day, or `inputs.addon.period_end`) and the last valid day.
    - For an add-on: the header above, the period, visits `visits/visits_per_year`, and inventory per line (`inventory_fee_kurus > 0`).
    - Map `addon_base_closed`, `parcel_in_service`, `account_garden_limit` and `garden_removal_open` through `billingText.errors`.
5. **Order `/portal/siparis/[id]`:**
    - For `awaiting_payment` with an application: `Bahçe listesini değiştir …` (confirm checkbox) → `customer_revise_order` → redirect to `portalHref.application(id, { bilgi: 'siparis_duzeltmeye_acildi' })`. If `customer_revise_order` is not delivered, keep only `Siparişi iptal et`.
    - An add-on shows `Üyeliğinize eklenen bahçe`.
    - Add `garden_removal_open` and `addon_base_closed` to `START_ERRORS` in `lib/portal-billing/payments.ts`.
6. **Parcel page `/portal/parsel/[parcelId]`** (`parcel-report.tsx`, a new `components/portal/service-card.tsx`, `parsel/[parcelId]/actions.ts`):
    - **Who sees the card:** the paying owner only (a `my_gardens` row for the parcel). Demo users and co-owners get no card.
    - **Card content:** period, `visits_used/visits_entitled`, and the withdrawal window if `withdrawal_until >= today`.
    - **Form when no removal is open and the switch is on:**
        - reason (select) and an optional note (≤1000);
        - three timing options, each with its own effective day and refund estimate from a separate `customer_garden_removal_preview` call: `30 gün sonra` (default), `Dönem sonunda`, and, only while `withdrawal_until >= today`, `Cayma hakkımı kullanıyorum: bahçe bugün hizmetten çıkar, ödediğiniz tutar iade edilir (yapılmış envanter ve ziyaretler hariç)`;
        - the estimate is labelled `en fazla`, with the access end;
        - a required confirmation checkbox.
    - **`parcel_order_pending`:** show a link to the pending order.
    - **Open removal:** number, status, effective day, and `Talebi geri al`.
    - **Switch off:** `Bahçe çıkarmak için bize ulaşın`.
    - **Removed parcel** (`parcel_service_status.status = 'removed'`): a band for everyone with the parcel, `Bu bahçe hizmetten çıkarıldı. Raporlar şu tarihe kadar açık: …`. Hide the question form and the co-owner invite form.
    - Map server-action results to `PORTAL_NOTICES` `cikarma_istendi` and `cikarma_geri_alindi`, and errors through `billingText.errors`.
7. **Error mapping for the read-only guard:** map `parcel_read_only` in `lib/portal/questions.ts` (`writeError`) and `lib/portal/viewers.ts` (`failWith`) to a new error with its text in `portal-billing.ts`. Users must not see the generic `kaydedilemedi`.
8. **Account `/portal/hesap`:** the `Üyeliğiniz` summary and a `Bahçelerim` management section.
    - It lists every `my_gardens` row with its state, plus `Hizmetten çıkar` (link to the parcel form) and `Bahçe ekle`.
    - Owner parcels from `listPortalParcels` without a `my_gardens` row (pilot) show `Bu bahçeyi çıkarmak için bize ulaşın`.
9. **Notices:** add `cikarma_istendi`, `cikarma_geri_alindi`, `bahce_basvurudan_cikarildi` and `siparis_duzeltmeye_acildi` to `PORTAL_NOTICES`. Build every redirect with `portalHref(…, { bilgi })`, never a hand-built query string (`?bildirim=` is ignored). Add `portalHref.parcel(id, r?)` if it helps.
10. **i18n:** new blocks `membership`, `gardens` and `removal` in `messages/portal-billing.ts`, plus additions to `home`, `application`, `quote`, `order` and the question and viewer error texts.

## Tests
- **Unit:**
    - `customer-home.test.tsx`: the member card (switch on and off, draft present, multi-period note); the non-member card unchanged.
    - Parser and validation tests for the removal form, including the three options and the both-flags case.
    - The no-suffix date test.
    - The `parcel_read_only` mapping in questions and viewers.
- **Integration (`tests/integration/customer-gardens.test.ts`):**
    - the loaders return the period and gardens for a member made with `activeOrderFor` (and two rows with `is_primary` for a member with two orders);
    - the request (each option) and cancel actions;
    - a co-owner sees the status but no card data;
    - a demo-like user without a profile gets empty results.
- **E2E (`tests/e2e/customer-gardens.spec.ts`):**
    - an `activeMember` adds a second garden from the home `Bahçe ekle` card and sees the band and the locked package;
    - ops quotes via `opsAddonQuote`; the customer accepts and pays with the fake card (as in `customer-journey.spec.ts`) and sees two gardens;
    - from `Hesabım › Bahçelerim` the customer opens the parcel form, sees the options with dates, requests a removal, sees `Çıkış tarihi`, and undoes it;
    - after a removal completed with `removalFor(…, {complete: true})`, the band shows and the question form is absent.
    - Keep `customer-journey.spec.ts`, `portal-owner.spec.ts` and `demo-tour.spec.ts` green.

## Commands
```
pnpm install
pnpm db:start && pnpm db:reset
pnpm web:lint
pnpm web:test
pnpm web:build
pnpm web:e2e   # Chromium; run your new spec plus customer-journey, portal-owner and demo-tour
```

## Acceptance criteria
- Every screen in doc §11 behaves as described. Non-members, co-owners and demo users see exactly what they saw before, except the new read-only band on a removed parcel.
- Only the listed RPCs and columns are used; no `select("*")` on billing tables.
- Copy follows the vocabulary and no-suffix rules.
- Lint, unit, integration, build and the listed e2e specs pass; the demo tour passes; CI is green.
- No file outside your owned paths is changed. The PR (Turkish) has screenshots or a short description per screen, the tests run, and any contract gap found for stream A.
