import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_contacts(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    contact_payload = {
        "name": "David Vance",
        "email": "david.vance@example.com",
        "relationship_type": "Legal Counsel",
        "phone": "+1-555-0199",
    }
    response = await client.post("/api/v1/contacts", json=contact_payload, headers=headers)
    assert response.status_code == 201
    contact = response.json()
    assert contact["name"] == "David Vance"
    assert contact["email"] == "david.vance@example.com"
    assert contact["relationship_type"] == "Legal Counsel"
    assert contact["verified"] is False
    assert "verification_token" in contact

    # List contacts
    list_resp = await client.get("/api/v1/contacts", headers=headers)
    assert list_resp.status_code == 200
    contacts = list_resp.json()
    assert len(contacts) == 1
    assert contacts[0]["id"] == contact["id"]


@pytest.mark.asyncio
async def test_update_contact(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    # Create contact
    contact_payload = {
        "name": "Maya Chen",
        "email": "maya@example.com",
        "relationship_type": "Partner",
    }
    create_resp = await client.post("/api/v1/contacts", json=contact_payload, headers=headers)
    contact_id = create_resp.json()["id"]

    # Update contact
    update_payload = {
        "name": "Maya Chen-Vance",
        "relationship_type": "Spouse",
    }
    update_resp = await client.patch(f"/api/v1/contacts/{contact_id}", json=update_payload, headers=headers)
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "Maya Chen-Vance"
    assert updated["relationship_type"] == "Spouse"


@pytest.mark.asyncio
async def test_verify_contact(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    contact_payload = {
        "name": "Elena Rostova",
        "email": "elena@example.com",
    }
    create_resp = await client.post("/api/v1/contacts", json=contact_payload, headers=headers)
    contact = create_resp.json()
    contact_id = contact["id"]
    token = contact["verification_token"]
    assert contact["verified"] is False

    # Verify with matching token
    verify_resp = await client.post(
        f"/api/v1/contacts/{contact_id}/verify",
        json={"token": token},
        headers=headers,
    )
    assert verify_resp.status_code == 200
    assert verify_resp.json()["verified"] is True


@pytest.mark.asyncio
async def test_delete_contact(client: AsyncClient, auth_user: dict):
    headers = auth_user["headers"]

    contact_payload = {"name": "Temporary Contact", "email": "temp@example.com"}
    create_resp = await client.post("/api/v1/contacts", json=contact_payload, headers=headers)
    contact_id = create_resp.json()["id"]

    delete_resp = await client.delete(f"/api/v1/contacts/{contact_id}", headers=headers)
    assert delete_resp.status_code == 204

    # Verify 404 on subsequent get
    get_resp = await client.get(f"/api/v1/contacts/{contact_id}", headers=headers)
    assert get_resp.status_code == 404

