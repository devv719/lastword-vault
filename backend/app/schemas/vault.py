from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.contact import ContactResponse


class VaultItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field("Documents", max_length=50)
    encrypted_note: Optional[str] = None
    s3_key: Optional[str] = Field(None, max_length=512)
    original_filename: Optional[str] = Field(None, max_length=255)
    file_size_bytes: Optional[int] = None
    release_authorized: bool = False
    assigned_contact_id: Optional[uuid.UUID] = None


class VaultItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=50)
    encrypted_note: Optional[str] = None
    s3_key: Optional[str] = Field(None, max_length=512)
    original_filename: Optional[str] = Field(None, max_length=255)
    file_size_bytes: Optional[int] = None
    release_authorized: Optional[bool] = None
    assigned_contact_id: Optional[uuid.UUID] = None


class AssignContactRequest(BaseModel):
    contact_id: Optional[uuid.UUID] = None


class VaultItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    category: Optional[str] = None
    encrypted_note: Optional[str] = None
    s3_key: Optional[str] = None
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    release_authorized: bool
    assigned_contact_id: Optional[uuid.UUID] = None
    assigned_contact: Optional[ContactResponse] = None
    created_at: datetime
    updated_at: datetime

