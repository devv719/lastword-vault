"""Security utilities for password hashing with Argon2 and JWT management."""

from datetime import datetime, timedelta, timezone
import uuid
from typing import Any, Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHash
from jose import JWTError, jwt

from app.core.config import get_settings

_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    return _hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an Argon2 hash."""
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHash):
        return False


def create_access_token(
    subject: str | uuid.UUID,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[dict[str, Any]] = None,
) -> tuple[str, str, datetime]:
    """
    Create a signed JWT access token.
    Returns: (token_str, jti, expire_datetime)
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.JWT_EXPIRY_MINUTES)

    jti = str(uuid.uuid4())
    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        to_encode.update(extra_claims)

    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    return encoded_jwt, jti, expire


def decode_access_token(token: str) -> Optional[dict[str, Any]]:
    """Decode and validate a JWT token payload."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None

