#!/usr/bin/env python3
"""Amazon CloudWatch and SES Integration Setup Script for LastWord Vault.

This script configures:
1. CloudWatch Log Groups (/lastword/backend, /lastword/errors) with 7-day retention.
2. CloudWatch Alarms for High CPU, High Memory, High Disk, and EC2 Status Check Failures.
3. Amazon SES Configuration Set (lastword-ses-events) with SNS event publishing (Send, Reject, Bounce, Complaint, Delivery).

Authenticates automatically using the EC2 IAM instance profile (lastword-ec2-s3-role).
"""

import argparse
import json
import logging
import os
import sys
import urllib.request
import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("setup_cloudwatch")

DEFAULT_REGION = os.getenv("AWS_REGION", "ap-south-1")
DEFAULT_SNS_TOPIC_ARN = os.getenv(
    "SNS_TOPIC_ARN",
    "arn:aws:sns:ap-south-1:991467041291:lastword-notifications",
)
DEFAULT_CONFIG_SET = os.getenv("SES_CONFIGURATION_SET", "lastword-ses-events")


def get_ec2_instance_id() -> str:
    """Retrieve the current EC2 instance ID using IMDSv2 with IMDSv1 fallback."""
    # Try IMDSv2 first
    try:
        token_req = urllib.request.Request(
            "http://169.254.169.254/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
            method="PUT",
        )
        with urllib.request.urlopen(token_req, timeout=2) as resp:
            token = resp.read().decode("utf-8")

        id_req = urllib.request.Request(
            "http://169.254.169.254/latest/meta-data/instance-id",
            headers={"X-aws-ec2-metadata-token": token},
        )
        with urllib.request.urlopen(id_req, timeout=2) as resp:
            return resp.read().decode("utf-8").strip()
    except Exception:
        pass

    # Try IMDSv1 fallback
    try:
        with urllib.request.urlopen("http://169.254.169.254/latest/meta-data/instance-id", timeout=2) as resp:
            return resp.read().decode("utf-8").strip()
    except Exception:
        pass

    return ""


def setup_log_groups(logs_client, retention_days: int = 7):
    """Create CloudWatch Log Groups if they don't exist and configure retention policy."""
    groups = ["/lastword/backend", "/lastword/errors"]
    for group_name in groups:
        try:
            logs_client.create_log_group(logGroupName=group_name)
            logger.info(f"Created CloudWatch Log Group: {group_name}")
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ResourceAlreadyExistsException":
                logger.info(f"CloudWatch Log Group already exists: {group_name}")
            else:
                logger.error(f"Error creating log group {group_name}: {exc}")
                raise exc

        try:
            logs_client.put_retention_policy(
                logGroupName=group_name,
                retentionInDays=retention_days,
            )
            logger.info(f"Set {retention_days}-day retention policy on {group_name}")
        except Exception as exc:
            logger.error(f"Error setting retention on {group_name}: {exc}")


def setup_cloudwatch_alarms(cw_client, instance_id: str, sns_topic_arn: str):
    """Create 4 standard-resolution CloudWatch alarms with SNS alert notifications."""
    if not instance_id:
        logger.warning("No EC2 instance ID provided or detected; skipping per-instance alarm creation.")
        return

    alarms = [
        {
            "AlarmName": "LastWord-HighCPU",
            "AlarmDescription": "Triggers when EC2 CPU utilization exceeds 80% for 10 minutes",
            "ActionsEnabled": True,
            "AlarmActions": [sns_topic_arn],
            "OKActions": [sns_topic_arn],
            "MetricName": "CPUUtilization",
            "Namespace": "AWS/EC2",
            "Statistic": "Average",
            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
            "Period": 300,  # 5-minute standard resolution
            "EvaluationPeriods": 2,
            "Threshold": 80.0,
            "ComparisonOperator": "GreaterThanThreshold",
        },
        {
            "AlarmName": "LastWord-HighMemory",
            "AlarmDescription": "Triggers when EC2 memory usage exceeds 85% for 10 minutes",
            "ActionsEnabled": True,
            "AlarmActions": [sns_topic_arn],
            "OKActions": [sns_topic_arn],
            "MetricName": "mem_used_percent",
            "Namespace": "LastWord/EC2",
            "Statistic": "Average",
            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
            "Period": 300,
            "EvaluationPeriods": 2,
            "Threshold": 85.0,
            "ComparisonOperator": "GreaterThanThreshold",
        },
        {
            "AlarmName": "LastWord-HighDisk",
            "AlarmDescription": "Triggers when root disk usage exceeds 80% for 10 minutes",
            "ActionsEnabled": True,
            "AlarmActions": [sns_topic_arn],
            "OKActions": [sns_topic_arn],
            "MetricName": "disk_used_percent",
            "Namespace": "LastWord/EC2",
            "Statistic": "Average",
            "Dimensions": [
                {"Name": "InstanceId", "Value": instance_id},
                {"Name": "path", "Value": "/"},
            ],
            "Period": 300,
            "EvaluationPeriods": 2,
            "Threshold": 80.0,
            "ComparisonOperator": "GreaterThanThreshold",
        },
        {
            "AlarmName": "LastWord-EC2StatusCheckFailed",
            "AlarmDescription": "Triggers when EC2 instance or system status check fails",
            "ActionsEnabled": True,
            "AlarmActions": [sns_topic_arn],
            "OKActions": [sns_topic_arn],
            "MetricName": "StatusCheckFailed",
            "Namespace": "AWS/EC2",
            "Statistic": "Maximum",
            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
            "Period": 60,
            "EvaluationPeriods": 2,
            "Threshold": 1.0,
            "ComparisonOperator": "GreaterThanOrEqualToThreshold",
        },
    ]

    for alarm in alarms:
        try:
            cw_client.put_metric_alarm(**alarm)
            logger.info(f"Configured CloudWatch Alarm: '{alarm['AlarmName']}' -> Threshold: {alarm['Threshold']}")
        except Exception as exc:
            logger.error(f"Failed to create alarm {alarm['AlarmName']}: {exc}")


def setup_ses_events(ses_client, config_set_name: str, sns_topic_arn: str):
    """Configure SES Configuration Set with SNS event destination for delivery tracking."""
    events = ["send", "reject", "bounce", "complaint", "delivery"]
    dest_name = f"{config_set_name}-sns"

    try:
        ses_client.describe_configuration_set(ConfigurationSetName=config_set_name)
        logger.info(f"SES ConfigurationSet '{config_set_name}' already exists.")
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConfigurationSetDoesNotExist":
            ses_client.create_configuration_set(ConfigurationSet={"Name": config_set_name})
            logger.info(f"Created SES ConfigurationSet: {config_set_name}")
        else:
            logger.error(f"SES describe error: {exc}")
            raise exc

    dest_def = {
        "Name": dest_name,
        "Enabled": True,
        "MatchingEventTypes": events,
        "SNSDestination": {"TopicARN": sns_topic_arn},
    }

    try:
        ses_client.create_configuration_set_event_destination(
            ConfigurationSetName=config_set_name,
            EventDestination=dest_def,
        )
        logger.info(f"Attached SNS destination '{dest_name}' for events {events}")
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "EventDestinationAlreadyExists":
            ses_client.update_configuration_set_event_destination(
                ConfigurationSetName=config_set_name,
                EventDestination=dest_def,
            )
            logger.info(f"Updated existing SNS destination '{dest_name}'.")
        else:
            logger.error(f"Failed to set event destination: {exc}")


def verify_configuration(region: str, instance_id: str, config_set_name: str):
    """Verify and print summary of CloudWatch Log Groups, Alarms, and SES configuration."""
    logs_client = boto3.client("logs", region_name=region)
    cw_client = boto3.client("cloudwatch", region_name=region)
    ses_client = boto3.client("ses", region_name=region)

    print("\n" + "=" * 60)
    print("LASTWORD AWS CLOUDWATCH & SES STATUS AUDIT")
    print("=" * 60)

    # 1. Log Groups
    print("\n[1] CloudWatch Log Groups:")
    for group in ["/lastword/backend", "/lastword/errors"]:
        try:
            resp = logs_client.describe_log_groups(logGroupNamePrefix=group)
            matched = [g for g in resp.get("logGroups", []) if g.get("logGroupName") == group]
            if matched:
                g = matched[0]
                retention = g.get("retentionInDays", "Never Expire")
                print(f"  ✓ {group} (Retention: {retention} days, Stored: {g.get('storedBytes', 0)} bytes)")
            else:
                print(f"  ✗ {group} NOT FOUND")
        except Exception as exc:
            print(f"  ✗ {group} Error: {exc}")

    # 2. Alarms
    print("\n[2] CloudWatch Alarms:")
    alarm_names = [
        "LastWord-HighCPU",
        "LastWord-HighMemory",
        "LastWord-HighDisk",
        "LastWord-EC2StatusCheckFailed",
    ]
    try:
        resp = cw_client.describe_alarms(AlarmNames=alarm_names)
        found = {a["AlarmName"]: a for a in resp.get("MetricAlarms", [])}
        for name in alarm_names:
            if name in found:
                a = found[name]
                print(f"  ✓ {name}: State={a['StateValue']}, Threshold={a['Threshold']}, Actions={len(a.get('AlarmActions', []))}")
            else:
                print(f"  ✗ {name} NOT FOUND")
    except Exception as exc:
        print(f"  ✗ Error describing alarms: {exc}")

    # 3. SES Configuration Set
    print("\n[3] Amazon SES Configuration Set:")
    try:
        resp = ses_client.describe_configuration_set(
            ConfigurationSetName=config_set_name,
            ConfigurationSetAttributeNames=["eventDestinations"],
        )
        dests = resp.get("EventDestinations", [])
        print(f"  ✓ ConfigurationSet: '{config_set_name}'")
        for d in dests:
            print(f"    - Destination '{d.get('Name')}': Events={d.get('MatchingEventTypes')}, SNS={d.get('SNSDestination', {}).get('TopicARN')}")
    except ClientError as exc:
        print(f"  ✗ ConfigurationSet '{config_set_name}' error: {exc.response.get('Error', {}).get('Message')}")
    except Exception as exc:
        print(f"  ✗ SES error: {exc}")

    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Configure LastWord CloudWatch Logs, Alarms, and SES events.")
    parser.add_argument("--region", default=DEFAULT_REGION, help="AWS region")
    parser.add_argument("--instance-id", default="", help="EC2 instance ID (auto-detected via IMDS if omitted)")
    parser.add_argument("--sns-topic-arn", default=DEFAULT_SNS_TOPIC_ARN, help="SNS topic ARN for alarm notifications")
    parser.add_argument("--config-set", default=DEFAULT_CONFIG_SET, help="SES configuration set name")
    parser.add_argument("--retention-days", type=int, default=7, help="Log retention in days (default: 7)")
    parser.add_argument("--verify", action="store_true", help="Audit and verify existing configuration")

    args = parser.parse_args()

    instance_id = args.instance_id or get_ec2_instance_id()
    if instance_id:
        logger.info(f"Target EC2 Instance ID: {instance_id}")
    else:
        logger.info("Running outside EC2 or IMDS disabled; instance ID not auto-detected.")

    if args.verify:
        verify_configuration(args.region, instance_id, args.config_set)
        return

    logger.info(f"Initializing AWS clients in region '{args.region}'...")
    logs_client = boto3.client("logs", region_name=args.region)
    cw_client = boto3.client("cloudwatch", region_name=args.region)
    ses_client = boto3.client("ses", region_name=args.region)

    # 1. CloudWatch Log Groups & Retention
    setup_log_groups(logs_client, retention_days=args.retention_days)

    # 2. CloudWatch Alarms
    if instance_id:
        setup_cloudwatch_alarms(cw_client, instance_id, args.sns_topic_arn)
    else:
        logger.warning("Skipping alarm creation because no EC2 instance ID was provided or detected.")

    # 3. SES Configuration Set & SNS Event Destination
    setup_ses_events(ses_client, args.config_set, args.sns_topic_arn)

    logger.info("CloudWatch and SES configuration complete.")
    verify_configuration(args.region, instance_id, args.config_set)


if __name__ == "__main__":
    main()
