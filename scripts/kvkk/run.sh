#!/usr/bin/env bash
# KVKK md. 11 requests handled by hand (docs/hukuk/kararlar.md H26, T11):
# inventory, erase and pseudonymise one data subject's personal data.
#
#   scripts/kvkk/run.sh <inventory|erase|pseudonymize>
#     (--subject <auth user uuid> | --person-name <text> --parcel <uuid>)
#     --request <K-yyyy-nnn> [--include-notes] [--apply]
#     [--force-active --reason <text>] [--db-url <url>]
#
# Everything runs in one transaction with ON_ERROR_STOP. Without --apply the
# transaction is rolled back (a dry run that prints what would change). The
# local stack is reached through `docker exec` (container KVKK_DB_CONTAINER,
# default supabase_db_orchados); a hosted database only with --db-url and an
# interactive confirmation. See scripts/kvkk/README.md.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
container="${KVKK_DB_CONTAINER:-supabase_db_orchados}"
uuid_re='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

usage() {
  sed -n '5,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

die() {
  echo "kvkk: $*" >&2
  exit 2
}

[ $# -ge 1 ] || usage
command="$1"
shift
case "$command" in
  inventory | erase | pseudonymize) ;;
  -h | --help) usage ;;
  *) die "unknown command '$command' (inventory, erase, pseudonymize)" ;;
esac

subject=""
person_name=""
parcel=""
request=""
include_notes="off"
apply="off"
force_active="off"
reason=""
db_url=""

while [ $# -gt 0 ]; do
  case "$1" in
    --subject) subject="${2-}"; shift 2 || usage ;;
    --person-name) person_name="${2-}"; shift 2 || usage ;;
    --parcel) parcel="${2-}"; shift 2 || usage ;;
    --request) request="${2-}"; shift 2 || usage ;;
    --include-notes) include_notes="on"; shift ;;
    --apply) apply="on"; shift ;;
    --force-active) force_active="on"; shift ;;
    --reason) reason="${2-}"; shift 2 || usage ;;
    --db-url) db_url="${2-}"; shift 2 || usage ;;
    -h | --help) usage ;;
    *) die "unknown option '$1'" ;;
  esac
done

if [ -n "$subject" ]; then
  if [ -n "$person_name" ] || [ -n "$parcel" ]; then
    die "--subject excludes --person-name and --parcel"
  fi
  [[ "$subject" =~ $uuid_re ]] || die "--subject must be a uuid"
elif [ -n "$person_name" ]; then
  [ -n "$parcel" ] || die "--person-name needs --parcel"
  [[ "$parcel" =~ $uuid_re ]] || die "--parcel must be a uuid"
  trimmed="$(printf '%s' "$person_name" | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//')"
  if [ "${#trimmed}" -lt 3 ] || [ "${#trimmed}" -gt 120 ]; then
    die "--person-name must be 3 to 120 characters"
  fi
else
  die "give --subject or --person-name with --parcel"
fi
[[ "$request" =~ ^K-[0-9]{4}-[0-9]{3,6}$ ]] || die "--request must be a başvuru defteri number (K-yyyy-nnn)"
if [ "$force_active" = "on" ]; then
  [ -n "$subject" ] || die "--force-active applies to --subject only"
  if [ "${#reason}" -lt 10 ] || [ "${#reason}" -gt 300 ]; then
    die "--force-active needs --reason (10 to 300 characters, no personal data)"
  fi
elif [ -n "$reason" ]; then
  die "--reason is only used with --force-active"
fi
if [ "$command" = "inventory" ] && [ "$apply" = "on" ]; then
  die "inventory never changes data; drop --apply"
fi

if [ -n "$db_url" ]; then
  command -v psql >/dev/null || die "psql is not installed"
  # Never print the password.
  target="$(printf '%s' "$db_url" | sed -E 's#^[a-z]+://([^@/]*@)?([^/?]*).*#\2#')"
  echo "kvkk: target is a HOSTED database: $target" >&2
  echo "kvkk: command $command, request $request, apply=$apply" >&2
  [ -t 0 ] || die "a hosted database needs an interactive confirmation (run from a terminal)"
  read -r -p "Type the host ($target) to continue: " answer
  [ "$answer" = "$target" ] || die "not confirmed; nothing was run"
  psql_cmd=(psql "$db_url")
else
  docker inspect "$container" >/dev/null 2>&1 || die "local database container '$container' is not running (pnpm db:start)"
  psql_cmd=(docker exec -i "$container" psql -U postgres -d postgres)
fi

if [ "$apply" = "on" ]; then
  finish="commit;"
  echo "kvkk: --apply: changes will be COMMITTED" >&2
else
  finish="rollback;"
  echo "kvkk: dry run: the transaction is rolled back" >&2
fi

# One transaction: parameters, shared prelude, the command, commit or rollback.
# Values travel as psql variables (quoted by psql with :'name'), never spliced
# into SQL text here.
{
  echo '\set ON_ERROR_STOP on'
  echo '\pset footer off'
  echo 'begin;'
  cat "$here/lib/prelude.sql"
  cat "$here/$command.sql"
  echo "$finish"
} | "${psql_cmd[@]}" -X -q -v ON_ERROR_STOP=1 \
  -v command="$command" \
  -v subject="$subject" \
  -v person_name="$person_name" \
  -v parcel="$parcel" \
  -v request="$request" \
  -v include_notes="$include_notes" \
  -v apply="$apply" \
  -v force_active="$force_active" \
  -v reason="$reason"
