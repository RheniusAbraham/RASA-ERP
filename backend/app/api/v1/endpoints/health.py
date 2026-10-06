from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    """Liveness check that also proves the database is reachable."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "environment": settings.environment, "database": "ok"}
