"""Shared dependencies for API route handlers."""

from app.database import get_db

# Re-export get_db for convenient importing in route modules.
# Authentication dependencies will be added here later.

__all__ = ["get_db"]
