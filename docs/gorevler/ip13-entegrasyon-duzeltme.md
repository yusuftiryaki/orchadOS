# İP13 integrated review fixes (after merging to main)

İP13 (PRs #62–#65) is merged into main. The integrated review of main checked four areas: the demo flow, isolation, regressions, and deploy readiness. An adversarial verifier confirmed each finding below against the code. Isolation and regressions show no serious holes. Fix all of the findings in **one PR**.

## Rules
- `git fetch origin && git checkout -B claude/ip13-entegrasyon-duzeltme origin/main`. **Never merge PRs, never push to main, never force-push.**
- Read `CLAUDE.md`, `docs/gorevler/README.md` and `docs/demo-turu.md` (especially §10.4, §11 and §15).
- Put SQL changes in new fix-forward migrations only, and call `private.attach_demo_guard` for every table you add. Regenerate `database.types.ts` if the schema changes.
- Workflow model (the major finding): every job that touches a project's DB secrets uses that project's GitHub Environment (`environment: test|demo|pilot`). `workflow_dispatch` is accepted on main only (`if: github.ref == 'refs/heads/main'`). If secrets are missing, the job **fails**; it does not skip and stay green. The only exception is the test project before setup, and that must be an explicit opt-in. Update the runbooks (`docs/deployment.md`, `docs/demo-turu.md` §10.4) to match, and list the steps a human must do.
- Add tests where it makes sense: unit/e2e for the UI fixes, and workflow logic checked with `actionlint` if available.
- Run `pnpm web:lint`, `pnpm web:test`, `pnpm db:reset && pnpm db:test`, the demo e2e, and the pipeline demo tests. All must pass. Make sure CI is green.
- Open the PR against main with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=claude/ip13-entegrasyon-duzeltme -f base=main ...`. Write the description in Turkish, cover how you fixed each finding, and end it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Also update the İP13 rows in `docs/plan.md` (see finding).

## Findings

### 1. [minor] (flow) `apps/web/src/lib/pdf/serve.ts:44`

**Problem:** When a demo session hits A's demo_hit caps, the visitor gets no message. The PDF routes return a bare 429 with no body, and the tour's image signing quietly returns nulls. The notice texts for both cases (demoText.closed.images and closed.pdfLimit, demo.ts:101-102) are defined but nothing ever renders them. docs/demo-turu.md §5 (line 313) says the web shows a note when image signing returns an empty result.

**Scenario:** A visitor downloads PDFs until demo_hit('pdf') returns false (max_pdf_renders 30, and cached PDFs count too). Clicking the 'PDF rapor' button (report-pdf, a plain <a href>) takes the browser away from the portal to an empty 'HTTP ERROR 429' page with no explanation and no demo banner. The same happens when sign_calls passes 600 in /gezi: every panorama turns into the grey placeholder (gezi/actions.ts:22-23) and no note says why. git grep shows closed.images and closed.pdfLimit are referenced nowhere outside demo.ts.

**Fix:** Have servePdf return a small HTML page or redirect (for example back to the parcel page with ?hata=demo_pdf_limit) that shows demoText.closed.pdfLimit. Have signTourImagesAction return a 'capped' flag next to the nulls, so Tour can render demoText.closed.images above the viewer.

**Area:** IP13-C web (PDF route / tour signing) against the IP13-A demo_hit contract

**Verifier:** Confirmed on origin/main. serve.ts:44 returns new Response(null,{status:429}) with no body, and report-pdf (parcel-report.tsx:77) is a plain <a href>, so the visitor lands on a bare 429 page. gezi/actions.ts:22-23 maps every id to null when demo_hit('sign') is false and says nothing. git grep finds closed.images and closed.pdfLimit nowhere outside demo.ts. The bare 429 on the PDF route matches the doc, but docs/demo-turu.md line 313 also says image signing returns an empty result 've bir not gösterir' (and shows a note), and no code does that. It is user-facing only at the caps, so minor.

### 2. [minor] (flow) `apps/web/src/lib/demo/tour-steps.ts:40`

**Problem:** Tour step 7 'ziyaret' says the report card switches to the selected visit, but it does not. The step opens ?ziyaret=<previous_session_id> and outlines report-summary, and its copy (demo.ts:150-153) says 'Önceki ziyareti seçerek haritayı ve karneyi o güne göre görün'. The parcel page passes ?ziyaret only to HealthMap (parsel/[parcelId]/page.tsx:48-52). Summary and Dimensions always render report.latest.

**Scenario:** In step 7 the tour sends the visitor to /portal/parsel/de10…01?ziyaret=<A_SCAN_2025>&tur=ziyaret and outlines the report-summary box, which still shows 'Ziyaret 14.07.2026' and the 2026 class counts and score. Only the map's visit-select shows 15.07.2025. A prospective customer is told the karne follows the chosen visit, and the highlighted box contradicts that.

**Fix:** Either change the step copy to say that only the map follows the chosen visit, and outline only visit-select and parcel-map, or pass the visit id through to Summary so the outlined card really shows that visit.

**Area:** IP13-C guided tour (step definitions and copy)

**Verifier:** Confirmed. tour-steps.ts sends step 'ziyaret' to ?ziyaret=<previous_session_id> and outlines visit-select and report-summary. In parsel/[parcelId]/page.tsx, ziyaret only reaches mapOptions.visitId (HealthMap's initialVisitId). The report-summary section (parcel-report.tsx:157-205) always renders report.latest. The step copy (demo.ts) says 'haritayı ve karneyi o güne göre görün' (see the map and the report card as of that day), so the outlined box contradicts the claim. The §11.4 table names the targets but nothing makes the karne follow the visit. This is a copy/behaviour mismatch, not broken function.

### 3. [minor] (flow) `apps/web/src/components/demo/guided-tour.tsx:280`

**Problem:** When sign-up is closed, the closing tour card and the banner give different labels for the same action. The card always says 'Gerçek hesap aç' (T.signup), while the banner (demo-banner.tsx:45) switches to 'Bize ulaşın' when signupNext is '/iletisim'. Both forms post the same next value.

**Scenario:** On a deployment that serves the demo without a main site and with sign-up off (ORCHADOS_DEMO_ENABLED=1, ORCHADOS_SIGNUP_ENABLED unset: the local stack, CI or the test-project smoke test), DemoShell computes signupNext='/iletisim'. The banner shows 'Bize ulaşın', but the closing card's 'Gerçek hesap aç' ends the demo and lands on the contact page instead of a sign-up.

**Fix:** Use the same rule as the banner: signupNext === '/iletisim' ? demoText.banner.contact : T.signup.

**Area:** IP13-C guided tour

**Verifier:** Confirmed. demo-shell.tsx sets signupNext='/iletisim' when neither mainSiteUrl nor signupEnabled is set. demo-banner.tsx switches its label to B.contact ('Bize ulaşın') in that case, but guided-tour.tsx (around line 280, the tour-signup button) always shows T.signup ('Gerçek hesap aç') and posts the same next=/iletisim. The two labels for one action disagree, and the closing card promises a sign-up but lands on the contact page.

### 4. [minor] (flow) `apps/web/src/lib/i18n/messages/demo.ts:82`

**Problem:** The banner appends a fixed Turkish dative suffix to the session end time: `oturum ${until}'ye kadar` and `${until}'ye kadar`. Turkish chooses the suffix by vowel harmony from how the time is read aloud, so 'ye is wrong for most times. The banner shows on every demo page.

**Scenario:** session_ttl is 3 hours, so a session started at 12:30 shows 'oturum 15:30'ye kadar' (should be 15:30'a), one ending at 18:00 shows '18:00'ye' (should be 18:00'e), and 14:45 shows '14:45'ye' (should be 14:45'e). Only times read as ending in -i/-e words, such as :20, :50 or :02, come out right.

**Fix:** Use a suffix-free form such as 'oturum bitişi: 15:30' or 'oturum 15:30 itibarıyla kapanır', or pick 'a/'e/'ya/'ye from the spoken minute/hour.

**Area:** IP13-C demo banner copy

**Verifier:** Confirmed. demo.ts banner.text and banner.short hard-code `${until}'ye kadar`, and demoUntil outputs 'HH:MM'. The Turkish dative follows the last spoken word: 15:30 (otuz) needs 'a, 18:00 (sekiz) and 14:45 (beş) need 'e, 16:00 (altı) needs 'ya. Only times ending in -i or -e words (iki, yedi, yirmi, elli) are right. The banner shows on every demo page, but this is cosmetic.

### 5. [minor] (isolation) `.github/workflows/deploy-db-demo.yml:31`

**Problem:** The GitHub Environment protection on demo-data is undone by deploy-db-demo and deploy-db, which read the same DB secrets at repo level, have no `environment:`, and accept workflow_dispatch from any branch. If the secrets are moved into the environments as §10.4 and the #64 fix brief say, both deploy jobs skip silently, demo guard check included.

**Scenario:** There are two possible setups, and both fail. (a) The operator follows docs/demo-turu.md §10.4 and moves DEMO_SUPABASE_DB_PASSWORD and DEMO_SUPABASE_PROJECT_REF (and SUPABASE_DB_PASSWORD for test) into the `demo`/`test` environments. deploy-db-demo.yml:29-31 and deploy-db.yml:28 then read empty values. The 'Skip when ... secrets are not configured' step only warns, and the job ends green. From then on the demo project gets no migrations and no `scripts/demo-guard-check.sh` run, so later demo-guard fixes never reach it and drift is never reported. (b) The operator keeps repo-level copies so the deploys keep working. Then any collaborator can push a branch or run `workflow_dispatch` of deploy-db-demo (line 19, no ref restriction; it runs the branch's own workflow file and migrations) with DEMO_SUPABASE_DB_PASSWORD. That bypasses the required reviewers and the main-only rule that demo-data.yml:57 relies on, and gives arbitrary SQL as postgres on the public demo project.

**Fix:** Use one model for every job that touches a project: give deploy-db-demo (and deploy-db for test) `environment: demo` / `environment: test`, or move the DB push into a job that runs in that environment, and add `if: github.ref == 'refs/heads/main'` (release for the pilot) to the deploy jobs. Turn the 'secrets missing' skip into a failure once a project is expected to be configured, or at least for the demo guard step. Delete the repo-level DEMO_* copies after the move, and update §10.4 and §15 to match.

**Area:** ci/deploy workflows (IP13-A deploy-db-demo vs IP13-B demo-data)

**Verifier:** Confirmed. deploy-db-demo.yml:29-32 and deploy-db.yml:26-29 read DEMO_SUPABASE_DB_PASSWORD / DEMO_SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD as repo-level secrets, set no `environment:`, and accept workflow_dispatch with no ref check. docs/demo-turu.md:710 and the demo-data.yml:16-18 header tell the operator to move these same-named secrets into the `test`/`demo` environments. Once moved, the guard step at deploy-db-demo.yml:37-39 only warns and sets ready=false, so the job goes green and skips migrations, the lock check and demo-guard-check.sh. If the repo-level copies are kept instead, the environment's reviewer and main-only rule (demo-data.yml:54,57) no longer protects the demo postgres password. Downgraded to minor: the #64 verifier rated the missing environment itself as a minor hardening gap, anyone with write access can already read repo secrets through a branch workflow, and a skipped deploy still shows a warning annotation.

### 6. [minor] (isolation) `.github/workflows/deploy-db.yml:69`

**Problem:** 'Check demo guards' uses the same `if: steps.guard.outputs.ready == 'true'` as the other steps, so it never runs when `db push --include-all` fails partway. Migrations applied earlier in the same push keep their new tables without zz_demo_read_only. The same applies to deploy-db-pilot.yml:147 and deploy-db-demo.yml:142.

**Scenario:** A push carries two late-merged migrations. supabase db push applies and records each file in its own transaction. File 1 creates public.x with an owner-writable RLS policy and commits. File 2 fails, so the push step exits non-zero. The implicit success() condition skips 'Check demo guards', and private.attach_demo_guards() never runs. public.x stays unguarded on the hosted demo project until a later deploy succeeds, which may be days if the failing migration needs a fix. During that time any demo visitor (owner of the demo parcels) can write public.x through PostgREST, and the only signal is a failed migration job that says nothing about the guard.

**Fix:** Run the guard step whenever the push was attempted: `if: always() && steps.guard.outputs.ready == 'true'` (or `!cancelled()`) in all three deploy-db*.yml, and keep it failing on drift. Optionally put the push and the re-attach in one step with a trap, so the re-attach runs even when the push fails.

**Area:** ci/deploy workflows

**Verifier:** Confirmed. 'Check demo guards' at deploy-db.yml:69-71, deploy-db-demo.yml:142-144 and deploy-db-pilot.yml:147-149 uses only `steps.guard.outputs.ready == 'true'`, which carries the implicit success(). A non-zero exit from `db push --include-all` therefore skips attach_demo_guards(). The CLI commits each migration file separately, so tables from files applied before the failure stay unguarded. The drift migration (lines 15-19) rules out an event trigger, so nothing else attaches zz_demo_read_only. Fix: `always() && ...`. Minor: this only matters while a red deploy is waiting to be fixed, and in practice only on the demo project, since the pilot and test projects have no demo visitors.

### 7. [minor] (isolation) `.github/workflows/deploy-db-demo.yml:93`

**Problem:** The demo project lock requires Vault demo_cleanup_url but not Vault orchados_cron_secret. private.dispatch_demo_cleanup() returns null without it (20261101120000_demo_access.sql:527-529), so with the demo enabled and the lock green, the cleanup never runs.

**Scenario:** An operator sets the ORCHADOS_CRON_SECRET edge secret and the Vault demo_cleanup_url, which is everything the lock checks, but no Vault orchados_cron_secret (Vault holds only what was added by hand on this new project). deploy-db-demo passes, and demo-data enables the tour. Every 15 minutes dispatch_demo_cleanup finds v_secret empty and returns null without calling demo-start. Expired visitor accounts, their demo_session rows and GoTrue's auth.audit_log_entries with visitor IPs are never deleted, against the §7/§12 retention promise. Housekeeping only removes parcel_access, so this is silent personal-data retention on the public demo.

**Fix:** Add `count(*) from vault.secrets where name = 'orchados_cron_secret'` to the lock query and fail when a demo org is enabled and it is missing. Optionally also have private.demo_housekeeping() warn, or record a health row, when Vault lacks either cleanup secret.

**Area:** ci/deploy workflows (IP13-A demo lock)

**Verifier:** Confirmed. The lock in deploy-db-demo.yml:91-94 and 118-121 checks only Vault `demo_cleanup_url`, plus the ORCHADOS_CRON_SECRET edge secret (line 112). It never checks Vault `orchados_cron_secret`. private.dispatch_demo_cleanup() (demo_access.sql:527-529) returns null without it, and the final demo_housekeeping (lockdown.sql:264+) only deletes parcel_access and ends sessions. It never deletes auth.users accounts or demo_session rows. So a deploy that passes the lock can have cleanup silently off. The setup steps at demo-turu.md:1029 do list the Vault secret, which keeps this minor: it is an incomplete safety net, not a wrong default.

### 8. [minor] (regressions) `services/pipeline/src/orchados_pipeline/demo/build.py:80`

**Problem:** The demo build cache is invalidated only by changes under demo/*.py (generator_hash) and, in CI, by demo/** plus uv.lock (ci-db-web.yml:97). The build actually depends on the core pipeline: outputs/models, coverage, crops, projection, imaging and the PipelineParams defaults. On top of that, sqlgen.visit_uploads reads the cached run folders through the current upload.upload_run()/load_outputs(). So an ordinary pipeline change reuses stale demo output, and that stale output can break ci-db-web.

**Scenario:** A pipeline PR changes outputs.py or models.py, for example by adding a required field to Outputs, and touches nothing under demo/. In ci-db-web, actions/cache restores services/pipeline/.demo-build because the key hashes only demo/** and uv.lock. build() reuses the cache because generator_hash() hashes only demo/*.py. 'pnpm db:demo-tour --profile test --reset-local' then runs upload_run(), whose current load_outputs() rejects the old outputs.json. ci-db-web fails at 'Load the demo tour dataset' for a PR that never touched the web or the demo, and stays red until someone edits a demo file. The same stale cache is reused on developer machines. A change that only alters a parameter (crop size, coverage rule) loads silently with old crops and the old params_hash. The office-e2e cache next to it correctly hashes services/pipeline/src/**.

**Fix:** In generator_hash(), hash every orchados_pipeline/*.py the build imports (or the whole package source), and include PipelineParams().params_hash(). In ci-db-web.yml, change the demo-build cache key to hashFiles('services/pipeline/src/**', 'services/pipeline/uv.lock'), the same as the office-e2e cache.

**Area:** B (pipeline demo build) / CI

**Verifier:** Confirmed on origin/main. In build.py:662-670 the cache is reused when generator_hash() matches, plus dataset_sha256 and file presence. generator_hash() (build.py:80-84) hashes only demo/*.py. The params_hash is written to the manifest (line 691) but never compared when deciding to reuse it. The ci-db-web.yml:97 cache key hashes only demo/** and uv.lock, while the office-e2e key next to it hashes services/pipeline/src/**. sqlgen.py:752 feeds the cached run folders through the current upload_run(). So a core change to outputs, models, crops, coverage or params reuses a stale build. docs/demo-turu.md:653 and the pipeline README:358 describe the generator_hash rule, but nothing there says core-pipeline changes should be ignored, so this is a gap rather than a deliberate choice. Severity stays minor: the failure needs a future pipeline change, the build can be forced, and the CI failure is visible, not silent in production.

### 9. [major] (deploy) `.github/workflows/demo-data.yml:57`

**Problem:** demo-data now runs in the `test`/`demo` GitHub Environments, and both runbooks say to move this workflow's secrets there (docs/deployment.md:271, docs/demo-turu.md:710). But deploy-db, deploy-db-demo, deploy-db-pilot and keepalive read the same names (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF/DB_PASSWORD/URL/ANON_KEY, DEMO_SUPABASE_*) as repo secrets and declare no environment. When those workflows find the secrets empty they skip with only a warning.

**Scenario:** The operator follows the runbook and moves SUPABASE_* into environment `test` and DEMO_SUPABASE_* (plus the shared SUPABASE_ACCESS_TOKEN) into `demo`. On the next push to main, deploy-db (deploy-db.yml:27-29) and deploy-db-demo (deploy-db-demo.yml:30-32) see empty secrets, print the 'secrets are not set; skipping' warning and finish green. deploy-db-pilot (deploy-db-pilot.yml:28) skips the same way on release because SUPABASE_ACCESS_TOKEN is gone. No migration or Edge Function reaches any hosted project, so the demo and pilot keep the old schema with no failed check. keepalive.yml:17-18 sends curl to an empty URL; it gets code 000, `test 000 -lt 500` passes, and the free test project is paused after a week. The other choice, keeping copies as repo secrets, makes the environment protection pointless: any branch workflow, and deploy-db-demo on every main push, still gets the demo postgres password with no reviewer.

**Fix:** Choose one model and write it down. Either (a) add `environment: demo` to deploy-db-demo, `environment: test` to deploy-db and an environment to deploy-db-pilot/keepalive, with branch rules for main/release (required reviewers would gate every push), or (b) keep repo-level copies for the deploy and keepalive workflows and say so in deployment.md:271 and demo-turu.md:710 ('copied', not 'moved'). Also update the 'Kullanan' column in deployment.md:43-47, which still lists only deploy-db/keepalive.

**Area:** ops/ci (IP13-A deploy workflows + IP13-B demo-data docs)

**Verifier:** Confirmed. demo-data.yml:57 uses `environment: ${{ inputs.project }}`, and both deployment.md (the 'Koruma' paragraph) and demo-turu.md §10.4 tell the operator to move this workflow's secrets into the environments ('oraya taşınır'). The secrets they list include SUPABASE_ACCESS_TOKEN, SUPABASE_* and DEMO_SUPABASE_*. deploy-db.yml:27-29, deploy-db-demo.yml:30-32 and deploy-db-pilot.yml:28 read these as repo secrets with no `environment:`. If any is empty, the guard prints a ::warning and the job ends green with no db push. keepalive.yml step 1 has no empty-URL guard (only the pilot step does), so curl returns 000 and `test 000 -lt 500` passes. Keeping repo copies instead leaves DEMO_SUPABASE_DB_PASSWORD reachable without the environment reviewer, because deploy-db-demo runs on every main push. Nothing in the docs reconciles the two.

### 10. [minor] (deploy) `CLAUDE.md:31`

**Problem:** The new CLAUDE.md rule says every table-adding migration calls `select private.attach_demo_guard('<tablo>')` (or attach_demo_account_guard). Those functions are created in migrations stamped 20261101120100/120200, which are in the future. Today is 2026-10-28, so `supabase migration new` gives 202610281xxxxx, which sorts before them (and before the IP12 20261030-20261101 ones). On a fresh database the call runs before the function exists.

**Scenario:** The next developer adds a table with `supabase migration new` (timestamp ~20261028…) and follows CLAUDE.md:31. `pnpm db:reset` and the ci-db-web 'Apply migrations and seed' step apply migrations in filename order and fail with `function private.attach_demo_guard(unknown) does not exist` (20261101120100_demo_write_guard.sql:57 defines it; attach_demo_account_guard is at 20261101120200_demo_account_lockdown.sql:106). A migration that references the IP12 billing tables fails the same way. A new-migration fix for a guard-drift failure, which deployment.md:259 tells people to write, hits the same wall. Nothing tells developers to pick a timestamp after 20261101120300.

**Fix:** In CLAUDE.md (and deployment.md:259), require new migrations to use a timestamp later than the latest existing one (currently 20261101120300), e.g. by renaming the generated file. Alternatively, add a ci-db-web check that rejects a new migration whose timestamp is not greater than the current maximum on main.

**Area:** db conventions (IP13-A + IP12 migration timestamps)

**Verifier:** Confirmed. CLAUDE.md:31 requires `select private.attach_demo_guard(...)` in every table-adding migration. The function is defined in 20261101120100_demo_write_guard.sql, which is future-dated (today is 2026-10-28). The only 'timestamps after the latest existing migration' rule is in an IP12 brief (ip12-entegrasyon-duzeltme.md:8), not in CLAUDE.md or the runbooks. So `supabase migration new` today sorts before 20261101120100 and db reset or CI fails with 'function does not exist'. Graded minor: it fails loudly in local reset and in ci-db-web, never silently on a hosted project, and renaming the file fixes it.

### 11. [minor] (deploy) `.github/workflows/deploy-db-demo.yml:93`

**Problem:** The demo lock check needs only Vault `demo_cleanup_url` for an enabled demo org. private.dispatch_demo_cleanup (20261101120000_demo_access.sql:526-530) also needs Vault `orchados_cron_secret` and silently returns null without it. The demo project is new, so the IP12 Vault setup that created orchados_cron_secret on test and pilot never ran there.

**Scenario:** The operator creates demo_cleanup_url but not orchados_cron_secret on orchados-demo (or skips the second line of deployment.md:243-244). Then demo-data enable runs, and deploy-db-demo passes because cleanup_url is 1 and the Edge secret ORCHADOS_CRON_SECRET exists. The demo-cleanup cron never calls demo-start, so expired visitor auth.users rows and their GoTrue sessions (raw IP and user agent) pile up indefinitely. demo-housekeeping only removes parcel_access, so this goes against the retention promised in demo-turu.md §16. demo-data `enable` does not check any of these prerequisites either.

**Fix:** Count `name in ('demo_cleanup_url','orchados_cron_secret')` and require both (2) when enabled_demo_orgs > 0. Optionally run the same check in `orchados-pipeline demo enable --target remote`.

**Area:** ops/ci (IP13-A deploy-db-demo)

**Verifier:** Confirmed. In deploy-db-demo.yml the lock query counts only vault.secrets name='demo_cleanup_url'. The Edge secret ORCHADOS_CRON_SECRET is checked, but Vault orchados_cron_secret is not. private.dispatch_demo_cleanup (20261101120000_demo_access.sql:526-530) returns null when either Vault entry is missing. The final demo_housekeeping (120200) only expires sessions and removes access; it does not delete auth.users. So expired visitor accounts and their sessions stay forever without any failed check. It needs an operator to skip one documented line, hence minor.

### 12. [minor] (deploy) `docs/deployment.md:203`

**Problem:** The runbook for the new Vercel `orchados-demo` project (same repo, production branch main, demo Supabase keys plus the server-only SIGNUP_PROXY_SECRET) never says to turn off preview deployments. The pilot section (deployment.md:17) does, and there is no vercel.json or ignoreCommand in apps/web.

**Scenario:** With Vercel defaults, every PR branch also builds a preview in orchados-demo. If the env vars are scoped to all environments, unmerged code runs against the public demo database with ORCHADOS_DEMO_ENABLED=1 and SIGNUP_PROXY_SECRET, which lets branch code forge client_ip and get around demo-start's per-IP limits, and it runs on a schema whose migrations are not yet applied. If the vars are Production-only, every PR gets a broken or failing orchados-demo preview check.

**Fix:** Add to deployment.md §Demo projesi and demo-turu.md §15 3.6: in Vercel → Git, turn off preview deployments for orchados-demo (or set an ignored build step `[ "$VERCEL_ENV" != production ]`) and scope its env vars to Production only.

**Area:** ops/docs (IP13 runbook)

**Verifier:** Confirmed omission. The demo Vercel runbook (deployment.md:203-217) never mentions previews. The pilot gets an explicit no-preview statement (deployment.md:17), and the repo has no vercel.json or ignoreCommand. With Vercel's defaults, every PR branch also builds in orchados-demo. With all-environment vars, previews hit the public demo DB, possibly with unapplied schema. Graded minor: branch authors are trusted collaborators, so the client_ip forgery angle is weak; the real harm is schema drift and noise in preview checks.

### 13. [minor] (deploy) `docs/plan.md:96`

**Problem:** The İP13 status rows are stale after the merge: İP13-A 'İncelemede (PR #63)', İP13-B 'İncelemede (PR #64)', İP13-C 'Sürüyor, PR'. All three are merged on main. The next human steps (test-project smoke, demo project creation, pilot link) are not shown as the open items.

**Scenario:** Anyone reading plan.md to decide the next deploy step thinks İP13 is still unmerged, and the open human actions in demo-turu.md §16 (demo Supabase/Vercel projects, DEMO_ secrets, GitHub Environments, Vault, Auth confirmations) are not tracked anywhere as pending.

**Fix:** Mark A, B and C as merged (#63/#64/#65). Add a row for the pending rollout: test smoke, demo project, environments and secrets decision, then the pilot ORCHADOS_DEMO_URL.

**Area:** docs/plan

**Verifier:** Confirmed. On origin/main, plan.md:96-98 still says İP13-A 'İncelemede (PR #63)', İP13-B 'İncelemede (PR #64)' and İP13-C 'Sürüyor', while git log shows merges of #64 and #65 (and #63) on main. This is only doc staleness that will likely be fixed in follow-up bookkeeping; there is no runtime impact.
