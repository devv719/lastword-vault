from collections.abc import AsyncGenerator
from typing import Optional
import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.database.session import get_db
from app.models.revoked_token import RevokedToken
from app.models.user import User

security_scheme = HTTPBearer(auto_error=False)


async def get_current_token_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> dict:
    """Extract and validate the JWT from the Authorization header."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def get_current_user(
    payload: dict = Depends(get_current_token_payload),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve and return the authenticated user from the database."""
    jti = payload.get("jti")
    if jti:
        # Check if the token was revoked (e.g. via logout)
        revoked_query = select(RevokedToken).where(RevokedToken.jti == jti)
        revoked_result = await db.execute(revoked_query)
        if revoked_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    query = select(User).where(User.id == user_uuid)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_client_ip(request: Request) -> Optional[str]:
    """Extract client IP address from proxy headers or connection host."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None
