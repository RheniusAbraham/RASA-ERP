from datetime import date, datetime

from pydantic import Field, field_validator, model_validator

from app.schemas.common import CamelModel, text
from app.schemas.files import FileInfo

# Mirrors frontend/src/lib/tyre-layouts.ts (the ids are what the frontend stores)
TYRE_LAYOUT_IDS = (
    "6+1",
    "10+1",
    "12+1",
    "14+1",
    "16+1",
    "10+1-tractor-trailer",
    "14+1-tractor-trailer",
    "18+1-tractor-trailer",
    "22+1-tractor-trailer",
)

# Mirrors frontend/src/lib/fleet-options.ts
TRUCK_DOC_TYPES = ("rc", "fc", "roadTax", "insurance", "nationalPermit", "localPermit", "pollution")
DOCS_NEEDING_A_NUMBER = ("roadTax", "nationalPermit", "localPermit", "pollution")

EARLIEST_YEAR = 1980


class TruckDocumentIn(CamelModel):
    number: text(max_length=100) | None = None
    validity: date
    expense: float = Field(ge=0)


class TruckDocumentOut(TruckDocumentIn):
    #: The uploaded proof, or null until it has been uploaded
    file: FileInfo | None = None


class TruckIn(CamelModel):
    registration_number: text(min_length=1, max_length=30)
    manufacturer: text(min_length=1, max_length=100)
    model_name: text(min_length=1, max_length=100)
    chassis_number: text(min_length=1, max_length=50)
    year_of_manufacture: int
    truck_type: text(min_length=1, max_length=100)
    odometer: float = Field(ge=0)
    fuel_capacity: float = Field(gt=0)
    tyre_layout: str
    #: One entry for each of rc, fc, roadTax, insurance, nationalPermit, localPermit, pollution
    documents: dict[str, TruckDocumentIn]

    @field_validator("registration_number")
    @classmethod
    def _normalise_registration(cls, value: str) -> str:
        return " ".join(value.upper().split())  # "tn 69  aa 1256" -> "TN 69 AA 1256"

    @field_validator("chassis_number")
    @classmethod
    def _upper_chassis(cls, value: str) -> str:
        return value.upper()

    @field_validator("year_of_manufacture")
    @classmethod
    def _plausible_year(cls, value: int) -> int:
        latest = date.today().year + 1
        if not EARLIEST_YEAR <= value <= latest:
            raise ValueError(f"Year of manufacture must be between {EARLIEST_YEAR} and {latest}")
        return value

    @field_validator("tyre_layout")
    @classmethod
    def _known_layout(cls, value: str) -> str:
        if value not in TYRE_LAYOUT_IDS:
            raise ValueError(f"Unknown tyre layout. Choose one of: {', '.join(TYRE_LAYOUT_IDS)}")
        return value

    @model_validator(mode="after")
    def _documents_complete(self):
        missing = [d for d in TRUCK_DOC_TYPES if d not in self.documents]
        unknown = [d for d in self.documents if d not in TRUCK_DOC_TYPES]
        if missing or unknown:
            raise ValueError(
                f"documents must contain exactly: {', '.join(TRUCK_DOC_TYPES)}"
                + (f" (missing: {', '.join(missing)})" if missing else "")
                + (f" (unknown: {', '.join(unknown)})" if unknown else "")
            )
        for doc_type in DOCS_NEEDING_A_NUMBER:
            if not (self.documents[doc_type].number or "").strip():
                raise ValueError(f"documents.{doc_type}.number is required")
        return self


class TruckOut(CamelModel):
    id: int
    registration_number: str
    manufacturer: str
    model_name: str
    chassis_number: str
    year_of_manufacture: int
    truck_type: str
    odometer: float
    fuel_capacity: float
    tyre_layout: str
    documents: dict[str, TruckDocumentOut]
    #: Document proofs that haven't been uploaded yet
    missing_files: list[str] = []
    created_at: datetime
