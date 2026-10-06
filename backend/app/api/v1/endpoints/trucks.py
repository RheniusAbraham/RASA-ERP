from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, ensure_unique, not_found
from app.api.v1.endpoints._files import add_file_routes
from app.core.config import settings
from app.models.truck import Truck, TruckDocument
from app.schemas.truck import TRUCK_DOC_TYPES, TruckDocumentOut, TruckIn, TruckOut
from app.services import files as file_service
from app.services.files import TRUCK_FILES

router = APIRouter(prefix="/trucks", tags=["trucks"])
add_file_routes(router, resource="trucks", owner_type="truck", model=Truck, label="Truck", rules=TRUCK_FILES)

REGISTRATION_TAKEN = "Another truck already has this registration number"
CHASSIS_TAKEN = "Another truck already has this chassis number"


def _out(truck: Truck, files: dict) -> TruckOut:
    info = file_service.describe(files, f"{settings.api_prefix}/trucks/{truck.id}")
    by_type = {d.doc_type: d for d in truck.documents}
    documents = {
        doc_type: TruckDocumentOut(
            number=by_type[doc_type].number,
            validity=by_type[doc_type].validity,
            expense=by_type[doc_type].expense,
            file=info.get(doc_type),
        )
        for doc_type in TRUCK_DOC_TYPES
        if doc_type in by_type
    }
    return TruckOut(
        id=truck.id,
        registration_number=truck.registration_number,
        manufacturer=truck.manufacturer,
        model_name=truck.model_name,
        chassis_number=truck.chassis_number,
        year_of_manufacture=truck.year_of_manufacture,
        truck_type=truck.truck_type,
        odometer=truck.odometer,
        fuel_capacity=truck.fuel_capacity,
        tyre_layout=truck.tyre_layout,
        documents=documents,
        missing_files=file_service.missing_kinds(TRUCK_FILES, files),
        created_at=truck.created_at,
    )


@router.get("", response_model=list[TruckOut])
def list_trucks(db: DbSession):
    trucks = db.scalars(select(Truck).order_by(Truck.id)).all()
    files = file_service.files_for(db, "truck", [t.id for t in trucks])
    return [_out(t, files.get(t.id, {})) for t in trucks]


@router.post("", response_model=TruckOut, status_code=status.HTTP_201_CREATED)
def create_truck(payload: TruckIn, db: DbSession):
    ensure_unique(db, Truck.registration_number, payload.registration_number, REGISTRATION_TAKEN)
    ensure_unique(db, Truck.chassis_number, payload.chassis_number, CHASSIS_TAKEN)
    truck = Truck(
        **payload.model_dump(exclude={"documents"}),
        documents=[TruckDocument(doc_type=kind, **doc.model_dump()) for kind, doc in payload.documents.items()],
    )
    db.add(truck)
    db.commit()
    return _out(truck, {})


@router.get("/{truck_id}", response_model=TruckOut)
def get_truck(truck_id: int, db: DbSession):
    truck = db.get(Truck, truck_id)
    if truck is None:
        raise not_found("Truck")
    return _out(truck, file_service.files_for(db, "truck", [truck_id]).get(truck_id, {}))


@router.put("/{truck_id}", response_model=TruckOut)
def update_truck(truck_id: int, payload: TruckIn, db: DbSession):
    truck = db.get(Truck, truck_id)
    if truck is None:
        raise not_found("Truck")
    ensure_unique(db, Truck.registration_number, payload.registration_number, REGISTRATION_TAKEN, exclude_id=truck_id)
    ensure_unique(db, Truck.chassis_number, payload.chassis_number, CHASSIS_TAKEN, exclude_id=truck_id)
    for field, value in payload.model_dump(exclude={"documents"}).items():
        setattr(truck, field, value)
    for document in truck.documents:  # uploaded proofs are kept; only the details change
        new = payload.documents[document.doc_type]
        document.number, document.validity, document.expense = new.number, new.validity, new.expense
    db.commit()
    return _out(truck, file_service.files_for(db, "truck", [truck_id]).get(truck_id, {}))


@router.delete("/{truck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_truck(truck_id: int, db: DbSession):
    truck = db.get(Truck, truck_id)
    if truck is None:
        raise not_found("Truck")
    file_service.delete_owner_files(db, "truck", truck_id)
    db.delete(truck)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
