import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vault_item import VaultItem


class Vault(Base):
    __tablename__ = "vaults"

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
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Primary Vault",
    )
    encrypted_vault_key_envelope: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    envelope_salt: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    envelope_iv: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    kdf_algorithm: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="PBKDF2-SHA256",
    )
    kdf_iterations: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=100000,
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

    user: Mapped["User"] = relationship("User", back_populates="vaults")
    items: Mapped[List["VaultItem"]] = relationship(
        "VaultItem",
        back_populates="vault",
        cascade="all, delete-orphan",
    )

