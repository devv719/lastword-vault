from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="LastWord API",
    description="Dead Man's Switch Vault — Secure document release system",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
if not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include v1 API routes
app.include_router(api_v1_router)


@app.get("/")
async def root():
    return {
        "message": "LastWord Dead Man's Switch Vault API",
        "version": "1.0.0",
        "docs": "/docs",
        "api_v1": "/api/v1",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.APP_ENV,
    }
