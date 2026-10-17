from sqlalchemy import Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Material(TimestampMixin, Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    # How much is owned, counted in `quantity_unit` (pcs, sq ft, kg ...); existing rows start at 0
    total_quantity_owned: Mapped[int] = mapped_column(default=0, server_default="0")
    quantity_unit: Mapped[str] = mapped_column(String(40), default="pcs", server_default="pcs")
    structural_description: Mapped[str] = mapped_column(Text)
    additional_information: Mapped[str] = mapped_column(Text, default="")
