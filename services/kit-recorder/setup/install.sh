#!/usr/bin/env bash
# Prepares a fresh Ubuntu Server 24.04 (arm64) on the kit's Raspberry Pi 4 as the
# recorder: ROS 2 Jazzy and the Unitree L2 driver, chrony with PPS, BlueZ, the
# SSD mount, the systemd units and orchados-recorder itself.
#
#   sudo services/kit-recorder/setup/install.sh [--skip-lidar-driver]
#
# Safe to run again: every step skips what is already in place; files the
# operator may edit (/etc/orchados/*) are installed once and never overwritten.
# Needs the internet while it runs; the Pi does not need it afterwards.
# Step by step: services/kit-recorder/README.md.
set -euo pipefail

SETUP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(dirname "$SETUP")"

PREFIX=/opt/orchados
APP="$PREFIX/kit-recorder"
ROS_WS="$PREFIX/ros2_ws"
ETC=/etc/orchados
SSD_MOUNT=/mnt/orchados-ssd
BOOT_CONFIG=/boot/firmware/config.txt
CHRONY_CONF=/etc/chrony/chrony.conf
UV_VERSION=0.13.8
SYSTEM_PYTHON=/usr/bin/python3
# The L2 driver; package name checked on the hardware (README, "L2 sürücüsü").
UNILIDAR_REPO=https://github.com/unitreerobotics/unilidar_sdk2.git
UNILIDAR_PACKAGE=unitree_lidar_ros2
# Upstream v2.0.10. The patches below are made on this commit; moving it means
# remaking them (README, "L2 sürücüsü").
UNILIDAR_COMMIT=0e3c51f512e6b8ff60b8c32f160b412cb48445c2
# The ROS 2 node's IMU bugs: unilidar_sdk2 #33 (packet read twice, /unilidar/imu
# nearly silent) and #14 (orientation filled in the wrong order).
UNILIDAR_PATCHES=(
  "$SETUP/patches/unilidar_sdk2-imu-read-once.patch"
  "$SETUP/patches/unilidar_sdk2-imu-quaternion-order.patch"
)

BLOCK_BEGIN="# >>> orchados kit-recorder >>>"
BLOCK_END="# <<< orchados kit-recorder <<<"

skip_lidar_driver=0
reboot_needed=0
lidar_driver_failed=0

log() { printf '\n== %s\n' "$*"; }
note() { printf '   %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }

# install_file SRC DEST [MODE]: copy when missing or different; 0 if it changed.
install_file() {
  local src=$1 dest=$2 mode=${3:-0644}
  if [[ -f $dest ]] && cmp -s "$src" "$dest"; then
    return 1
  fi
  install -D -m "$mode" "$src" "$dest"
  note "installed $dest"
}

# install_once SRC DEST: for files the operator edits; never overwrites.
install_once() {
  local src=$1 dest=$2
  if [[ -e $dest ]]; then
    note "kept $dest (already there)"
  else
    install -D -m 0644 "$src" "$dest"
    note "installed $dest"
  fi
}

# put_block FILE SRC: FILE gets SRC's lines once, between the orchadOS markers.
# An older block is replaced. Returns 0 if FILE changed, 1 if it was already in
# place, 2 on an error (set -e does not apply inside a function called in a
# condition, hence the explicit checks). The new content goes to a temp file next
# to FILE, is synced and renamed over it: /boot/firmware is FAT, and a power cut
# must leave the old or the new config.txt, never a truncated one.
put_block() {
  local file=$1 src=$2 tmp
  tmp="$(mktemp "$file.orchados.XXXXXX")" || return 2
  if [[ -f $file ]] && ! awk -v b="$BLOCK_BEGIN" -v e="$BLOCK_END" \
    '$0 == b {skip = 1; next} $0 == e {skip = 0; next} !skip' "$file" >"$tmp"; then
    rm -f "$tmp"
    return 2
  fi
  if ! { echo "$BLOCK_BEGIN" && cat "$src" && echo "$BLOCK_END"; } >>"$tmp"; then
    rm -f "$tmp"
    return 2
  fi
  if [[ -f $file ]] && cmp -s "$tmp" "$file"; then
    rm -f "$tmp"
    return 1
  fi
  # mktemp makes it 0600; keep the old file's mode (FAT ignores both).
  if [[ -f $file ]]; then
    chmod --reference="$file" "$tmp" 2>/dev/null || true
  else
    chmod 0644 "$tmp" 2>/dev/null || true
  fi
  if ! sync "$tmp" || ! mv -f "$tmp" "$file"; then
    rm -f "$tmp"
    return 2
  fi
  sync "$(dirname "$file")" || true
  note "updated $file"
}

check_system() {
  if [[ $EUID -ne 0 ]]; then
    echo "run as root: sudo $0" >&2
    exit 1
  fi
  local id="" version=""
  # shellcheck source=/dev/null
  [[ -f /etc/os-release ]] && { id=$(. /etc/os-release && echo "$ID"); version=$(. /etc/os-release && echo "$VERSION_ID"); }
  if [[ $id != ubuntu || $version != 24.04 || $(dpkg --print-architecture) != arm64 ]]; then
    warn "expected Ubuntu 24.04 arm64, found ${id:-?} ${version:-?} $(dpkg --print-architecture); continuing"
  fi
}

# ensure_updates_pocket FILE: some Pi images list noble and noble-security but not
# noble-updates; security fixes then outrun the -dev packages ROS needs (libzstd1
# vs libzstd-dev) and apt cannot install ros-base.
ensure_updates_pocket() {
  local file=$1
  [[ -f $file ]] || return 0
  if grep -qx 'Suites: noble' "$file"; then
    sed -i 's/^Suites: noble$/Suites: noble noble-updates/' "$file"
    note "added noble-updates to $file"
  fi
}

install_packages() {
  log "System packages"
  export DEBIAN_FRONTEND=noninteractive
  ensure_updates_pocket /etc/apt/sources.list.d/ubuntu.sources
  apt-get update -q
  apt-get install -y -q chrony pps-tools bluez rfkill rsync git curl ca-certificates \
    build-essential cmake software-properties-common
}

install_ros() {
  log "ROS 2 Jazzy (ros-base)"
  if ! dpkg -s ros2-apt-source >/dev/null 2>&1; then
    add-apt-repository -y universe
    local tag codename deb
    tag=$(curl -fsSL https://api.github.com/repos/ros-infrastructure/ros-apt-source/releases/latest |
      grep -F '"tag_name"' | awk -F'"' '{print $4}')
    # shellcheck source=/dev/null
    codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
    deb="$(mktemp --suffix=.deb)"
    curl -fsSL -o "$deb" \
      "https://github.com/ros-infrastructure/ros-apt-source/releases/download/${tag}/ros2-apt-source_${tag}.${codename}_all.deb"
    dpkg -i "$deb"
    rm -f "$deb"
    apt-get update -q
  else
    note "ROS 2 apt source already there"
  fi
  apt-get install -y -q ros-jazzy-ros-base ros-jazzy-rosbag2-storage-mcap ros-dev-tools
}

install_uv() {
  log "uv $UV_VERSION"
  if command -v uv >/dev/null && [[ $(uv --version) == "uv $UV_VERSION"* ]]; then
    note "already installed"
    return
  fi
  curl -fsSL "https://astral.sh/uv/$UV_VERSION/install.sh" |
    env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 INSTALLER_NO_MODIFY_PATH=1 sh
}

install_recorder() {
  log "orchados-recorder in $APP"
  mkdir -p "$APP"
  if [[ $SRC != "$APP" ]]; then
    rsync -a --delete --exclude .venv --exclude __pycache__ --exclude .pytest_cache \
      --exclude .ruff_cache "$SRC/" "$APP/"
  fi
  # rclpy comes from /opt/ros (system Python 3.12): the venv must see system packages.
  if ! grep -qs '^include-system-site-packages = true' "$APP/.venv/pyvenv.cfg"; then
    uv venv --clear --system-site-packages --python "$SYSTEM_PYTHON" "$APP/.venv"
  fi
  (cd "$APP" && UV_PROJECT_ENVIRONMENT="$APP/.venv" uv sync --frozen --no-dev \
    --python "$SYSTEM_PYTHON" --no-python-downloads)
  note "version $("$APP/.venv/bin/orchados-recorder" version)"
  if ! /usr/local/bin/orchados-ros-exec "$APP/.venv/bin/python" -c 'import rclpy' 2>/dev/null; then
    warn "rclpy cannot be imported in the recorder's venv; the LiDAR will not be monitored"
  fi

  install_once "$SRC/config/recorder.toml" "$ETC/recorder.toml"
  install_once "$SETUP/unilidar.env" "$ETC/unilidar.env"
}

configure_boot() {
  log "Boot config: PPS overlay (GPIO18)"
  if [[ ! -f $BOOT_CONFIG ]]; then
    warn "$BOOT_CONFIG not found; add setup/config.txt.append to the boot config by hand"
    return
  fi
  local rc=0
  put_block "$BOOT_CONFIG" "$SETUP/config.txt.append" || rc=$?
  case $rc in
    0) reboot_needed=1 ;;
    1) note "already in place" ;;
    *)
      warn "could not update $BOOT_CONFIG"
      exit 1
      ;;
  esac
}

configure_chrony() {
  log "chrony: PPS locked to the receiver's time"
  local changed=0
  install_file "$SETUP/chrony-orchados.conf" /etc/chrony/conf.d/orchados.conf && changed=1
  if [[ -f $CHRONY_CONF ]]; then
    if ! grep -qE '^confdir /etc/chrony/conf.d' "$CHRONY_CONF"; then
      warn "$CHRONY_CONF does not read /etc/chrony/conf.d; add: confdir /etc/chrony/conf.d"
    fi
    # Ubuntu's own makestep (later in the file) would override ours.
    if grep -qE '^makestep ' "$CHRONY_CONF"; then
      sed -i -E 's|^(makestep .*)$|# orchados: see conf.d/orchados.conf: \1|' "$CHRONY_CONF"
      note "disabled the default makestep in $CHRONY_CONF"
      changed=1
    fi
  fi
  systemctl enable chrony.service >/dev/null
  if ((changed)); then
    systemctl restart chrony.service
  else
    note "already in place"
  fi
}

configure_bluetooth() {
  log "Bluetooth (BlueZ)"
  rfkill unblock bluetooth || true
  systemctl enable --now bluetooth.service
}

configure_ssd() {
  log "SSD: label ORCHADOS-SSD on $SSD_MOUNT (nofail)"
  mkdir -p "$SSD_MOUNT"
  local line
  line=$(grep -v '^#' "$SETUP/fstab.append")
  if grep -qxF "$line" /etc/fstab; then
    note "fstab line already there"
  else
    sed -i '/^LABEL=ORCHADOS-SSD[[:space:]]/d' /etc/fstab
    echo "$line" >>/etc/fstab
    note "added the fstab line"
  fi
  install_file "$SETUP/99-orchados-ssd.rules" /etc/udev/rules.d/99-orchados-ssd.rules &&
    udevadm control --reload
  install_file "$SETUP/orchados-ssd-mount.service" \
    /etc/systemd/system/orchados-ssd-mount.service || true
  systemctl daemon-reload
  if blkid -L ORCHADOS-SSD >/dev/null 2>&1 && ! mountpoint -q "$SSD_MOUNT"; then
    mount "$SSD_MOUNT" && note "mounted the SSD"
  fi
}

configure_network() {
  log "Ethernet for the L2 (applies after reboot)"
  install_file "$SETUP/netplan-orchados-lidar.yaml" /etc/netplan/90-orchados-lidar.yaml 0600 &&
    reboot_needed=1
  return 0
}

configure_journald() {
  log "journald: at most 200 MB"
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<'EOF'
# orchadOS kit: keep the logs small on the SD card (recordings go to the SSD).
[Journal]
SystemMaxUse=200M
EOF
  if install_file "$tmp" /etc/systemd/journald.conf.d/orchados.conf; then
    systemctl restart systemd-journald
  else
    note "already in place"
  fi
  rm -f "$tmp"
}

disable_unused_services() {
  log "Turning off services the kit does not use"
  local unit
  for unit in snapd.service snapd.socket snapd.seeded.service unattended-upgrades.service \
    apt-daily.timer apt-daily-upgrade.timer; do
    if systemctl list-unit-files "$unit" --no-legend 2>/dev/null | grep -q .; then
      if systemctl is-enabled -q "$unit" 2>/dev/null || systemctl is-active -q "$unit"; then
        systemctl disable --now "$unit" >/dev/null 2>&1 || warn "could not disable $unit"
        note "disabled $unit"
      fi
    fi
  done
  # cloud-init has done its job on the first boot (user, network).
  if [[ -d /etc/cloud && ! -e /etc/cloud/cloud-init.disabled ]]; then
    touch /etc/cloud/cloud-init.disabled
    note "disabled cloud-init"
  fi
}

# apply_patches DIR PATCH...: applies each patch to the git checkout in DIR once.
# A patch already in place is skipped; one that neither applies nor is in place
# (the checkout differs from the commit it was made on) fails with 1.
apply_patches() {
  local dir=$1 patch
  shift
  for patch in "$@"; do
    if git -C "$dir" apply --reverse --check "$patch" 2>/dev/null; then
      note "already applied: ${patch##*/}"
    elif git -C "$dir" apply --check "$patch" && git -C "$dir" apply "$patch"; then
      note "applied ${patch##*/}"
    else
      warn "$patch does not apply to $dir"
      return 1
    fi
  done
}

# Builds the Unitree L2 ROS 2 driver in $ROS_WS from the pinned commit with the
# patches. Unitree validated it on ROS 2 Foxy only; whether it builds on Jazzy is
# the first thing to try on the Pi. A build of another commit or other patches
# (an older install.sh) is rebuilt.
build_unilidar() {
  log "Unitree L2 driver ($UNILIDAR_PACKAGE) in $ROS_WS"
  local src="$ROS_WS/src/unilidar_sdk2" stamp="$ROS_WS/install/.orchados-unilidar" want
  want="$UNILIDAR_COMMIT $(cat "${UNILIDAR_PATCHES[@]}" | sha256sum | cut -d' ' -f1)" || return 1
  if [[ -d $ROS_WS/install/$UNILIDAR_PACKAGE && $(cat "$stamp" 2>/dev/null) == "$want" ]]; then
    note "already built (delete $ROS_WS/install to rebuild)"
    return 0
  fi
  mkdir -p "$ROS_WS/src"
  if [[ ! -d $src/.git ]]; then
    git init -q "$src" && git -C "$src" remote add origin "$UNILIDAR_REPO" || return 1
  fi
  if [[ $(git -C "$src" rev-parse -q --verify HEAD) != "$UNILIDAR_COMMIT" ]]; then
    # --force drops the patches applied to the old commit; they are applied again.
    git -C "$src" fetch -q --depth 1 "$UNILIDAR_REPO" "$UNILIDAR_COMMIT" &&
      git -C "$src" checkout -q --force --detach FETCH_HEAD || return 1
  fi
  apply_patches "$src" "${UNILIDAR_PATCHES[@]}" || return 1
  # The repository also holds a ROS 1 package; colcon must not pick it up.
  if [[ -d $src/unitree_lidar_ros ]]; then
    touch "$src/unitree_lidar_ros/COLCON_IGNORE"
  fi
  (cd "$ROS_WS" && /usr/local/bin/orchados-ros-exec colcon build \
    --packages-up-to "$UNILIDAR_PACKAGE" --cmake-args -DCMAKE_BUILD_TYPE=Release) || return 1
  echo "$want" >"$stamp"
}

install_units() {
  log "systemd units"
  install_file "$SETUP/unilidar.service" /etc/systemd/system/unilidar.service || true
  install_file "$SETUP/orchados-recorder.service" /etc/systemd/system/orchados-recorder.service ||
    true
  systemctl daemon-reload
  systemctl enable unilidar.service orchados-recorder.service
  # Picks up a new version; never run this during a recording.
  systemctl try-restart unilidar.service orchados-recorder.service
  systemctl start unilidar.service orchados-recorder.service || true
}

main() {
  while (($#)); do
    case $1 in
      --skip-lidar-driver) skip_lidar_driver=1 ;;
      -h | --help)
        sed -n '2,11p' "$0"
        exit 0
        ;;
      *)
        echo "unknown option: $1" >&2
        exit 2
        ;;
    esac
    shift
  done

  check_system
  install_packages
  install_ros
  install_uv
  # The wrapper is needed by the rclpy check and the driver build below.
  install_file "$SETUP/orchados-ros-exec" /usr/local/bin/orchados-ros-exec 0755 || true
  install_recorder
  configure_boot
  configure_chrony
  configure_bluetooth
  configure_ssd
  configure_network
  configure_journald
  disable_unused_services
  if ((skip_lidar_driver)); then
    log "Unitree L2 driver: skipped (--skip-lidar-driver)"
  elif ! build_unilidar; then
    lidar_driver_failed=1
  fi
  install_units

  log "Done"
  if ((lidar_driver_failed)); then
    warn "the Unitree L2 driver did not build (output above; logs in $ROS_WS/log)."
    warn "Everything else is installed. orchados-recorder runs without the LiDAR: its"
    warn "pre-check item fails and can only be overridden. See README, 'L2 sürücüsü'."
  fi
  if ((reboot_needed)); then
    note "reboot to apply the boot config and the network: sudo reboot"
  fi
  note "check: systemctl status orchados-recorder; journalctl -u orchados-recorder -f"
  if ((lidar_driver_failed)); then
    exit 1
  fi
}

main "$@"
