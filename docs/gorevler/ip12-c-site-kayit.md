# İP12-C Herkese açık site, kayıt arayüzü, giriş bağlantısı ve müşteri rol bayrağı

> **Orchestrator notes (27 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip12-c-site-kayit.md`. Wave 1. Design: `docs/musteri-yonetimi.md`.

1. **Base branch.** The design doc and these task files live on `docs/ip12-musteri-yonetimi` (PR #52), which may not be merged to main yet. Wherever the brief says to branch from, rebase on, or read the design doc from `origin/main`, use `origin/docs/ip12-musteri-yonetimi` instead. If PR #52 is already merged, `origin/main` is fine. Do not stop because the doc is missing on main.
2. **No dependencies.** You run in parallel with the other wave-1 streams.
3. **Branch.** Push to `claude/ip12-site-kayit`. If the session forces a different branch name, use it and state it in the PR and in your final message.
4. **PR.** Open a PR against `main` through the REST API (`gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...`; see `docs/gorevler/README.md` §9). Write the description in Turkish and mention the PRs you depend on. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice open, pick the recommended or most conservative option and list it in the PR.
6. **Time.** Run only the test suites that matter for your stream. Do not run the Python pipeline suite (11 min). Run commands longer than 10 min in the background.
7. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any departure from the design doc contracts, and open follow-ups.

---

BRANCH = `claude/ip12-site-kayit`. Wave 1, in parallel with İP12-A1 (database and the `customer-signup` Edge Function) and İP12-B (payments).

Do not depend on anything that is not on main, except calling `customer-signup` untyped through `supabase.functions.invoke`, with the exact JSON in design §7. Treat a 404 or 5xx as `signup_unavailable`. The end-to-end sign-up test is İP12-D's job.

## Working rules (all İP12 streams)
- **Design doc.** The design is `docs/musteri-yonetimi.md` on main and is the source of truth.
  - If it is missing on `origin/main`: make an empty commit, push, open a draft PR `BLOCKED: docs/musteri-yonetimi.md missing on main`, and stop.
  - Do not edit it.
- **Repo and branch.** Repo `github.com/yusuftiryaki/orchadOS`. Branch from the latest `origin/main` (or the assigned `claude/...` branch). Rebase before the PR.
- **Read first:** `CLAUDE.md`, the design doc (§1–§4, §7, §9, §13–§15), `apps/web/AGENTS.md`, `apps/web/README.md`.
  - Next.js 16.4: read `apps/web/node_modules/next/dist/docs/01-app/` on route groups, layouts, proxy, metadata routes and `forbidden`. Middleware is `src/proxy.ts`.
  - Study `src/app/giris/*` (two-step `useActionState`, phone OTP, `login-methods.ts` and `safeNextPath`), `src/lib/auth/*`, `src/lib/supabase/proxy.ts`, `section-shell.tsx`, the `globals.css` tokens, `components/brand/logo.tsx`, `src/lib/operations/validation.ts` and `docs/MVP.md`.
- **Language.** Code, identifiers, comments and commits are in English. UI text and docs are in Turkish.
- **Privacy.** Never log form values. Never put a phone number in a URL.
- **No dependencies.** No Tailwind. CSS Modules with the existing tokens; mobile-first with a 16 px gutter; no images.
- **Strings.** Never touch `tr.ts`. Strings go in `messages/site.ts` (`siteText`) and `messages/legal.ts`.
- Do not ask questions; write the decisions in the PR. Never touch mustNotTouch paths.
- **Setup:** `cat /tmp/orchados-session-start.log; docker info; pnpm install; pnpm db:start && pnpm db:reset; pnpm --filter web exec playwright install --with-deps chromium`. Use `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` if pulls fail.
- **Fallback** if Docker, Supabase or Playwright will not start: run `pnpm web:lint && pnpm web:build && pnpm --filter web test:unit`, open the PR anyway, watch `ci-db-web` via `gh api repos/yusuftiryaki/orchadOS/actions/runs?branch=BRANCH` until green, and note in Test özeti what did not run.
- **CI order:** `pnpm db:reset && pnpm db:test && pnpm web:typegen && git diff --exit-code apps/web/src/lib/database.types.ts && pnpm web:lint && pnpm web:build && pnpm web:test && pnpm db:test && pnpm db:reset && pnpm web:e2e && pnpm db:test`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **PR** via `gh api repos/yusuftiryaki/orchadOS/pulls -f title='...' -f head=BRANCH -f base=main -F body=@pr-body.md`. Turkish body with: Ne yapıldı, Kararlar, Test özeti, Eksikler / bilinen sorunlar, Sözleşmeden sapmalar. Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Scope

1. **Flags.** `src/lib/flags.ts` (server only): `siteFlags(): { signupEnabled; paymentsEnabled; indexable; siteUrl; turnstileSiteKey: string | null }`, read from `ORCHADOS_SIGNUP_ENABLED`, `ORCHADOS_PAYMENTS_ENABLED`, `ORCHADOS_SITE_INDEXABLE`, `ORCHADOS_SITE_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
2. **Proxy.** `src/lib/site/public-paths.ts` `isPublicPath(path)` per §9.
   - Exact match `/`.
   - Prefixes (`p` or `p + '/'`): `/giris`, `/kayit`, `/nasil-calisir`, `/paketler`, `/sss`, `/iletisim`, `/kvkk`, `/acik-riza`, `/gizlilik`, `/mesafeli-satis`, `/on-bilgilendirme`, `/iade`, `/robots.txt`, `/sitemap.xml`.
   - Use it in `src/lib/supabase/proxy.ts`. Unit test it.
3. **Roles.**
   - `UserRoles` gains `customer: boolean`.
   - `SECTION_ACCESS` rules gain an optional `customer?: true`; portal gets `customer: true`; `canAccessSection` honours it.
   - `loadUserRoles` adds `rpc('my_owner_profile')`: customer means at least one row.
   - Update `roles.test.ts` and every place that builds a `UserRoles`.
   - Update `tests/integration/sections.test.ts`: the ops expectation becomes `{ orgRoles: ['ops'], parcelRoles: [], customer: false }`. Assert `customer === true` for owner and viewer (both have a seed `owner_profile`) and false for field and expert. Do not touch `fixtures.ts`.
4. **Site.**
   - Route group `src/app/(site)/` with a `layout.tsx` (SiteHeader + SiteFooter). Move `src/app/page.tsx` to `(site)/page.tsx`.
   - Pages per §9.1, with Turkish copy consistent with `docs/MVP.md`: independence, expert signature, 'AI hastalık teşhisi koymaz', 'Tapu ya da mülkiyet sınırı iddiası taşımaz', the out-of-scope list.
   - Components in `src/components/site/`.
   - Header: Giriş / Kayıt ol (Kayıt only when `signupEnabled`); Hesabım / Çıkış when signed in.
   - Footer: legal links and `[...]` placeholders.
   - Metadata with the template `%s · orchadOS`.
   - `robots.ts` and `sitemap.ts`: disallow unless `indexable`.
5. **`/` behaviour** (§9):
   - Signed out → landing.
   - Default section → redirect.
   - Otherwise invoke `customer-signup` `{action:'complete'}`: `completed` → `/portal`; 403 `phone_not_verified` → a card linking to `/kayit/dogrula`; anything else → today's `noRoles` card.
6. **`/paketler`.** `src/lib/site/packages.ts` with this exact contract:
   - `export interface PublicPackage { packageId: string; code: string; name: string; description: string | null; periodicVisitsPerYear: number; includesInventory: boolean; priceListVersion: number; validFrom: string; currency: string; vatRateBp: number; unitPriceKurus: number; minimumFeeKurus: number; inventoryFeeKurus: number }`
   - `export async function loadPublicPackages(supabase: Client): Promise<PublicPackage[]>` returning `[]`, with a comment that İP12-D wires it.
   - The page explains the model. When the list is empty, show 'Fiyatlar teklif ile belirlenir'.
   - `src/lib/site/format.ts` `formatTry(kurus)`.
7. **Sign-up** (§7 web flow):
   - `src/lib/signup/validation.ts` `parseSignupForm(read)`:
     - `full_name`: 2–120 characters
     - phone via `normalizePhone`, which must match `^\+905[0-9]{9}$` (Turkish mobile only)
     - e-mail
     - password: ≥ 8 characters, repeated and matching
     - `contact_preference`
     - KVKK checkbox required
     - two optional consents, unchecked: `explicit_service_improvement`, `explicit_marketing`. There is NO AI-transfer consent (design §2).
   - `src/lib/signup/client.ts`: `registerCustomer(supabase, input, clientIp, captchaToken)` and `completeSignup(supabase)`.
     - Send header `x-orchados-proxy-secret: process.env.SIGNUP_PROXY_SECRET` (server only).
     - Map statuses to `SignupError = 'invalid_input' | 'captcha_failed' | 'email_taken' | 'phone_registered' | 'too_many_attempts' | 'signup_closed' | 'signup_unavailable' | 'phone_not_verified' | 'failed'`.
   - `/kayit`: signed in → `/`; flag off → 'Kayıt yakında'. Otherwise a two-step form in one `useActionState`, like the login phone method.
     - Step 1: the fields, links to `/kvkk` and `/acik-riza`, the versions from `src/lib/legal/versions.ts`, and the Turnstile widget when a site key is set (script `https://challenges.cloudflare.com/turnstile/v0/api.js`).
     - On success: `rpc('phone_login_allowed')` and `signInWithOtp({ phone, options: { shouldCreateUser: false, channel: 'sms' } })`.
     - Step 2: a 6-digit code → `verifyOtp` (on failure, `phone_login_record_failure`) → `completeSignup` → `/portal` (or `/`).
     - Step 2 text: 'Bu numarayla hesabınız varsa giriş yapmış olursunuz; izin tercihlerinizi Hesabım › İzinler'den değiştirebilirsiniz.'
     - `phone_registered` message: 'Bu numara kayıtlı. Giriş sayfasından girin; giremiyorsanız bize yazın.'
     - Resend after 60 s.
   - `/kayit/dogrula`: for a signed-in user with an unconfirmed phone.
8. **Login page.** When `signupEnabled`, add 'Hesabınız yok mu? Kayıt olun' (from `siteText`).
9. **Legal.**
   - `src/lib/legal/versions.ts` exactly as §9.
   - Pages render from TS content, with a draft banner when the version ends in `-taslak`.
   - In `docs/hukuk/`:
     - Extend the EXISTING `hizmet-sozlesmesi-taslagi.md` with the mesafeli hizmet and cayma hakkı clauses, missed-visit refunds and auto-renewal. Do not create an overlapping contract file. `/mesafeli-satis` renders from it.
     - Add `on-bilgilendirme-formu-taslagi.md`, `iptal-iade-politikasi-taslagi.md` and `gizlilik-cerez-politikasi-taslagi.md`.
     - Update the README file list and the lawyer questions.
     - In `kvkk-aydinlatma-metni.md`, add iyzico (ad, soyad, telefon, e-posta, adres, IP; TCKN only if required) and the bank to the transfer table, and payment records to the retention table.
     - In `acik-riza-metni.md`, mark item 1 (AI transfer) as 'İP12'de sorulmaz; hukuki dayanak avukat kararı (README soru 2)'. `/acik-riza` shows only the two remaining items.
10. **Env.**
    - Add `ORCHADOS_SIGNUP_ENABLED`, `ORCHADOS_PAYMENTS_ENABLED`, `PAYMENT_FAKE_CHECKOUT`, `ORCHADOS_SITE_INDEXABLE`, `ORCHADOS_SITE_URL`, `SIGNUP_PROXY_SECRET` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to `.env.example` and the README table (Turkish), plus a README section 'Site ve kayıt'.
    - `playwright.config.ts` `webServer.env`: `ORCHADOS_SIGNUP_ENABLED: '1'`, `ORCHADOS_PAYMENTS_ENABLED: '1'`, `PAYMENT_FAKE_CHECKOUT: '1'`, `SIGNUP_PROXY_SECRET: 'signup-proxy-local'` (it must equal the value A1 writes in `config.toml`).
11. **Tests.**
    - Unit:
      - public paths, roles, signup parser (a non-TR phone is rejected), client error mapping, `LEGAL_TEXT_VERSIONS`
      - flag-off rendering with `renderToStaticMarkup`: the header and the login footer show no sign-up link, and `/kayit` content shows the closed card. This is how the flag-off acceptance is verified, because e2e runs with the flag on.
    - E2E `site-pages.spec.ts`:
      - every public page returns 200 signed out, with its h1
      - header and footer links work
      - `/portal` redirects to `/giris?next=%2Fportal`
      - seed users land on their sections (`app.spec.ts` stays green)
      - `/kayit` shows server-side field errors for an empty submit and for a missing KVKK box
      - the login page shows the sign-up link
      - no test needs the `customer-signup` function

## Contracts
- **You consume:** the `customer-signup` JSON (§7), `my_owner_profile`, `phone_login_allowed`, `phone_login_record_failure`.
- **You provide:** `isPublicPath`, `UserRoles.customer`, `siteFlags`, `LEGAL_TEXT_VERSIONS`, `PublicPackage` / `loadPublicPackages`, `siteText`, the `(site)` layout and components.

## Acceptance criteria
- CI is green.
- Signed-out visitors reach only the public pages.
- Seed users' landing and nav are unchanged.
- The flag-off behaviour is verified by unit tests.
- The pages look clean at 375 px and 1280 px.
- No form value or phone number is logged or put in a URL.
