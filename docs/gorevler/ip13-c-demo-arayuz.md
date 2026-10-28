# İP13-C Demo arayüzü: demo sunucusu, giriş, oturum kapısı, rehberli tur, uçtan uca test

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip13-c-demo-arayuz.md`. Wave 2. Design: `docs/demo-turu.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 is fully merged there, including integration fix #61.
2. **Dependencies.** These may not be on main yet. After branching from `origin/main`, run `git fetch origin` and `git merge --no-edit` on each of these, in this order:
   - `origin/claude/ip13-demo-erisim` (İP13-A)
   - `origin/claude/ip13-demo-verisi` (İP13-B)
   No rebase and no force-push. If one is already merged into main, skip it. Before opening the PR, fetch and merge them again so you pick up late fixes. If one is missing, stop and report it.
3. **Branch.** Push to `claude/ip13-demo-arayuz`. If the session forces a different name, state it in the PR and in your final message.
4. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
6. **Human-only infrastructure.** The separate demo Supabase project, the Vercel project and the domain do not exist yet. Build and test everything locally and in CI. Write down in the PR every step a human must do.
7. **Time.** Run only the test suites that matter. Run commands longer than 10 minutes in the background.
8. **Final message.** Report: branch, PR URL, commits, each test command with pass/fail counts, any deviations from the design-doc contracts, and follow-ups.

---

You are implementing stream C of İP13 "Demo turu" (demo tour) for orchadOS: the web experience. It covers:
- the "Demoyu dene" entry points, and a demo-host mode for the dedicated demo deployment
- starting a demo
- a session gate that ends expired demos cleanly
- the demo shell and banner
- a guided tour through the real owner portal
- demo-safe write UIs
- watermarked, detectable PDFs
- public demo media
- the deployment docs
- a full end-to-end test

## Context
- Repo yusuftiryaki/orchadOS (checked out in your environment). Web: Next.js 16 / React 19 in `apps/web`, Supabase via `@supabase/ssr`; every portal query runs as the signed-in user under RLS.
- Read first:
    - `CLAUDE.md`
    - `docs/demo-turu.md`, the İP13 design doc. It is on main. §2–§4, §6, §11–§16 and §18 are yours; names are binding.
    - `docs/musteri-yonetimi.md` §9–§10
    - `apps/web/README.md`
- Binding rules:
    - Docs are in Turkish. Code, identifiers, comments and commits are in English.
    - UI strings live in `apps/web/src/lib/i18n/messages/<area>.ts`.
    - No analytics.
    - No new npm dependencies; do not edit `apps/web/package.json` or `pnpm-lock.yaml`.
- Base: create branch `claude/ip13-demo-arayuz` from the latest `origin/main`. This is wave 2. main already contains:
    - all of İP12
    - stream A: the migrations `20261101120000_demo_access.sql`, `20261101120100_demo_write_guard.sql` and `20261101120200_demo_account_lockdown.sql`; the Edge Function `demo-start` and `_shared/demo.ts`; regenerated types; and the helpers `registerDemoOrg`, `ageDemoSessions`, `purgeDemoAttempts` and `runDemoHousekeeping` in `apps/web/tests/local-db.ts`
    - stream B: `pnpm db:demo-tour`, which loads the synthetic dataset and mirrors its media into the public bucket `demo-media`

  Read their merged code and PR descriptions first. If a name differs from the doc, follow the merged code and note it in your PR.
- Hosting (doc §3.4): the public demo runs on a dedicated demo Supabase project behind its own Vercel deployment (`demo.<domain>`). The pilot site only links to it. Local and CI run everything in one deployment.

## Contracts you build on
- **Edge** `POST {SUPABASE_URL}/functions/v1/demo-start`, header `x-orchados-proxy-secret: SIGNUP_PROXY_SECRET`, body `{action: 'start', client_ip?, captcha_token?}`.
    - 200 returns `{token_hash, verification_type, expires_at, next}`.
    - Errors: 400 `invalid_input` or `captcha_failed`; 429 `rate_limited`; 503 `demo_closed` or `demo_capacity`; 500 `failed`.
    - Types are in `supabase/functions/_shared/demo.ts`; import them by relative path as `src/lib/billing` imports `_shared/signup`.
- **JWT:** a demo account has `app_metadata.demo = true`.
- **RPCs:**
    - `demo_info()`: `{org_id, expires_at, tour: {parcel_id, tree_id, session_id, previous_session_id, inventory_session_id}, parcels: [{id, name}]}` for a demo user, null otherwise
    - `demo_end()`
    - `demo_hit(p_kind 'sign' | 'pdf') returns boolean`; false means over the per-session cap
- **Errors:** demo writes fail with `demo_read_only` (42501); customer functions return `not_customer`.
- **Media:** demo files exist at the same path in bucket `demo-media`, which is public: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/demo-media/org/<org>/parcel/<parcel>/<sha256>`.
- **Dataset** (doc §8):
    - parcels "Örnek Bahçe – Kuzey" (`de100000-0000-4000-8000-000000000001`) and "Örnek Bahçe – Dere" (`...0002`)
    - featured tree S3-6
    - two summer scans of Kuzey: 2025-07-15 and 2026-07-14
    - approved inventories with panoramas
    - findings with expert description and recommendation
    - two answered threads
    - viewer "Örnek Hissedar"

## Deliverables

### 1. Flags, hosts, entry points
- **`src/lib/flags.ts`.** Add to `SiteFlags`:
    - `demoEnabled: on(ORCHADOS_DEMO_ENABLED)`: this deployment serves `/demo`.
    - `demoUrl`: `ORCHADOS_DEMO_URL`; else `/demo` when `demoEnabled`; else null.
    - `mainSiteUrl`: `ORCHADOS_MAIN_SITE_URL` without a trailing slash, or null. When set, this deployment is a demo host.
- **Demo host, in `src/proxy.ts` / `src/lib/supabase/proxy.ts`.** Put the logic in a pure matcher `demoHostRedirect(pathname, mainSiteUrl)` with unit tests. When `mainSiteUrl` is set:
    - `/` redirects to `/demo`.
    - These pass through: `/demo/**`, `/portal/**`, Next internals, `robots.txt`, static assets, and any auth callback route the app has.
    - Every other page redirects (307) to the same path and query on `mainSiteUrl`.
    - Unauthenticated `requireUser` redirects to `/demo` instead of `/giris`.
    - A demo host is never indexable.
- **Public paths:** `src/lib/site/public-paths.ts` adds `/demo` to `PUBLIC_PREFIXES`. Tests: `/demo/bitti` is true, `/demolar` false.
- **Sitemap:** `/demo` only when `demoEnabled` and `indexable`.
- **CTAs:** rendered only when `demoUrl` is non-null, all linking to `demoUrl`:
    - landing `.ctaRow`, `data-testid="landing-demo"`: primary when sign-up is off, secondary otherwise; plus a link under the "Portalda ne görürsünüz?" tile
    - header when signed out, `header-demo`
    - `/giris`, via a new `components/site/demo-link.tsx`, `login-demo`
    - a tile at the end of `nasil-calisir`
- **Texts:** `nav.demo`, `landing.ctaDemo`, `landing.demoFoot` and `login.tryDemo` go in `messages/site.ts`. Everything else goes in a new `messages/demo.ts` (`demoText`), with a shape test.
- **Privacy page:** add the demo paragraph to `(site)/gizlilik/page.tsx`, marked the same way as the other texts awaiting lawyer approval:
    - no personal data is asked
    - a pseudonymised IP hash (IPv6 /64) is kept 48 h
    - raw IPs stay in Auth sessions and infrastructure logs for the provider's retention
    - Turnstile/Cloudflare, Supabase and Vercel involve cross-border transfer
    - strictly necessary cookies

### 2. `/demo` start page
- **`src/app/(site)/demo/page.tsx`:**
    - `notFound()` unless `demoEnabled`.
    - Explains in Turkish:
        - what the visitor will see
        - the data and images are synthetic and the location is representative
        - no personal data is asked; a session cookie is used
        - a pseudonymised hash of the IP ("takma adlandırılmış özet", not "irreversible") is kept 48 h against abuse
        - the raw IP stays briefly in session and infrastructure logs
        - Turnstile is provided by Cloudflare
        - the session lasts 3 hours
        - a link to `/gizlilik`
    - Shows the existing Turnstile component when `turnstileSiteKey` is set, and the button `demo-start`.
    - `?bitti=1` shows "Demo süreniz doldu ya da demodan çıktınız" with a restart button.
    - A real signed-in user sees "Demo için önce çıkış yapın"; a demo user is redirected to `/portal`.
- **`src/app/(site)/demo/actions.ts`:**
    - `startDemoAction(prev, formData)`:
        - checks `demoEnabled`
        - reads the client IP through a shared server-only helper extracted from `(site)/kayit/actions.ts` (e.g. `src/lib/site/client-ip.ts`) and used in both places
        - calls `src/lib/demo/start.ts` (server-only `requestDemoStart({captchaToken, clientIp})`)
        - returns `DemoStartState = {status: 'idle'} | {status: 'ready', tokenHash, verificationType, next} | {status: 'error', code}`, with codes mapped to `demoText`
    - `exitDemoAction(formData)`:
        - `next` is `/`, `/kayit` or `/giris`; anything else becomes `/`
        - only when the current claims have `app_metadata.demo === true`: call rpc `demo_end` (ignore errors), then `signOut()`
        - otherwise do not touch the session
        - redirect: on a demo host, `/kayit` and `/` go to `mainSiteUrl + next`
- **Client form `demo-start-form.tsx`:** on `ready`, call `verifyOtp({token_hash, type})` with the new browser client, then `window.location.assign(next)`. Verification happens in the browser so GoTrue rate-limits the visitor's IP. Never verify on the server.
- **Browser client:** new `src/lib/supabase/browser.ts` (`createBrowserClient`).
- **`src/app/(site)/demo/bitti/route.ts` (GET):**
    - Reads the claims. Only for a demo session: `demo_end` and `signOut`, then a redirect to `/demo?bitti=1`.
    - For anyone else: redirect to `/demo` and leave the session alone. This prevents logout CSRF through `<img>`, links or prefetch.
    - Unit-test that a real user is not signed out.

### 3. Session gate and shell
- **`src/lib/auth/session.ts`:**
    - `SessionUser.demo: boolean`, from `claims.app_metadata?.demo === true`.
    - Add the demo gate. When the claims say demo, `requireUser` and `requireSection` check it before the role check: if `demoEnabled` is off, `getDemoInfo()` is null, or `expires_at <= now`, they `redirect('/demo/bitti')`.
    - Export a `demoGate()` helper for route handlers. Both PDF routes use it and return a 302 to `/demo/bitti`.
    - Every portal page calls `requireSection('portal')` itself and renders in parallel with the layout. With the gate there, an expired visitor whose `parcel_access` housekeeping has already deleted sees `/demo/bitti`, not a 403.
    - Update the existing tests.
- **`src/lib/demo/session.ts`:** `getDemoInfo()`, React-`cache`d, wrapping rpc `demo_info`.
- **`src/app/portal/layout.tsx`:** only picks the shell. For `user.demo` it renders `components/demo/demo-shell.tsx` instead of `SectionShell` + `PortalNav`, keeping the `.portal` print wrapper.
- **Shell:** brand and "Bahçelerim (örnek)"; no e-mail, no avatar.
- **Banner `components/demo/demo-banner.tsx` (`demo-banner`):**
    - Text: "Örnek bahçe · veriler ve görüntüler sentetik, konum temsilî · oturum HH:MM'ye kadar".
    - "Turu başlat".
    - "Gerçek hesap aç" (`demo-signup`): posts `exitDemoAction` with `next=/kayit`. On a non-demo host with sign-up off, `/iletisim` instead.
    - "Demodan çık" (`demo-exit`): `next=/`.
    - Styling: tokens `--color-info-soft` and `--color-info`; sticky; z-index 55; 16 px gutter; no horizontal scroll at phone width; a single short line on mobile.
    - Not `.noPrint`: printed pages carry it.
- **Other pages for demo users:**
    - `/` (`(site)/page.tsx`): put the demo branch before `defaultSection`. A demo user sees the landing; the header shows "Demoya dön" (`/portal`) and "Demodan çık".
    - `/kayit` and `/giris`: a demo user sees "Demodan çıkıp devam et". Skip `/kayit`'s signed-in redirect for demo users.
    - `src/lib/portal-billing/session.ts` `assertCustomer`: redirect a demo user to `/portal`.

### 4. Demo-safe portal
Real users must see no change. Every demo branch is keyed on `user.demo`.

- **Server actions:** each write action in `src/app/portal/parsel/[parcelId]/actions.ts` and `src/app/portal/billing-actions.ts` checks for a demo user first and returns "Demoda kapalı: gerçek hesabınızda …" through the existing error mechanism. Map `demo_read_only` the same way in `src/lib/portal/{questions,viewers,boundary}.ts`.
- **Components:** `question-threads.tsx`, `viewers-card.tsx` and `boundary-card.tsx` take a `demo` prop. With it, forms and buttons are replaced by `components/demo/demo-notice.tsx` (`demo-notice`); the read-only content stays.
- **Media (`src/lib/media/signer.ts` and callers):**
    - Add an option `publicMirror?: {orgId: string, baseUrl: string}`.
    - For URIs `storage://media/org/<orgId>/...`, return `<baseUrl>/storage/v1/object/public/demo-media/<path>` without signing. All other URIs are signed as before, with the user-id scope.
    - Pass it only for demo users, with `orgId` from `demo_info().org_id`. Do not use a shared signing scope.
    - The bytes are identical, so the tree card's hash check still passes.
    - `gezi/actions.ts` `signTourImagesAction`: for demo users, call `demo_hit('sign')` first and return an empty result with a note when it is false.
- **Tour viewer:** use the existing `data-loaded` and `data-image` attributes on `tour-viewer`. Add no new attribute.
- **PDFs (`src/lib/pdf/report-pdf.tsx`, `inventory-pdf.tsx`):**
    - Export `ReportDocument` and `InventoryDocument` and a `SampleWatermark` part. The documents include the watermark only with `{demo: true}`.
    - The watermark is a diagonal "ÖRNEK RAPOR – gerçek bir bahçeye ait değildir" on every page, with the footer "Sentetik demo verisi".
    - With `demo`, set the Document `subject` and `keywords` to the ASCII text `orchadOS ornek rapor (sentetik demo verisi)`. The Info dictionary is not compressed, so a byte search finds it; page text is compressed glyph ids and is not searchable.
    - Both routes, for demo users:
        1. Pass the gate.
        2. Call `demo_hit('pdf')`; false gives 429.
        3. Load the report under the user's RLS (`getParcelReport` / `loadInventoryReport`).
        4. Only if that returned data and the parcel id is in `demo_info().parcels`: read or fill `src/lib/demo/pdf-cache.ts`. It uses Next's data cache (`unstable_cache` from `next/cache`), keyed by kind, parcel id, latest published session id and dataset version, and stores base64. Skip caching above 1.9 MB.
        5. Respond with `Cache-Control: private, max-age=600` and header `X-Orchados-Sample: 1`.
    - Real users keep `private, no-store` and no cache.
    - Unit-test that the cache is never consulted before the RLS read or for a non-demo parcel.

### 5. Guided tour (no new dependency)
- **Files:**
    - `components/demo/guided-tour.tsx` (client, `guided-tour`)
    - `components/demo/demo.module.css`
    - steps in `src/lib/demo/tour-steps.ts`: `{id, href(ctx), targets: string[], title, body}`, with `ctx` = `demo_info().tour`
    - texts in `demoText.tour`
- **Steps:**

  | # | id | Page | Targets |
  | --- | --- | --- | --- |
  | 1 | `bahceler` | `/portal` | `parcel-list` |
  | 2 | `gezi` | `/portal/parsel/{parcel}/gezi` | `tour-viewer`, `tour-visit` |
  | 3 | `harita` | `/portal/parsel/{parcel}?katman=isi` | `parcel-map`, `map-controls` |
  | 4 | `karne` | parcel page | `health-score`, `dimensions` |
  | 5 | `bulgular` | parcel page | `findings` |
  | 6 | `agac` | `/portal/parsel/{parcel}/agac/{tree}` | `tree-card`, `photo-evidence`, `hash-check` |
  | 7 | `ziyaret` | `/portal/parsel/{parcel}?ziyaret={previous_session}` | `visit-select`, `report-summary` |
  | 8 | `envanter` | `/portal/parsel/{parcel}/envanter` | `inventory-report` |
  | 9 | `pdf` | parcel page | `report-pdf` |
  | 10 | `son` | any page | closing card: "Gerçek hesap aç" / "Paketleri gör" (to `mainSiteUrl` on a demo host) |

- **Mechanics:**
    - The step lives in the URL (`tur`); navigate with `router.push`.
    - Find targets with `querySelector`, then `scrollIntoView({block: 'center'})`, and outline them with the focus colour.
    - The card is non-modal: next to the target on desktop, a bottom sheet on mobile. Tokens `--color-surface`, `--radius-lg`, `--shadow-lg`; z-index 60.
    - Controls `tour-prev`, `tour-next` and `tour-close`, and a counter "3 / 10".
    - Esc closes; arrow keys step; `aria-live='polite'`.
    - A step with missing targets is skipped. The card hides while the viewer is fullscreen.
    - The closed state is kept in `sessionStorage`, inside try/catch.
    - "Turu başlat" restarts from step 1.

### 6. Tests
- **Unit (Vitest):**
    - flag off: no demo link in header, landing or login
    - `demoUrl` and `mainSiteUrl` resolution
    - `demoHostRedirect`
    - `public-paths`
    - `tour-steps`: unique ids, every step has targets and an href
    - `demoText` shape
    - `SampleWatermark` is present in both documents only with `demo`, and the `subject`/`keywords` are set
    - the PDF cache guard
    - the session gate (expired, null info, flag off → redirect; real users untouched)
    - `/demo/bitti` and `exitDemoAction` do not sign out a real user
    - `exitDemoAction` `next` allowlist
- **Integration:**
    - `apps/web/tests/integration/demo-portal.test.ts`, with helper `demo-fixture.ts` copying `portal-fixture.ts`. Build a small published fixture: org, parcel, session, assets, finding, question.
        1. `const prev = await registerDemoOrg(...)`, then `purgeDemoAttempts()`.
        2. `requestDemoStart` with `clientIp` `198.51.100.50`, then `verifyOtp`.
        3. `listPortalParcels`, `getParcelReport`, `getTreeCard` and `loadInventoryReport` return data.
        4. The write helpers yield the demo-closed result.
        5. The signer returns `demo-media` public URLs for the demo org.
        6. Clean up and re-register `prev`.
    - `apps/web/tests/integration/demo-dataset.test.ts`: skipped unless B's org `de000000-0000-4000-8000-000000000001` is registered. Start a demo against it, then assert on parcel A's `getParcelReport(...).dimensions`:
        - `structure.male > 0`, `structure.female > 0`, `structure.ungrafted > 0`
        - `care.sprouts` not null
        - `pests` not null
        - `fruitLoad.previousYear` not null and `fruitLoad.trend === 'lower'`
        - the score compares against the same season
        - `loadInventoryReport` for A is approved and shows panoramas
- **E2E (Playwright), `apps/web/tests/e2e/demo-tour.spec.ts`:**
    - **Global setup:** keep the existing office-dev-data step, then run `pnpm db:demo-tour --profile test --reset-local` from the repo root. Locally without uv, warn and skip the demo specs; with `process.env.CI`, fail hard.
    - **Config:** add `ORCHADOS_DEMO_ENABLED: '1'` to `playwright.config.ts` `webServer.env`; no `ORCHADOS_MAIN_SITE_URL`. Call `purgeDemoAttempts()` before each start.
    - **Scenario:**
        1. landing → `landing-demo` → `/demo` → `demo-start` → `/portal` with `demo-banner`
        2. no `PortalNav`
        3. all 10 guided steps (URL and targets)
        4. gezi: `tour-viewer` has `data-loaded='true'` and `data-image` not `placeholder`, and a request went to `/storage/v1/object/public/demo-media/`
        5. tree S3-6: the hash check passes
        6. the karne `dimensions` block shows the pest and fruit-load rows
        7. both PDF routes return 200 `application/pdf` with header `X-Orchados-Sample: 1`, and the body bytes contain `orchadOS ornek rapor`
        8. no question, invite or approve form; `demo-notice` is visible
        9. expiry: `ageDemoSessions` + `runDemoHousekeeping` → a reload of a parcel page lands on `/demo?bitti=1` (not 403), and a PDF route answers 302 to `/demo/bitti`
        10. start again, then `demo-exit` → landing; `/portal` → `/giris?next=`
        11. sign in as the seed owner, GET `/demo/bitti` → still signed in
        12. mobile 390×844: banner and bottom sheet visible, no horizontal scroll
    - **`site-pages.spec.ts`:** add `/demo` and the header link.
    - Existing specs stay green.
- **CI, `.github/workflows/ci-db-web.yml`:**
    - Add `services/pipeline/**` to the trigger paths.
    - After build and before "Unit and integration tests":
        - `astral-sh/setup-uv@v6` with cache and `uv sync --locked` in `services/pipeline`
        - `actions/cache` for `services/pipeline/.demo-build`, keyed on `hashFiles('services/pipeline/src/orchados_pipeline/demo/**', 'services/pipeline/uv.lock')`
        - `actions/cache` for `apps/web/.dev-data/e2e`, keyed on the pipeline sources and `apps/web/scripts/office-dev-data.mjs`
        - a step running `pnpm db:demo-tour --profile test --reset-local`, so `demo-dataset.test.ts` runs
    - Installing uv un-skips `office-tool.spec.ts`, which then runs pipeline synth + run in this job for the first time. Make sure it passes.
    - Raise `timeout-minutes` to 45.

### 7. Docs (Turkish)
- **`docs/deployment.md`:** a "Demo turu (İP13)" section:
    - the demo Supabase project and the Vercel project `orchados-demo` at `demo.<alan adı>`, with env `ORCHADOS_DEMO_ENABLED=1`, `ORCHADOS_MAIN_SITE_URL`, its own `NEXT_PUBLIC_SUPABASE_*`, live Turnstile keys and no indexing
    - the pilot site's `ORCHADOS_DEMO_URL`
    - hosted Auth on test, demo and pilot: 'Confirm phone', 'Confirm email' and 'Secure email change' ON. Note that local stays off, which is why the database lockdown must not rely on them.
    - sign-ups and anonymous sign-ins stay off
    - Edge secrets including `ORCHADOS_DEMO_MODE` (`dev` for the short test smoke, `public` on the demo project; never on pilot)
    - Vault `demo_cleanup_url`
    - the `deploy-db-demo` and `demo-data` workflows (load, then enable)
    - the pilot and demo checks A added
    - spend cap and usage alert
    - log retention of Supabase, Vercel and Edge as currently documented by the providers
    - the smoke checklist and rollback SQL from doc §15
- **`docs/plan.md`:** İP13 row (P1, ~7 days, link to `docs/demo-turu.md`), Gantt and status.
- **`docs/kullanim-kilavuzu.md`:** a "Demo" section.
- **`docs/MVP.md`:** one line.
- **`apps/web/README.md`:** flags, demo host, and the local run (`pnpm db:demo-tour`, then `pnpm web:dev` with `ORCHADOS_DEMO_ENABLED=1`).
- **`docs/demo-turu.md`:** append a final "Uygulama notları" section listing deviations of A, B and C. Do not rewrite earlier sections.

## Files you own
- `apps/web/src/**`, except `src/lib/database.types.ts` and `src/lib/demo/demo-shared.test.ts`
- `apps/web/tests/e2e/**`
- `apps/web/tests/integration/demo-portal.test.ts`, `demo-dataset.test.ts`, `demo-fixture.ts`
- `apps/web/playwright.config.ts`, `apps/web/next.config.ts` (only if needed), `apps/web/README.md`, `apps/web/.env.example`
- `.github/workflows/ci-db-web.yml`
- `docs/deployment.md`, `docs/plan.md`, `docs/kullanim-kilavuzu.md`, `docs/MVP.md`, `docs/demo-turu.md` (append only)

Do not touch:
- `supabase/**`, `services/**`
- `apps/web/src/lib/database.types.ts`, `apps/web/tests/local-db.ts`, `apps/web/tests/integration/demo-start.test.ts`
- `apps/web/package.json`, `pnpm-lock.yaml`, root `package.json`
- `demo-data.yml`, `deploy-db*.yml`, `ci-pipeline.yml`
- `CLAUDE.md`

If you need a database or Edge change, do not make it; describe it in the PR under "Sapmalar / takip".

## Commands
From the repo root:
- `pnpm install`
- `pnpm db:start`
- `pnpm db:reset`
- `pnpm db:demo-tour --profile test --reset-local`
- `pnpm web:lint`
- `pnpm web:test`
- `pnpm web:build`
- `pnpm --filter web exec playwright install --with-deps chromium`
- `pnpm db:reset && pnpm web:e2e`
- `pnpm db:test`

## Acceptance criteria
- `pnpm web:lint`, `pnpm web:test`, `pnpm web:build` and `pnpm web:e2e` are green, including `demo-tour.spec.ts` with real synthetic media (not the placeholder, hash check passing) and `office-tool.spec.ts`. `pnpm db:test` is still green. CI `ci-db-web` is green within 45 minutes.
- **Flag off:**
    - no demo link anywhere unless `ORCHADOS_DEMO_URL` is set
    - `/demo` is 404 and `startDemoAction` refuses
    - existing demo sessions end through `/demo/bitti`
- **Demo user:**
    - the banner is on every portal page, including print
    - no billing nav, question forms, invite or cancel controls, or approve button
    - both PDFs are watermarked and detectable
    - media comes from `demo-media`
    - all 10 guided steps work on desktop and mobile
    - expiry always lands on `/demo?bitti=1`, never a 403
    - "Demodan çık" and "Gerçek hesap aç" end the demo session
- **Demo host:** non-demo pages redirect to the main site.
- **Real users:** nothing changes for real owners, viewers or customers. `/demo/bitti` never signs them out. Their tests pass.
- No new dependency. No analytics. No e-mail shown in the demo shell.

## Process
- Work autonomously and ask no questions. Where the doc leaves a choice, take the simplest consistent option, and list each deviation in the PR.
- Commit in logical steps. End commit messages and the PR body with the attribution lines your environment specifies.
- Before opening the PR: `git fetch origin` and integrate the latest `origin/main`. Rebase if you have not pushed yet, otherwise merge. Never force-push, never push to main, never merge.
- If Docker or local Supabase will not start: run unit tests, lint and build, open the PR, and say that CI must validate.
- `gh pr` is blocked by the proxy. Open the PR with:

  ```
  gh api repos/yusuftiryaki/orchadOS/pulls -X POST -f title='İP13-C: demo arayüzü (demo sunucusu, oturum kapısı, rehberli tur, uçtan uca test)' -f head='claude/ip13-demo-arayuz' -f base='main' -F body=@<file>
  ```

  Write the description in Turkish with these headings:
    - Özet
    - Ekranlar
    - Korumalar (UI, oturum kapısı)
    - Testler
    - Sapmalar / takip
    - Dağıtım (demo project, flags, Auth settings, Vault, workflows, smoke list)
    - İnsan eylemi

