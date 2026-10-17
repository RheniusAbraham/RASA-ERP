"""planned start date

A contract deployed before its start date really started early: its start date becomes the day it was
deployed and the planned date is kept here. Contracts already deployed early are corrected the same way.

Revision ID: a5b8c1d4e962
Revises: f4a7b2c5d830
Create Date: 2026-10-08 20:00:00

"""
import calendar
from datetime import date, timedelta
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a5b8c1d4e962"
down_revision: Union[str, Sequence[str], None] = "f4a7b2c5d830"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_months(d: date, n: int) -> date:
    index = d.month - 1 + n
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def _day(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def upgrade() -> None:
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("planned_start_date", sa.Date(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, start_date, months, days, deployed_at FROM contracts WHERE status = 'Deployed' AND deployed_at IS NOT NULL")
    ).all()
    for contract_id, start, months, days, deployed_at in rows:
        planned, actual = _day(start), _day(deployed_at)
        if actual >= planned:
            continue  # deployed on or after its start date: nothing to correct
        end = _add_months(actual, months) + timedelta(days=days - 1)
        connection.execute(
            sa.text("UPDATE contracts SET planned_start_date = :planned, start_date = :actual, end_date = :end WHERE id = :id"),
            {"planned": planned.isoformat(), "actual": actual.isoformat(), "end": end.isoformat(), "id": contract_id},
        )


def downgrade() -> None:
    # Put the planned start dates back so the old data still makes sense, then drop the column.
    op.execute("UPDATE contracts SET start_date = planned_start_date WHERE planned_start_date IS NOT NULL")
    with op.batch_alter_table("contracts", schema=None) as batch_op:
        batch_op.drop_column("planned_start_date")
