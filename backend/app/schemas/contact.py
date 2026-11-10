from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    relationship_type: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)


class ContactUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    relationship_type: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)


class ContactVerifyRequest(BaseModel):
    token: Optional[str] = None


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    email: str
    relationship_type: Optional[str] = None
    phone: Optional[str] = None
    verified: bool
    verification_token: Optional[str] = None
    created_at: datetime
    updated_at: datetime

