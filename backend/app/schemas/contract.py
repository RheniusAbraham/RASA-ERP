from datetime import date, datetime

from pydantic import ConfigDict, Field, model_validator

from app.schemas.common import CamelModel, text


class ContractIn(CamelModel):
    customer_id: int
    site_address: text(min_length=1, max_length=2000)
    material_ids: list[int] = Field(min_length=1)
    start_date: date
    months: int = Field(ge=0, le=60)
    days: int = Field(ge=0, le=30)
    transportation_cost: float = Field(ge=0)
    materials_cost: float = Field(ge=0)
    estimated_cost: float = Field(ge=0)

    @model_validator(mode="after")
    def _has_a_duration(self):
        if self.months * 30 + self.days <= 0:
            raise ValueError("Choose at least 1 day or 1 month")
        return self

    @model_validator(mode="after")
    def _distinct_materials(self):
        if len(set(self.material_ids)) != len(self.material_ids):
            raise ValueError("material_ids must not contain duplicates")
        return self


class MaterialRef(CamelModel):
    id: int
    name: str


class BillingPeriodOut(CamelModel):
    # "from" is a Python keyword, so the field is from_ and the JSON key is "from"
    model_config = ConfigDict(populate_by_name=True)

    label: str
    from_: date = Field(alias="from")
    to: date
    days: int
    cost: float


class ContractOut(CamelModel):
    id: int
    customer_id: int
    customer_name: str
    site_address: str
    materials: list[MaterialRef]
    start_date: date
    months: int
    days: int
    transportation_cost: float
    materials_cost: float
    estimated_cost: float
    #: Estimated cost / (months x 30 + days)
    daily_rate: float | None = None
    #: Month-by-month split using each month's real number of days
    breakdown: list[BillingPeriodOut] = []
    created_at: datetime
