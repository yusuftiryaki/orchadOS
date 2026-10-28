#!/usr/bin/env bash
# KVKK md. 11 requests handled by hand (docs/hukuk/kararlar.md H26, T11):
# inventory, erase and pseudonymise one data subject's personal data.
#
#   scripts/kvkk/run.sh <inventory|erase|pseudonymize>
#     (--subject <auth user uuid> | --person-name <text> --parcel <uuid>)
#     --request <K-yyyy-nnn> [--include-notes] [--apply]
#     [--force-active --reason <text>] [--hosted | --db-url <url>]
#
# Everything runs in one transaction with ON_ERROR_STOP. Without --apply the
# transaction is rolled back (a dry run that prints what would change). The
# local stack is reached through `docker exec` (container KVKK_DB_CONTAINER,
# default supabase_db_orchados); a hosted database only with --hosted (URL in
# KVKK_DB_URL, preferred) or --db-url, and an interactive confirmation.
# KVKK_PSEUDONYM_KEY (secret, at least 32 characters) keys the pseudonyms.
# See scripts/kvkk/README.md.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
container="${KVKK_DB_CONTAINER:-supabase_db_orchados}"
uuid_re='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

usage() {
  sed -n '5,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# Percent-decoding of a URI component (the password of a database URL).
urldecode() {
  local s="$1" out="" c i=0
  while [ "$i" -lt "${#s}" ]; do
    c="${s:i:1}"
    if [ "$c" = "%" ] && [[ "${s:i+1:2}" =~ ^[0-9A-Fa-f]{2}$ ]]; then
      printf -v c '%b' "\\x${s:i+1:2}"
      i=$((i + 3))
    else
      i=$((i + 1))
    fi
    out+="$c"
  done
  printf '%s' "$out"
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
hosted="off"

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
    --db-url) db_url="${2-}"; hosted="on"; shift 2 || usage ;;
    --hosted) hosted="on"; shift ;;
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
  if [ "${#trimmed}" -lt 5 ] || [ "${#trimmed}" -gt 120 ]; then
    die "--person-name must be 5 to 120 characters"
  fi
  # A single word ("Ece", "Ali") matches other people: the full name only.
  read -r -a words <<<"$trimmed"
  [ "${#words[@]}" -ge 2 ] || die "--person-name needs the full name (at least two words)"
  for w in "${words[@]}"; do
    [ "${#w}" -ge 2 ] || die "--person-name: every word needs at least two letters"
  done
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

# The pseudonym key travels on stdin (never argv); its alphabet keeps it a
# plain psql literal.
key="${KVKK_PSEUDONYM_KEY-}"
[[ "$key" =~ ^[A-Za-z0-9+/=_-]{32,256}$ ]] \
  || die "set KVKK_PSEUDONYM_KEY (32 to 256 characters of A-Z a-z 0-9 + / = _ -; kept in the password manager, never in the database or the repo)"

if [ "$hosted" = "on" ]; then
  command -v psql >/dev/null || die "psql is not installed"
  if [ -z "$db_url" ]; then
    db_url="${KVKK_DB_URL-}"
    [ -n "$db_url" ] || die "--hosted reads the database URL from KVKK_DB_URL, which is empty"
  else
    echo "kvkk: warning: --db-url puts the password in the process list; prefer KVKK_DB_URL with --hosted" >&2
  fi
  # Only postgresql://user:password@host[:port]/db[?sslmode=...]. Anything
  # else (a key=value DSN, an unencoded '@', '/', '?' or '#' in the
  # password) is refused without echoing it.
  uri_re='^postgres(ql)?://([^:@/?#]+):([^@/?#]*)@([A-Za-z0-9.-]+)(:([0-9]{1,5}))?/([A-Za-z0-9_.-]+)(\?sslmode=([a-z-]+))?$'
  [[ "$db_url" =~ $uri_re ]] \
    || die "the database URL must be postgresql://user:password@host[:port]/db[?sslmode=...] with '@', '/', '?' and '#' percent-encoded in the password (the value is not printed)"
  PGUSER="$(urldecode "${BASH_REMATCH[2]}")"
  PGPASSWORD="$(urldecode "${BASH_REMATCH[3]}")"
  export PGUSER PGPASSWORD
  export PGHOST="${BASH_REMATCH[4]}"
  export PGPORT="${BASH_REMATCH[6]:-5432}"
  export PGDATABASE="${BASH_REMATCH[7]}"
  export PGSSLMODE="${BASH_REMATCH[9]:-require}"
  unset db_url KVKK_DB_URL
  target="$PGHOST"
  echo "kvkk: target is a HOSTED database: $target (port $PGPORT, database $PGDATABASE)" >&2
  echo "kvkk: command $command, request $request, apply=$apply" >&2
  [ -t 0 ] || die "a hosted database needs an interactive confirmation (run from a terminal)"
  read -r -p "Type the host ($target) to continue: " answer
  [ "$answer" = "$target" ] || die "not confirmed; nothing was run"
  psql_cmd=(psql)
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
  printf '%s\n' "\\set pseudonym_key '$key'"
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
