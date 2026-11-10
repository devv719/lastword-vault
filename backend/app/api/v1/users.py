from datetime import datetime, timedelta, timezone
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db
from app.core.config import get_settings
from app.models.user import User
from app.schemas.user import (
    ChangeEmailRequest,
    ChangeEmailResponse,
    UserResponse,
    UserUpdateRequest,
    VerifyEmailRequest,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
async def get_profile(
    current_user: User = Depends(get_current_user),
):
    return UserResponse.model_validate(current_user)


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile and preferences",
)
async def update_profile(
    payload: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    ip_address = get_client_ip(request)

    if payload.display_name is not None:
        current_user.display_name = payload.display_name.strip()

    if payload.checkin_interval_hours is not None:
        if payload.checkin_interval_hours < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Check-in interval must be at least 1 hour",
            )
        current_user.checkin_interval_hours = payload.checkin_interval_hours

    if payload.grace_period_hours is not None:
        if payload.grace_period_hours < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grace period must be at least 1 hour",
            )
        current_user.grace_period_hours = payload.grace_period_hours

    if payload.demo_mode is not None:
        current_user.demo_mode = payload.demo_mode
        # Recalculate deadline based on mode
        now = datetime.now(timezone.utc)
        last_ref = current_user.last_checkin_at or now
        if current_user.demo_mode:
            current_user.next_deadline = last_ref + timedelta(seconds=settings.DEMO_CHECKIN_INTERVAL_SECONDS)
        else:
            current_user.next_deadline = last_ref + timedelta(hours=current_user.checkin_interval_hours)

    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="USER",
        action="PROFILE_UPDATED",
        description="Profile preferences updated",
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
    )

    return UserResponse.model_validate(current_user)


@router.post(
    "/change-email",
    response_model=ChangeEmailResponse,
    summary="Request email address change (requires verification)",
)
async def request_email_change(
    payload: ChangeEmailRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_email = payload.new_email.lower().strip()
    if new_email == current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New email must be different from current email",
        )

    # Check if new email is already claimed
    existing_query = select(User).where(User.email == new_email)
    existing_res = await db.execute(existing_query)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address is already in use by another account",
        )

    # Generate random 32-char verification token
    verification_token = secrets.token_urlsafe(32)
    current_user.pending_email = new_email
    current_user.email_verification_token = verification_token
    db.add(current_user)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="USER",
        action="EMAIL_CHANGE_REQUESTED",
        description=f"Requested change to {new_email}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return ChangeEmailResponse(
        message=f"Verification token generated for {new_email}. Confirm using the verify-email endpoint.",
        pending_email=new_email,
        verification_token=verification_token,
    )


@router.post(
    "/verify-email",
    response_model=UserResponse,
    summary="Verify token and complete email address change",
)
async def verify_email_change(
    payload: VerifyEmailRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.pending_email or not current_user.email_verification_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending email verification request found",
        )

    if current_user.email_verification_token != payload.token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    # Check again if another account took this email in the interim
    existing_query = select(User).where(User.email == current_user.pending_email)
    existing_res = await db.execute(existing_query)
    if existing_res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address has since been registered by another account",
        )

    old_email = current_user.email
    current_user.email = current_user.pending_email
    current_user.pending_email = None
    current_user.email_verification_token = None
    current_user.updated_at = datetime.now(timezone.utc)
    db.add(current_user)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="USER",
        action="EMAIL_CHANGE_COMPLETED",
        description=f"Email changed from {old_email} to {current_user.email}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return UserResponse.model_validate(current_user)

