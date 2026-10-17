from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.customer import Customer
from app.models.material import Material


class ContractMaterial(Base):
    """One material on a contract: how many are going to the site, and what they were priced at.

    The quantity unit is copied from the material when it is added to the contract (a snapshot),
    so renaming a material's unit later doesn't silently change contracts that already used it.

    A material or customer that is still used by a contract can't be deleted (RESTRICT);
    deleting the contract removes its rows here (CASCADE).
    """

    __tablename__ = "contract_materials"

    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="CASCADE"), primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id", ondelete="RESTRICT"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, server_default="1")
    quantity_unit: Mapped[str] = mapped_column(String(40), server_default="pcs")
    # How many were actually sent to the site (set when the contract is dispatched; `quantity` is the plan)
    dispatched_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # What came back when the contract was concluded: in good condition, and damaged. The rest of what was
    # dispatched was not returned.
    retrieved_intact: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retrieved_damaged: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Where what came back went: "Back to Yard" or "Moved to Another Site" (empty when nothing came back)
    return_destination: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Which site they moved to, in the user's words (optional; only for "Moved to Another Site")
    return_site_note: Mapped[str | None] = mapped_column(String(200), nullable=True)

    material: Mapped[Material] = relationship()

    @property
    def name(self) -> str:
        return self.material.name


# The table itself, for queries such as "is this material used by any contract?"
contract_materials = ContractMaterial.__table__


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    site_address: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    months: Mapped[int] = mapped_column(Integer)
    days: Mapped[int] = mapped_column(Integer)
    # Set when the contract is deployed before its planned start: the date it was planned to start (start_date
    # then holds the day the work really started)
    planned_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The last day, worked out from the start date and the period. Set by the API whenever those change.
    end_date: Mapped[date] = mapped_column(Date)
    transportation_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))
    materials_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))
    estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))
    # Phase of the contract: "Estimated" (just quoted) -> "Dispatched" (materials sent to the site)
    # -> "Deployed" (the work has officially started) -> "Concluded" (the work is finished) -> "Closed" (the contract is closed for good)
    status: Mapped[str] = mapped_column(String(20), server_default="Estimated")
    # Cost for one day: the estimated cost spread over (months x 30 + days). Kept in step with the cost and period.
    daily_cost: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False), server_default="0")
    # The same for the updated final cost (only once dispatched)
    final_daily_cost: Mapped[float | None] = mapped_column(Numeric(14, 2, asdecimal=False), nullable=True)
    # Free-text notes about the estimate
    description: Mapped[str] = mapped_column(Text, server_default="")
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    concluded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # The day the work really ended, chosen when concluding (it can be earlier than the day the user clicked)
    work_ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The last day the user confirmed the work was still running past the end date; the extension is only
    # charged for a limited number of days after the end date or this confirmation, so a forgotten contract stops
    extension_confirmed_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Filled in at dispatch: the updated final cost and the loading/unloading charges
    final_transportation_cost: Mapped[float | None] = mapped_column(Numeric(14, 2, asdecimal=False), nullable=True)
    final_cost: Mapped[float | None] = mapped_column(Numeric(14, 2, asdecimal=False), nullable=True)
    loading_charges: Mapped[float | None] = mapped_column(Numeric(14, 2, asdecimal=False), nullable=True)

    customer: Mapped[Customer] = relationship()
    payments: Mapped[list["Payment"]] = relationship(order_by="Payment.id")
    items: Mapped[list[ContractMaterial]] = relationship(
        cascade="all, delete-orphan", order_by=ContractMaterial.material_id
    )

    @property
    def customer_name(self) -> str:
        return self.customer.name

    @property
    def materials(self) -> list[ContractMaterial]:
        """The materials on this contract (what the API calls them)."""
        return self.items


class Payment(TimestampMixin, Base):
    """Money the customer paid against one billing line of a contract (a month, or the extended period).

    A payment is never deleted: a mistaken one is voided with a reason, so there is always a record.
    Its proof images live in `stored_files` (owner_type "payment", kinds "proof1" and "proof2").
    A contract that has payments can't be deleted (RESTRICT).
    """

    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.id", ondelete="RESTRICT"), index=True)
    #: "1", "2", ... for the months of the plan, or "extension" for the extended period
    line: Mapped[str] = mapped_column(String(20))
    amount: Mapped[float] = mapped_column(Numeric(14, 2, asdecimal=False))
    paid_on: Mapped[date] = mapped_column(Date)
    #: Optional: "Cash", "UPI", "Bank Transfer", "Cheque" or "Other"
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
