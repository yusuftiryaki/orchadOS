#!/usr/bin/env bash
# End to end for the processing image, no cloud account and no GPU:
#
#   ops opens a planned scan on the seed parcel (local Supabase)
#   -> the image synthesises a session fitted to the parcel's trees
#   -> orchados-ingest pushes it to MinIO (the "raw store")
#   -> a fresh container runs `orchados-process <session>`: pull, run
#      --trees-from-db, upload
#   -> the session is `processed` and has assets and tree crops.
#
# Needs: docker, curl, jq, and the local stack (pnpm db:start && pnpm db:reset).
# usage: deploy/processing/tests/e2e.sh [image]   (default orchados-processing:dev)
set -euo pipefail

IMAGE="${1:-orchados-processing:dev}"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
ORG="b0000000-0000-4000-8000-000000000001"     # seed org (supabase/seed.sql)
PARCEL="c0000000-0000-4000-8000-000000000001"  # seed parcel
MINIO_IMAGE="${MINIO_IMAGE:-cgr.dev/chainguard/minio:latest}"
MINIO_PORT="${MINIO_PORT:-19000}"
# Throwaway test-only credentials for the local MinIO container.
MINIO_USER=orchados
MINIO_PASSWORD=orchados-test-only
PASSWORD=orchados-dev                           # seed users (local only)

log() { printf '[e2e %(%H:%M:%S)T] %s\n' -1 "$*"; }

T="$(mktemp -d)"
MINIO_NAME="orchados-e2e-minio-$$"
cleanup() {
  docker rm -f "$MINIO_NAME" >/dev/null 2>&1 || true
  # Files in $T were written by the image's non-root user.
  docker run --rm -v "$T:/t" --entrypoint sh "$IMAGE" -c 'rm -rf /t/*' >/dev/null 2>&1 || true
  rm -rf "$T"
}
trap cleanup EXIT

# --- local Supabase ----------------------------------------------------------
STATUS="$(cd "$REPO" && pnpm exec supabase status -o json 2>/dev/null | sed -n '/^{/,$p')"
SUPABASE_URL="$(jq -r .API_URL <<<"$STATUS")"
SUPABASE_ANON_KEY="$(jq -r .ANON_KEY <<<"$STATUS")"
if [ -z "$SUPABASE_URL" ] || [ "$SUPABASE_URL" = null ]; then
  echo "local Supabase is not running (pnpm db:start && pnpm db:reset)" >&2
  exit 1
fi
TOKEN="$(curl -fsS "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'content-type: application/json' \
  -d "{\"email\":\"ops@example.com\",\"password\":\"$PASSWORD\"}" | jq -r .access_token)"
rest() { # rest METHOD PATH [BODY]
  curl -fsS -X "$1" "$SUPABASE_URL/rest/v1/$2" -H "apikey: $SUPABASE_ANON_KEY" \
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -H 'prefer: return=minimal' ${3:+-d "$3"}
}

SID="$(cat /proc/sys/kernel/random/uuid)"
TODAY="$(date -u +%F)"
NOW="$(date -u +%FT%TZ)"
rest POST session "{\"id\":\"$SID\",\"org_id\":\"$ORG\",\"parcel_id\":\"$PARCEL\",\
\"kind\":\"periodic_scan\",\"status\":\"planned\",\"planned_date\":\"$TODAY\",\"started_at\":\"$NOW\"}"
log "session $SID planned"

# --- raw store: MinIO ----------------------------------------------------------
docker run -d --rm --name "$MINIO_NAME" -p "127.0.0.1:$MINIO_PORT:9000" \
  -e MINIO_ROOT_USER="$MINIO_USER" -e MINIO_ROOT_PASSWORD="$MINIO_PASSWORD" \
  "$MINIO_IMAGE" server /tmp/data >/dev/null
for _ in $(seq 60); do
  curl -fs "http://127.0.0.1:$MINIO_PORT/minio/health/ready" >/dev/null && break
  sleep 1
done

ENV_FILE="$T/process.env"
cat >"$ENV_FILE" <<EOF
ORCHADOS_STORE_BACKEND=s3
ORCHADOS_STORE_PROVIDER=minio
ORCHADOS_STORE_ENDPOINT=http://127.0.0.1:$MINIO_PORT
ORCHADOS_STORE_BUCKET=orchados-raw
AWS_ACCESS_KEY_ID=$MINIO_USER
AWS_SECRET_ACCESS_KEY=$MINIO_PASSWORD
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
ORCHADOS_EMAIL=ops@example.com
ORCHADOS_PASSWORD=$PASSWORD
EOF
# The synthetic video is ~30 s: search the QR code in a shorter window.
echo '{"sync": {"qr_search_s": 4.0}}' >"$T/params.json"
mkdir -p "$T/office" "$T/vm"
chmod 777 "$T/office" "$T/vm"

in_image() { # in_image <work dir> <command...>
  local dir="$1"
  shift
  docker run --rm --network host --env-file "$ENV_FILE" -v "$dir:/work" \
    -v "$T/params.json:/params.json:ro" "$IMAGE" "$@"
}

# --- office: synthetic visit -> push ---------------------------------------------
log "synth + push (office)"
in_image "$T/office" sh -c "
  set -e
  orchados-pipeline synth /work/s --trees-from-db --parcel-id $PARCEL --session-id $SID \
    --rows 1-2 --positions 1-3 --start-utc $NOW
  orchados-ingest init
  orchados-ingest push /work/s --session-id $SID --org-id $ORG -q
  orchados-ingest verify $SID
"

# --- processing machine: a fresh container with an empty disk ----------------------
log "orchados-process (processing machine, CPU)"
in_image "$T/vm" env PROCESS_PARAMS=/params.json PROCESS_KEEP_WORK=1 orchados-process "$SID"

# --- checks ---------------------------------------------------------------------
[ -f "$T/vm/$SID/session/video/VID_0001.mp4" ] || {
  echo "video was not pulled" >&2
  exit 1
}
status="$(rest GET "session?id=eq.$SID&select=status" | jq -r '.[0].status')"
assets="$(rest GET "asset?session_id=eq.$SID&select=kind" | jq -r 'group_by(.kind) | map("\(.[0].kind)=\(length)") | join(" ")')"
crops="$(rest GET "asset?session_id=eq.$SID&kind=eq.tree_crop&select=id" | jq length)"
captures="$(rest GET "capture?session_id=eq.$SID&select=id" | jq length)"
log "status=$status assets: $assets; captures=$captures"
[ "$status" = processed ] || { echo "session status is $status, expected processed" >&2; exit 1; }
[ "$crops" -gt 0 ] || { echo "no tree crops uploaded" >&2; exit 1; }
[ "$captures" -gt 0 ] || { echo "no capture rows" >&2; exit 1; }
log "ok"
