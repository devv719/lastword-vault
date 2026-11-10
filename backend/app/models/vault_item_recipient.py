import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.contact import TrustedContact
    from app.models.vault_item import VaultItem


class VaultItemRecipient(Base):
    __tablename__ = "vault_item_recipients"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=uuid.uuid4,
    )
    vault_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("vault_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("trusted_contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    download_token: Mapped[Optional[str]] = mapped_column(
        String(128),
        unique=True,
        index=True,
        nullable=True,
    )
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    downloaded: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    released_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint("vault_item_id", "contact_id", name="uq_vault_item_contact"),
    )

    vault_item: Mapped["VaultItem"] = relationship(
        "VaultItem",
        back_populates="recipients",
    )
    contact: Mapped["TrustedContact"] = relationship(
        "TrustedContact",
        back_populates="recipient_assignments",
    )
