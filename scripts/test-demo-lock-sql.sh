#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs in single quotes
# Runs the lock query of scripts/demo-lock-check.sh against the local database
# (pnpm db:start && pnpm db:reset): the mock in test-provision-demo.sh only
# returns canned counts, so this is where the generated SQL (quoting, columns,
# which rows count) is checked. Crafted rows go in one transaction that is
# rolled back. Needs psql and jq; DB_URL defaults to the local Supabase.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
sql=$(bash "$here/demo-lock-check.sh" sql)

# Seed: org b0..01 with parcel c0..01. Fixtures: an enabled demo org that allows
# fake payments, with one parcel; demo accounts with a membership in the seed org
# (counts), access to a seed parcel (counts), access to the demo parcel only
# (does not); an account without the demo flag with a membership (does not).
out=$(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
select row_to_json(t) from ($sql) t;
set local session_replication_role = replica;
insert into public.org (id, name, kind) values ('d1500000-0000-4000-8000-000000000001', 'lock sql demo', 'other');
insert into public.parcel (id, org_id, name) values
  ('d1510000-0000-4000-8000-000000000001', 'd1500000-0000-4000-8000-000000000001', 'Demo');
insert into private.demo_org (org_id, enabled, loaded_at) values ('d1500000-0000-4000-8000-000000000001', true, now());
insert into private.demo_parcel (parcel_id, org_id) values
  ('d1510000-0000-4000-8000-000000000001', 'd1500000-0000-4000-8000-000000000001');
insert into public.org_billing_setting (org_id, allow_fake_payments) values ('d1500000-0000-4000-8000-000000000001', true);
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email, meta::jsonb, '{}', now(), now()
from (values
  ('d15a0000-0000-4000-8000-000000000001', 'lock-member@demo.orchados.invalid', '{"demo": true}'),
  ('d15a0000-0000-4000-8000-000000000002', 'lock-seed-parcel@demo.orchados.invalid', '{"demo": true}'),
  ('d15a0000-0000-4000-8000-000000000003', 'lock-demo-parcel@demo.orchados.invalid', '{"demo": true}'),
  ('d15a0000-0000-4000-8000-000000000004', 'lock-plain@example.com', '{}')) v(id, email, meta);
insert into public.membership (org_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'd15a0000-0000-4000-8000-000000000001', 'expert'),
  ('b0000000-0000-4000-8000-000000000001', 'd15a0000-0000-4000-8000-000000000004', 'expert');
insert into public.parcel_access (org_id, parcel_id, user_id, role) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd15a0000-0000-4000-8000-000000000002', 'viewer'),
  ('d1500000-0000-4000-8000-000000000001', 'd1510000-0000-4000-8000-000000000001', 'd15a0000-0000-4000-8000-000000000003', 'viewer');
set local session_replication_role = origin;
select vault.create_secret('https://example.invalid/functions/v1/demo-start', 'demo_cleanup_url')
where not exists (select 1 from vault.secrets where name = 'demo_cleanup_url');
select row_to_json(t) from ($sql) t;
rollback;
SQL
)
before=$(sed -n 1p <<<"$out")
after=$(sed -n '$p' <<<"$out")
echo "before: $before"
echo "after:  $after"

failures=0
# expect NAME JQ: JQ over the two rows ($b before, $a after) is true.
expect() {
  if jq -e -n --argjson b "$before" --argjson a "$after" "$2" >/dev/null; then echo "ok   - $1"
  else echo "FAIL - $1"; failures=$((failures + 1)); fi
}
expect "every lock column is an integer" '[$b, $a][] | to_entries | all(.value | type == "number")'
expect "the registered demo org is not a real org" '$a.real_orgs == $b.real_orgs'
expect "an enabled demo org counts" '$a.enabled_demo_orgs == $b.enabled_demo_orgs + 1'
expect "a demo org allowing fake payments counts in both billing counts" \
  '$a.demo_billing_orgs == $b.demo_billing_orgs + 1 and $a.billing_orgs == $b.billing_orgs + 1'
expect "demo accounts with a membership or seed parcel access count; demo-parcel access and unflagged accounts do not" \
  '$a.demo_users_outside == $b.demo_users_outside + 2'
expect "Vault demo_cleanup_url is seen" '$a.cleanup_url >= 1'
expect "the seed itself holds the locks" '$b.enabled_demo_orgs == 0 and $b.demo_users_outside == 0 and $b.demo_billing_orgs == 0'

if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
