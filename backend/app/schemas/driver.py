from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.schemas.common import CamelModel, text
from app.schemas.files import FileInfo

Aadhaar = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{12}$")]
AccountNumber = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{9,18}$")]
Ifsc = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z]{4}0[A-Za-z0-9]{6}$")]


class DriverIn(CamelModel):
    name: text(min_length=1, max_length=200)
    phone: text(min_length=1, max_length=30)
    aadhaar_number: Aadhaar
    date_of_birth: date
    date_of_joining: date
    license_number: text(min_length=1, max_length=50)
    address: text(min_length=1, max_length=2000)
    bank_name: text(min_length=1, max_length=150)
    branch_name: text(min_length=1, max_length=150)
    account_number: AccountNumber
    ifsc_code: Ifsc
    fixed_hire_amount: float = Field(ge=0)

    @field_validator("ifsc_code")
    @classmethod
    def _upper_ifsc(cls, value: str) -> str:
        return value.upper()

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


class DriverOut(DriverIn):
    id: int
    created_at: datetime
    #: Uploaded files by kind: photo, aadhaarProof, licenseProof
    files: dict[str, FileInfo] = {}
    #: Required files that haven't been uploaded yet
    missing_files: list[str] = []
