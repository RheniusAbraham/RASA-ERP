from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class StoredFile(TimestampMixin, Base):
    """One uploaded file (photo / PDF proof) attached to a driver, staff member or truck.

    `owner_type` + `owner_id` point at the owner row (no foreign key, so one table can serve
    several resources; the owner's files are removed when the owner is deleted).
    `kind` says what the file is, e.g. "photo", "aadhaarProof", "rc".
    """

    __tablename__ = "stored_files"
    __table_args__ = (UniqueConstraint("owner_type", "owner_id", "kind", name="uq_stored_file_owner_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_type: Mapped[str] = mapped_column(String(30))
    owner_id: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(40))
    path: Mapped[str] = mapped_column(String(500))  # relative to the upload directory
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
