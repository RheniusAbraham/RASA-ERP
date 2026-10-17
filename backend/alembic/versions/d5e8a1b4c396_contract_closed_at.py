"""contract closed_at

A concluded contract is closed for good as the last phase.

Revision ID: d5e8a1b4c396
Revises: c4d7e0a3f285
Create Date: 2026-10-09 22:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e8a1b4c396"
down_revision: Union[str, Sequence[str], None] = "c4d7e0a3f285"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("closed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    # A closed contract goes back to Concluded so the old statuses still make sense
    op.execute("UPDATE contracts SET status = 'Concluded' WHERE status = 'Closed'")
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("closed_at")
