# RASA ERP

A full-stack **Enterprise Resource Planning** system for a logistics/equipment-rental business. Manage customers, materials, drivers, staff, trucks, and the full contract lifecycle — from dispatch to payment collection.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python · FastAPI · SQLAlchemy 2 · Alembic |
| **Database** | SQLite (default) · PostgreSQL (supported) |
| **Frontend** | Next.js 16 · React 19 · TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Animations** | Motion (Framer Motion) |
| **Icons** | Lucide React |

---

## Project Structure

```
RASA-ERP/
├── backend/          ← FastAPI REST API (port 8000)
│   ├── app/
│   │   ├── api/v1/   ← Route handlers (one file per resource)
│   │   ├── core/     ← Config (.env), password hashing
│   │   ├── db/       ← Engine, session, Base, TimestampMixin
│   │   ├── models/   ← SQLAlchemy table definitions
│   │   ├── schemas/  ← Pydantic request/response models
│   │   ├── services/ ← File storage, billing, deployment logic
│   │   └── main.py   ← FastAPI app + CORS + background tasks
│   ├── alembic/      ← Database migrations
│   ├── tests/        ← Pytest test suite
│   └── requirements.txt
│
└── frontend/         ← Next.js web app (port 3000)
    └── src/
        ├── app/      ← Pages (App Router)
        └── components/ ← Shared + feature-specific components
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+

---

### Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements-dev.txt

# Configure environment (optional — defaults work out of the box)
cp .env.example .env

# Apply database migrations
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload --port 8000
```

- **API docs (Swagger UI):** http://localhost:8000/docs
- **Health check:** http://localhost:8000/api/v1/health

> The server automatically applies any pending migrations at startup (`MIGRATE_ON_STARTUP=true` by default). Set `MIGRATE_ON_STARTUP=false` to disable this.

---

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

- **App:** http://localhost:3000

---

### Environment Variables (Backend)

Copy `backend/.env.example` to `backend/.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `RASA ERP API` | API title shown in docs |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `API_PREFIX` | `/api/v1` | Base path for all routes |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed frontend origins |
| `DATABASE_URL` | `sqlite:///./rasa_erp.db` | Switch to PostgreSQL by changing this |
| `UPLOAD_DIR` | `uploads` | Where uploaded files are stored |
| `MIGRATE_ON_STARTUP` | `true` | Auto-migrate DB on server start |
| `MAX_UPLOAD_MB` | `25` | Max file upload size in MB |

**PostgreSQL example:**
```
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/rasa_erp
```

---

## Features

### Resources

| Resource | Capabilities |
|----------|-------------|
| **Customers** | CRUD · protected from deletion while a contract references them |
| **Materials** | CRUD · stock tracking · distribution view · stock correction actions |
| **Drivers** | CRUD · photo, Aadhaar proof, license proof uploads |
| **Staff** | CRUD · role management · password hashed, never returned · photo & Aadhaar uploads |
| **Trucks** | CRUD · 7 compliance document uploads (RC, insurance, FC, road tax, national permit, local permit, pollution) |
| **Contracts** | Full lifecycle (see below) · dispatch · deploy · conclude · close · payments · extensions |

### Contract Lifecycle

```
Estimated → Dispatched → Deployed → Concluded → Closed
```

| Stage | Trigger | Key Actions |
|-------|---------|-------------|
| **Estimated** | On creation | Set materials, dates, costs |
| **Dispatched** | `POST /{id}/dispatch` | Confirm quantities sent, final costs, loading charges |
| **Deployed** | Auto (on start date) or `POST /{id}/deploy` | Work begins; early start supported with confirmation |
| **Concluded** | `POST /{id}/conclude` | Record returned/damaged materials, set work-end date |
| **Closed** | `POST /{id}/close` | Final record; billing and payments locked |

### Stock Tracking

Every unit of a material is always in exactly one bucket:

| Bucket | Meaning |
|--------|---------|
| **Available (Yard)** | Ready to dispatch |
| **In Use** | Out on an active contract |
| **Elsewhere** | Waiting at another site |
| **Damaged** | In yard, not usable |
| **Lost** | Written off |

Manual corrections (`repair`, `write-off`, `mark-damaged`, `lot-to-yard`, `restore-lost`) are logged as ledger entries and never edited.

### Payments

- Billed per month of the contract + optional extension period
- Each billing line tracks: `amount`, `accrued`, `paid`, `dueNow`, `balance`, `status`
- Payment proofs (images, ≤ 25 MB each) are uploaded as attachments
- Voiding a mistaken payment keeps the record but stops it counting
- Credit balance carries forward automatically

### Contract Extensions

If work runs past the contract end date:
- 7 free days are charged before billing pauses (so forgotten contracts don't accumulate unlimited bills)
- `POST /{id}/confirm-extension` resets the 7-day window and allows more time
- Extension figures (`extensionElapsedDays`, `extensionAmount`, etc.) are computed on each request, not stored

---

## API Reference

All endpoints are under `/api/v1`. The interactive Swagger UI at `/docs` lets you try every endpoint.

### Key Endpoint Groups

```
/api/v1/customers
/api/v1/materials
/api/v1/materials/{id}/distribution
/api/v1/materials/lots/waiting
/api/v1/materials/{id}/stock-actions
/api/v1/drivers
/api/v1/staff
/api/v1/trucks
/api/v1/contracts
/api/v1/contracts/{id}/dispatch
/api/v1/contracts/{id}/deploy
/api/v1/contracts/{id}/conclude
/api/v1/contracts/{id}/close
/api/v1/contracts/{id}/confirm-extension
/api/v1/contracts/{id}/adjust-end
/api/v1/contracts/{id}/send-more
/api/v1/contracts/{id}/payments
/api/v1/contracts/{id}/payments/{paymentId}/void
```

### File Uploads

```
PUT    /{drivers|staff|trucks}/{id}/files/{kind}   # Upload
GET    /{drivers|staff|trucks}/{id}/files/{kind}   # View / download
DELETE /{drivers|staff|trucks}/{id}/files/{kind}   # Remove
```

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard (bento grid overview) |
| `/customers` | Customer list and management |
| `/drivers` | Driver records and documents |
| `/fleet` | Truck fleet and compliance documents |
| `/materials` | Materials, stock levels, distribution |
| `/staff` | Staff and role management |
| `/manage-contracts` | Active contract management |
| `/closed-contracts` | Historical closed contract records |

---

## Database Migrations

```bash
# Create a new migration after changing models
alembic revision --autogenerate -m "describe the change"

# Apply migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

> New models must be imported in `app/models/__init__.py` for Alembic's autogenerate to detect them.

---

## Running Tests

```bash
cd backend
source .venv/bin/activate
pytest
```

Tests use an isolated in-memory SQLite database and a temporary upload folder — the production `rasa_erp.db` is never touched.

---

## File Upload Notes

- Maximum file size: **25 MB** per file (configurable via `MAX_UPLOAD_MB`)
- File types are validated by their **actual byte content**, not just the extension — renamed files are rejected
- Uploaded files live under `uploads/` and are deleted when their parent record is deleted
- Payment proofs support 1–2 images per payment

---

## License

Private project. All rights reserved.
