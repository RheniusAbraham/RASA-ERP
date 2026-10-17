"""final transportation cost

Dispatch now also records the updated final cost of transportation. Empty until dispatched.

Revision ID: d2e5f9a3b608
Revises: c1d4e8f2a597
Create Date: 2026-10-08 14:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2e5f9a3b608"
down_revision: Union[str, Sequence[str], None] = "c1d4e8f2a597"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("final_transportation_cost", sa.Numeric(precision=14, scale=2, asdecimal=False), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("final_transportation_cost")
