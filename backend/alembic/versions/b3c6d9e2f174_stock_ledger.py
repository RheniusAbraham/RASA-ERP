"""stock ledger

Where every unit of a material is: a ledger of what moved (damaged units, lost units, repairs, corrections),
and lots of free units waiting at another site. Concluded contracts that already exist are entered into the ledger.

Revision ID: b3c6d9e2f174
Revises: a2b5c8d1e063
Create Date: 2026-10-09 18:00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3c6d9e2f174"
down_revision: Union[str, Sequence[str], None] = "a2b5c8d1e063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NOW = sa.text("(CURRENT_TIMESTAMP)")


def upgrade() -> None:
    op.create_table(
        "stock_lots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("stock_lots", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_stock_lots_material_id"), ["material_id"], unique=False)

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=_NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("stock_movements", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_stock_movements_material_id"), ["material_id"], unique=False)

    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.add_column(sa.Column("return_site_note", sa.String(length=200), nullable=True))

    # Contracts that were concluded before this existed: enter what came back into the ledger.
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT cm.contract_id, cm.material_id, COALESCE(cm.dispatched_quantity, cm.quantity), "
            "cm.retrieved_intact, cm.retrieved_damaged, cm.return_destination "
            "FROM contract_materials cm JOIN contracts c ON c.id = cm.contract_id "
            "WHERE c.status = 'Concluded' AND cm.retrieved_intact IS NOT NULL"
        )
    ).all()
    insert = sa.text("INSERT INTO stock_movements (material_id, contract_id, kind, quantity) VALUES (:m, :c, :k, :q)")
    for contract_id, material_id, sent, intact, damaged, destination in rows:
        missing = max(sent - intact - damaged, 0)
        for kind, quantity in (
            ("Moved to another site" if destination == "Moved to Another Site" else "Returned to yard", intact),
            ("Damaged", damaged),
            ("Lost", missing),
        ):
            if quantity > 0:
                connection.execute(insert, {"m": material_id, "c": contract_id, "k": kind, "q": quantity})
        if destination == "Moved to Another Site" and intact > 0:
            connection.execute(
                sa.text("INSERT INTO stock_lots (material_id, contract_id, quantity) VALUES (:m, :c, :q)"),
                {"m": material_id, "c": contract_id, "q": intact},
            )


def downgrade() -> None:
    with op.batch_alter_table("contract_materials", schema=None) as batch_op:
        batch_op.drop_column("return_site_note")
    with op.batch_alter_table("stock_movements", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_stock_movements_material_id"))
    op.drop_table("stock_movements")
    with op.batch_alter_table("stock_lots", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_stock_lots_material_id"))
    op.drop_table("stock_lots")
