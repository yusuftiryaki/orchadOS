#!/usr/bin/env bash
# orchadOS Point-LIO front end: replay each segment's MCAP into Point-LIO and
# record keyframes (contract orchados.lio_frontend/1, see README.md).
#
# Input:  /in/segments.json, session folder at /in/session (read only)
# Output: /out/frontend.json, /out/keyframes.csv, /out/scans/*.npz,
#         /out/logs/ (Point-LIO, recorder and player logs per segment)
set -uo pipefail
# Job control: without it, background children start with SIGINT ignored and
# the clean SIGINT stop below would not reach them.
set -m

IN=${ORCHADOS_IN:-/in}
OUT=${ORCHADOS_OUT:-/out}
CONFIG=${POINT_LIO_CONFIG:-/opt/orchados/config/unilidar_l2.yaml}
REC=/opt/orchados/keyframe_recorder.py
POINT_LIO_BIN=/opt/point_lio_ws/install/lib/point_lio/pointlio_mapping
READY_TIMEOUT_S=${READY_TIMEOUT_S:-60}
IDLE_S=${RECORDER_IDLE_S:-5}
MAX_WAIT_S=${RECORDER_MAX_WAIT_S:-600}

# The ROS setup scripts read unset variables.
set +u
# shellcheck disable=SC1091
source /opt/ros/humble/setup.bash
# shellcheck disable=SC1091
source /opt/point_lio_ws/install/setup.bash
set -u

log() { echo "[point-lio-frontend] $*" >&2; }

SEGMENTS=$IN/segments.json
[ -f "$SEGMENTS" ] || { log "missing $SEGMENTS"; exit 2; }
WORK=$OUT/.work
LOGS=$OUT/logs
mkdir -p "$OUT/scans" "$WORK" "$LOGS" || exit 2
cd "$WORK" || exit 2

PL_PID='' REC_PID='' PLAY_PID=''
stop_pid() {  # stop_pid <pid> <grace seconds>: SIGINT, then SIGKILL
  local pid=$1 grace=$2 i
  [ -n "$pid" ] || return 0
  kill -INT "$pid" 2>/dev/null || return 0
  for ((i = 0; i < grace * 10; i++)); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null; return 0; }
    sleep 0.1
  done
  kill -KILL "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
}
cleanup() {
  stop_pid "$PLAY_PID" 5
  stop_pid "$REC_PID" 5
  stop_pid "$PL_PID" 10
}
trap 'cleanup; exit 130' INT TERM

run_segment() {
  local idx=$1 seg=$WORK/seg_$1 status=ok path offset code
  # shellcheck disable=SC1091
  source "$seg/window.env"
  if [ -e "$seg/skip" ]; then
    log "segment $idx: skipped: $(cat "$seg/skip")"
    return
  fi
  log "segment $idx: window $START_UNIX_NS..$END_UNIX_NS (Unix ns), rate $RATE"

  "$POINT_LIO_BIN" --ros-args --params-file "$CONFIG" -p use_sim_time:=true \
    -p "preprocess.blind:=$BLIND" \
    -p "common.lid_topic:=$CLOUD_TOPIC" -p "common.imu_topic:=$IMU_TOPIC" \
    >"$LOGS/segment_${idx}_point_lio.log" 2>&1 &
  PL_PID=$!
  python3 "$REC" record --segments "$SEGMENTS" --index "$idx" \
    --start-ns "$START_UNIX_NS" --end-ns "$END_UNIX_NS" --config "$CONFIG" \
    --out "$OUT" --work "$seg" --idle-s "$IDLE_S" --max-wait-s "$MAX_WAIT_S" \
    >"$LOGS/segment_${idx}_recorder.log" 2>&1 &
  REC_PID=$!

  # Ready when the recorder sees Point-LIO's publishers.
  local waited=0
  while [ ! -e "$seg/ready" ]; do
    if ! kill -0 "$PL_PID" 2>/dev/null; then
      wait "$PL_PID"; code=$?; PL_PID=
      status="point_lio exited during start-up (code $code)"
      break
    fi
    if ! kill -0 "$REC_PID" 2>/dev/null; then
      status="keyframe recorder exited during start-up"
      break
    fi
    if ((waited >= READY_TIMEOUT_S * 10)); then
      status="point_lio did not come up within ${READY_TIMEOUT_S} s"
      break
    fi
    sleep 0.1
    waited=$((waited + 1))
  done

  if [ "$status" = ok ]; then
    while IFS=$'\t' read -r path offset; do
      [ -n "$path" ] || continue
      [ -e "$seg/past_end" ] && break
      log "segment $idx: play $path from +${offset} s"
      ros2 bag play "$path" --storage mcap --clock --rate "$RATE" \
        --start-offset "$offset" --delay 1 --topics "$CLOUD_TOPIC" "$IMU_TOPIC" \
        --qos-profile-overrides-path "$QOS" --disable-keyboard-controls \
        >>"$LOGS/segment_${idx}_play.log" 2>&1 &
      PLAY_PID=$!
      while kill -0 "$PLAY_PID" 2>/dev/null; do
        if ! kill -0 "$PL_PID" 2>/dev/null; then
          wait "$PL_PID"; code=$?; PL_PID=
          status="point_lio exited during playback (code $code)"
          break
        fi
        # The recorder flags when /clock passed the window end.
        [ -e "$seg/past_end" ] && break
        sleep 0.2
      done
      stop_pid "$PLAY_PID" 5
      PLAY_PID=
      [ "$status" = ok ] || break
    done <"$seg/files.tsv"
  fi

  # Let Point-LIO drain its queue; the recorder stops when it goes quiet.
  touch "$seg/play_done"
  while kill -0 "$REC_PID" 2>/dev/null; do
    if [ "$status" = ok ] && [ -n "$PL_PID" ] && ! kill -0 "$PL_PID" 2>/dev/null; then
      wait "$PL_PID"; code=$?; PL_PID=
      status="point_lio exited after playback (code $code)"
    fi
    sleep 0.2
  done
  wait "$REC_PID" 2>/dev/null
  REC_PID=
  stop_pid "$PL_PID" 10
  PL_PID=
  echo "$status" >"$seg/pl_status"
  log "segment $idx: point_lio run: $status"
}

INDICES=$(python3 "$REC" plan --segments "$SEGMENTS" --session "$IN/session" --work "$WORK") || {
  log "could not read $SEGMENTS"
  exit 2
}
RATE=$(cat "$WORK/rate")
# Point-LIO's blind range (m) from segments.json (default 0.6: the kit's mast).
BLIND=$(cat "$WORK/blind")
# Input topics from segments.json (default /unilidar/cloud, /unilidar/imu) and the
# QoS overrides of ros2 bag play for them (as config/qos_overrides.yaml).
CLOUD_TOPIC=$(cat "$WORK/cloud_topic")
IMU_TOPIC=$(cat "$WORK/imu_topic")
QOS=$WORK/qos_overrides.yaml
for idx in $INDICES; do
  run_segment "$idx"
done
python3 "$REC" finalize --segments "$SEGMENTS" --config "$CONFIG" --out "$OUT" \
  --work "$WORK" --max-wait-s "$MAX_WAIT_S" || exit 2
