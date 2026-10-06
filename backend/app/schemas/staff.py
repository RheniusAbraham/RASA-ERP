from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.schemas.common import CamelModel, text
from app.schemas.files import FileInfo

Email = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
]
AadharNumber = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^(\d{12})?$")]

# Mirrors frontend/src/lib/staff-options.ts
SoftwareDesignation = Literal["Trip Sheet Register"]


class StaffBase(CamelModel):
    name: text(min_length=1, max_length=200)
    staff_id: text(min_length=1, max_length=50)
    department: text(min_length=1, max_length=100)
    designation: text(min_length=1, max_length=150)
    date_of_birth: date
    date_of_joining: date
    email: Email
    contact_number: text(min_length=1, max_length=30)
    software_designation: SoftwareDesignation
    address: text(min_length=1, max_length=2000)
    aadhar_number: AadharNumber = ""

    @field_validator("date_of_birth")
    @classmethod
    def _born_in_the_past(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Date of birth can't be in the future")
        return value

    @model_validator(mode="after")
    def _joined_after_birth(self):
        if self.date_of_joining < self.date_of_birth:
            raise ValueError("Date of joining can't be before the date of birth")
        return self


class StaffCreate(StaffBase):
    password: str = Field(min_length=8, max_length=128)


class StaffUpdate(StaffBase):
    #: Leave out (or empty) to keep the current password
    password: str | None = Field(default=None, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_rules(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        return value


class StaffOut(StaffBase):
    id: int
    #: Always the (lower-cased) email. The password is never returned.
    username: str
    created_at: datetime
    #: Uploaded files by kind: photo, aadharCard
    files: dict[str, FileInfo] = {}
    missing_files: list[str] = []
