import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )
    jti: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=False,
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        nullable=True,
        index=True,
    )
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

