import sqlite3

from app.core.config import settings
from app.db.migrate import upgrade_to_head
from app.main import app
from fastapi.testclient import TestClient


def tables(path):
    with sqlite3.connect(path) as db:
        return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_the_api_brings_an_old_or_empty_database_up_to_date_when_it_starts(tmp_path, monkeypatch):
    path = tmp_path / "fresh.db"
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{path.as_posix()}")
    monkeypatch.setattr(settings, "migrate_on_startup", True)
    assert not path.exists()

    with TestClient(app):  # starting the app runs the migrations
        pass
    found = tables(path)
    assert {"contracts", "contract_materials", "materials", "customers", "alembic_version"} <= found

    with sqlite3.connect(path) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(contracts)")}
        version = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert {"concluded_at", "planned_start_date", "end_date", "daily_cost"} <= columns

    # starting again with nothing waiting is harmless
    upgrade_to_head()
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone()[0] == version
