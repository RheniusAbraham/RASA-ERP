from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (registers tables)
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Smallest valid-looking files for the upload tests (the server checks the first bytes)
PDF_BYTES = b"%PDF-1.4\n%RASA test document\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
NOT_A_REAL_FILE = b"MZ\x90\x00 this is an executable, not a document"


@pytest.fixture(autouse=True)
def no_startup_migrations(monkeypatch):
    """The tests use their own throwaway database; the app must not migrate the real rasa_erp.db when it starts."""
    monkeypatch.setattr(settings, "migrate_on_startup", False)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    """Pretend it is 1 April 2026, so the 1 May 2026 contracts used in the tests are still in the future.
    Tests about the start date arriving change it again with monkeypatch."""
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 4, 1))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A client backed by a throwaway in-memory database and upload folder,
    so tests never touch rasa_erp.db or the real uploads."""
    monkeypatch.setattr(settings, "upload_dir", tmp_path / "uploads")

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()
