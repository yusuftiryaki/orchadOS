#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs in single quotes
# Tests scripts/provision-demo.sh against a mock Supabase Management API and
# Vercel API (scripts/tests/provision_demo_mock.py), on both hosts. separate: a
# fresh run, an idempotent second run, Turnstile arriving later, a dry run, a
# lost shared secret, and the refusals. test (shared hosting on the test
# project): only demo-specific settings change, the test site's are kept, the
# pilot and a foreign anon key are refused, a leftover ORCHADOS_DEMO_MODE=dev is
# removed, init_cron_secret creates the test project's cron secret only when
# both sides are missing (refused with one side), and the move to a separate project
# catches a leftover. Then scripts/demo-lock-check.sh in both modes and
# scripts/retention-check.sh (signup, audit). Every
# run's output and job summary is checked for secret values.
# Every SQL text sent is then run on Postgres when DB_URL is set
# (scripts/test-script-sql.sh).
# Needs bash, curl, jq, openssl and python3 (psql with DB_URL); no network.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'kill "$mock_pid" 2>/dev/null || true; [ -n "${KEEP:-}" ] || rm -rf "$work"' EXIT

python3 "$here/tests/provision_demo_mock.py" "$work/port" &
mock_pid=$!
for _ in $(seq 50); do [ -s "$work/port" ] && break; sleep 0.1; done
port=$(cat "$work/port")
base="http://127.0.0.1:$port"

ctl() { curl -fsS -X POST -H 'Content-Type: application/json' -d "${2:-{\}}" "$base/__ctl/$1"; }

failures=0
pass() { echo "ok   - $*"; }
bad() { echo "FAIL - $*"; failures=$((failures + 1)); }
check() { local name=$1; shift; if "$@"; then pass "$name"; else bad "$name"; fi; }

DB_PASSWORD="db-pass-SECRET-1234"
TS_SECRET="0x4AAAAAAAlive-turnstile-SECRET"
TS_SITE="0x4AAAAAAAsite-key"

# run_and_snap NAME [VAR=value ...]: runs the script with a cleared request log;
# keeps its output, summary and the mock state (with the run's request log).
run_and_snap() {
  local name=$1 rc
  ctl clear-log >/dev/null
  set +e
  env -i PATH="$PATH" HOME="$HOME" \
    SUPABASE_API="$base/sb" VERCEL_API="$base/vc" POLL_INTERVAL=0 POLL_TIMEOUT=5 \
    SUMMARY_FILE="$work/$name.summary" \
    SUPABASE_ACCESS_TOKEN=sb-token-SECRET SUPABASE_PROJECT_REF=testref000000000000 \
    DEMO_DB_PASSWORD="$DB_PASSWORD" VERCEL_TOKEN=vc-token-SECRET VERCEL_TEAM_ID=team_test HOST=separate \
    "${@:2}" bash "$here/provision-demo.sh" >"$work/$name.out" 2>&1
  rc=$?
  set -e
  curl -fsS "$base/__ctl/state" -X POST -d '{}' -H 'Content-Type: application/json' >"$work/$name.json"
  return $rc
}
J() { local n=$1; shift; jq -e "$@" "$work/$n.json" >/dev/null; }
# same NAME_A NAME_B FILTER: FILTER over two states ($a, $b) is true.
same() { jq -e -n --slurpfile a "$work/$1.json" --slurpfile b "$work/$2.json" "\$a[0] as \$a | \$b[0] as \$b | $3" >/dev/null; }
writes() { jq -r '[.log[] | select(.method != "GET" and (.path | test("database/query") | not)) | "\(.method) \(.path)"] | join(",")' "$work/$1.json"; }

# No secret value in the output or the summary. Values: tokens, DB password,
# Turnstile secret, service_role key and every generated secret in the state.
no_leaks() {
  local name=$1 v
  local values=(sb-token-SECRET vc-token-SECRET "$DB_PASSWORD" "$TS_SECRET" service-role-SECRET-key)
  while IFS= read -r v; do [ -n "$v" ] && values+=("$v"); done < <(jq -r '
    ((.secrets, .test.secrets) | to_entries[] | select(.key | test("SECRET")) | .value),
    (.vault.orchados_cron_secret // empty), (.test.vault.orchados_cron_secret // empty),
    (.vercel_env[] | select(.key | test("SIGNUP_PROXY_SECRET")) | .value)' "$work/$name.json")
  for v in "${values[@]}"; do
    if grep -qF -- "$v" "$work/$name.out" "$work/$name.summary" 2>/dev/null; then
      echo "  leaked: ${v:0:6}…"; return 1
    fi
  done
}

# 1. Fresh: everything is created; the demo stays closed without Turnstile.
run_and_snap fresh || { cat "$work/fresh.out"; bad "fresh run exits 0"; }
check "fresh: creates the Supabase project in the test project's org" \
  J fresh '.projects.demoref000000000000 | .organization_id == "org-test" and .region == "eu-central-1" and .name == "orchados-demo"'
check "fresh: db_pass is the secret" J fresh --arg p "$DB_PASSWORD" '.db_pass == $p'
check "fresh: waits for ACTIVE_HEALTHY" grep -q 'waiting: COMING_UP' "$work/fresh.out"
check "fresh: auth settings" J fresh '.auth | .site_url == "https://orchados-demo.vercel.app" and .uri_allow_list == "https://orchados-demo.vercel.app/**"
  and .disable_signup == true and .external_anonymous_users_enabled == false and .mailer_autoconfirm == false
  and .sms_autoconfirm == false and .mailer_secure_email_change_enabled == true'
check "fresh: edge secrets without Turnstile" J fresh '.secrets | (keys | sort) == ["MESSAGE_PROVIDER","ORCHADOS_CRON_SECRET","PORTAL_BASE_URL","SIGNUP_HASH_SECRET","SIGNUP_PROXY_SECRET"]
  and .MESSAGE_PROVIDER == "record" and .PORTAL_BASE_URL == "https://orchados-demo.vercel.app" and (.SIGNUP_HASH_SECRET | test("^[0-9a-f]{64}$"))'
check "fresh: Vault cleanup URL and cron secret equal to Edge" J fresh '.vault.demo_cleanup_url == "https://demoref000000000000.supabase.co/functions/v1/demo-start"
  and .vault.orchados_cron_secret == .secrets.ORCHADOS_CRON_SECRET'
check "fresh: Vercel project settings" J fresh '.vercel | .framework == "nextjs" and .rootDirectory == "apps/web"
  and .commandForIgnoringBuildStep == "[ \"$VERCEL_ENV\" != production ]" and .serverlessFunctionRegion == "fra1"
  and .ssoProtection.deploymentType == "preview" and .link.repo == "orchadOS"'
check "fresh: Vercel Production variables" J fresh '[.vercel_env[] | select(.target == ["production"]) | {(.key): .value}] | add
  | .NEXT_PUBLIC_SUPABASE_URL == "https://demoref000000000000.supabase.co" and .NEXT_PUBLIC_SUPABASE_ANON_KEY == "anon-public-key"
  and .ORCHADOS_DEMO_ENABLED == "1" and .ORCHADOS_MAIN_SITE_URL == "https://orchados-pilot-orchad-os.vercel.app"
  and .ORCHADOS_SITE_URL == "https://orchados-demo.vercel.app" and (has("NEXT_PUBLIC_TURNSTILE_SITE_KEY") | not)
  and (has("ORCHADOS_DEMO_URL") | not)'
check "fresh: SIGNUP_PROXY_SECRET sensitive and equal on both sides" J fresh '.secrets.SIGNUP_PROXY_SECRET as $s
  | any(.vercel_env[]; .key == "SIGNUP_PROXY_SECRET" and .type == "sensitive" and .value == $s)'
check "fresh: one production deployment of main" J fresh '(.deployments | length) == 1
  and .deployments[0].request.target == "production" and .deployments[0].request.gitSource.ref == "main"'
check "fresh: summary has ref, URL, anon key, Vercel id, demo URL" bash -c "grep -q demoref000000000000 '$work/fresh.summary' && grep -q anon-public-key '$work/fresh.summary' && grep -q prj_demo '$work/fresh.summary' && grep -q 'https://orchados-demo.vercel.app' '$work/fresh.summary'"
check "fresh: summary says Turnstile is missing" grep -q 'Turnstile missing' "$work/fresh.summary"
check "fresh: notice about the closed demo" grep -q '::notice::Turnstile keys are missing' "$work/fresh.out"
check "fresh: no secret in output or summary" no_leaks fresh
check "fresh: the test project is untouched" J fresh '.test.secrets.PORTAL_BASE_URL == "https://orchados.vercel.app"
  and .test.auth.site_url == "https://orchados.vercel.app" and (.test.vault | has("demo_cleanup_url") | not)
  and (.test.secrets | has("ORCHADOS_DEMO_MODE") | not)'
check "fresh: summary names the host" grep -q 'host: separate' "$work/fresh.summary"
cp "$work/fresh.json" "$work/before-rerun.json"
# The leak check itself catches a leaked value.
cp "$work/fresh.json" "$work/leak.json"; : >"$work/leak.summary"
jq -r '.secrets.SIGNUP_PROXY_SECRET' "$work/fresh.json" >"$work/leak.out"
if no_leaks leak >/dev/null; then bad "leak check detects a leaked secret"; else pass "leak check detects a leaked secret"; fi

# 2. Rerun: nothing is created, no secret rotates, no deployment.
run_and_snap rerun || { cat "$work/rerun.out"; bad "rerun exits 0"; }
check "rerun: only the plain Edge secrets are written" test "$(writes rerun)" = "POST /sb/v1/projects/demoref000000000000/secrets"
check "rerun: plain secrets only in the body" J rerun '[.log[] | select(.method == "POST" and (.path | endswith("/secrets"))) | .body[].name] == ["MESSAGE_PROVIDER","PORTAL_BASE_URL"]'
check "rerun: random secrets unchanged" same before-rerun rerun '$a.secrets == $b.secrets and $a.vault == $b.vault and $a.vercel_env == $b.vercel_env'
check "rerun: no deployment" J rerun '(.deployments | length) == 1'
check "rerun: says deployment not needed" grep -q 'Vercel deployment: not needed' "$work/rerun.out"
check "rerun: no secret in output or summary" no_leaks rerun

# 3. Turnstile arrives: public mode, the site key, one deployment.
run_and_snap turnstile TURNSTILE_SITE_KEY="$TS_SITE" TURNSTILE_SECRET_KEY="$TS_SECRET" || { cat "$work/turnstile.out"; bad "turnstile run exits 0"; }
check "turnstile: Edge TURNSTILE_SECRET_KEY and ORCHADOS_DEMO_MODE=public" J turnstile --arg t "$TS_SECRET" \
  '.secrets.TURNSTILE_SECRET_KEY == $t and .secrets.ORCHADOS_DEMO_MODE == "public"'
check "turnstile: Vercel site key" J turnstile --arg k "$TS_SITE" 'any(.vercel_env[]; .key == "NEXT_PUBLIC_TURNSTILE_SITE_KEY" and .value == $k and .target == ["production"])'
check "turnstile: redeploys once" J turnstile '(.deployments | length) == 2'
check "turnstile: proxy secret not rotated" same before-rerun turnstile '$a.secrets.SIGNUP_PROXY_SECRET == $b.secrets.SIGNUP_PROXY_SECRET'
check "turnstile: no Turnstile warning in summary" bash -c "! grep -q 'Turnstile missing' '$work/turnstile.summary'"
check "turnstile: no secret in output or summary" no_leaks turnstile

# 4. Vercel lost SIGNUP_PROXY_SECRET: a new one goes to both sides.
ctl drop-vercel-env '{"key":"SIGNUP_PROXY_SECRET"}' >/dev/null
run_and_snap proxy TURNSTILE_SITE_KEY="$TS_SITE" TURNSTILE_SECRET_KEY="$TS_SECRET" || { cat "$work/proxy.out"; bad "proxy run exits 0"; }
check "proxy: regenerated and equal on both sides" J proxy '.secrets.SIGNUP_PROXY_SECRET as $s
  | any(.vercel_env[]; .key == "SIGNUP_PROXY_SECRET" and .value == $s)'
check "proxy: differs from the old one" same before-rerun proxy '$a.secrets.SIGNUP_PROXY_SECRET != $b.secrets.SIGNUP_PROXY_SECRET'
check "proxy: cron and hash secrets unchanged" same before-rerun proxy '$a.secrets.ORCHADOS_CRON_SECRET == $b.secrets.ORCHADOS_CRON_SECRET and $a.secrets.SIGNUP_HASH_SECRET == $b.secrets.SIGNUP_HASH_SECRET'
check "proxy: no secret in output or summary" no_leaks proxy

# 5. Vault lost orchados_cron_secret: a new cron secret goes to Edge and Vault.
# (Mock: drop the Edge side, which forces the same path.)
ctl drop-secret '{"name":"ORCHADOS_CRON_SECRET"}' >/dev/null
run_and_snap cron TURNSTILE_SITE_KEY="$TS_SITE" TURNSTILE_SECRET_KEY="$TS_SECRET" || { cat "$work/cron.out"; bad "cron run exits 0"; }
check "cron: Edge and Vault equal again" J cron '.vault.orchados_cron_secret == .secrets.ORCHADOS_CRON_SECRET'
check "cron: no deployment for an Edge-only change" J cron '(.deployments | length) == 3'
check "cron: no secret in output or summary" no_leaks cron

# 6. A forbidden Vercel variable fails the run after the summary.
ctl add-vercel-env '{"key":"PAYMENT_FAKE_CHECKOUT","value":"1"}' >/dev/null
if run_and_snap forbidden TURNSTILE_SITE_KEY="$TS_SITE" TURNSTILE_SECRET_KEY="$TS_SECRET"; then bad "forbidden: run fails"; else pass "forbidden: run fails"; fi
check "forbidden: error names the variable" grep -q '::error::.*PAYMENT_FAKE_CHECKOUT' "$work/forbidden.out"
check "forbidden: summary written" grep -q 'Errors' "$work/forbidden.summary"

# 7. Dry run on a fresh account: reads only.
ctl reset >/dev/null
run_and_snap dry DRY_RUN=true || { cat "$work/dry.out"; bad "dry run exits 0"; }
check "dry: no writes" test "$(writes dry)" = ""
check "dry: nothing created" J dry '(.projects | has("demoref000000000000") | not) and .vercel == null'
check "dry: plan printed" bash -c "grep -q 'would create orchados-demo in eu-central-1' '$work/dry.out' && grep -q 'Vercel: would create' '$work/dry.out'"
check "dry: summary marks the dry run" grep -q 'dry run' "$work/dry.summary"

# 8. Dry run against the provisioned account: reads only, reports up to date.
run_and_snap setup >/dev/null 2>&1 || true
run_and_snap dry2 DRY_RUN=true || { cat "$work/dry2.out"; bad "dry2 exits 0"; }
check "dry2: no writes" test "$(writes dry2)" = ""
check "dry2: auth up to date" grep -q 'Auth: up to date' "$work/dry2.out"
check "dry2: no secret in output or summary" no_leaks dry2

# 9. Refusals: a Cloudflare test key, half the Turnstile pair, a bad region.
if run_and_snap dummy TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA; then bad "dummy key refused"; else
  check "dummy key refused" grep -q 'Cloudflare test key' "$work/dummy.out"; fi
if run_and_snap half TURNSTILE_SITE_KEY="$TS_SITE"; then bad "half Turnstile pair refused"; else
  check "half Turnstile pair refused" grep -q 'only one of' "$work/half.out"; fi
if run_and_snap region REGION='eu central'; then bad "bad region refused"; else
  check "bad region refused" grep -q 'not a Supabase region' "$work/region.out"; fi
check "refusals write nothing" test "$(writes region)" = ""

# 10. A paused project fails with a clear message and nothing written.
ctl set-status '{"ref":"demoref000000000000","status":"INACTIVE"}' >/dev/null
if run_and_snap paused; then bad "paused project refused"; else
  check "paused project refused" grep -q 'is INACTIVE; restore it' "$work/paused.out"; fi
check "paused: nothing written" test "$(writes paused)" = ""
check "summary: next steps list the GitHub secrets" grep -q 'DEMO_SUPABASE_ANON_KEY' "$work/setup.summary"

# 11. Without the test project's ref: the token's only organization, else a refusal.
ctl reset >/dev/null
run_and_snap norefdry SUPABASE_PROJECT_REF= DRY_RUN=true || { cat "$work/norefdry.out"; bad "noref dry run exits 0"; }
check "noref dry: no writes" test "$(writes norefdry)" = ""
run_and_snap noref SUPABASE_PROJECT_REF= || { cat "$work/noref.out"; bad "noref exits 0"; }
check "noref: created in the only organization" J noref '.projects.demoref000000000000.organization_id == "org-test"'
ctl reset >/dev/null
ctl add-org '{"id":"org-other"}' >/dev/null
if run_and_snap tworgs SUPABASE_PROJECT_REF=; then bad "two organizations without a ref refused"; else
  check "two organizations without a ref refused" grep -q 'sees 2 organizations' "$work/tworgs.out"; fi
check "tworgs: nothing written" test "$(writes tworgs)" = ""

# --- host=test: shared hosting on the test project (docs/demo-turu.md §15.1) ---
TEST_URL=https://testref000000000000.supabase.co
shared_env=(HOST=test SUPABASE_URL="$TEST_URL" SUPABASE_ANON_KEY=test-anon-public-key
  SUPABASE_PROJECT_REF=testref000000000000 DEMO_DB_PASSWORD= PILOT_SUPABASE_URL=https://pilotref00000000000.supabase.co)
ctl reset >/dev/null
curl -fsS "$base/__ctl/state" -X POST -d '{}' -H 'Content-Type: application/json' >"$work/pristine.json"
# kept NAME: every setting the test site relies on is as before.
kept() {
  same pristine "$1" '($a.test.auth | del(.uri_allow_list)) == ($b.test.auth | del(.uri_allow_list))
    and ($a.test.secrets | to_entries | all(. as $e | $b.test.secrets[$e.key] == $e.value))
    and ($a.test.vault | to_entries | all(. as $e | $b.test.vault[$e.key] == $e.value))'
}

# 12. Shared, fresh: no project, only demo-specific settings on the test project.
run_and_snap sfresh "${shared_env[@]}" || { cat "$work/sfresh.out"; bad "shared fresh exits 0"; }
check "shared: no Supabase project created" bash -c "! grep -q 'POST /sb/v1/projects\$' <<<'$(writes sfresh | tr , '\n')'"
check "shared: demo project not touched" J sfresh '(.projects | has("demoref000000000000") | not) and .secrets == {} and .vault == {} and .db_pass == null'
check "shared: test site settings kept" kept sfresh
check "shared: demo origin added to the redirect list" J sfresh '.test.auth.uri_allow_list
  == "https://orchados.vercel.app/**,http://localhost:3000/**,https://orchados-demo.vercel.app/**"'
check "shared: only DEMO_ hash and proxy secrets added (no Turnstile yet)" same pristine sfresh \
  '(($b.test.secrets | keys) - ($a.test.secrets | keys)) == ["DEMO_SIGNUP_HASH_SECRET","DEMO_SIGNUP_PROXY_SECRET"]
   and ($b.test.secrets.DEMO_SIGNUP_HASH_SECRET | test("^[0-9a-f]{64}$"))'
check "shared: Vault demo_cleanup_url on the test project, cron secret reused" same pristine sfresh \
  '$b.test.vault.demo_cleanup_url == "https://testref000000000000.supabase.co/functions/v1/demo-start"
   and (($b.test.vault | keys) - ($a.test.vault | keys)) == ["demo_cleanup_url"]'
check "shared: Vercel points at the test project" J sfresh '[.vercel_env[] | select(.target == ["production"]) | {(.key): .value}] | add
  | .NEXT_PUBLIC_SUPABASE_URL == "https://testref000000000000.supabase.co"
  and .NEXT_PUBLIC_SUPABASE_ANON_KEY == "test-anon-public-key" and .ORCHADOS_DEMO_ENABLED == "1"
  and .ORCHADOS_SITE_URL == "https://orchados-demo.vercel.app" and (has("SIGNUP_PROXY_SECRET") | not)'
check "shared: DEMO_SIGNUP_PROXY_SECRET sensitive and equal on both sides" J sfresh '.test.secrets.DEMO_SIGNUP_PROXY_SECRET as $s
  | any(.vercel_env[]; .key == "DEMO_SIGNUP_PROXY_SECRET" and .type == "sensitive" and .value == $s)
  and $s != .test.secrets.SIGNUP_PROXY_SECRET'
check "shared: one deployment" J sfresh '(.deployments | length) == 1'
check "shared: summary names the host and DEMO_HOST" bash -c "grep -q 'host: test' '$work/sfresh.summary' && grep -q 'gh variable set DEMO_HOST --body test' '$work/sfresh.summary'"
check "shared: summary asks for no DEMO_SUPABASE_ secret" bash -c "! grep -q 'gh secret set DEMO_SUPABASE_PROJECT_REF' '$work/sfresh.summary'"
check "shared: no secret in output or summary" no_leaks sfresh
cp "$work/sfresh.json" "$work/before-srerun.json"

# 13. Shared rerun: nothing written, nothing rotated, no deployment.
run_and_snap srerun "${shared_env[@]}" DEMO_HOST_VAR=test || { cat "$work/srerun.out"; bad "shared rerun exits 0"; }
check "shared rerun: no writes" test "$(writes srerun)" = ""
check "shared rerun: nothing rotated" same before-srerun srerun '($a.test | del(.vault_updates)) == ($b.test | del(.vault_updates)) and $a.vercel_env == $b.vercel_env'
check "shared rerun: summary sees DEMO_HOST=test" grep -q 'Repository variable `DEMO_HOST=test`' "$work/srerun.summary"

# 14. Shared, Turnstile arrives: DEMO_TURNSTILE_SECRET_KEY, never the test site's key.
run_and_snap sturnstile "${shared_env[@]}" TURNSTILE_SITE_KEY="$TS_SITE" TURNSTILE_SECRET_KEY="$TS_SECRET" \
  || { cat "$work/sturnstile.out"; bad "shared turnstile exits 0"; }
check "shared turnstile: DEMO_TURNSTILE_SECRET_KEY and public mode" J sturnstile --arg t "$TS_SECRET" \
  '.test.secrets.DEMO_TURNSTILE_SECRET_KEY == $t and .test.secrets.ORCHADOS_DEMO_MODE == "public"'
check "shared turnstile: test site settings kept (its TURNSTILE_SECRET_KEY too)" kept sturnstile
check "shared turnstile: only the demo-specific names were sent" J sturnstile '[.log[] | select(.method == "POST" and (.path | endswith("/secrets"))) | .body[].name] == ["DEMO_TURNSTILE_SECRET_KEY","ORCHADOS_DEMO_MODE"]'
check "shared turnstile: Vercel site key, one more deployment" J sturnstile --arg k "$TS_SITE" \
  'any(.vercel_env[]; .key == "NEXT_PUBLIC_TURNSTILE_SITE_KEY" and .value == $k) and (.deployments | length) == 2'
check "shared turnstile: no secret in output or summary" no_leaks sturnstile

# 15. Shared dry run on a fresh account: reads only.
ctl reset >/dev/null
run_and_snap sdry "${shared_env[@]}" DRY_RUN=true || { cat "$work/sdry.out"; bad "shared dry run exits 0"; }
check "shared dry: no writes" test "$(writes sdry)" = ""
check "shared dry: plan printed" grep -q 'would add https://orchados-demo.vercel.app/\*\* to the redirect allow-list' "$work/sdry.out"

# 16. The test project without its cron secret: a warning, nothing generated.
ctl drop-vault '{"ref":"testref000000000000","name":"orchados_cron_secret"}' >/dev/null
run_and_snap scron "${shared_env[@]}" || { cat "$work/scron.out"; bad "shared cron exits 0"; }
check "shared cron: warns" grep -q 'lacks Edge ORCHADOS_CRON_SECRET or Vault orchados_cron_secret' "$work/scron.summary"
check "shared cron: never generates the test project's cron secret" J scron '(.test.vault | has("orchados_cron_secret") | not)
  and .test.secrets.ORCHADOS_CRON_SECRET == "test-cron-SECRET"'
check "shared cron: points at init_cron_secret" grep -q 'init_cron_secret=true' "$work/scron.summary"

# 16a. init_cron_secret with only one side present: refused before any write,
# since the value cannot be read back to copy it.
if run_and_snap sinitedge "${shared_env[@]}" INIT_CRON_SECRET=true; then bad "init, Edge only: refused"; else
  check "init, Edge only: refused" grep -q 'has Edge ORCHADOS_CRON_SECRET but no Vault orchados_cron_secret' "$work/sinitedge.out"; fi
check "init, Edge only: nothing written" test "$(writes sinitedge)" = ""
check "init, Edge only: no Vault write" J sinitedge '[.log[] | select(.path | test("database/query")) | .body.query | select(test("vault\\.create_secret"))] == []
  and (.test.vault | has("orchados_cron_secret") | not) and .test.secrets.ORCHADOS_CRON_SECRET == "test-cron-SECRET"'
ctl reset >/dev/null
ctl drop-secret '{"ref":"testref000000000000","name":"ORCHADOS_CRON_SECRET"}' >/dev/null
if run_and_snap sinitvault "${shared_env[@]}" INIT_CRON_SECRET=true; then bad "init, Vault only: refused"; else
  check "init, Vault only: refused" grep -q 'has Vault orchados_cron_secret but no Edge ORCHADOS_CRON_SECRET' "$work/sinitvault.out"; fi
check "init, Vault only: nothing written" test "$(writes sinitvault)" = ""
check "init, Vault only: Vault kept, Edge still missing" J sinitvault '.test.vault.orchados_cron_secret == "test-cron-SECRET"
  and (.test.secrets | has("ORCHADOS_CRON_SECRET") | not)'
check "init, Vault only: no secret in output" no_leaks sinitvault
if run_and_snap sinitbad "${shared_env[@]}" INIT_CRON_SECRET=yes; then bad "init: a non-boolean value refused"; else
  check "init: a non-boolean value refused" grep -q 'INIT_CRON_SECRET must be true or false' "$work/sinitbad.out"; fi

# 16b. init_cron_secret with both sides missing: one value on Edge and in Vault.
ctl drop-vault '{"ref":"testref000000000000","name":"orchados_cron_secret"}' >/dev/null
run_and_snap sinitdry "${shared_env[@]}" INIT_CRON_SECRET=true DRY_RUN=true || { cat "$work/sinitdry.out"; bad "init dry run exits 0"; }
check "init dry: no writes" test "$(writes sinitdry)" = ""
check "init dry: plans the cron secret" grep -q '(new: .*ORCHADOS_CRON_SECRET' "$work/sinitdry.out"
cp "$work/sinitdry.json" "$work/before-sinit.json"
run_and_snap sinit "${shared_env[@]}" INIT_CRON_SECRET=true || { cat "$work/sinit.out"; bad "init exits 0"; }
check "init: Edge and Vault hold one new value" J sinit '.test.secrets.ORCHADOS_CRON_SECRET as $c
  | ($c | test("^[0-9a-f]{64}$")) and .test.vault.orchados_cron_secret == $c'
check "init: the test site's other secrets kept" same before-sinit sinit \
  '($a.test.secrets | del(.ORCHADOS_CRON_SECRET) | to_entries | all(. as $e | $b.test.secrets[$e.key] == $e.value))
   and $a.test.vault.send_notifications_url == $b.test.vault.send_notifications_url'
check "init: summary lists it as generated" grep -q 'Generated .*ORCHADOS_CRON_SECRET' "$work/sinit.summary"
check "init: no warning about the cron secret" bash -c "! grep -q 'lacks Edge ORCHADOS_CRON_SECRET' '$work/sinit.summary'"
check "init: no secret in output or summary" no_leaks sinit
cp "$work/sinit.json" "$work/before-sinitkeep.json"

# 16c. init_cron_secret with both sides present: nothing touched.
run_and_snap sinitkeep "${shared_env[@]}" INIT_CRON_SECRET=true || { cat "$work/sinitkeep.out"; bad "init keep exits 0"; }
check "init keep: no writes" test "$(writes sinitkeep)" = ""
check "init keep: cron secret unchanged" same before-sinitkeep sinitkeep \
  '$a.test.secrets.ORCHADOS_CRON_SECRET == $b.test.secrets.ORCHADOS_CRON_SECRET
   and $a.test.vault.orchados_cron_secret == $b.test.vault.orchados_cron_secret
   and ($b.test.vault_updates // [] | index("orchados_cron_secret") | not)'
check "init keep: says it kept them" grep -q 'has both ORCHADOS_CRON_SECRET and Vault orchados_cron_secret; kept' "$work/sinitkeep.out"

# 16b. The test project still has ORCHADOS_DEMO_MODE=dev from a smoke test and a
# demo_cleanup_url from an earlier run; no Turnstile keys. dev would open the
# demo without the live-key rule, so it is deleted; the URL is updated in place.
ctl reset >/dev/null
ctl set-secret '{"ref":"testref000000000000","name":"ORCHADOS_DEMO_MODE","value":"dev"}' >/dev/null
curl -fsS -X POST -H 'Authorization: Bearer sb-token-SECRET' -H 'Content-Type: application/json' \
  -d "{\"query\":\"do \$\$ begin\n  if exists (select 1 from vault.secrets where name = 'demo_cleanup_url') then\n    perform vault.update_secret((select id from vault.secrets where name = 'demo_cleanup_url'), 'https://old.example/x');\n  else\n    perform vault.create_secret('https://old.example/x', 'demo_cleanup_url');\n  end if;\nend \$\$;\"}" \
  "$base/sb/v1/projects/testref000000000000/database/query" >/dev/null
run_and_snap sdevdry "${shared_env[@]}" DRY_RUN=true || { cat "$work/sdevdry.out"; bad "shared dev dry run exits 0"; }
check "shared dev dry: no writes" test "$(writes sdevdry)" = ""
check "shared dev dry: plans to delete ORCHADOS_DEMO_MODE" grep -q 'would delete ORCHADOS_DEMO_MODE' "$work/sdevdry.out"
run_and_snap sdev "${shared_env[@]}" || { cat "$work/sdev.out"; bad "shared dev exits 0"; }
check "shared dev: ORCHADOS_DEMO_MODE deleted, the test site's secrets kept" J sdev '(.test.secrets | has("ORCHADOS_DEMO_MODE") | not)
  and .test.secrets.TURNSTILE_SECRET_KEY == "1x0000000000000000000000000000000AA" and .test.secrets.SIGNUP_PROXY_SECRET == "test-proxy-SECRET"'
check "shared dev: only ORCHADOS_DEMO_MODE was deleted" J sdev '[.log[] | select(.method == "DELETE") | {path, body}]
  == [{"path": "/sb/v1/projects/testref000000000000/secrets", "body": ["ORCHADOS_DEMO_MODE"]}]'
check "shared dev: summary says it was deleted" grep -q '`ORCHADOS_DEMO_MODE` deleted in this run' "$work/sdev.summary"
check "shared dev: existing demo_cleanup_url updated in place" J sdev '.test.vault.demo_cleanup_url == "https://testref000000000000.supabase.co/functions/v1/demo-start"
  and (.test.vault_updates | index("demo_cleanup_url"))'
check "shared dev: no secret in output or summary" no_leaks sdev
# A public mode from an earlier run is kept without the keys in GitHub; the summary says so.
ctl set-secret '{"ref":"testref000000000000","name":"ORCHADOS_DEMO_MODE","value":"public"}' >/dev/null
run_and_snap spublic "${shared_env[@]}" || { cat "$work/spublic.out"; bad "shared public exits 0"; }
check "shared public: kept" J spublic '.test.secrets.ORCHADOS_DEMO_MODE == "public" and ([.log[] | select(.method == "DELETE")] == [])'
check "shared public: summary does not claim the demo is closed" bash -c "grep -q 'ORCHADOS_DEMO_MODE=public\` from an earlier run is kept' '$work/spublic.summary' && ! grep -q 'demo stays closed' '$work/spublic.summary'"

# 17. Shared refusals: the pilot (by URL, ref or name), a missing or unparsable
# pilot URL, a missing test ref, a foreign anon key, refs that disagree, a
# missing URL, a Cloudflare test key. Nothing is written.
ctl reset >/dev/null
for case in \
  "pilot-url|the host is the pilot project|SUPABASE_URL=https://pilotref00000000000.supabase.co" \
  "pilot-ref|the host is the pilot project|SUPABASE_PROJECT_REF=pilotref00000000000" \
  "pilot-name|the pilot never hosts the demo|SUPABASE_URL=https://pilotref00000000000.supabase.co SUPABASE_PROJECT_REF=pilotref00000000000 PILOT_SUPABASE_URL=https://elsewhere000000000.supabase.co" \
  "nopilot|PILOT_SUPABASE_URL is missing|PILOT_SUPABASE_URL=" \
  "badpilot|PILOT_SUPABASE_URL is not https|PILOT_SUPABASE_URL=https://pilot.example.com" \
  "snoref|SUPABASE_PROJECT_REF is missing|SUPABASE_PROJECT_REF=" \
  "anon|is not the anon or publishable key|SUPABASE_ANON_KEY=anon-public-key" \
  "refs|name different projects|SUPABASE_PROJECT_REF=otherref" \
  "nourl|SUPABASE_URL is missing|SUPABASE_URL=" \
  "sdummy|Cloudflare test key|TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA"; do
  IFS='|' read -r cname want extra <<<"$case"
  read -r -a extra_env <<<"$extra"
  if run_and_snap "$cname" "${shared_env[@]}" "${extra_env[@]}"; then bad "shared refuses: $cname"; else
    check "shared refuses: $cname" grep -q -- "$want" "$work/$cname.out"; fi
  check "shared refuses: $cname writes nothing" test "$(writes "$cname")" = ""
done
check "shared refusals: pilot never read beyond its record" J sdummy '.projects.pilotref00000000000.status == "ACTIVE_HEALTHY"'
check "refusal: unknown host" bash -c "! env -i PATH=\"\$PATH\" HOST=both bash '$here/provision-demo.sh' >/dev/null 2>&1"

# 18. Moving to a separate project: the shared hosting's DEMO_SIGNUP_PROXY_SECRET
# on Vercel would win over the new SIGNUP_PROXY_SECRET, so the run fails on it;
# the summary reminds that DEMO_HOST is still test.
run_and_snap mshared "${shared_env[@]}" >/dev/null 2>&1 || { cat "$work/mshared.out"; bad "move: shared setup exits 0"; }
if run_and_snap move DEMO_HOST_VAR=test; then bad "move: leftover DEMO_SIGNUP_PROXY_SECRET fails the run"; else
  check "move: leftover DEMO_SIGNUP_PROXY_SECRET fails the run" grep -q '::error::.*DEMO_SIGNUP_PROXY_SECRET' "$work/move.out"; fi
check "move: the separate project is created" J move '.projects.demoref000000000000.name == "orchados-demo"'
check "move: summary says DEMO_HOST is still test" grep -q 'DEMO_HOST` is still `test`' "$work/move.summary"
check "move: no secret in output or summary" no_leaks move

# --- scripts/demo-lock-check.sh ------------------------------------------------
# lock NAME MODE REF: runs the check against the mock; output in $work/NAME.lock.
lock() {
  env -i PATH="$PATH" SUPABASE_API="$base/sb" SUPABASE_ACCESS_TOKEN=sb-token-SECRET SUPABASE_PROJECT_REF="$3" \
    bash "$here/demo-lock-check.sh" "$2" >"$work/$1.lock" 2>&1
}
locks() { ctl set-locks "{\"ref\":\"$1\",\"locks\":$2}" >/dev/null; }
T=testref000000000000 D=demoref000000000000
ctl reset >/dev/null
run_and_snap lsetup >/dev/null 2>&1 || true   # separate demo project with its secrets

# The test project: its orgs, sign-ups and fake payments are accepted.
locks $T '{"real_orgs":3,"billing_orgs":2}'
check "lock shared: the test site's orgs and payments pass" lock l1 shared $T
# The test site's own TURNSTILE_SECRET_KEY (a Cloudflare test key), SIGNUP_HASH_SECRET
# and SIGNUP_PROXY_SECRET stay on the project throughout: they never count for the demo.
sec() { ctl set-secret "{\"ref\":\"$1\",\"name\":\"$2\",\"value\":\"$3\"}" >/dev/null; }
locks $T '{"real_orgs":3,"enabled_demo_orgs":1,"cleanup_url":1,"cron_secret":1}'
if lock l2 shared $T; then bad "lock shared: enabled demo without ORCHADOS_DEMO_MODE fails"; else
  check "lock shared: enabled demo without ORCHADOS_DEMO_MODE fails" grep -q 'ORCHADOS_DEMO_MODE secret is missing' "$work/l2.lock"; fi
sec $T ORCHADOS_DEMO_MODE public
if lock l3 shared $T; then bad "lock shared: the test site's secrets never stand in for the DEMO_ ones"; else
  check "lock shared: the test site's secrets never stand in for the DEMO_ ones" bash -c "
    grep -q 'DEMO_TURNSTILE_SECRET_KEY secret is missing' '$work/l3.lock' && grep -q 'DEMO_SIGNUP_HASH_SECRET secret is missing' '$work/l3.lock' \
    && grep -q 'DEMO_SIGNUP_PROXY_SECRET secret is missing' '$work/l3.lock'"; fi
sec $T DEMO_TURNSTILE_SECRET_KEY 0x4AAAAAAAlive-demo-SECRET
sec $T DEMO_SIGNUP_HASH_SECRET demo-hash-SECRET
sec $T DEMO_SIGNUP_PROXY_SECRET demo-proxy-SECRET
check "lock shared: enabled demo with its DEMO_ secrets and public mode passes" lock l4 shared $T
sec $T ORCHADOS_DEMO_MODE dev
if lock l4b shared $T; then bad "lock shared: ORCHADOS_DEMO_MODE=dev fails"; else
  check "lock shared: ORCHADOS_DEMO_MODE=dev fails" grep -q "ORCHADOS_DEMO_MODE on .* is not 'public'" "$work/l4b.lock"; fi
sec $T ORCHADOS_DEMO_MODE public
for dummy in 1x0000000000000000000000000000000AA 2x0000000000000000000000000000000AA 3x00000AA; do
  sec $T DEMO_TURNSTILE_SECRET_KEY "$dummy"
  if lock l4c shared $T; then bad "lock shared: dummy Turnstile key ${dummy:0:2}… fails"; else
    check "lock shared: dummy Turnstile key ${dummy:0:2}… fails" grep -q 'DEMO_TURNSTILE_SECRET_KEY on .* is a Cloudflare test key' "$work/l4c.lock"; fi
done
sec $T DEMO_TURNSTILE_SECRET_KEY 0x4AAAAAAAlive-demo-SECRET
ctl drop-secret "{\"ref\":\"$T\",\"name\":\"DEMO_SIGNUP_PROXY_SECRET\"}" >/dev/null
if lock l5 shared $T; then bad "lock shared: no DEMO_SIGNUP_PROXY_SECRET fails"; else
  check "lock shared: no DEMO_SIGNUP_PROXY_SECRET fails" grep -q 'DEMO_SIGNUP_PROXY_SECRET secret is missing' "$work/l5.lock"; fi
locks $T '{"enabled_demo_orgs":1,"cleanup_url":0,"cron_secret":1}'
if lock l6 shared $T; then bad "lock shared: no demo_cleanup_url fails"; else
  check "lock shared: no demo_cleanup_url fails" grep -q 'no demo_cleanup_url' "$work/l6.lock"; fi
locks $T '{"demo_billing_orgs":1}'
if lock l7 shared $T; then bad "lock shared: a demo org taking payments fails"; else
  check "lock shared: a demo org taking payments fails" grep -q 'demo org(s) accept sign-ups' "$work/l7.lock"; fi
locks $T '{"demo_users_outside":2}'
if lock l8 shared $T; then bad "lock shared: a demo account outside the demo org fails"; else
  check "lock shared: a demo account outside the demo org fails" grep -q '2 demo account(s)' "$work/l8.lock"; fi

# The self-hosted robot check (CAPTCHA_PROVIDER=altcha): its key replaces the
# Turnstile secret; an unknown provider fails.
locks $T '{"real_orgs":3,"enabled_demo_orgs":1,"cleanup_url":1,"cron_secret":1}'
sec $T DEMO_SIGNUP_PROXY_SECRET demo-proxy-SECRET
sec $T DEMO_TURNSTILE_SECRET_KEY 1x0000000000000000000000000000000AA
sec $T DEMO_CAPTCHA_PROVIDER altcha
if lock la1 shared $T; then bad "lock shared: altcha without DEMO_ALTCHA_HMAC_KEY fails"; else
  check "lock shared: altcha without DEMO_ALTCHA_HMAC_KEY fails" grep -q 'DEMO_ALTCHA_HMAC_KEY secret is missing' "$work/la1.lock"; fi
sec $T DEMO_ALTCHA_HMAC_KEY altcha-demo-SECRET-0123456789abcdef
check "lock shared: altcha with its key passes; the Turnstile test key no longer counts" lock la2 shared $T
sec $T DEMO_CAPTCHA_PROVIDER hcaptcha
if lock la3 shared $T; then bad "lock shared: an unknown CAPTCHA_PROVIDER fails"; else
  check "lock shared: an unknown CAPTCHA_PROVIDER fails" grep -q 'neither turnstile nor altcha' "$work/la3.lock"; fi
ctl drop-secret "{\"ref\":\"$T\",\"name\":\"DEMO_CAPTCHA_PROVIDER\"}" >/dev/null
sec $T DEMO_TURNSTILE_SECRET_KEY 0x4AAAAAAAlive-demo-SECRET

# The separate demo project: strict.
locks $D '{}'
check "lock separate: a clean demo project passes" lock l9 separate $D
locks $D '{"real_orgs":1}'
if lock l10 separate $D; then bad "lock separate: a real org fails"; else
  check "lock separate: a real org fails" grep -q 'not registered in private.demo_org' "$work/l10.lock"; fi
locks $D '{"enabled_demo_orgs":1,"cleanup_url":1,"cron_secret":1}'
if lock l11 separate $D; then bad "lock separate: enabled without Turnstile fails (no DEMO_ stand-in)"; else
  check "lock separate: enabled without Turnstile fails (no DEMO_ stand-in)" grep -q 'TURNSTILE_SECRET_KEY secret is missing' "$work/l11.lock"; fi
sec $D ORCHADOS_DEMO_MODE public
sec $D TURNSTILE_SECRET_KEY 1x0000000000000000000000000000000AA
if lock l12 separate $D; then bad "lock separate: a dummy Turnstile key fails"; else
  check "lock separate: a dummy Turnstile key fails" grep -q 'TURNSTILE_SECRET_KEY on .* is a Cloudflare test key' "$work/l12.lock"; fi
check "lock: no secret value in the output" bash -c "! grep -qE 'sb-token-SECRET|(test|demo)-(hash|proxy|cron)-SECRET|live-demo-SECRET|altcha-demo-SECRET' '$work'/l*.lock"

# --- scripts/retention-check.sh -------------------------------------------------
# retention NAME MODE REF: runs the check against the mock; output in $work/NAME.ret.
retention() {
  env -i PATH="$PATH" SUPABASE_API="$base/sb" SUPABASE_ACCESS_TOKEN=sb-token-SECRET SUPABASE_PROJECT_REF="$3" \
    bash "$here/retention-check.sh" "$2" >"$work/$1.ret" 2>&1
}
ret() { ctl set-retention "{\"ref\":\"$1\",\"retention\":$2}" >/dev/null; }
# The test project's ORCHADOS_CRON_SECRET is test-cron-SECRET (mock state).
cron_digest=$(printf 'test-cron-SECRET' | sha256sum | cut -d' ' -f1)
ret $T '{"signup_orgs":0}'
check "retention signup: no org accepts sign-ups passes" retention r1 signup $T
ok_ret="{\"signup_orgs\":1,\"signup_cleanup_jobs\":1,\"signup_cleanup_url\":1,\"cron_secret_digest\":\"$cron_digest\"}"
ret $T "$ok_ret"
check "retention signup: open sign-ups with the clean-up set up pass" retention r2 signup $T
for broken in signup_cleanup_jobs signup_cleanup_url; do
  ret $T "$(jq -c --arg k "$broken" '.[$k] = 0' <<<"$ok_ret")"
  if retention r3 signup $T; then bad "retention signup: no $broken fails"; else
    check "retention signup: no $broken fails" grep -q '::error::accepts_signups is on' "$work/r3.ret"; fi
done
ret $T "$(jq -c '.cron_secret_digest = ""' <<<"$ok_ret")"
if retention r4 signup $T; then bad "retention signup: no Vault cron secret fails"; else
  check "retention signup: no Vault cron secret fails" grep -q 'Vault has no orchados_cron_secret' "$work/r4.ret"; fi
ret $T "$(jq -c '.cron_secret_digest = "0000"' <<<"$ok_ret")"
if retention r5 signup $T; then bad "retention signup: a Vault cron secret other than the Edge one fails"; else
  check "retention signup: a Vault cron secret other than the Edge one fails" grep -q 'differs from the ORCHADOS_CRON_SECRET' "$work/r5.ret"; fi
ret $D "$(jq -c '.cron_secret_digest = "0000"' <<<"$ok_ret")"
ctl drop-secret "{\"ref\":\"$D\",\"name\":\"ORCHADOS_CRON_SECRET\"}" >/dev/null
if retention r6 signup $D; then bad "retention signup: no ORCHADOS_CRON_SECRET Edge secret fails"; else
  check "retention signup: no ORCHADOS_CRON_SECRET Edge secret fails" grep -q 'ORCHADOS_CRON_SECRET Edge secret is missing' "$work/r6.ret"; fi
ret $T '{"audit_purge_jobs":1,"audit_rows_old":0}'
check "retention audit: an active purge job and no old rows pass" retention r7 audit $T
ret $T '{"audit_purge_jobs":0,"audit_rows_old":0}'
if retention r8 audit $T; then bad "retention audit: no purge job fails"; else
  check "retention audit: no purge job fails" grep -q 'auth-audit-log-purge is missing or inactive' "$work/r8.ret"; fi
ret $T '{"audit_purge_jobs":1,"audit_rows_old":12}'
if retention r9 audit $T; then bad "retention audit: rows older than 31 days fail"; else
  check "retention audit: rows older than 31 days fail" grep -q '12 row(s) older than 31 days' "$work/r9.ret"; fi
check "retention: usage error without a mode" bash -c "! bash '$here/retention-check.sh' >/dev/null 2>&1"
check "retention: no secret value in the output" bash -c "! grep -qE 'sb-token-SECRET|test-cron-SECRET' '$work'/r*.ret"

# Every SQL text the scripts sent; the mock answered them blindly. Each kind
# must be there, then they run on a real Postgres when DB_URL is set
# (scripts/test-script-sql.sh; CI sets it).
ctl queries >"$work/queries.json"
check "sql: Vault name lookup, Vault upsert, lock and retention queries were sent" jq -e '
  any(.[]; startswith("select name from vault.secrets")) and any(.[]; test("perform vault\\.create_secret"))
  and any(.[]; test("as real_orgs")) and any(.[]; test("as signup_orgs"))' "$work/queries.json" >/dev/null
check "sql: the test project's cron secret init (Vault upsert next to demo_cleanup_url) was sent" jq -e '
  any(.[]; test("testref000000000000\\.supabase\\.co/functions/v1/demo-start") and test("vault\\.create_secret\\(\u0027[0-9a-f]{64}\u0027, \u0027orchados_cron_secret\u0027\\)"))' \
  "$work/queries.json" >/dev/null
if [ -n "${DB_URL:-}" ]; then
  check "sql: every query runs on Postgres" bash "$here/test-script-sql.sh" "$work/queries.json"
else
  echo "skip - sql: DB_URL not set, queries not run on Postgres"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
