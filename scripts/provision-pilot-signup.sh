#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs are single-quoted on purpose
# Opens (or closes) self sign-up on the pilot (IP12; docs/deployment.md ›
# Pilot kaydı açma / kapama, docs/musteri-yonetimi.md §7, §13, §15): the pilot
# Supabase project's Edge secrets, Vault entries and accepts_signups, and the
# Vercel project orchados-pilot's Production variables, then a production
# deployment of `release`. Run by the provision-pilot-signup workflow (release
# branch, pilot environment) after deploy-db-pilot has brought the pilot's
# migrations up to date.
#
# SIGNUPS=on:
#   Edge     SIGNUP_HASH_SECRET (random, kept), SIGNUP_PROXY_SECRET (random,
#            also on Vercel), ORCHADOS_CRON_SECRET (random, also Vault
#            orchados_cron_secret and Vercel), TURNSTILE_SECRET_KEY (live key
#            from GitHub), PORTAL_BASE_URL; Netgsm (NETGSM_USERCODE,
#            NETGSM_PASSWORD, NETGSM_MSGHEADER, MESSAGE_PROVIDER=record removed)
#            only when all three are given.
#   Vault    signup_cleanup_url, contract_documents_sweep_url, orchados_cron_secret.
#   Vercel   ORCHADOS_SIGNUP_ENABLED=1, NEXT_PUBLIC_TURNSTILE_SITE_KEY,
#            SIGNUP_PROXY_SECRET and ORCHADOS_CRON_SECRET (sensitive),
#            ORCHADOS_SITE_URL, ORCHADOS_DEMO_URL. PAYMENT_FAKE_CHECKOUT is
#            never set; its presence fails the run.
#   Auth     the Send SMS hook (send-sms) with a new SEND_SMS_HOOK_SECRET, only
#            with INIT_SMS_HOOK=true and only when it is not set up already.
#   Database accepts_signups on the org that already has it, else ORG_ID, else
#            the only org.
# SIGNUPS=off (rollback): accepts_signups off everywhere and
#   ORCHADOS_SIGNUP_ENABLED removed; secrets and Vault stay as they are.
#
# Random secrets are kept while every holder has one, and generated (and
# written to every holder in this run) when one is missing or, for the cron
# secret, when Edge and Vault differ (compared by sha256 digest; the secrets
# API returns digests only). Vercel deploys only when a variable changed or
# REDEPLOY=true.
#
# SMS (docs/deployment.md › Edge Function'lar): the phone code of a sign-up
# reaches the phone only when the Auth Send SMS hook points at send-sms with
# the SEND_SMS_HOOK_SECRET Edge secret, and Netgsm's three secrets are set
# without MESSAGE_PROVIDER=record. Otherwise the code lands in
# private.message_outbox: sms_ready=false, a warning, and a failure with
# REQUIRE_SMS=true.
#
# Fails before writing anything when a prerequisite is missing: tokens, live
# Turnstile keys, migrations not on the pilot, a lock (PAYMENT_FAKE_ALLOWED,
# SIGNUP_TURNSTILE_DISABLED, ORCHADOS_DEMO_MODE, allow_fake_payments,
# PAYMENT_FAKE_CHECKOUT ...), a Vercel project that is not the pilot's.
#
# Secret values never reach the log, the job summary or a process argument:
# request bodies and auth headers go through files in a private temp dir, jq
# reads values from the environment, generated values are masked.
#
# Environment:
#   SUPABASE_ACCESS_TOKEN, PILOT_SUPABASE_PROJECT_REF (required)
#   PILOT_SUPABASE_URL (required: https://<ref>.supabase.co, must match the ref
#                       and Vercel's NEXT_PUBLIC_SUPABASE_URL)
#   TEST_SUPABASE_URL  optional; a run whose ref is the test project's fails
#   VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID (required; the project's
#                       name must be orchados-pilot, its branch release)
#   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY  required with SIGNUPS=on (live)
#   NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_MSGHEADER  optional, all or none
#   SIGNUPS (on), ORG_ID (empty), SITE_URL (https://orchados-pilot.vercel.app),
#   DEMO_URL (https://orchados-demo.vercel.app/demo; empty keeps Vercel's),
#   DRY_RUN (false), REDEPLOY (false), INIT_SMS_HOOK (false), REQUIRE_SMS (false)
#   Tests: SUPABASE_API, VERCEL_API, SUMMARY_FILE, OUTPUT_FILE
set -euo pipefail

SUPABASE_API=${SUPABASE_API:-https://api.supabase.com}
VERCEL_API=${VERCEL_API:-https://api.vercel.com}
SIGNUPS=${SIGNUPS:-on}
ORG_ID=${ORG_ID:-}
SITE_URL=${SITE_URL:-https://orchados-pilot.vercel.app}
DEMO_URL=${DEMO_URL-https://orchados-demo.vercel.app/demo}
DRY_RUN=${DRY_RUN:-false}
REDEPLOY=${REDEPLOY:-false}
INIT_SMS_HOOK=${INIT_SMS_HOOK:-false}
REQUIRE_SMS=${REQUIRE_SMS:-false}
TEST_SUPABASE_URL=${TEST_SUPABASE_URL:-}
SUMMARY_FILE=${SUMMARY_FILE:-${GITHUB_STEP_SUMMARY:-/dev/stdout}}
OUTPUT_FILE=${OUTPUT_FILE:-${GITHUB_OUTPUT:-/dev/null}}
GIT_ORG=yusuftiryaki
GIT_REPO=orchadOS
VERCEL_NAME=orchados-pilot
BRANCH=release

fail() { echo "::error::$*" >&2; exit 1; }
warn() { echo "::warning::$*"; warnings+=("$*"); }
note() { echo "$*"; }
dry() { [ "$DRY_RUN" = "true" ]; }
on() { [ "$SIGNUPS" = on ]; }
mask() { if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$1"; fi; }
sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

warnings=()
changes=()

# --- SQL ----------------------------------------------------------------------
sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }
# count NAME TABLES SQL / textcol NAME TABLES SQL: as in retention-check.sh;
# 0 or '' while one of TABLES is missing.
count() {
  local name=$1 tables=$2 sql=${3//\'/\'\'} cond="" t
  for t in $tables; do cond+="${cond:+ or }to_regclass('$t') is null"; done
  printf "case when %s then 0 else (xpath('/row/n/text()', query_to_xml(\n  '%s', false, true, '')))[1]::text::int end as %s" \
    "$cond" "$sql" "$name"
}
textcol() {
  local name=$1 tables=$2 sql=${3//\'/\'\'} cond="" t
  for t in $tables; do cond+="${cond:+ or }to_regclass('$t') is null"; done
  printf "case when %s then '' else coalesce((xpath('/row/d/text()', query_to_xml(\n  '%s', false, true, '')))[1]::text, '') end as %s" \
    "$cond" "$sql" "$name"
}
# read_sql: the database state in one read-only query. Tables may not exist
# yet (to_regclass); URLs from cleanup_url and sweep_url.
read_sql() {
  local org=${ORG_ID:-00000000-0000-0000-0000-000000000000}
  cat <<SQL
select
(to_regclass('public.org_billing_setting') is not null)::int as billing_table,
(to_regprocedure('public.signup_code_grant(text,text)') is not null)::int as send_code,
$(count signup_cleanup_jobs "cron.job" \
  "select count(*) as n from cron.job where jobname = 'signup-cleanup' and active
   and command ilike '%private.dispatch_signup_cleanup()%'"),
$(count orgs "public.org" "select count(*) as n from public.org"),
$(textcol only_org "public.org" \
  "select (select id::text from public.org where (select count(*) from public.org) = 1) as d"),
$(count org_given "public.org" "select count(*) as n from public.org where id = $(sql_lit "$org")"),
$(textcol signup_org "public.org_billing_setting" \
  "select (select string_agg(org_id::text, ',') from public.org_billing_setting where accepts_signups) as d"),
$(count fake_orgs "public.org_billing_setting" \
  "select count(*) as n from public.org_billing_setting where allow_fake_payments"),
$(count cleanup_url_ok "vault.decrypted_secrets" \
  "select count(*) as n from vault.decrypted_secrets where name = 'signup_cleanup_url'
   and decrypted_secret = $(sql_lit "$cleanup_url")"),
$(count sweep_url_ok "vault.decrypted_secrets" \
  "select count(*) as n from vault.decrypted_secrets where name = 'contract_documents_sweep_url'
   and decrypted_secret = $(sql_lit "$sweep_url")"),
$(textcol cron_secret_digest "vault.decrypted_secrets" \
  "select coalesce((select encode(sha256(convert_to(decrypted_secret, 'UTF8')), 'hex') from vault.decrypted_secrets
   where name = 'orchados_cron_secret' and decrypted_secret <> '' limit 1), '') as d")
SQL
}
# upsert NAME VALUE: creates the Vault entry or rewrites it when it differs
# (scripts/vault-signup-cleanup.sh). VALUE: [A-Za-z0-9:/._-] only, checked.
upsert() {
  [[ "$2" =~ ^[A-Za-z0-9:/._-]+$ ]] || fail "unexpected characters in the Vault value of $1."
  [[ "$1" =~ ^[a-z_]+$ ]] || fail "unexpected Vault secret name $1."
  local name value
  name=$(sql_lit "$1") value=$(sql_lit "$2")
  printf "do \$\$ begin
  if exists (select 1 from vault.secrets where name = %s) then
    if (select decrypted_secret from vault.decrypted_secrets where name = %s limit 1) is distinct from %s then
      perform vault.update_secret((select id from vault.secrets where name = %s), %s);
    end if;
  else
    perform vault.create_secret(%s, %s);
  end if;
end \$\$;\n" "$name" "$name" "$value" "$name" "$value" "$value" "$name"
}
# signups_sql on|off ORG: accepts_signups on for ORG (the row is created
# when missing), or off everywhere. At most one org accepts sign-ups (unique
# index); the caller picks the org that already has it.
signups_sql() {
  if [ "$1" = on ]; then
    printf "insert into public.org_billing_setting (org_id, accepts_signups) values (%s, true)
  on conflict (org_id) do update set accepts_signups = true
  where not public.org_billing_setting.accepts_signups;\n" "$(sql_lit "$2")"
  else
    printf "update public.org_billing_setting set accepts_signups = false where accepts_signups;\n"
  fi
}
# For scripts/test-demo-lock-sql.sh: the SQL only, with a dummy project ref.
case "${1:-}" in
  sql-read)
    cleanup_url=https://example0000000000000.supabase.co/functions/v1/customer-signup
    sweep_url="$SITE_URL/sistem/sozlesme-tarama"
    read_sql; exit 0 ;;
  sql-signups) signups_sql "${2:?on|off}" "${3:-}"; exit 0 ;;
esac


for v in SUPABASE_ACCESS_TOKEN PILOT_SUPABASE_PROJECT_REF PILOT_SUPABASE_URL VERCEL_TOKEN VERCEL_TEAM_ID VERCEL_PROJECT_ID; do
  [ -n "${!v:-}" ] || fail "$v is missing (docs/deployment.md › Pilot kaydı açma / kapama)."
done
for v in DRY_RUN REDEPLOY INIT_SMS_HOOK REQUIRE_SMS; do
  case "${!v}" in true | false) ;; *) fail "$v must be true or false, not '${!v}'." ;; esac
done
case "$SIGNUPS" in on | off) ;; *) fail "SIGNUPS must be on or off, not '$SIGNUPS'." ;; esac
[[ "$SITE_URL" =~ ^https://[a-z0-9.-]+$ ]] || fail "SITE_URL must be an https origin without a path or trailing slash."
[ -z "$DEMO_URL" ] || [[ "$DEMO_URL" =~ ^https://[a-z0-9.-]+(/[a-z0-9/_-]*)?$ ]] || fail "DEMO_URL must be an https URL."
[ -z "$ORG_ID" ] || [[ "$ORG_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fail "ORG_ID must be a uuid."

# url_ref URL: the project ref of https://<ref>.supabase.co, or empty.
url_ref() { if [[ "$1" =~ ^https://([a-z0-9]+)\.supabase\.co/?$ ]]; then echo "${BASH_REMATCH[1]}"; fi; }
ref=$PILOT_SUPABASE_PROJECT_REF
[[ "$ref" =~ ^[a-z0-9]+$ ]] || fail "PILOT_SUPABASE_PROJECT_REF is not a project ref."
[ "$(url_ref "$PILOT_SUPABASE_URL")" = "$ref" ] || fail "PILOT_SUPABASE_URL is not https://$ref.supabase.co; PILOT_SUPABASE_URL and PILOT_SUPABASE_PROJECT_REF must name the same project."
supabase_url="https://$ref.supabase.co"
cleanup_url="$supabase_url/functions/v1/customer-signup"
sweep_url="$SITE_URL/sistem/sozlesme-tarama"
if [ -n "$TEST_SUPABASE_URL" ] && [ "$(url_ref "$TEST_SUPABASE_URL")" = "$ref" ]; then
  fail "PILOT_SUPABASE_PROJECT_REF is the test project's ref."
fi

# Turnstile (live keys only; customer-signup has no other robot check here).
if on; then
  if [ -z "${TURNSTILE_SITE_KEY:-}" ] || [ -z "${TURNSTILE_SECRET_KEY:-}" ]; then
    fail "TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are both needed to open sign-ups (live keys; docs/deployment.md › Robot doğrulaması)."
  fi
  for v in TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY; do
    if [[ "${!v}" =~ ^[123]x0+[A-Z]{2}$ ]]; then fail "$v is a Cloudflare test key; the pilot needs a live key."; fi
  done
fi
netgsm=false
if [ -n "${NETGSM_USERCODE:-}" ] && [ -n "${NETGSM_PASSWORD:-}" ] && [ -n "${NETGSM_MSGHEADER:-}" ]; then
  netgsm=true
elif [ -n "${NETGSM_USERCODE:-}${NETGSM_PASSWORD:-}${NETGSM_MSGHEADER:-}" ]; then
  fail "only some of PILOT_NETGSM_USERCODE, PILOT_NETGSM_PASSWORD and PILOT_NETGSM_MSGHEADER are set; set all three or none."
fi

tmp=$(mktemp -d)
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT
umask 077
printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN" > "$tmp/sb.h"
printf 'Authorization: Bearer %s\n' "$VERCEL_TOKEN" > "$tmp/vc.h"

# call sb|vc METHOD PATH [BODY_FILE]: response in $tmp/resp, status in $code.
call() {
  local svc=$1 method=$2 path=$3 body=${4:-} base
  if [ "$svc" = sb ]; then base=$SUPABASE_API; else base=$VERCEL_API; fi
  local args=(-sS -o "$tmp/resp" -w '%{http_code}' -X "$method" -H @"$tmp/$svc.h"
    -H 'Content-Type: application/json')
  if [ "$method" = GET ]; then args+=(--retry 3 --retry-connrefused); fi
  if [ -n "$body" ]; then args+=(--data-binary @"$body"); fi
  code=$(curl "${args[@]}" "$base$path") || fail "$method $path: request failed."
}
api_error() { jq -r '(.message // .error.message // .error // .msg // "") | tostring' "$tmp/resp" 2>/dev/null | head -c 300; }
must() {
  local svc=$1 method=$2 path=$3
  call "$@"
  case "$code" in 2??) ;; *) fail "$svc $method ${path%%\?*}: HTTP $code $(api_error)" ;; esac
}
resp() { jq "$@" "$tmp/resp"; }
# query SQL: runs SQL through the Management API; rows in $tmp/resp.
query() {
  jq -n --arg q "$1" '{query: $q}' > "$tmp/body"
  must sb POST "/v1/projects/$ref/database/query" "$tmp/body"
  rm -f "$tmp/body"
}
team="teamId=$VERCEL_TEAM_ID"

# --- Supabase project ---------------------------------------------------------
must sb GET "/v1/projects/$ref"
project_name=$(resp -r '.name // ""')
status=$(resp -r '.status // ""')
[ "$status" = ACTIVE_HEALTHY ] || fail "the pilot project is $status, not ACTIVE_HEALTHY; restore it and run again."
[[ "${project_name,,}" == *pilot* ]] || warn "the Supabase project $ref is named '$project_name'; expected the pilot (orchados-pilot)."
note "Supabase: pilot project $project_name ($ref)."

must sb GET "/v1/projects/$ref/secrets"
cp "$tmp/resp" "$tmp/secrets"
has_edge() { jq -e --arg n "$1" 'any(.[]; .name == $n)' "$tmp/secrets" >/dev/null; }
edge_digest() { jq -r --arg n "$1" 'first(.[] | select(.name == $n) | .value) // ""' "$tmp/secrets"; }

# --- Database state -------------------------------------------------------------
query "$(read_sql)"
cp "$tmp/resp" "$tmp/db"
db() { jq -r --arg k "$1" '.[0][$k] // "" | tostring' "$tmp/db"; }

# --- Locks: fail before anything is written -----------------------------------
for name in PAYMENT_FAKE_ALLOWED SIGNUP_TURNSTILE_DISABLED ORCHADOS_DEMO_MODE; do
  if has_edge "$name"; then fail "the Edge secret $name is set on the pilot project; remove it (supabase secrets unset --project-ref $ref $name)."; fi
done
[ "$(db fake_orgs)" = 0 ] || fail "$(db fake_orgs) org(s) have allow_fake_payments on the pilot project."
if has_edge CAPTCHA_PROVIDER && [ "$(edge_digest CAPTCHA_PROVIDER)" != "$(sha turnstile)" ]; then
  fail "CAPTCHA_PROVIDER on the pilot project is not turnstile; this workflow sets up Turnstile only (docs/deployment.md › Robot doğrulaması)."
fi
signup_org=$(db signup_org)
[[ "$signup_org" != *,* ]] || fail "more than one org accepts sign-ups on the pilot project."
target_org=
if on; then
  if [ "$(db billing_table)" != 1 ] || [ "$(db send_code)" != 1 ] || [ "$(db signup_cleanup_jobs)" = 0 ]; then
    fail "the pilot database lacks the sign-up migrations (org_billing_setting, signup_code_grant or an active signup-cleanup job); bring main into release and let deploy-db-pilot finish first."
  fi
  if [ -n "$signup_org" ]; then
    [ -z "$ORG_ID" ] || [ "$ORG_ID" = "$signup_org" ] ||
      fail "org $signup_org already accepts sign-ups; ORG_ID $ORG_ID differs. Close sign-ups first (SIGNUPS=off) to move them."
    target_org=$signup_org
  elif [ -n "$ORG_ID" ]; then
    [ "$(db org_given)" = 1 ] || fail "ORG_ID $ORG_ID is not an org on the pilot project."
    target_org=$ORG_ID
  else
    target_org=$(db only_org)
    [ -n "$target_org" ] || fail "the pilot project has $(db orgs) orgs; set ORG_ID (the org that takes the sign-ups)."
  fi
fi

# --- Vercel project -----------------------------------------------------------
must vc GET "/v9/projects/$VERCEL_PROJECT_ID?$team"
cp "$tmp/resp" "$tmp/vproject"
[ "$(resp -r '.name // ""')" = "$VERCEL_NAME" ] || fail "Vercel project $VERCEL_PROJECT_ID is '$(resp -r '.name // ""')', not $VERCEL_NAME."
branch=$(resp -r '.link.productionBranch // ""')
[ "$branch" = "$BRANCH" ] || fail "Vercel $VERCEL_NAME deploys '$branch' to production, not $BRANCH."
protection=$(resp -r '.ssoProtection.deploymentType // "none"')
case "$protection" in
  all | prod_deployment_urls_and_all_previews)
    warn "Vercel Authentication on $VERCEL_NAME covers production ($protection): visitors see a Vercel login, not the site. Set it to previews only (Settings → Deployment Protection)." ;;
esac
must vc GET "/v9/projects/$VERCEL_PROJECT_ID/env?$team"
cp "$tmp/resp" "$tmp/venv"
# Production entry of a variable: "id type", or empty.
venv_prod() { jq -r --arg k "$1" 'first(.envs[] | select(.key == $k and (.target | index("production")))) | "\(.id) \(.type)"' "$tmp/venv"; }
# A readable Production value (not for sensitive variables).
venv_value() {
  local id
  read -r id _ <<<"$(venv_prod "$1")"
  [ -n "${id:-}" ] || return 0
  must vc GET "/v1/projects/$VERCEL_PROJECT_ID/env/$id?$team"
  resp -r '.value // ""'
  rm -f "$tmp/resp"
}
forbidden=()
for key in PAYMENT_FAKE_CHECKOUT ORCHADOS_DEMO_ENABLED ORCHADOS_MAIN_SITE_URL SUPABASE_SERVICE_ROLE_KEY DEMO_SIGNUP_PROXY_SECRET; do
  if jq -e --arg k "$key" 'any(.envs[]; .key == $k)' "$tmp/venv" >/dev/null; then forbidden+=("$key"); fi
done
[ "${#forbidden[@]}" = 0 ] || fail "Vercel $VERCEL_NAME has ${forbidden[*]}; the pilot must not (docs/deployment.md › Vercel). Remove them and run again."
vercel_supabase=$(venv_value NEXT_PUBLIC_SUPABASE_URL)
[ "${vercel_supabase%/}" = "$supabase_url" ] ||
  fail "Vercel $VERCEL_NAME NEXT_PUBLIC_SUPABASE_URL is not $supabase_url; it must point at the pilot project."
[ -n "$(venv_prod NEXT_PUBLIC_SUPABASE_ANON_KEY)" ] || fail "Vercel $VERCEL_NAME has no NEXT_PUBLIC_SUPABASE_ANON_KEY."
captcha_web=$(venv_value NEXT_PUBLIC_CAPTCHA_PROVIDER)
[ -z "$captcha_web" ] || [ "$captcha_web" = turnstile ] ||
  fail "Vercel $VERCEL_NAME NEXT_PUBLIC_CAPTCHA_PROVIDER is '$captcha_web'; the Edge side is Turnstile."

# --- Auth (Send SMS hook) -----------------------------------------------------
# The response holds the hook secret and other credentials: only the fields
# below are kept, the hook secret as its sha256 digest.
must sb GET "/v1/projects/$ref/config/auth"
jq '{hook_send_sms_enabled, hook_send_sms_uri, external_phone_enabled, sms_autoconfirm, disable_signup, site_url, rate_limit_sms_sent}' \
  "$tmp/resp" > "$tmp/authcfg"
hook_digest=$(jq -j '.hook_send_sms_secrets // ""' "$tmp/resp" | sha256sum | cut -d' ' -f1)
rm -f "$tmp/resp"
auth() { jq -r --arg k "$1" '.[$k] // "" | tostring' "$tmp/authcfg"; }
hook_url="$supabase_url/functions/v1/send-sms"
hook_ok=false
if [ "$(auth hook_send_sms_enabled)" = true ] && [ "$(auth hook_send_sms_uri)" = "$hook_url" ] &&
  has_edge SEND_SMS_HOOK_SECRET && [ "$(edge_digest SEND_SMS_HOOK_SECRET)" = "$hook_digest" ]; then
  hook_ok=true
fi
if on; then
  [ "$(auth disable_signup)" = true ] || warn "Auth on the pilot allows outside sign-ups (disable_signup is off); customer-signup opens accounts itself. Turn it off (docs/deployment.md › Auth ayarları)."
  [ "$(auth sms_autoconfirm)" != true ] || warn "Auth on the pilot has \"Confirm phone\" off (sms_autoconfirm); keep it on (docs/deployment.md › Telefon Auth üzerinden)."
  [ "$(auth external_phone_enabled)" = true ] || warn "Auth on the pilot has the phone provider off; phone codes cannot be sent."
  [ "$(auth site_url)" = "$SITE_URL" ] || warn "Auth site_url on the pilot is '$(auth site_url)', not $SITE_URL."
fi

# --- Plan ---------------------------------------------------------------------
edge_set=()
edge_del=()
vercel_set=()  # NAME:type, values from V_<NAME>
vercel_del=()
vault_sql=
vault_names=()
new_hash=; new_proxy=; new_cron=; new_hook=

if on; then
  has_edge SIGNUP_HASH_SECRET || new_hash=$(openssl rand -hex 32)
  { has_edge SIGNUP_PROXY_SECRET && [ -n "$(venv_prod SIGNUP_PROXY_SECRET)" ]; } || new_proxy=$(openssl rand -hex 32)
  edge_cron=$(edge_digest ORCHADOS_CRON_SECRET)
  if [ -z "$edge_cron" ] || [ "$edge_cron" != "$(db cron_secret_digest)" ] || [ -z "$(venv_prod ORCHADOS_CRON_SECRET)" ]; then
    new_cron=$(openssl rand -hex 32)
  fi
  if [ "$hook_ok" = false ] && [ "$INIT_SMS_HOOK" = true ]; then
    new_hook="v1,whsec_$(openssl rand -base64 32)"
  fi
  for v in "$new_hash" "$new_proxy" "$new_cron" "$new_hook"; do [ -z "$v" ] || mask "$v"; done

  # Plain Edge values: written only when the digest differs.
  plain() { # NAME VALUE
    if [ "$(edge_digest "$1")" != "$(sha "$2")" ]; then edge_set+=("$1"); export "S_$1=$2"; fi
  }
  plain TURNSTILE_SECRET_KEY "$TURNSTILE_SECRET_KEY"
  plain PORTAL_BASE_URL "$SITE_URL"
  if [ "$netgsm" = true ]; then
    plain NETGSM_USERCODE "$NETGSM_USERCODE"
    plain NETGSM_PASSWORD "$NETGSM_PASSWORD"
    plain NETGSM_MSGHEADER "$NETGSM_MSGHEADER"
    if has_edge MESSAGE_PROVIDER && [ "$(edge_digest MESSAGE_PROVIDER)" = "$(sha record)" ]; then edge_del+=(MESSAGE_PROVIDER); fi
  fi
  if [ -n "$new_hash" ]; then edge_set+=(SIGNUP_HASH_SECRET); export S_SIGNUP_HASH_SECRET=$new_hash; fi
  if [ -n "$new_proxy" ]; then edge_set+=(SIGNUP_PROXY_SECRET); export S_SIGNUP_PROXY_SECRET=$new_proxy; fi
  if [ -n "$new_cron" ]; then edge_set+=(ORCHADOS_CRON_SECRET); export S_ORCHADOS_CRON_SECRET=$new_cron; fi
  if [ -n "$new_hook" ]; then edge_set+=(SEND_SMS_HOOK_SECRET); export S_SEND_SMS_HOOK_SECRET=$new_hook; fi

  vault() { vault_names+=("$1"); vault_sql+=$(upsert "$1" "$2")$'\n'; }
  [ "$(db cleanup_url_ok)" != 0 ] || vault signup_cleanup_url "$cleanup_url"
  [ "$(db sweep_url_ok)" != 0 ] || vault contract_documents_sweep_url "$sweep_url"
  [ -z "$new_cron" ] || vault orchados_cron_secret "$new_cron"

  # Readable Vercel values: written only when they differ.
  vplain() { # NAME VALUE
    if [ "$(venv_value "$1")" != "$2" ]; then vercel_set+=("$1:encrypted"); export "V_$1=$2"; fi
  }
  vplain ORCHADOS_SIGNUP_ENABLED 1
  vplain NEXT_PUBLIC_TURNSTILE_SITE_KEY "$TURNSTILE_SITE_KEY"
  vplain ORCHADOS_SITE_URL "$SITE_URL"
  [ -z "$DEMO_URL" ] || vplain ORCHADOS_DEMO_URL "$DEMO_URL"
  if [ -n "$new_proxy" ]; then vercel_set+=(SIGNUP_PROXY_SECRET:sensitive); export V_SIGNUP_PROXY_SECRET=$new_proxy; fi
  if [ -n "$new_cron" ]; then vercel_set+=(ORCHADOS_CRON_SECRET:sensitive); export V_ORCHADOS_CRON_SECRET=$new_cron; fi
else
  read -r id _ <<<"$(venv_prod ORCHADOS_SIGNUP_ENABLED)"
  [ -z "${id:-}" ] || vercel_del+=(ORCHADOS_SIGNUP_ENABLED)
fi

# --- SMS readiness (after this run's writes) ----------------------------------
sms_hook=$hook_ok
[ -z "$new_hook" ] || sms_hook=true
sms_netgsm=false
if [ "$netgsm" = true ]; then
  sms_netgsm=true
elif has_edge NETGSM_USERCODE && has_edge NETGSM_PASSWORD && has_edge NETGSM_MSGHEADER &&
  [ "$(edge_digest MESSAGE_PROVIDER)" != "$(sha record)" ]; then
  sms_netgsm=true
fi
sms_ready=false
if [ "$sms_hook" = true ] && [ "$sms_netgsm" = true ] && [ "$(auth external_phone_enabled)" = true ]; then sms_ready=true; fi
sms_missing=()
[ "$sms_hook" = true ] || sms_missing+=("the Auth Send SMS hook (enabled, $hook_url, the same secret as the SEND_SMS_HOOK_SECRET Edge secret; init_sms_hook=true sets it up)")
[ "$sms_netgsm" = true ] || sms_missing+=("Netgsm credentials (GitHub secrets PILOT_NETGSM_USERCODE, PILOT_NETGSM_PASSWORD, PILOT_NETGSM_MSGHEADER; MESSAGE_PROVIDER=record is then removed)")
[ "$(auth external_phone_enabled)" = true ] || sms_missing+=("the phone provider in Auth")

if on && [ "$sms_ready" = false ] && [ "$REQUIRE_SMS" = true ]; then
  fail "REQUIRE_SMS=true and SMS is not ready on the pilot; nothing was written. Missing: ${sms_missing[*]}"
fi

# --- Writes -------------------------------------------------------------------
if dry; then
  note "Dry run: nothing is written."
fi
if [ "${#edge_set[@]}" -gt 0 ]; then
  if dry; then note "Edge secrets: would set ${edge_set[*]}."; else
    printf '%s\n' "${edge_set[@]}" | jq -R -n '[inputs | {name: ., value: env["S_" + .]}]' > "$tmp/body"
    must sb POST "/v1/projects/$ref/secrets" "$tmp/body"
    rm -f "$tmp/body"
    changes+=("Edge secrets set: ${edge_set[*]}")
  fi
fi
if [ "${#edge_del[@]}" -gt 0 ]; then
  if dry; then note "Edge secrets: would delete ${edge_del[*]}."; else
    printf '%s\n' "${edge_del[@]}" | jq -R -n '[inputs]' > "$tmp/body"
    must sb DELETE "/v1/projects/$ref/secrets" "$tmp/body"
    changes+=("Edge secrets deleted: ${edge_del[*]}")
  fi
fi
for n in "${edge_set[@]}"; do unset "S_$n"; done
if [ -n "$vault_sql" ]; then
  if dry; then note "Vault: would set ${vault_names[*]}."; else
    query "$vault_sql"
    changes+=("Vault: ${vault_names[*]}")
  fi
  vault_sql=
fi
if [ -n "$new_hook" ]; then
  if dry; then note "Auth: would enable the Send SMS hook ($hook_url) with a new secret."; else
    export S_HOOK=$new_hook
    jq -n --arg u "$hook_url" '{hook_send_sms_enabled: true, hook_send_sms_uri: $u, hook_send_sms_secrets: env.S_HOOK}' > "$tmp/body"
    unset S_HOOK
    must sb PATCH "/v1/projects/$ref/config/auth" "$tmp/body"
    rm -f "$tmp/body" "$tmp/resp"
    changes+=("Auth: Send SMS hook enabled ($hook_url), new SEND_SMS_HOOK_SECRET")
  fi
fi
vercel_changed=()
for pair in "${vercel_set[@]}"; do
  key=${pair%%:*} type=${pair#*:}
  vercel_changed+=("$key")
  dry && continue
  K=$key T=$type jq -n '{key: env.K, value: env["V_" + env.K], type: env.T, target: ["production"]}' > "$tmp/body"
  must vc POST "/v10/projects/$VERCEL_PROJECT_ID/env?$team&upsert=true" "$tmp/body"
  rm -f "$tmp/body"
done
for key in "${vercel_del[@]}"; do
  vercel_changed+=("$key (removed)")
  dry && continue
  read -r id _ <<<"$(venv_prod "$key")"
  must vc DELETE "/v9/projects/$VERCEL_PROJECT_ID/env/$id?$team"
done
for pair in "${vercel_set[@]}"; do unset "V_${pair%%:*}"; done
unset new_hash new_proxy new_cron new_hook
if [ "${#vercel_changed[@]}" -gt 0 ]; then
  if dry; then note "Vercel variables: would set ${vercel_changed[*]}."; else changes+=("Vercel variables: ${vercel_changed[*]}"); fi
fi

# accepts_signups last: the secrets, Vault and the clean-up are in place first.
signups_now=closed
if on; then
  if [ "$signup_org" = "$target_org" ]; then
    note "accepts_signups: already on for $target_org."
  elif dry; then
    note "accepts_signups: would turn on for $target_org."
  else
    query "$(signups_sql on "$target_org")"
    changes+=("accepts_signups on for $target_org")
  fi
  signups_now="open ($target_org)"
elif [ -n "$signup_org" ]; then
  if dry; then note "accepts_signups: would turn off for $signup_org."; else
    query "$(signups_sql off)"
    changes+=("accepts_signups off (was $signup_org)")
  fi
else
  note "accepts_signups: already off."
fi

# --- Vercel deployment of release ---------------------------------------------
deploy_reason=
if [ "${#vercel_changed[@]}" -gt 0 ]; then deploy_reason="variables changed"
elif [ "$REDEPLOY" = true ]; then deploy_reason="redeploy requested"; fi
deployment=
if [ -z "$deploy_reason" ]; then
  note "Vercel deployment: not needed."
elif dry; then
  note "Vercel deployment: would deploy $BRANCH ($deploy_reason)."
else
  jq -n --arg n "$VERCEL_NAME" --arg p "$VERCEL_PROJECT_ID" --arg o "$GIT_ORG" --arg r "$GIT_REPO" --arg b "$BRANCH" \
    '{name: $n, project: $p, target: "production", gitSource: {type: "github", org: $o, repo: $r, ref: $b}}' > "$tmp/body"
  must vc POST "/v13/deployments?$team" "$tmp/body"
  deployment=$(resp -r '.inspectorUrl // .url // .id')
  changes+=("Vercel production deployment of $BRANCH ($deploy_reason)")
fi

# --- Summary ------------------------------------------------------------------
{
  echo "sms_ready=$sms_ready"
  echo "signups=$SIGNUPS"
} >> "$OUTPUT_FILE"
title="provision-pilot-signup (signups: $SIGNUPS)"
if dry; then title="$title (dry run: nothing written)"; fi
{
  echo "## $title"
  echo
  echo "| | |"
  echo "| --- | --- |"
  echo "| Supabase project | \`$ref\` ($project_name) |"
  echo "| Vercel project | \`$VERCEL_PROJECT_ID\` ($VERCEL_NAME, branch \`$BRANCH\`) |"
  echo "| Site | $SITE_URL |"
  echo "| Sign-ups | $signups_now |"
  echo "| sms_ready | **$sms_ready** |"
  echo "| Auth SMS rate limit | $(auth rate_limit_sms_sent) per hour (project-wide) |"
  echo "| Vercel deployment | ${deployment:-none} |"
  echo
  if [ "${#changes[@]}" -gt 0 ]; then
    echo "### Changed in this run"
    printf -- '- %s\n' "${changes[@]}"
    echo
  fi
  if on && [ "$sms_ready" = false ]; then
    echo "### SMS is not ready"
    echo "Sign-ups are open, but the phone code goes to \`private.message_outbox\` instead of the phone: nobody can finish a sign-up, and unverified accounts are deleted after 24 hours. Missing:"
    printf -- '- %s\n' "${sms_missing[@]}"
    echo
  fi
  echo "### Owner checks"
  echo "- [ ] Cloudflare Turnstile: the live site key's hostnames include \`${SITE_URL#https://}\` (Cloudflare → Turnstile → widget → Hostnames)."
  echo "- [ ] $SITE_URL: the landing shows \"Demoyu dene\", \`/kayit\` shows the form, a test sign-up gets an SMS."
  if [ "${#warnings[@]}" -gt 0 ]; then
    echo
    echo "### Warnings"
    printf -- '- %s\n' "${warnings[@]}"
  fi
} >> "$SUMMARY_FILE"

if on && [ "$sms_ready" = false ]; then
  echo "::warning::sms_ready=false: sign-up phone codes are not delivered on the pilot. Missing: ${sms_missing[*]}"
fi
echo "Done."
