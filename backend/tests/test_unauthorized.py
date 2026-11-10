import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_protected_routes_require_authentication(client: AsyncClient):
    endpoints = [
        ("GET", "/api/v1/users/me"),
        ("PATCH", "/api/v1/users/me"),
        ("GET", "/api/v1/vault/items"),
        ("POST", "/api/v1/vault/items"),
        ("GET", "/api/v1/contacts"),
        ("POST", "/api/v1/contacts"),
        ("POST", "/api/v1/checkin"),
        ("GET", "/api/v1/checkin/history"),
        ("GET", "/api/v1/audit/logs"),
    ]

    for method, path in endpoints:
        if method == "GET":
            response = await client.get(path)
        elif method == "POST":
            response = await client.post(path, json={})
        elif method == "PATCH":
            response = await client.patch(path, json={})

        assert response.status_code == 401, f"{method} {path} should return 401, got {response.status_code}"


@pytest.mark.asyncio
async def test_invalid_bearer_token(client: AsyncClient):
    invalid_headers = {"Authorization": "Bearer invalid.token.signature"}
    response = await client.get("/api/v1/users/me", headers=invalid_headers)
    assert response.status_code == 401
    assert "Invalid or expired token" in response.json()["detail"]


@pytest.mark.asyncio
async def test_malformed_auth_header(client: AsyncClient):
    malformed_headers = {"Authorization": "NotBearer 12345"}
    response = await client.get("/api/v1/users/me", headers=malformed_headers)
    assert response.status_code == 401

