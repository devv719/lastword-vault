from datetime import datetime, timedelta, timezone
import secrets
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db
from app.core.config import get_settings
from app.models.checkin import CheckinRecord
from app.models.contact import TrustedContact
from app.models.user import User, UserStatus
from app.models.vault_item import VaultItem
from app.models.vault_item_recipient import VaultItemRecipient
from app.schemas.checkin import (
    CheckinRecordResponse,
    CheckinRequest,
    CheckinResponse,
)
from app.services.audit_service import record_audit_log
from app.services.email_service import (
    EmailDeliveryError,
    get_ses_delivery_diagnostics,
    send_checkin_reminder_email,
    send_missed_checkin_warning_email,
    send_test_email,
    send_vault_release_notification_email,
)
from app.services.sns_service import (
    SNSDeliveryError,
    notify_checkin_reminder,
    notify_grace_period_warning,
    notify_missed_checkin,
    notify_switch_activation,
    publish_test_notification,
)

router = APIRouter(prefix="/checkin", tags=["Check-in"])


class TestEmailRequest(BaseModel):
    to_email: Optional[EmailStr] = None


class CheckinEvaluationResponse(BaseModel):
    status: UserStatus
    evaluated_at: datetime
    last_checkin_at: Optional[datetime]
    next_deadline: Optional[datetime]
    warned_at: Optional[datetime]
    grace_expires_at: Optional[datetime]
    action_taken: str
    notifications_sent: List[Dict[str, Any]]


@router.post(
    "",
    response_model=CheckinResponse,
    status_code=status.HTTP_200_OK,
    summary="Perform a heartbeat check-in",
)
async def perform_checkin(
    request: Request,
    payload: Optional[CheckinRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("user-agent")
    now = datetime.now(timezone.utc)

    # Calculate next check-in deadline
    if current_user.demo_mode:
        deadline_delta = timedelta(seconds=settings.DEMO_CHECKIN_INTERVAL_SECONDS)
    else:
        deadline_delta = timedelta(hours=current_user.checkin_interval_hours)

    next_deadline = now + deadline_delta

    # Update user state: reset warning and grace periods
    current_user.last_checkin_at = now
    current_user.next_deadline = next_deadline
    current_user.status = UserStatus.ACTIVE
    current_user.warned_at = None
    current_user.grace_expires_at = None
    current_user.updated_at = now
    db.add(current_user)

    # Record check-in history record
    token_val = payload.token if payload else None
    source_val = payload.source if payload and payload.source else "web"

    record = CheckinRecord(
        user_id=current_user.id,
        token=token_val,
        source=source_val,
        used=True,
        ip_address=ip_address,
        user_agent=user_agent,
        used_at=now,
    )
    db.add(record)

    # Record immutable audit log
    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="CHECKIN",
        action="HEARTBEAT_CHECKIN_COMPLETED",
        description=f"Heartbeat pulse recorded via {source_val}. Dead man switch reset.",
        details=f"Next deadline: {next_deadline.isoformat()}",
        ip_address=ip_address,
        user_agent=user_agent,
    )

    await db.commit()

    return CheckinResponse(
        message="Heartbeat successfully authenticated. Fail-safe timer reset to nominal.",
        status=current_user.status,
        last_checkin_at=current_user.last_checkin_at,
        next_deadline=current_user.next_deadline,
        user_id=current_user.id,
    )


@router.get(
    "/history",
    response_model=List[CheckinRecordResponse],
    summary="Get recent check-in pulse history",
)
async def get_checkin_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(CheckinRecord)
        .where(CheckinRecord.user_id == current_user.id)
        .order_by(CheckinRecord.created_at.desc())
        .limit(50)
    )
    result = await db.execute(query)
    records = result.scalars().all()
    return [CheckinRecordResponse.model_validate(r) for r in records]


@router.post(
    "/send-reminder",
    summary="Dispatch a check-in reminder email via Amazon SES to the current user",
)
async def send_reminder(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    now = datetime.now(timezone.utc)
    deadline = current_user.next_deadline or (now + timedelta(hours=current_user.checkin_interval_hours))
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    diff_seconds = (deadline - now).total_seconds()
    hours_remaining = max(0.1, diff_seconds / 3600.0)

    try:
        result = send_checkin_reminder_email(
            to_email=current_user.email,
            user_name=current_user.display_name or "Enclave Owner",
            deadline=deadline,
            hours_remaining=hours_remaining,
        )
    except EmailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to dispatch check-in reminder via Amazon SES: {exc.message}",
        )

    # Publish Check-In Reminder event to Amazon SNS topic
    sns_result = None
    try:
        sns_result = notify_checkin_reminder(
            user_id=str(current_user.id),
            user_name=current_user.display_name or "Enclave Owner",
            deadline=deadline,
            hours_remaining=hours_remaining,
        )
    except Exception as exc:
        logger.warning(f"Failed to publish check-in reminder event to SNS: {exc}")

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="CHECKIN",
        action="REMINDER_EMAIL_DISPATCHED",
        description=f"Check-in reminder email sent to {current_user.email} via SES (MessageId: {result.get('message_id')})",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {
        "message": f"Check-in reminder successfully dispatched via Amazon SES to {current_user.email}.",
        "deadline": deadline,
        "hours_remaining": round(hours_remaining, 1),
        "ses_details": result,
        "sns_details": sns_result,
    }


@router.post(
    "/evaluate",
    response_model=CheckinEvaluationResponse,
    summary="Evaluate dead man's switch timer, process state transitions, and dispatch SES alerts",
)
async def evaluate_switch(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Evaluates the user's heartbeat deadline:
    1. If deadline passed and status is ACTIVE:
       - Transitions status to WARNED.
       - Dispatches high-priority Missed Check-In warning email via Amazon SES.
       - Starts the grace period timer.
    2. If grace period expired and status is WARNED:
       - Transitions status to RELEASED.
       - Unseals authorized vault assets for designated trusted contacts.
       - Dispatches Vault Release notification emails with secure tokens via Amazon SES.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    action_taken = "NO_ACTION"
    notifications: List[Dict[str, Any]] = []

    # If user has no deadline initialized, set one
    if not current_user.next_deadline:
        current_user.next_deadline = now + timedelta(hours=current_user.checkin_interval_hours)
        current_user.status = UserStatus.ACTIVE

    if current_user.next_deadline and current_user.next_deadline.tzinfo is None:
        current_user.next_deadline = current_user.next_deadline.replace(tzinfo=timezone.utc)
    if current_user.grace_expires_at and current_user.grace_expires_at.tzinfo is None:
        current_user.grace_expires_at = current_user.grace_expires_at.replace(tzinfo=timezone.utc)

    # 1. Check if deadline passed while in ACTIVE status
    if current_user.status == UserStatus.ACTIVE and now >= current_user.next_deadline:
        current_user.status = UserStatus.WARNED
        current_user.warned_at = now

        if current_user.demo_mode:
            grace_delta = timedelta(seconds=settings.DEMO_GRACE_PERIOD_SECONDS)
        else:
            grace_delta = timedelta(hours=current_user.grace_period_hours)

        current_user.grace_expires_at = now + grace_delta
        action_taken = "TRANSITIONED_TO_WARNED"

        # Dispatch Missed Check-In Alert via SES
        try:
            res = send_missed_checkin_warning_email(
                to_email=current_user.email,
                user_name=current_user.display_name or "Enclave Owner",
                grace_expires_at=current_user.grace_expires_at,
            )
            notifications.append({"type": "MISSED_CHECKIN_WARNING", "recipient": current_user.email, "result": res})
        except EmailDeliveryError as exc:
            notifications.append({"type": "MISSED_CHECKIN_WARNING", "recipient": current_user.email, "error": exc.message})

        # Publish Missed Check-In and Grace Period Warning events to Amazon SNS
        try:
            sns_res = notify_missed_checkin(
                user_id=str(current_user.id),
                user_name=current_user.display_name or "Enclave Owner",
                missed_at=current_user.next_deadline,
                grace_expires_at=current_user.grace_expires_at,
            )
            notifications.append({"type": "SNS_MISSED_CHECKIN", "result": sns_res})
        except Exception as exc:
            notifications.append({"type": "SNS_MISSED_CHECKIN", "error": str(exc)})

        try:
            sns_grace_res = notify_grace_period_warning(
                user_id=str(current_user.id),
                user_name=current_user.display_name or "Enclave Owner",
                grace_expires_at=current_user.grace_expires_at,
                seconds_remaining=(current_user.grace_expires_at - now).total_seconds(),
            )
            notifications.append({"type": "SNS_GRACE_PERIOD_WARNING", "result": sns_grace_res})
        except Exception as exc:
            notifications.append({"type": "SNS_GRACE_PERIOD_WARNING", "error": str(exc)})

        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="CHECKIN",
            action="DEADLINE_EXPIRED_WARNED",
            description=f"Heartbeat missed. Grace period active until {current_user.grace_expires_at.isoformat()}.",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )

    # 2. Check if grace period is currently running while in WARNED status
    elif current_user.status == UserStatus.WARNED and current_user.grace_expires_at and now < current_user.grace_expires_at:
        action_taken = "GRACE_PERIOD_ACTIVE"
        remaining_secs = (current_user.grace_expires_at - now).total_seconds()
        try:
            sns_grace_res = notify_grace_period_warning(
                user_id=str(current_user.id),
                user_name=current_user.display_name or "Enclave Owner",
                grace_expires_at=current_user.grace_expires_at,
                seconds_remaining=remaining_secs,
            )
            notifications.append({"type": "SNS_GRACE_PERIOD_WARNING", "result": sns_grace_res})
        except Exception as exc:
            notifications.append({"type": "SNS_GRACE_PERIOD_WARNING", "error": str(exc)})

    # 3. Check if grace period expired while in WARNED status
    elif current_user.status == UserStatus.WARNED and current_user.grace_expires_at and now >= current_user.grace_expires_at:
        current_user.status = UserStatus.RELEASED
        action_taken = "TRANSITIONED_TO_RELEASED"

        # Find all authorized vault items for this user that have assigned contacts
        items_query = (
            select(VaultItem)
            .options(selectinload(VaultItem.assigned_contact))
            .where(
                VaultItem.user_id == current_user.id,
                VaultItem.release_authorized == True,
                VaultItem.assigned_contact_id.isnot(None),
            )
        )
        items_res = await db.execute(items_query)
        authorized_items = items_res.scalars().all()

        token_expiry = now + timedelta(days=30)  # Release access tokens valid for 30 days

        for item in authorized_items:
            contact = item.assigned_contact
            if not contact or not contact.email:
                continue

            # Check if a recipient assignment already exists
            recip_query = select(VaultItemRecipient).where(
                VaultItemRecipient.vault_item_id == item.id,
                VaultItemRecipient.contact_id == contact.id,
            )
            recip_res = await db.execute(recip_query)
            recipient_record = recip_res.scalar_one_or_none()

            download_token = secrets.token_urlsafe(32)

            if recipient_record is None:
                recipient_record = VaultItemRecipient(
                    vault_item_id=item.id,
                    contact_id=contact.id,
                    download_token=download_token,
                    token_expires_at=token_expiry,
                    released_at=now,
                    downloaded=False,
                )
                db.add(recipient_record)
            else:
                recipient_record.download_token = download_token
                recipient_record.token_expires_at = token_expiry
                recipient_record.released_at = now

            # Dispatch release notification email to trusted contact
            try:
                res = send_vault_release_notification_email(
                    to_email=contact.email,
                    contact_name=contact.name,
                    owner_name=current_user.display_name or "Enclave Owner",
                    item_title=item.title,
                    download_token=download_token,
                    expires_at=token_expiry,
                )
                notifications.append({
                    "type": "VAULT_RELEASE_NOTIFICATION",
                    "recipient": contact.email,
                    "item_id": str(item.id),
                    "result": res,
                })
            except EmailDeliveryError as exc:
                notifications.append({
                    "type": "VAULT_RELEASE_NOTIFICATION",
                    "recipient": contact.email,
                    "item_id": str(item.id),
                    "error": exc.message,
                })

        # Publish Dead Man's Switch Activation event to Amazon SNS
        try:
            sns_switch_res = notify_switch_activation(
                user_id=str(current_user.id),
                user_name=current_user.display_name or "Enclave Owner",
                released_items_count=len(authorized_items),
                contacts_notified_count=len([n for n in notifications if n.get("type") == "VAULT_RELEASE_NOTIFICATION"]),
                reason="GRACE_PERIOD_EXPIRED",
            )
            notifications.append({"type": "SNS_SWITCH_ACTIVATION", "result": sns_switch_res})
        except Exception as exc:
            notifications.append({"type": "SNS_SWITCH_ACTIVATION", "error": str(exc)})

        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_RELEASE_EXECUTED",
            description=f"Dead man's switch triggered. Released {len(authorized_items)} authorized items.",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )

    current_user.updated_at = now
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)

    return CheckinEvaluationResponse(
        status=current_user.status,
        evaluated_at=now,
        last_checkin_at=current_user.last_checkin_at,
        next_deadline=current_user.next_deadline,
        warned_at=current_user.warned_at,
        grace_expires_at=current_user.grace_expires_at,
        action_taken=action_taken,
        notifications_sent=notifications,
    )


@router.get(
    "/ses-diagnostics",
    summary="Comprehensive delivery and configuration diagnostics for Amazon SES",
)
async def ses_diagnostics_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    diagnostics = get_ses_delivery_diagnostics(recipient_email=current_user.email)
    return {
        "success": True,
        "diagnostics": diagnostics,
    }


@router.post(
    "/test-email",
    summary="Diagnostic endpoint to test Amazon SES email delivery",
)
async def test_email_endpoint(
    payload: Optional[TestEmailRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_email = payload.to_email if payload and payload.to_email else current_user.email
    try:
        result = send_test_email(str(target_email))
        return {
            "success": True,
            "message": f"Diagnostic test email successfully accepted and queued by Amazon SES to {target_email}.",
            "details": result,
            "diagnostics": {
                "gmail_delivery_note": (
                    "If the email does not appear in your Gmail inbox, check the Gmail Spam folder. "
                    "Google anti-spoofing policy marks emails sent with From: @gmail.com via Amazon SES as Spam."
                ),
                "in_ses_sandbox": True,
            },
        }
    except EmailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Amazon SES test delivery failed: {exc.message}",
        )


@router.post(
    "/test-sns",
    summary="Diagnostic endpoint to test Amazon SNS event notification publishing",
)
async def test_sns_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = publish_test_notification()
        return {
            "success": True,
            "message": "Diagnostic test notification published successfully to Amazon SNS topic.",
            "details": result,
        }
    except SNSDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Amazon SNS test publish failed: {exc.message}",
        )

