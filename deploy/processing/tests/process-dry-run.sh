#!/usr/bin/env bash
# Runs orchados-process against fake orchados-ingest, orchados-pipeline and docker
# binaries that only log their arguments: checks the order of the steps and when the
# LiDAR registration runs (PROCESS_LIDAR, PROCESS_LIDAR_FRONTEND, the Docker check).
# No image, no store, no Supabase.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
LOG="$T/calls.log"
SID=4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b

# orchados-ingest pull writes a session; with FAKE_LIDAR=1 it has lidar/raw.
cat >"$T/bin/orchados-ingest" <<EOF
#!/usr/bin/env bash
echo "orchados-ingest \$*" >>"$LOG"
case "\$1" in
  config) echo "store: fake" ;;
  pull)
    mkdir -p "\$3/gnss"
    echo '{"kind": "periodic_scan"}' >"\$3/session.json"
    if [ "\${FAKE_LIDAR:-0}" = 1 ]; then mkdir -p "\$3/lidar/raw/bag"; fi
    ;;
esac
EOF
# orchados-pipeline run writes the run folder with the trees, the trajectory and the
# panoramas it made (FAKE_NO_TRAJECTORY=1: no trajectory.json).
cat >"$T/bin/orchados-pipeline" <<EOF
#!/usr/bin/env bash
echo "orchados-pipeline \$* TMPDIR=\${TMPDIR:-}" >>"$LOG"
if [ "\$1" = run ]; then
  mkdir -p "\$4/v0.1.0_abcdef012345"
  echo '{"trees": []}' >"\$4/v0.1.0_abcdef012345/trees.json"
  echo '{"panoramas": []}' >"\$4/v0.1.0_abcdef012345/panoramas.json"
  if [ "\${FAKE_NO_TRAJECTORY:-0}" != 1 ]; then
    echo '{"points": []}' >"\$4/v0.1.0_abcdef012345/trajectory.json"
  fi
fi
if [ "\$1" = lidar ]; then
  [ -d "\${TMPDIR:-/nonexistent}" ] || { echo "TMPDIR \${TMPDIR:-} missing" >&2; exit 1; }
  exit "\${FAKE_LIDAR_STATUS:-0}"
fi
EOF
cat >"$T/bin/docker" <<EOF
#!/usr/bin/env bash
echo "docker \$*" >>"$LOG"
[ "\${FAKE_DOCKER_FAIL:-0}" = 1 ] && exit 1
[ "\$1 \$2" = "image inspect" ] && [ "\${FAKE_NO_IMAGE:-0}" = 1 ] && exit 1
exit 0
EOF
chmod +x "$T/bin/"*

p() { # p [VAR=value...]: run orchados-process for $SID, output in $T/out.txt
  : >"$LOG"
  env PATH="$T/bin:$PATH" ORCHADOS_WORK_DIR="$T/work" SUPABASE_URL=http://x \
    SUPABASE_ANON_KEY=k ORCHADOS_EMAIL=ops@example.com ORCHADOS_PASSWORD=x \
    ORCHADOS_STORE_BACKEND=local "$@" "$HERE/orchados-process" "$SID" >"$T/out.txt" 2>&1
}
fail() {
  echo "FAIL: $*" >&2
  echo "--- calls" >&2
  cat "$LOG" >&2
  echo "--- output" >&2
  cat "$T/out.txt" >&2
  exit 1
}
expect() { grep -qE -- "$1" "$LOG" || fail "missing call: $1"; }
absent() { ! grep -qE -- "$1" "$LOG" || fail "unexpected call: $1"; }

W="$T/work/$SID"
LIDAR="orchados-pipeline lidar process $W/session"

# No LiDAR in the session: no registration, no Docker.
p || fail "plain session failed"
expect "orchados-pipeline run $W/session --out $W/out --trees-from-db --upload"
absent "lidar process"
absent "^docker"

# lidar/raw present: registration with Point-LIO after the pipeline run, results and
# temporary files under the work folder; Docker and the front-end image are checked first.
# The trajectory and the panoramas are the camera run's (under $W/out, not next to the
# session).
RUN="$W/out/v0.1.0_abcdef012345"
p FAKE_LIDAR=1 || fail "LiDAR session failed"
expect "^$LIDAR --frontend point_lio --out $W/out/lidar/registration --trajectory $RUN/trajectory.json --panoramas $RUN/panoramas.json --trees $RUN/trees.json --upload TMPDIR=$W/tmp\$"
expect "^docker image inspect orchados-lio-point-lio:local"
[ "$(grep -n 'orchados-pipeline run' "$LOG" | cut -d: -f1)" -lt "$(grep -n 'lidar process' "$LOG" | cut -d: -f1)" ] ||
  fail "lidar process ran before the pipeline"
[ "$(grep -n '^docker' "$LOG" | head -n 1 | cut -d: -f1)" -lt "$(grep -n 'orchados-pipeline run' "$LOG" | cut -d: -f1)" ] ||
  fail "Docker was not checked before the pipeline run"
[ ! -e "$W" ] || fail "work folder was not removed"

# The camera run made no trajectory: the registration falls back to NAV-PVT itself.
p FAKE_LIDAR=1 FAKE_NO_TRAJECTORY=1 || fail "LiDAR session without trajectory failed"
expect "^$LIDAR --frontend point_lio --out $W/out/lidar/registration --panoramas $RUN/panoramas.json --trees"
absent "--trajectory"

# Another front-end image name.
p FAKE_LIDAR=1 ORCHADOS_POINT_LIO_IMAGE=registry.local/lio:7 || fail "image override failed"
expect "^docker image inspect registry.local/lio:7"

# PROCESS_LIDAR=0: never.
p FAKE_LIDAR=1 PROCESS_LIDAR=0 || fail "PROCESS_LIDAR=0 failed"
absent "lidar process"

# PROCESS_LIDAR=1: always (lidar process itself skips a session without LiDAR data).
p PROCESS_LIDAR=1 || fail "PROCESS_LIDAR=1 failed"
expect "^$LIDAR --frontend point_lio"

# The fake front end needs no Docker.
p FAKE_LIDAR=1 PROCESS_LIDAR_FRONTEND=fake FAKE_DOCKER_FAIL=1 || fail "fake front end failed"
expect "^$LIDAR --frontend fake"
absent "^docker"

# No Docker daemon or no front-end image: fails before the pipeline run, says why.
if p FAKE_LIDAR=1 FAKE_DOCKER_FAIL=1; then fail "ran without Docker"; fi
grep -q "Docker socket" "$T/out.txt" || fail "no hint about the Docker socket"
absent "orchados-pipeline run"
if p FAKE_LIDAR=1 FAKE_NO_IMAGE=1; then fail "ran without the front-end image"; fi
grep -q "orchados-lio-point-lio:local" "$T/out.txt" || fail "missing image not named"
absent "orchados-pipeline run"

# A failed LiDAR step fails the job (after the camera results are uploaded).
if p FAKE_LIDAR=1 PROCESS_LIDAR_FRONTEND=fake FAKE_LIDAR_STATUS=3; then
  fail "a failing LiDAR step did not fail the job"
fi
expect "orchados-pipeline run .* --upload"

# Bad settings are refused before anything is pulled.
if p PROCESS_LIDAR=maybe; then fail "PROCESS_LIDAR=maybe accepted"; fi
absent "pull"
if p PROCESS_LIDAR_FRONTEND="point_lio --upload"; then fail "bad front end accepted"; fi
absent "pull"

echo "process dry run: ok"
