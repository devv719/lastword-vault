import uuid
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_get_vault(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # 1. Create / Initialize vault envelope
    vault_payload = {
        "name": "Personal Secure Vault",
        "encrypted_vault_key_envelope": "base64-wrapped-key-bytes==",
        "envelope_salt": "base64-salt==",
        "envelope_iv": "base64-iv==",
        "kdf_algorithm": "PBKDF2-SHA256",
        "kdf_iterations": 100000,
    }
    create_resp = await client.post("/api/v1/vault", json=vault_payload, headers=headers)
    assert create_resp.status_code == 201
    vault_data = create_resp.json()
    assert vault_data["name"] == "Personal Secure Vault"
    assert vault_data["encrypted_vault_key_envelope"] == "base64-wrapped-key-bytes=="
    assert vault_data["total_items"] == 0
    vault_id = vault_data["id"]

    # 2. Retrieve primary vault
    get_resp = await client.get("/api/v1/vault", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == vault_id

    # 3. Retrieve by ID
    get_id_resp = await client.get(f"/api/v1/vault/{vault_id}", headers=headers)
    assert get_id_resp.status_code == 200
    assert get_id_resp.json()["name"] == "Personal Secure Vault"

    # 4. Update vault name
    update_resp = await client.put(
        f"/api/v1/vault/{vault_id}",
        json={"name": "Renamed Secure Vault"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Renamed Secure Vault"


@pytest.mark.asyncio
async def test_vault_items_crud_under_vault_id(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Initialize vault
    vault_payload = {
        "name": "Items Test Vault",
        "encrypted_vault_key_envelope": "key-env-123",
        "envelope_salt": "salt-123",
        "envelope_iv": "iv-123",
    }
    v_resp = await client.post("/api/v1/vault", json=vault_payload, headers=headers)
    vault_id = v_resp.json()["id"]

    # 1. Add encrypted note
    note_payload = {
        "title": "Encrypted Master Note",
        "item_type": "note",
        "category": "Credentials",
        "encrypted_title": "cipher-title",
        "encrypted_content": "cipher-body",
        "encryption_iv": "iv-body",
        "release_authorized": True,
    }
    note_resp = await client.post(f"/api/v1/vault/{vault_id}/items", json=note_payload, headers=headers)
    assert note_resp.status_code == 201
    note_item = note_resp.json()
    assert note_item["item_type"] == "note"
    assert note_item["encrypted_title"] == "cipher-title"
    assert note_item["encrypted_content"] == "cipher-body"
    note_id = note_item["id"]

    # 2. Add encrypted document
    doc_payload = {
        "title": "Will and Testament",
        "item_type": "document",
        "category": "Legal",
        "encrypted_title": "cipher-doc-title",
        "encrypted_content": "cipher-doc-binary-base64",
        "encryption_iv": "iv-doc",
        "mime_type": "application/pdf",
        "file_size": 2048576,
        "release_authorized": True,
    }
    doc_resp = await client.post(f"/api/v1/vault/{vault_id}/items", json=doc_payload, headers=headers)
    assert doc_resp.status_code == 201
    doc_item = doc_resp.json()
    assert doc_item["item_type"] == "document"
    assert doc_item["file_size"] == 2048576
    doc_id = doc_item["id"]

    # 3. List items inside vault
    list_resp = await client.get(f"/api/v1/vault/{vault_id}/items", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 2

    # Filter by item_type=note
    notes_filter = await client.get(f"/api/v1/vault/{vault_id}/items?item_type=note", headers=headers)
    assert notes_filter.status_code == 200
    assert len(notes_filter.json()) == 1
    assert notes_filter.json()[0]["id"] == note_id

    # Filter by item_type=document
    docs_filter = await client.get(f"/api/v1/vault/{vault_id}/items?item_type=document", headers=headers)
    assert docs_filter.status_code == 200
    assert len(docs_filter.json()) == 1
    assert docs_filter.json()[0]["id"] == doc_id

    # 4. Get specific item
    get_item_resp = await client.get(f"/api/v1/vault/{vault_id}/items/{note_id}", headers=headers)
    assert get_item_resp.status_code == 200
    assert get_item_resp.json()["title"] == "Encrypted Master Note"

    # 5. Update item
    update_item_resp = await client.put(
        f"/api/v1/vault/{vault_id}/items/{note_id}",
        json={"title": "Updated Master Note", "encrypted_content": "updated-cipher-body"},
        headers=headers,
    )
    assert update_item_resp.status_code == 200
    assert update_item_resp.json()["title"] == "Updated Master Note"
    assert update_item_resp.json()["encrypted_content"] == "updated-cipher-body"

    # 6. Delete item
    del_resp = await client.delete(f"/api/v1/vault/{vault_id}/items/{note_id}", headers=headers)
    assert del_resp.status_code == 204

    # Verify deleted
    verify_resp = await client.get(f"/api/v1/vault/{vault_id}/items/{note_id}", headers=headers)
    assert verify_resp.status_code == 404


@pytest.mark.asyncio
async def test_vault_isolation_and_unauthorized(
    client: AsyncClient,
    auth_user: dict,
    second_user: dict,
):
    user1_headers = auth_user["headers"]
    user2_headers = second_user["headers"]

    # User 1 creates vault and item
    v_resp = await client.post(
        "/api/v1/vault",
        json={
            "name": "User 1 Private Vault",
            "encrypted_vault_key_envelope": "u1-key",
            "envelope_salt": "u1-salt",
            "envelope_iv": "u1-iv",
        },
        headers=user1_headers,
    )
    u1_vault_id = v_resp.json()["id"]

    item_resp = await client.post(
        f"/api/v1/vault/{u1_vault_id}/items",
        json={"title": "U1 Secret", "item_type": "note"},
        headers=user1_headers,
    )
    u1_item_id = item_resp.json()["id"]

    # User 2 tries to GET User 1's vault -> 404
    u2_v_resp = await client.get(f"/api/v1/vault/{u1_vault_id}", headers=user2_headers)
    assert u2_v_resp.status_code == 404

    # User 2 tries to GET User 1's items -> 404
    u2_items_resp = await client.get(f"/api/v1/vault/{u1_vault_id}/items", headers=user2_headers)
    assert u2_items_resp.status_code == 404

    # User 2 tries to DELETE User 1's item -> 404
    u2_del_resp = await client.delete(
        f"/api/v1/vault/{u1_vault_id}/items/{u1_item_id}",
        headers=user2_headers,
    )
    assert u2_del_resp.status_code == 404

    # Unauthenticated access -> 401
    unauth_resp = await client.get("/api/v1/vault")
    assert unauth_resp.status_code == 401


@pytest.mark.asyncio
async def test_legacy_vault_items_compatibility(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Create via legacy /api/v1/vault/items
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
    assert len(items) >= 1
    item_ids = [i["id"] for i in items]
    assert item["id"] in item_ids


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
