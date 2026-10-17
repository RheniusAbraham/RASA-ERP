from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import DbSession, conflict, not_found
from app.models.contract import Contract, ContractMaterial, contract_materials
from app.models.material import Material
from app.models.stock import StockLot, StockMovement
from app.schemas.material import (
    DistributionItemOut,
    LotOut,
    MaterialDistributionOut,
    MaterialIn,
    MaterialOut,
    MovementOut,
    StockActionIn,
    WaitingLotOut,
)
from app.services import deployment
from app.services import stock as stock_service

router = APIRouter(prefix="/materials", tags=["materials"])


def _local_date(stamp: datetime) -> date:
    """Stored timestamps are in UTC; show the day on the server's own clock, the same one `today` uses."""
    return stamp.replace(tzinfo=timezone.utc).astimezone().date()


def _out(db: Session, materials: list[Material]) -> list[MaterialOut]:
    outside = stock_service.outside_contracts(db, [m.id for m in materials])
    result = []
    for material in materials:
        out = MaterialOut.model_validate(material)
        out.lost, out.damaged, out.elsewhere = outside[material.id].lost, outside[material.id].damaged, outside[material.id].elsewhere
        result.append(out)
    return result


@router.get("", response_model=list[MaterialOut])
def list_materials(db: DbSession):
    return _out(db, list(db.scalars(select(Material).order_by(Material.id)).all()))


@router.post("", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(payload: MaterialIn, db: DbSession):
    material = Material(**payload.model_dump())
    db.add(material)
    db.commit()
    return _out(db, [material])[0]


@router.get("/lots/waiting", response_model=list[WaitingLotOut])
def waiting_lots(db: DbSession):
    """Every lot of free units waiting at another site, longest waiting first (the bell warns about old ones)."""
    today = deployment.today()
    rows = db.execute(
        select(StockLot, Material).join(Material, Material.id == StockLot.material_id).order_by(StockLot.created_at)
    ).all()
    result = []
    for lot, material in rows:
        contract = db.get(Contract, lot.contract_id) if lot.contract_id else None
        result.append(
            WaitingLotOut(
                lot_id=lot.id,
                material_id=material.id,
                material_name=material.name,
                quantity=lot.quantity,
                quantity_unit=material.quantity_unit,
                note=lot.note,
                from_customer=contract.customer.name if contract else None,
                days_waiting=max((today - _local_date(lot.created_at)).days, 0),
            )
        )
    return result


@router.get("/{material_id}", response_model=MaterialOut)
def get_material(material_id: int, db: DbSession):
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    return _out(db, [material])[0]


def _distribution(db: Session, material: Material) -> MaterialDistributionOut:
    rows = db.execute(
        select(Contract, ContractMaterial)
        .join(ContractMaterial, ContractMaterial.contract_id == Contract.id)
        .where(ContractMaterial.material_id == material.id)
        .options(selectinload(Contract.customer))
        .order_by(Contract.id)
    ).all()
    contracts = [
        DistributionItemOut(
            contract_id=contract.id,
            customer_name=contract.customer.name,
            site_address=contract.site_address,
            status=contract.status,
            holding=contract.status not in ("Concluded", "Closed"),
            start_date=contract.start_date,
            end_date=contract.end_date,
            dispatched_at=contract.dispatched_at,
            planned_quantity=line.quantity,
            dispatched_quantity=line.dispatched_quantity,
            quantity=line.dispatched_quantity if line.dispatched_quantity is not None else line.quantity,
            retrieved_intact=line.retrieved_intact,
            retrieved_damaged=line.retrieved_damaged,
            return_destination=line.return_destination,
        )
        for contract, line in rows
    ]
    outside = stock_service.outside_contracts(db, [material.id])[material.id]
    held = sum(c.quantity for c in contracts if c.holding)
    dispatched_held = sum(c.quantity for c in contracts if c.holding and c.status != "Estimated")
    planned_held = held - dispatched_held
    owned = stock_service.owned(material, outside)

    today = deployment.today()
    lots = [
        LotOut(
            id=lot.id,
            quantity=lot.quantity,
            note=lot.note,
            from_customer=lot_customers.get(lot.contract_id),
            since=_local_date(lot.created_at),
            days_waiting=max((today - _local_date(lot.created_at)).days, 0),
        )
        for lot_customers in [{c.id: c.customer.name for c, _ in rows}]
        for lot in db.scalars(select(StockLot).where(StockLot.material_id == material.id).order_by(StockLot.id))
    ]
    names = {c.id: c.customer.name for c, _ in rows}
    movements = [
        MovementOut(
            id=m.id, kind=m.kind, quantity=m.quantity, contract_id=m.contract_id,
            customer_name=names.get(m.contract_id), reason=m.reason, created_at=m.created_at,
        )
        for m in db.scalars(
            select(StockMovement).where(StockMovement.material_id == material.id).order_by(StockMovement.id.desc()).limit(100)
        )
    ]
    return MaterialDistributionOut(
        total_owned=owned,
        in_use=held,
        available=stock_service.yard_free(owned, outside.damaged, outside.elsewhere, dispatched_held, planned_held),
        elsewhere=outside.elsewhere,
        damaged=outside.damaged,
        lost=outside.lost,
        quantity_unit=material.quantity_unit,
        contracts=contracts,
        lots=lots,
        movements=movements,
    )


@router.get("/{material_id}/distribution", response_model=MaterialDistributionOut)
def material_distribution(material_id: int, db: DbSession):
    """Where the stock of this material is: in the yard, in use on contracts, damaged, waiting at another site, lost."""
    deployment.auto_deploy_due(db)
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    return _distribution(db, material)


@router.post("/{material_id}/stock-actions", response_model=MaterialDistributionOut)
def stock_action(material_id: int, payload: StockActionIn, db: DbSession):
    """Moves units between the stock buckets, with a reason: repair or scrap damaged units, mark units damaged,
    write off units from the yard, bring units waiting at another site to the yard, or restore units written off."""
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    current = _distribution(db, material)
    q, action = payload.quantity, payload.action

    def need(have: int, what: str) -> None:
        if q > have:
            raise HTTPException(422, f"Only {have} {material.quantity_unit} {what}, but {q} were given.")

    if action in ("repair", "write-off-damaged"):
        need(current.damaged, "are damaged")
        kind = stock_service.REPAIRED if action == "repair" else stock_service.WRITTEN_OFF_DAMAGED
    elif action in ("mark-damaged", "write-off-yard"):
        need(current.available, "are in the yard and available")
        kind = stock_service.MARKED_DAMAGED if action == "mark-damaged" else stock_service.WRITTEN_OFF_YARD
    elif action == "restore-lost":
        need(current.lost, "have been written off")
        kind = stock_service.RESTORED
    else:  # lot-to-yard
        lot = db.get(StockLot, payload.lot_id) if payload.lot_id else None
        if lot is None or lot.material_id != material.id:
            raise HTTPException(422, "Choose the lot of units waiting at another site.")
        need(lot.quantity, "are waiting in that lot")
        lot.quantity -= q
        if lot.quantity == 0:
            db.delete(lot)
        kind = stock_service.LOT_TO_YARD
    stock_service.record(db, material.id, kind, q, reason=payload.reason)
    db.commit()
    return _distribution(db, material)


@router.put("/{material_id}", response_model=MaterialOut)
def update_material(material_id: int, payload: MaterialIn, db: DbSession):
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    for field, value in payload.model_dump().items():
        setattr(material, field, value)
    db.commit()
    return _out(db, [material])[0]


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: int, db: DbSession):
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    in_use = select(contract_materials.c.contract_id).where(contract_materials.c.material_id == material_id)
    if db.scalars(in_use).first() is not None:
        raise conflict("This material is used by a contract, so it can't be deleted. Remove it from those contracts first.")
    if db.scalars(select(StockMovement.id).where(StockMovement.material_id == material_id)).first() is not None:
        raise conflict("This material has stock movements on record, so it can't be deleted.")
    db.delete(material)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
