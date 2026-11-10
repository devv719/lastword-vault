from datetime import datetime
from typing import Any, List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.contact import ContactResponse


class VaultCreate(BaseModel):
    name: str = Field("Primary Vault", min_length=1, max_length=255)
    encrypted_vault_key_envelope: str = Field(..., description="Base64 ciphertext of the wrapped vault key")
    envelope_salt: str = Field(..., description="Base64 salt used for PBKDF2 derivation")
    envelope_iv: str = Field(..., description="Base64 IV used for AES-GCM key wrapping")
    kdf_algorithm: Optional[str] = Field("PBKDF2-SHA256", max_length=50)
    kdf_iterations: Optional[int] = Field(100000, ge=1000)


class VaultUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    encrypted_vault_key_envelope: Optional[str] = None
    envelope_salt: Optional[str] = None
    envelope_iv: Optional[str] = None
    kdf_algorithm: Optional[str] = None
    kdf_iterations: Optional[int] = None


class VaultResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    encrypted_vault_key_envelope: str
    envelope_salt: str
    envelope_iv: str
    kdf_algorithm: str
    kdf_iterations: int
    total_items: Optional[int] = 0
    documents_count: Optional[int] = 0
    notes_count: Optional[int] = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class VaultItemCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    item_type: Optional[str] = Field("note", max_length=50)
    encrypted_title: Optional[str] = None
    encrypted_content: Optional[str] = None
    encryption_iv: Optional[str] = Field(None, max_length=255)
    mime_type: Optional[str] = Field(None, max_length=128)
    file_size: Optional[int] = None
    category: Optional[str] = Field("Documents", max_length=50)
    encrypted_note: Optional[str] = None
    s3_key: Optional[str] = Field(None, max_length=512)
    original_filename: Optional[str] = Field(None, max_length=255)
    file_size_bytes: Optional[int] = None
    release_authorized: bool = False
    assigned_contact_id: Optional[uuid.UUID] = None

    @field_validator("assigned_contact_id", mode="before")
    @classmethod
    def sanitize_assigned_contact_id(cls, v: Any) -> Optional[uuid.UUID]:
        if not v or v in ("null", "none", "unassigned", ""):
            return None
        if isinstance(v, uuid.UUID):
            return v
        if isinstance(v, str):
            try:
                return uuid.UUID(v)
            except (ValueError, AttributeError):
                # Ignore mock or non-UUID strings rather than failing with 422
                return None
        return None


class VaultItemUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    item_type: Optional[str] = Field(None, max_length=50)
    encrypted_title: Optional[str] = None
    encrypted_content: Optional[str] = None
    encryption_iv: Optional[str] = Field(None, max_length=255)
    mime_type: Optional[str] = Field(None, max_length=128)
    file_size: Optional[int] = None
    category: Optional[str] = Field(None, max_length=50)
    encrypted_note: Optional[str] = None
    s3_key: Optional[str] = Field(None, max_length=512)
    original_filename: Optional[str] = Field(None, max_length=255)
    file_size_bytes: Optional[int] = None
    release_authorized: Optional[bool] = None
    assigned_contact_id: Optional[uuid.UUID] = None

    @field_validator("assigned_contact_id", mode="before")
    @classmethod
    def sanitize_assigned_contact_id(cls, v: Any) -> Optional[uuid.UUID]:
        if not v or v in ("null", "none", "unassigned", ""):
            return None
        if isinstance(v, uuid.UUID):
            return v
        if isinstance(v, str):
            try:
                return uuid.UUID(v)
            except (ValueError, AttributeError):
                return None
        return None


class AssignContactRequest(BaseModel):
    contact_id: Optional[uuid.UUID] = None


class VaultItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    vault_id: Optional[uuid.UUID] = None
    item_type: str = "note"
    title: str = ""
    encrypted_title: Optional[str] = None
    encrypted_content: Optional[str] = None
    encryption_iv: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    category: Optional[str] = None
    encrypted_note: Optional[str] = None
    s3_key: Optional[str] = None
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    release_authorized: bool = False
    assigned_contact_id: Optional[uuid.UUID] = None
    assigned_contact: Optional[ContactResponse] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class VaultSummaryResponse(BaseModel):
    vault: Optional[VaultResponse] = None
    total_items: int = 0
    documents_count: int = 0
    notes_count: int = 0
    recent_items: List[VaultItemResponse] = []
