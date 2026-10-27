# İP12-D Müşteri portalı: başvuru, teklif, sipariş, ödeme, makbuz, hesap ve uçtan uca yolculuk

> **Orchestrator notes (27 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip12-d-portal-odeme.md`. Wave 3. Design: `docs/musteri-yonetimi.md`.

1. **Base branch.** The design doc and these task files live on `docs/ip12-musteri-yonetimi` (PR #52), which may not be merged to main yet. Wherever the brief says to branch from, rebase on, or read the design doc from `origin/main`, use `origin/docs/ip12-musteri-yonetimi` instead. If PR #52 is already merged, `origin/main` is fine. Do not stop because the doc is missing on main.
2. **Dependencies are NOT on main.** The brief says your dependency streams are "merged on main"; they are not (a human merges later). After branching, run `git fetch origin` and `git merge --no-edit` each of these into your branch, in this order (no rebase, no force-push). Resolve conflicts yourself, keeping every contract in the design doc. If one is missing, stop and report it:
   - `origin/claude/ip12-veri-modeli` (ip12-db-core)
   - `origin/claude/ip12-siparis-odeme-db` (ip12-db-billing)
   - `origin/claude/ip12-odeme-saglayici` (ip12-payments)
   - `origin/claude/ip12-site-kayit` (ip12-site)
   Wherever the brief tells you to read "A1's migrations on main" etc., read them from your merged branch.
3. **Branch.** Push to `claude/ip12-portal-odeme`. If the session forces a different branch name, use it and state it in the PR and in your final message.
4. **PR.** Open a PR against `main` through the REST API (`gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...`; see `docs/gorevler/README.md` §9). Write the description in Turkish and mention the PRs you depend on. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice open, pick the recommended or most conservative option and list it in the PR.
6. **Time.** Run only the test suites that matter for your stream. Do not run the Python pipeline suite (11 min). Run commands longer than 10 min in the background.
7. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any departure from the design doc contracts, and open follow-ups.

---

BRANCH = `claude/ip12-portal-odeme`. Wave 3. İP12-A1, A2, B and C are merged on main. İP12-E (back office in `/operasyon`) runs in parallel; never touch its paths.

You may fix blocking bugs in the wave-1/2 Edge and sign-up code listed in your ownedPaths as 'bug fixes only'. List each fix in the PR.

## Working rules (all İP12 streams)
- **Design doc.** The design is `docs/musteri-yonetimi.md` on main and is the source of truth.
  - If it is missing on `origin/main`: make an empty commit, push, open a draft PR `BLOCKED: docs/musteri-yonetimi.md missing on main`, and stop.
  - Do not edit it.
- **Repo and branch.** Repo `github.com/yusuftiryaki/orchadOS`. Branch from the latest `origin/main` (or the assigned `claude/...` branch). Rebase before the PR.
- **Read first:** `CLAUDE.md`, the design doc (§4–§6.10, §8.4, §8.6, §10, §12–§14), `apps/web/AGENTS.md` (Next.js 16: read `node_modules/next/dist/docs/` first), `apps/web/README.md`.
  - Study `src/app/portal/**`, `src/app/operasyon/actions.ts` (FormState, `useActionState`, `?bilgi=`/`?hata=`), `components/operations/{field.tsx,boundary-draw-map.tsx}` (import only), `lib/operations/{validation,geometry}.ts`, the PDF route `src/app/portal/parsel/[parcelId]/rapor.pdf/route.ts` and `tests/e2e/operations-registration.spec.ts` (map clicks via `el.__map`).
- **Language.** Code and commits are in English. UI text is Turkish, in `messages/portal-billing.ts` (`portalBillingText`).
- **Shared code to reuse:** enum labels and errors from `billingText`, `billingReasonOf`; money from `lib/billing/money.ts`; columns from `BILLING_COLUMNS` (`lib/billing/columns.ts`). Never use `select('*')` on billing tables: internal columns are not granted and the query fails with 42501.
- **KVKK.** The billing profile is reachable only through `my_billing_profile` / `customer_save_billing_profile`, masked. Never log form values.
- **No dependencies.** Do not add tables. Fix-forward migrations go in `20261031100000`–`20261031109999`, with pgTAP `40_*`; regenerate the types after one. Do not ask questions; write the decisions in the PR.
- **Setup:** `cat /tmp/orchados-session-start.log; docker info; pnpm install; pnpm db:stop; pnpm db:start && pnpm db:reset; pnpm --filter web exec playwright install --with-deps chromium`.
- **Fallback** if Docker, Supabase or Playwright will not start: run `pnpm web:lint && pnpm web:build && pnpm --filter web test:unit`, open the PR anyway, watch `ci-db-web` via `gh api repos/yusuftiryaki/orchadOS/actions/runs?branch=BRANCH` until green, and note in Test özeti what did not run.
- **CI order:** `pnpm db:reset && pnpm db:test && pnpm web:typegen && git diff --exit-code apps/web/src/lib/database.types.ts && pnpm web:lint && pnpm web:build && pnpm web:test && pnpm db:test && pnpm db:reset && pnpm web:e2e && pnpm db:test`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **PR** via `gh api repos/yusuftiryaki/orchadOS/pulls -f title='...' -f head=BRANCH -f base=main -F body=@pr-body.md`. Turkish body with: Ne yapıldı, Kararlar, Test özeti, Dalga 1/2 düzeltmeleri, CI süresi, Eksikler / bilinen sorunlar, Sözleşmeden sapmalar. Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Scope (routes as §10)

1. **Shell.** `PortalNav` (`aria-label='Hesap'`) in `portal/layout.tsx`. Every page calls `requireSection('portal')`.
2. **`/portal` home.** A `CustomerHome` component with cards (open quote, order awaiting payment, draft application) and the 'Bahçenizi kaydedin' call to action.
3. **Applications.**
   - List, new (packages via `rpc('public_package_prices')` → `customer_create_application`), and detail (draft editing, live `price_preview`, submit, withdraw; read-only timeline after submit).
   - Garden form with `BoundaryDrawMap`, saving through `customer_save_application_garden` with exactly the §6.9 jsonb keys.
   - Pure parsers in `lib/portal-billing/validation.ts` (dönüm → m², Turkish decimals), with tests.
4. **Quote.**
   - Lines, discount, KDV, total, validity, `note_to_customer`, and the billing profile status (link `/portal/hesap/fatura?geri=...`).
   - If `my_consents` lacks a granted `kvkk_notice`, show the aydınlatma acknowledgement, saved via `customer_set_consent('kvkk_notice', true, version)`.
   - Two required boxes with versions from `LEGAL_TEXT_VERSIONS` → `customer_accept_quote`; also revise and decline.
5. **Orders.**
   - 'Kartla öde' only when `siteFlags().paymentsEnabled`. It invokes `payments` `{action:'start', order_id, return_origin: <proto+host from headers()>, client_ip}`, then `redirect(redirect_url)`. Map the §8.4 errors.
   - Bank-transfer box via `customer_payment_instructions`.
   - Cancel, with the `payment_in_progress` message.
6. **Payments.** History, and the result page: a 10 s meta refresh while `initiated` or `pending_review`; the `?hata=odeme_bulunamadi` notice.
7. **Account.**
   - `/portal/hesap`: a contact form → `customer_update_contact(p_full_name, p_email, p_contact_preference)`. Phone change is out of scope; say so in the UI. Plus summaries.
   - `/portal/hesap/fatura`: individual or company. Ask for TCKN only when `my_billing_profile` / settings say `identity_number_required` (checksum in `lib/portal-billing/tckn.ts`, tested). Filter `?geri=` with `safeNextPath` from `src/app/giris/login-methods.ts`, and add a unit test for `//evil.com` and `/\evil.com`.
   - `/portal/hesap/izinler`: the two `explicit_*` consents and, if missing, `kvkk_notice`. Show the `?bilgi=hesap_vardi` notice when present.
8. **Receipt.** `src/app/makbuz/[paymentId]/route.ts` (`runtime = 'nodejs'`):
   - `requireUser()`, then `receipt_data`; null → 404.
   - `receipt-pdf.tsx` using the `theme.ts` fonts; title 'Ödeme makbuzu (fatura değildir)'.
   - Headers: `Content-Disposition: inline; filename=makbuz-<no>.pdf`, `Cache-Control: private, no-store`.
   - Add the route to `outputFileTracingIncludes` in `next.config.ts`. Unit-test the render.
9. **Public prices.** Wire `loadPublicPackages` to `rpc('public_package_prices')` and keep the interface. Add the 20-dönüm example on `/paketler`.
10. **README.** A Turkish section 'Müşteri portalı: başvuru ve ödeme'.
11. **CI time.** Measure the `ci-db-web` duration on your PR. If it is above about 25 minutes, raise `timeout-minutes` (for example to 45) or split e2e into its own job in `.github/workflows/ci-db-web.yml`. Record the numbers in the PR.

## Contracts you consume
- The A1 and A2 customer functions in §6.9.
- `BILLING_COLUMNS`.
- B's `payments` start and the callback redirect to `/portal/odeme/<id>`.
- Locally `PAYMENT_PROVIDER=fake`; `/odeme/sahte` posts `token` + `outcome`.
- `customer-signup` (§7, with the proxy secret header).
- `fixtures.ts` (`CUSTOMER`, `signInCustomer`, `BILLING_SEED`) and `local-db.ts` (`purgeBillingUsers`, `purgeParcels`, `deleteUsers`).

## Tests
- **Unit:** parsers, TCKN, `safeNextPath` use, receipt render.
- **Integration `payments-flow.test.ts`:**
  - a fresh customer goes through profile, draft, garden and submit
  - as ops@: verify and quote
  - the customer accepts, then `payments` start with return_origin `http://127.0.0.1:3100`
  - a cookieless callback POST (`redirect: 'manual'`, `outcome=success`) → 303
  - assert: receipt number, order active, parcel `registered` with owner access, `payment_received` pending, audit rows
  - finalize twice more: no change
  - a failure outcome on a second order
  - a refund via `ops_request_refund` and Edge refund
  - reconcile with the `x-orchados-cron-secret: cron-local` header
  - RLS: another customer and viewer@ see nothing
  - cleanup
- **Integration `customer-billing.test.ts`:** profile masking, consent withdrawal, garden limits and errors, `customer_update_contact`.
- **Integration `customer-sections.test.ts`:** `CUSTOMER` sees `['portal']`.
- **E2E `customer-journey.spec.ts`:**
  - UI sign-up with a unique `+905…` phone; read the OTP via `message_outbox_list`
  - application with map clicks
  - ops verify and quote via the API
  - billing profile, acceptance, fake payment, success page, receipt returns 200 `application/pdf`
  - a declined-card path
  - helpers in `billing-helpers.ts`; cleanup in `afterAll`

## Acceptance criteria
- CI is green.
- A brand-new visitor completes sign-up → apply → (ops via API) → accept → pay (fake) → receipt entirely in e2e.
- Viewers never see others' billing.
- No card button appears with the payments flag off.
- No PII is logged.
- Every wave-1/2 fix is listed in the PR.
