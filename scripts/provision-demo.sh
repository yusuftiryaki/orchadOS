#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs and the Ignored Build Step are single-quoted on purpose
# Provisions the hosted demo tour (IP13, docs/demo-turu.md §15,
# docs/deployment.md › Demo turu) on one of two hosts (HOST):
#   separate  the Supabase project `orchados-demo`, its Auth settings, Edge
#             Function secrets and Vault entries;
#   test      the test project (shared hosting while the Supabase organization
#             is on the free plan, docs/demo-turu.md §15.1): nothing the test
#             site relies on is overwritten. Only the demo origin joins the
#             Auth redirect list, only demo-specific Edge secrets are set
#             (ORCHADOS_DEMO_MODE, DEMO_TURNSTILE_SECRET_KEY,
#             DEMO_SIGNUP_HASH_SECRET, DEMO_SIGNUP_PROXY_SECRET) and only the
#             Vault entry demo_cleanup_url is written.
# In both, the Vercel project `orchados-demo` with its Production variables.
# Run by the provision-demo workflow; safe to run again: existing projects are
# reused, random secrets are generated only when one side is missing, and
# Vercel deploys only when something changed. It never pushes migrations or
# loads demo data (deploy-db / deploy-db-demo and demo-data do that).
#
# Secret values never reach the log, the job summary or a process argument:
# request bodies and auth headers go through files in a private temp dir, jq
# reads values from the environment. The service_role key is never read out.
#
# Environment:
#   HOST                   test (default) or separate
#   SUPABASE_ACCESS_TOKEN  Management API token (required)
#   SUPABASE_PROJECT_REF   test project; separate: the demo project goes to its
#                          organization (empty: the token's only organization);
#                          test: the host (required, must match SUPABASE_URL)
#   DEMO_DB_PASSWORD       separate: database password of a new demo project (required)
#   SUPABASE_URL, SUPABASE_ANON_KEY  test: the test project's public values (required)
#   PILOT_SUPABASE_URL     test: required (https://<ref>.supabase.co); the run
#                          refuses a host with this ref
#   DEMO_HOST_VAR          the repository variable DEMO_HOST, for the summary
#   VERCEL_TOKEN, VERCEL_TEAM_ID (required)
#   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY  optional; without both the demo stays closed
#   REGION (eu-central-1), DEMO_URL (https://orchados-demo.vercel.app),
#   MAIN_SITE_URL (https://orchados-pilot-orchad-os.vercel.app),
#   DRY_RUN (false: true reads only), REDEPLOY (false: true forces a Vercel deployment)
#   Tests: SUPABASE_API, VERCEL_API, POLL_INTERVAL, POLL_TIMEOUT, SUMMARY_FILE
set -euo pipefail

HOST=${HOST:-test}
SUPABASE_API=${SUPABASE_API:-https://api.supabase.com}
VERCEL_API=${VERCEL_API:-https://api.vercel.com}
REGION=${REGION:-eu-central-1}
DEMO_URL=${DEMO_URL:-https://orchados-demo.vercel.app}
MAIN_SITE_URL=${MAIN_SITE_URL:-https://orchados-pilot-orchad-os.vercel.app}
DRY_RUN=${DRY_RUN:-false}
REDEPLOY=${REDEPLOY:-false}
POLL_INTERVAL=${POLL_INTERVAL:-10}
POLL_TIMEOUT=${POLL_TIMEOUT:-900}
SUMMARY_FILE=${SUMMARY_FILE:-${GITHUB_STEP_SUMMARY:-/dev/stdout}}
GIT_ORG=yusuftiryaki
GIT_REPO=orchadOS
NAME=orchados-demo
IGNORE_BUILD='[ "$VERCEL_ENV" != production ]'

fail() { echo "::error::$*" >&2; exit 1; }
warn() { echo "::warning::$*"; warnings+=("$*"); }
note() { echo "$*"; }
dry() { [ "$DRY_RUN" = "true" ]; }
mask() { if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$1"; fi; }

warnings=()
changes=()

SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF:-}
DEMO_HOST_VAR=${DEMO_HOST_VAR:-}
SUPABASE_URL=${SUPABASE_URL:-}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-}
shared() { [ "$HOST" = test ]; }
case "$HOST" in
  test) required=(SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_URL SUPABASE_ANON_KEY PILOT_SUPABASE_URL VERCEL_TOKEN VERCEL_TEAM_ID) ;;
  separate) required=(SUPABASE_ACCESS_TOKEN DEMO_DB_PASSWORD VERCEL_TOKEN VERCEL_TEAM_ID) ;;
  *) fail "HOST must be test or separate, not '$HOST'." ;;
esac
for v in "${required[@]}"; do
  [ -n "${!v:-}" ] || fail "$v is missing (docs/demo-turu.md §15)."
done
# The name of each secret demo-start reads (_shared/demo.ts demoSecrets): on
# the test project the DEMO_ ones, so the test site's own values stay as they are.
if shared; then
  P=DEMO_
  host_label="the test project"
else
  P=
  host_label=$NAME
fi
[[ "$REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]$ ]] || fail "region '$REGION' is not a Supabase region (e.g. eu-central-1)."
for v in DEMO_URL MAIN_SITE_URL; do
  [[ "${!v}" =~ ^https://[a-z0-9.-]+$ ]] || fail "$v must be an https origin without a path or trailing slash."
done
[ "$DEMO_URL" != "$MAIN_SITE_URL" ] || fail "DEMO_URL and MAIN_SITE_URL must differ."

# Turnstile: both keys or neither. Without them the demo stays closed:
# ORCHADOS_DEMO_MODE stays unset, so demo-start answers 503 demo_closed (§5, §7).
turnstile=false
if [ -n "${TURNSTILE_SITE_KEY:-}" ] && [ -n "${TURNSTILE_SECRET_KEY:-}" ]; then
  # Cloudflare's dummy keys; demo-start refuses them in public mode.
  if [[ "$TURNSTILE_SECRET_KEY" =~ ^[123]x0+AA$ ]]; then
    fail "TURNSTILE_SECRET_KEY is a Cloudflare test key; the public demo needs a live key."
  fi
  turnstile=true
elif [ -n "${TURNSTILE_SITE_KEY:-}" ] || [ -n "${TURNSTILE_SECRET_KEY:-}" ]; then
  fail "only one of TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY is set; set both or neither."
fi

case "$REGION" in
  eu-central-1) vercel_region=fra1 ;;
  eu-central-2) vercel_region=fra1 ;;
  eu-north-1) vercel_region=arn1 ;;
  eu-west-1) vercel_region=dub1 ;;
  eu-west-2) vercel_region=lhr1 ;;
  eu-west-3) vercel_region=cdg1 ;;
  *) vercel_region= ;;
esac

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
  # Only reads are retried: a retried create could make a second project.
  if [ "$method" = GET ]; then args+=(--retry 3 --retry-connrefused); fi
  if [ -n "$body" ]; then args+=(--data-binary @"$body"); fi
  code=$(curl "${args[@]}" "$base$path") || fail "$method $path: request failed."
}
# The error text of a failed call. Bodies never echo request values here.
api_error() { jq -r '(.message // .error.message // .error // .msg // "") | tostring' "$tmp/resp" 2>/dev/null | head -c 300; }
# must METHOD PATH [BODY]: call and fail unless 2xx.
must() {
  local svc=$1 method=$2 path=$3
  call "$@"
  case "$code" in 2??) ;; *) fail "$svc $method ${path%%\?*}: HTTP $code $(api_error)" ;; esac
}
resp() { jq "$@" "$tmp/resp"; }
team="teamId=$VERCEL_TEAM_ID"

# --- Supabase project ---------------------------------------------------------
# A project ref from https://<ref>.supabase.co, or empty.
url_ref() { if [[ "$1" =~ ^https://([a-z0-9]+)\.supabase\.co/?$ ]]; then echo "${BASH_REMATCH[1]}"; fi; }
created_project=false
ref=
if shared; then
  # The test project hosts the demo: SUPABASE_PROJECT_REF (the test
  # environment's ref, the one deploy-db pushes to) and the URL must name the
  # same project, and the pilot's ref must be known so it can be refused. The
  # access token reaches every project of the organization, the pilot too.
  ref=$(url_ref "$SUPABASE_URL")
  pilot_ref=$(url_ref "$PILOT_SUPABASE_URL")
  [ -n "$pilot_ref" ] || fail "PILOT_SUPABASE_URL is not https://<ref>.supabase.co; it is needed to refuse the pilot as a host."
  for r in "$ref" "$SUPABASE_PROJECT_REF"; do
    [ "$r" != "$pilot_ref" ] || fail "the host is the pilot project; the pilot never hosts the demo."
  done
  [ -n "$ref" ] || fail "SUPABASE_URL is not https://<ref>.supabase.co."
  [ "$ref" = "$SUPABASE_PROJECT_REF" ] || fail "SUPABASE_URL and SUPABASE_PROJECT_REF name different projects."
  must sb GET "/v1/projects/$ref"
  test_name=$(resp -r '.name // ""')
  status=$(resp -r '.status')
  [[ "${test_name,,}" != *pilot* ]] || fail "the host project is named '$test_name'; the pilot never hosts the demo."
  [ "$status" = ACTIVE_HEALTHY ] || fail "the test project is $status, not ACTIVE_HEALTHY; restore it and run again."
  note "Supabase: hosting the demo on the test project $test_name ($ref)."
  supabase_url=${SUPABASE_URL%/}
  anon_key=$SUPABASE_ANON_KEY
  # The anon key must be this project's (anon or publishable); the response
  # also holds the service_role key, so it is removed at once.
  must sb GET "/v1/projects/$ref/api-keys"
  key_ok=$(resp -r --arg k "$anon_key" 'any(.[]; (.name == "anon" or .type == "publishable") and .api_key == $k)')
  rm -f "$tmp/resp"
  [ "$key_ok" = true ] || fail "SUPABASE_ANON_KEY is not the anon or publishable key of $ref."
elif [ -n "$SUPABASE_PROJECT_REF" ]; then
  must sb GET "/v1/projects/$SUPABASE_PROJECT_REF"
  org=$(resp -r '.organization_id // empty')
  [ -n "$org" ] || fail "no organization_id for the test project."
else
  must sb GET /v1/organizations
  [ "$(resp 'length')" = 1 ] || fail "SUPABASE_PROJECT_REF is not set and the token sees $(resp 'length') organizations; set SUPABASE_PROJECT_REF (the test project) for the demo environment."
  org=$(resp -r '.[0].id')
fi

if ! shared; then
  must sb GET /v1/projects
  found=$(resp -c --arg n "$NAME" --arg o "$org" '[.[] | select(.name == $n and .organization_id == $o)]')
  count=$(jq 'length' <<<"$found")
  [ "$count" -le 1 ] || fail "$count projects named $NAME in the organization; delete the extra one."
  if [ "$count" = 1 ]; then
    ref=$(jq -r '.[0].id // .[0].ref' <<<"$found")
    have_region=$(jq -r '.[0].region // ""' <<<"$found")
    note "Supabase: reusing $NAME ($ref, $have_region)."
    if [ -n "$have_region" ] && [ "$have_region" != "$REGION" ]; then
      warn "The existing $NAME project is in $have_region, not $REGION; it is reused as is."
    fi
  elif dry; then
    note "Supabase: would create $NAME in $REGION."
  else
    jq -n --arg n "$NAME" --arg o "$org" --arg r "$REGION" \
      '{name: $n, organization_id: $o, region: $r, db_pass: env.DEMO_DB_PASSWORD}' > "$tmp/body"
    must sb POST /v1/projects "$tmp/body"
    ref=$(resp -r '.id // .ref // empty')
    [ -n "$ref" ] || fail "project created but no ref returned."
    created_project=true
    changes+=("Supabase project $NAME created ($REGION)")
    note "Supabase: created $NAME ($ref)."
  fi
  [ -z "$ref" ] || [ "$ref" != "$SUPABASE_PROJECT_REF" ] || fail "the demo project resolved to the test project."

  if [ -n "$ref" ]; then
    waited=0
    while :; do
      must sb GET "/v1/projects/$ref"
      status=$(resp -r '.status')
      case "$status" in
        ACTIVE_HEALTHY) break ;;
        INACTIVE | PAUSED | INIT_FAILED | REMOVED | GOING_DOWN | PAUSE_FAILED | RESTORE_FAILED)
          fail "the $NAME project is $status; restore it in the Supabase dashboard and run again." ;;
      esac
      dry && fail "the $NAME project is $status, not ACTIVE_HEALTHY; run again later."
      [ "$waited" -lt "$POLL_TIMEOUT" ] || fail "the $NAME project is still $status after ${POLL_TIMEOUT}s."
      note "waiting: $status"
      sleep "$POLL_INTERVAL"
      waited=$((waited + POLL_INTERVAL))
    done
    supabase_url="https://$ref.supabase.co"

    # anon (legacy, JWT) first: every path the code was tested with; else publishable.
    must sb GET "/v1/projects/$ref/api-keys"
    anon_key=$(resp -r '([.[] | select(.name == "anon")] + [.[] | select(.type == "publishable")]) | .[0].api_key // empty')
    rm -f "$tmp/resp"
    [ -n "$anon_key" ] || fail "no anon or publishable key on $ref."
  fi
fi

# --- Auth (§15, supabase/config.toml [auth]) ------------------------------------
# No outside sign-up and no anonymous sign-in: demo-start opens the visitor
# account with the Admin API. Confirm email, confirm phone and secure email
# change are on (database guards do not rely on them; an extra layer).
# On the test project only the demo origin joins the redirect allow-list:
# site_url, sign-up and the confirmations belong to the test site.
if shared; then
  must sb GET "/v1/projects/$ref/config/auth"
  allow_entry="$DEMO_URL/**"
  if resp -e --arg e "$allow_entry" '(.uri_allow_list // "") | split(",") | map(gsub("^\\s+|\\s+$"; "")) | index($e)' >/dev/null; then
    note "Auth: $allow_entry already allowed."
  elif dry; then
    note "Auth: would add $allow_entry to the redirect allow-list."
  else
    resp --arg e "$allow_entry" '{uri_allow_list: ([(.uri_allow_list // "") | split(",")[] | select(. != "")] + [$e] | join(","))}' > "$tmp/auth.json"
    must sb PATCH "/v1/projects/$ref/config/auth" "$tmp/auth.json"
    changes+=("Auth: $allow_entry added to the redirect allow-list")
  fi
elif [ -n "$ref" ]; then
  jq -n --arg u "$DEMO_URL" '{
    site_url: $u,
    uri_allow_list: ($u + "/**"),
    disable_signup: true,
    external_anonymous_users_enabled: false,
    security_manual_linking_enabled: false,
    mailer_autoconfirm: false,
    sms_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    jwt_exp: 3600,
    refresh_token_rotation_enabled: true,
    security_refresh_token_reuse_interval: 10
  }' > "$tmp/auth.json"
  must sb GET "/v1/projects/$ref/config/auth"
  auth_diff=$(jq -r --slurpfile want "$tmp/auth.json" \
    '. as $have | $want[0] | to_entries | map(select($have[.key] != .value) | .key) | join(" ")' "$tmp/resp")
  if [ -z "$auth_diff" ]; then
    note "Auth: up to date."
  elif dry; then
    note "Auth: would update $auth_diff."
  else
    must sb PATCH "/v1/projects/$ref/config/auth" "$tmp/auth.json"
    changes+=("Auth: $auth_diff")
  fi
else
  note "Auth: would configure site_url $DEMO_URL, sign-up off, confirmations on."
fi

# --- Vercel project -----------------------------------------------------------
call vc GET "/v9/projects/$NAME?$team"
created_vercel=false
vercel_id=
vdiff=
case "$code" in
  200) vercel_id=$(resp -r '.id'); note "Vercel: reusing $NAME ($vercel_id)." ;;
  404)
    if dry; then
      note "Vercel: would create $NAME."
    else
      jq -n --arg n "$NAME" --arg repo "$GIT_ORG/$GIT_REPO" --arg ign "$IGNORE_BUILD" '{
        name: $n, framework: "nextjs", rootDirectory: "apps/web",
        gitRepository: {type: "github", repo: $repo},
        commandForIgnoringBuildStep: $ign
      }' > "$tmp/body"
      must vc POST "/v10/projects?$team" "$tmp/body"
      vercel_id=$(resp -r '.id')
      created_vercel=true
      changes+=("Vercel project $NAME created")
      must vc GET "/v9/projects/$vercel_id?$team"
    fi ;;
  *) fail "vc GET /v9/projects/$NAME: HTTP $code $(api_error)" ;;
esac

if [ -n "$vercel_id" ]; then
  cp "$tmp/resp" "$tmp/vproject"
  # Previews never build (Ignored Build Step) and only previews are behind
  # Vercel Authentication: the production demo is public.
  jq -n --arg ign "$IGNORE_BUILD" --arg reg "$vercel_region" '{
    framework: "nextjs", rootDirectory: "apps/web", commandForIgnoringBuildStep: $ign,
    ssoProtection: {deploymentType: "preview"}
  } + (if $reg == "" then {} else {serverlessFunctionRegion: $reg} end)' > "$tmp/vwant"
  vdiff=$(jq -r --slurpfile want "$tmp/vwant" '. as $have | $want[0] | to_entries
    | map(select(if .key == "ssoProtection" then ($have.ssoProtection.deploymentType // null) != .value.deploymentType
                 else $have[.key] != .value end) | .key) | join(" ")' "$tmp/vproject")
  if [ -z "$vdiff" ]; then
    note "Vercel settings: up to date."
  elif dry; then
    note "Vercel settings: would update $vdiff."
  else
    must vc PATCH "/v9/projects/$vercel_id?$team" "$tmp/vwant"
    changes+=("Vercel settings: $vdiff")
  fi
  link=$(jq -r '[.link.type // "", .link.org // "", .link.repo // "", .link.productionBranch // ""] | join(" ")' "$tmp/vproject")
  case "$link" in
    "github $GIT_ORG $GIT_REPO main" | "github $GIT_ORG $GIT_REPO ") ;;
    *) warn "Vercel $NAME is linked to '$link', expected github $GIT_ORG/$GIT_REPO on main." ;;
  esac

  must vc GET "/v9/projects/$vercel_id/env?$team"
  cp "$tmp/resp" "$tmp/venv"
fi

# Production entry of a Vercel variable: "id type" or empty.
venv_prod() {
  [ -f "$tmp/venv" ] || return 0
  jq -r --arg k "$1" 'first(.envs[] | select(.key == $k and (.target | index("production")))) | "\(.id) \(.type)"' "$tmp/venv"
}

# --- Edge Function secrets and Vault ---------------------------------------------
edge_names=
vault_names=
if [ -n "$ref" ]; then
  must sb GET "/v1/projects/$ref/secrets"
  cp "$tmp/resp" "$tmp/secrets"
  edge_names=$(resp -r '.[].name')
  jq -n '{query: "select name from vault.secrets where name in ('demo_cleanup_url', 'orchados_cron_secret')"}' > "$tmp/body"
  must sb POST "/v1/projects/$ref/database/query" "$tmp/body"
  vault_names=$(resp -r '.[].name')
fi
has_edge() { grep -qx "$1" <<<"$edge_names"; }
# The sha256 digest the secrets API returns for a value (never the value).
edge_digest() { jq -r --arg n "$1" 'first(.[] | select(.name == $n) | .value) // ""' "$tmp/secrets"; }
has_vault() { grep -qx "$1" <<<"$vault_names"; }

# Random secrets: kept while every holder has one, generated (and written to
# every holder in this run) when one is missing. Values are never compared.
# The test project's ORCHADOS_CRON_SECRET and Vault orchados_cron_secret
# belong to its other crons too: reused, never generated there.
new_hash=; new_cron=; new_proxy=
has_edge "${P}SIGNUP_HASH_SECRET" || new_hash=$(openssl rand -hex 32)
if ! { has_edge ORCHADOS_CRON_SECRET && has_vault orchados_cron_secret; }; then
  if shared; then
    if [ -n "$ref" ]; then
      warn "The test project lacks Edge ORCHADOS_CRON_SECRET or Vault orchados_cron_secret; demo cleanup cannot run, and an enabled demo fails the deploy-db locks. Set both to one value by hand (docs/deployment.md › Edge secret'ları ve Vault); this workflow does not touch them on the test project."
    fi
  else
    new_cron=$(openssl rand -hex 32)
  fi
fi
{ has_edge "${P}SIGNUP_PROXY_SECRET" && [ -n "$(venv_prod "${P}SIGNUP_PROXY_SECRET")" ]; } || new_proxy=$(openssl rand -hex 32)
for v in "$new_hash" "$new_cron" "$new_proxy"; do [ -z "$v" ] || mask "$v"; done

# name=value pairs for the secrets body; values travel only through the environment.
# MESSAGE_PROVIDER and PORTAL_BASE_URL are the test site's on the test project.
edge_set=()
if ! shared; then
  edge_set+=(MESSAGE_PROVIDER PORTAL_BASE_URL)
  export S_MESSAGE_PROVIDER=record S_PORTAL_BASE_URL=$DEMO_URL
fi
if [ -n "$new_hash" ]; then edge_set+=("${P}SIGNUP_HASH_SECRET"); export "S_${P}SIGNUP_HASH_SECRET=$new_hash"; fi
if [ -n "$new_cron" ]; then edge_set+=(ORCHADOS_CRON_SECRET); export S_ORCHADOS_CRON_SECRET=$new_cron; fi
if [ -n "$new_proxy" ]; then edge_set+=("${P}SIGNUP_PROXY_SECRET"); export "S_${P}SIGNUP_PROXY_SECRET=$new_proxy"; fi
# ORCHADOS_DEMO_MODE after this run: public, unset, or left (public from an
# earlier run). Any other value (`dev` from a smoke test) would open the demo
# without the live-key rule, so without Turnstile it is removed: unsetting it
# is how the demo is closed (demo-start answers 503 demo_closed).
demo_mode="unset"
delete_mode=false
if [ "$turnstile" = true ]; then
  edge_set+=("${P}TURNSTILE_SECRET_KEY" ORCHADOS_DEMO_MODE)
  export "S_${P}TURNSTILE_SECRET_KEY=$TURNSTILE_SECRET_KEY" S_ORCHADOS_DEMO_MODE=public
  demo_mode=public
elif has_edge ORCHADOS_DEMO_MODE; then
  public_digest=$(printf public | sha256sum | cut -d' ' -f1)
  if [ "$(edge_digest ORCHADOS_DEMO_MODE)" = "$public_digest" ]; then
    demo_mode=left
    warn "ORCHADOS_DEMO_MODE=public is already set on $host_label but the Turnstile secrets are missing in GitHub; left as is. The demo is open only while ${P}TURNSTILE_SECRET_KEY there holds a live key."
  else
    delete_mode=true
  fi
fi
if ! shared; then
  for name in PAYMENT_FAKE_ALLOWED SIGNUP_TURNSTILE_DISABLED PAYMENT_PROVIDER; do
    if has_edge "$name"; then warn "Edge secret $name is set on $NAME; the demo project takes no payments or sign-ups. Remove it."; fi
  done
fi

generated=$(printf '%s ' ${new_hash:+${P}SIGNUP_HASH_SECRET} ${new_cron:+ORCHADOS_CRON_SECRET} ${new_proxy:+${P}SIGNUP_PROXY_SECRET})
if [ "${#edge_set[@]}" = 0 ]; then
  note "Edge secrets: nothing to set."
elif [ -z "$ref" ]; then
  note "Edge secrets: would set ${edge_set[*]}."
elif dry; then
  note "Edge secrets: would set ${edge_set[*]}${generated:+ (new: $generated)}."
else
  printf '%s\n' "${edge_set[@]}" | jq -R -n '[inputs | {name: ., value: env["S_" + .]}]' > "$tmp/body"
  must sb POST "/v1/projects/$ref/secrets" "$tmp/body"
  rm -f "$tmp/body"
  note "Edge secrets: set ${edge_set[*]}."
  [ -z "$generated" ] || changes+=("Generated $generated")
fi
if [ "$delete_mode" = true ]; then
  if dry; then
    note "Edge secrets: would delete ORCHADOS_DEMO_MODE (not public, no Turnstile keys)."
  else
    jq -n '["ORCHADOS_DEMO_MODE"]' > "$tmp/body"
    must sb DELETE "/v1/projects/$ref/secrets" "$tmp/body"
    changes+=("Edge secret ORCHADOS_DEMO_MODE deleted (not public and no Turnstile keys): the demo is closed")
    note "Edge secrets: deleted ORCHADOS_DEMO_MODE (not public, no Turnstile keys)."
  fi
fi
unset "S_${P}SIGNUP_HASH_SECRET" S_ORCHADOS_CRON_SECRET "S_${P}SIGNUP_PROXY_SECRET" "S_${P}TURNSTILE_SECRET_KEY"

# Vault: the demo-cleanup cron calls demo_cleanup_url with orchados_cron_secret
# (§5.4, §7); without both, expired visitor accounts are never deleted.
vault_upsert() { # NAME VALUE (value: [A-Za-z0-9:/._-] only, checked)
  [[ "$2" =~ ^[A-Za-z0-9:/._-]+$ ]] || fail "unexpected characters in the Vault value of $1."
  printf "do \$\$ begin
  if exists (select 1 from vault.secrets where name = '%s') then
    perform vault.update_secret((select id from vault.secrets where name = '%s'), '%s');
  else
    perform vault.create_secret('%s', '%s');
  end if;
end \$\$;\n" "$1" "$1" "$2" "$2" "$1"
}
if [ -n "$ref" ] && ! dry; then
  { vault_upsert demo_cleanup_url "https://$ref.supabase.co/functions/v1/demo-start"
    if [ -n "$new_cron" ]; then vault_upsert orchados_cron_secret "$new_cron"; fi
  } | jq -R -s '{query: .}' > "$tmp/body"
  must sb POST "/v1/projects/$ref/database/query" "$tmp/body"
  rm -f "$tmp/body"
  note "Vault: demo_cleanup_url${new_cron:+, orchados_cron_secret}."
else
  note "Vault: would set demo_cleanup_url${new_cron:+, orchados_cron_secret}."
fi

# --- Vercel Production variables ----------------------------------------------
# NAME:type pairs; values from V_<NAME>. Only the Production target (§15).
vercel_vars=(NEXT_PUBLIC_SUPABASE_URL:encrypted NEXT_PUBLIC_SUPABASE_ANON_KEY:encrypted
  ORCHADOS_DEMO_ENABLED:encrypted ORCHADOS_MAIN_SITE_URL:encrypted ORCHADOS_SITE_URL:encrypted)
export V_NEXT_PUBLIC_SUPABASE_URL=${supabase_url:-} V_NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon_key:-}
export V_ORCHADOS_DEMO_ENABLED=1 V_ORCHADOS_MAIN_SITE_URL=$MAIN_SITE_URL V_ORCHADOS_SITE_URL=$DEMO_URL
if [ "$turnstile" = true ]; then
  vercel_vars+=(NEXT_PUBLIC_TURNSTILE_SITE_KEY:encrypted)
  export V_NEXT_PUBLIC_TURNSTILE_SITE_KEY=$TURNSTILE_SITE_KEY
fi
if [ -n "$new_proxy" ]; then
  vercel_vars+=("${P}SIGNUP_PROXY_SECRET:sensitive")
  export "V_${P}SIGNUP_PROXY_SECRET=$new_proxy"
fi

vercel_changed=()
for pair in "${vercel_vars[@]}"; do
  key=${pair%%:*} type=${pair#*:} val_var="V_${pair%%:*}"
  read -r env_id _ <<<"$(venv_prod "$key")"
  if [ -n "${env_id:-}" ] && [ "$type" != sensitive ]; then
    must vc GET "/v1/projects/$vercel_id/env/$env_id?$team"
    if [ "$(resp -r '.value // ""')" = "${!val_var}" ]; then rm -f "$tmp/resp"; continue; fi
    rm -f "$tmp/resp"
  fi
  vercel_changed+=("$key")
  if [ -n "$vercel_id" ] && ! dry; then
    K=$key T=$type jq -n '{key: env.K, value: env["V_" + env.K], type: env.T, target: ["production"]}' > "$tmp/body"
    must vc POST "/v10/projects/$vercel_id/env?$team&upsert=true" "$tmp/body"
    rm -f "$tmp/body"
  fi
done
unset "V_${P}SIGNUP_PROXY_SECRET" new_hash new_cron new_proxy
if [ "${#vercel_changed[@]}" = 0 ]; then
  note "Vercel variables: up to date."
elif [ -n "$vercel_id" ] && ! dry; then
  changes+=("Vercel variables: ${vercel_changed[*]}")
  note "Vercel variables: set ${vercel_changed[*]}."
else
  note "Vercel variables: would set ${vercel_changed[*]}."
fi

# Variables a demo deployment must not have (deployment.md › Demo turu). On a
# separate project, a DEMO_SIGNUP_PROXY_SECRET left from shared hosting would
# win over SIGNUP_PROXY_SECRET and no longer match the Edge side.
forbidden_vercel=()
if [ -f "$tmp/venv" ]; then
  forbidden=(ORCHADOS_SITE_INDEXABLE ORCHADOS_SIGNUP_ENABLED ORCHADOS_PAYMENTS_ENABLED PAYMENT_FAKE_CHECKOUT ORCHADOS_DEMO_URL SUPABASE_SERVICE_ROLE_KEY)
  shared || forbidden+=(DEMO_SIGNUP_PROXY_SECRET)
  for key in "${forbidden[@]}"; do
    if jq -e --arg k "$key" 'any(.envs[]; .key == $k)' "$tmp/venv" >/dev/null; then forbidden_vercel+=("$key"); fi
  done
  previews=$(jq -r '[.envs[] | select(.key | test("^(NEXT_PUBLIC_SUPABASE_|(DEMO_)?SIGNUP_PROXY_SECRET|ORCHADOS_)"))
    | select(.target | any(. != "production")) | .key] | unique | join(" ")' "$tmp/venv")
  [ -z "$previews" ] || warn "Vercel variables outside Production: $previews; the demo values belong to Production only."
fi

# --- Vercel deployment --------------------------------------------------------
# Hobby allows 100 deployments a day: deploy only when this run changed the
# project or its variables, when nothing is deployed yet, or when asked.
deploy_reason=
if [ -z "$vercel_id" ]; then deploy_reason="new project"
else
  if [ "$created_vercel" = true ]; then deploy_reason="new project"
  elif [ "${#vercel_changed[@]}" -gt 0 ]; then deploy_reason="variables changed"
  # Build settings; the Ignored Build Step and protection need no new build.
  elif [[ " $vdiff " =~ \ (framework|rootDirectory|serverlessFunctionRegion)\  ]]; then deploy_reason="build settings changed"
  elif [ "$REDEPLOY" = true ]; then deploy_reason="redeploy requested"
  else
    must vc GET "/v6/deployments?projectId=$vercel_id&target=production&state=READY&limit=1&$team"
    [ "$(resp '.deployments | length')" != 0 ] || deploy_reason="no ready production deployment"
  fi
fi
deployment=
if [ -z "$deploy_reason" ]; then
  note "Vercel deployment: not needed."
elif dry; then
  note "Vercel deployment: would deploy main ($deploy_reason)."
else
  jq -n --arg n "$NAME" --arg p "$vercel_id" --arg o "$GIT_ORG" --arg r "$GIT_REPO" \
    '{name: $n, project: $p, target: "production", gitSource: {type: "github", org: $o, repo: $r, ref: "main"}}' > "$tmp/body"
  must vc POST "/v13/deployments?$team" "$tmp/body"
  deployment=$(resp -r '.inspectorUrl // .url // .id')
  changes+=("Vercel deployment of main ($deploy_reason)")
  note "Vercel deployment: started ($deploy_reason)."
fi

if [ -n "$vercel_id" ]; then
  must vc GET "/v9/projects/$vercel_id/domains?$team"
  host=${DEMO_URL#https://}
  if ! resp -e --arg h "$host" 'any(.domains[]?; .name == $h)' >/dev/null; then
    warn "$host is not a domain of the Vercel project yet (a new project gets its vercel.app domain with the first deployment); otherwise add it (Vercel → Domains) or rerun with demo_url set to the project's domain, so the Auth settings match."
  fi
fi

# --- Summary ------------------------------------------------------------------
title="provision-demo (host: $HOST)"
if dry; then title="$title (dry run: nothing written)"; fi
{
  echo "## $title"
  echo
  echo "| | |"
  echo "| --- | --- |"
  if shared; then
    echo "| Host | the test project \`$ref\` (shared, docs/demo-turu.md §15.1) |"
  fi
  echo "| Supabase project ref | \`${ref:-(not created)}\` |"
  echo "| Supabase URL | \`${supabase_url:-}\` |"
  echo "| Anon key (public) | \`${anon_key:-}\` |"
  shared || echo "| Region | \`$REGION\` |"
  echo "| Vercel project id | \`${vercel_id:-(not created)}\` |"
  echo "| Demo URL | $DEMO_URL |"
  echo "| Main site | $MAIN_SITE_URL |"
  echo "| Vercel deployment | ${deployment:-none} |"
  echo
  if [ "${#changes[@]}" -gt 0 ]; then
    echo "### Changed in this run"
    printf -- '- %s\n' "${changes[@]}"
    echo
  fi
  echo "### Next steps"
  if shared; then
    if [ "$DEMO_HOST_VAR" = test ]; then
      echo "- [x] Repository variable \`DEMO_HOST=test\`: deploy-db-demo and demo-data (\`project=demo\`) use the test project's secrets in the \`test\` environment; no \`DEMO_SUPABASE_*\` secret is needed."
    else
      echo "- [ ] \`gh variable set DEMO_HOST --body test\` (repository variable). Then deploy-db-demo and demo-data (\`project=demo\`) use the test project's secrets in the \`test\` environment, and deploy-db checks the shared demo locks; no \`DEMO_SUPABASE_*\` secret is needed."
    fi
    echo "- [ ] Migrations and Edge Functions reach the test project through \`deploy-db\` as before; \`deploy-db-demo\` only checks the shared demo locks there (\`gh workflow enable deploy-db-demo\` if it is disabled)."
  else
    if [ "$DEMO_HOST_VAR" = test ]; then
      echo "- [ ] **Repository variable \`DEMO_HOST\` is still \`test\`:** set the secrets below first, then \`gh variable set DEMO_HOST --body separate\`; until then deploy-db-demo and demo-data keep using the test project."
    fi
    if [ -n "$ref" ]; then
      echo "- [ ] GitHub: \`gh secret set DEMO_SUPABASE_PROJECT_REF --env demo\` (\`$ref\`), \`DEMO_SUPABASE_URL\` (\`$supabase_url\`), \`DEMO_SUPABASE_ANON_KEY\` (above)."
    fi
    echo "- [ ] \`gh workflow enable deploy-db-demo\`, then run \`deploy-db-demo\` on main (migrations, Edge Functions)."
  fi
  echo "- [ ] \`demo-data\` with \`project=demo action=load\`."
  if [ "$turnstile" = true ]; then
    echo "- [x] Turnstile keys set (\`${P}TURNSTILE_SECRET_KEY\`); \`ORCHADOS_DEMO_MODE=public\`."
    echo "- [ ] \`demo-data\` with \`project=demo action=enable\`, then \`deploy-db-demo\` once more (open-demo locks)."
  elif [ "$demo_mode" = left ]; then
    echo "- [ ] **Turnstile missing in GitHub:** \`ORCHADOS_DEMO_MODE=public\` from an earlier run is kept; the demo is open only while \`${P}TURNSTILE_SECRET_KEY\` on the project is a live key. Add \`TURNSTILE_SITE_KEY\` and \`TURNSTILE_SECRET_KEY\` to the \`demo\` environment and run this workflow again."
  else
    echo "- [ ] **Turnstile missing:** the demo stays closed (\`ORCHADOS_DEMO_MODE\` $(if [ "$delete_mode" = true ]; then if dry; then echo "would be deleted"; else echo "deleted in this run"; fi; else echo unset; fi), demo-start answers 503 \`demo_closed\`). Add \`TURNSTILE_SITE_KEY\` and \`TURNSTILE_SECRET_KEY\` (live keys for the demo domain) and run this workflow again. Do not run \`demo-data action=enable\` before that: the demo locks fail on an enabled demo without its secrets."
  fi
  if shared; then
    echo "- [ ] Supabase: the test project's spend cap and 80% usage alert (egress, MAU) now cover the demo too; dashboard only."
  else
    echo "- [ ] Supabase: spend cap on, usage alert at 80% (egress, MAU); dashboard only."
  fi
  echo "- [ ] Smoke list on $DEMO_URL (docs/deployment.md › Demo turu), including the visitor e-mail domain."
  echo "- [ ] The main site's \"Demoyu dene\" link (\`ORCHADOS_DEMO_URL\` on orchados-pilot) is not set by this workflow."
  if ! shared && [ "$created_project" = false ] && [ -n "$ref" ]; then
    echo "- [ ] The project was reused: its database password must equal \`DEMO_SUPABASE_DB_PASSWORD\` for deploy-db-demo and demo-data."
  fi
  if [ "$turnstile" = false ] && has_edge "${P}TURNSTILE_SECRET_KEY"; then
    echo "- [ ] Edge secret \`${P}TURNSTILE_SECRET_KEY\` already exists on the project; check it is intended."
  fi
  if [ "${#warnings[@]}" -gt 0 ]; then
    echo
    echo "### Warnings"
    printf -- '- %s\n' "${warnings[@]}"
  fi
  if [ "${#forbidden_vercel[@]}" -gt 0 ]; then
    echo
    echo "### Errors"
    echo "- Vercel $NAME has variables a demo deployment must not have: ${forbidden_vercel[*]}. Remove them."
  fi
} >> "$SUMMARY_FILE"

if [ "${#forbidden_vercel[@]}" -gt 0 ]; then
  fail "Vercel $NAME has ${forbidden_vercel[*]}; a demo deployment must not (docs/deployment.md › Demo turu)."
fi
if [ "$turnstile" = false ] && [ "$demo_mode" = left ]; then
  echo "::notice::Turnstile keys are missing in GitHub: ORCHADOS_DEMO_MODE=public from an earlier run is kept."
elif [ "$turnstile" = false ]; then
  echo "::notice::Turnstile keys are missing: the demo stays closed (ORCHADOS_DEMO_MODE unset)."
fi
echo "Done."
