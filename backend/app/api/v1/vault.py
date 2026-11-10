import base64
from datetime import datetime, timezone
import json
import logging
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
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
from app.services.s3_service import (
    delete_encrypted_file,
    download_encrypted_file,
    get_s3_object_key,
    upload_encrypted_file,
)

logger = logging.getLogger(__name__)

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
    s3_key = item.s3_key

    # Delete encrypted binary object from S3 if present
    if s3_key:
        try:
            delete_encrypted_file(s3_key)
        except Exception as e:
            logger.warning(f"Failed to delete S3 file for vault item {item.id} ({s3_key}): {e}")

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
    s3_key = item.s3_key

    # Delete encrypted binary object from S3 if present
    if s3_key:
        try:
            delete_encrypted_file(s3_key)
        except Exception as e:
            logger.warning(f"Failed to delete S3 file for vault item {item.id} ({s3_key}): {e}")

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


# =========================================================================
# S3 ENCRYPTED FILE STORAGE ENDPOINTS
# =========================================================================

MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB limit


async def _handle_file_upload(
    item_id: uuid.UUID,
    request: Request,
    current_user: User,
    db: AsyncSession,
    file: Optional[UploadFile] = None,
) -> VaultItemResponse:
    """Core logic to authenticate, validate, and store encrypted bytes in S3."""
    query = (
        select(VaultItem)
        .options(selectinload(VaultItem.assigned_contact))
        .where(
            VaultItem.id == item_id,
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

    content_type_header = request.headers.get("content-type", "")
    file_data: bytes = b""
    detected_mime: Optional[str] = item.mime_type

    if file is not None:
        file_data = await file.read()
        detected_mime = file.content_type or detected_mime
    elif "multipart/form-data" in content_type_header:
        form = await request.form()
        uploaded = form.get("file")
        if uploaded is not None and hasattr(uploaded, "read"):
            file_data = await uploaded.read()
            detected_mime = getattr(uploaded, "content_type", detected_mime)
        elif uploaded is not None and isinstance(uploaded, (bytes, bytearray)):
            file_data = bytes(uploaded)
    elif "application/json" in content_type_header:
        try:
            body = await request.json()
            raw_cipher = body.get("ciphertext") or body.get("encrypted_content")
            if raw_cipher:
                file_data = base64.b64decode(raw_cipher)
            if body.get("encryption_iv"):
                item.encryption_iv = body.get("encryption_iv")
            if body.get("mime_type"):
                detected_mime = body.get("mime_type")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON payload: {str(e)}",
            )
    else:
        # Raw binary body
        file_data = await request.body()

    if not file_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Encrypted file payload is empty",
        )

    if len(file_data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB",
        )

    # Server-generated isolated S3 key: users/{user_id}/items/{item_id}
    s3_key = get_s3_object_key(str(current_user.id), str(item.id))

    try:
        upload_encrypted_file(
            s3_key=s3_key,
            file_data=file_data,
            content_type="application/octet-stream",
        )
    except Exception as exc:
        logger.error(f"S3 upload failed for item {item.id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist encrypted document to storage: {str(exc)}",
        )

    now = datetime.now(timezone.utc)
    item.s3_key = s3_key
    item.file_size_bytes = len(file_data)
    item.file_size = len(file_data)
    if detected_mime:
        item.mime_type = detected_mime
    item.encrypted_content = None  # Clean duplicate large binary from PostgreSQL
    item.updated_at = now

    db.add(item)
    await db.flush()

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="DOCUMENT_UPLOADED_TO_S3",
            description=f"Encrypted document uploaded for item {item.title} ({len(file_data)} bytes)",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except Exception:
        pass

    await db.commit()
    await db.refresh(item, attribute_names=["assigned_contact"])

    return VaultItemResponse.model_validate(item)


async def _handle_file_download(
    item_id: uuid.UUID,
    request: Request,
    current_user: User,
    db: AsyncSession,
) -> Response:
    """Core logic to authenticate, authorize, and fetch encrypted ciphertext."""
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

    file_bytes: Optional[bytes] = None
    content_type = item.mime_type or "application/octet-stream"

    # 1. Fetch from S3 if s3_key is set
    if item.s3_key:
        try:
            file_bytes, s3_ct = download_encrypted_file(item.s3_key)
            if s3_ct and not item.mime_type:
                content_type = s3_ct
        except FileNotFoundError:
            logger.warning(f"S3 key {item.s3_key} not found on S3; checking fallback.")
        except Exception as exc:
            logger.error(f"S3 download failed for {item.s3_key}: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Storage retrieval error: {str(exc)}",
            )

    # 2. Backward compatibility fallback for legacy items in database
    if file_bytes is None and item.encrypted_content:
        raw = item.encrypted_content
        if raw.startswith("{"):
            try:
                parsed = json.loads(raw)
                cipher = parsed.get("ciphertext")
                if cipher:
                    file_bytes = base64.b64decode(cipher)
                    if not item.encryption_iv and parsed.get("iv"):
                        item.encryption_iv = parsed.get("iv")
            except Exception:
                pass
        if file_bytes is None:
            file_bytes = raw.encode("utf-8")

    if file_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No encrypted file content found for this vault item",
        )

    filename = item.original_filename or item.title or "encrypted_file.bin"
    iv_header = item.encryption_iv or ""

    try:
        await record_audit_log(
            session=db,
            user_id=current_user.id,
            event_type="VAULT",
            action="DOCUMENT_DOWNLOADED_FROM_S3",
            description=f"Encrypted document retrieved: {item.title}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
        await db.commit()
    except Exception:
        pass

    return Response(
        content=file_bytes,
        media_type="application/octet-stream",
        headers={
            "X-Encryption-IV": iv_header,
            "X-Original-Filename": filename,
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "X-Encryption-IV, X-Original-Filename, Content-Disposition",
        },
    )


@router.put(
    "/items/{item_id}/file",
    response_model=VaultItemResponse,
    summary="Upload encrypted document binary to S3 (legacy/unscoped path)",
)
async def upload_item_file_unscoped(
    item_id: uuid.UUID,
    request: Request,
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_file_upload(item_id, request, current_user, db, file)


@router.get(
    "/items/{item_id}/file",
    summary="Download encrypted document binary from S3 (legacy/unscoped path)",
)
async def download_item_file_unscoped(
    item_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_file_download(item_id, request, current_user, db)


@router.put(
    "/{vault_id:uuid}/items/{item_id:uuid}/file",
    response_model=VaultItemResponse,
    summary="Upload encrypted document binary to S3 (vault-scoped path)",
)
async def upload_item_file_scoped(
    vault_id: uuid.UUID,
    item_id: uuid.UUID,
    request: Request,
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_file_upload(item_id, request, current_user, db, file)


@router.get(
    "/{vault_id:uuid}/items/{item_id:uuid}/file",
    summary="Download encrypted document binary from S3 (vault-scoped path)",
)
async def download_item_file_scoped(
    vault_id: uuid.UUID,
    item_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _handle_file_download(item_id, request, current_user, db)
