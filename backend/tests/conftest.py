from collections.abc import AsyncGenerator
from unittest.mock import MagicMock
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.database import Base
from app.main import app as fastapi_app
import app.models  # noqa: F401 - ensure all models are registered

# Use in-memory SQLite database for fast, isolated test runs
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_database():
    """Create all tables before each test and drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(autouse=True)
def mock_ses_by_default(monkeypatch):
    """Ensure no real emails or AWS network calls are attempted during automated tests."""
    mock_client = MagicMock()
    mock_client.send_email.return_value = {
        "MessageId": "ses-msg-mock-default",
        "ResponseMetadata": {"HTTPStatusCode": 200},
    }
    monkeypatch.setattr("app.services.email_service.get_ses_client", lambda: mock_client)
    return mock_client


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a test database session.

    NOTE: Endpoints already call ``await db.commit()`` explicitly.
    With aiosqlite + StaticPool (single shared connection), doing a *second*
    commit in this cleanup path causes a deadlock because the first commit
    ends the transaction and the follow-up commit implicitly starts a new one
    on the same serialized connection.  We therefore **do not** commit here;
    the endpoint's own commit is sufficient.  If the endpoint raises before
    committing the ``rollback()`` in the except-branch cleans up.
    """
    async with TestSessionLocal() as session:
        try:
            yield session
            # Do NOT commit here — endpoints commit explicitly and a second
            # commit deadlocks on aiosqlite's single-threaded connection.
        except Exception:
            await session.rollback()
            raise


fastapi_app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client bound to the FastAPI application."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(scope="function")
async def auth_user(client: AsyncClient) -> dict:
    """Register and log in a primary test user."""
    register_payload = {
        "email": "primary@example.com",
        "password": "SecurePassword123!",
        "display_name": "Primary User",
    }
    response = await client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201, response.text
    data = response.json()
    token = data["access_token"]
    return {
        "user": data["user"],
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest_asyncio.fixture(scope="function")
async def second_user(client: AsyncClient) -> dict:
    """Register and log in a secondary test user for isolation testing."""
    register_payload = {
        "email": "secondary@example.com",
        "password": "AnotherSecurePassword456!",
        "display_name": "Secondary User",
    }
    response = await client.post("/api/v1/auth/register", json=register_payload)
    assert response.status_code == 201, response.text
    data = response.json()
    token = data["access_token"]
    return {
        "user": data["user"],
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }
