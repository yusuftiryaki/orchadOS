#!/usr/bin/env bash
# Runs machine.sh against fake aws/az/gcloud/ssh binaries that only log their
# arguments: checks that every command path runs and calls the CLI it should.
# No cloud account; no network.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
LOG="$T/calls.log"

for tool in aws az gcloud ssh; do
  cat >"$T/bin/$tool" <<EOF
#!/usr/bin/env bash
echo "$tool \$*" >>"$LOG"
name=""
[[ "\$*" =~ (tag:Name,Values=|Value=)([a-z-]+) ]] && name="\${BASH_REMATCH[2]}"
case "$tool \$*" in
  "aws ec2 describe-instances --filters"*"InstanceId"*) [ -f "$T/created-\$name" ] && echo i-0abc ;;
  "aws ec2 describe-instances --instance-ids"*) echo 198.51.100.7 ;;
  "aws ssm get-parameter"*) echo ami-0123 ;;
  "aws ec2 run-instances"*) touch "$T/created-\$name"; echo i-0abc ;;
  "aws sts get-caller-identity"*) echo 123456789012 ;;
  "az vm show"*publicIps*) echo 198.51.100.8 ;;
  "az storage account show"*) echo /subscriptions/x/sa ;;
  "gcloud compute instances describe"*) echo 198.51.100.9 ;;
esac
exit 0
EOF
  chmod +x "$T/bin/$tool"
done
touch "$T/key" "$T/key.pub"
cat >"$T/machine.env" <<EOF
SSH_KEY=$T/key
AWS_KEY_NAME=k
AWS_SECURITY_GROUP_ID=sg-1
AZ_STORAGE_ACCOUNT=orchadosraw
GCP_BILLING_ACCOUNT=000000-000000-000000
BUDGET_EMAIL=ops@example.com
EOF
echo "SUPABASE_URL=http://x" >"$T/process.env"

m() { PATH="$T/bin:$PATH" MACHINE_ENV="$T/machine.env" JOB_ENV="$T/process.env" "$HERE/machine.sh" "$@"; }
expect() { # expect <pattern>: the last commands logged contain the pattern
  grep -qE -- "$1" "$LOG" || { echo "missing call: $1" >&2; cat "$LOG" >&2; exit 1; }
}

m aws create
expect "aws ec2 run-instances .*--instance-type g4dn.xlarge .*--user-data file://.*linux/startup.sh"
expect "instance-initiated-shutdown-behavior stop"
m aws run 4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b
expect "ssh .* ubuntu@198.51.100.7 sudo orchados-run-job 4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b"
expect "aws ec2 stop-instances --instance-ids i-0abc"
m aws budget
expect "aws budgets create-budget --account-id 123456789012"
m aws win-create
expect "Windows_Server-2022"

m azure create
expect "az vm create -n orchados-processing .*--size Standard_NC4as_T4_v3 .*--custom-data .*startup.sh"
expect "Storage Blob Data Contributor"
expect "az vm auto-shutdown"
m azure stop
expect "az vm deallocate -n orchados-processing"
m azure budget

m gcp create
expect "gcloud compute instances create orchados-processing .*--machine-type g2-standard-4 .*startup-script=.*startup.sh"
expect "maintenance-policy TERMINATE"
m gcp run s-1
expect "ubuntu@198.51.100.9 sudo orchados-run-job s-1"
expect "gcloud compute instances stop orchados-processing"
m gcp win-create
expect "nvidia-tesla-t4-vws"
m gcp budget
expect "gcloud billing budgets create"

if m aws run "bad id;rm" 2>/dev/null; then echo "bad session id accepted" >&2; exit 1; fi
echo "machine.sh dry run: ok ($(wc -l <"$LOG") CLI calls)"
