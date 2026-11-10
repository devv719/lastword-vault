import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class CheckinRecord(Base):
    __tablename__ = "checkin_records"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(
        String(50),
        default="manual",
        nullable=False,
    )
    used: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    ip_address: Mapped[Optional[str]] = mapped_column(
        String(45),
        nullable=True,
    )
    user_agent: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="checkin_records")


# Alias for backward compatibility
CheckIn = CheckinRecord
