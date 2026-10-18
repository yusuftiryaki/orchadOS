#!/usr/bin/env bash
# Claude Code SessionStart hook (see .claude/settings.json).
#
# Cloud sessions only (CLAUDE_CODE_REMOTE=true): the Docker daemon does not start
# by itself there, but `supabase start` needs it. Start dockerd if it is not
# running and wait up to ~60 s for `docker info` to succeed.
#
# Locally this does nothing. It never fails the session: every path exits 0 and
# details go to /tmp/orchados-session-start.log.

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

LOG=/tmp/orchados-session-start.log
DOCKERD_LOG=/tmp/dockerd.log
WAIT_SECONDS=60

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" "$*" >>"$LOG" 2>/dev/null || true
}

docker_ready() {
  docker info >/dev/null 2>&1
}

main() {
  log "session start: checking docker"

  if ! command -v docker >/dev/null 2>&1; then
    log "docker CLI not found; skipping"
    echo "cloud-session-start: docker CLI not found (see $LOG)"
    return 0
  fi

  if docker_ready; then
    log "docker already running"
    echo "cloud-session-start: docker ready"
    return 0
  fi

  if ! command -v dockerd >/dev/null 2>&1; then
    log "dockerd not found; cannot start docker"
    echo "cloud-session-start: dockerd not found (see $LOG)"
    return 0
  fi

  if [ "$(id -u)" -eq 0 ]; then
    log "starting dockerd as root"
    nohup dockerd >"$DOCKERD_LOG" 2>&1 &
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    log "starting dockerd with sudo"
    sudo -n sh -c "nohup dockerd >'$DOCKERD_LOG' 2>&1 &"
  else
    log "not root and no passwordless sudo; cannot start dockerd"
    echo "cloud-session-start: cannot start dockerd (see $LOG)"
    return 0
  fi

  waited=0
  while [ "$waited" -lt "$WAIT_SECONDS" ]; do
    if docker_ready; then
      log "docker ready after ${waited}s"
      echo "cloud-session-start: docker ready (started dockerd)"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  log "docker not ready after ${WAIT_SECONDS}s; see $DOCKERD_LOG"
  echo "cloud-session-start: docker not ready after ${WAIT_SECONDS}s (see $DOCKERD_LOG)"
  return 0
}

main || true
exit 0
