#!/usr/bin/env bash
# shellcheck disable=SC2016 # jq programs in single quotes
# Runs the lock query of scripts/demo-lock-check.sh, the retention query of
# scripts/retention-check.sh and the read query and sign-up switch of
# scripts/provision-pilot-signup.sh against the local database (pnpm db:start &&
# pnpm db:reset): the mock in test-provision-demo.sh only returns canned
# counts, so this is where the generated SQL (quoting, columns, which rows
# count) is checked. Crafted rows go in one transaction per query that is
# rolled back. Needs psql and jq; DB_URL defaults to the local Supabase.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
sql=$(bash "$here/demo-lock-check.sh" sql)
retention=$(bash "$here/retention-check.sh" sql)
pilot_read=$(ORG_ID=b0000000-0000-4000-8000-000000000001 bash "$here/provision-pilot-signup.sh" sql-read)
pilot_off=$(bash "$here/provision-pilot-signup.sh" sql-signups off)
pilot_on=$(bash "$here/provision-pilot-signup.sh" sql-signups on b0000000-0000-4000-8000-000000000001)
pilot_vault=$(bash "$here/vault-signup-cleanup.sh" sql)

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


# Retention (T09): the seed opens sign-ups and schedules signup-cleanup. The
# fixtures add a valid signup_cleanup_url and an orchados_cron_secret of 'abc',
# an active auth-audit-log-purge job, one GoTrue audit row 40 days old (counts)
# and one 20 days old (does not); then signup-cleanup is switched off and the
# URL points elsewhere.
out=$(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
delete from vault.secrets where name in ('signup_cleanup_url', 'orchados_cron_secret');
select cron.unschedule('auth-audit-log-purge') where exists (select 1 from cron.job where jobname = 'auth-audit-log-purge');
select row_to_json(t) from ($retention) t;
select vault.create_secret('https://example.invalid/functions/v1/customer-signup', 'signup_cleanup_url');
select vault.create_secret('abc', 'orchados_cron_secret');
select cron.schedule('auth-audit-log-purge', '41 3 * * *', 'select 1');
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  ('00000000-0000-0000-0000-000000000000', 'd15b0000-0000-4000-8000-000000000001', '{}', now() - interval '40 days', ''),
  ('00000000-0000-0000-0000-000000000000', 'd15b0000-0000-4000-8000-000000000002', '{}', now() - interval '20 days', '');
select row_to_json(t) from ($retention) t;
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'signup-cleanup';
select vault.update_secret(id, 'https://example.invalid/functions/v1/payments') from vault.secrets where name = 'signup_cleanup_url';
select row_to_json(t) from ($retention) t;
rollback;
SQL
)
rows=$(grep '^{"signup_orgs"' <<<"$out")
before=$(sed -n 1p <<<"$rows")
after=$(sed -n 2p <<<"$rows")
off=$(sed -n 3p <<<"$rows")
echo "retention before: $before"
echo "retention after:  $after"
echo "retention off:    $off"
abc=$(printf abc | sha256sum | cut -d' ' -f1)
expect "retention: every count is an integer, the digest a string" \
  '[$b, $a][] | to_entries | all(if .key == "cron_secret_digest" then (.value | type == "string") else (.value | type == "number") end)'
expect "retention: the seed opens sign-ups with an active signup-cleanup job" '$b.signup_orgs >= 1 and $b.signup_cleanup_jobs == 1'
expect "retention: no Vault entries, no audit purge job before" \
  '$b.signup_cleanup_url == 0 and $b.cron_secret_digest == "" and $b.audit_purge_jobs == 0'
expect "retention: a customer-signup URL counts" '$a.signup_cleanup_url == 1'
expect "retention: the cron secret digest is sha256 of the value" "\$a.cron_secret_digest == \"$abc\""
expect "retention: an active auth-audit-log-purge job counts" '$a.audit_purge_jobs == 1'
expect "retention: only the audit row older than 31 days counts" '$a.audit_rows_old == $b.audit_rows_old + 1'
before=$after after=$off
expect "retention: an inactive signup-cleanup job and another function's URL do not count" \
  '$a.signup_cleanup_jobs == 0 and $a.signup_cleanup_url == 0'

# Pilot sign-ups (scripts/provision-pilot-signup.sh): the seed's one org
# accepts sign-ups. Off closes it; on opens it again (twice: the second is a
# no-op) and a second org stays closed. The URL upsert (vault-signup-cleanup.sh,
# same dummy ref as the read query) makes signup_cleanup_url count.
out=$(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 <<SQL
begin;
delete from vault.secrets where name in ('signup_cleanup_url', 'orchados_cron_secret');
select row_to_json(t) from ($pilot_read) t;
$pilot_off
select row_to_json(t) from ($pilot_read) t;
set local session_replication_role = replica;
insert into public.org (id, name, kind) values ('d1500000-0000-4000-8000-000000000002', 'pilot sql second', 'other');
set local session_replication_role = origin;
$pilot_on
$pilot_on
$pilot_vault
$pilot_vault
select vault.create_secret('abc', 'orchados_cron_secret');
select row_to_json(t) from ($pilot_read) t;
select count(*) from vault.secrets where name = 'signup_cleanup_url';
rollback;
SQL
)
rows=$(grep '^{"billing_table"' <<<"$out")
before=$(sed -n 1p <<<"$rows")
off=$(sed -n 2p <<<"$rows")
on=$(sed -n 3p <<<"$rows")
echo "pilot before: $before"
echo "pilot off:    $off"
echo "pilot on:     $on"
seed=b0000000-0000-4000-8000-000000000001
after=$on
expect "pilot: the sign-up migrations are seen" '$b.billing_table == 1 and $b.send_code == 1 and $b.signup_cleanup_jobs == 1'
expect "pilot: the seed org accepts sign-ups and is the only org" "\$b.signup_org == \"$seed\" and \$b.orgs == 1 and \$b.only_org == \"$seed\" and \$b.org_given == 1"
before=$off
expect "pilot: off closes sign-ups" '$b.signup_org == ""'
expect "pilot: on opens them for the given org only; two orgs, no only org" "\$a.signup_org == \"$seed\" and \$a.orgs == 2 and \$a.only_org == \"\""
expect "pilot: the cron secret digest is sha256 of the value" "\$a.cron_secret_digest == \"$abc\""
expect "pilot: the upserted cleanup URL counts, the missing sweep URL does not" '$b.cleanup_url_ok == 0 and $a.cleanup_url_ok == 1 and $a.sweep_url_ok == 0'
if [ "$(tail -n 1 <<<"$out")" = 1 ]; then echo "ok   - pilot: the URL upsert twice leaves one Vault entry"; else
  echo "FAIL - pilot: the URL upsert twice leaves one Vault entry"; failures=$((failures + 1)); fi

if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all checks passed"
