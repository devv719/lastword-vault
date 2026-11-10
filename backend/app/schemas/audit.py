from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    action: str
    description: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime

