from datetime import datetime, timezone
import secrets
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, get_db
from app.models.contact import TrustedContact
from app.models.user import User
from app.schemas.contact import (
    ContactCreate,
    ContactResponse,
    ContactUpdate,
    ContactVerifyRequest,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/contacts", tags=["Trusted Contacts"])


@router.post(
    "",
    response_model=ContactResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new trusted contact",
)
async def create_contact(
    payload: ContactCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address = get_client_ip(request)
    verification_token = secrets.token_urlsafe(32)

    contact = TrustedContact(
        user_id=current_user.id,
        name=payload.name.strip(),
        email=payload.email.lower().strip(),
        relationship_type=payload.relationship_type.strip() if payload.relationship_type else None,
        phone=payload.phone.strip() if payload.phone else None,
        verified=False,
        verification_token=verification_token,
    )
    db.add(contact)
    await db.flush()

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="CONTACT",
        action="CONTACT_CREATED",
        description=f"Added trusted contact: {contact.name} ({contact.email})",
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
    )

    return ContactResponse.model_validate(contact)


@router.get(
    "",
    response_model=List[ContactResponse],
    summary="List all trusted contacts for the current user",
)
async def list_contacts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Strictly scoped to current_user.id
    query = (
        select(TrustedContact)
        .where(TrustedContact.user_id == current_user.id)
        .order_by(TrustedContact.created_at.desc())
    )
    result = await db.execute(query)
    contacts = result.scalars().all()
    return [ContactResponse.model_validate(c) for c in contacts]


@router.get(
    "/{contact_id}",
    response_model=ContactResponse,
    summary="Get contact details by ID",
)
async def get_contact(
    contact_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Strictly scoped to current_user.id - prevents IDOR
    query = select(TrustedContact).where(
        TrustedContact.id == contact_id,
        TrustedContact.user_id == current_user.id,
    )
    result = await db.execute(query)
    contact = result.scalar_one_or_none()

    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    return ContactResponse.model_validate(contact)


@router.patch(
    "/{contact_id}",
    response_model=ContactResponse,
    summary="Update contact details",
)
async def update_contact(
    contact_id: uuid.UUID,
    payload: ContactUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TrustedContact).where(
        TrustedContact.id == contact_id,
        TrustedContact.user_id == current_user.id,
    )
    result = await db.execute(query)
    contact = result.scalar_one_or_none()

    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    if payload.name is not None:
        contact.name = payload.name.strip()
    if payload.email is not None:
        new_email = payload.email.lower().strip()
        if new_email != contact.email:
            contact.email = new_email
            contact.verified = False
            contact.verification_token = secrets.token_urlsafe(32)
    if payload.relationship_type is not None:
        contact.relationship_type = payload.relationship_type.strip()
    if payload.phone is not None:
        contact.phone = payload.phone.strip()

    contact.updated_at = datetime.now(timezone.utc)
    db.add(contact)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="CONTACT",
        action="CONTACT_UPDATED",
        description=f"Updated contact {contact.name}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return ContactResponse.model_validate(contact)


@router.delete(
    "/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a trusted contact",
)
async def delete_contact(
    contact_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TrustedContact).where(
        TrustedContact.id == contact_id,
        TrustedContact.user_id == current_user.id,
    )
    result = await db.execute(query)
    contact = result.scalar_one_or_none()

    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    contact_name = contact.name
    await db.delete(contact)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="CONTACT",
        action="CONTACT_DELETED",
        description=f"Deleted contact {contact_name}",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{contact_id}/verify",
    response_model=ContactResponse,
    summary="Verify contact email address",
)
async def verify_contact(
    contact_id: uuid.UUID,
    request: Request,
    payload: Optional[ContactVerifyRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(TrustedContact).where(
        TrustedContact.id == contact_id,
        TrustedContact.user_id == current_user.id,
    )
    result = await db.execute(query)
    contact = result.scalar_one_or_none()

    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    # If token was supplied, verify it matches
    if payload and payload.token:
        if contact.verification_token != payload.token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token",
            )

    contact.verified = True
    contact.updated_at = datetime.now(timezone.utc)
    db.add(contact)

    await record_audit_log(
        session=db,
        user_id=current_user.id,
        event_type="CONTACT",
        action="CONTACT_VERIFIED",
        description=f"Verified contact {contact.name} ({contact.email})",
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return ContactResponse.model_validate(contact)

