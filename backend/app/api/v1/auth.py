from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_token_payload, get_current_user, get_db
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.revoked_token import RevokedToken
from app.models.user import User, UserStatus
from app.schemas.auth import (
    LogoutResponse,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
)
from app.schemas.user import UserResponse
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    payload: UserRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    ip_address = get_client_ip(request)
    normalized_email = payload.email.lower().strip()

    # Check if email is already registered
    existing_query = select(User).where(User.email == normalized_email)
    existing_result = await db.execute(existing_query)
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )

    # Calculate initial check-in deadline
    now = datetime.now(timezone.utc)
    if settings.DEMO_MODE:
        next_deadline = now + timedelta(seconds=settings.DEMO_CHECKIN_INTERVAL_SECONDS)
        demo_mode = True
    else:
        next_deadline = now + timedelta(hours=settings.DEFAULT_CHECKIN_INTERVAL_HOURS)
        demo_mode = False

    display_name = (payload.display_name or payload.name or payload.email.split("@")[0]).strip()

    new_user = User(
        email=normalized_email,
        password_hash=hash_password(payload.password),
        display_name=display_name,
        status=UserStatus.ACTIVE,
        checkin_interval_hours=settings.DEFAULT_CHECKIN_INTERVAL_HOURS,
        grace_period_hours=settings.DEFAULT_GRACE_PERIOD_HOURS,
        last_checkin_at=now,
        next_deadline=next_deadline,
        demo_mode=demo_mode,
        created_at=now,
        updated_at=now,
    )

    try:
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(exc)}",
        )

    # Record registration audit log (isolated so audit log failures don't abort registration)
    try:
        await record_audit_log(
            session=db,
            user_id=new_user.id,
            event_type="AUTH",
            action="USER_REGISTERED",
            description=f"Account created for {new_user.email}",
            ip_address=ip_address,
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
    except Exception:
        # Non-fatal audit logging failure
        pass

    # Issue initial JWT access token
    token_str, _, expire = create_access_token(subject=new_user.id)
    expires_in_seconds = int((expire - now).total_seconds())

    return TokenResponse(
        access_token=token_str,
        token_type="bearer",
        expires_in=expires_in_seconds,
        user=UserResponse.model_validate(new_user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate and receive access token",
)
async def login(
    payload: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    ip_address = get_client_ip(request)
    normalized_email = payload.email.lower().strip()

    # Query user
    query = select(User).where(User.email == normalized_email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    now = datetime.now(timezone.utc)
    token_str, _, expire = create_access_token(subject=user.id)
    expires_in_seconds = int((expire - now).total_seconds())

    # Record login audit log
    await record_audit_log(
        session=db,
        user_id=user.id,
        event_type="AUTH",
        action="USER_LOGIN",
        description="Successful password authentication",
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()

    return TokenResponse(
        access_token=token_str,
        token_type="bearer",
        expires_in=expires_in_seconds,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke the current authentication session",
)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    token_payload: dict = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
):
    jti = token_payload.get("jti")
    exp = token_payload.get("exp")
    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else None

    if jti:
        revoked = RevokedToken(
            jti=jti,
            user_id=current_user.id,
            expires_at=expires_at,
        )
        db.add(revoked)

    # Record audit log
    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="AUTH",
        action="USER_LOGOUT",
        description="Session explicitly revoked",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    await db.commit()

    return LogoutResponse(message="Session successfully terminated and token revoked")

