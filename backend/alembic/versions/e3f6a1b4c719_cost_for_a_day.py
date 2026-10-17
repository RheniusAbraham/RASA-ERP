"""cost for a day

Each contract now stores its cost for one day (estimated cost / (months x 30 + days)) and, once
dispatched, the same for the updated final cost. Contracts that already exist are filled in here.

Revision ID: e3f6a1b4c719
Revises: d2e5f9a3b608
Create Date: 2026-10-08 16:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3f6a1b4c719"
down_revision: Union[str, Sequence[str], None] = "d2e5f9a3b608"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("daily_cost", sa.Numeric(precision=14, scale=2, asdecimal=False), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("final_daily_cost", sa.Numeric(precision=14, scale=2, asdecimal=False), nullable=True))
    # Fill in the contracts that already exist (a contract always has at least one day, so no division by zero)
    op.execute("UPDATE contracts SET daily_cost = ROUND(estimated_cost * 1.0 / (months * 30 + days), 2) WHERE months * 30 + days > 0")
    op.execute(
        "UPDATE contracts SET final_daily_cost = ROUND(final_cost * 1.0 / (months * 30 + days), 2) "
        "WHERE final_cost IS NOT NULL AND months * 30 + days > 0"
    )


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("final_daily_cost")
        batch_op.drop_column("daily_cost")
