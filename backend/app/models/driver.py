from datetime import date

from sqlalchemy import Date, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Driver(TimestampMixin, Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    phone: Mapped[str] = mapped_column(String(30))
    aadhaar_number: Mapped[str] = mapped_column(String(12))
    date_of_birth: Mapped[date] = mapped_column(Date)
    date_of_joining: Mapped[date] = mapped_column(Date)
    license_number: Mapped[str] = mapped_column(String(50), unique=True)
    address: Mapped[str] = mapped_column(Text)

    bank_name: Mapped[str] = mapped_column(String(150))
    branch_name: Mapped[str] = mapped_column(String(150))
    account_number: Mapped[str] = mapped_column(String(18))
    ifsc_code: Mapped[str] = mapped_column(String(11))

    fixed_hire_amount: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
