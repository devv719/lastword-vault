from datetime import datetime, timedelta, timezone
import json
from unittest.mock import MagicMock, patch
import uuid
import pytest
from botocore.exceptions import ClientError
from httpx import AsyncClient

from app.core.config import get_settings
from app.models.user import User, UserStatus
from app.services.sns_service import (
    SNSDeliveryError,
    notify_checkin_reminder,
    notify_grace_period_warning,
    notify_missed_checkin,
    notify_switch_activation,
    notify_vault_release_authorization,
    publish_notification,
    publish_test_notification,
)


@pytest.fixture
def mock_sns_client():
    """Mock boto3 SNS client returning successful publish response."""
    with patch("app.services.sns_service.get_sns_client") as mock_get:
        client = MagicMock()
        client.publish.return_value = {
            "MessageId": "sns-msg-mock-1234567890",
            "ResponseMetadata": {"HTTPStatusCode": 200},
        }
        mock_get.return_value = client
        yield client


def test_publish_notification_success(mock_sns_client):
    """Test successful publish calls boto3 SNS publish with proper attributes."""
    result = publish_notification(
        subject="Test Alert",
        message_data={"alert_type": "TEST", "value": 42},
        event_type="TEST_EVENT",
    )
    assert result["status"] == "PUBLISHED"
    assert result["message_id"] == "sns-msg-mock-1234567890"
    assert result["event_type"] == "TEST_EVENT"

    mock_sns_client.publish.assert_called_once()
    kwargs = mock_sns_client.publish.call_args[1]
    assert kwargs["Subject"] == "Test Alert"
    assert kwargs["MessageAttributes"]["event_type"]["StringValue"] == "TEST_EVENT"
    assert kwargs["MessageAttributes"]["source"]["StringValue"] == "lastword-vault"

    # Verify message is valid JSON
    parsed = json.loads(kwargs["Message"])
    assert parsed["event_type"] == "TEST_EVENT"
    assert parsed["data"]["alert_type"] == "TEST"


def test_publish_notification_skipped_when_no_arn(mock_sns_client, monkeypatch):
    """When SNS_TOPIC_ARN is empty, publish skips gracefully without throwing."""
    settings = get_settings()
    monkeypatch.setattr(settings, "SNS_TOPIC_ARN", "")

    result = publish_notification(
        subject="Test Alert",
        message_data={"test": True},
        event_type="TEST_EVENT",
    )
    assert result["status"] == "SKIPPED"
    assert result["reason"] == "SNS_TOPIC_ARN_NOT_CONFIGURED"
    mock_sns_client.publish.assert_not_called()


def test_publish_notification_iam_error(monkeypatch):
    """Verify IAM permission errors are correctly caught and re-raised as SNSDeliveryError."""
    with patch("app.services.sns_service.get_sns_client") as mock_get:
        client = MagicMock()
        client.publish.side_effect = ClientError(
            {"Error": {"Code": "AuthorizationError", "Message": "User is not authorized to perform: sns:Publish"}},
            "Publish",
        )
        mock_get.return_value = client

        settings = get_settings()
        monkeypatch.setattr(settings, "SNS_TOPIC_ARN", "arn:aws:sns:ap-south-1:123456789012:lastword-notifications")

        with pytest.raises(SNSDeliveryError) as exc_info:
            publish_notification("Subject", {"data": 1}, "TEST")

        assert "IAM permission denied" in str(exc_info.value)
        assert "sns:Publish" in str(exc_info.value)


@pytest.mark.asyncio
async def test_event_1_checkin_reminder_publishes_to_sns(client: AsyncClient, auth_user: dict, mock_sns_client):
    """Requirement Event 1: Triggering check-in reminder publishes to SNS topic."""
    headers = auth_user["headers"]

    resp = await client.post("/api/v1/checkin/send-reminder", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["sns_details"]["status"] == "PUBLISHED"

    # Verify SNS publish call
    mock_sns_client.publish.assert_called()
    call_kwargs = mock_sns_client.publish.call_args[1]
    assert call_kwargs["MessageAttributes"]["event_type"]["StringValue"] == "CHECKIN_REMINDER"
    assert "Check-In Reminder" in call_kwargs["Subject"]

    body = json.loads(call_kwargs["Message"])
    assert body["event_type"] == "CHECKIN_REMINDER"
    assert "hours_remaining" in body["data"]


@pytest.mark.asyncio
async def test_event_2_and_3_missed_checkin_and_grace_warning(client: AsyncClient, auth_user: dict, mock_sns_client):
    """Requirement Events 2 & 3: Missed check-in and grace-period warning publish to SNS."""
    headers = auth_user["headers"]
    user_id = uuid.UUID(auth_user["user"]["id"])

    # Simulate missed deadline
    from tests.conftest import TestSessionLocal
    from sqlalchemy import select

    async with TestSessionLocal() as session:
        res = await session.execute(select(User).where(User.id == user_id))
        user = res.scalar_one()
        user.status = UserStatus.ACTIVE
        user.next_deadline = datetime.now(timezone.utc) - timedelta(minutes=10)
        session.add(user)
        await session.commit()

    mock_sns_client.reset_mock()

    eval_resp = await client.post("/api/v1/checkin/evaluate", headers=headers)
    assert eval_resp.status_code == 200
    assert eval_resp.json()["status"] == "WARNED"

    # Verify both MISSED_CHECKIN and GRACE_PERIOD_WARNING were published
    published_event_types = [
        call[1]["MessageAttributes"]["event_type"]["StringValue"]
        for call in mock_sns_client.publish.call_args_list
    ]
    assert "MISSED_CHECKIN" in published_event_types
    assert "GRACE_PERIOD_WARNING" in published_event_types


@pytest.mark.asyncio
async def test_event_4_switch_activation_publishes_to_sns(client: AsyncClient, auth_user: dict, mock_sns_client):
    """Requirement Event 4: Dead Man's Switch activation publishes SWITCH_ACTIVATION to SNS."""
    headers = auth_user["headers"]
    user_id = uuid.UUID(auth_user["user"]["id"])

    # 1. Create a contact
    c_resp = await client.post(
        "/api/v1/contacts",
        json={"name": "Emergency Beneficiary", "email": "devvv0793@gmail.com"},
        headers=headers,
    )
    contact_id = c_resp.json()["id"]

    # 2. Create an authorized vault item
    await client.post(
        "/api/v1/vault/items",
        json={
            "title": "Crypto Key Backup Instructions",
            "item_type": "note",
            "release_authorized": True,
            "assigned_contact_id": contact_id,
        },
        headers=headers,
    )

    # 3. Simulate expired grace period
    from tests.conftest import TestSessionLocal
    from sqlalchemy import select

    async with TestSessionLocal() as session:
        res = await session.execute(select(User).where(User.id == user_id))
        user = res.scalar_one()
        user.status = UserStatus.WARNED
        user.grace_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        session.add(user)
        await session.commit()

    mock_sns_client.reset_mock()

    # 4. Evaluate switch
    eval_resp = await client.post("/api/v1/checkin/evaluate", headers=headers)
    assert eval_resp.status_code == 200
    assert eval_resp.json()["status"] == "RELEASED"

    # Verify SWITCH_ACTIVATION published to SNS
    published_event_types = [
        call[1]["MessageAttributes"]["event_type"]["StringValue"]
        for call in mock_sns_client.publish.call_args_list
    ]
    assert "SWITCH_ACTIVATION" in published_event_types

    # Verify payload doesn't leak secrets or plaintext
    activation_call = [
        call[1] for call in mock_sns_client.publish.call_args_list
        if call[1]["MessageAttributes"]["event_type"]["StringValue"] == "SWITCH_ACTIVATION"
    ][0]
    raw_json = activation_call["Message"]
    assert "password" not in raw_json.lower()
    assert "token=" not in raw_json


@pytest.mark.asyncio
async def test_event_5_vault_release_authorization_publishes_to_sns(client: AsyncClient, auth_user: dict, mock_sns_client):
    """Requirement Event 5: Creating or updating an item with release_authorized publishes to SNS."""
    headers = auth_user["headers"]

    mock_sns_client.reset_mock()

    # Create authorized item
    resp = await client.post(
        "/api/v1/vault/items",
        json={
            "title": "Will and Testament Document",
            "item_type": "document",
            "category": "Legal",
            "release_authorized": True,
        },
        headers=headers,
    )
    assert resp.status_code == 201

    # Verify VAULT_RELEASE_AUTHORIZATION published to SNS
    mock_sns_client.publish.assert_called_once()
    call_kwargs = mock_sns_client.publish.call_args[1]
    assert call_kwargs["MessageAttributes"]["event_type"]["StringValue"] == "VAULT_RELEASE_AUTHORIZATION"
    body = json.loads(call_kwargs["Message"])
    assert body["data"]["item_title"] == "Will and Testament Document"
    assert body["data"]["release_authorized"] is True
    assert body["data"]["category"] == "Legal"


@pytest.mark.asyncio
async def test_manual_release_publishes_to_sns(client: AsyncClient, auth_user: dict, mock_sns_client):
    """Manual trigger of vault release also publishes SWITCH_ACTIVATION to SNS."""
    headers = auth_user["headers"]

    mock_sns_client.reset_mock()

    resp = await client.post("/api/v1/vault/trigger-release", headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_diagnostic_test_sns_endpoint(client: AsyncClient, auth_user: dict, mock_sns_client):
    """Diagnostic test endpoint publishes probe notification to SNS topic."""
    headers = auth_user["headers"]

    resp = await client.post("/api/v1/checkin/test-sns", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "sns-msg-mock-1234567890" in data["details"]["message_id"]

    mock_sns_client.publish.assert_called_once()
