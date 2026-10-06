from datetime import date

from sqlalchemy import Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Staff(TimestampMixin, Base):
    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    staff_id: Mapped[str] = mapped_column(String(50), unique=True)  # e.g. STF-1003
    department: Mapped[str] = mapped_column(String(100))
    designation: Mapped[str] = mapped_column(String(150))
    date_of_birth: Mapped[date] = mapped_column(Date)
    date_of_joining: Mapped[date] = mapped_column(Date)
    email: Mapped[str] = mapped_column(String(254))
    contact_number: Mapped[str] = mapped_column(String(30))
    address: Mapped[str] = mapped_column(Text)
    aadhar_number: Mapped[str] = mapped_column(String(12), default="")

    # Software access
    software_designation: Mapped[str] = mapped_column(String(100))
    username: Mapped[str] = mapped_column(String(254), unique=True)  # the email, lower-cased
    password_hash: Mapped[str] = mapped_column(String(255))
