import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vault_item import VaultItem
    from app.models.vault_item_recipient import VaultItemRecipient


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

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
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    relationship_type: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )
    verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    verification_token: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
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

    user: Mapped["User"] = relationship("User", back_populates="contacts")
    assigned_vault_items: Mapped[List["VaultItem"]] = relationship(
        "VaultItem",
        back_populates="assigned_contact",
    )
    recipient_assignments: Mapped[List["VaultItemRecipient"]] = relationship(
        "VaultItemRecipient",
        back_populates="contact",
        cascade="all, delete-orphan",
    )


# Alias for backward compatibility
Contact = TrustedContact
