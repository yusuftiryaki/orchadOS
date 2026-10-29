#!/usr/bin/env bash
# Sets Vault signup_cleanup_url of a hosted Supabase project to its own
# customer-signup function (https://<ref>.supabase.co/functions/v1/customer-signup),
# the address the hourly pg_cron job signup-cleanup calls
# (private.dispatch_signup_cleanup; docs/hukuk/kararlar.md H25, T09;
# docs/deployment.md › Kısa saklama denetimleri). Run by deploy-db and
# deploy-db-pilot after the Edge Functions are deployed and before
# scripts/retention-check.sh signup, and by scripts/provision-pilot-signup.sh.
#
# The URL follows from the project ref and is not a secret. Safe to run again:
# the entry is created when missing, rewritten only when it points elsewhere.
# Through the Management API's SQL endpoint with the access token; the cron
# secret (orchados_cron_secret) is never read or written here.
#
#   vault-signup-cleanup.sh         set the entry
#   vault-signup-cleanup.sh sql     prints the upsert for a dummy ref (tests)
#
# Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. Tests: SUPABASE_API.
set -euo pipefail

# sql_lit VALUE: VALUE as an SQL string literal (quotes doubled).
sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }
# upsert NAME VALUE: the same statement as provision-demo.sh vault_upsert,
# except that an entry already holding VALUE is left alone.
upsert() {
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

if [ "${1:-}" = sql ]; then
  upsert signup_cleanup_url "https://example0000000000000.supabase.co/functions/v1/customer-signup"
  exit 0
fi

: "${SUPABASE_ACCESS_TOKEN:?}" "${SUPABASE_PROJECT_REF:?}"
[[ "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]+$ ]] || { echo "::error::SUPABASE_PROJECT_REF is not a project ref."; exit 1; }
url="https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/customer-signup"
api="${SUPABASE_API:-https://api.supabase.com}/v1/projects/$SUPABASE_PROJECT_REF"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf 'Authorization: Bearer %s\n' "$SUPABASE_ACCESS_TOKEN" > "$tmp/auth"

upsert signup_cleanup_url "$url" | jq -R -s '{query: .}' > "$tmp/body"
code=$(curl -sS -o "$tmp/resp" -w '%{http_code}' -X POST -H @"$tmp/auth" -H "Content-Type: application/json" \
  --data-binary @"$tmp/body" "$api/database/query") || { echo "::error::Vault signup_cleanup_url: request failed."; exit 1; }
case "$code" in
  2??) echo "Vault signup_cleanup_url: $url" ;;
  *) echo "::error::Vault signup_cleanup_url: HTTP $code $(jq -r '.message // ""' "$tmp/resp" 2>/dev/null | head -c 300)"; exit 1 ;;
esac
