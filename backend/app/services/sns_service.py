"""Amazon SNS notification service for LastWord Dead Man's Switch Vault.

Architecture & Security:
- Publishes operational event notifications to the 'lastword-notifications' SNS topic.
- Integrates with fail-safe lifecycle events:
    1. Check-in reminders.
    2. Grace-period warning.
    3. Missed check-in.
    4. Dead Man's Switch activation.
    5. Vault-release authorization.
- Zero-Knowledge Safe: Never includes master passwords, plaintext vault contents,
  encryption keys, or secret tokens in SNS payloads or logs.
- Uses EC2 IAM role (lastword-ec2-s3-role) via boto3's default credential chain
  without hardcoding AWS access keys or secrets.
- Separate from SES: SES handles transactional user emails and secure links;
  SNS handles system-level event notification broadcasts to subscribers.
"""

from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, Optional
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_sns_client = None


class SNSDeliveryError(Exception):
    """Raised when Amazon SNS fails or rejects a publish request."""

    def __init__(self, message: str, code: Optional[str] = None, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.original_error = original_error


def get_sns_client():
    """Get or initialize boto3 SNS client using EC2 IAM role or environment credentials."""
    global _sns_client
    if _sns_client is None:
        settings = get_settings()
        region = settings.AWS_REGION or "ap-south-1"
        kwargs: Dict[str, Any] = {"region_name": region}

        # In production EC2, AWS_ACCESS_KEY_ID is empty, so boto3 utilizes
        # the attached EC2 IAM instance profile (lastword-ec2-s3-role).
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        _sns_client = boto3.client("sns", **kwargs)
    return _sns_client


def publish_notification(
    subject: str,
    message_data: Dict[str, Any],
    event_type: str,
) -> Dict[str, Any]:
    """
    Publish an event notification to the configured SNS topic.

    Returns:
        dict: {"status": "PUBLISHED" | "SKIPPED", "message_id": str, "event_type": str}

    Raises:
        SNSDeliveryError: if Amazon SNS rejects the publish request.
    """
    settings = get_settings()
    topic_arn = settings.SNS_TOPIC_ARN
    region = settings.AWS_REGION or "ap-south-1"

    if not topic_arn:
        logger.warning(
            f"SNS_TOPIC_ARN is not configured; skipping SNS publish for event '{event_type}'."
        )
        return {
            "status": "SKIPPED",
            "reason": "SNS_TOPIC_ARN_NOT_CONFIGURED",
            "event_type": event_type,
        }

    client = get_sns_client()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Format structured message payload
    payload = {
        "event_type": event_type,
        "timestamp": now_iso,
        "application": "lastword-vault",
        "region": region,
        "data": message_data,
    }
    raw_message = json.dumps(payload, indent=2, default=str)

    # SNS Subject has a 100 character limit
    sanitized_subject = subject[:100]

    try:
        response = client.publish(
            TopicArn=topic_arn,
            Subject=sanitized_subject,
            Message=raw_message,
            MessageAttributes={
                "event_type": {
                    "DataType": "String",
                    "StringValue": event_type,
                },
                "source": {
                    "DataType": "String",
                    "StringValue": "lastword-vault",
                },
            },
        )
        message_id = response.get("MessageId", "unknown")
        logger.info(
            f"Successfully published SNS event '{event_type}' to {topic_arn} (MessageId: {message_id})"
        )
        return {
            "status": "PUBLISHED",
            "message_id": message_id,
            "event_type": event_type,
            "topic_arn": topic_arn,
        }

    except NoCredentialsError as exc:
        err_msg = (
            "AWS credentials not detected. Ensure EC2 IAM instance profile "
            "(lastword-ec2-s3-role) is attached."
        )
        logger.error(f"SNS publish failed for '{event_type}': {err_msg}")
        raise SNSDeliveryError(err_msg, code="NoCredentialsError", original_error=exc) from exc

    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "ClientError")
        error_msg = exc.response.get("Error", {}).get("Message", str(exc))

        if error_code in ("NotFound", "EndpointDisabled"):
            detail_msg = f"SNS topic not found or disabled: {topic_arn}"
        elif error_code in ("AuthorizationError", "AccessDenied"):
            detail_msg = (
                f"IAM permission denied: The attached role lacks 'sns:Publish' "
                f"permission for topic {topic_arn} in region {region}."
            )
        else:
            detail_msg = f"Amazon SNS publish rejected ({error_code}): {error_msg}"

        logger.error(f"SNS publish failed for '{event_type}': {error_code} - {error_msg}")
        raise SNSDeliveryError(detail_msg, code=error_code, original_error=exc) from exc

    except (BotoCoreError, Exception) as exc:
        detail_msg = f"Network or unexpected error publishing to SNS: {str(exc)}"
        logger.error(f"SNS publish failed for '{event_type}': {detail_msg}")
        raise SNSDeliveryError(detail_msg, code="TransportError", original_error=exc) from exc


# =========================================================================
# APPLICATION EVENT NOTIFICATION DISPATCHERS
# =========================================================================

def notify_checkin_reminder(
    user_id: str,
    user_name: str,
    deadline: datetime,
    hours_remaining: float,
) -> Dict[str, Any]:
    """1. Event: Check-in reminder dispatched."""
    subject = f"[LastWord] Check-In Reminder ({round(hours_remaining, 1)}h remaining)"
    message_data = {
        "user_id": user_id,
        "user_name": user_name,
        "deadline": deadline.isoformat(),
        "hours_remaining": round(hours_remaining, 1),
        "status": "ACTIVE",
        "description": f"Presence check-in required within {round(hours_remaining, 1)} hours.",
    }
    return publish_notification(subject, message_data, event_type="CHECKIN_REMINDER")


def notify_missed_checkin(
    user_id: str,
    user_name: str,
    missed_at: datetime,
    grace_expires_at: datetime,
) -> Dict[str, Any]:
    """2. Event: Missed check-in detected."""
    subject = "[LastWord] ALERT: Missed Check-In Detected"
    message_data = {
        "user_id": user_id,
        "user_name": user_name,
        "missed_at": missed_at.isoformat(),
        "grace_expires_at": grace_expires_at.isoformat(),
        "status": "WARNED",
        "description": "Heartbeat deadline passed without authentication. Grace period activated.",
    }
    return publish_notification(subject, message_data, event_type="MISSED_CHECKIN")


def notify_grace_period_warning(
    user_id: str,
    user_name: str,
    grace_expires_at: datetime,
    seconds_remaining: Optional[float] = None,
) -> Dict[str, Any]:
    """3. Event: Grace-period active warning."""
    subject = "[LastWord] WARNING: Grace Period Active — Switch Imminent"
    message_data = {
        "user_id": user_id,
        "user_name": user_name,
        "grace_expires_at": grace_expires_at.isoformat(),
        "seconds_remaining": round(seconds_remaining, 1) if seconds_remaining is not None else None,
        "status": "GRACE",
        "description": "Owner silence continuing during grace buffer. Fail-safe unsealing pending.",
    }
    return publish_notification(subject, message_data, event_type="GRACE_PERIOD_WARNING")


def notify_switch_activation(
    user_id: str,
    user_name: str,
    released_items_count: int,
    contacts_notified_count: int,
    reason: str = "GRACE_PERIOD_EXPIRED",
) -> Dict[str, Any]:
    """4. Event: Dead Man's Switch activation and asset release."""
    subject = "[LastWord] CRITICAL: Dead Man's Switch Activated"
    message_data = {
        "user_id": user_id,
        "user_name": user_name,
        "trigger_reason": reason,
        "status": "RELEASED",
        "released_items_count": released_items_count,
        "contacts_notified_count": contacts_notified_count,
        "description": "Dead Man's Switch triggered. Authorized encrypted assets released.",
    }
    return publish_notification(subject, message_data, event_type="SWITCH_ACTIVATION")


def notify_vault_release_authorization(
    user_id: str,
    item_id: str,
    item_title: str,
    release_authorized: bool,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """5. Event: Vault-release authorization change on an item."""
    status_str = "ENABLED" if release_authorized else "REVOKED"
    subject = f"[LastWord] Vault Release Authorization {status_str}: {item_title}"
    message_data = {
        "user_id": user_id,
        "item_id": item_id,
        "item_title": item_title,
        "category": category or "Documents",
        "release_authorized": release_authorized,
        "description": f"Fail-safe release authorization has been {status_str.lower()} for this asset.",
    }
    return publish_notification(subject, message_data, event_type="VAULT_RELEASE_AUTHORIZATION")


def publish_test_notification() -> Dict[str, Any]:
    """Publish a diagnostic test notification to verify SNS topic access."""
    subject = "[LastWord] Amazon SNS Diagnostic Probe"
    message_data = {
        "diagnostic": True,
        "test_timestamp": datetime.now(timezone.utc).isoformat(),
        "description": "Verified connectivity between LastWord FastAPI backend and Amazon SNS.",
    }
    return publish_notification(subject, message_data, event_type="DIAGNOSTIC_TEST")

