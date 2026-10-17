"""dispatch details

When a contract is dispatched we record how many of each material were really sent, the updated
final cost and the loading/unloading charges. All empty until then.

Revision ID: e6f9a4c1b352
Revises: d5e8f3b9a241
Create Date: 2026-10-07 16:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6f9a4c1b352"
down_revision: Union[str, Sequence[str], None] = "d5e8f3b9a241"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("dispatched_quantity", sa.Integer(), nullable=True))
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("final_cost", sa.Numeric(precision=14, scale=2, asdecimal=False), nullable=True))
        batch_op.add_column(sa.Column("loading_charges", sa.Numeric(precision=14, scale=2, asdecimal=False), nullable=True))
    # Dispatching now needs these details, so contracts marked dispatched before this existed go back to Estimated
    op.execute("UPDATE contracts SET status = 'Estimated', dispatched_at = NULL WHERE status = 'Dispatched'")


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("loading_charges")
        batch_op.drop_column("final_cost")
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("dispatched_quantity")
