"""contract deployed_at

When the work on site officially starts a dispatched contract becomes "Deployed".

Revision ID: a8b2c6d4e075
Revises: f7a1b5d2c463
Create Date: 2026-10-07 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8b2c6d4e075"
down_revision: Union[str, Sequence[str], None] = "f7a1b5d2c463"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("deployed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("deployed_at")
