# İP13: Provision the hosted demo (Supabase + Vercel) through a GitHub Actions workflow

## Goal
Write a **manually triggered** workflow, `.github/workflows/provision-demo.yml`. Running it once should set up the hosted demo described in `docs/demo-turu.md` §15 and `docs/deployment.md`. Running it again must be safe (idempotent). No secret value may ever appear in logs, in the repo or in your messages.

## Facts (checked by the orchestrator on 28 Oct)
- GitHub repo `yusuftiryaki/orchadOS` (public). Environments `test` (branch main), `demo` (branch main) and `pilot` (branch release) exist and have deployment branch policies.
- Repo secrets: `SUPABASE_ACCESS_TOKEN` (Supabase Management API personal token), `SUPABASE_PROJECT_REF` (the test project; use its organization for the demo project), `VERCEL_TOKEN`, plus the test and pilot DB secrets.
- `demo` environment secret: `DEMO_SUPABASE_DB_PASSWORD`, already generated. Use it as the new project's DB password.
- Still missing, and the workflow must cope without them: `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (Cloudflare). If they are missing, the demo stays **closed**: do not set `ORCHADOS_DEMO_MODE=public`. Leave it unset, which means closed per §5. Do not set the main site's "Demoyu dene" link. Print a clear notice in the job summary.
- Vercel team `orchad-os` (`team_0Ga9zPSUlRt15QdLIDp2Jj6W`, Hobby plan). It has existing projects `orchados` (main, root `apps/web`, framework nextjs, GitHub-linked) and `orchados-pilot` (release). The Hobby plan allows 100 deployments per day, so avoid needless deployments.
- Default demo domain: `orchados-demo.vercel.app`, the Vercel project's default.

## The workflow must
1. Use `on: workflow_dispatch`, `environment: demo`, and `if: github.ref == 'refs/heads/main'`. Inputs: `region` (default `eu-central-1`) and `dry_run` (boolean).
2. **Supabase project:** Find the organization of `SUPABASE_PROJECT_REF` with `GET /v1/projects/{ref}`. Reuse a project named `orchados-demo` in that org if one exists. Otherwise create it with `POST /v1/projects` (name, organization_id, region, db_pass from the secret). Wait until it is `ACTIVE_HEALTHY`.
3. **API keys:** Read the anon/publishable key with `GET /v1/projects/{ref}/api-keys`. It is public by design. Never output the service_role key.
4. **Auth config** (`PATCH /v1/projects/{ref}/config/auth`): use the settings in `docs/demo-turu.md` §15 and `supabase/config.toml`. That means `site_url` = the demo URL, sign-up disabled, and whatever else the runbook lists.
5. **Edge Function secrets:** Use `supabase secrets set` (Supabase CLI via `pnpm exec supabase`, the version pinned in the repo) or the Management API. Set every secret the demo needs per §15. Generate any random secrets the design asks for, such as proxy or HMAC secrets, inside the job and never print them. Set Turnstile and `ORCHADOS_DEMO_MODE=public` only if the Turnstile secrets exist. If the same value must also go to Vercel (for example a proxy secret shared with the web app), set it there in the same job.
6. **Vercel project:** Reuse `orchados-demo` if it exists. Otherwise create it with `POST /v10/projects?teamId=…`: name `orchados-demo`, framework `nextjs`, `rootDirectory` `apps/web`, gitRepository `{type: github, repo: yusuftiryaki/orchadOS}`, production branch `main`. Set the Ignored Build Step from deployment.md so previews don't build. Upsert **Production** env vars from §15 and deployment.md: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ORCHADOS_DEMO_ENABLED=1`, the main-site URL, the Turnstile site key if present, shared secrets, and so on. Read the code (`apps/web/src/lib/flags.ts`, `apps/web/.env.example`, `apps/web/src/lib/demo/**`) for the exact names.
7. **Vault / cron:** If §15 needs Vault entries such as `demo_cleanup_url` and `orchados_cron_secret`, insert or update them through the Management API SQL endpoint.
8. **Job summary:** Print the project ref, the Supabase URL, the anon key (public), the Vercel project id and the demo URL, plus a checklist of what is still missing (Turnstile). Print nothing secret.
9. Do **not** run `db push` or load the demo data. Existing workflows do that after the orchestrator sets `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_URL` and `DEMO_SUPABASE_ANON_KEY` from the summary: `deploy-db-demo` and `demo-data` (`project=demo`).

## Also
- Update `docs/deployment.md` and `docs/demo-turu.md` §15 (Turkish) to describe the workflow as the way to provision.
- Make sure `deploy-db-demo` / `demo-data` work with the secrets arranged this way: DB password in the `demo` environment, the other DEMO_* secrets as repo or environment secrets. Fix those workflows if they would not.
- Lint the workflow (`actionlint` if you can install it) and test the bash logic locally with mocked curl responses.
- Branch `claude/demo-kurulum` from origin/main. Open a PR with `gh api repos/yusuftiryaki/orchadOS/pulls ...`, with a Turkish description. Never merge PRs, push to main or force-push. Ask no questions.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
