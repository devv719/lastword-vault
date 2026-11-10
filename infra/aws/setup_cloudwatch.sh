#!/usr/bin/env bash
# ==============================================================================
# LastWord — CloudWatch & SES Configuration Deploy Script for AWS EC2
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== LastWord: Preparing CloudWatch Log Directories ==="
sudo mkdir -p /var/log/lastword
sudo chmod -R 777 /var/log/lastword

echo "=== LastWord: Applying CloudWatch Agent Configuration ==="
CW_AGENT_CONFIG="$SCRIPT_DIR/amazon-cloudwatch-agent.json"
CW_AGENT_TARGET="/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"

if [ -d "/opt/aws/amazon-cloudwatch-agent" ]; then
    sudo cp "$CW_AGENT_CONFIG" "$CW_AGENT_TARGET"
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
        -a fetch-config \
        -m ec2 \
        -s \
        -c file:"$CW_AGENT_TARGET"
    echo "CloudWatch Agent restarted with logs and metrics collection."
else
    echo "Notice: amazon-cloudwatch-agent not installed at /opt/aws/amazon-cloudwatch-agent."
fi

echo "=== LastWord: Executing CloudWatch Alarms & SES Setup Script ==="
python3 "$SCRIPT_DIR/setup_cloudwatch.py"

echo "=== Setup Complete ==="
