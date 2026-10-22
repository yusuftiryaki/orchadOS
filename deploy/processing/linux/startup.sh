#!/usr/bin/env bash
# First-boot setup for the Linux GPU processing machine (Ubuntu 24.04).
#
# The same script is the user data on AWS, the custom data on Azure and the
# startup script on GCP; it is idempotent (GCP runs it on every boot). It installs:
#   - the NVIDIA driver (ubuntu-drivers; skipped without an NVIDIA card),
#   - Docker (Ubuntu's docker.io) and the NVIDIA container toolkit,
#   - /usr/local/bin/orchados-run-job: pull the image and process one session,
#   - an idle watchdog: powers the machine off after IDLE_MINUTES without a job
#     or a logged-in user (cost guard; on Azure see docs: power-off != deallocate).
# Settings: /etc/orchados/machine.conf (written below if missing).
set -euo pipefail
exec > >(tee -a /var/log/orchados-startup.log) 2>&1
echo "orchados startup $(date -u +%FT%TZ)"

mkdir -p /etc/orchados /var/lib/orchados /srv/orchados/work
if [ ! -f /etc/orchados/machine.conf ]; then
  cat >/etc/orchados/machine.conf <<'EOF'
# Processing image (ghcr.io, public or with `docker login ghcr.io` beforehand).
IMAGE=ghcr.io/yusuftiryaki/orchados-processing:main
# Power off after this many minutes without a job or a logged-in user (0 = never).
IDLE_MINUTES=30
# Power off right after a job (1) or leave it to the idle watchdog (0).
SHUTDOWN_AFTER_JOB=1
EOF
fi

export DEBIAN_FRONTEND=noninteractive
if [ ! -f /var/lib/orchados/packages-done ]; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl gnupg docker.io jq ubuntu-drivers-common
  systemctl enable --now docker

  # NVIDIA driver (data-centre "server" branch) when a card is present.
  if lspci | grep -qi nvidia; then
    ubuntu-drivers install --gpgpu || echo "warning: ubuntu-drivers failed; see docs/bulut-isleme.md"
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey |
      gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list |
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        >/etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y --no-install-recommends nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
  fi
  touch /var/lib/orchados/packages-done
fi

cat >/usr/local/bin/orchados-run-job <<'EOF'
#!/usr/bin/env bash
# orchados-run-job <session-id>: process one session in the image.
# Job environment (store, Supabase ops user, optional ANTHROPIC_API_KEY):
# /etc/orchados/process.env (root only, copied by machine.sh run).
set -euo pipefail
# shellcheck disable=SC1091
. /etc/orchados/machine.conf
SID="${1:?usage: orchados-run-job <session-id>}"
until [ -f /var/lib/orchados/packages-done ]; do echo "waiting for setup..."; sleep 10; done
# After a fresh driver install the machine reboots once; wait up to 10 min for it.
for _ in $(seq 60); do
  if ! lspci | grep -qi nvidia || nvidia-smi -L >/dev/null 2>&1; then break; fi
  echo "waiting for the NVIDIA driver..."; sleep 10
done
touch /var/lib/orchados/activity /var/lib/orchados/job-running
trap 'rm -f /var/lib/orchados/job-running; touch /var/lib/orchados/activity' EXIT
gpu=()
if command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null 2>&1; then gpu=(--gpus all); fi
docker pull "$IMAGE"
status=0
docker run --rm "${gpu[@]}" --env-file /etc/orchados/process.env \
  -v /srv/orchados/work:/work "$IMAGE" orchados-process "$SID" \
  2>&1 | tee -a "/var/log/orchados-job-$SID.log" || status=$?
echo "job $SID finished with status $status"
if [ "${SHUTDOWN_AFTER_JOB:-1}" = "1" ]; then
  echo "powering off in 2 minutes (SHUTDOWN_AFTER_JOB=1; cancel: sudo shutdown -c)"
  shutdown -h +2
fi
exit "$status"
EOF
chmod 755 /usr/local/bin/orchados-run-job
chown -R 10001:10001 /srv/orchados/work

cat >/usr/local/bin/orchados-idle-check <<'EOF'
#!/usr/bin/env bash
# Power off when idle: no job, nobody logged in, no activity for IDLE_MINUTES.
set -euo pipefail
# shellcheck disable=SC1091
. /etc/orchados/machine.conf
[ "${IDLE_MINUTES:-30}" -gt 0 ] || exit 0
[ -f /var/lib/orchados/job-running ] && exit 0
[ "$(who | wc -l)" -gt 0 ] && exit 0
last=$(stat -c %Y /var/lib/orchados/activity 2>/dev/null || echo 0)
boot=$(date -d "$(uptime -s)" +%s)
ref=$(( last > boot ? last : boot ))
if [ $(( $(date +%s) - ref )) -ge $(( IDLE_MINUTES * 60 )) ]; then
  logger -t orchados "idle for ${IDLE_MINUTES} min, powering off"
  systemctl poweroff
fi
EOF
chmod 755 /usr/local/bin/orchados-idle-check

cat >/etc/systemd/system/orchados-idle.service <<'EOF'
[Unit]
Description=orchadOS idle watchdog
[Service]
Type=oneshot
ExecStart=/usr/local/bin/orchados-idle-check
EOF
cat >/etc/systemd/system/orchados-idle.timer <<'EOF'
[Unit]
Description=orchadOS idle watchdog every 5 minutes
[Timer]
OnBootSec=10min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now orchados-idle.timer

# The driver needs a reboot right after it is installed.
if lspci | grep -qi nvidia && ! nvidia-smi -L >/dev/null 2>&1 && [ ! -f /var/lib/orchados/rebooted ]; then
  touch /var/lib/orchados/rebooted
  echo "rebooting to load the NVIDIA driver"
  systemctl reboot
fi
echo "orchados startup done"
