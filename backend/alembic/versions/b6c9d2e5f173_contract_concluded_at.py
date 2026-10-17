"""contract concluded_at

A deployed contract can be concluded (the work is finished and the contract closed).

Revision ID: b6c9d2e5f173
Revises: a5b8c1d4e962
Create Date: 2026-10-08 22:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b6c9d2e5f173"
down_revision: Union[str, Sequence[str], None] = "a5b8c1d4e962"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("concluded_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    # A concluded contract goes back to Deployed so the old statuses still make sense
    op.execute("UPDATE contracts SET status = 'Deployed' WHERE status = 'Concluded'")
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("concluded_at")
