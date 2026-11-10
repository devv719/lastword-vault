"""Amazon SES email delivery service for LastWord Dead Man's Switch Vault.

Zero-Knowledge & Privacy Safeguards:
- Plaintext master passwords, vault keys, and raw confidential documents are NEVER
  transmitted in email content or server logs.
- Emails only convey authorized cryptographic action links (verification tokens,
  check-in heartbeat authentication links, and single-use release access tokens).
- Delivery errors are logged without leaking security tokens or sensitive credentials.
- Authenticates using the EC2 IAM instance role (lastword-ec2-s3-role) via boto3's
  default credential chain without hardcoding access keys or SMTP credentials.
"""

from datetime import datetime
import logging
from typing import Any, Dict, Optional
import boto3
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_ses_client = None


class EmailDeliveryError(Exception):
    """Raised when Amazon SES rejects an email or delivery cannot be completed."""

    def __init__(self, message: str, code: Optional[str] = None, original_error: Optional[Exception] = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.original_error = original_error


def get_ses_client():
    """Initialize or reuse boto3 SES client using EC2 IAM role or environment credentials."""
    global _ses_client
    if _ses_client is None:
        settings = get_settings()
        region = settings.AWS_REGION or "ap-south-1"
        kwargs: Dict[str, Any] = {"region_name": region}

        # In production EC2, AWS_ACCESS_KEY_ID is empty, so boto3 utilizes
        # the attached EC2 IAM instance profile (lastword-ec2-s3-role).
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        _ses_client = boto3.client("ses", **kwargs)
    return _ses_client


def send_email(
    to_email: str,
    subject: str,
    text_content: str,
    html_content: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Send an email via Amazon Simple Email Service (SES) using API v1 send_email.

    Raises EmailDeliveryError if Amazon SES rejects or fails to accept the message.
    """
    settings = get_settings()
    sender = settings.SES_SENDER_EMAIL or "devvv0793@gmail.com"
    region = settings.AWS_REGION or "ap-south-1"
    normalized_to = to_email.strip()

    client = get_ses_client()

    body: Dict[str, Any] = {
        "Text": {
            "Data": text_content,
            "Charset": "UTF-8",
        }
    }
    if html_content:
        body["Html"] = {
            "Data": html_content,
            "Charset": "UTF-8",
        }

    try:
        response = client.send_email(
            Source=sender,
            Destination={"ToAddresses": [normalized_to]},
            Message={
                "Subject": {
                    "Data": subject,
                    "Charset": "UTF-8",
                },
                "Body": body,
            },
        )
        message_id = response.get("MessageId", "unknown")
        logger.info(
            f"Successfully queued SES email to {normalized_to} (Subject: '{subject}', MessageId: {message_id})"
        )
        return {
            "status": "SENT",
            "message_id": message_id,
            "recipient": normalized_to,
            "sender": sender,
        }

    except NoCredentialsError as exc:
        msg = (
            "AWS credentials not detected. Ensure EC2 IAM instance profile "
            "(lastword-ec2-s3-role) is attached to the EC2 instance."
        )
        logger.error(f"SES delivery failed: {msg}")
        raise EmailDeliveryError(msg, code="NoCredentialsError", original_error=exc) from exc

    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code", "ClientError")
        error_message = exc.response.get("Error", {}).get("Message", str(exc))

        # Check for Amazon SES Sandbox restriction
        if "Email address is not verified" in error_message or error_code == "MessageRejected":
            detail_msg = (
                f"Amazon SES is operating in Sandbox mode in region '{region}'. "
                f"Recipient address '{normalized_to}' is not verified. "
                "In SES sandbox mode, all destination addresses must be explicitly verified "
                "in the AWS SES Console before emails can be delivered."
            )
        elif error_code in ("AccessDenied", "AccessDeniedException"):
            detail_msg = (
                f"IAM permission denied: The attached IAM role is missing 'ses:SendEmail' "
                f"or 'ses:SendRawEmail' permission for identity '{sender}' in region '{region}'."
            )
        elif "identity" in error_message.lower() and "verified" in error_message.lower():
            detail_msg = (
                f"Sender identity '{sender}' is not verified in Amazon SES ({region}). "
                "Please verify the email address in AWS SES Console."
            )
        else:
            detail_msg = f"Amazon SES rejected email: {error_code} - {error_message}"

        logger.error(
            f"SES delivery failed to {normalized_to} (Subject: '{subject}'): {error_code} - {error_message}"
        )
        raise EmailDeliveryError(detail_msg, code=error_code, original_error=exc) from exc

    except (BotoCoreError, Exception) as exc:
        detail_msg = f"Network or protocol error communicating with Amazon SES: {str(exc)}"
        logger.error(f"SES delivery failed to {normalized_to}: {str(exc)}")
        raise EmailDeliveryError(detail_msg, code="TransportError", original_error=exc) from exc


# =========================================================================
# HIGH-LEVEL NOTIFICATION DISPATCHERS WITH REAL APPLICATION LINKS
# =========================================================================

def send_verification_email(
    to_email: str,
    verification_token: str,
    custom_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Send user account or email address change verification challenge."""
    settings = get_settings()
    base_url = (custom_base_url or settings.effective_frontend_url).rstrip("/")
    verification_url = f"{base_url}/app/settings?verify_token={verification_token}"

    subject = "[LastWord Vault] Verify Your Email Address"
    text_content = (
        f"Hello,\n\n"
        f"A request was submitted to set or update your email address for your LastWord Vault enclave.\n\n"
        f"Please verify your address by visiting the following link:\n"
        f"{verification_url}\n\n"
        f"If you did not request this change, you can safely disregard this message.\n\n"
        f"— LastWord Cryptographic Enclave Team"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="font-size: 11px; font-family: monospace; letter-spacing: 0.1em; color: #64748B; text-transform: uppercase; margin-bottom: 8px;">
      LASTWORD • IDENTITY VERIFICATION
    </div>
    <h2 style="font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 16px 0;">Verify Your Email Address</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
      A request was initiated to associate this email address with your secure zero-knowledge enclave account.
    </p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{verification_url}" style="background-color: #0F172A; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-size: 13px; font-weight: 600; display: inline-block;">
        Confirm Email Address &rarr;
      </a>
    </div>
    <p style="font-size: 12px; line-height: 1.5; color: #64748B; margin: 24px 0 0 0; word-break: break-all;">
      Or copy and paste this verification URL into your browser:<br>
      <a href="{verification_url}" style="color: #2563EB;">{verification_url}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 16px 0;">
    <p style="font-size: 11px; color: #94A3B8; margin: 0;">
      If you did not make this request, no action is needed. Plaintext secrets are never transmitted via email.
    </p>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, text_content, html_content)


def send_contact_verification_email(
    to_email: str,
    contact_name: str,
    owner_name: str,
    verification_token: str,
    contact_id: str,
    custom_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Send trusted contact verification challenge."""
    settings = get_settings()
    base_url = (custom_base_url or settings.effective_frontend_url).rstrip("/")
    verification_url = f"{base_url}/verify-contact?token={verification_token}&contact_id={contact_id}"

    subject = f"[LastWord] {owner_name} designated you as a Trusted Contact"
    text_content = (
        f"Hello {contact_name},\n\n"
        f"{owner_name} has designated you as a trusted recipient in their LastWord Dead Man's Switch Vault.\n\n"
        f"In the event of owner silence or emergency, designated encrypted instructions or assets may be "
        f"unsealed and dispatched to you.\n\n"
        f"To confirm and verify your contact identity, please visit:\n"
        f"{verification_url}\n\n"
        f"— LastWord Dead Man's Switch Engine"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="font-size: 11px; font-family: monospace; letter-spacing: 0.1em; color: #64748B; text-transform: uppercase; margin-bottom: 8px;">
      TRUSTED RECIPIENT DIRECTORY
    </div>
    <h2 style="font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 16px 0;">Trusted Contact Designation</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
      Hello <strong>{contact_name}</strong>,
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
      <strong>{owner_name}</strong> has designated you as a trusted contact in their <strong>LastWord</strong> dead man's switch enclave. If owner silence is confirmed past the grace window, designated encrypted items will be delivered to you.
    </p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{verification_url}" style="background-color: #0F172A; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-size: 13px; font-weight: 600; display: inline-block;">
        Verify Trusted Contact Status &rarr;
      </a>
    </div>
    <p style="font-size: 12px; line-height: 1.5; color: #64748B; margin: 24px 0 0 0; word-break: break-all;">
      Or open this link directly:<br>
      <a href="{verification_url}" style="color: #2563EB;">{verification_url}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 16px 0;">
    <p style="font-size: 11px; color: #94A3B8; margin: 0;">
      LastWord Enclave • Client-Side Zero Knowledge Encryption Architecture.
    </p>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, text_content, html_content)


def send_checkin_reminder_email(
    to_email: str,
    user_name: str,
    deadline: datetime,
    hours_remaining: float,
    custom_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Send scheduled presence verification reminder before deadline expires."""
    settings = get_settings()
    base_url = (custom_base_url or settings.effective_frontend_url).rstrip("/")
    checkin_url = f"{base_url}/app"
    deadline_str = deadline.strftime("%Y-%m-%d %H:%M UTC")

    subject = f"[ACTION REQUIRED] LastWord Check-In Reminder — {max(1, int(round(hours_remaining)))}h Remaining"
    text_content = (
        f"Hello {user_name},\n\n"
        f"This is an automated reminder from your LastWord Dead Man's Switch enclave.\n\n"
        f"Your next check-in deadline is: {deadline_str}\n"
        f"Time remaining: approximately {max(1, int(round(hours_remaining)))} hours.\n\n"
        f"Please authenticate presence to reset your countdown timer:\n"
        f"{checkin_url}\n\n"
        f"If you miss this deadline, your configured grace period will begin.\n\n"
        f"— LastWord Fail-Safe Monitor"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F9FA; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="font-size: 11px; font-family: monospace; letter-spacing: 0.1em; color: #2563EB; text-transform: uppercase; margin-bottom: 8px;">
      PRESENCE VERIFICATION • TIMER ACTIVE
    </div>
    <h2 style="font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 16px 0;">Routine Check-In Reminder</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
      Hello <strong>{user_name}</strong>,
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
      Your check-in deadline is approaching. Please record an active heartbeat pulse before <strong>{deadline_str}</strong> to reset the countdown.
    </p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{checkin_url}" style="background-color: #2563EB; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-size: 13px; font-weight: 600; display: inline-block;">
        Authenticate Check-In Now &rarr;
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 16px 0;">
    <p style="font-size: 11px; color: #94A3B8; margin: 0;">
      LastWord Enclave • Cryptographic Fail-Safe Switch
    </p>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, text_content, html_content)


def send_missed_checkin_warning_email(
    to_email: str,
    user_name: str,
    grace_expires_at: datetime,
    custom_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Send high-priority warning that check-in deadline was missed and grace period is active."""
    settings = get_settings()
    base_url = (custom_base_url or settings.effective_frontend_url).rstrip("/")
    checkin_url = f"{base_url}/app"
    grace_str = grace_expires_at.strftime("%Y-%m-%d %H:%M UTC")

    subject = "[URGENT] LastWord Fail-Safe Warning: Check-In Missed — Grace Period Active"
    text_content = (
        f"URGENT NOTICE — OWNER PRESENCE NOT DETECTED\n\n"
        f"Hello {user_name},\n\n"
        f"Your scheduled check-in deadline has expired without an authenticated heartbeat pulse.\n\n"
        f"The fail-safe GRACE PERIOD is now active. It will expire at:\n"
        f"{grace_str}\n\n"
        f"IF NO CHECK-IN IS AUTHENTICATED BEFORE THIS DEADLINE, THE SWITCH WILL TRIGGER AND YOUR "
        f"DESIGNATED ENCRYPTED ASSETS WILL BE UNSEALED AND TRANSMITTED TO YOUR TRUSTED CONTACTS.\n\n"
        f"To abort fail-safe execution and return your enclave to nominal state, check in immediately:\n"
        f"{checkin_url}\n\n"
        f"— LastWord Emergency Response Monitor"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FEF2F2; margin: 0; padding: 24px; color: #1E293B;">
  <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border: 2px solid #EF4444; border-radius: 16px; padding: 32px; box-shadow: 0 10px 15px -3px rgba(239,68,68,0.1);">
    <div style="font-size: 11px; font-family: monospace; letter-spacing: 0.1em; color: #DC2626; text-transform: uppercase; margin-bottom: 8px; font-weight: 700;">
      FAIL-SAFE ESCALATION • GRACE PERIOD ACTIVE
    </div>
    <h2 style="font-size: 22px; font-weight: 700; color: #991B1B; margin: 0 0 16px 0;">Check-In Deadline Missed</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
      Hello <strong>{user_name}</strong>,
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
      Your check-in deadline has passed. If you are safe, please authenticate immediately.
      Your grace period expires at: <strong style="color: #DC2626;">{grace_str}</strong>.
    </p>
    <div style="padding: 16px; background-color: #FEF2F2; border-left: 4px solid #EF4444; border-radius: 8px; margin-bottom: 24px;">
      <p style="font-size: 13px; line-height: 1.5; color: #991B1B; margin: 0; font-weight: 500;">
        If no heartbeat is received before grace expiry, authorized vault documents and credentials will be released to your designated trusted contacts.
      </p>
    </div>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{checkin_url}" style="background-color: #DC2626; color: #FFFFFF; text-decoration: none; padding: 14px 32px; border-radius: 9999px; font-size: 14px; font-weight: 700; display: inline-block;">
        Authenticate Check-In Immediately &rarr;
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 28px 0 16px 0;">
    <p style="font-size: 11px; color: #94A3B8; margin: 0;">
      LastWord Enclave Fail-Safe Trigger Engine
    </p>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, text_content, html_content)


def send_vault_release_notification_email(
    to_email: str,
    contact_name: str,
    owner_name: str,
    item_title: str,
    download_token: str,
    expires_at: Optional[datetime] = None,
    custom_base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Send trusted contact notification that dead man's switch triggered and assets are released."""
    settings = get_settings()
    base_url = (custom_base_url or settings.effective_frontend_url).rstrip("/")
    release_url = f"{base_url}/release?token={download_token}"
    direct_api_url = f"{base_url}/api/v1/vault/release/{download_token}"
    expiry_note = f"Access token expires at {expires_at.strftime('%Y-%m-%d %H:%M UTC')}." if expires_at else ""

    subject = f"[LASTWORD] Vault Assets Released: {owner_name}'s Enclave Triggered"
    text_content = (
        f"CONFIDENTIAL DELIVERY — DEAD MAN'S SWITCH RELEASE\n\n"
        f"Hello {contact_name},\n\n"
        f"This automated delivery is sent because owner silence was confirmed from {owner_name}.\n"
        f"The LastWord fail-safe timer expired and the unsealing protocol executed.\n\n"
        f"You have been granted authorized access to the following sealed item:\n"
        f"Title: {item_title}\n\n"
        f"To retrieve and decrypt this record, please visit:\n"
        f"{release_url}\n\n"
        f"{expiry_note}\n\n"
        f"Direct secure retrieval link:\n"
        f"{direct_api_url}\n\n"
        f"— LastWord Dead Man's Switch Release Daemon"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0F172A; margin: 0; padding: 24px; color: #F8FAFC;">
  <div style="max-width: 560px; margin: 0 auto; background: #1E293B; border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
    <div style="font-size: 11px; font-family: monospace; letter-spacing: 0.1em; color: #38BDF8; text-transform: uppercase; margin-bottom: 8px; font-weight: 700;">
      LASTWORD FAIL-SAFE DISPATCH • ASSETS UNSEALED
    </div>
    <h2 style="font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0 0 16px 0;">Confidential Vault Release</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #CBD5E1; margin: 0 0 16px 0;">
      Hello <strong>{contact_name}</strong>,
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #CBD5E1; margin: 0 0 20px 0;">
      The dead man's switch for <strong>{owner_name}</strong> has completed its countdown and grace period without an owner check-in. In accordance with their instructions, designated encrypted assets have been released to you.
    </p>
    <div style="padding: 16px; background-color: #0F172A; border: 1px solid #334155; border-radius: 8px; margin-bottom: 24px;">
      <div style="font-size: 11px; font-family: monospace; color: #94A3B8; text-transform: uppercase;">Released Asset</div>
      <div style="font-size: 16px; font-weight: 600; color: #38BDF8; margin-top: 4px;">{item_title}</div>
      {f'<div style="font-size: 12px; color: #94A3B8; margin-top: 4px;">{expiry_note}</div>' if expiry_note else ''}
    </div>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{release_url}" style="background-color: #38BDF8; color: #0F172A; text-decoration: none; padding: 14px 32px; border-radius: 9999px; font-size: 14px; font-weight: 700; display: inline-block;">
        Access Released Documents &rarr;
      </a>
    </div>
    <p style="font-size: 12px; line-height: 1.5; color: #94A3B8; margin: 24px 0 0 0; word-break: break-all;">
      Direct secure retrieval link:<br>
      <a href="{direct_api_url}" style="color: #38BDF8;">{direct_api_url}</a>
    </p>
    <hr style="border: none; border-top: 1px solid #334155; margin: 28px 0 16px 0;">
    <p style="font-size: 11px; color: #64748B; margin: 0;">
      LastWord Enclave Protocol • Zero-Knowledge Dead Man's Switch
    </p>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, text_content, html_content)


def send_test_email(to_email: str) -> Dict[str, Any]:
    """Send diagnostic test email to verify Amazon SES connectivity and credentials."""
    settings = get_settings()
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    sender = settings.SES_SENDER_EMAIL or "devvv0793@gmail.com"
    region = settings.AWS_REGION or "ap-south-1"

    subject = f"[LastWord] Amazon SES Test Verification — {now_str}"
    text_content = (
        f"LastWord Amazon SES Diagnostic Probe\n\n"
        f"Time: {now_str}\n"
        f"Sender: {sender}\n"
        f"Recipient: {to_email}\n"
        f"Region: {region}\n\n"
        f"Amazon SES email delivery is operational and correctly configured on your AWS EC2 instance.\n\n"
        f"— LastWord Diagnostics"
    )

    html_content = f"""<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #F8F9FA; padding: 24px; color: #0F172A;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
    <h3 style="color: #059669; margin-top: 0;">&#10004; Amazon SES Delivery Operational</h3>
    <p style="font-size: 14px; line-height: 1.6; color: #334155;">
      This email confirms that Amazon SES in <strong>{region}</strong> is successfully accepting and transmitting messages via your EC2 IAM role.
    </p>
    <table style="width: 100%; font-size: 12px; font-family: monospace; background: #F1F5F9; border-radius: 8px; padding: 12px; margin-top: 16px;">
      <tr><td>Sender:</td><td>{sender}</td></tr>
      <tr><td>Recipient:</td><td>{to_email}</td></tr>
      <tr><td>Region:</td><td>{region}</td></tr>
      <tr><td>Timestamp:</td><td>{now_str}</td></tr>
    </table>
  </div>
</body>
</html>"""

    return send_email(to_email, subject, text_content, html_content)
