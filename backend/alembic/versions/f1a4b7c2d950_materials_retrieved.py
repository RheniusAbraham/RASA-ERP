"""materials retrieved

When a contract is concluded, how many of each material came back in good condition and how many damaged.

Revision ID: f1a4b7c2d950
Revises: e9f3a6b1c427
Create Date: 2026-10-09 15:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a4b7c2d950"
down_revision: Union[str, Sequence[str], None] = "e9f3a6b1c427"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("retrieved_intact", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("retrieved_damaged", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("retrieved_damaged")
        batch_op.drop_column("retrieved_intact")
