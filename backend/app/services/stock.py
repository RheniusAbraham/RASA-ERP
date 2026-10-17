"""Where every unit of a material is.

A unit is always in exactly one place:

    Yard (available) · At another site (free) · Damaged (in the yard, not usable) · Lost (written off) ·
    In use on one open contract

    Total owned (after write-offs) = Yard + At another site + Damaged + In use

The user enters the baseline `total_quantity_owned`. What came back when a contract was concluded, and later
corrections, are recorded in the stock ledger (`stock_movements`); the damaged and lost totals are worked out from it,
and units waiting at other sites are kept as lots. "Available" for a new contract is what is in the yard.
"""

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.contract import Contract, ContractMaterial
from app.models.material import Material
from app.models.stock import ContractMaterialSource, StockLot, StockMovement

# ---- the kinds of ledger entry ----
RETURNED_TO_YARD = "Returned to yard"  # intact units came back to the yard
MOVED_TO_SITE = "Moved to another site"  # intact units went to another site (a lot is kept)
DAMAGED = "Damaged"  # damaged units came back
LOST = "Lost"  # units that were dispatched and did not come back: written off
REPAIRED = "Repaired"  # damaged units are usable again (back to the yard)
WRITTEN_OFF_DAMAGED = "Written off (damaged)"  # damaged units scrapped
MARKED_DAMAGED = "Marked damaged"  # units found damaged in the yard
LOT_TO_YARD = "Moved to yard"  # units waiting at another site were brought to the yard
WRITTEN_OFF_YARD = "Written off (yard)"  # units from the yard written off
RESTORED = "Restored"  # units written off as lost turned up again
TAKEN_FROM_SITE = "Taken from another site"  # free units waiting at another site were dispatched to a contract

_ADDS_DAMAGED = (DAMAGED, MARKED_DAMAGED)
_REMOVES_DAMAGED = (REPAIRED, WRITTEN_OFF_DAMAGED)
_ADDS_LOST = (LOST, WRITTEN_OFF_DAMAGED, WRITTEN_OFF_YARD)
_REMOVES_LOST = (RESTORED,)


@dataclass(frozen=True)
class Outside:
    """What is held outside the open contracts."""

    lost: int = 0
    damaged: int = 0
    elsewhere: int = 0


def _kind_totals(db: Session, material_ids: list[int], kinds: tuple[str, ...]) -> dict[int, int]:
    rows = db.execute(
        select(StockMovement.material_id, func.sum(StockMovement.quantity))
        .where(StockMovement.material_id.in_(material_ids), StockMovement.kind.in_(kinds))
        .group_by(StockMovement.material_id)
    ).all()
    return {material_id: int(total) for material_id, total in rows}


def outside_contracts(db: Session, material_ids: list[int]) -> dict[int, Outside]:
    """Lost, damaged and waiting-at-another-site units of several materials, in a few queries."""
    if not material_ids:
        return {}
    adds_damaged = _kind_totals(db, material_ids, _ADDS_DAMAGED)
    removes_damaged = _kind_totals(db, material_ids, _REMOVES_DAMAGED)
    adds_lost = _kind_totals(db, material_ids, _ADDS_LOST)
    removes_lost = _kind_totals(db, material_ids, _REMOVES_LOST)
    elsewhere = dict(
        db.execute(
            select(StockLot.material_id, func.sum(StockLot.quantity))
            .where(StockLot.material_id.in_(material_ids))
            .group_by(StockLot.material_id)
        ).all()
    )
    return {
        i: Outside(
            lost=max(adds_lost.get(i, 0) - removes_lost.get(i, 0), 0),
            damaged=max(adds_damaged.get(i, 0) - removes_damaged.get(i, 0), 0),
            elsewhere=int(elsewhere.get(i, 0)),
        )
        for i in material_ids
    }


def holds(db: Session, material_ids: list[int], excluding_contract: int = 0) -> dict[int, tuple[int, int]]:
    """What open contracts hold of each material, as (dispatched, planned).

    A dispatched contract holds what it sent (those units are out of the yard); a contract that is not dispatched yet
    holds what is planned. A concluded contract holds nothing: what came back is accounted for in the buckets.
    """
    if not material_ids:
        return {}
    rows = db.execute(
        select(ContractMaterial.material_id, Contract.status, func.sum(func.coalesce(ContractMaterial.dispatched_quantity, ContractMaterial.quantity)))
        .join(Contract, Contract.id == ContractMaterial.contract_id)
        .where(
            ContractMaterial.material_id.in_(material_ids),
            ContractMaterial.contract_id != excluding_contract,
            Contract.status.notin_(("Concluded", "Closed")),
        )
        .group_by(ContractMaterial.material_id, Contract.status)
    ).all()
    result: dict[int, list[int]] = {}
    for material_id, status, total in rows:
        pair = result.setdefault(material_id, [0, 0])
        pair[1 if status == "Estimated" else 0] += int(total)
    return {i: (pair[0], pair[1]) for i, pair in result.items()}


def in_use(db: Session, material_ids: list[int], excluding_contract: int = 0) -> dict[int, int]:
    """Units held by open contracts, dispatched and planned together."""
    return {i: dispatched + planned for i, (dispatched, planned) in holds(db, material_ids, excluding_contract).items()}


def yard_free(owned_now: int, damaged: int, elsewhere: int, dispatched: int, planned: int) -> int:
    """What is in the yard and not promised to a contract that must take it from the yard.

    Contracts that are only planned can take their units from the free lots waiting at other sites first, so they
    only hold the yard for what the lots cannot cover.
    """
    return max(owned_now - damaged - elsewhere - dispatched - max(planned - elsewhere, 0), 0)


def owned(material: Material, outside: Outside) -> int:
    """Total owned after write-offs."""
    return material.total_quantity_owned - outside.lost


def available_map(db: Session, materials: list[Material], excluding_contract: int = 0, *, with_other_sites: bool = False) -> dict[int, int]:
    """What a contract can still take, for each material (never below 0).

    By default that is what is in the yard. With `with_other_sites` it is what can be planned: the free units waiting
    at other sites count too, since they can be dispatched from where they are, and every open contract holds its share.
    `excluding_contract` leaves that contract's own lines out, so editing a contract does not count against itself.
    """
    ids = [m.id for m in materials]
    outside = outside_contracts(db, ids)
    held = holds(db, ids, excluding_contract)
    result = {}
    for m in materials:
        out, (dispatched, planned) = outside[m.id], held.get(m.id, (0, 0))
        if with_other_sites:
            result[m.id] = max(owned(m, out) - out.damaged - dispatched - planned, 0)
        else:
            result[m.id] = yard_free(owned(m, out), out.damaged, out.elsewhere, dispatched, planned)
    return result


def record(db: Session, material_id: int, kind: str, quantity: int, *, contract_id: int | None = None, reason: str | None = None) -> None:
    if quantity > 0:
        db.add(StockMovement(material_id=material_id, contract_id=contract_id, kind=kind, quantity=quantity, reason=reason))


def record_conclusion(db: Session, contract: Contract) -> dict[int, StockLot]:
    """Puts what came back when a contract was concluded where it belongs. The caller commits.

    Returns the lots of free units waiting at another site that were made, by material id.
    """
    made: dict[int, StockLot] = {}
    for item in contract.items:
        sent = item.dispatched_quantity if item.dispatched_quantity is not None else item.quantity
        intact, damaged = item.retrieved_intact or 0, item.retrieved_damaged or 0
        missing = max(sent - intact - damaged, 0)
        if item.return_destination == "Moved to Another Site" and intact > 0:
            record(db, item.material_id, MOVED_TO_SITE, intact, contract_id=contract.id)
            lot = StockLot(material_id=item.material_id, contract_id=contract.id, quantity=intact, note=item.return_site_note)
            db.add(lot)
            made[item.material_id] = lot
        else:
            record(db, item.material_id, RETURNED_TO_YARD, intact, contract_id=contract.id)
        record(db, item.material_id, DAMAGED, damaged, contract_id=contract.id)
        record(db, item.material_id, LOST, missing, contract_id=contract.id)
    db.flush()
    return made


def lot_label(lot: StockLot) -> str:
    """Where a lot is, in words: the note the user gave, or the site it came from."""
    if lot.note:
        return lot.note
    contract = lot.contract_id and lot_contract(lot)
    return f"From {contract.site_address[:80]}" if contract else "Another site"


def lot_contract(lot: StockLot) -> Contract | None:
    from sqlalchemy.orm import object_session

    db = object_session(lot)
    return db.get(Contract, lot.contract_id) if db is not None and lot.contract_id else None


def take_sources(
    db: Session,
    contract: Contract,
    item: ContractMaterial,
    sources: list[tuple[int | None, int]],
    yard_free: int,
) -> int:
    """Takes units for a contract's material from the sources the user chose: (lot id or None for the yard, quantity).

    The yard part can't be more than `yard_free` and a lot part can't be more than the lot holds. Returns the total.
    Nothing is changed if a check fails, because the checks run before the first change.
    """
    wanted_yard = 0
    wanted_lots: dict[int, int] = {}
    for lot_id, quantity in sources:
        if lot_id is None:
            wanted_yard += quantity
        else:
            wanted_lots[lot_id] = wanted_lots.get(lot_id, 0) + quantity
    if wanted_yard > yard_free:
        raise HTTPException(422, f"{item.name}: only {yard_free} {item.quantity_unit} are in the yard, but {wanted_yard} were taken from it.")
    lots: dict[int, StockLot] = {}
    for lot_id, quantity in wanted_lots.items():
        lot = db.get(StockLot, lot_id)
        if lot is None or lot.material_id != item.material_id:
            raise HTTPException(422, f"{item.name}: that lot of units waiting at another site does not exist.")
        if quantity > lot.quantity:
            raise HTTPException(422, f"{item.name}: only {lot.quantity} {item.quantity_unit} are waiting at {lot_label(lot)}, but {quantity} were taken.")
        lots[lot_id] = lot

    if wanted_yard:
        db.add(ContractMaterialSource(contract_id=contract.id, material_id=item.material_id, lot_id=None, label="Yard", quantity=wanted_yard))
    for lot_id, quantity in wanted_lots.items():
        lot = lots[lot_id]
        db.add(ContractMaterialSource(contract_id=contract.id, material_id=item.material_id, lot_id=lot.id, label=lot_label(lot), quantity=quantity))
        record(db, item.material_id, TAKEN_FROM_SITE, quantity, contract_id=contract.id, reason=f"Taken from {lot_label(lot)}")
        lot.quantity -= quantity
        if lot.quantity == 0:
            db.delete(lot)
    return wanted_yard + sum(wanted_lots.values())
