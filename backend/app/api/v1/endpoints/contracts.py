from fastapi import APIRouter, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, not_found
from app.models.contract import Contract
from app.models.customer import Customer
from app.models.material import Material
from app.schemas.contract import BillingPeriodOut, ContractIn, ContractOut
from app.services.contract_billing import compute_breakdown

router = APIRouter(prefix="/contracts", tags=["contracts"])


def _out(contract: Contract) -> ContractOut:
    out = ContractOut.model_validate(contract)
    breakdown = compute_breakdown(
        start_date=contract.start_date,
        months=contract.months,
        days=contract.days,
        estimated_cost=contract.estimated_cost,
    )
    if breakdown is not None:
        out.daily_rate = breakdown.daily_rate
        out.breakdown = [
            BillingPeriodOut(label=p.label, from_=p.start, to=p.end, days=p.days, cost=p.cost) for p in breakdown.periods
        ]
    return out


def _load(db: DbSession, contract_id: int) -> Contract | None:
    return db.scalars(
        select(Contract)
        .options(selectinload(Contract.materials), selectinload(Contract.customer))
        .where(Contract.id == contract_id)
    ).first()


def _materials(db: DbSession, ids: list[int]) -> list[Material]:
    found = {m.id: m for m in db.scalars(select(Material).where(Material.id.in_(ids)))}
    missing = [i for i in ids if i not in found]
    if missing:
        raise not_found(f"Material(s) {missing}")
    return [found[i] for i in ids]


@router.get("", response_model=list[ContractOut])
def list_contracts(db: DbSession, customer_id: int | None = None):
    query = (
        select(Contract)
        .options(selectinload(Contract.materials), selectinload(Contract.customer))
        .order_by(Contract.id)
    )
    if customer_id is not None:
        query = query.where(Contract.customer_id == customer_id)
    return [_out(c) for c in db.scalars(query)]


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def create_contract(payload: ContractIn, db: DbSession):
    if db.get(Customer, payload.customer_id) is None:
        raise not_found("Customer")
    contract = Contract(**payload.model_dump(exclude={"material_ids"}), materials=_materials(db, payload.material_ids))
    db.add(contract)
    db.commit()
    return _out(_load(db, contract.id))


@router.get("/{contract_id}", response_model=ContractOut)
def get_contract(contract_id: int, db: DbSession):
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    return _out(contract)


@router.put("/{contract_id}", response_model=ContractOut)
def update_contract(contract_id: int, payload: ContractIn, db: DbSession):
    contract = _load(db, contract_id)
    if contract is None:
        raise not_found("Contract")
    if db.get(Customer, payload.customer_id) is None:
        raise not_found("Customer")
    for field, value in payload.model_dump(exclude={"material_ids"}).items():
        setattr(contract, field, value)
    contract.materials = _materials(db, payload.material_ids)
    db.commit()
    return _out(_load(db, contract_id))


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contract(contract_id: int, db: DbSession):
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise not_found("Contract")
    db.delete(contract)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
