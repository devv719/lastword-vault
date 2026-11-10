import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_current_user_profile(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "primary@example.com"
    assert data["display_name"] == "Primary User"
    assert data["status"] == "ACTIVE"
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]
    payload = {
        "display_name": "Updated Name",
        "checkin_interval_hours": 48,
        "grace_period_hours": 12,
        "demo_mode": False,
    }
    response = await client.patch("/api/v1/users/me", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "Updated Name"
    assert data["checkin_interval_hours"] == 48
    assert data["grace_period_hours"] == 12
    assert data["demo_mode"] is False


@pytest.mark.asyncio
async def test_change_email_flow_requires_verification(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Step 1: Request change to a new email address
    req_payload = {"new_email": "brandnew@example.com"}
    req_resp = await client.post("/api/v1/users/change-email", json=req_payload, headers=headers)
    assert req_resp.status_code == 200
    req_data = req_resp.json()
    assert req_data["pending_email"] == "brandnew@example.com"
    token = req_data["verification_token"]
    assert token is not None

    # Verify profile still has the original active email and pending_email is set
    me_resp = await client.get("/api/v1/users/me", headers=headers)
    assert me_resp.json()["email"] == "primary@example.com"
    assert me_resp.json()["pending_email"] == "brandnew@example.com"

    # Step 2: Try to verify with an incorrect token (should fail)
    bad_verify_resp = await client.post(
        "/api/v1/users/verify-email",
        json={"token": "incorrect_token_value"},
        headers=headers,
    )
    assert bad_verify_resp.status_code == 400
    assert "Invalid or expired" in bad_verify_resp.json()["detail"]

    # Email must STILL not be changed
    me_resp2 = await client.get("/api/v1/users/me", headers=headers)
    assert me_resp2.json()["email"] == "primary@example.com"

    # Step 3: Verify with the correct token (should succeed)
    good_verify_resp = await client.post(
        "/api/v1/users/verify-email",
        json={"token": token},
        headers=headers,
    )
    assert good_verify_resp.status_code == 200
    assert good_verify_resp.json()["email"] == "brandnew@example.com"
    assert good_verify_resp.json()["pending_email"] is None

