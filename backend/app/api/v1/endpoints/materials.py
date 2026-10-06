from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import DbSession, conflict, not_found
from app.models.contract import contract_materials
from app.models.material import Material
from app.schemas.material import MaterialIn, MaterialOut

router = APIRouter(prefix="/materials", tags=["materials"])


@router.get("", response_model=list[MaterialOut])
def list_materials(db: DbSession):
    return db.scalars(select(Material).order_by(Material.id)).all()


@router.post("", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(payload: MaterialIn, db: DbSession):
    material = Material(**payload.model_dump())
    db.add(material)
    db.commit()
    return material


@router.get("/{material_id}", response_model=MaterialOut)
def get_material(material_id: int, db: DbSession):
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    return material


@router.put("/{material_id}", response_model=MaterialOut)
def update_material(material_id: int, payload: MaterialIn, db: DbSession):
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    for field, value in payload.model_dump().items():
        setattr(material, field, value)
    db.commit()
    return material


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: int, db: DbSession):
    material = db.get(Material, material_id)
    if material is None:
        raise not_found("Material")
    in_use = select(contract_materials.c.contract_id).where(contract_materials.c.material_id == material_id)
    if db.scalars(in_use).first() is not None:
        raise conflict("This material is used by a contract, so it can't be deleted. Remove it from those contracts first.")
    db.delete(material)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
