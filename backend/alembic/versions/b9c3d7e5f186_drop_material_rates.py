"""drop material rates

Materials are no longer priced: the cost of each material on a contract is typed in by the user.
So the rate and its unit go from `materials`, and the snapshot of them from `contract_materials`.
The cost already stored on each contract line is untouched.

Revision ID: b9c3d7e5f186
Revises: a8b2c6d4e075
Create Date: 2026-10-08 10:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b9c3d7e5f186"
down_revision: Union[str, Sequence[str], None] = "a8b2c6d4e075"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("rate_unit")
        batch_op.drop_column("rate")
    with op.batch_alter_table("materials", schema=None) as batch_op:
        batch_op.drop_column("rate_unit")
        batch_op.drop_column("rate")


def downgrade() -> None:
    # The old prices are gone for good; the columns come back empty (0 / "Per Piece").
    with op.batch_alter_table("materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("rate", sa.Numeric(precision=12, scale=2, asdecimal=False), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("rate_unit", sa.String(length=40), server_default="Per Piece", nullable=False))
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("rate", sa.Numeric(precision=12, scale=2, asdecimal=False), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("rate_unit", sa.String(length=40), server_default="Per Piece", nullable=False))
