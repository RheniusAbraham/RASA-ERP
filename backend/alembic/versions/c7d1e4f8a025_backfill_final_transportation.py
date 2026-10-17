"""backfill final transportation cost

Contracts dispatched before the dispatch form asked for the updated transportation cost have none stored.
Their updated final cost was worked out from the estimated transportation, so that is the value filled in.

Revision ID: c7d1e4f8a025
Revises: b6c9d2e5f173
Create Date: 2026-10-08 23:30:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = "c7d1e4f8a025"
down_revision: Union[str, Sequence[str], None] = "b6c9d2e5f173"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE contracts SET final_transportation_cost = transportation_cost "
        "WHERE final_transportation_cost IS NULL AND status != 'Estimated'"
    )


def downgrade() -> None:
    pass  # the filled-in values are real figures now; nothing to undo
