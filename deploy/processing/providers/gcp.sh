# shellcheck shell=bash
# NAME, WIN_NAME, STARTUP, SSH_* and die/need come from machine.sh.
# shellcheck disable=SC2153,SC2154
# Google Cloud (gcloud CLI). Sourced by machine.sh; defines p_* functions.
# Login: `gcloud auth login`; nothing is stored here. A power-off from inside the
# VM moves it to TERMINATED: compute is no longer billed (the disk is).

need gcloud
: "${GCP_ZONE:=europe-west4-a}"
: "${GCP_MACHINE_TYPE:=g2-standard-4}"
: "${GCP_WIN_MACHINE_TYPE:=n1-standard-8}"
: "${GCP_WIN_ACCELERATOR:=nvidia-tesla-t4-vws}"
: "${GCP_DISK_GB:=300}"
_g() { gcloud compute instances "$@" --zone "$GCP_ZONE" ${GCP_PROJECT:+--project "$GCP_PROJECT"}; }

_create() { # _create <name> <machine type> <accelerator or ""> <image args...>
  local name="$1" type="$2" acc="$3"
  shift 3
  local args=(--machine-type "$type" --maintenance-policy TERMINATE
    --boot-disk-size "${GCP_DISK_GB}GB" --boot-disk-type pd-balanced
    --labels project=orchados)
  [ -n "$acc" ] && args+=(--accelerator "type=$acc,count=1")
  if [ -n "${GCP_SERVICE_ACCOUNT:-}" ]; then
    args+=(--service-account "$GCP_SERVICE_ACCOUNT" --scopes cloud-platform)
  fi
  _g create "$name" "${args[@]}" "$@"
}

p_create() {
  _create "$NAME" "$GCP_MACHINE_TYPE" "${GCP_ACCELERATOR:-}" \
    --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud \
    --metadata-from-file "startup-script=$STARTUP" --metadata "ssh-keys=$SSH_USER:$(cat "$SSH_KEY.pub")"
}
p_start() { _g start "$NAME"; }
p_stop() { _g stop "$NAME"; }
p_delete() { _g delete "$NAME" --quiet; }
p_status() { _g describe "$NAME" --format 'table(name,machineType.basename(),status,networkInterfaces[0].accessConfigs[0].natIP)'; }
p_ip() { _g describe "$NAME" --format 'value(networkInterfaces[0].accessConfigs[0].natIP)'; }

p_budget() {
  gcloud billing budgets create --billing-account "${GCP_BILLING_ACCOUNT:?}" \
    --display-name orchados-monthly --budget-amount "${BUDGET_AMOUNT:-100}USD" \
    --threshold-rule percent=0.8 --threshold-rule percent=1.0,basis=forecasted-spend
  echo "budget orchados-monthly created; billing admins get the mails (docs/bulut-isleme.md)"
}

# Windows: T4 "virtual workstation" accelerator (GRID licence included), RDP 3389.
p_win_create() {
  _create "$WIN_NAME" "$GCP_WIN_MACHINE_TYPE" "$GCP_WIN_ACCELERATOR" \
    --image-family windows-2022 --image-project windows-cloud
  echo "password: gcloud compute reset-windows-password $WIN_NAME --zone $GCP_ZONE"
}
p_win_start() { _g start "$WIN_NAME"; }
p_win_stop() { _g stop "$WIN_NAME"; }
p_win_delete() { _g delete "$WIN_NAME" --quiet; }
p_win_status() { _g describe "$WIN_NAME" --format 'table(name,status,networkInterfaces[0].accessConfigs[0].natIP)'; }
