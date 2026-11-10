import enum
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.checkin import CheckinRecord
    from app.models.contact import TrustedContact
    from app.models.vault_item import VaultItem


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    WARNED = "WARNED"
    GRACE = "GRACE"
    RELEASED = "RELEASED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", values_callable=lambda obj: [e.value for e in obj]),
        default=UserStatus.ACTIVE,
        nullable=False,
    )
    checkin_interval_hours: Mapped[int] = mapped_column(
        Integer,
        default=72,
        nullable=False,
    )
    grace_period_hours: Mapped[int] = mapped_column(
        Integer,
        default=24,
        nullable=False,
    )
    last_checkin_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    next_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    warned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    grace_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    demo_mode: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    pending_email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    email_verification_token: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    vault_items: Mapped[List["VaultItem"]] = relationship(
        "VaultItem",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    contacts: Mapped[List["TrustedContact"]] = relationship(
        "TrustedContact",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    checkin_records: Mapped[List["CheckinRecord"]] = relationship(
        "CheckinRecord",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
        cascade="all, delete-orphan",
    )
