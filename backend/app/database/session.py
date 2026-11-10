from collections.abc import AsyncGenerator
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

_engine: Optional[AsyncEngine] = None
_async_session_maker: Optional[async_sessionmaker[AsyncSession]] = None


class Base(DeclarativeBase):
    pass


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        from app.core.config import get_settings

        settings = get_settings()
        connect_args = {}
        if settings.DATABASE_URL.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        _engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            connect_args=connect_args,
        )
    return _engine


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    global _async_session_maker
    if _async_session_maker is None:
        _async_session_maker = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _async_session_maker


def reset_database_connection(new_url: Optional[str] = None) -> None:
    """Reset cached engine and session maker (useful for testing)."""
    global _engine, _async_session_maker
    _engine = None
    _async_session_maker = None
    if new_url is not None:
        from app.core.config import get_settings

        settings = get_settings()
        settings.DATABASE_URL = new_url


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    session_maker = get_session_maker()
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
