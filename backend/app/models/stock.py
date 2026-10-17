from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class StockLot(TimestampMixin, Base):
    """Materials that are free but waiting at another site (they moved there when a contract was concluded).

    `quantity` is what is still there: it goes down when the units are taken by a later contract or moved to the yard.
    """

    __tablename__ = "stock_lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id", ondelete="RESTRICT"), index=True)
    #: The contract they came from
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    #: Which site, in the user's words (optional)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)


class StockMovement(TimestampMixin, Base):
    """One entry in the stock ledger: what moved, how many, and why. Entries are never edited or deleted."""

    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id", ondelete="RESTRICT"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True)
    #: See `app.services.stock` for the kinds
    kind: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class ContractMaterialSource(TimestampMixin, Base):
    """Where some of the units of a contract's material were taken from when they were dispatched:
    the yard, or a lot of free units waiting at another site. A line can have several (a top-up adds more)."""

    __tablename__ = "contract_material_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id", ondelete="RESTRICT"))
    #: The lot they came from; empty for the yard (and after a lot has been used up and removed)
    lot_id: Mapped[int | None] = mapped_column(ForeignKey("stock_lots.id", ondelete="SET NULL"), nullable=True)
    #: "Yard", or where the lot was
    label: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer)
