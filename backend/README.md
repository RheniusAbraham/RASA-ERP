# RASA ERP — Backend

FastAPI + SQLAlchemy 2 + Alembic. SQLite for now (switch to PostgreSQL by changing `DATABASE_URL`).

## Setup (Windows, from this folder)

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env        # optional, defaults already work
.venv\Scripts\alembic upgrade head
```

## Run

```powershell
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

- API docs (try every endpoint): http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health

> If `--reload` doesn't pick up a change, stop the server and start it again.

## Tests

```powershell
.venv\Scripts\python -m pytest
```

Tests use a throwaway in-memory database and a temporary upload folder, never `rasa_erp.db`.

## API (all under `/api/v1`, JSON in camelCase)

| Resource | Endpoints | Notes |
|---|---|---|
| `customers` | list, create, get, update, delete | can't be deleted while a contract uses them (409) |
| `materials` | list, create, get, update, delete | includes `totalQuantityOwned`; can't be deleted while a contract uses them (409) |
| `contracts` | list (`?customer_id=`), create, get, update, delete | takes `customerId` + `materialIds`; the response adds `dailyRate` and the month-by-month `breakdown` |
| `drivers` | list, create, get, update, delete | `licenseNumber` is unique |
| `staff` | list, create, get, update, delete | username = email; password is stored hashed and never returned; `staffId` and email are unique |
| `trucks` | list, create, get, update, delete | registration and chassis numbers are unique; `documents` holds the 7 compliance documents |

### Files (photos and PDF proofs)

Records are created with JSON first, then each file is uploaded on its own:

```
PUT    /{drivers|staff|trucks}/{id}/files/{kind}    multipart form, field name "file"
GET    /{drivers|staff|trucks}/{id}/files/{kind}    view / download
DELETE /{drivers|staff|trucks}/{id}/files/{kind}
```

| Resource | `kind` values |
|---|---|
| drivers | `photo` (image, optional), `aadhaarProof` (PDF), `licenseProof` (PDF) |
| staff | `photo` (image, optional), `aadharCard` (PDF) |
| trucks | `rc` and `insurance` (PDF or image); `fc`, `roadTax`, `nationalPermit`, `localPermit`, `pollution` (PDF) |

- Maximum size is 25MB (`MAX_UPLOAD_MB`). The real file type is checked from its first bytes, so a renamed file is rejected.
- Every record's response lists its uploaded `files` and a `missingFiles` list of required proofs not uploaded yet.
- Files are stored under `uploads/` and are removed when their record is deleted.

## Database migrations

```powershell
.venv\Scripts\alembic revision --autogenerate -m "describe the change"
.venv\Scripts\alembic upgrade head
```

New tables go in `app/models/` and must be imported in `app/models/__init__.py` so autogenerate sees them.

## Layout

```
app/
  main.py          FastAPI app + CORS
  core/            settings (.env), password hashing
  db/              engine, session, Base, TimestampMixin
  models/          SQLAlchemy tables
  schemas/         Pydantic request/response models
  api/v1/          routers, one file per resource (+ shared file-upload routes)
  services/        file storage, contract billing
alembic/           migrations
tests/
```
