
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # database
    DATABASE_URL: str = "postgresql+asyncpg://lastword:change-me@localhost:5433/lastword"

    # jwt authentication
    JWT_SECRET: str = "development-only-secret-change-this"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 1440

    # application
    APP_ENV: str = "development"
    CORS_ORIGINS: str = "http://localhost:5173"

    # dead man's switch
    DEMO_MODE: bool = True
    DEMO_CHECKIN_INTERVAL_SECONDS: int = 120
    DEMO_GRACE_PERIOD_SECONDS: int = 60
    DEFAULT_CHECKIN_INTERVAL_HOURS: int = 72
    DEFAULT_GRACE_PERIOD_HOURS: int = 24

    # aws configuration
    AWS_REGION: str = "ap-south-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = ""
    SNS_TOPIC_ARN: str = ""
    SES_SENDER_EMAIL: str = "devvv0793@gmail.com"
    SES_CONFIGURATION_SET: str = "lastword-ses-events"

    # cloudwatch configuration
    CLOUDWATCH_LOG_GROUP: str = "/lastword/backend"
    CLOUDWATCH_ERROR_LOG_GROUP: str = "/lastword/errors"
    CLOUDWATCH_RETENTION_DAYS: int = 7
    CLOUDWATCH_NAMESPACE: str = "LastWord/EC2"

    # frontend / public url configuration
    FRONTEND_URL: str = ""
    DOMAIN: str = ""

    @property
    def effective_frontend_url(self) -> str:
        """Derive the publicly reachable base URL for links in dispatched emails."""
        if self.FRONTEND_URL:
            return self.FRONTEND_URL.rstrip("/")
        if self.DOMAIN:
            return f"https://{self.DOMAIN.rstrip('/')}"
        return "http://3.109.2.254"

    # ssm configuration
    USE_SSM: bool = False
    SSM_PREFIX: str = "/lastword"

    # backend
    BACKEND_PORT: int = 8000

    # postgres configuration
    POSTGRES_USER: str = "lastword"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "lastword"
    POSTGRES_PORT: int = 5433

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
