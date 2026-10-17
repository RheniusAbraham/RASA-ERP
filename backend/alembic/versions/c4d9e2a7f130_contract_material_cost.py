"""contract material cost

Each material on a contract now stores its own estimated cost, because the user can type over
the suggested figure. Lines that already exist get rate x quantity as a starting value.

Revision ID: c4d9e2a7f130
Revises: 07826055ef25
Create Date: 2026-10-07 12:10:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d9e2a7f130"
down_revision: Union[str, Sequence[str], None] = "07826055ef25"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("cost", sa.Numeric(precision=14, scale=2, asdecimal=False), server_default="0", nullable=False)
        )
    op.execute("UPDATE contract_materials SET cost = rate * quantity")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("cost")
