from datetime import datetime, timedelta, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db
from app.core.config import get_settings
from app.models.checkin import CheckinRecord
from app.models.user import User, UserStatus
from app.schemas.checkin import (
    CheckinRecordResponse,
    CheckinRequest,
    CheckinResponse,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/checkin", tags=["Check-in"])


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

