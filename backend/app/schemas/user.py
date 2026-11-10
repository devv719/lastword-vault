from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict

from app.models.user import UserStatus


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    status: UserStatus
    checkin_interval_hours: int
    grace_period_hours: int
    last_checkin_at: Optional[datetime] = None
    next_deadline: Optional[datetime] = None
    warned_at: Optional[datetime] = None
    grace_expires_at: Optional[datetime] = None
    demo_mode: bool
    pending_email: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    checkin_interval_hours: Optional[int] = None
    grace_period_hours: Optional[int] = None
    demo_mode: Optional[bool] = None


class ChangeEmailRequest(BaseModel):
    new_email: str


class VerifyEmailRequest(BaseModel):
    token: str


class ChangeEmailResponse(BaseModel):
    message: str
    pending_email: str
    verification_token: Optional[str] = None

