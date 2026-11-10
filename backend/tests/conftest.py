"""Shared test fixtures.

Full test configuration with async database support
will be added alongside feature implementations.
"""

import pytest


@pytest.fixture
def app_settings():
    """Provide test settings overrides."""
    return {
        "APP_ENV": "testing",
        "DATABASE_URL": "sqlite+aiosqlite:///./test.db",
        "JWT_SECRET": "test-secret",
        "DEMO_MODE": "true",
    }
