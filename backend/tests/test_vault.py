import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_vault_items(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    payload = {
        "title": "Living Will and Directives",
        "category": "Legal",
        "encrypted_note": "cipher-block-1a2b3c",
        "release_authorized": True,
    }
    response = await client.post("/api/v1/vault/items", json=payload, headers=headers)
    assert response.status_code == 201
    item = response.json()
    assert item["title"] == "Living Will and Directives"
    assert item["category"] == "Legal"
    assert item["encrypted_note"] == "cipher-block-1a2b3c"
    assert item["release_authorized"] is True

    # List items
    list_resp = await client.get("/api/v1/vault/items", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["id"] == item["id"]


@pytest.mark.asyncio
async def test_update_vault_item(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    create_payload = {
        "title": "Trezor Seed Phrase",
        "category": "Credentials",
        "release_authorized": False,
    }
    create_resp = await client.post("/api/v1/vault/items", json=create_payload, headers=headers)
    item_id = create_resp.json()["id"]

    # Explicitly toggle release authorization
    update_payload = {
        "release_authorized": True,
        "title": "Hardware Wallet Seed Backup",
    }
    update_resp = await client.patch(f"/api/v1/vault/items/{item_id}", json=update_payload, headers=headers)
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["release_authorized"] is True
    assert updated["title"] == "Hardware Wallet Seed Backup"


@pytest.mark.asyncio
async def test_assign_contact_to_vault_item(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # 1. Create a contact
    contact_resp = await client.post(
        "/api/v1/contacts",
        json={"name": "Sarah Connor", "email": "sarah@example.com"},
        headers=headers,
    )
    contact_id = contact_resp.json()["id"]

    # 2. Create a vault item
    item_resp = await client.post(
        "/api/v1/vault/items",
        json={"title": "Encrypted Directive", "release_authorized": True},
        headers=headers,
    )
    item_id = item_resp.json()["id"]

    # 3. Assign contact to vault item
    assign_resp = await client.post(
        f"/api/v1/vault/items/{item_id}/contacts/{contact_id}",
        headers=headers,
    )
    assert assign_resp.status_code == 200
    assigned_item = assign_resp.json()
    assert assigned_item["assigned_contact_id"] == contact_id
    assert assigned_item["assigned_contact"]["name"] == "Sarah Connor"

    # 4. Unassign contact
    unassign_resp = await client.delete(
        f"/api/v1/vault/items/{item_id}/contacts/{contact_id}",
        headers=headers,
    )
    assert unassign_resp.status_code == 200
    assert unassign_resp.json()["assigned_contact_id"] is None


@pytest.mark.asyncio
async def test_delete_vault_item(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    create_resp = await client.post(
        "/api/v1/vault/items",
        json={"title": "Draft Document"},
        headers=headers,
    )
    item_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/api/v1/vault/items/{item_id}", headers=headers)
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/v1/vault/items/{item_id}", headers=headers)
    assert get_resp.status_code == 404

