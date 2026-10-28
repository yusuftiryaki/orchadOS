#!/usr/bin/env bash
# Runs after `supabase db push` in every deploy workflow (deploy-db*.yml).
# --include-all applies a late-merged migration with an older timestamp after
# the IP13-A ones, so the demo write guard is re-attached here and the job
# fails on any guard lost to migration order (docs/demo-turu.md §6.1, §15;
# supabase/migrations/20261101120300_demo_guard_drift.sql).
#
# Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF; talks to the
# Management API's query endpoint.
set -euo pipefail

api="https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query"
auth="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

query() {
  curl -fsS -X POST -H "$auth" -H "Content-Type: application/json" \
    -d "$(jq -n --arg q "$1" '{query: $q}')" "$api"
}

attached=$(query "select t::text as tbl from private.attach_demo_guards() t")
echo "$attached" | jq -r '.[] | "::warning::zz_demo_read_only was missing on \(.tbl); attached after db push."'

drift=$(query "select kind, object, problem from private.demo_guard_drift()")
count=$(echo "$drift" | jq 'length')
if [ "$count" != "0" ]; then
  echo "$drift" | jq -r '.[] | "::error::Demo guard drift: \(.kind) \(.object): \(.problem)"'
  echo "::error::Restore the demo guard in a new migration (private.attach_demo_account_guard, or the demo filter of the overridden function)."
  exit 1
fi
echo "Demo guards intact."
