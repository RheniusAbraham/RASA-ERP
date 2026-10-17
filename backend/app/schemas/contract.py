from datetime import date, datetime

from pydantic import ConfigDict, Field, model_validator

from app.schemas.common import CamelModel, text


class ContractItemIn(CamelModel):
    material_id: int
    #: How many go to this site, in the material's quantity unit. Can't exceed what is owned.
    quantity: int = Field(ge=1)


class ContractIn(CamelModel):
    customer_id: int
    site_address: text(min_length=1, max_length=2000)
    materials: list[ContractItemIn] = Field(min_length=1)
    start_date: date
    months: int = Field(ge=0, le=60)
    days: int = Field(ge=0, le=30)
    transportation_cost: float = Field(ge=0)
    materials_cost: float = Field(ge=0)
    estimated_cost: float = Field(ge=0)
    #: Notes about the estimate (optional)
    description: text(max_length=2000) = ""

    @model_validator(mode="after")
    def _has_a_duration(self):
        if self.months * 30 + self.days <= 0:
            raise ValueError("Choose at least 1 day or 1 month")
        return self

    @model_validator(mode="after")
    def _distinct_materials(self):
        ids = [m.material_id for m in self.materials]
        if len(set(ids)) != len(ids):
            raise ValueError("materials must not list the same material twice")
        return self


class SourceOut(CamelModel):
    """Where some of a line's units were taken from."""

    label: str
    quantity: int
    #: True when they came from the yard
    yard: bool


class ContractItemOut(CamelModel):
    """A material on a contract: how many go to the site, in the unit it was counted in when added."""

    material_id: int
    name: str
    quantity: int
    quantity_unit: str
    #: How many were actually dispatched (null until the contract is dispatched)
    dispatched_quantity: int | None = None
    #: What came back when the contract was concluded (null until then)
    retrieved_intact: int | None = None
    retrieved_damaged: int | None = None
    #: Where what came back went (null until concluded, or when nothing came back)
    return_destination: str | None = None
    return_site_note: str | None = None
    #: Where the dispatched units were taken from
    sources: list[SourceOut] = []


class BillingPeriodOut(CamelModel):
    # "from" is a Python keyword, so the field is from_ and the JSON key is "from"
    model_config = ConfigDict(populate_by_name=True)

    label: str
    from_: date = Field(alias="from")
    to: date
    days: int
    cost: float


class SourceIn(CamelModel):
    """Some of the units, and where they are taken from."""

    #: The lot of free units waiting at another site; empty for the yard
    lot_id: int | None = None
    quantity: int = Field(gt=0)


class DispatchItemIn(CamelModel):
    material_id: int
    #: How many were actually sent to the site
    quantity: int = Field(ge=0)
    #: Where they are taken from: the yard and/or lots waiting at other sites. Must add up to `quantity`.
    sources: list[SourceIn] = []


class SendMoreItemIn(CamelModel):
    material_id: int
    sources: list[SourceIn] = Field(min_length=1)


class SendMoreIn(CamelModel):
    """More units of materials already on a running contract."""

    materials: list[SendMoreItemIn] = Field(min_length=1)


class DispatchIn(CamelModel):
    materials: list[DispatchItemIn] = Field(min_length=1)
    final_transportation_cost: float = Field(ge=0)
    final_cost: float = Field(ge=0)
    loading_charges: float = Field(ge=0)


class DeployIn(CamelModel):
    #: Needed to deploy before the start date: the contract then really starts today and its dates move
    confirm_early_start: bool = False


RETURN_DESTINATIONS = ("Back to Yard", "Moved to Another Site")


class RetrievedItemIn(CamelModel):
    material_id: int
    #: How many came back in good condition
    intact: int = Field(ge=0)
    #: How many came back damaged
    damaged: int = Field(ge=0)
    #: Where they went: "Back to Yard" or "Moved to Another Site". Needed when anything came back.
    destination: str | None = None
    #: Which site they moved to (optional; for "Moved to Another Site")
    site_note: text(max_length=200) | None = None
    #: Move the intact units straight to another running contract (Dispatched or Deployed, with this material on it)
    assign_to_contract_id: int | None = None


class ConcludeIn(CamelModel):
    #: The day the work really ended. Left out, it is today. Any day from the start date up to today is allowed.
    work_ended_on: date | None = None
    #: What came back, for every material on the contract (0 and 0 when nothing did). It can't be more than was dispatched.
    materials: list[RetrievedItemIn] = Field(min_length=1)


class AdjustEndIn(CamelModel):
    work_ended_on: date


PAYMENT_METHODS = ("Cash", "UPI", "Bank Transfer", "Cheque", "Other")


class VoidPaymentIn(CamelModel):
    reason: text(min_length=1, max_length=500)


class ProofOut(CamelModel):
    kind: str
    filename: str
    content_type: str
    size: int
    url: str


class PaymentOut(CamelModel):
    id: int
    line: str
    amount: float
    paid_on: date
    method: str | None = None
    voided: bool = False
    void_reason: str | None = None
    proofs: list[ProofOut] = []
    created_at: datetime


class BillingLineOut(CamelModel):
    """One thing the customer is billed for (a month, or the extended period) and how much of it is paid."""

    key: str
    label: str
    amount: float
    paid: float
    #: How much of the line has built up so far: the days worked (counting the start date as day 1) x the cost for a day
    accrued: float = 0
    #: What is due now: what has built up so far, less what has been paid (and carried in as credit). Never negative.
    due_now: float = 0
    #: Credit carried in from an earlier line that was overpaid
    credit_in: float = 0
    #: Overpayment on this line carried to the next one
    credit_out: float = 0
    balance: float
    #: "Unpaid", "Part paid", "Paid" or "Overpaid"
    status: str


class ContractOut(CamelModel):
    id: int
    customer_id: int
    customer_name: str
    site_address: str
    materials: list[ContractItemOut]
    start_date: date
    #: The date it was planned to start, when it was deployed early (null otherwise)
    planned_start_date: date | None = None
    #: Last day of the contract: the start date plus the time period (the start date counts as day 1)
    end_date: date
    months: int
    days: int
    transportation_cost: float
    materials_cost: float
    estimated_cost: float
    description: str = ""
    #: "Estimated", then "Dispatched", then "Deployed", then "Concluded", then "Closed"
    status: str
    dispatched_at: datetime | None = None
    deployed_at: datetime | None = None
    concluded_at: datetime | None = None
    closed_at: datetime | None = None
    final_transportation_cost: float | None = None
    final_cost: float | None = None
    loading_charges: float | None = None
    #: Cost for a day: estimated cost / (months x 30 + days)
    daily_cost: float
    #: The same for the updated final cost (null until dispatched)
    final_daily_cost: float | None = None
    #: Month-by-month split using each month's real number of days
    breakdown: list[BillingPeriodOut] = []
    #: The same split, for the updated final cost (only once dispatched)
    final_breakdown: list[BillingPeriodOut] = []
    #: What the customer is billed for, line by line, with the payments recorded against each
    billing_lines: list[BillingLineOut] = []
    payments: list[PaymentOut] = []
    total_billed: float = 0
    total_received: float = 0
    total_outstanding: float = 0
    #: Money paid above what is billed so far (carried to the next line, or left over)
    credit_balance: float = 0
    #: The day the work really ended (concluded contracts only)
    work_ended_on: date | None = None
    #: Days the work has run past the end date so far, whether or not they are being charged
    extension_elapsed_days: int = 0
    #: Days being charged: a deployed contract is charged for a limited number of days without a confirmation
    extended_days: int = 0
    #: True when charging has stopped until the user confirms the work is still running (or concludes)
    extension_paused: bool = False
    #: The last day that can be charged without a new confirmation
    extension_charge_until: date | None = None
    extension_start: date | None = None
    extension_end: date | None = None
    #: What the extra days cost: the days x the (updated) cost for a day
    extension_amount: float = 0
    created_at: datetime
