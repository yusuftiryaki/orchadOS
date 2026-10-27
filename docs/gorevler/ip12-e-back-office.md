# İP12-E Back office (/operasyon): başvurular, teklifler, siparişler, ödemeler, iadeler, fiyatlar, ayarlar, denetim kaydı

> **Orchestrator notes (27 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip12-e-back-office.md`. Wave 3. Design: `docs/musteri-yonetimi.md`.

1. **Base branch.** The design doc and these task files live on `docs/ip12-musteri-yonetimi` (PR #52), which may not be merged to main yet. Wherever the brief says to branch from, rebase on, or read the design doc from `origin/main`, use `origin/docs/ip12-musteri-yonetimi` instead. If PR #52 is already merged, `origin/main` is fine. Do not stop because the doc is missing on main.
2. **Dependencies are NOT on main.** The brief says your dependency streams are "merged on main"; they are not (a human merges later). After branching, run `git fetch origin` and `git merge --no-edit` each of these into your branch, in this order (no rebase, no force-push). Resolve conflicts yourself, keeping every contract in the design doc. If one is missing, stop and report it:
   - `origin/claude/ip12-veri-modeli` (ip12-db-core)
   - `origin/claude/ip12-siparis-odeme-db` (ip12-db-billing)
   - `origin/claude/ip12-odeme-saglayici` (ip12-payments)
   - `origin/claude/ip12-site-kayit` (ip12-site)
   Wherever the brief tells you to read "A1's migrations on main" etc., read them from your merged branch.
3. **Branch.** Push to `claude/ip12-back-office`. If the session forces a different branch name, use it and state it in the PR and in your final message.
4. **PR.** Open a PR against `main` through the REST API (`gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...`; see `docs/gorevler/README.md` §9). Write the description in Turkish and mention the PRs you depend on. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice open, pick the recommended or most conservative option and list it in the PR.
6. **Time.** Run only the test suites that matter for your stream. Do not run the Python pipeline suite (11 min). Run commands longer than 10 min in the background.
7. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any departure from the design doc contracts, and open follow-ups.

---

BRANCH = `claude/ip12-back-office`. Wave 3. İP12-A1, A2, B and C are merged on main. İP12-D (customer portal, `/makbuz`, payment e2e, CI timeout) runs in parallel; never touch its paths.

Design §11 applies:
- No new section and no new role: the `ops` role in `/operasyon`, with `SectionShell`, `OpsNav`, and `requireSection('operasyon')` in the layout, every page and every action.
- No separate customers page: extend the existing `/operasyon/sahip` list.
- A2 already updated `notification-table.tsx` and `lib/notifications/data.ts`; do not touch them.

## Working rules (all İP12 streams)
- **Design doc.** The design is `docs/musteri-yonetimi.md` on main and is the source of truth.
  - If it is missing on `origin/main`: make an empty commit, push, open a draft PR `BLOCKED: docs/musteri-yonetimi.md missing on main`, and stop.
  - Do not edit it.
- **Repo and branch.** Repo `github.com/yusuftiryaki/orchadOS`. Branch from the latest `origin/main` (or the assigned `claude/...` branch). Rebase before the PR.
- **Read first:** `CLAUDE.md`, the design doc (§4.5–§4.10, §5, §6.8, §6.9 `ops_*`, §6.10, §8.4 refund, §11, §14), `docs/gorevler/operasyon-ekranlari.md`, `apps/web/AGENTS.md` (Next.js 16 docs first), `apps/web/README.md`.
  - Study all of `src/app/operasyon/**`, `src/components/operations/**` and `src/lib/operations/**`: data and mutations layering, `OpsResult`, FormState, `readResult`, `Field`/`FormError`/`Notice`, `BoundaryDrawMap`, masked phones, `tests/e2e/operations-registration.spec.ts`.
- **Language.** Code and commits are in English. UI text is Turkish, in `messages/back-office.ts` (`backOfficeText`).
- **Shared code to reuse:** labels and errors from `billingText` and `billingReasonOf`; money from `formatKurus` / `parseTlToKurus`; columns from `BILLING_COLUMNS`. Never `select('*')` on billing tables. Internal columns (`ops_note`, `verification_note`, `manual_note`, refund `note`, `*_by`) come only from `ops_billing_internal(p_entity_type, p_entity_id)`.
- **KVKK.** Phones and TCKN are masked. 'TCKN'yi göster' calls `ops_billing_profile(..., p_reveal => true)`, which writes an audit row; show the value only in that response. TCKN exists only when `identity_number_required`. Never log form values.
- **No dependencies.** Do not add tables. Fix-forward migrations go in `20261031200000`–`20261031209999`, with pgTAP `41_*` (security definer, anon denied); regenerate the types after one. Do not ask questions; write the decisions in the PR.
- **Setup:** `cat /tmp/orchados-session-start.log; docker info; pnpm install; pnpm db:stop; pnpm db:start && pnpm db:reset; pnpm --filter web exec playwright install --with-deps chromium`.
- **Fallback** if Docker, Supabase or Playwright will not start: run `pnpm web:lint && pnpm web:build && pnpm --filter web test:unit`, open the PR anyway, watch `ci-db-web` via `gh api repos/yusuftiryaki/orchadOS/actions/runs?branch=BRANCH` until green, and note in Test özeti what did not run.
- **CI order:** `pnpm db:reset && pnpm db:test && pnpm web:typegen && git diff --exit-code apps/web/src/lib/database.types.ts && pnpm web:lint && pnpm web:build && pnpm web:test && pnpm db:test && pnpm db:reset && pnpm web:e2e && pnpm db:test`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **PR** via `gh api repos/yusuftiryaki/orchadOS/pulls -f title='...' -f head=BRANCH -f base=main -F body=@pr-body.md`. Turkish body with: Ne yapıldı, Kararlar, Test özeti, Eksikler / bilinen sorunlar, Sözleşmeden sapmalar. Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Scope (screens as §11)

1. **`OpsNav`.**
   - New items `applications`, `orders`, `payments`, `refunds`, `prices`, `audit` and `settings`, in a group 'Müşteri ve ödeme'.
   - Keep the existing items, texts and order so the existing e2e tests stay green.
   - Hrefs go in `lib/back-office/urls.ts` (`boHref`, notice and error whitelists).
2. **Dashboard.** A 'Müşteri ve ödeme' card from `ops_billing_summary`, with links. Show a warning when `signup_attempts_24h > 300`.
3. **Owners as customers.**
   - `/operasyon/sahip` reads `ops_customers`: columns kayıt kaynağı, açık sipariş and ödenen; a 'Self-servis' filter; search.
   - `/operasyon/sahip/[profileId]` gets a 'Müşteri hesabı' panel: the masked billing profile with reveal, consent history, applications, orders, payments, and a 'Parsel teklifi ver' link.
4. **Applications.**
   - List via `ops_applications`.
   - Detail: map and table (declared vs verified), the internal note via `ops_billing_internal`, `ops_preview_quote`, the `ops_issue_quote` form (percent → bp), the `ops_reject_application` form, quote history.
   - Garden verification: `BoundaryDrawMap`, `ops_application_garden_detail`, `ops_verify_application_garden` (area in dönüm).
5. **Quotes.**
   - `/operasyon/teklif/[id]`: read-only and printable.
   - `/operasyon/teklif/yeni?sahip=` and `?siparis=` → `ops_issue_parcel_quote`.
6. **Orders.**
   - List with overdue rows highlighted.
   - Detail:
     - `ops_record_manual_payment` (TL; show the `payment_in_progress` message)
     - `ops_extend_payment_due`
     - `ops_cancel_order`
     - `ops_terminate_order` (confirmation step)
     - a renewal link
     - the audit trail via `ops_audit_events(p_org_id, 'order', id)`
7. **Payments.**
   - List with filters.
   - Detail:
     - items and `ops_payment_events`
     - the receipt link `/makbuz/<id>`
     - the mismatch banner for `amount_mismatch` / `reference_mismatch`
     - `ops_resolve_payment_review` for fraud review (provider ref required)
     - the refund form → `ops_request_refund`, then for each non-manual id invoke `payments` `{action:'refund', refund_id}` sequentially
     - `ops_void_manual_payment`
8. **Refunds** `/operasyon/iade`.
   - Order: requested, failed and stale processing first ('belirsiz' = processing over 15 minutes).
   - Row actions: İşle (Edge), `ops_complete_manual_refund`, `ops_cancel_refund`, `ops_resolve_refund` (provider ref required for card refunds marked succeeded).
   - When the Edge returns 404 or 5xx, show 'Ödeme servisine ulaşılamadı'.
9. **Prices.**
   - Packages and price list versions, marking the one in force today.
   - Package form → `ops_save_package`.
   - Draft editor → `ops_save_price_list_draft`, `ops_publish_price_list` (confirmation), `ops_delete_price_list_draft`.
   - Published lists are read-only, with 'Bundan taslak oluştur' → `ops_create_price_list_draft`.
10. **Audit log** `/operasyon/denetim-kaydi`: filters and Turkish action labels, falling back to the code.
11. **Settings.**
    - `ops_billing_setting` / `ops_save_billing_setting`: the 'Dışarıdan kayıt açık' switch with a warning, the IBAN check, and `identity_number_required` with an explanation.
    - `allow_fake_payments` is shown read-only; it is never sent.
12. **Docs.** `docs/kullanim-kilavuzu.md`: a Turkish section '0 · Başvuru ve ödeme' with a ✅/🟡/⬜ status table.

**Layering:** reads in `lib/back-office/data.ts`; writes in `mutations.ts` returning `{ok:true,value} | {ok:false,error:BillingError}`; pure parsers in `validation.ts` with unit tests (TL → kuruş, percent → bp, dönüm → m², dates, IBAN).

## Contracts you consume
- Every `ops_*` function in §6.9, `ops_billing_internal` and `ops_notifications`.
- Tables via `BILLING_COLUMNS`.
- The `payments` refund JSON (§8.4).
- `/makbuz/<id>`.
- Seed: ops@, `CUSTOMER` / `BILLING_SEED` from `fixtures.ts`. Do not mutate seed rows; create your own data.

## Tests
- **Unit:** validation and urls.
- **Integration `back-office.test.ts`:**
  - a price list draft → publish; a past `valid_from` refused; edits after publish refused
  - a fresh customer's application → verify → quote → accept (as the customer) → manual payment → active → parcel
  - a manual refund requested and completed
  - the internal note visible through `ops_billing_internal` and not through a select
  - self-dealing refused (an ops user acting on its own customer row)
  - field@, expert@ and owner@ refused by every `ops_*`
  - cleanup with `purgeBillingUsers`, `purgeParcels` and `deleteUsers`
- **E2E `back-office-flow.spec.ts`** as ops@, with data created through the API:
  - verify a garden → issue a quote
  - after a customer acceptance via the API, record a manual payment → order active with the parcel link
  - a manual refund requested and completed
  - the audit log shows these actions
  - publish a price list from a draft copy
  - settings save
- **E2E `back-office-access.spec.ts`:** owner@ and expert@ get 403 on the new routes. The existing `operations-*.spec.ts` stay green.

## Acceptance criteria
- CI is green.
- Every §11 screen works for ops@, and every write appears in the audit log.
- TCKN is shown only after reveal.
- The existing ops screens and tests are unchanged in behaviour.
- No PII is logged.
