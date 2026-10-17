"""return destination

Where the materials that came back went when a contract was concluded: back to the yard, or moved to another site.

Revision ID: a2b5c8d1e063
Revises: f1a4b7c2d950
Create Date: 2026-10-09 16:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b5c8d1e063"
down_revision: Union[str, Sequence[str], None] = "f1a4b7c2d950"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("return_destination", sa.String(length=30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("return_destination")
