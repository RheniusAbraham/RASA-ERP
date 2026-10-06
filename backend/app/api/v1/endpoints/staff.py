from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, ensure_unique, not_found
from app.api.v1.endpoints._files import add_file_routes
from app.core.config import settings
from app.core.security import hash_password
from app.models.staff import Staff
from app.schemas.staff import StaffCreate, StaffOut, StaffUpdate
from app.services import files as file_service
from app.services.files import STAFF_FILES

router = APIRouter(prefix="/staff", tags=["staff"])
add_file_routes(router, resource="staff", owner_type="staff", model=Staff, label="Staff member", rules=STAFF_FILES)

STAFF_ID_TAKEN = "Another staff member already has this Staff ID"
EMAIL_TAKEN = "Another staff member already uses this email (it is the login username)"


def _out(member: Staff, files: dict) -> StaffOut:
    out = StaffOut.model_validate(member)
    out.files = file_service.describe(files, f"{settings.api_prefix}/staff/{member.id}")
    out.missing_files = file_service.missing_kinds(STAFF_FILES, files)
    return out


@router.get("", response_model=list[StaffOut])
def list_staff(db: DbSession):
    members = db.scalars(select(Staff).order_by(Staff.id)).all()
    files = file_service.files_for(db, "staff", [m.id for m in members])
    return [_out(m, files.get(m.id, {})) for m in members]


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(payload: StaffCreate, db: DbSession):
    username = payload.email.lower()
    ensure_unique(db, Staff.staff_id, payload.staff_id, STAFF_ID_TAKEN)
    ensure_unique(db, Staff.username, username, EMAIL_TAKEN)
    member = Staff(
        **payload.model_dump(exclude={"password"}),
        username=username,
        password_hash=hash_password(payload.password),
    )
    db.add(member)
    db.commit()
    return _out(member, {})


@router.get("/{staff_pk}", response_model=StaffOut)
def get_staff(staff_pk: int, db: DbSession):
    member = db.get(Staff, staff_pk)
    if member is None:
        raise not_found("Staff member")
    return _out(member, file_service.files_for(db, "staff", [staff_pk]).get(staff_pk, {}))


@router.put("/{staff_pk}", response_model=StaffOut)
def update_staff(staff_pk: int, payload: StaffUpdate, db: DbSession):
    member = db.get(Staff, staff_pk)
    if member is None:
        raise not_found("Staff member")
    username = payload.email.lower()
    ensure_unique(db, Staff.staff_id, payload.staff_id, STAFF_ID_TAKEN, exclude_id=staff_pk)
    ensure_unique(db, Staff.username, username, EMAIL_TAKEN, exclude_id=staff_pk)
    for field, value in payload.model_dump(exclude={"password"}).items():
        setattr(member, field, value)
    member.username = username
    if payload.password:
        member.password_hash = hash_password(payload.password)
    db.commit()
    return _out(member, file_service.files_for(db, "staff", [staff_pk]).get(staff_pk, {}))


@router.delete("/{staff_pk}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staff(staff_pk: int, db: DbSession):
    member = db.get(Staff, staff_pk)
    if member is None:
        raise not_found("Staff member")
    file_service.delete_owner_files(db, "staff", staff_pk)
    db.delete(member)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
