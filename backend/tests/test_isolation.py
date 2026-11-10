import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_vault_items_user_isolation(client: AsyncClient, auth_user: dict, second_user: dict):
    user1_headers = auth_user["headers"]
    user2_headers = second_user["headers"]

    # User 1 creates a private vault item
    item_payload = {"title": "User 1 Secret Ledger", "encrypted_note": "secret123"}
    resp1 = await client.post("/api/v1/vault/items", json=item_payload, headers=user1_headers)
    assert resp1.status_code == 201
    user1_item_id = resp1.json()["id"]

    # User 2 lists vault items: User 1's item must NOT appear
    resp2_list = await client.get("/api/v1/vault/items", headers=user2_headers)
    assert resp2_list.status_code == 200
    user2_items = resp2_list.json()
    assert len(user2_items) == 0

    # User 2 tries to GET User 1's item directly (must return 404 to prevent IDOR)
    resp2_get = await client.get(f"/api/v1/vault/items/{user1_item_id}", headers=user2_headers)
    assert resp2_get.status_code == 404
    assert "Vault item not found" in resp2_get.json()["detail"]

    # User 2 tries to PATCH User 1's item (must return 404)
    resp2_patch = await client.patch(
        f"/api/v1/vault/items/{user1_item_id}",
        json={"title": "Hacked Title"},
        headers=user2_headers,
    )
    assert resp2_patch.status_code == 404

    # User 2 tries to DELETE User 1's item (must return 404)
    resp2_del = await client.delete(f"/api/v1/vault/items/{user1_item_id}", headers=user2_headers)
    assert resp2_del.status_code == 404

    # Verify User 1's item is untouched
    resp1_verify = await client.get(f"/api/v1/vault/items/{user1_item_id}", headers=user1_headers)
    assert resp1_verify.status_code == 200
    assert resp1_verify.json()["title"] == "User 1 Secret Ledger"


@pytest.mark.asyncio
async def test_contacts_user_isolation(client: AsyncClient, auth_user: dict, second_user: dict):
    user1_headers = auth_user["headers"]
    user2_headers = second_user["headers"]

    # User 1 adds a trusted contact
    contact_payload = {"name": "User 1 Attorney", "email": "attorney@example.com"}
    resp1 = await client.post("/api/v1/contacts", json=contact_payload, headers=user1_headers)
    assert resp1.status_code == 201
    user1_contact_id = resp1.json()["id"]

    # User 2 lists contacts: User 1's contact must NOT appear
    resp2_list = await client.get("/api/v1/contacts", headers=user2_headers)
    assert resp2_list.status_code == 200
    assert len(resp2_list.json()) == 0

    # User 2 tries to GET User 1's contact directly (must return 404)
    resp2_get = await client.get(f"/api/v1/contacts/{user1_contact_id}", headers=user2_headers)
    assert resp2_get.status_code == 404

    # User 2 tries to PATCH User 1's contact (must return 404)
    resp2_patch = await client.patch(
        f"/api/v1/contacts/{user1_contact_id}",
        json={"name": "Attacker"},
        headers=user2_headers,
    )
    assert resp2_patch.status_code == 404

    # User 2 tries to DELETE User 1's contact (must return 404)
    resp2_del = await client.delete(f"/api/v1/contacts/{user1_contact_id}", headers=user2_headers)
    assert resp2_del.status_code == 404


@pytest.mark.asyncio
async def test_cross_user_contact_assignment_blocked(client: AsyncClient, auth_user: dict, second_user: dict):
    user1_headers = auth_user["headers"]
    user2_headers = second_user["headers"]

    # User 1 creates a contact
    resp_c = await client.post(
        "/api/v1/contacts",
        json={"name": "User 1 Contact", "email": "contact1@example.com"},
        headers=user1_headers,
    )
    user1_contact_id = resp_c.json()["id"]

    # User 2 creates a vault item
    resp_v = await client.post(
        "/api/v1/vault/items",
        json={"title": "User 2 Item"},
        headers=user2_headers,
    )
    user2_item_id = resp_v.json()["id"]

    # User 2 attempts to assign User 1's contact to User 2's vault item (must fail with 404)
    resp_assign = await client.post(
        f"/api/v1/vault/items/{user2_item_id}/contacts/{user1_contact_id}",
        headers=user2_headers,
    )
    assert resp_assign.status_code == 404
    assert "not found or does not belong" in resp_assign.json()["detail"]


@pytest.mark.asyncio
async def test_audit_logs_user_isolation(client: AsyncClient, auth_user: dict, second_user: dict):
    user1_headers = auth_user["headers"]
    user2_headers = second_user["headers"]

    # User 1 performs a check-in
    await client.post("/api/v1/checkin", json={"source": "user1_web"}, headers=user1_headers)

    # User 2 queries audit logs
    resp2 = await client.get("/api/v1/audit/logs", headers=user2_headers)
    assert resp2.status_code == 200
    user2_logs = resp2.json()

    # User 2's audit logs must only contain user 2's user_id
    user2_id = second_user["user"]["id"]
    for log in user2_logs:
        assert log["user_id"] == user2_id

