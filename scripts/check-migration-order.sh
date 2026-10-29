#!/usr/bin/env bash
# Every migration a change adds must sort after the newest one on the base
# branch (CLAUDE.md, Migration'lar). `supabase migration new` stamps today's
# date, which can sort before already merged, future-dated migrations (e.g. the
# IP13-A ones that define private.attach_demo_guard); on a fresh database such
# a file runs before the functions it calls and `db reset` fails.
#
# Usage: scripts/check-migration-order.sh <base-ref>   (e.g. origin/main)
set -euo pipefail

base=${1:?usage: $0 <base-ref>}
dir=supabase/migrations

stamp() { basename "$1" | sed -E 's/^([0-9]+)_.*/\1/'; }

latest=$(git ls-tree --name-only "$base" "$dir/" | grep -E '/[0-9]+_[^/]*\.sql$' | sort | tail -n 1 || true)
if [ -z "$latest" ]; then
  echo "No migrations on $base."
  exit 0
fi
max=$(stamp "$latest")

failed=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  if [[ "$(stamp "$file")" < "$max" || "$(stamp "$file")" == "$max" ]]; then
    echo "::error file=$file::$(basename "$file") must sort after $(basename "$latest") (newest on $base): rename it to a later timestamp."
    failed=1
  fi
done < <(git diff --name-only --diff-filter=A "$base" HEAD -- "$dir/" | grep -E '\.sql$' || true)

if [ "$failed" = 0 ]; then echo "New migrations sort after $(basename "$latest")."; fi
exit "$failed"
