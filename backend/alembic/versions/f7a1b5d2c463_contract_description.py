"""contract description

Free-text notes about a contract's estimate. Existing contracts get an empty note.

Revision ID: f7a1b5d2c463
Revises: e6f9a4c1b352
Create Date: 2026-10-07 17:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a1b5d2c463"
down_revision: Union[str, Sequence[str], None] = "e6f9a4c1b352"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("description", sa.Text(), server_default="", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("description")
