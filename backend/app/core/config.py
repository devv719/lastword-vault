"""Core application configuration and settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_ENV: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/lastword"
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 1440
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_NAME: str = ""
    SNS_TOPIC_ARN: str = ""
    DEMO_MODE: bool = True
    DEMO_CHECKIN_INTERVAL_SECONDS: int = 120
    DEMO_GRACE_PERIOD_SECONDS: int = 60
    DEFAULT_CHECKIN_INTERVAL_HOURS: int = 72
    DEFAULT_GRACE_PERIOD_HOURS: int = 24
    USE_SSM: bool = False
    SSM_PREFIX: str = "/lastword"
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()

