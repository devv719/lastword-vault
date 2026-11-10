import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.contact import TrustedContact
    from app.models.user import User
    from app.models.vault_item_recipient import VaultItemRecipient


class VaultItem(Base):
    __tablename__ = "vault_items"

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
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    category: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        default="Documents",
    )
    encrypted_note: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    s3_key: Mapped[Optional[str]] = mapped_column(
        String(512),
        nullable=True,
    )
    original_filename: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    file_size_bytes: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
    )
    release_authorized: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    assigned_contact_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("trusted_contacts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="vault_items")
    assigned_contact: Mapped[Optional["TrustedContact"]] = relationship(
        "TrustedContact",
        back_populates="assigned_vault_items",
        foreign_keys=[assigned_contact_id],
    )
    recipients: Mapped[List["VaultItemRecipient"]] = relationship(
        "VaultItemRecipient",
        back_populates="vault_item",
        cascade="all, delete-orphan",
    )
