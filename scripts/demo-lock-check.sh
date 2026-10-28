#!/usr/bin/env bash
# Demo tour locks of a hosted Supabase project (IP13, docs/demo-turu.md §15,
# docs/deployment.md › Demo turu), read through the Management API with the
# access token: Edge secret names (values are not returned in clear) and one
# read-only query. Tables may not exist yet on a new project (to_regclass).
#
#   demo-lock-check.sh separate   the dedicated demo project (deploy-db-demo)
#   demo-lock-check.sh shared     the test project while it hosts the demo
#                                 (vars.DEMO_HOST == 'test'; deploy-db, deploy-db-demo)
#
# Both modes fail when
#   - a demo org is enabled while a secret demo-start needs is missing
#     (ORCHADOS_DEMO_MODE, the Turnstile, hash and proxy secrets,
#     ORCHADOS_CRON_SECRET; Vault demo_cleanup_url and orchados_cron_secret,
#     without which dispatch_demo_cleanup() silently never deletes expired
#     visitor accounts). In shared mode a DEMO_-prefixed secret stands in for
#     the shared one (demo-start prefers it, _shared/demo.ts demoSecrets);
#   - a demo org accepts sign-ups or fake payments;
#   - a demo account (app_metadata.demo) has a membership, or access to a
#     parcel of an org that is not a demo org.
# separate also fails when an org is not a demo org (real data never lives
# there), when any org accepts sign-ups or fake payments, or when
# PAYMENT_FAKE_ALLOWED is set. shared accepts all of that: the test site's
# orgs, sign-up and fake payments live on the same project.
#
# Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. Tests: SUPABASE_API.
set -euo pipefail

mode=${1:-}
case "$mode" in
  separate) where="the demo project" ;;
  shared) where="the test project (shared demo host)" ;;
  *) echo "usage: $0 separate|shared" >&2; exit 2 ;;
esac
: "${SUPABASE_ACCESS_TOKEN:?}" "${SUPABASE_PROJECT_REF:?}"

api="${SUPABASE_API:-https://api.supabase.com}/v1/projects/$SUPABASE_PROJECT_REF"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN" > "$tmp/auth"

secrets=$(curl -fsS -H @"$tmp/auth" "$api/secrets" | jq -r '.[].name')

# count NAME TABLES SQL: "<count> as NAME", 0 while one of TABLES is missing.
count() {
  local name=$1 tables=$2 sql=${3//\'/\'\'} cond="" t
  for t in $tables; do cond+="${cond:+ or }to_regclass('$t') is null"; done
  printf "case when %s then 0 else (xpath('/row/n/text()', query_to_xml(\n  '%s', false, true, '')))[1]::text::int end as %s" \
    "$cond" "$sql" "$name"
}
# real_orgs: every org counts while private.demo_org is missing.
sql="select
case when to_regclass('public.org') is null then 0
  when to_regclass('private.demo_org') is null then (xpath('/row/n/text()', query_to_xml(
    'select count(*) as n from public.org', false, true, '')))[1]::text::int
  else (xpath('/row/n/text()', query_to_xml(
    'select count(*) as n from public.org o
     where not exists (select 1 from private.demo_org d where d.org_id = o.id)', false, true, '')))[1]::text::int
end as real_orgs,
$(count enabled_demo_orgs "private.demo_org" "select count(*) as n from private.demo_org where enabled"),
$(count cleanup_url "vault.secrets" "select count(*) as n from vault.secrets where name = 'demo_cleanup_url'"),
$(count cron_secret "vault.secrets" "select count(*) as n from vault.secrets where name = 'orchados_cron_secret'"),
$(count billing_orgs "public.org_billing_setting" \
  "select count(*) as n from public.org_billing_setting where accepts_signups or allow_fake_payments"),
$(count demo_billing_orgs "public.org_billing_setting private.demo_org" \
  "select count(*) as n from public.org_billing_setting b join private.demo_org d on d.org_id = b.org_id
   where b.accepts_signups or b.allow_fake_payments"),
$(count demo_users_outside "public.membership public.parcel_access private.demo_org" \
  "select count(*) as n from auth.users u where coalesce(u.raw_app_meta_data ->> 'demo', '') = 'true'
   and (exists (select 1 from public.membership m where m.user_id = u.id)
     or exists (select 1 from public.parcel_access pa where pa.user_id = u.id
       and not exists (select 1 from private.demo_org d where d.org_id = pa.org_id)))")"
jq -n --arg q "$sql" '{query: $q}' > "$tmp/body"
counts=$(curl -fsS -X POST -H @"$tmp/auth" -H "Content-Type: application/json" --data-binary @"$tmp/body" \
  "$api/database/query")
get() { jq -r --arg k "$1" '.[0][$k]' <<<"$counts"; }

has() { grep -qx "$1" <<<"$secrets"; }
failed=0
err() { echo "::error::$*"; failed=1; }

if [ "$(get enabled_demo_orgs)" != "0" ]; then
  needs=(ORCHADOS_DEMO_MODE TURNSTILE_SECRET_KEY SIGNUP_HASH_SECRET SIGNUP_PROXY_SECRET ORCHADOS_CRON_SECRET)
  for name in "${needs[@]}"; do
    if has "$name"; then continue; fi
    if [ "$mode" = shared ] && [[ "$name" != ORCHADOS_* ]] && has "DEMO_$name"; then continue; fi
    if [ "$mode" = shared ] && [[ "$name" != ORCHADOS_* ]]; then
      err "A demo org is enabled but neither DEMO_$name nor $name is set on $where."
    else
      err "A demo org is enabled but the $name secret is missing on $where."
    fi
  done
  if [ "$(get cleanup_url)" = "0" ]; then
    err "A demo org is enabled but Vault has no demo_cleanup_url on $where."
  fi
  if [ "$(get cron_secret)" = "0" ]; then
    err "A demo org is enabled but Vault has no orchados_cron_secret on $where; expired visitor accounts would never be deleted."
  fi
fi
if [ "$(get demo_billing_orgs)" != "0" ]; then
  err "$(get demo_billing_orgs) demo org(s) accept sign-ups or fake payments on $where."
fi
if [ "$(get demo_users_outside)" != "0" ]; then
  err "$(get demo_users_outside) demo account(s) on $where have a membership or access outside the demo org."
fi

if [ "$mode" = separate ]; then
  if [ "$(get real_orgs)" != "0" ]; then
    err "$(get real_orgs) org(s) on the demo project are not registered in private.demo_org; the demo project holds demo data only."
  fi
  if [ "$(get billing_orgs)" != "0" ]; then
    err "$(get billing_orgs) org(s) accept sign-ups or fake payments on the demo project."
  fi
  if has PAYMENT_FAKE_ALLOWED; then
    err "PAYMENT_FAKE_ALLOWED is set on the demo project; remove it (supabase secrets unset PAYMENT_FAKE_ALLOWED)."
  fi
fi

if [ "$failed" = 0 ]; then echo "Demo locks hold on $where."; fi
exit "$failed"
