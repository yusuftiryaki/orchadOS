# shellcheck shell=bash
# NAME, WIN_NAME, STARTUP, SSH_* and die/need come from machine.sh.
# shellcheck disable=SC2153,SC2154
# Azure (az CLI). Sourced by machine.sh; defines p_* functions.
# Login: `az login`; nothing is stored here.
#
# A power-off from inside the VM leaves it "Stopped" but still billed for compute;
# only a deallocate stops the meter. So `stop` deallocates, `run` stops at the end,
# and every VM gets Azure's daily auto-shutdown (which deallocates) as a second guard.

need az
: "${AZ_RESOURCE_GROUP:=orchados}"
: "${AZ_LOCATION:=westeurope}"
: "${AZ_SIZE:=Standard_NC4as_T4_v3}"
: "${AZ_WIN_SIZE:=Standard_NV12ads_A10_v5}"
: "${AZ_DISK_GB:=256}"
: "${AZ_AUTO_SHUTDOWN_UTC:=2000}"
UBUNTU_IMAGE=Canonical:ubuntu-24_04-lts:server:latest
WINDOWS_IMAGE=MicrosoftWindowsServer:WindowsServer:2022-datacenter-azure-edition:latest

_rg() { az group create -n "$AZ_RESOURCE_GROUP" -l "$AZ_LOCATION" -o none; }
_vm() { az vm "$@" -g "$AZ_RESOURCE_GROUP"; }

_guard() { # daily auto-shutdown and the office-only NSG rule
  az vm auto-shutdown -g "$AZ_RESOURCE_GROUP" -n "$1" --time "$AZ_AUTO_SHUTDOWN_UTC" -o none
  if [ -n "${OFFICE_CIDR:-}" ]; then
    az network nsg rule update -g "$AZ_RESOURCE_GROUP" --nsg-name "${1}NSG" \
      -n "$2" --source-address-prefixes "$OFFICE_CIDR" -o none 2>/dev/null ||
      echo "note: restrict ${1}NSG rule $2 to $OFFICE_CIDR by hand"
  fi
}

p_create() {
  _rg
  local scope=()
  if [ -n "${AZ_STORAGE_ACCOUNT:-}" ]; then
    local sa
    sa="$(az storage account show -n "$AZ_STORAGE_ACCOUNT" --query id -o tsv)"
    scope=(--assign-identity "[system]" --role "Storage Blob Data Contributor" --scope "$sa")
  fi
  _vm create -n "$NAME" --image "$UBUNTU_IMAGE" --size "$AZ_SIZE" \
    --admin-username "$SSH_USER" --ssh-key-values "$SSH_KEY.pub" \
    --os-disk-size-gb "$AZ_DISK_GB" --custom-data "$STARTUP" \
    --public-ip-sku Standard --tags project=orchados "${scope[@]}" -o table
  _guard "$NAME" default-allow-ssh
}
p_start() { _vm start -n "$NAME" -o none; }
p_stop() { _vm deallocate -n "$NAME" -o none; }
p_delete() { _vm delete -n "$NAME" --yes -o none; }
p_status() { _vm show -d -n "$NAME" --query '{name:name,size:hardwareProfile.vmSize,power:powerState,ip:publicIps}' -o table; }
p_ip() { _vm show -d -n "$NAME" --query publicIps -o tsv; }

p_budget() {
  local start
  start="$(date -u +%Y-%m-01)"
  az consumption budget create --budget-name orchados-monthly --category cost \
    --amount "${BUDGET_AMOUNT:-100}" --time-grain monthly \
    --start-date "$start" --end-date "$(date -u -d "$start +2 years" +%F)" \
    --resource-group "$AZ_RESOURCE_GROUP" -o none
  echo "budget orchados-monthly created on $AZ_RESOURCE_GROUP; add the e-mail alert (80%) in"
  echo "Cost Management > Budgets (the CLI cannot set notifications), see docs/bulut-isleme.md"
}

# Windows: NVIDIA GRID driver through the GPU driver extension, RDP 3389.
p_win_create() {
  _rg
  local pw
  read -r -s -p "Windows admin password: " pw
  echo
  _vm create -n "$WIN_NAME" --image "$WINDOWS_IMAGE" --size "$AZ_WIN_SIZE" \
    --admin-username orchados --admin-password "$pw" --os-disk-size-gb "$AZ_DISK_GB" \
    --public-ip-sku Standard --tags project=orchados -o table
  az vm extension set -g "$AZ_RESOURCE_GROUP" --vm-name "$WIN_NAME" \
    --name NvidiaGpuDriverWindows --publisher Microsoft.HpcCompute -o none
  _guard "$WIN_NAME" rdp
}
p_win_start() { _vm start -n "$WIN_NAME" -o none; _vm show -d -n "$WIN_NAME" --query publicIps -o tsv; }
p_win_stop() { _vm deallocate -n "$WIN_NAME" -o none; }
p_win_delete() { _vm delete -n "$WIN_NAME" --yes -o none; }
p_win_status() { _vm show -d -n "$WIN_NAME" --query '{name:name,power:powerState,ip:publicIps}' -o table; }
