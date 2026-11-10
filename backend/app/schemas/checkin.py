from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict

from app.models.user import UserStatus


class CheckinRequest(BaseModel):
    token: Optional[str] = None
    source: Optional[str] = "web"


class CheckinResponse(BaseModel):
    message: str
    status: UserStatus
    last_checkin_at: datetime
    next_deadline: datetime
    user_id: uuid.UUID


class CheckinRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    source: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

