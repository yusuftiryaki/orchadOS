#!/usr/bin/env bash
# Smoke test for the Point-LIO front-end image (manual; heavy).
#
#   smoke.sh [--no-build] [--image NAME] [SESSION_DIR]
#
# Builds the image, then runs it on SESSION_DIR (one segment per
# lidar/raw/bag*/ folder) or, without one, on a tiny synthetic recording made
# inside the image (tools/make_test_bag.py: two overlapping segments). Checks
# the output against orchados.lio_frontend/1 (tools/check_output.py).
# Scratch goes to .smoke/ next to this script.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
IMAGE=${ORCHADOS_POINT_LIO_IMAGE:-orchados-lio-point-lio:local}
BUILD=1
SESSION=
while [ $# -gt 0 ]; do
  case $1 in
    --no-build) BUILD=0 ;;
    --image) IMAGE=$2; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) SESSION=$(cd "$1" && pwd) ;;
  esac
  shift
done

if [ "$BUILD" = 1 ]; then
  docker build -t "$IMAGE" "$HERE"
fi

SCRATCH=$HERE/.smoke
IN=$SCRATCH/in
OUT=$SCRATCH/out
rm -rf "$IN" "$OUT"
mkdir -p "$IN" "$OUT"
USER_ARGS=(--user "$(id -u):$(id -g)")

if [ -z "$SESSION" ]; then
  SESSION=$SCRATCH/session
  rm -rf "$SESSION"
  mkdir -p "$SESSION"
  docker run --rm "${USER_ARGS[@]}" --network none --entrypoint bash \
    -v "$SESSION:/in/session" -v "$IN:/in/spec" "$IMAGE" -c \
    'source /opt/ros/humble/setup.bash && python3 /opt/orchados/tools/make_test_bag.py /in/session --in-dir /in/spec'
  TRUTH=(--truth /in/session/truth.json)
else
  docker run --rm "${USER_ARGS[@]}" --network none --entrypoint python3 \
    -v "$SESSION:/in/session:ro" -v "$IN:/in/spec" "$IMAGE" \
    /opt/orchados/tools/session_segments.py /in/session /in/spec/segments.json
  TRUTH=()
fi

start=$(date +%s)
docker run --rm "${USER_ARGS[@]}" --network none \
  -v "$SESSION:/in/session:ro" -v "$IN/segments.json:/in/segments.json:ro" -v "$OUT:/out" \
  "$IMAGE"
echo "front end took $(($(date +%s) - start)) s"

docker run --rm "${USER_ARGS[@]}" --network none --entrypoint python3 \
  -v "$SESSION:/in/session:ro" -v "$OUT:/out:ro" "$IMAGE" \
  /opt/orchados/tools/check_output.py /out "${TRUTH[@]}"
