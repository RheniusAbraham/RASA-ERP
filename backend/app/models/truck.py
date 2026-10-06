from datetime import date

from sqlalchemy import Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Truck(TimestampMixin, Base):
    __tablename__ = "trucks"

    id: Mapped[int] = mapped_column(primary_key=True)
    registration_number: Mapped[str] = mapped_column(String(30), unique=True)
    manufacturer: Mapped[str] = mapped_column(String(100))
    model_name: Mapped[str] = mapped_column(String(100))
    chassis_number: Mapped[str] = mapped_column(String(50), unique=True)
    year_of_manufacture: Mapped[int]
    truck_type: Mapped[str] = mapped_column(String(100))
    odometer: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    fuel_capacity: Mapped[float] = mapped_column(Numeric(8, 2, asdecimal=False))
    tyre_layout: Mapped[str] = mapped_column(String(40))  # a layout id such as "10+1"

    documents: Mapped[list["TruckDocument"]] = relationship(
        back_populates="truck", cascade="all, delete-orphan", order_by="TruckDocument.id"
    )


class TruckDocument(TimestampMixin, Base):
    """Metadata of one compliance document (RC, FC, road tax ...). Its proof file is a StoredFile
    with owner_type="truck", owner_id=<truck id>, kind=<doc_type>."""

    __tablename__ = "truck_documents"
    __table_args__ = (UniqueConstraint("truck_id", "doc_type", name="uq_truck_document_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    truck_id: Mapped[int] = mapped_column(ForeignKey("trucks.id", ondelete="CASCADE"), index=True)
    doc_type: Mapped[str] = mapped_column(String(30))
    number: Mapped[str | None] = mapped_column(String(100), default=None)
    validity: Mapped[date] = mapped_column(Date)
    expense: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))

    truck: Mapped[Truck] = relationship(back_populates="documents")
