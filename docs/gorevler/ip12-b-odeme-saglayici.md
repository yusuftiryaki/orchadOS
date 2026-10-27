# İP12-B Ödeme sağlayıcı katmanı (iyzico + sahte) ve ödeme Edge Function'ları

> **Orchestrator notes (27 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip12-b-odeme-saglayici.md`. Wave 1. Design: `docs/musteri-yonetimi.md`.

1. **Base branch.** The design doc and these task files live on `docs/ip12-musteri-yonetimi` (PR #52), which may not be merged to main yet. Wherever the brief says to branch from, rebase on, or read the design doc from `origin/main`, use `origin/docs/ip12-musteri-yonetimi` instead. If PR #52 is already merged, `origin/main` is fine. Do not stop because the doc is missing on main.
2. **No dependencies.** You run in parallel with the other wave-1 streams.
3. **Branch.** Push to `claude/ip12-odeme-saglayici`. If the session forces a different branch name, use it and state it in the PR and in your final message.
4. **PR.** Open a PR against `main` through the REST API (`gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...`; see `docs/gorevler/README.md` §9). Write the description in Turkish and mention the PRs you depend on. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice open, pick the recommended or most conservative option and list it in the PR.
6. **Time.** Run only the test suites that matter for your stream. Do not run the Python pipeline suite (11 min). Run commands longer than 10 min in the background.
7. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any departure from the design doc contracts, and open follow-ups.

---

BRANCH = `claude/ip12-odeme-saglayici`. Wave 1, in parallel with İP12-A1 and İP12-C.

- İP12-A1 owns `supabase/config.toml` and writes your function blocks and secrets there: `verify_jwt = false` for `payments`, `payment-callback` and `payment-webhook`, plus `PAYMENT_*`, `FAKE_WEBHOOK_SECRET` and `ORCHADOS_CRON_SECRET`. Do not touch that file.
- The `payment_*` database functions are built in wave 2 by İP12-A2, against your `db.ts`. Write against design §6.9 and §8. Unit-test everything with mocked fetch.

## Working rules (all İP12 streams)
- **Design doc.** The design is `docs/musteri-yonetimi.md` on main and is the source of truth.
  - If it is missing on `origin/main`: make an empty commit, push, open a draft PR `BLOCKED: docs/musteri-yonetimi.md missing on main`, and stop.
  - Do not edit it.
- **Repo and branch.** Repo `github.com/yusuftiryaki/orchadOS`. Branch from the latest `origin/main` (or the assigned `claude/...` branch). Rebase on main before the PR.
- **Read first:** `CLAUDE.md`, the design doc (§5.4, §5.5, §6.9 payment_*, §8, §13, §14, §15), `docs/deployment.md`, `apps/web/AGENTS.md`.
  - Next.js 16: read `apps/web/node_modules/next/dist/docs/` before writing Next code.
  - Study `supabase/functions/invite-user/index.ts` (caller check via `/auth/v1/user`), `send-notifications/index.ts`, `_shared/providers.ts` (which does `import type { Channel } from "./messaging.ts"`) and `apps/web/src/lib/notifications/messaging.test.ts` (relative import from web Vitest).
- **Language.** Code, identifiers, comments and commits are in English. Docs and UI text are in Turkish.
- **PCI and KVKK.** Card data never touches our code. Buyer PII exists only in memory between `payment_begin` and the iyzico request. Never log it, never store it (use `safePayload`). Errors are reason codes.
- **No dependencies, no iyzipay SDK.** Use fetch with IYZWSv2 via `crypto.subtle`, so the code runs in Deno and in Node 22.
  - `_shared/payments/*` uses no Deno APIs and only relative imports with `.ts` extensions.
  - Add exactly one line to `apps/web/tsconfig.json`: `"allowImportingTsExtensions": true` (`noEmit` is already true). Without it, web tsc fails with TS5097 once tests import these files.
- Do not ask questions; write the decisions in the PR. Never touch mustNotTouch paths.
- **Setup:** `cat /tmp/orchados-session-start.log; docker info; pnpm install; pnpm db:start && pnpm db:reset`. Use `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` if pulls fail.
- **Fallback** if Docker or Supabase will not start: run `pnpm web:lint && pnpm web:build && pnpm --filter web test:unit`, open the PR anyway, watch `ci-db-web` via `gh api repos/yusuftiryaki/orchadOS/actions/runs?branch=BRANCH` until green, and note in Test özeti what did not run.
- **CI order** when Docker works: `pnpm db:reset && pnpm db:test && pnpm web:typegen && git diff --exit-code apps/web/src/lib/database.types.ts && pnpm web:lint && pnpm web:build && pnpm web:test && pnpm db:test && pnpm db:reset && pnpm web:e2e && pnpm db:test`. Also type-check the functions with `deno check` if available, or `supabase functions serve`, and say which.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **PR** via `gh api repos/yusuftiryaki/orchadOS/pulls -f title='...' -f head=BRANCH -f base=main -F body=@pr-body.md`. Turkish body with: Ne yapıldı, Kararlar, Test özeti, Eksikler / bilinen sorunlar, Sözleşmeden sapmalar, Sandbox'ta doğrulanacaklar. Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Scope

1. **`supabase/functions/_shared/payments/`:**
   - `types.ts`: exactly §8.2, including `providerAmountKurus` in `ConfirmResult`.
   - `provider.ts`: `choosePaymentProvider(id, env, fetchImpl?)`, which returns null when the id is empty or unknown.
   - `money.ts`:
     - `priceToKurus`: exact decimal parse. Regex `^\d+(\.\d{1,4})?$`; any non-zero digit after the second decimal → null. `'10.5100'` → 1051, `'0.285'` → null, `'1e3'` → null.
     - `kurusToPrice`
     - `normalizePriceForSignature`
   - `iyzico-auth.ts`: `iyzicoHeaders(apiKey, secret, uriPath, body, rnd?)`.
   - `iyzico-signatures.ts`: initialize, retrieve, refund and webhook V3 signatures per §8.3, plus `timingSafeEqual` (HMAC both values, then compare).
   - `iyzico.ts`: the adapter, per §8.3, with a 15 s timeout and `iyzico_<errorCode>` mapping. On a refund timeout, read `/payment/detail`.
   - `acceptance.ts`: the rules in §8.5. Compare against the PAYMENT row (`amountKurus`, `paymentId`, `orderId` in `ConfirmExpectation`). SUCCESS with a mismatch → `pending_review` with `amount_mismatch` / `reference_mismatch` and `providerAmountKurus` set. Never `failed` in that case.
   - `fake.ts`: §8.6.
   - `payload.ts`: `safePayload`, keeping only the allowlist fields.
   - `origins.ts`: `isAllowedReturnOrigin(origin, list, allowPreview)`.
     - Compare `URL.origin` exactly; reject a path or a hash.
     - Require https, except `127.0.0.1` and `localhost`.
     - Accept a `*` pattern only when `allowPreview`, and `*` matches only `[a-z0-9-]+`.
   - `db.ts`: typed wrappers over `${SUPABASE_URL}/rest/v1/rpc/<fn>` with the service role, for `payment_begin` (no `p_ip_hash`), `payment_attach_token`, `payment_by_token` (array → first element or null), `payment_record_event`, `payment_finalize` (`p_result` keys exactly §6.9, including `provider_amount_kurus`), `payment_attempts_to_reconcile`, `payment_refund_claim` and `payment_refund_report`, plus `ops_can_process_refund` with the caller JWT.
     - Export the expected jsonb key lists as constants (`PAYMENT_BEGIN_KEYS`, `REFUND_CLAIM_KEYS`). A2 asserts the database against them.
     - Map PostgREST `{code, message}` to reason codes.
2. **`payments/index.ts`** (`verify_jwt` is false; authenticate in code):
   - `start` and `refund` validate the user via `/auth/v1/user`.
   - `reconcile` checks the `x-orchados-cron-secret` header against `ORCHADOS_CRON_SECRET` with `timingSafeEqual`.
   - Request and response JSON and status mapping exactly as §8.4.
   - Return origin via `origins.ts`, with `PAYMENT_ALLOW_PREVIEW_ORIGINS` read from env.
   - The body's `client_ip` is used only as `buyer.ip`.
   - Record one event per provider call. Dedup keys: `init:<payment_id>`, `retrieve:<token>:<status>`, `refund:<refund_id>:<attempt>`.
   - Reconcile expires an attempt only when `not_completed` and the token expired more than 5 minutes ago.
3. **`payment-callback/index.ts`:**
   - Accept a form-urlencoded or JSON body.
   - `payment_by_token`; choose the adapter from the row.
   - If `provider = 'fake'` and not (`PAYMENT_PROVIDER === 'fake'` and `PAYMENT_FAKE_ALLOWED === '1'`): 303 to `?hata=odeme_bulunamadi`, write nothing.
   - `confirm`; `not_completed` → `failed` with `not_completed`; `payment_finalize`; 303 to `<return_origin>/portal/odeme/<id>`.
   - An unknown token → 303 to `${PORTAL_BASE_URL}/portal/odeme?hata=odeme_bulunamadi` with no event row.
4. **`payment-webhook/index.ts`:**
   - `req.text()`, then `verifyWebhook`.
   - An invalid signature → 401, log only the reason code, and write NOTHING to the database.
   - A valid signature → record the event; if it is a duplicate, 200.
   - Otherwise `confirm` and `payment_finalize`, then 200.
   - Apply the same fake guard as the callback.
5. **Fake checkout page** `apps/web/src/app/odeme/sahte/page.tsx`.
   - `notFound()` unless `PAYMENT_FAKE_CHECKOUT === '1'`.
   - Shows the amount and three submit buttons: 'Ödemeyi onayla' (`success`), 'Kart reddedildi' (`failure'`), 'İncelemeye düşür' (`review`).
   - A plain form posting `token` and `outcome` to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payment-callback`.
   - Strings in `messages/fake-checkout.ts` (`fakeCheckoutText`).
6. **Deploy workflows.**
   - Make sure `deploy-db*.yml` deploys every function.
   - In `deploy-db-pilot.yml`, add a step that fails when `supabase secrets list` shows `PAYMENT_FAKE_ALLOWED`, or when `accepts_signups` is on and `TURNSTILE_SECRET_KEY` is absent.
   - Also add a DB check failing on any `org_billing_setting.allow_fake_payments = true`. Tolerate a missing table with `to_regclass`. If a SQL query is not feasible with the CLI there, implement the secrets check and document the DB check as a manual step.
7. **Unit tests** in `apps/web/src/lib/payments/*.test.ts`, importing `../../../../../supabase/functions/_shared/payments/*.ts`. No network:
   - an IYZWSv2 fixed vector
   - every signature, including normalisation and tampering
   - webhook V3: valid, invalid, missing header
   - the client with `vi.stubGlobal('fetch')`
   - acceptance: fraud -1, 0 and 1, and the SUCCESS + mismatch → `pending_review` case
   - money: `'10.5100'`, `'0.285'`, `'1e3'`
   - origins: `evil.com#.vercel.app`, `orchados-a.b-orchad-os.vercel.app`, `http://` outside localhost, a glob without the preview flag
   - `safePayload` drops PII
   - the fake provider
   - `db.ts` request bodies
   - the reconcile secret compare
8. **`docs/deployment.md`**, Turkish section 'Ödeme (İP12)':
   - the secrets in §13 and `supabase secrets set`
   - Vault `payments_reconcile_url` and `orchados_cron_secret`
   - the iyzico panel: callback and webhook URLs, V3 via entegrasyon@iyzico.com, disable bank transfer inside the Checkout Form, the written confirmation of the placeholder `identityNumber`
   - the fake locks: never on the pilot; the test project needs both env flags and a SQL `allow_fake_payments`
   - the preview origins flag only on test
   - the Turnstile gate
   - the manual sandbox checklist from §14

## Contracts
- **You consume** the §6.9 `payment_*` and `ops_can_process_refund` signatures exactly.
- **You provide:**
  - the §8.4 JSON
  - `db.ts` and the key constants
  - `/odeme/sahte`
  - the web call: `supabase.functions.invoke('payments', { body: { action: 'start', order_id, return_origin, client_ip } })`

## Acceptance criteria
- CI is green, including web tsc with `allowImportingTsExtensions`.
- Every scope-7 case is unit-tested.
- No PII is logged or stored.
- Invalid webhooks write nothing.
- Fake payments are impossible unless both env flags are set.
- The PR lists the assumptions to confirm in the sandbox.
