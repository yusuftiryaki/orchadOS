#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs in single quotes
# Tests scripts/provision-demo.sh against a mock Supabase Management API and
# Vercel API (scripts/tests/provision_demo_mock.py): a fresh run, an idempotent
# second run, Turnstile arriving later, a dry run, a lost shared secret, and the
# refusals. Every run's output and job summary is checked for secret values.
# Needs bash, curl, jq, openssl and python3; no network.
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
    DEMO_DB_PASSWORD="$DB_PASSWORD" VERCEL_TOKEN=vc-token-SECRET VERCEL_TEAM_ID=team_test \
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
    (.secrets | to_entries[] | select(.key | test("SECRET")) | .value),
    (.vault.orchados_cron_secret // empty),
    (.vercel_env[] | select(.key == "SIGNUP_PROXY_SECRET") | .value)' "$work/$name.json")
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

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
