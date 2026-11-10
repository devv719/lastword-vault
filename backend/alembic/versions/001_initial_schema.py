"""Initial database schema for LastWord Dead Man's Switch Vault

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        'users',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=False),
        sa.Column(
            'status',
            sa.Enum('ACTIVE', 'WARNED', 'GRACE', 'RELEASED', name='user_status'),
            nullable=False,
            server_default='ACTIVE',
        ),
        sa.Column('checkin_interval_hours', sa.Integer(), nullable=False, server_default='72'),
        sa.Column('grace_period_hours', sa.Integer(), nullable=False, server_default='24'),
        sa.Column('last_checkin_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('warned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('grace_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('demo_mode', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('pending_email', sa.String(length=255), nullable=True),
        sa.Column('email_verification_token', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

    # 2. trusted_contacts
    op.create_table(
        'trusted_contacts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('relationship_type', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('verification_token', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_trusted_contacts_user_id'), 'trusted_contacts', ['user_id'], unique=False)

    # 3. vault_items
    op.create_table(
        'vault_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True, server_default='Documents'),
        sa.Column('encrypted_note', sa.Text(), nullable=True),
        sa.Column('s3_key', sa.String(length=512), nullable=True),
        sa.Column('original_filename', sa.String(length=255), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('release_authorized', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('assigned_contact_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_contact_id'], ['trusted_contacts.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vault_items_user_id'), 'vault_items', ['user_id'], unique=False)
    op.create_index(op.f('ix_vault_items_assigned_contact_id'), 'vault_items', ['assigned_contact_id'], unique=False)

    # 4. checkin_records
    op.create_table(
        'checkin_records',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('token', sa.String(length=128), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False, server_default='manual'),
        sa.Column('used', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_checkin_records_user_id'), 'checkin_records', ['user_id'], unique=False)
    op.create_index(op.f('ix_checkin_records_token'), 'checkin_records', ['token'], unique=False)

    # 5. audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_event_type'), 'audit_logs', ['event_type'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)

    # 6. revoked_tokens (session logout tracking)
    op.create_table(
        'revoked_tokens',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('jti', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_revoked_tokens_jti'), 'revoked_tokens', ['jti'], unique=True)
    op.create_index(op.f('ix_revoked_tokens_user_id'), 'revoked_tokens', ['user_id'], unique=False)

    # 7. vault_item_recipients
    op.create_table(
        'vault_item_recipients',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('vault_item_id', sa.Uuid(), nullable=False),
        sa.Column('contact_id', sa.Uuid(), nullable=False),
        sa.Column('download_token', sa.String(length=128), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('downloaded', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['contact_id'], ['trusted_contacts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vault_item_id'], ['vault_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vault_item_id', 'contact_id', name='uq_vault_item_contact'),
    )
    op.create_index(op.f('ix_vault_item_recipients_vault_item_id'), 'vault_item_recipients', ['vault_item_id'], unique=False)
    op.create_index(op.f('ix_vault_item_recipients_contact_id'), 'vault_item_recipients', ['contact_id'], unique=False)
    op.create_index(op.f('ix_vault_item_recipients_download_token'), 'vault_item_recipients', ['download_token'], unique=True)


def downgrade() -> None:
    op.drop_table('vault_item_recipients')
    op.drop_table('revoked_tokens')
    op.drop_table('audit_logs')
    op.drop_table('checkin_records')
    op.drop_table('vault_items')
    op.drop_table('trusted_contacts')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS user_status')

