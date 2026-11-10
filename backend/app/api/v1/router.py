from fastapi import APIRouter

from app.api.v1.audit import router as audit_router
from app.api.v1.auth import router as auth_router
from app.api.v1.checkin import router as checkin_router
from app.api.v1.contacts import router as contacts_router
from app.api.v1.users import router as users_router
from app.api.v1.vault import router as vault_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(contacts_router)
api_v1_router.include_router(vault_router)
api_v1_router.include_router(checkin_router)
api_v1_router.include_router(audit_router)

