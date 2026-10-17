"""drop contract line cost

The cost of an individual material on a contract is no longer entered: the contract has one
"materials cost" figure instead (already stored on the contract itself, so nothing is lost there).

Revision ID: c1d4e8f2a597
Revises: b9c3d7e5f186
Create Date: 2026-10-08 12:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1d4e8f2a597"
down_revision: Union[str, Sequence[str], None] = "b9c3d7e5f186"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("cost")


def downgrade() -> None:
    # The per-material figures are gone for good; the column comes back as 0.
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("cost", sa.Numeric(precision=14, scale=2, asdecimal=False), server_default="0", nullable=False))
