from datetime import datetime, timezone
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_perform_checkin_updates_deadline_and_status(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Check initial profile
    me_before = await client.get("/api/v1/users/me", headers=headers)
    assert me_before.status_code == 200

    # Perform heartbeat check-in
    payload = {"source": "web"}
    response = await client.post("/api/v1/checkin", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "Heartbeat successfully authenticated" in data["message"]
    assert data["status"] == "ACTIVE"
    assert "last_checkin_at" in data
    assert "next_deadline" in data

    # Verify profile reflects new checkin time and active status
    me_after = await client.get("/api/v1/users/me", headers=headers)
    me_data = me_after.json()
    assert me_data["status"] == "ACTIVE"
    assert me_data["warned_at"] is None
    assert me_data["grace_expires_at"] is None
    assert me_data["last_checkin_at"] is not None
    assert me_data["next_deadline"] is not None


@pytest.mark.asyncio
async def test_checkin_creates_audit_log_and_history(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Perform check-in
    checkin_resp = await client.post("/api/v1/checkin", json={"source": "mobile"}, headers=headers)
    assert checkin_resp.status_code == 200

    # Check checkin history records
    history_resp = await client.get("/api/v1/checkin/history", headers=headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) >= 1
    assert history[0]["source"] == "mobile"

    # Check audit log records
    audit_resp = await client.get("/api/v1/audit/logs", headers=headers)
    assert audit_resp.status_code == 200
    audit_logs = audit_resp.json()
    actions = [log["action"] for log in audit_logs]
    assert "HEARTBEAT_CHECKIN_COMPLETED" in actions

