from datetime import date

from sqlalchemy import Column, Date, ForeignKey, Integer, Numeric, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.customer import Customer
from app.models.material import Material

# Which materials a contract needs. A material or customer that is still used by a contract
# can't be deleted (RESTRICT); deleting the contract just removes its rows here (CASCADE).
contract_materials = Table(
    "contract_materials",
    Base.metadata,
    Column("contract_id", ForeignKey("contracts.id", ondelete="CASCADE"), primary_key=True),
    Column("material_id", ForeignKey("materials.id", ondelete="RESTRICT"), primary_key=True),
)


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    site_address: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    months: Mapped[int] = mapped_column(Integer)
    days: Mapped[int] = mapped_column(Integer)
    transportation_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))
    materials_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))
    estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))

    customer: Mapped[Customer] = relationship()
    materials: Mapped[list[Material]] = relationship(secondary=contract_materials, order_by=Material.id)

    @property
    def customer_name(self) -> str:
        return self.customer.name
