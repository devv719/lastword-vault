"""Add Vault and extended VaultItem encryption fields

Revision ID: 002_vault_management
Revises: 001_initial_schema
Create Date: 2026-11-10 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_vault_management'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create vaults table
    op.create_table(
        'vaults',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False, server_default='Primary Vault'),
        sa.Column('encrypted_vault_key_envelope', sa.Text(), nullable=False),
        sa.Column('envelope_salt', sa.String(length=255), nullable=False),
        sa.Column('envelope_iv', sa.String(length=255), nullable=False),
        sa.Column('kdf_algorithm', sa.String(length=50), nullable=False, server_default='PBKDF2-SHA256'),
        sa.Column('kdf_iterations', sa.Integer(), nullable=False, server_default='100000'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_vaults_user_id'), 'vaults', ['user_id'], unique=False)

    # 2. Add new columns to vault_items table
    op.add_column('vault_items', sa.Column('vault_id', sa.Uuid(), nullable=True))
    op.add_column('vault_items', sa.Column('item_type', sa.String(length=50), nullable=False, server_default='note'))
    op.add_column('vault_items', sa.Column('encrypted_title', sa.Text(), nullable=True))
    op.add_column('vault_items', sa.Column('encrypted_content', sa.Text(), nullable=True))
    op.add_column('vault_items', sa.Column('encryption_iv', sa.String(length=255), nullable=True))
    op.add_column('vault_items', sa.Column('mime_type', sa.String(length=128), nullable=True))
    op.add_column('vault_items', sa.Column('file_size', sa.BigInteger(), nullable=True))

    op.create_index(op.f('ix_vault_items_vault_id'), 'vault_items', ['vault_id'], unique=False)
    op.create_foreign_key(
        'fk_vault_items_vault_id',
        'vault_items',
        'vaults',
        ['vault_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('fk_vault_items_vault_id', 'vault_items', type_='foreignkey')
    op.drop_index(op.f('ix_vault_items_vault_id'), table_name='vault_items')
    op.drop_column('vault_items', 'file_size')
    op.drop_column('vault_items', 'mime_type')
    op.drop_column('vault_items', 'encryption_iv')
    op.drop_column('vault_items', 'encrypted_content')
    op.drop_column('vault_items', 'encrypted_title')
    op.drop_column('vault_items', 'item_type')
    op.drop_column('vault_items', 'vault_id')

    op.drop_index(op.f('ix_vaults_user_id'), table_name='vaults')
    op.drop_table('vaults')

