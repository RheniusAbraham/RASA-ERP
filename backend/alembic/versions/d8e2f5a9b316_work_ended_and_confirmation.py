"""work ended on, extension confirmation

A contract is concluded on the day the work really ended (which can be earlier than the day the user clicked),
and the user can confirm that the work is still running past the end date. Concluded contracts that exist
get their conclusion day as the day the work ended.

Revision ID: d8e2f5a9b316
Revises: c7d1e4f8a025
Create Date: 2026-10-09 09:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e2f5a9b316"
down_revision: Union[str, Sequence[str], None] = "c7d1e4f8a025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("work_ended_on", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("extension_confirmed_until", sa.Date(), nullable=True))
    op.execute("UPDATE contracts SET work_ended_on = date(concluded_at) WHERE status = 'Concluded' AND concluded_at IS NOT NULL")


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("extension_confirmed_until")
        batch_op.drop_column("work_ended_on")
