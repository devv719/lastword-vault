from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit Logs"])


@router.get(
    "/logs",
    response_model=List[AuditLogResponse],
    summary="Get immutable audit log history",
)
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None, description="Filter by event category"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(AuditLog)
        .where(AuditLog.user_id == current_user.id)
    )
    if event_type:
        query = query.where(AuditLog.event_type == event_type)

    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [AuditLogResponse.model_validate(log) for log in logs]

