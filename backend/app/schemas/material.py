from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel, text


class MaterialIn(CamelModel):
    name: text(min_length=1, max_length=200)
    total_quantity_owned: int = Field(ge=0)
    #: What the quantity is counted in, e.g. "pcs", "sq ft", "kg"
    quantity_unit: text(min_length=1, max_length=40)
    structural_description: text(min_length=1, max_length=4000)
    additional_information: text(max_length=4000) = ""


class MaterialOut(MaterialIn):
    id: int
    created_at: datetime
    #: Written off (lost, or scrapped): taken off the total owned
    lost: int = 0
    #: Back in the yard but damaged: owned, but not available
    damaged: int = 0
    #: Free units waiting at another site: owned, but not in the yard
    elsewhere: int = 0


class DistributionItemOut(CamelModel):
    """One contract that has some of this material."""

    contract_id: int
    customer_name: str
    site_address: str
    #: "Estimated", "Dispatched", "Deployed", "Concluded" or "Closed"
    status: str
    #: Whether the contract is still open (it holds the material) or concluded
    holding: bool = True
    #: What came back when it was concluded
    retrieved_intact: int | None = None
    retrieved_damaged: int | None = None
    return_destination: str | None = None
    #: The contract's first and last day
    start_date: date
    end_date: date
    dispatched_at: datetime | None = None
    planned_quantity: int
    #: How many were actually sent (null until the contract is dispatched)
    dispatched_quantity: int | None = None
    #: What counts against the stock: the dispatched quantity, else the planned one
    quantity: int


class LotOut(CamelModel):
    """Free units waiting at another site."""

    id: int
    quantity: int
    note: str | None = None
    #: The contract they came from
    from_customer: str | None = None
    since: date
    days_waiting: int


class WaitingLotOut(CamelModel):
    """A lot of free units waiting at another site, with the material it is of."""

    lot_id: int
    material_id: int
    material_name: str
    quantity: int
    quantity_unit: str
    note: str | None = None
    from_customer: str | None = None
    days_waiting: int


class MovementOut(CamelModel):
    id: int
    kind: str
    quantity: int
    contract_id: int | None = None
    customer_name: str | None = None
    reason: str | None = None
    created_at: datetime


class MaterialDistributionOut(CamelModel):
    """Where the stock of a material is."""

    #: Owned after write-offs
    total_owned: int
    #: Held by open contracts
    in_use: int
    #: In the yard and available for a contract
    available: int
    #: Free units waiting at other sites
    elsewhere: int
    damaged: int
    #: Written off
    lost: int
    quantity_unit: str
    contracts: list[DistributionItemOut]
    lots: list[LotOut] = []
    movements: list[MovementOut] = []


StockAction = Literal["repair", "write-off-damaged", "mark-damaged", "write-off-yard", "lot-to-yard", "restore-lost"]


class StockActionIn(CamelModel):
    action: StockAction
    quantity: int = Field(gt=0)
    #: Why: required, so every correction can be explained later
    reason: text(min_length=1, max_length=500)
    #: For "lot-to-yard": which lot of units waiting at another site
    lot_id: int | None = None
