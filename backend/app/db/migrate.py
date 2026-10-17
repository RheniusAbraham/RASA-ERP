"""Brings the database up to the latest schema.

Run when the API starts, so the code can never run against an older database (a missing column would
otherwise fail every request that touches it). The same as `alembic upgrade head`.
"""

import logging

from alembic import command
from alembic.config import Config

from app.core.config import BACKEND_DIR

log = logging.getLogger("uvicorn.error")


def upgrade_to_head() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # Alembic's own logging setup would switch off the server's loggers, so leave logging alone here
    config.attributes["configure_logger"] = False
    log.info("Checking the database schema...")
    command.upgrade(config, "head")
    log.info("Database schema is up to date.")
