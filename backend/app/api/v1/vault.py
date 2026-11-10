from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db
from app.models.contact import TrustedContact
from app.models.user import User
from app.models.vault_item import VaultItem
from app.schemas.vault import (
    AssignContactRequest,
    VaultItemCreate,
    VaultItemResponse,
    VaultItemUpdate,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/vault", tags=["Vault"])


@router.post(
    "/items",
    response_model=VaultItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new vault item",
)
async def create_vault_item(
    payload: VaultItemCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address = get_client_ip(request)

    # Validate assigned_contact_id if provided
    if payload.assigned_contact_id:
        contact_query = select(TrustedContact).where(
            TrustedContact.id == payload.assigned_contact_id,
            TrustedContact.user_id == current_user.id,
        )
        contact_res = await db.execute(contact_query)
        if contact_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned contact not found or does not belong to your account",
            )

    item = VaultItem(
        user_id=current_user.id,
        title=payload.title.strip(),
        category=payload.category.strip() if payload.category else "Documents",
        encrypted_note=payload.encrypted_note,
        s3_key=payload.s3_key,
        original_filename=payload.original_filename,
        file_size_bytes=payload.file_size_bytes,
        release_authorized=payload.release_authorized,
        assigned_contact_id=payload.assigned_contact_id,
    )
    db.add(item)
    await db.flush()

    # Eager load assigned_contact for response
    await db.refresh(item, attribute_names=["assigned_contact"])

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="VAULT",
        action="VAULT_ITEM_CREATED",
        description=f"Created vault item: {item.title}",
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
    )

    return VaultItemResponse.model_validate(item)


@router.get(
    "/items",
    response_model=List[VaultItemResponse],
    summary="List all vault items for the authenticated user",
)
async def list_vault_items(
    category: Optional[str] = Query(None, description="Filter by category"),
    release_authorized: Optional[bool] = Query(None, description="Filter by release authorization"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Strictly scoped to current_user.id
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(VaultItem.user_id == current_user.id)
    )

    if category is not None:
        query = query.where(VaultItem.category == category)
    if release_authorized is not None:
        query = query.where(VaultItem.release_authorized == release_authorized)

    query = query.order_by(VaultItem.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()

    return [VaultItemResponse.model_validate(item) for item in items]


@router.get(
    "/items/{item_id}",
    response_model=VaultItemResponse,
    summary="Get vault item details by ID",
)
async def get_vault_item(
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Strictly scoped to current_user.id - prevents IDOR
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(VaultItem.id == item_id, VaultItem.user_id == current_user.id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )

    return VaultItemResponse.model_validate(item)


@router.patch(
    "/items/{item_id}",
    response_model=VaultItemResponse,
    summary="Update vault item metadata and authorization",
)
async def update_vault_item(
    item_id: uuid.UUID,
    payload: VaultItemUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(VaultItem.id == item_id, VaultItem.user_id == current_user.id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )

    # Validate new contact if specified
    if payload.assigned_contact_id is not None:
        contact_query = select(TrustedContact).where(
            TrustedContact.id == payload.assigned_contact_id,
            TrustedContact.user_id == current_user.id,
        )
        contact_res = await db.execute(contact_query)
        if contact_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned contact not found or does not belong to your account",
            )
        item.assigned_contact_id = payload.assigned_contact_id

    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.category is not None:
        item.category = payload.category.strip()
    if payload.encrypted_note is not None:
        item.encrypted_note = payload.encrypted_note
    if payload.s3_key is not None:
        item.s3_key = payload.s3_key
    if payload.original_filename is not None:
        item.original_filename = payload.original_filename
    if payload.file_size_bytes is not None:
        item.file_size_bytes = payload.file_size_bytes
    if payload.release_authorized is not None:
        item.release_authorized = payload.release_authorized

    item.updated_at = datetime.now(timezone.utc)
    db.add(item)
    await db.flush()
    await db.refresh(item, attribute_names=["assigned_contact"])

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="VAULT",
        action="VAULT_ITEM_UPDATED",
        description=f"Updated vault item: {item.title}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return VaultItemResponse.model_validate(item)


@router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a vault item",
)
async def delete_vault_item(
    item_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(VaultItem).where(
        VaultItem.id == item_id,
        VaultItem.user_id == current_user.id,
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )

    title = item.title
    await db.delete(item)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="VAULT",
        action="VAULT_ITEM_DELETED",
        description=f"Deleted vault item: {title}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/items/{item_id}/contacts/{contact_id}",
    response_model=VaultItemResponse,
    summary="Assign a trusted contact to a vault item",
)
async def assign_contact_to_item(
    item_id: uuid.UUID,
    contact_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify vault item ownership
    item_query = select(VaultItem).where(
        VaultItem.id == item_id,
        VaultItem.user_id == current_user.id,
    )
    item_res = await db.execute(item_query)
    item = item_res.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )

    # Verify contact ownership
    contact_query = select(TrustedContact).where(
        TrustedContact.id == contact_id,
        TrustedContact.user_id == current_user.id,
    )
    contact_res = await db.execute(contact_query)
    contact = contact_res.scalar_one_or_none()
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found or does not belong to your account",
        )

    item.assigned_contact_id = contact.id
    item.updated_at = datetime.now(timezone.utc)
    db.add(item)
    await db.flush()
    await db.refresh(item, attribute_names=["assigned_contact"])

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="VAULT",
        action="CONTACT_ASSIGNED_TO_ITEM",
        description=f"Assigned {contact.name} to vault item {item.title}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return VaultItemResponse.model_validate(item)


@router.delete(
    "/items/{item_id}/contacts/{contact_id}",
    response_model=VaultItemResponse,
    summary="Unassign a contact from a vault item",
)
async def unassign_contact_from_item(
    item_id: uuid.UUID,
    contact_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item_query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(VaultItem.id == item_id, VaultItem.user_id == current_user.id)
    )
    item_res = await db.execute(item_query)
    item = item_res.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )

    if item.assigned_contact_id == contact_id:
        item.assigned_contact_id = None
        item.updated_at = datetime.now(timezone.utc)
        db.add(item)
        await db.flush()
        await db.refresh(item, attribute_names=["assigned_contact"])

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="VAULT",
        action="CONTACT_UNASSIGNED_FROM_ITEM",
        description=f"Unassigned contact from vault item {item.title}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return VaultItemResponse.model_validate(item)

