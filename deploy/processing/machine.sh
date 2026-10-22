#!/usr/bin/env bash
# Processing machines on AWS, Azure or GCP with each provider's own CLI.
#
#   deploy/processing/machine.sh <aws|azure|gcp> <command> [args]
#
# Commands (Linux GPU machine for the pipeline):
#   create             create the machine (startup script installs driver, Docker, toolkit)
#   start | stop       start; stop (Azure: deallocate, so compute is not billed)
#   delete             delete the machine and its disk
#   status             state and public IP
#   ssh [cmd...]       SSH into the machine
#   run <session-id>   start, copy the job env, process the session, stop
#   budget             create a monthly budget alert (BUDGET_* settings)
# Windows GPU machine for Insta360 Studio (remote desktop):
#   win-create | win-start | win-stop | win-delete | win-status
#
# Settings: deploy/processing/machine.env (copy machine.env.example) or $MACHINE_ENV.
# The provider-specific part lives in providers/<provider>.sh; keep it thin.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PROVIDER="${1:-}"
CMD="${2:-}"
shift 2 || true

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}
case "$PROVIDER" in aws | azure | gcp) ;; *) usage ;; esac
[ -n "$CMD" ] || usage

ENV_FILE="${MACHINE_ENV:-$HERE/machine.env}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi
# Used by providers/<provider>.sh.
# shellcheck disable=SC2034
NAME="${MACHINE_NAME:-orchados-processing}"
# shellcheck disable=SC2034
WIN_NAME="${WIN_MACHINE_NAME:-orchados-studio}"
# shellcheck disable=SC2034
STARTUP="$HERE/linux/startup.sh"
JOB_ENV="${JOB_ENV:-$HERE/process.env}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

die() {
  echo "error: $*" >&2
  exit 1
}
need() { command -v "$1" >/dev/null || die "$1 not found (install the provider CLI)"; }

# shellcheck disable=SC1090
. "$HERE/providers/$PROVIDER.sh"

ssh_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -i "$SSH_KEY")

wait_ssh() {
  local ip="$1"
  for _ in $(seq 60); do
    if ssh "${ssh_opts[@]}" "$SSH_USER@$ip" true 2>/dev/null; then return 0; fi
    sleep 10
  done
  die "no SSH on $ip after 10 minutes"
}

run_job() {
  local sid="${1:?usage: run <session-id>}"
  [[ "$sid" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || die "bad session id"
  [ -f "$JOB_ENV" ] || die "job env $JOB_ENV not found (see process.env.example)"
  p_start
  local ip
  ip="$(p_ip)"
  echo "machine $NAME at $ip"
  wait_ssh "$ip"
  # The job env holds the Supabase ops password and store keys: root-only on the VM.
  ssh "${ssh_opts[@]}" "$SSH_USER@$ip" \
    'sudo install -d -m 700 /etc/orchados && sudo tee /etc/orchados/process.env >/dev/null && sudo chmod 600 /etc/orchados/process.env' \
    <"$JOB_ENV"
  local status=0
  # $sid is validated above; it expands locally on purpose.
  # shellcheck disable=SC2029
  # The machine may reboot once after the driver install; run-job waits for it.
  ssh "${ssh_opts[@]}" "$SSH_USER@$ip" "sudo orchados-run-job $sid" || status=$?
  if [ "$status" -eq 255 ]; then
    echo "SSH dropped (driver reboot?); retrying once"
    wait_ssh "$ip"
    status=0
    # shellcheck disable=SC2029
    ssh "${ssh_opts[@]}" "$SSH_USER@$ip" "sudo orchados-run-job $sid" || status=$?
  fi
  echo "job finished with status $status; stopping the machine"
  p_stop
  return "$status"
}

case "$CMD" in
  create) p_create ;;
  start) p_start ;;
  stop) p_stop ;;
  delete) p_delete ;;
  status) p_status ;;
  ssh) ip="$(p_ip)"; exec ssh "${ssh_opts[@]}" "$SSH_USER@$ip" "$@" ;;
  run) run_job "$@" ;;
  budget) p_budget ;;
  win-create) p_win_create ;;
  win-start) p_win_start ;;
  win-stop) p_win_stop ;;
  win-delete) p_win_delete ;;
  win-status) p_win_status ;;
  *) usage ;;
esac
