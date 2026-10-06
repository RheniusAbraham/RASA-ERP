from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, conflict, not_found
from app.models.contract import Contract
from app.models.customer import Customer
from app.schemas.customer import CustomerIn, CustomerOut

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerOut])
def list_customers(db: DbSession):
    return db.scalars(select(Customer).order_by(Customer.id)).all()


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerIn, db: DbSession):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: DbSession):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise not_found("Customer")
    return customer


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, payload: CustomerIn, db: DbSession):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise not_found("Customer")
    for field, value in payload.model_dump().items():
        setattr(customer, field, value)
    db.commit()
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: DbSession):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise not_found("Customer")
    if db.scalars(select(Contract.id).where(Contract.customer_id == customer_id)).first() is not None:
        raise conflict("This customer has contracts, so it can't be deleted. Delete those contracts first.")
    db.delete(customer)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
