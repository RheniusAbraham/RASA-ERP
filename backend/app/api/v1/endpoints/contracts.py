from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import object_session, selectinload

from app.api.deps import DbSession, not_found
from app.models.contract import Contract, ContractMaterial, Payment
from app.models.stock import ContractMaterialSource
from app.models.customer import Customer
from app.models.material import Material
from app.schemas.contract import (
    PAYMENT_METHODS,
    RETURN_DESTINATIONS,
    AdjustEndIn,
    BillingLineOut,
    BillingPeriodOut,
    ConcludeIn,
    SendMoreIn,
    SourceOut,
    ContractIn,
    ContractItemIn,
    ContractOut,
    DeployIn,
    DispatchIn,
    PaymentOut,
    ProofOut,
    VoidPaymentIn,
)
from app.core.config import settings
from app.services import deployment
from app.services import files as file_service
from app.services import stock as stock_service
from app.services import payments as payment_service
from app.services.files import FileRule
from app.services.contract_billing import (
    EXTENSION_GRACE_DAYS,
    compute_breakdown,
    compute_extension,
    contract_end_date,
)

router = APIRouter(prefix="/contracts", tags=["contracts"])


PROOF_RULE = FileRule("image")
MAX_PROOFS = 2


def _proofs(contract_id: int, payment_id: int, stored: dict) -> list[ProofOut]:
    return [
        ProofOut(
            kind=kind,
            filename=file.original_name,
            content_type=file.content_type,
            size=file.size,
            url=f"{settings.api_prefix}/contracts/{contract_id}/payments/{payment_id}/proofs/{kind}",
        )
        for kind, file in sorted(stored.items())
    ]


def _add_billing(contract: Contract, out: ContractOut) -> None:
    """Fills in what the customer is billed for, line by line, and what has been paid against each line."""
    periods = out.final_breakdown or out.breakdown
    ended = contract.status in ("Concluded", "Closed") and (contract.work_ended_on or contract.concluded_at)
    # "now" is today, or the day the work ended on a concluded contract
    now = (contract.work_ended_on or contract.concluded_at.date()) if ended else deployment.today()

    def charged(p) -> float:
        """A concluded contract is billed for the days actually worked in each month, not the planned month."""
        if not ended or not p.days:
            return p.cost
        worked = min(max((now - p.from_).days + 1, 0), p.days)
        return payment_service.round_money(p.cost * worked / p.days)

    lines = [(str(i + 1), p.label.replace("month", "Month"), charged(p)) for i, p in enumerate(periods)]
    if out.extended_days > 0:
        lines.append((payment_service.EXTENSION_KEY, "Extended Period", out.extension_amount))
    counted = [(p.line, p.amount) for p in contract.payments if p.voided_at is None]
    computed = payment_service.billing_lines(lines, counted)

    accrued_by_key: dict[str, float] = {}
    for i, p in enumerate(periods):
        worked = min(max((now - p.from_).days + 1, 0), p.days)
        accrued_by_key[str(i + 1)] = payment_service.round_money(p.cost * worked / p.days) if p.days else 0.0
    accrued_by_key[payment_service.EXTENSION_KEY] = out.extension_amount  # extra days are only charged once they have passed

    out.billing_lines = [
        BillingLineOut(
            key=l.key, label=l.label, amount=l.amount, paid=l.paid, credit_in=l.credit_in,
            credit_out=l.credit_out, balance=l.balance, status=l.status,
            accrued=accrued_by_key.get(l.key, 0.0),
            due_now=payment_service.round_money(max(accrued_by_key.get(l.key, 0.0) - l.paid - l.credit_in, 0.0)),
        )
        for l in computed
    ]
    out.total_billed = payment_service.round_money(sum(l.amount for l in computed))
    out.total_received = payment_service.round_money(sum(amount for _, amount in counted))
    out.total_outstanding = payment_service.round_money(sum(l.balance for l in computed))
    out.credit_balance = computed[-1].credit_out if computed else 0.0

    db = object_session(contract)
    stored = file_service.files_for(db, "payment", [p.id for p in contract.payments]) if db is not None else {}
    out.payments = [
        PaymentOut(
            id=p.id, line=p.line, amount=p.amount, paid_on=p.paid_on, method=p.method,
            voided=p.voided_at is not None, void_reason=p.void_reason,
            proofs=_proofs(contract.id, p.id, stored.get(p.id, {})), created_at=p.created_at,
        )
        for p in contract.payments
    ]


def _add_sources(contract: Contract, out: ContractOut) -> None:
    """Where each line's dispatched units were taken from."""
    db = object_session(contract)
    if db is None or contract.status == "Estimated":
        return
    by_material: dict[int, list[SourceOut]] = {}
    rows = db.scalars(select(ContractMaterialSource).where(ContractMaterialSource.contract_id == contract.id).order_by(ContractMaterialSource.id))
    for row in rows:
        merged = by_material.setdefault(row.material_id, [])
        existing = next((m for m in merged if m.label == row.label), None)
        if existing:
            existing.quantity += row.quantity
        else:
            merged.append(SourceOut(label=row.label, quantity=row.quantity, yard=row.lot_id is None and row.label == "Yard"))
    for line in out.materials:
        line.sources = by_material.get(line.material_id, [])


def _out(contract: Contract) -> ContractOut:
    out = ContractOut.model_validate(contract)
    breakdown = compute_breakdown(
        start_date=contract.start_date,
        months=contract.months,
        days=contract.days,
        estimated_cost=contract.estimated_cost,
    )
    if breakdown is not None:
        out.breakdown = [
            BillingPeriodOut(label=p.label, from_=p.start, to=p.end, days=p.days, cost=p.cost) for p in breakdown.periods
        ]
    if contract.final_cost is not None:
        final = compute_breakdown(
            start_date=contract.start_date, months=contract.months, days=contract.days, estimated_cost=contract.final_cost
        )
        if final is not None:
            out.final_breakdown = [
                BillingPeriodOut(label=p.label, from_=p.start, to=p.end, days=p.days, cost=p.cost) for p in final.periods
            ]
    if contract.status in ("Deployed", "Concluded", "Closed"):
        daily = contract.final_daily_cost or contract.daily_cost
        today = deployment.today()
        if contract.status in ("Concluded", "Closed"):
            # fixed at the day the work really ended
            until = contract.work_ended_on or (contract.concluded_at.date() if contract.concluded_at else today)
            out.extension_elapsed_days = max((until - contract.end_date).days, 0)
        else:
            out.extension_elapsed_days = max((today - contract.end_date).days, 0)
            # without a confirmation only a few days past the end date (or the last confirmation) are charged
            confirmed = max(contract.end_date, contract.extension_confirmed_until or contract.end_date)
            limit = confirmed + timedelta(days=EXTENSION_GRACE_DAYS)
            until = min(today, limit)
            out.extension_paused = today > limit
            if out.extension_elapsed_days > 0:
                out.extension_charge_until = limit
        extension = compute_extension(end_date=contract.end_date, until=until, daily_cost=daily)
        out.extended_days = extension.days
        out.extension_start = extension.start
        out.extension_end = extension.end
        out.extension_amount = extension.amount
        _add_billing(contract, out)
    _add_sources(contract, out)
    return out


def _refresh_daily(contract: Contract) -> None:
    """Sets the stored end date and cost-for-a-day figures from the contract's current costs and period."""
    contract.end_date = contract_end_date(contract.start_date, contract.months, contract.days)
    estimate = compute_breakdown(
        start_date=contract.start_date, months=contract.months, days=contract.days, estimated_cost=contract.estimated_cost
    )
    contract.daily_cost = estimate.daily_rate if estimate else 0
    if contract.final_cost is not None:
        final = compute_breakdown(
            start_date=contract.start_date, months=contract.months, days=contract.days, estimated_cost=contract.final_cost
        )
        contract.final_daily_cost = final.daily_rate if final else None


def _load(db: DbSession, contract_id: int) -> Contract | None:
    return db.scalars(
        select(Contract)
        .options(selectinload(Contract.items).selectinload(ContractMaterial.material), selectinload(Contract.customer), selectinload(Contract.payments))
        .where(Contract.id == contract_id)
        .execution_options(populate_existing=True)  # re-read collections (payments) that changed in this session
    ).first()


def _sync_items(db: DbSession, contract: Contract, wanted: list[ContractItemIn]) -> None:
    """Makes the contract's materials match `wanted`.

    Every material must exist and enough must be owned. A material that is already on the
    contract only has its quantity changed; a newly added one gets the material's current quantity
    unit. Nothing is changed unless all checks pass.
    """
    ids = [w.material_id for w in wanted]
    found = {m.id: m for m in db.scalars(select(Material).where(Material.id.in_(ids)))}
    missing = [i for i in ids if i not in found]
    if missing:
        raise not_found(f"Material(s) {missing}")
    # what is in the yard and not taken by other open contracts (this contract's own lines don't count against it)
    free = stock_service.available_map(db, list(found.values()), contract.id or 0, with_other_sites=True)
    for w in wanted:
        material = found[w.material_id]
        available = free[material.id]
        if w.quantity > available:
            raise HTTPException(
                422,
                f"Only {max(available, 0)} {material.quantity_unit} of {material.name} "
                f"are available, but {w.quantity} were requested.",
            )

    existing = {item.material_id: item for item in contract.items}
    for material_id, item in list(existing.items()):
        if material_id not in found:
            contract.items.remove(item)
    for w in wanted:
        item = existing.get(w.material_id)
        if item is not None:
            item.quantity = w.quantity
        else:
            material = found[w.material_id]
            contract.items.append(
                ContractMaterial(
                    material_id=material.id,
                    quantity=w.quantity,
                    quantity_unit=material.quantity_unit,
                )
            )


@router.get("", response_model=list[ContractOut])
def list_contracts(db: DbSession, customer_id: int | None = None):
    deployment.auto_deploy_due(db)  # dispatched contracts whose start date has come are now deployed
    query = (
        select(Contract)
        .options(selectinload(Contract.items).selectinload(ContractMaterial.material), selectinload(Contract.customer), selectinload(Contract.payments))
        .order_by(Contract.id)
    )
    if customer_id is not None:
        query = query.where(Contract.customer_id == customer_id)
    return [_out(c) for c in db.scalars(query)]


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def create_contract(payload: ContractIn, db: DbSession):
    if db.get(Customer, payload.customer_id) is None:
        raise not_found("Customer")
    contract = Contract(**payload.model_dump(exclude={"materials"}))
    _refresh_daily(contract)
    _sync_items(db, contract, payload.materials)
    db.add(contract)
    db.commit()
    return _out(_load(db, contract.id))


@router.get("/{contract_id}", response_model=ContractOut)
def get_contract(contract_id: int, db: DbSession):
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    return _out(contract)


@router.put("/{contract_id}", response_model=ContractOut)
def update_contract(contract_id: int, payload: ContractIn, db: DbSession):
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status in ("Deployed", "Concluded", "Closed") and payload.start_date != contract.start_date:
        raise HTTPException(422, "The start date can't be changed once the contract is deployed: the work has started.")
    if db.get(Customer, payload.customer_id) is None:
        raise not_found("Customer")
    _sync_items(db, contract, payload.materials)  # checks first, so a refusal changes nothing
    for field, value in payload.model_dump(exclude={"materials"}).items():
        setattr(contract, field, value)
    _refresh_daily(contract)
    db.commit()
    return _out(_load(db, contract_id))


@router.post("/{contract_id}/dispatch", response_model=ContractOut)
def dispatch_contract(contract_id: int, payload: DispatchIn, db: DbSession):
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status != "Estimated":
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract has already been dispatched")

    items = {item.material_id: item for item in contract.items}
    sent = {m.material_id: m.quantity for m in payload.materials}
    if len(sent) != len(payload.materials) or set(sent) != set(items):
        raise HTTPException(422, "Give the dispatched quantity of every material on the contract, once each.")
    # where each material is taken from: the user chooses, and it has to add up
    chosen = {m.material_id: m for m in payload.materials}
    for material_id, quantity in sent.items():
        added = sum(src.quantity for src in chosen[material_id].sources)
        if quantity > 0 and added != quantity:
            raise HTTPException(
                422,
                f"{items[material_id].name}: say where the {quantity} dispatched come from. The sources add up to {added}.",
            )
        if quantity == 0 and added:
            raise HTTPException(422, f"{items[material_id].name}: nothing is dispatched, so nothing can be taken from a source.")
    yard = stock_service.available_map(db, [item.material for item in items.values()], contract.id)
    for material_id, quantity in sent.items():
        if quantity > 0:
            stock_service.take_sources(
                db, contract, items[material_id], [(src.lot_id, src.quantity) for src in chosen[material_id].sources], yard[material_id]
            )
        items[material_id].dispatched_quantity = quantity
    contract.final_transportation_cost = payload.final_transportation_cost
    contract.final_cost = payload.final_cost
    _refresh_daily(contract)
    contract.loading_charges = payload.loading_charges
    contract.status = "Dispatched"
    contract.dispatched_at = datetime.now()
    db.commit()
    deployment.auto_deploy_due(db)  # already past its start date: it is deployed straight away
    return _out(_load(db, contract_id))


@router.post("/{contract_id}/send-more", response_model=ContractOut)
def send_more(contract_id: int, payload: SendMoreIn, db: DbSession):
    """Sends more units of materials that are already on a running contract, choosing where they are taken from.

    The costs on the contract are not changed: edit them if the extra materials change what is charged.
    """
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status not in ("Dispatched", "Deployed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "More materials can only be sent to a contract that has been dispatched and is not concluded")
    items = {item.material_id: item for item in contract.items}
    ids = [m.material_id for m in payload.materials]
    if len(set(ids)) != len(ids) or not set(ids) <= set(items):
        raise HTTPException(422, "Choose materials that are on this contract, once each.")
    # the contract's own units are already out of the yard, so nothing of its own is left out of the count here
    yard = stock_service.available_map(db, [items[i].material for i in ids])
    for entry in payload.materials:
        item = items[entry.material_id]
        added = stock_service.take_sources(db, contract, item, [(src.lot_id, src.quantity) for src in entry.sources], yard[entry.material_id])
        item.dispatched_quantity = (item.dispatched_quantity or 0) + added
    db.commit()
    return _out(_load(db, contract_id))


@router.post("/{contract_id}/deploy", response_model=ContractOut)
def deploy_contract(contract_id: int, db: DbSession, payload: DeployIn | None = None):
    """The work on site has officially started. Only a dispatched contract can be deployed.

    A contract is deployed by the system on its start date. Deploying it earlier means the work really
    started early, so (once the user confirms) the start date becomes today, the end date moves with it
    and the date the work was planned to start is kept in `plannedStartDate`.
    """
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status in ("Deployed", "Concluded", "Closed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract has already been deployed")
    if contract.status != "Dispatched":
        raise HTTPException(status.HTTP_409_CONFLICT, "Dispatch the contract before deploying it")

    today = deployment.today()
    if today < contract.start_date:
        if not (payload and payload.confirm_early_start):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"This contract is planned to start on {contract.start_date.isoformat()}. "
                "Confirm to start it today instead.",
            )
        contract.planned_start_date = contract.start_date
        contract.start_date = today
        _refresh_daily(contract)  # the end date moves with the start; the cost for a day is unchanged
    contract.status = "Deployed"
    contract.deployed_at = datetime.now()
    db.commit()
    return _out(_load(db, contract_id))


def _check_work_end(contract: Contract, day: date) -> None:
    today = deployment.today()
    if day < contract.start_date:
        raise HTTPException(422, f"The work can't have ended before the contract started on {contract.start_date.isoformat()}.")
    if day > today:
        raise HTTPException(422, "The work can't end in the future. Choose today or an earlier day.")


@router.post("/{contract_id}/conclude", response_model=ContractOut)
def conclude_contract(contract_id: int, payload: ConcludeIn, db: DbSession):
    """The work is finished and the contract is closed. Only a deployed contract can be concluded.

    `workEndedOn` is the day the work really ended (default: today). It can be earlier, so a contract that was
    forgotten for a while is not charged for days the customer did not use. `materials` says what came back for
    every material (in good condition and damaged); it can't be more than was dispatched.
    """
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status in ("Concluded", "Closed"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract has already been concluded")
    if contract.status != "Deployed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Deploy the contract before concluding it")
    day = payload.work_ended_on or deployment.today()
    _check_work_end(contract, day)

    items = {item.material_id: item for item in contract.items}
    back = {m.material_id: m for m in payload.materials}
    if len(back) != len(payload.materials) or set(back) != set(items):
        raise HTTPException(422, "Say how many of every material came back (0 if none), once each.")
    for material_id, returned in back.items():
        item = items[material_id]
        sent = item.dispatched_quantity if item.dispatched_quantity is not None else item.quantity
        if returned.intact + returned.damaged > sent:
            raise HTTPException(
                422,
                f"{item.name}: {returned.intact + returned.damaged} {item.quantity_unit} came back, but only {sent} were dispatched.",
            )
        if returned.destination not in (None, "") and returned.destination not in RETURN_DESTINATIONS:
            raise HTTPException(422, f"{item.name}: the destination must be one of: {', '.join(RETURN_DESTINATIONS)}.")
        if returned.intact + returned.damaged > 0 and not returned.destination:
            raise HTTPException(422, f"{item.name}: say where the materials that came back went ({' or '.join(RETURN_DESTINATIONS)}).")
    for material_id, returned in back.items():
        items[material_id].retrieved_intact = returned.intact
        items[material_id].retrieved_damaged = returned.damaged
        # nothing came back, so there is nowhere it went
        items[material_id].return_destination = returned.destination if returned.intact + returned.damaged > 0 else None
        items[material_id].return_site_note = (
            (returned.site_note or None) if returned.destination == "Moved to Another Site" and returned.intact > 0 else None
        )

    # units that move straight to another running contract: checked first, so a refusal changes nothing
    targets: dict[int, Contract] = {}
    for material_id, returned in back.items():
        if returned.assign_to_contract_id is None:
            continue
        item = items[material_id]
        if returned.destination != "Moved to Another Site" or returned.intact <= 0:
            raise HTTPException(422, f"{item.name}: only intact units that are moved to another site can be assigned to a contract.")
        target = _load(db, returned.assign_to_contract_id)
        if target is None or target.id == contract.id:
            raise HTTPException(422, f"{item.name}: choose another running contract to move the units to.")
        if target.status not in ("Dispatched", "Deployed") or not any(i.material_id == material_id for i in target.items):
            raise HTTPException(422, f"{item.name}: the contract with {target.customer.name} is not running, or does not have this material.")
        targets[material_id] = target

    contract.status = "Concluded"
    # when it was recorded: today on the server's clock (which the tests can move)
    contract.concluded_at = datetime.combine(deployment.today(), datetime.now().time())
    contract.work_ended_on = day
    db.flush()
    lots = stock_service.record_conclusion(db, contract)  # what came back goes where it belongs
    for material_id, target in targets.items():
        # the lot that was just made goes straight to the other contract: it never passes through the yard
        lot = lots[material_id]
        target_item = next(i for i in target.items if i.material_id == material_id)
        added = stock_service.take_sources(db, target, target_item, [(lot.id, lot.quantity)], 0)
        target_item.dispatched_quantity = (target_item.dispatched_quantity or 0) + added
    db.commit()
    return _out(_load(db, contract_id))


@router.post("/{contract_id}/close", response_model=ContractOut)
def close_contract(contract_id: int, db: DbSession):
    """The contract is closed for good. Only a concluded contract can be closed, once."""
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status == "Closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract has already been closed")
    if contract.status != "Concluded":
        raise HTTPException(status.HTTP_409_CONFLICT, "Conclude the contract before closing it")
    owed = _out(contract).total_outstanding
    if owed > 0.01:
        raise HTTPException(status.HTTP_409_CONFLICT, f"₹{owed:,.2f} is still unpaid: record the payments before closing")
    contract.status = "Closed"
    contract.closed_at = datetime.combine(deployment.today(), datetime.now().time())
    db.commit()
    return _out(_load(db, contract_id))


@router.post("/{contract_id}/adjust-end", response_model=ContractOut)
def adjust_work_end(contract_id: int, payload: AdjustEndIn, db: DbSession):
    """Corrects the day the work ended on a concluded contract (it changes the extension that is charged)."""
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status != "Concluded":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a concluded contract has an end day to correct")
    _check_work_end(contract, payload.work_ended_on)
    contract.work_ended_on = payload.work_ended_on
    db.commit()
    return _out(_load(db, contract_id))


@router.post("/{contract_id}/confirm-extension", response_model=ContractOut)
def confirm_extension(contract_id: int, db: DbSession):
    """The user confirms the work is still running past the end date, so the extension keeps being charged."""
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status != "Deployed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a deployed contract that has not been concluded can be confirmed")
    today = deployment.today()
    if today <= contract.end_date:
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract has not passed its end date yet: nothing to confirm")
    contract.extension_confirmed_until = today
    db.commit()
    return _out(_load(db, contract_id))


def _valid_lines(contract: Contract) -> dict[str, str]:
    """The billing lines a payment can be recorded against: {key: label}."""
    out = _out(contract)
    return {line.key: line.label for line in out.billing_lines}


@router.post("/{contract_id}/payments", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def add_payment(
    contract_id: int,
    db: DbSession,
    line: Annotated[str, Form()],
    amount: Annotated[float, Form()],
    paid_on: Annotated[date, Form(alias="paidOn")],
    proofs: Annotated[list[UploadFile], File()],
    method: Annotated[str | None, Form()] = None,
):
    """Records money the customer paid against one billing line (a month or the extended period).

    Needs 1 or 2 proof images. Paying less than the line's amount leaves a balance on that line; paying more
    is carried forward as credit to the next line.
    """
    deployment.auto_deploy_due(db)
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status not in ("Deployed", "Concluded"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Payments can only be recorded on a deployed or concluded contract")
    lines = _valid_lines(contract)
    if line not in lines:
        raise HTTPException(422, f"There is nothing billed under '{line}'. Choose one of: {', '.join(lines) or 'none yet'}.")
    if not (amount > 0) or amount > 1_000_000_000:
        raise HTTPException(422, "Enter the amount the customer paid (more than 0).")
    if round(amount, 2) != amount and abs(round(amount, 2) - amount) > 1e-9:
        raise HTTPException(422, "The amount can have at most 2 decimal places (paise).")
    if paid_on > deployment.today():
        raise HTTPException(422, "The payment date can't be in the future.")
    if method is not None and method != "" and method not in PAYMENT_METHODS:
        raise HTTPException(422, f"Payment method must be one of: {', '.join(PAYMENT_METHODS)}.")
    proofs = [p for p in proofs if p.filename]
    if not proofs:
        raise HTTPException(422, "Add a picture of the payment proof (1 or 2 images).")
    if len(proofs) > MAX_PROOFS:
        raise HTTPException(422, f"At most {MAX_PROOFS} proof images can be added.")

    payment = Payment(contract_id=contract.id, line=line, amount=round(amount, 2), paid_on=paid_on, method=method or None)
    db.add(payment)
    db.flush()
    try:
        for number, upload in enumerate(proofs, start=1):
            file_service.store_upload(db, upload, owner_type="payment", owner_id=payment.id, kind=f"proof{number}", rule=PROOF_RULE)
    except HTTPException:
        # a bad image: nothing is recorded, so the user can fix it and try again
        db.rollback()
        file_service.delete_owner_files(db, "payment", payment.id)
        db.commit()
        raise
    db.commit()
    return _out(_load(db, contract_id))


@router.get("/{contract_id}/payments/{payment_id}/proofs/{kind}")
def download_proof(contract_id: int, payment_id: int, kind: str, db: DbSession):
    payment = db.get(Payment, payment_id)
    if payment is None or payment.contract_id != contract_id:
        raise not_found("Payment")
    stored = file_service.get_stored(db, "payment", payment_id, kind)
    if stored is None:
        raise not_found("File")
    path = file_service.absolute_path(stored)
    if not path.exists():
        raise not_found("File")
    return FileResponse(path, media_type=stored.content_type, filename=stored.original_name, content_disposition_type="inline")


@router.post("/{contract_id}/payments/{payment_id}/void", response_model=ContractOut)
def void_payment(contract_id: int, payment_id: int, payload: VoidPaymentIn, db: DbSession):
    """A mistaken payment is voided with a reason, not deleted: it stops counting but stays on record."""
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.status == "Closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This contract is closed, so its payments can no longer be changed")
    payment = next((p for p in contract.payments if p.id == payment_id), None)
    if payment is None:
        raise not_found("Payment")
    if payment.voided_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment has already been voided")
    payment.voided_at = datetime.now()
    payment.void_reason = payload.reason
    db.commit()
    return _out(_load(db, contract_id))


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: int, db: DbSession):
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if contract.payments:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This contract has payments recorded against it, so it can't be deleted. Void the payments first if they were a mistake, or keep the contract as a record.",
        )
    db.delete(contract)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
