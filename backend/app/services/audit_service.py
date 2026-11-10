import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def record_audit_log(
    session: AsyncSession,
    user_id: uuid.UUID,
    event_type: str,
    action: str,
    description: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    """Record an immutable audit log entry."""
    entry = AuditLog(
        user_id=user_id,
        event_type=event_type,
        action=action,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(entry)
    return entry

