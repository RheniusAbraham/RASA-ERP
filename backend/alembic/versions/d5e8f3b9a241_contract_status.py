"""contract status

Contracts start as "Estimated" and become "Dispatched" once the materials are sent to the site.
Existing contracts stay "Estimated".

Revision ID: d5e8f3b9a241
Revises: c4d9e2a7f130
Create Date: 2026-10-07 14:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e8f3b9a241"
down_revision: Union[str, Sequence[str], None] = "c4d9e2a7f130"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(length=20), server_default="Estimated", nullable=False))
        batch_op.add_column(sa.Column("dispatched_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("dispatched_at")
        batch_op.drop_column("status")
