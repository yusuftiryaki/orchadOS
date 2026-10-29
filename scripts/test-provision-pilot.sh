#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs in single quotes
# Tests scripts/provision-pilot-signup.sh and scripts/vault-signup-cleanup.sh
# against a mock Supabase Management API and Vercel API
# (scripts/tests/provision_pilot_mock.py): opening sign-ups on a pilot without
# them, an idempotent second run, Netgsm arriving, the Send SMS hook set up,
# REQUIRE_SMS, a cron secret out of step, closing sign-ups, a dry run, and the
# refusals (locks, test keys, missing migrations, the wrong project). Every
# run's output and job summary is checked for secret values. Every SQL text
# sent is then run on Postgres when DB_URL is set (scripts/test-script-sql.sh;
# the sign-up switch itself runs in scripts/test-demo-lock-sql.sh).
# Needs bash, curl, jq, openssl and python3 (psql with DB_URL); no network.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'kill "$mock_pid" 2>/dev/null || true; [ -n "${KEEP:-}" ] || rm -rf "$work"' EXIT

python3 "$here/tests/provision_pilot_mock.py" "$work/port" &
mock_pid=$!
for _ in $(seq 50); do [ -s "$work/port" ] && break; sleep 0.1; done
port=$(cat "$work/port")
base="http://127.0.0.1:$port"

ctl() { curl -fsS -X POST -H 'Content-Type: application/json' -d "${2:-{\}}" "$base/__ctl/$1" >/dev/null; }

failures=0
pass() { echo "ok   - $*"; }
bad() { echo "FAIL - $*"; failures=$((failures + 1)); }
check() { local name=$1; shift; if "$@"; then pass "$name"; else bad "$name"; fi; }

P=pilotref00000000000
TS_SECRET="0x4AAAAAAAlive-pilot-turnstile-SECRET"
TS_SITE="0x4AAAAAAApilot-site-key"
NETGSM=(NETGSM_USERCODE=8501234567 NETGSM_PASSWORD=netgsm-pass-SECRET NETGSM_MSGHEADER=ORCHADOS)

# run NAME [VAR=value ...]: runs the script with a cleared request log; keeps
# its output, summary, GitHub output and the mock state.
run() {
  local name=$1 rc
  ctl clear-log
  : >"$work/$name.ghout"
  set +e
  env -i PATH="$PATH" HOME="$HOME" \
    SUPABASE_API="$base/sb" VERCEL_API="$base/vc" \
    SUMMARY_FILE="$work/$name.summary" OUTPUT_FILE="$work/$name.ghout" \
    SUPABASE_ACCESS_TOKEN=sb-token-SECRET PILOT_SUPABASE_PROJECT_REF=$P \
    PILOT_SUPABASE_URL="https://$P.supabase.co" TEST_SUPABASE_URL=https://testref000000000000.supabase.co \
    VERCEL_TOKEN=vc-token-SECRET VERCEL_TEAM_ID=team_test VERCEL_PROJECT_ID=prj_pilot \
    TURNSTILE_SITE_KEY="$TS_SITE" TURNSTILE_SECRET_KEY="$TS_SECRET" \
    "${@:2}" bash "$here/provision-pilot-signup.sh" >"$work/$name.out" 2>&1
  rc=$?
  set -e
  curl -fsS "$base/__ctl/state" -X POST -d '{}' -H 'Content-Type: application/json' >"$work/$name.json"
  return $rc
}
J() { local n=$1; shift; jq -e "$@" "$work/$n.json" >/dev/null; }
same() { jq -e -n --slurpfile a "$work/$1.json" --slurpfile b "$work/$2.json" "\$a[0] as \$a | \$b[0] as \$b | $3" >/dev/null; }
writes() { jq -r '[.log[] | select(.method != "GET" and (.path | test("database/query") | not)) | "\(.method) \(.path)"] | join(",")' "$work/$1.json"; }
sql_writes() { jq -r '[.log[] | select(.path | test("database/query")) | .body.query | select(test("^select") | not)] | length' "$work/$1.json"; }
venv() { jq -r --arg k "$2" 'first(.vercel_env[] | select(.key == $k and (.target | index("production")))) | .value // ""' "$work/$1.json"; }
refused() { # NAME PATTERN [VAR=value ...]: the run fails with PATTERN and writes nothing.
  local name=$1 pattern=$2
  if run "$name" "${@:3}"; then bad "$name: fails"; return; fi
  check "$name: fails with '$pattern'" grep -q -- "$pattern" "$work/$name.out"
  check "$name: writes nothing" test -z "$(writes "$name")"
  check "$name: no SQL write" test "$(sql_writes "$name")" = 0
}

# No secret value in the output or the summary.
no_leaks() {
  local name=$1 v
  local values=(sb-token-SECRET vc-token-SECRET "$TS_SECRET" netgsm-pass-SECRET smtp-SECRET)
  while IFS= read -r v; do [ -n "$v" ] && values+=("$v"); done < <(jq -r '
    (.secrets | to_entries[] | select(.key | test("SECRET|PASSWORD")) | .value),
    (.vault.orchados_cron_secret // empty), (.auth.hook_send_sms_secrets // empty),
    (.vercel_env[] | select(.type == "sensitive") | .value)' "$work/$name.json")
  for v in "${values[@]}"; do
    if grep -qF -- "$v" "$work/$name.out" "$work/$name.summary" 2>/dev/null; then
      echo "  leaked: ${v:0:6}…"; return 1
    fi
  done
}

# 1. Open: secrets, Vault, Vercel, accepts_signups, one deployment of release.
run open || { cat "$work/open.out"; bad "open: exits 0"; }
check "open: Edge sign-up secrets" J open --arg t "$TS_SECRET" '.secrets | .TURNSTILE_SECRET_KEY == $t
  and .PORTAL_BASE_URL == "https://orchados-pilot.vercel.app" and (.SIGNUP_HASH_SECRET | test("^[0-9a-f]{64}$"))
  and (.SIGNUP_PROXY_SECRET | test("^[0-9a-f]{64}$")) and (.ORCHADOS_CRON_SECRET | test("^[0-9a-f]{64}$"))'
check "open: no fake payment, demo or captcha bypass secret" J open '.secrets | (has("PAYMENT_FAKE_ALLOWED") or has("SIGNUP_TURNSTILE_DISABLED") or has("ORCHADOS_DEMO_MODE") or has("CAPTCHA_PROVIDER")) | not'
check "open: MESSAGE_PROVIDER=record kept without Netgsm" J open '.secrets.MESSAGE_PROVIDER == "record"'
check "open: Vault URLs and cron secret equal to Edge" J open --arg p $P '.vault.signup_cleanup_url == "https://\($p).supabase.co/functions/v1/customer-signup"
  and .vault.contract_documents_sweep_url == "https://orchados-pilot.vercel.app/sistem/sozlesme-tarama"
  and .vault.orchados_cron_secret == .secrets.ORCHADOS_CRON_SECRET'
check "open: Vercel flag, site key, demo and site URL" J open --arg k "$TS_SITE" '[.vercel_env[] | select(.target == ["production"]) | {(.key): .value}] | add
  | .ORCHADOS_SIGNUP_ENABLED == "1" and .NEXT_PUBLIC_TURNSTILE_SITE_KEY == $k
  and .ORCHADOS_DEMO_URL == "https://orchados-demo.vercel.app/demo" and .ORCHADOS_SITE_URL == "https://orchados-pilot.vercel.app"'
check "open: Vercel proxy and cron secrets sensitive and equal to Edge" J open '.secrets as $s
  | any(.vercel_env[]; .key == "SIGNUP_PROXY_SECRET" and .type == "sensitive" and .value == $s.SIGNUP_PROXY_SECRET)
  and any(.vercel_env[]; .key == "ORCHADOS_CRON_SECRET" and .type == "sensitive" and .value == $s.ORCHADOS_CRON_SECRET)'
check "open: never PAYMENT_FAKE_CHECKOUT" J open 'any(.vercel_env[]; .key == "PAYMENT_FAKE_CHECKOUT") | not'
check "open: accepts_signups on the only org" J open '.db.signup_org == "b0000000-0000-4000-8000-000000000001"'
check "open: one production deployment of release" J open '(.deployments | length) == 1
  and .deployments[0].request.target == "production" and .deployments[0].request.gitSource.ref == "release"
  and .deployments[0].request.project == "prj_pilot"'
check "open: sms_ready=false without Netgsm" grep -qx 'sms_ready=false' "$work/open.ghout"
check "open: loud SMS warning" grep -q '::warning::sms_ready=false' "$work/open.out"
check "open: summary lists the Netgsm secrets to provide" grep -q 'PILOT_NETGSM_USERCODE' "$work/open.summary"
check "open: summary asks for the Turnstile hostname" grep -q 'orchados-pilot.vercel.app.*Hostnames\|Hostnames.*orchados-pilot' "$work/open.summary"
check "open: Auth untouched (hook already set up)" J open '[.log[] | select(.method == "PATCH")] | length == 0'
check "open: test project never called" J open 'all(.log[]; .path | test("testref") | not)'
check "open: no secret in output or summary" no_leaks open
cp "$work/open.json" "$work/before-rerun.json"

# 2. Rerun: nothing changes, no deployment.
run rerun || { cat "$work/rerun.out"; bad "rerun: exits 0"; }
check "rerun: no API write" test -z "$(writes rerun)"
check "rerun: no SQL write" test "$(sql_writes rerun)" = 0
check "rerun: secrets, Vault and Vercel unchanged" same before-rerun rerun '$a.secrets == $b.secrets and $a.vault == $b.vault and $a.vercel_env == $b.vercel_env'
check "rerun: says deployment not needed" grep -q 'Vercel deployment: not needed' "$work/rerun.out"
run redeploy REDEPLOY=true || bad "redeploy: exits 0"
check "redeploy: one more deployment, nothing else written" bash -c "[ \"\$(jq '.deployments | length' '$work/redeploy.json')\" = 2 ] && [ \"$(writes redeploy)\" = 'POST /vc/v13/deployments' ]"

# 3. Netgsm arrives: its secrets, MESSAGE_PROVIDER=record removed, SMS ready.
run netgsm "${NETGSM[@]}" || { cat "$work/netgsm.out"; bad "netgsm: exits 0"; }
check "netgsm: Edge secrets set" J netgsm '.secrets | .NETGSM_USERCODE == "8501234567" and .NETGSM_PASSWORD == "netgsm-pass-SECRET" and .NETGSM_MSGHEADER == "ORCHADOS"'
check "netgsm: MESSAGE_PROVIDER removed" J netgsm '.secrets | has("MESSAGE_PROVIDER") | not'
check "netgsm: sms_ready=true" grep -qx 'sms_ready=true' "$work/netgsm.ghout"
check "netgsm: no SMS warning" bash -c "! grep -q 'sms_ready=false' '$work/netgsm.out'"
check "netgsm: no deployment (Edge only)" J netgsm '(.deployments | length) == 2'
check "netgsm: no secret in output or summary" no_leaks netgsm
run netgsm2 "${NETGSM[@]}" || bad "netgsm2: exits 0"
check "netgsm2: rerun writes nothing" test -z "$(writes netgsm2)"
run netgsm3 || bad "netgsm3: exits 0"
check "netgsm3: sms_ready=true from the Edge secrets alone" grep -qx 'sms_ready=true' "$work/netgsm3.ghout"
if run partial NETGSM_USERCODE=x; then bad "partial Netgsm: fails"; else
  check "partial Netgsm: fails" grep -q 'only some of PILOT_NETGSM' "$work/partial.out"; fi

# 4. The Send SMS hook not set up: reported; init_sms_hook sets both sides.
ctl reset
ctl patch '{"auth":{"hook_send_sms_enabled":false}}'
run nohook "${NETGSM[@]}" || bad "nohook: exits 0"
check "nohook: sms_ready=false" grep -qx 'sms_ready=false' "$work/nohook.ghout"
check "nohook: names the hook" grep -q 'Send SMS hook' "$work/nohook.summary"
if run require "${NETGSM[@]}" REQUIRE_SMS=true; then bad "require_sms: fails"; else
  check "require_sms: fails" grep -q 'REQUIRE_SMS=true and SMS is not ready' "$work/require.out"; fi
check "require_sms: writes nothing" test -z "$(writes require)"
run hook "${NETGSM[@]}" INIT_SMS_HOOK=true REQUIRE_SMS=true || { cat "$work/hook.out"; bad "hook: exits 0"; }
check "hook: Auth hook on send-sms with the Edge secret" J hook --arg p $P '.auth.hook_send_sms_enabled == true
  and .auth.hook_send_sms_uri == "https://\($p).supabase.co/functions/v1/send-sms"
  and .auth.hook_send_sms_secrets == .secrets.SEND_SMS_HOOK_SECRET
  and (.secrets.SEND_SMS_HOOK_SECRET | test("^v1,whsec_[A-Za-z0-9+/]{43}=$"))'
check "hook: sms_ready=true" grep -qx 'sms_ready=true' "$work/hook.ghout"
check "hook: no secret in output or summary" no_leaks hook
run hook2 "${NETGSM[@]}" INIT_SMS_HOOK=true || bad "hook2: exits 0"
check "hook2: a set-up hook is not rotated" test -z "$(writes hook2)"

# 5. Cron secret out of step (Vault differs from Edge): one new value everywhere.
ctl patch '{"vault":{"orchados_cron_secret":"stale-cron-SECRET"}}'
run cron "${NETGSM[@]}" || bad "cron: exits 0"
check "cron: Edge, Vault and Vercel hold one new value" J cron '.secrets.ORCHADOS_CRON_SECRET as $c
  | ($c != "stale-cron-SECRET") and .vault.orchados_cron_secret == $c
  and any(.vercel_env[]; .key == "ORCHADOS_CRON_SECRET" and .value == $c)'
check "cron: proxy secret not rotated" same hook cron '$a.secrets.SIGNUP_PROXY_SECRET == $b.secrets.SIGNUP_PROXY_SECRET'
check "cron: redeploys" J cron '(.deployments | length) > 1'

# 6. Dry run on a fresh pilot: reads only.
ctl reset
run dry DRY_RUN=true || { cat "$work/dry.out"; bad "dry: exits 0"; }
check "dry: writes nothing" test -z "$(writes dry)"
check "dry: no SQL write" test "$(sql_writes dry)" = 0
check "dry: says what it would do" bash -c "grep -q 'would set' '$work/dry.out' && grep -q 'would turn on' '$work/dry.out' && grep -q 'dry run' '$work/dry.summary'"

# 7. Close (rollback): accepts_signups off, the flag removed, one deployment.
run open2 || bad "open2: exits 0"
run close SIGNUPS=off TURNSTILE_SITE_KEY= TURNSTILE_SECRET_KEY= || { cat "$work/close.out"; bad "close: exits 0"; }
check "close: accepts_signups off" J close '.db.signup_org == ""'
check "close: ORCHADOS_SIGNUP_ENABLED removed" test -z "$(venv close ORCHADOS_SIGNUP_ENABLED)"
check "close: secrets and Vault kept" same open2 close '$a.secrets == $b.secrets and $a.vault == $b.vault'
check "close: redeploys" J close '(.deployments | length) == 2'
run close2 SIGNUPS=off || bad "close2: exits 0"
check "close2: rerun writes nothing" test -z "$(writes close2)"

# 8. Refusals: nothing is written.
ctl reset
refused testkey 'Cloudflare test key' TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
refused nokeys 'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are both needed' TURNSTILE_SITE_KEY=
refused wrongurl 'must name the same project' PILOT_SUPABASE_URL=https://other0000000000000.supabase.co
refused testref "the test project's ref" PILOT_SUPABASE_PROJECT_REF=testref000000000000 PILOT_SUPABASE_URL=https://testref000000000000.supabase.co
ctl patch '{"secrets":{"PAYMENT_FAKE_ALLOWED":"1"}}'
refused fakeallowed 'PAYMENT_FAKE_ALLOWED is set'
ctl patch '{"secrets":{"PAYMENT_FAKE_ALLOWED":null,"ORCHADOS_DEMO_MODE":"public"}}'
refused demomode 'ORCHADOS_DEMO_MODE is set'
ctl patch '{"secrets":{"ORCHADOS_DEMO_MODE":null,"CAPTCHA_PROVIDER":"altcha"}}'
refused altcha 'CAPTCHA_PROVIDER on the pilot project is not turnstile'
ctl patch '{"secrets":{"CAPTCHA_PROVIDER":null},"db":{"fake_orgs":1}}'
refused fakeorgs 'allow_fake_payments'
ctl patch '{"db":{"fake_orgs":0,"send_code":0}}'
refused migrations 'lacks the sign-up migrations'
ctl patch '{"db":{"send_code":1,"orgs":["b0000000-0000-4000-8000-000000000001","b0000000-0000-4000-8000-000000000002"]}}'
refused twoorgs 'set ORG_ID'
refused badorg 'is not an org' ORG_ID=b0000000-0000-4000-8000-000000000009
run pickorg ORG_ID=b0000000-0000-4000-8000-000000000002 || bad "pickorg: exits 0"
check "pickorg: ORG_ID picks the org" J pickorg '.db.signup_org == "b0000000-0000-4000-8000-000000000002"'
refused otherorg 'already accepts sign-ups' ORG_ID=b0000000-0000-4000-8000-000000000001
ctl reset
ctl add-vercel-env '{"key":"PAYMENT_FAKE_CHECKOUT","value":"1"}'
refused fakecheckout 'PAYMENT_FAKE_CHECKOUT'
ctl reset
ctl drop-vercel-env '{"key":"NEXT_PUBLIC_SUPABASE_URL"}'
ctl add-vercel-env '{"key":"NEXT_PUBLIC_SUPABASE_URL","value":"https://testref000000000000.supabase.co"}'
refused vercelurl 'must point at the pilot project'
ctl reset
check "refusals: no secret in any output" bash -c "! grep -qE 'sb-token-SECRET|vc-token-SECRET|live-pilot-turnstile-SECRET' '$work'/*.out"

# --- scripts/vault-signup-cleanup.sh ------------------------------------------
vsc() {
  ctl clear-log
  env -i PATH="$PATH" SUPABASE_API="$base/sb" SUPABASE_ACCESS_TOKEN=sb-token-SECRET SUPABASE_PROJECT_REF="$2" \
    bash "$here/vault-signup-cleanup.sh" >"$work/$1.vsc" 2>&1
}
check "vault-signup-cleanup: sets the URL" vsc v1 $P
curl -fsS "$base/__ctl/state" -X POST -d '{}' -H 'Content-Type: application/json' >"$work/v1.json"
check "vault-signup-cleanup: URL is this project's customer-signup" J v1 --arg p $P '.vault.signup_cleanup_url == "https://\($p).supabase.co/functions/v1/customer-signup"'
check "vault-signup-cleanup: the cron secret is not touched" J v1 '.vault | has("orchados_cron_secret") | not'
check "vault-signup-cleanup: an API error fails" bash -c "! env -i PATH='$PATH' SUPABASE_API='$base/sb' SUPABASE_ACCESS_TOKEN=sb-token-SECRET SUPABASE_PROJECT_REF=testref000000000000 bash '$here/vault-signup-cleanup.sh' >/dev/null 2>&1"
check "vault-signup-cleanup: refuses a bad ref" bash -c "! env -i PATH='$PATH' SUPABASE_ACCESS_TOKEN=x SUPABASE_PROJECT_REF='a;b' bash '$here/vault-signup-cleanup.sh' >/dev/null 2>&1"
check "vault-signup-cleanup: no token in the output" bash -c "! grep -q sb-token-SECRET '$work/v1.vsc'"

# Every SQL text the scripts sent, except the sign-up switch (needs the
# billing tables; scripts/test-demo-lock-sql.sh runs it on the local database).
curl -fsS -X POST -d '{}' -H 'Content-Type: application/json' "$base/__ctl/queries" |
  jq '[.[] | select(test("public\\.org_billing_setting (\\(|set )") | not)]' >"$work/queries.json"
check "sql: read query, Vault upserts and the URL upsert were sent" jq -e '
  any(.[]; test("as billing_table")) and any(.[]; test("orchados_cron_secret")) and any(.[]; test("contract_documents_sweep_url"))
  and (length >= 3)' "$work/queries.json" >/dev/null
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
