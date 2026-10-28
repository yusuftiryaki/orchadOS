#!/usr/bin/env bash
# Short-retention deployment checks of a hosted Supabase project
# (docs/hukuk/kararlar.md H25, H27, T09; docs/deployment.md › Kısa saklama
# denetimleri), read through the Management API with the access token: Edge
# secret names with the sha256 digest of each value (values are never read in
# clear) and one read-only query. Tables may not exist yet (to_regclass).
#
#   retention-check.sh signup   deploy-db (test) and deploy-db-pilot, after the
#                               migration push
#   retention-check.sh audit    the project hosting the demo: deploy-db-demo
#                               (the test project while DEMO_HOST=test)
#   retention-check.sh sql      prints the query only (scripts/test-retention-sql.sh)
#
# signup fails when an org has accepts_signups while the hourly clean-up of
# self sign-ups whose phone was never verified (customer-signup `cleanup`,
# docs/musteri-yonetimi.md §7.3) cannot run: the pg_cron job `signup-cleanup`
# is missing or inactive, Vault has no signup_cleanup_url pointing at a
# customer-signup function, or Vault orchados_cron_secret is missing or
# differs from the ORCHADOS_CRON_SECRET Edge secret (compared by sha256
# digest), without which private.dispatch_signup_cleanup() silently does
# nothing or the function answers 401.
#
# audit fails when the pg_cron job `auth-audit-log-purge` is missing or
# inactive, or when auth.audit_log_entries holds rows older than 31 days (the
# privacy text promises at most 30; one day of slack for the daily job).
#
# Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. Tests: SUPABASE_API.
set -euo pipefail

mode=${1:-}
case "$mode" in
  signup | audit | sql) ;;
  *) echo "usage: $0 signup|audit|sql" >&2; exit 2 ;;
esac

# count NAME TABLES SQL: "<count> as NAME", 0 while one of TABLES is missing.
count() {
  local name=$1 tables=$2 sql=${3//\'/\'\'} cond="" t
  for t in $tables; do cond+="${cond:+ or }to_regclass('$t') is null"; done
  printf "case when %s then 0 else (xpath('/row/n/text()', query_to_xml(\n  '%s', false, true, '')))[1]::text::int end as %s" \
    "$cond" "$sql" "$name"
}
# textcol NAME TABLES SQL: "d" of SQL's single row as NAME, '' while missing.
textcol() {
  local name=$1 tables=$2 sql=${3//\'/\'\'} cond="" t
  for t in $tables; do cond+="${cond:+ or }to_regclass('$t') is null"; done
  printf "case when %s then '' else coalesce((xpath('/row/d/text()', query_to_xml(\n  '%s', false, true, '')))[1]::text, '') end as %s" \
    "$cond" "$sql" "$name"
}
sql="select
$(count signup_orgs "public.org_billing_setting" \
  "select count(*) as n from public.org_billing_setting where accepts_signups"),
$(count signup_cleanup_jobs "cron.job" \
  "select count(*) as n from cron.job where jobname = 'signup-cleanup' and active
   and command ilike '%private.dispatch_signup_cleanup()%'"),
$(count signup_cleanup_url "vault.decrypted_secrets" \
  "select count(*) as n from vault.decrypted_secrets where name = 'signup_cleanup_url'
   and decrypted_secret ~ '^https://[^/]+/functions/v1/customer-signup/?$'"),
$(textcol cron_secret_digest "vault.decrypted_secrets" \
  "select coalesce((select encode(sha256(convert_to(decrypted_secret, 'UTF8')), 'hex') from vault.decrypted_secrets
   where name = 'orchados_cron_secret' and decrypted_secret <> '' limit 1), '') as d"),
$(count audit_purge_jobs "cron.job" \
  "select count(*) as n from cron.job where jobname = 'auth-audit-log-purge' and active"),
$(count audit_rows_old "auth.audit_log_entries" \
  "select count(*) as n from auth.audit_log_entries where created_at < now() - interval '31 days'")"
if [ "$mode" = sql ]; then printf '%s\n' "$sql"; exit 0; fi

: "${SUPABASE_ACCESS_TOKEN:?}" "${SUPABASE_PROJECT_REF:?}"
api="${SUPABASE_API:-https://api.supabase.com}/v1/projects/$SUPABASE_PROJECT_REF"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN" > "$tmp/auth"

jq -n --arg q "$sql" '{query: $q}' > "$tmp/body"
counts=$(curl -fsS -X POST -H @"$tmp/auth" -H "Content-Type: application/json" --data-binary @"$tmp/body" \
  "$api/database/query")
get() { jq -r --arg k "$1" '.[0][$k] // ""' <<<"$counts"; }

failed=0
err() { echo "::error::$*"; failed=1; }

if [ "$mode" = signup ]; then
  if [ "$(get signup_orgs)" != "0" ]; then
    # name<TAB>sha256 digest of the value, per Edge secret.
    secrets=$(curl -fsS -H @"$tmp/auth" "$api/secrets" | jq -r '.[] | "\(.name)\t\(.value // "")"')
    edge_digest=$(awk -F'\t' '$1 == "ORCHADOS_CRON_SECRET" { print $2; exit }' <<<"$secrets")
    why="accepts_signups is on but self sign-ups whose phone is never verified would not be deleted"
    if [ "$(get signup_cleanup_jobs)" = "0" ]; then
      err "$why: the pg_cron job signup-cleanup is missing or inactive."
    fi
    if [ "$(get signup_cleanup_url)" = "0" ]; then
      err "$why: Vault has no signup_cleanup_url (https://<ref>.supabase.co/functions/v1/customer-signup)."
    fi
    vault_digest=$(get cron_secret_digest)
    if [ -z "$vault_digest" ]; then
      err "$why: Vault has no orchados_cron_secret."
    fi
    if [ -z "$edge_digest" ]; then
      err "$why: the ORCHADOS_CRON_SECRET Edge secret is missing."
    elif [ -n "$vault_digest" ] && [ "$vault_digest" != "$edge_digest" ]; then
      err "$why: Vault orchados_cron_secret differs from the ORCHADOS_CRON_SECRET Edge secret."
    fi
    if [ "$failed" = 0 ]; then echo "Sign-ups are open and the unverified-account clean-up is set up."; fi
  else
    echo "No org accepts sign-ups."
  fi
else
  if [ "$(get audit_purge_jobs)" = "0" ]; then
    err "The pg_cron job auth-audit-log-purge is missing or inactive on the project hosting the demo."
  fi
  old=$(get audit_rows_old)
  if [ "$old" != "0" ]; then
    err "auth.audit_log_entries holds $old row(s) older than 31 days on the project hosting the demo (at most 30 days)."
  fi
  if [ "$failed" = 0 ]; then echo "The GoTrue audit log purge holds."; fi
fi
exit "$failed"
