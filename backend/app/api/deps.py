from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db

DbSession = Annotated[Session, Depends(get_db)]


def not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def conflict(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message)


def ensure_unique(db: Session, column, value, message: str, *, exclude_id: int | None = None) -> None:
    """Raises 409 if another row already has this value in `column`."""
    model = column.class_
    query = select(model.id).where(column == value)
    if exclude_id is not None:
        query = query.where(model.id != exclude_id)
    if db.scalars(query).first() is not None:
        raise conflict(message)
