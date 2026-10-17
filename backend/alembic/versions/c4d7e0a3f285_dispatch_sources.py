"""dispatch sources

Where the units of a contract's material were taken from when they were dispatched: the yard, or a lot of free
units waiting at another site. Contracts that were already dispatched are recorded as taken from the yard.

Revision ID: c4d7e0a3f285
Revises: b3c6d9e2f174
Create Date: 2026-10-09 20:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4d7e0a3f285"
down_revision: Union[str, Sequence[str], None] = "b3c6d9e2f174"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NOW = sa.text("(CURRENT_TIMESTAMP)")


def upgrade() -> None:
    op.create_table(
        "contract_material_sources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["stock_lots.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("contract_material_sources", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_contract_material_sources_contract_id"), ["contract_id"], unique=False)

    # Every line that was already dispatched came from the yard (there was no other source before this).
    op.execute(
        "INSERT INTO contract_material_sources (contract_id, material_id, lot_id, label, quantity) "
        "SELECT cm.contract_id, cm.material_id, NULL, 'Yard', cm.dispatched_quantity "
        "FROM contract_materials cm WHERE cm.dispatched_quantity IS NOT NULL AND cm.dispatched_quantity > 0"
    )


def downgrade() -> None:
    with op.batch_alter_table("contract_material_sources", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_contract_material_sources_contract_id"))
    op.drop_table("contract_material_sources")
