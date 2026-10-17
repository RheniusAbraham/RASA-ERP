"""contract end date

Each contract now stores its last day (start date + time period, the start date counting as day 1).
Contracts that already exist are filled in here with the same calendar rules the API uses.

Revision ID: f4a7b2c5d830
Revises: e3f6a1b4c719
Create Date: 2026-10-08 18:00:00

"""
import calendar
from datetime import date, timedelta
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4a7b2c5d830"
down_revision: Union[str, Sequence[str], None] = "e3f6a1b4c719"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_months(d: date, n: int) -> date:
    """Adds calendar months, clamping to the last day (31 Jan + 1 month = 28/29 Feb)."""
    index = d.month - 1 + n
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def upgrade() -> None:
    # Added as nullable first so the rows that exist can be filled in, then made required.
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("end_date", sa.Date(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, start_date, months, days FROM contracts")).all()
    for contract_id, start, months, days in rows:
        start_day = start if isinstance(start, date) else date.fromisoformat(str(start)[:10])
        end = _add_months(start_day, months) + timedelta(days=days - 1)
        connection.execute(
            sa.text("UPDATE contracts SET end_date = :end WHERE id = :id"), {"end": end.isoformat(), "id": contract_id}
        )

    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.alter_column("end_date", existing_type=sa.Date(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("end_date")
