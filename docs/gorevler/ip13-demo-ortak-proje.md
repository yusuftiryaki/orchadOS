# İP13: Host the demo temporarily on the test Supabase project (shared-host mode)

## Background
`provision-demo` (#77) failed to create the `orchados-demo` Supabase project: "2 project limit" on the free plan. Both slots are taken by the test and pilot projects. **User decision (28 Oct):** until the Supabase organization moves to Pro, the demo runs on the **test project** (`SUPABASE_PROJECT_REF`). The test project has no real customer data. The Vercel side stays a separate project, `orchados-demo` (https://orchados-demo.vercel.app). The pilot project must never host the demo, and its lock in `deploy-db-pilot` stays exactly as it is.

## Hard constraints
1. **The test site must keep working.** That is the Vercel project `orchados` → https://orchados.vercel.app, which already points at the test project. Sign-up, phone login, notifications, payments (fake provider) and ops flows must behave as before. Do **not** overwrite test-project settings that the test site relies on:
   - Auth `site_url`. Add the demo origin to the additional redirect URLs instead.
   - Edge secrets the test site uses: `MESSAGE_PROVIDER`, `PORTAL_BASE_URL`, `SIGNUP_HASH_SECRET`, `SIGNUP_PROXY_SECRET`, `ORCHADOS_CRON_SECRET`, `TURNSTILE_SECRET_KEY`, payment secrets, and so on. Read the current secret **names** with `GET /v1/projects/{ref}/secrets` to see what exists. Never print values.
   - Vault entries other than `demo_cleanup_url`.
2. **Turnstile.** The live Turnstile widget (secrets `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` in GitHub) is bound to the hostname `orchados-demo.vercel.app`. Do not replace the test project's `TURNSTILE_SECRET_KEY`, because that would break the test site's sign-up. Make the `demo-start` Edge Function prefer a separate secret, `DEMO_TURNSTILE_SECRET_KEY`, and fall back to `TURNSTILE_SECRET_KEY`. Keep `ORCHADOS_DEMO_MODE=public`'s rule that the key must be live, not a test key. Apply the same to any proxy or HMAC secret that `demo-start` shares with the web app: if sharing one secret would force changing the test site's value, use a demo-specific name (`DEMO_*`) on both sides.
3. **Isolation stays layered.** The İP13 DB guards (write guard, account lockdown, scope triggers, `demo_guard_drift`) already confine demo users to the demo org. Verify that nothing in this mode weakens them. Verify that demo cleanup can never delete a non-demo user of the test project. Verify the test project's staff and seed users are unaffected.
4. **Docs.** Update `docs/demo-turu.md` (Turkish) with a short section "Geçici ortak barındırma (test projesi)": why, what is shared, the accepted risks, and how to move to a separate project later. The move is the same workflow with `host=separate` after a Pro upgrade. Also update `docs/deployment.md`.

## Work
- Add an input `host: separate|test` to `provision-demo` (default `test` for now) and support it in `scripts/provision-demo.sh` and its mock tests (`scripts/test-provision-demo.sh`, `scripts/tests/provision_demo_mock.py`).
- In `host=test` mode:
  - Reuse `SUPABASE_PROJECT_REF`. Skip project creation and the DB password.
  - Add only the demo origin to the Auth redirect allow-list.
  - Set only demo-specific Edge secrets: `ORCHADOS_DEMO_MODE=public` and `DEMO_TURNSTILE_SECRET_KEY`, plus any `DEMO_*` you introduce.
  - Upsert Vault `demo_cleanup_url`, reusing the existing `orchados_cron_secret` if present.
  - Create or update the Vercel `orchados-demo` project with variables pointing to the test project's URL and anon key. Use the existing `SUPABASE_URL` / `SUPABASE_ANON_KEY` repo secrets, which are public values.
  - Write a job summary telling the orchestrator to set `DEMO_SUPABASE_PROJECT_REF` / `DEMO_SUPABASE_URL` / `DEMO_SUPABASE_ANON_KEY` / `DEMO_SUPABASE_DB_PASSWORD` to the test project's values. Or, better, make `deploy-db-demo` and `demo-data` (`project=demo`) fall back to the test secrets when `vars.DEMO_HOST == 'test'`, and say so in the summary.
- Make `deploy-db-demo` and `demo-data` work in this mode. Avoid pushing migrations twice in conflicting ways; `deploy-db` already pushes to the test project. Make sure the lock checks of `deploy-db` (test) accept an enabled demo org on the test project when `vars.DEMO_HOST == 'test'`.
- Tests: mock tests for both modes, plus Edge/pgTAP tests for the `DEMO_TURNSTILE_SECRET_KEY` fallback.
- Branch `claude/demo-ortak-proje` from origin/main. Open a PR with `gh api repos/yusuftiryaki/orchadOS/pulls ...` and a Turkish description. Never merge, never push to main, never force-push, never print secrets. Ask no questions.
