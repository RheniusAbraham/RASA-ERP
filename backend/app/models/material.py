from sqlalchemy import Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Material(TimestampMixin, Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    cost_per_piece: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    # Pieces owned in total; existing rows start at 0
    total_quantity_owned: Mapped[int] = mapped_column(default=0, server_default="0")
    structural_description: Mapped[str] = mapped_column(Text)
    additional_information: Mapped[str] = mapped_column(Text, default="")
