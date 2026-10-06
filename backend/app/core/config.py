from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "RASA ERP API"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000"]

    # SQLite for now; switching to PostgreSQL later only means changing this URL.
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'rasa_erp.db').as_posix()}"

    # Where uploaded PDFs / photos are stored
    upload_dir: Path = BACKEND_DIR / "uploads"
    max_upload_mb: float = 25

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)


settings = Settings()
