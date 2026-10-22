# shellcheck shell=bash
# NAME, WIN_NAME, STARTUP, SSH_* and die/need come from machine.sh.
# shellcheck disable=SC2153,SC2154
# AWS (aws CLI v2). Sourced by machine.sh; defines p_* functions.
# Login: `aws configure sso` / `aws sso login` or AWS_PROFILE; nothing is stored here.

need aws
: "${AWS_REGION:=eu-central-1}"
: "${AWS_INSTANCE_TYPE:=g4dn.xlarge}"
: "${AWS_WIN_INSTANCE_TYPE:=g4dn.xlarge}"
: "${AWS_DISK_GB:=300}"
export AWS_REGION
UBUNTU_AMI_PARAM=/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id
WINDOWS_AMI_PARAM=/aws/service/ami-windows-latest/Windows_Server-2022-English-Full-Base

_id() { # _id <name>: instance id by Name tag (not terminated)
  aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=$1" \
    "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId' --output text
}

_create() { # _create <name> <type> <ami-param> <sg> [user-data]
  [ -z "$(_id "$1")" ] || die "$1 already exists"
  local ami
  ami="$(aws ssm get-parameter --name "$3" --query Parameter.Value --output text)"
  local args=(
    --image-id "$ami" --instance-type "$2" --key-name "${AWS_KEY_NAME:?}"
    --security-group-ids "$4"
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$AWS_DISK_GB,VolumeType=gp3}"
    --instance-initiated-shutdown-behavior stop
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$1},{Key=project,Value=orchados}]"
    --metadata-options HttpTokens=required
  )
  [ -n "${AWS_INSTANCE_PROFILE:-}" ] && args+=(--iam-instance-profile "Name=$AWS_INSTANCE_PROFILE")
  [ -n "${5:-}" ] && args+=(--user-data "file://$5")
  aws ec2 run-instances "${args[@]}" --query 'Instances[0].InstanceId' --output text
}

_start() { local id; id="$(_id "$1")"; [ -n "$id" ] || die "$1 not found"
  aws ec2 start-instances --instance-ids "$id" >/dev/null
  aws ec2 wait instance-running --instance-ids "$id"; }
_stop() { local id; id="$(_id "$1")"; [ -n "$id" ] || return 0
  aws ec2 stop-instances --instance-ids "$id" >/dev/null
  aws ec2 wait instance-stopped --instance-ids "$id"; }
_delete() { local id; id="$(_id "$1")"; [ -n "$id" ] || return 0
  aws ec2 terminate-instances --instance-ids "$id" >/dev/null
  aws ec2 wait instance-terminated --instance-ids "$id"; }
_status() {
  aws ec2 describe-instances --filters "Name=tag:Name,Values=$1" \
    --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name,PublicIpAddress]' \
    --output table
}

p_create() { _create "$NAME" "$AWS_INSTANCE_TYPE" "$UBUNTU_AMI_PARAM" "${AWS_SECURITY_GROUP_ID:?}" "$STARTUP"; }
p_start() { _start "$NAME"; }
p_stop() { _stop "$NAME"; }
p_delete() { _delete "$NAME"; }
p_status() { _status "$NAME"; }
p_ip() {
  aws ec2 describe-instances --instance-ids "$(_id "$NAME")" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
}

p_budget() {
  local account
  account="$(aws sts get-caller-identity --query Account --output text)"
  aws budgets create-budget --account-id "$account" \
    --budget "{\"BudgetName\":\"orchados-monthly\",\"BudgetLimit\":{\"Amount\":\"${BUDGET_AMOUNT:-100}\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}" \
    --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":80,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"${BUDGET_EMAIL:?}\"}]},{\"Notification\":{\"NotificationType\":\"FORECASTED\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"${BUDGET_EMAIL:?}\"}]}]"
  echo "budget orchados-monthly: ${BUDGET_AMOUNT:-100} USD/month, mail at 80% actual and 100% forecast"
}

# Windows: NVIDIA driver from AWS's driver bucket (docs/bulut-isleme.md), RDP 3389.
p_win_create() {
  _create "$WIN_NAME" "$AWS_WIN_INSTANCE_TYPE" "$WINDOWS_AMI_PARAM" \
    "${AWS_WIN_SECURITY_GROUP_ID:-${AWS_SECURITY_GROUP_ID:?}}"
  echo "password: aws ec2 get-password-data --instance-id \$(id) --priv-launch-key <key.pem>"
}
p_win_start() { _start "$WIN_NAME"; _status "$WIN_NAME"; }
p_win_stop() { _stop "$WIN_NAME"; }
p_win_delete() { _delete "$WIN_NAME"; }
p_win_status() { _status "$WIN_NAME"; }
