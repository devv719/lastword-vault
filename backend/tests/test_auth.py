import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    payload = {
        "email": "alice@example.com",
        "password": "SuperSecretPassword123!",
        "display_name": "Alice Wonderland",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["display_name"] == "Alice Wonderland"
    # Never expose passwords or password hashes
    assert "password" not in data["user"]
    assert "password_hash" not in data["user"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, auth_user: dict):
    payload = {
        "email": auth_user["user"]["email"],
        "password": "Password123!",
        "display_name": "Duplicate User",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_register_password_too_short(client: AsyncClient):
    payload = {
        "email": "short@example.com",
        "password": "short",
        "display_name": "Short Password User",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, auth_user: dict):
    login_payload = {
        "email": "primary@example.com",
        "password": "SecurePassword123!",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "primary@example.com"


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient, auth_user: dict):
    login_payload = {
        "email": "primary@example.com",
        "password": "WrongPassword!",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    login_payload = {
        "email": "ghost@example.com",
        "password": "Password123!",
    }
    response = await client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_and_token_revocation(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Verify protected route works initially
    me_resp = await client.get("/api/v1/users/me", headers=headers)
    assert me_resp.status_code == 200

    # Logout to revoke the session token
    logout_resp = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout_resp.status_code == 200
    assert "revoked" in logout_resp.json()["message"]

    # Verify subsequent requests with the same token fail with 401
    revoked_me_resp = await client.get("/api/v1/users/me", headers=headers)
    assert revoked_me_resp.status_code == 401
    assert "revoked" in revoked_me_resp.json()["detail"]

