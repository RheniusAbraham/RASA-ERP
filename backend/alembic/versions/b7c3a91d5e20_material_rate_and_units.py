"""material rate and units

Replaces the fixed "cost per piece" with a rate plus the unit it is charged per
("Per Square Foot", "Per Day" ...) and adds the unit the quantity is counted in.
Existing materials keep their price: it becomes the rate, charged "Per Piece", and
their quantity is counted in "pcs".

Revision ID: b7c3a91d5e20
Revises: e47f6d2b21ae
Create Date: 2026-10-07 10:30:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7c3a91d5e20"
down_revision: Union[str, Sequence[str], None] = "e47f6d2b21ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("materials", schema=None) as batch_op:
        # A rename (not drop + add), so existing prices carry over
        batch_op.alter_column(
            "cost_per_piece",
            new_column_name="rate",
            existing_type=sa.Numeric(precision=12, scale=2, asdecimal=False),
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("rate_unit", sa.String(length=40), server_default="Per Piece", nullable=False))
        batch_op.add_column(sa.Column("quantity_unit", sa.String(length=40), server_default="pcs", nullable=False))


def downgrade() -> None:
    """Downgrade schema. Units are lost (everything goes back to being a per-piece cost)."""
    with op.batch_alter_table("materials", schema=None) as batch_op:
        batch_op.drop_column("quantity_unit")
        batch_op.drop_column("rate_unit")
        batch_op.alter_column(
            "rate",
            new_column_name="cost_per_piece",
            existing_type=sa.Numeric(precision=12, scale=2, asdecimal=False),
            existing_nullable=False,
        )
