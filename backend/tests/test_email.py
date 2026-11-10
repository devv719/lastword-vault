from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import uuid
import pytest
from botocore.exceptions import ClientError
from httpx import AsyncClient

from app.models.contact import TrustedContact
from app.models.user import User, UserStatus
from app.models.vault import Vault
from app.models.vault_item import VaultItem
from app.services.email_service import (
    EmailDeliveryError,
    send_checkin_reminder_email,
    send_contact_verification_email,
    send_email,
    send_missed_checkin_warning_email,
    send_test_email,
    send_vault_release_notification_email,
    send_verification_email,
)


@pytest.fixture
def mock_ses_client():
    """Mock boto3 SES client returning successful MessageId."""
    with patch("app.services.email_service.get_ses_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.send_email.return_value = {
            "MessageId": "ses-msg-mock-987654321",
            "ResponseMetadata": {"HTTPStatusCode": 200},
        }
        mock_get_client.return_value = mock_client
        yield mock_client


def test_send_email_success(mock_ses_client):
    """Verify SES send_email invokes boto3 client with proper parameters."""
    result = send_email(
        to_email="devvv0793@gmail.com",
        subject="Test Notification",
        text_content="Plain text content",
        html_content="<p>HTML content</p>",
    )
    assert result["status"] == "SENT"
    assert result["message_id"] == "ses-msg-mock-987654321"
    assert result["recipient"] == "devvv0793@gmail.com"

    mock_ses_client.send_email.assert_called_once()
    call_kwargs = mock_ses_client.send_email.call_args[1]
    assert call_kwargs["Destination"]["ToAddresses"] == ["devvv0793@gmail.com"]
    assert call_kwargs["Message"]["Subject"]["Data"] == "Test Notification"
    assert call_kwargs["Message"]["Body"]["Text"]["Data"] == "Plain text content"
    assert call_kwargs["Message"]["Body"]["Html"]["Data"] == "<p>HTML content</p>"


def test_send_email_sandbox_error():
    """Verify SES sandbox rejection raises EmailDeliveryError with helpful guidance."""
    with patch("app.services.email_service.get_ses_client") as mock_get_client:
        mock_client = MagicMock()
        error_response = {
            "Error": {
                "Code": "MessageRejected",
                "Message": "Email address is not verified. The following identities failed the check in region AP-SOUTH-1: unverified@example.com",
            }
        }
        mock_client.send_email.side_effect = ClientError(error_response, "SendEmail")
        mock_get_client.return_value = mock_client

        with pytest.raises(EmailDeliveryError) as exc_info:
            send_email("unverified@example.com", "Test", "Content")

        assert "Sandbox mode" in str(exc_info.value)
        assert "unverified@example.com" in str(exc_info.value)


def test_send_email_iam_permission_error():
    """Verify IAM permission denial produces clear diagnostic error message."""
    with patch("app.services.email_service.get_ses_client") as mock_get_client:
        mock_client = MagicMock()
        error_response = {
            "Error": {
                "Code": "AccessDenied",
                "Message": "User is not authorized to perform: ses:SendEmail",
            }
        }
        mock_client.send_email.side_effect = ClientError(error_response, "SendEmail")
        mock_get_client.return_value = mock_client

        with pytest.raises(EmailDeliveryError) as exc_info:
            send_email("devvv0793@gmail.com", "Test", "Content")

        assert "IAM permission denied" in str(exc_info.value)
        assert "ses:SendEmail" in str(exc_info.value)


@pytest.mark.asyncio
async def test_contact_creation_dispatches_ses(client: AsyncClient, auth_user: dict, mock_ses_client):
    """Creating a contact triggers SES verification email with real verification URL."""
    headers = auth_user["headers"]

    resp = await client.post(
        "/api/v1/contacts",
        json={
            "name": "Alice Smith",
            "email": "devvv0793@gmail.com",
            "relationship_type": "Beneficiary",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    contact_data = resp.json()
    assert contact_data["name"] == "Alice Smith"
    assert contact_data["verified"] is False

    mock_ses_client.send_email.assert_called_once()
    call_kwargs = mock_ses_client.send_email.call_args[1]
    assert call_kwargs["Destination"]["ToAddresses"] == ["devvv0793@gmail.com"]
    assert "designated you as a Trusted Contact" in call_kwargs["Message"]["Subject"]["Data"]
    assert "verify-contact?token=" in call_kwargs["Message"]["Body"]["Text"]["Data"]


@pytest.mark.asyncio
async def test_contact_creation_fails_when_ses_rejects(client: AsyncClient, auth_user: dict):
    """When SES rejects delivery, endpoint must fail with 502 and rollback contact creation."""
    headers = auth_user["headers"]

    with patch("app.services.email_service.get_ses_client") as mock_get_client:
        mock_client = MagicMock()
        error_resp = {
            "Error": {
                "Code": "MessageRejected",
                "Message": "Email address is not verified",
            }
        }
        mock_client.send_email.side_effect = ClientError(error_resp, "SendEmail")
        mock_get_client.return_value = mock_client

        resp = await client.post(
            "/api/v1/contacts",
            json={
                "name": "Bob Reject",
                "email": "unverified@example.com",
            },
            headers=headers,
        )
        assert resp.status_code == 502
        assert "Amazon SES" in resp.json()["detail"]

    # Verify contact was NOT persisted
    list_resp = await client.get("/api/v1/contacts", headers=headers)
    contacts = list_resp.json()
    assert not any(c["email"] == "unverified@example.com" for c in contacts)


@pytest.mark.asyncio
async def test_resend_contact_verification(client: AsyncClient, auth_user: dict, mock_ses_client):
    """Test resending verification email for an existing contact."""
    headers = auth_user["headers"]

    # Create contact
    c_resp = await client.post(
        "/api/v1/contacts",
        json={"name": "Charlie", "email": "devvv0793@gmail.com"},
        headers=headers,
    )
    contact_id = c_resp.json()["id"]
    mock_ses_client.reset_mock()

    # Resend
    resend_resp = await client.post(f"/api/v1/contacts/{contact_id}/resend", headers=headers)
    assert resend_resp.status_code == 200
    mock_ses_client.send_email.assert_called_once()


@pytest.mark.asyncio
async def test_public_contact_token_verification(client: AsyncClient, auth_user: dict, mock_ses_client):
    """Public token verification link activates trusted contact without authentication."""
    headers = auth_user["headers"]

    # 1. Add contact
    c_resp = await client.post(
        "/api/v1/contacts",
        json={"name": "Dana", "email": "devvv0793@gmail.com"},
        headers=headers,
    )
    contact_id = c_resp.json()["id"]

    # Extract verification link from sent email
    call_kwargs = mock_ses_client.send_email.call_args[1]
    text = call_kwargs["Message"]["Body"]["Text"]["Data"]
    token = text.split("token=")[1].split("&")[0]

    # 2. Call public verification endpoint (no auth headers!)
    verify_resp = await client.get(f"/api/v1/contacts/verify-token/{token}")
    assert verify_resp.status_code == 200
    assert verify_resp.json()["verified"] is True


@pytest.mark.asyncio
async def test_user_email_change_dispatches_ses(client: AsyncClient, auth_user: dict, mock_ses_client):
    """Requesting an email change sends a verification token via SES."""
    headers = auth_user["headers"]

    resp = await client.post(
        "/api/v1/users/change-email",
        json={"new_email": "devvv0793@gmail.com"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert "Verification email dispatched" in resp.json()["message"]

    mock_ses_client.send_email.assert_called_once()
    call_kwargs = mock_ses_client.send_email.call_args[1]
    assert call_kwargs["Destination"]["ToAddresses"] == ["devvv0793@gmail.com"]
    assert "verify_token=" in call_kwargs["Message"]["Body"]["Text"]["Data"]


@pytest.mark.asyncio
async def test_checkin_send_reminder_dispatches_ses(client: AsyncClient, auth_user: dict, mock_ses_client):
    """Manual or scheduled reminder dispatches SES email with hours remaining."""
    headers = auth_user["headers"]

    resp = await client.post("/api/v1/checkin/send-reminder", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "Check-in reminder successfully dispatched" in data["message"]
    assert "hours_remaining" in data

    mock_ses_client.send_email.assert_called_once()
    call_kwargs = mock_ses_client.send_email.call_args[1]
    assert "Check-In Reminder" in call_kwargs["Message"]["Subject"]["Data"]


@pytest.mark.asyncio
async def test_evaluate_missed_checkin_warning(client: AsyncClient, auth_user: dict, mock_ses_client):
    """When deadline has expired, evaluate transitions user to WARNED and sends warning email."""
    headers = auth_user["headers"]
    user_id = uuid.UUID(auth_user["user"]["id"])

    # First perform checkin to ensure record exists
    await client.post("/api/v1/checkin", headers=headers)

    # Directly adjust next_deadline to 1 hour in the past to simulate missed check-in
    from tests.conftest import TestSessionLocal
    from sqlalchemy import select
    from app.models.user import User

    async with TestSessionLocal() as session:
        res = await session.execute(select(User).where(User.id == user_id))
        user = res.scalar_one()
        user.next_deadline = datetime.now(timezone.utc) - timedelta(hours=1)
        session.add(user)
        await session.commit()

    mock_ses_client.reset_mock()

    # Now evaluate
    eval_resp = await client.post("/api/v1/checkin/evaluate", headers=headers)
    assert eval_resp.status_code == 200
    data = eval_resp.json()
    assert data["status"] == "WARNED"
    assert data["action_taken"] == "TRANSITIONED_TO_WARNED"

    # Verify SES warning email was dispatched
    mock_ses_client.send_email.assert_called_once()
    call_kwargs = mock_ses_client.send_email.call_args[1]
    assert "Fail-Safe Warning: Check-In Missed" in call_kwargs["Message"]["Subject"]["Data"]


@pytest.mark.asyncio
async def test_evaluate_vault_release_execution(client: AsyncClient, auth_user: dict, mock_ses_client):
    """When grace period expires, evaluate transitions to RELEASED and dispatches release emails."""
    headers = auth_user["headers"]
    user_id = uuid.UUID(auth_user["user"]["id"])

    # 1. Create a trusted contact
    c_resp = await client.post(
        "/api/v1/contacts",
        json={"name": "Beneficiary Bob", "email": "devvv0793@gmail.com"},
        headers=headers,
    )
    contact_id = c_resp.json()["id"]

    # 2. Create an authorized vault item assigned to contact
    v_resp = await client.post(
        "/api/v1/vault/items",
        json={
            "title": "Confidential Safe Combination",
            "item_type": "note",
            "encrypted_note": "cipher-secret-note-payload",
            "encryption_iv": "mock-iv-1234",
            "release_authorized": True,
            "assigned_contact_id": contact_id,
        },
        headers=headers,
    )
    assert v_resp.status_code == 201

    # 3. Simulate WARNED state with grace period expired in the past
    from tests.conftest import TestSessionLocal
    from sqlalchemy import select
    from app.models.user import User

    async with TestSessionLocal() as session:
        res = await session.execute(select(User).where(User.id == user_id))
        user = res.scalar_one()
        user.status = UserStatus.WARNED
        user.grace_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        session.add(user)
        await session.commit()

    mock_ses_client.reset_mock()

    # 4. Trigger evaluation
    eval_resp = await client.post("/api/v1/checkin/evaluate", headers=headers)
    assert eval_resp.status_code == 200
    data = eval_resp.json()
    assert data["status"] == "RELEASED"
    assert data["action_taken"] == "TRANSITIONED_TO_RELEASED"

    # Verify release notification email was sent via SES
    mock_ses_client.send_email.assert_called_once()
    call_kwargs = mock_ses_client.send_email.call_args[1]
    assert "Vault Assets Released" in call_kwargs["Message"]["Subject"]["Data"]
    assert "Confidential Safe Combination" in call_kwargs["Message"]["Body"]["Text"]["Data"]

    # 5. Extract download token and verify public retrieval endpoint
    text_data = call_kwargs["Message"]["Body"]["Text"]["Data"]
    download_token = text_data.split("token=")[1].split("\n")[0].strip()

    public_release_resp = await client.get(f"/api/v1/vault/release/{download_token}")
    assert public_release_resp.status_code == 200
    release_data = public_release_resp.json()
    assert release_data["title"] == "Confidential Safe Combination"
    assert release_data["encrypted_note"] == "cipher-secret-note-payload"
    assert release_data["encryption_iv"] == "mock-iv-1234"


@pytest.mark.asyncio
async def test_diagnostic_test_email_endpoint(client: AsyncClient, auth_user: dict, mock_ses_client):
    """Test the diagnostic endpoint sends test email and returns SES details."""
    headers = auth_user["headers"]

    resp = await client.post(
        "/api/v1/checkin/test-email",
        json={"to_email": "devvv0793@gmail.com"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "ses-msg-mock-987654321" in data["details"]["message_id"]

    mock_ses_client.send_email.assert_called_once()


def test_send_email_with_configuration_set_and_fallback():
    """Verify ConfigurationSetName is included in send_email and retries gracefully if missing."""
    with patch("app.services.email_service.get_ses_client") as mock_get_client:
        mock_client = MagicMock()
        error_resp = {"Error": {"Code": "ConfigurationSetDoesNotExist", "Message": "Config set not found"}}
        # First call fails with ConfigurationSetDoesNotExist, second succeeds
        mock_client.send_email.side_effect = [
            ClientError(error_resp, "SendEmail"),
            {"MessageId": "ses-fallback-12345"},
        ]
        mock_get_client.return_value = mock_client

        with patch("app.services.email_service.get_settings") as mock_settings:
            settings_mock = MagicMock()
            settings_mock.SES_SENDER_EMAIL = "devvv0793@gmail.com"
            settings_mock.AWS_REGION = "ap-south-1"
            settings_mock.SES_CONFIGURATION_SET = "lastword-ses-events"
            mock_settings.return_value = settings_mock

            res = send_email("devvv0793@gmail.com", "Subject", "Body")
            assert res["status"] == "SENT"
            assert res["message_id"] == "ses-fallback-12345"
            assert mock_client.send_email.call_count == 2
            second_call_kwargs = mock_client.send_email.call_args_list[1][1]
            assert "ConfigurationSetName" not in second_call_kwargs


def test_get_ses_delivery_diagnostics():
    """Verify get_ses_delivery_diagnostics queries quota, identities, and explains Gmail DMARC."""
    from app.services.email_service import get_ses_delivery_diagnostics

    with patch("app.services.email_service.get_ses_client") as mock_get_client:
        mock_client = MagicMock()
        mock_client.get_send_quota.return_value = {
            "Max24HourSend": 200.0,
            "SentLast24Hours": 5.0,
            "MaxSendRate": 1.0,
        }
        mock_client.get_account_sending_enabled.return_value = {"Enabled": True}
        mock_client.get_identity_verification_attributes.return_value = {
            "VerificationAttributes": {
                "devvv0793@gmail.com": {"VerificationStatus": "Success"},
            }
        }
        mock_client.get_identity_dkim_attributes.return_value = {
            "DkimAttributes": {
                "devvv0793@gmail.com": {"DkimEnabled": False, "DkimVerificationStatus": "NotConfigured"}
            }
        }
        mock_client.describe_configuration_set.return_value = {
            "ConfigurationSet": {"Name": "lastword-ses-events"},
            "EventDestinations": [
                {
                    "Name": "lastword-ses-events-sns",
                    "Enabled": True,
                    "MatchingEventTypes": ["send", "reject", "bounce", "complaint", "delivery"],
                    "SNSDestination": {"TopicARN": "arn:aws:sns:ap-south-1:991467041291:lastword-notifications"},
                }
            ],
        }
        mock_get_client.return_value = mock_client

        diag = get_ses_delivery_diagnostics(recipient_email="devvv0793@gmail.com")
        assert diag["region"] == "ap-south-1"
        assert diag["quota"]["max_24_hour_send"] == 200.0
        assert diag["identity_verification"]["devvv0793@gmail.com"] == "Success"
        assert diag["configuration_set_status"] == "EXISTS"
        assert "dmarc_anti_spoofing_analysis" in diag
        assert "Spam" in diag["dmarc_anti_spoofing_analysis"]["actionable_steps"][0]


@pytest.mark.asyncio
async def test_ses_diagnostics_endpoint(client: AsyncClient, auth_user: dict):
    """Verify GET /api/v1/checkin/ses-diagnostics returns diagnostics report."""
    headers = auth_user["headers"]

    with patch("app.services.email_service.get_ses_delivery_diagnostics") as mock_diag:
        mock_diag.return_value = {
            "region": "ap-south-1",
            "sender": "devvv0793@gmail.com",
            "target_recipient": "devvv0793@gmail.com",
            "configuration_set_status": "EXISTS",
            "recommendations": ["Check Spam folder"],
        }
        resp = await client.get("/api/v1/checkin/ses-diagnostics", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["diagnostics"]["sender"] == "devvv0793@gmail.com"


def test_sensitive_data_logger_scrubber():
    """Verify SensitiveDataFilter scrubs bearer tokens, passwords, and secrets."""
    import logging
    from app.core.logging_config import SensitiveDataFilter

    flt = SensitiveDataFilter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="User login failed with password: 'my-super-secret-password-123' and bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token.data",
        args=(),
        exc_info=None,
    )
    flt.filter(record)
    assert "my-super-secret-password" not in record.msg
    assert "[SCRUBBED]" in record.msg
    assert "[SCRUBBED_TOKEN]" in record.msg
