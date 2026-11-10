from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_ip, get_current_user, get_db
from app.models.contact import TrustedContact
from app.models.user import User
from app.models.vault import Vault
from app.models.vault_item import VaultItem
from app.schemas.vault import (
    AssignContactRequest,
    VaultCreate,
    VaultItemCreate,
    VaultItemResponse,
    VaultItemUpdate,
    VaultResponse,
    VaultSummaryResponse,
    VaultUpdate,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/vault", tags=["Vault"])


async def _get_vault_counts(db: AsyncSession, vault_id: uuid.UUID) -> tuple[int, int, int]:
    """Return (total_items, documents_count, notes_count) for a vault."""
    total_q = select(func.count(VaultItem.id)).where(VaultItem.vault_id == vault_id)
    doc_q = select(func.count(VaultItem.id)).where(
        VaultItem.vault_id == vault_id,
        VaultItem.item_type == "document",
    )
    note_q = select(func.count(VaultItem.id)).where(
        VaultItem.vault_id == vault_id,
        VaultItem.item_type == "note",
    )

    total_res = await db.execute(total_q)
    doc_res = await db.execute(doc_q)
    note_res = await db.execute(note_q)

    return (
        total_res.scalar() or 0,
        doc_res.scalar() or 0,
        note_res.scalar() or 0,
    )


# =========================================================================
# VAULT ENVELOPE ENDPOINTS
# =========================================================================

@router.post(
    "",
    response_model=VaultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or initialize user's encrypted vault envelope",
)
async def create_or_init_vault(
    payload: VaultCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address = get_client_ip(request)

    # Check if user already has an active vault
    existing_query = select(Vault).where(Vault.user_id == current_user.id)
    existing_res = await db.execute(existing_query)
    vault = existing_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if vault is not None:
        # Update existing vault envelope
        vault.name = payload.name.strip()
        vault.encrypted_vault_key_envelope = payload.encrypted_vault_key_envelope
        vault.envelope_salt = payload.envelope_salt
        vault.envelope_iv = payload.envelope_iv
        if payload.kdf_algorithm:
            vault.kdf_algorithm = payload.kdf_algorithm
        if payload.kdf_iterations:
            vault.kdf_iterations = payload.kdf_iterations
        vault.updated_at = now
    else:
        vault = Vault(
            user_id=current_user.id,
            name=payload.name.strip(),
            encrypted_vault_key_envelope=payload.encrypted_vault_key_envelope,
            envelope_salt=payload.envelope_salt,
            envelope_iv=payload.envelope_iv,
            kdf_algorithm=payload.kdf_algorithm or "PBKDF2-SHA256",
            kdf_iterations=payload.kdf_iterations or 100000,
            created_at=now,
            updated_at=now,
        )
        db.add(vault)

    await db.flush()

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ENVELOPE_INITIALIZED",
            description=f"Vault key envelope saved for '{vault.name}'",
            ip_address=ip_address,
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(vault)

    total, docs, notes = await _get_vault_counts(db, vault.id)
    resp = VaultResponse.model_validate(vault)
    resp.total_items = total
    resp.documents_count = docs
    resp.notes_count = notes
    return resp


@router.get(
    "",
    response_model=VaultResponse,
    summary="Get the primary vault for the authenticated user",
)
async def get_primary_vault(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Vault).where(Vault.user_id == current_user.id).order_by(Vault.created_at.asc())
    res = await db.execute(query)
    vault = res.scalar_one_or_none()

    if vault is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No vault envelope found. Please create or initialize your vault.",
        )

    total, docs, notes = await _get_vault_counts(db, vault.id)
    resp = VaultResponse.model_validate(vault)
    resp.total_items = total
    resp.documents_count = docs
    resp.notes_count = notes
    return resp


@router.get(
    "/{vault_id:uuid}",
    response_model=VaultResponse,
    summary="Get a specific vault by ID",
)
async def get_vault_by_id(
    vault_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Vault).where(Vault.id == vault_id, Vault.user_id == current_user.id)
    res = await db.execute(query)
    vault = res.scalar_one_or_none()

    if vault is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault not found",
        )

    total, docs, notes = await _get_vault_counts(db, vault.id)
    resp = VaultResponse.model_validate(vault)
    resp.total_items = total
    resp.documents_count = docs
    resp.notes_count = notes
    return resp


@router.put(
    "/{vault_id:uuid}",
    response_model=VaultResponse,
    summary="Update vault metadata or key envelope",
)
async def update_vault(
    vault_id: uuid.UUID,
    payload: VaultUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Vault).where(Vault.id == vault_id, Vault.user_id == current_user.id)
    res = await db.execute(query)
    vault = res.scalar_one_or_none()

    if vault is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault not found",
        )

    if payload.name is not None:
        vault.name = payload.name.strip()
    if payload.encrypted_vault_key_envelope is not None:
        vault.encrypted_vault_key_envelope = payload.encrypted_vault_key_envelope
    if payload.envelope_salt is not None:
        vault.envelope_salt = payload.envelope_salt
    if payload.envelope_iv is not None:
        vault.envelope_iv = payload.envelope_iv
    if payload.kdf_algorithm is not None:
        vault.kdf_algorithm = payload.kdf_algorithm
    if payload.kdf_iterations is not None:
        vault.kdf_iterations = payload.kdf_iterations

    vault.updated_at = datetime.now(timezone.utc)
    db.add(vault)
    await db.commit()
    await db.refresh(vault)

    total, docs, notes = await _get_vault_counts(db, vault.id)
    resp = VaultResponse.model_validate(vault)
    resp.total_items = total
    resp.documents_count = docs
    resp.notes_count = notes
    return resp


# =========================================================================
# VAULT ITEMS ENDPOINTS (Scoped under /{vault_id})
# =========================================================================

@router.post(
    "/{vault_id:uuid}/items",
    response_model=VaultItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new encrypted item in a vault",
)
async def create_item_in_vault(
    vault_id: uuid.UUID,
    payload: VaultItemCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify vault ownership
    v_query = select(Vault).where(Vault.id == vault_id, Vault.user_id == current_user.id)
    v_res = await db.execute(v_query)
    vault = v_res.scalar_one_or_none()
    if vault is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault not found",
        )

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

    now = datetime.now(timezone.utc)
    item_title = (payload.title or "Encrypted Item").strip()
    item_type = (payload.item_type or "note").strip().lower()

    item = VaultItem(
        user_id=current_user.id,
        vault_id=vault.id,
        item_type=item_type,
        title=item_title,
        encrypted_title=payload.encrypted_title,
        encrypted_content=payload.encrypted_content,
        encryption_iv=payload.encryption_iv,
        mime_type=payload.mime_type,
        file_size=payload.file_size or payload.file_size_bytes,
        category=(payload.category or "Documents").strip(),
        encrypted_note=payload.encrypted_note,
        s3_key=payload.s3_key,
        original_filename=payload.original_filename,
        file_size_bytes=payload.file_size_bytes or payload.file_size,
        release_authorized=payload.release_authorized,
        assigned_contact_id=payload.assigned_contact_id,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    await db.flush()

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ITEM_CREATED",
            description=f"Created {item_type} in vault '{vault.name}'",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(item, attribute_names=["assigned_contact"])

    return VaultItemResponse.model_validate(item)


@router.get(
    "/{vault_id:uuid}/items",
    response_model=List[VaultItemResponse],
    summary="List all items inside a vault",
)
async def list_items_in_vault(
    vault_id: uuid.UUID,
    item_type: Optional[str] = Query(None, description="Filter by item type ('document' or 'note')"),
    category: Optional[str] = Query(None, description="Filter by category"),
    release_authorized: Optional[bool] = Query(None, description="Filter by release authorization"),
    search: Optional[str] = Query(None, description="Search query"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify vault ownership
    v_query = select(Vault).where(Vault.id == vault_id, Vault.user_id == current_user.id)
    v_res = await db.execute(v_query)
    if v_res.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault not found",
        )

    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(VaultItem.vault_id == vault_id, VaultItem.user_id == current_user.id)
    )

    if item_type is not None:
        query = query.where(VaultItem.item_type == item_type.lower())
    if category is not None:
        query = query.where(VaultItem.category == category)
    if release_authorized is not None:
        query = query.where(VaultItem.release_authorized == release_authorized)
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(VaultItem.title).like(term),
                func.lower(VaultItem.original_filename).like(term),
            )
        )

    query = query.order_by(VaultItem.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()
    return [VaultItemResponse.model_validate(item) for item in items]


@router.get(
    "/{vault_id:uuid}/items/{item_id:uuid}",
    response_model=VaultItemResponse,
    summary="Get a vault item by ID",
)
async def get_item_in_vault(
    vault_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(
            VaultItem.id == item_id,
            VaultItem.vault_id == vault_id,
            VaultItem.user_id == current_user.id,
        )
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )
    return VaultItemResponse.model_validate(item)


@router.put(
    "/{vault_id:uuid}/items/{item_id:uuid}",
    response_model=VaultItemResponse,
    summary="Update a vault item",
)
@router.patch(
    "/{vault_id:uuid}/items/{item_id:uuid}",
    response_model=VaultItemResponse,
    summary="Patch a vault item",
)
async def update_item_in_vault(
    vault_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: VaultItemUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(
            VaultItem.id == item_id,
            VaultItem.vault_id == vault_id,
            VaultItem.user_id == current_user.id,
        )
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vault item not found",
        )

    if payload.assigned_contact_id is not None:
        contact_query = select(TrustedContact).where(
            TrustedContact.id == payload.assigned_contact_id,
            TrustedContact.user_id == current_user.id,
        )
        contact_res = await db.execute(contact_query)
        if contact_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned contact not found",
            )
        item.assigned_contact_id = payload.assigned_contact_id

    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.item_type is not None:
        item.item_type = payload.item_type.strip().lower()
    if payload.encrypted_title is not None:
        item.encrypted_title = payload.encrypted_title
    if payload.encrypted_content is not None:
        item.encrypted_content = payload.encrypted_content
    if payload.encryption_iv is not None:
        item.encryption_iv = payload.encryption_iv
    if payload.mime_type is not None:
        item.mime_type = payload.mime_type
    if payload.file_size is not None:
        item.file_size = payload.file_size
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

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ITEM_UPDATED",
            description=f"Updated vault item: {item.title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(item, attribute_names=["assigned_contact"])

    return VaultItemResponse.model_validate(item)


@router.delete(
    "/{vault_id:uuid}/items/{item_id:uuid}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an item from a vault",
)
async def delete_item_in_vault(
    vault_id: uuid.UUID,
    item_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(VaultItem).where(
        VaultItem.id == item_id,
        VaultItem.vault_id == vault_id,
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

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ITEM_DELETED",
            description=f"Deleted vault item: {title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# =========================================================================
# BACKWARD-COMPATIBLE ENDPOINTS (/items and /items/{item_id})
# =========================================================================

@router.post(
    "/items",
    response_model=VaultItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new vault item (legacy endpoint)",
)
async def create_vault_item(
    payload: VaultItemCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Auto-associate with primary vault if one exists
    v_query = select(Vault).where(Vault.user_id == current_user.id).order_by(Vault.created_at.asc())
    v_res = await db.execute(v_query)
    vault = v_res.scalar_one_or_none()

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

    now = datetime.now(timezone.utc)
    item = VaultItem(
        user_id=current_user.id,
        vault_id=vault.id if vault else None,
        item_type=(payload.item_type or "note").strip().lower(),
        title=(payload.title or "Encrypted Item").strip(),
        encrypted_title=payload.encrypted_title,
        encrypted_content=payload.encrypted_content,
        encryption_iv=payload.encryption_iv,
        mime_type=payload.mime_type,
        file_size=payload.file_size or payload.file_size_bytes,
        category=(payload.category or "Documents").strip(),
        encrypted_note=payload.encrypted_note,
        s3_key=payload.s3_key,
        original_filename=payload.original_filename,
        file_size_bytes=payload.file_size_bytes or payload.file_size,
        release_authorized=payload.release_authorized,
        assigned_contact_id=payload.assigned_contact_id,
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    await db.flush()

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ITEM_CREATED",
            description=f"Created vault item: {item.title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(item, attribute_names=["assigned_contact"])

    return VaultItemResponse.model_validate(item)


@router.get(
    "/items",
    response_model=List[VaultItemResponse],
    summary="List all vault items for the authenticated user (legacy endpoint)",
)
async def list_vault_items(
    category: Optional[str] = Query(None, description="Filter by category"),
    item_type: Optional[str] = Query(None, description="Filter by item type"),
    release_authorized: Optional[bool] = Query(None, description="Filter by release authorization"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(VaultItem.user_id == current_user.id)
    )

    if category is not None:
        query = query.where(VaultItem.category == category)
    if item_type is not None:
        query = query.where(VaultItem.item_type == item_type.lower())
    if release_authorized is not None:
        query = query.where(VaultItem.release_authorized == release_authorized)

    query = query.order_by(VaultItem.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()
    return [VaultItemResponse.model_validate(item) for item in items]


@router.get(
    "/items/{item_id}",
    response_model=VaultItemResponse,
    summary="Get vault item details by ID (legacy endpoint)",
)
async def get_vault_item(
    item_id: uuid.UUID,
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

    return VaultItemResponse.model_validate(item)


@router.patch(
    "/items/{item_id}",
    response_model=VaultItemResponse,
    summary="Update vault item metadata (legacy endpoint)",
)
@router.put(
    "/items/{item_id}",
    response_model=VaultItemResponse,
    summary="Update vault item metadata (legacy endpoint)",
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

    if payload.assigned_contact_id is not None:
        contact_query = select(TrustedContact).where(
            TrustedContact.id == payload.assigned_contact_id,
            TrustedContact.user_id == current_user.id,
        )
        contact_res = await db.execute(contact_query)
        if contact_res.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned contact not found",
            )
        item.assigned_contact_id = payload.assigned_contact_id

    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.item_type is not None:
        item.item_type = payload.item_type.strip().lower()
    if payload.encrypted_title is not None:
        item.encrypted_title = payload.encrypted_title
    if payload.encrypted_content is not None:
        item.encrypted_content = payload.encrypted_content
    if payload.encryption_iv is not None:
        item.encryption_iv = payload.encryption_iv
    if payload.mime_type is not None:
        item.mime_type = payload.mime_type
    if payload.file_size is not None:
        item.file_size = payload.file_size
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

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ITEM_UPDATED",
            description=f"Updated vault item: {item.title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(item, attribute_names=["assigned_contact"])

    return VaultItemResponse.model_validate(item)


@router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a vault item (legacy endpoint)",
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

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="VAULT_ITEM_DELETED",
            description=f"Deleted vault item: {title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()

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

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="CONTACT_ASSIGNED_TO_ITEM",
            description=f"Assigned {contact.name} to vault item {item.title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(item, attribute_names=["assigned_contact"])

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

        try:
            await record_audit_log(
                session=db,
                user_id=current_user.id,
                event_type="VAULT",
                action="CONTACT_UNASSIGNED_FROM_ITEM",
                description=f"Unassigned contact from vault item {item.title}",
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
            )
        except Exception:
            pass

        await db.commit()
        await db.refresh(item, attribute_names=["assigned_contact"])

    return VaultItemResponse.model_validate(item)
