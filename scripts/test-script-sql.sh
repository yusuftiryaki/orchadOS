#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs in single quotes
# Runs every SQL text the demo scripts sent to the Management API
# (/database/query) against a real Postgres: the mock in test-provision-demo.sh
# answers any SQL with canned rows, so a quoting or syntax error (string
# literals lost to shell quoting, say) only shows here.
#
#   test-script-sql.sh QUERIES.json    a JSON array of SQL texts
#
# DB_URL: any Postgres (CI: a plain postgres service) or the local Supabase.
# Without vault.secrets a stand-in with Supabase Vault's create_secret and
# update_secret signatures is created. Each query runs in its own transaction
# with the two demo Vault rows present, then everything is rolled back.
# Needs psql and jq.
set -euo pipefail

queries=${1:?usage: $0 QUERIES.json}
DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
n=$(jq 'length' "$queries")
[ "$n" -gt 0 ] || { echo "no queries in $queries"; exit 1; }

standin=
if [ "$(psql "$DB_URL" -X -At -c "select to_regclass('vault.secrets') is null")" = t ]; then
  echo "vault.secrets missing: using a stand-in"
  standin="
create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null
);
create function vault.create_secret(new_secret text, new_name text default null,
  new_description text default '', new_key_id uuid default null) returns uuid
language sql as \$\$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id
\$\$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null,
  new_description text default null, new_key_id uuid default null) returns void
language sql as \$\$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description) where id = secret_id
\$\$;"
fi

failures=0
for i in $(seq 0 $((n - 1))); do
  q=$(jq -r --argjson i "$i" '.[$i]' "$queries")
  label="query $((i + 1)): $(tr -s ' \n' '  ' <<<"$q" | cut -c1-60)"
  # Present before the query: an upsert takes the update branch for one name
  # and the create branch for the other.
  if out=$(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1 <<SQL
begin;
$standin
delete from vault.secrets where name in ('demo_cleanup_url', 'orchados_cron_secret');
select vault.create_secret('https://example.invalid/functions/v1/demo-start', 'demo_cleanup_url');
$q;
rollback;
SQL
  ); then
    # The Vault name lookup must find the rows it names.
    if [[ "$q" == "select name from vault.secrets"* ]] && ! grep -qx demo_cleanup_url <<<"$out"; then
      echo "FAIL - $label: demo_cleanup_url not found"; failures=$((failures + 1))
    else
      echo "ok   - $label"
    fi
  else
    echo "FAIL - $label"
    printf '%s\n' "$out" | sed 's/^/       /'
    failures=$((failures + 1))
  fi
done

if [ "$failures" -gt 0 ]; then echo "$failures of $n queries failed"; exit 1; fi
echo "all $n queries ran"
