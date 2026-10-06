from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, ensure_unique, not_found
from app.api.v1.endpoints._files import add_file_routes
from app.core.config import settings
from app.models.driver import Driver
from app.schemas.driver import DriverIn, DriverOut
from app.services import files as file_service
from app.services.files import DRIVER_FILES

router = APIRouter(prefix="/drivers", tags=["drivers"])
add_file_routes(router, resource="drivers", owner_type="driver", model=Driver, label="Driver", rules=DRIVER_FILES)

LICENSE_TAKEN = "Another driver already has this license number"


def _out(driver: Driver, files: dict) -> DriverOut:
    out = DriverOut.model_validate(driver)
    out.files = file_service.describe(files, f"{settings.api_prefix}/drivers/{driver.id}")
    out.missing_files = file_service.missing_kinds(DRIVER_FILES, files)
    return out


@router.get("", response_model=list[DriverOut])
def list_drivers(db: DbSession):
    drivers = db.scalars(select(Driver).order_by(Driver.id)).all()
    files = file_service.files_for(db, "driver", [d.id for d in drivers])
    return [_out(d, files.get(d.id, {})) for d in drivers]


@router.post("", response_model=DriverOut, status_code=status.HTTP_201_CREATED)
def create_driver(payload: DriverIn, db: DbSession):
    ensure_unique(db, Driver.license_number, payload.license_number, LICENSE_TAKEN)
    driver = Driver(**payload.model_dump())
    db.add(driver)
    db.commit()
    return _out(driver, {})


@router.get("/{driver_id}", response_model=DriverOut)
def get_driver(driver_id: int, db: DbSession):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise not_found("Driver")
    return _out(driver, file_service.files_for(db, "driver", [driver_id]).get(driver_id, {}))


@router.put("/{driver_id}", response_model=DriverOut)
def update_driver(driver_id: int, payload: DriverIn, db: DbSession):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise not_found("Driver")
    ensure_unique(db, Driver.license_number, payload.license_number, LICENSE_TAKEN, exclude_id=driver_id)
    for field, value in payload.model_dump().items():
        setattr(driver, field, value)
    db.commit()
    return _out(driver, file_service.files_for(db, "driver", [driver_id]).get(driver_id, {}))


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(driver_id: int, db: DbSession):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise not_found("Driver")
    file_service.delete_owner_files(db, "driver", driver_id)
    db.delete(driver)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
