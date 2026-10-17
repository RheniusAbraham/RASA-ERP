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

The API applies any waiting database migrations itself when it starts (set `MIGRATE_ON_STARTUP=false` to turn this off), so the code never runs against an out-of-date database. `alembic upgrade head` still works by hand.

Tests use a throwaway in-memory database and a temporary upload folder, never `rasa_erp.db`.

## API (all under `/api/v1`, JSON in camelCase)

| Resource | Endpoints | Notes |
|---|---|---|
| `customers` | list, create, get, update, delete | can't be deleted while a contract uses them (409) |
| `materials` | list, create, get, update, delete | `totalQuantityOwned` is counted in `quantityUnit` (any non-empty unit text is accepted); materials have no price, the cost of each is entered on the contract; can't be deleted while a contract uses it (409); `GET /{id}/distribution` shows which contracts (customer, site, dates, status) hold its stock |
| `drivers` | list, create, get, update, delete | `licenseNumber` is unique |
| `staff` | list, create, get, update, delete | username = email; password is stored hashed and never returned; `staffId` and email are unique |
| `trucks` | list, create, get, update, delete | registration and chassis numbers are unique; `documents` holds the 7 compliance documents |
| `contracts` | list (`?customer_id=`), create, get, update, delete, `POST /{id}/dispatch`, `/deploy`, `/conclude` | see "Contract lifecycle" below |

### Contract lifecycle

A contract moves **Estimated → Dispatched → Deployed → Concluded → Closed**.

- **Create / update:** `customerId`, `siteAddress`, `materials: [{materialId, quantity}]` (a quantity can't exceed the stock left after other contracts), `startDate`, `months`, `days`, `transportationCost`, `materialsCost`, `estimatedCost`, optional `description`. The server fills in `endDate` (the start date counts as day 1), `dailyCost` (estimated cost / (months x 30 + days)) and the month-by-month `breakdown`. Stock counts the dispatched quantity once a contract is dispatched, otherwise the planned one.
- **Dispatch** (`/dispatch`): needs the quantity really sent for every material, `finalTransportationCost`, `finalCost` and `loadingCharges`. Adds `finalDailyCost` and `finalBreakdown`. Only an Estimated contract can be dispatched.
- **Deploy:** a dispatched contract is deployed by the server when its start date arrives (checked on reads and every hour). `POST /{id}/deploy` deploys it earlier, but only with `{"confirmEarlyStart": true}`: the work then really starts today, `startDate` becomes today, `endDate` moves with it and the planned date is kept in `plannedStartDate`. The cost for a day and the total costs stay the same.
- Once deployed, the start date can't be changed; the period (and so the end date) can.
- **Conclude** (`POST /{id}/conclude`, `{"workEndedOn": "YYYY-MM-DD" (optional), "materials": [{"materialId", "intact", "damaged", "destination"}]}`): `materials` says what came back of every material on the contract (0 and 0 if nothing did; intact + damaged can't be more than was dispatched), and is returned as `retrievedIntact` / `retrievedDamaged` on each material. `destination` ("Back to Yard" or "Moved to Another Site") says where what came back went; it is required when anything came back and returned as `returnDestination`. the work is finished and the contract closed. Only a deployed contract can be concluded, once. `workEndedOn` is the day the work really ended (default today; any day from the start date up to today), so a contract that was forgotten for a while is not charged for days the customer did not use. `concludedAt` records when it was clicked. `POST /{id}/adjust-end` corrects `workEndedOn` on a concluded contract (same limits).
- **Close** (`POST /{id}/close`): the last phase. Only a concluded contract can be closed, once; the end day can't be adjusted afterwards. `closedAt` records when. A closed contract stays a record: its billing, payments and returned stock are unchanged.
- **Extension:** a deployed contract still open after its `endDate` has run past it. The response adds `extensionElapsedDays` (days past the end date so far), `extendedDays`, `extensionStart`, `extensionEnd` and `extensionAmount` (the days charged x the updated cost for a day), `extensionPaused` and `extensionChargeUntil`. Without a confirmation only 7 days past the end date (or past the last confirmation) are charged; after that charging pauses so a forgotten contract cannot run up a bill. `POST /{id}/confirm-extension` ("still running") confirms the days so far and allows 7 more. A concluded contract's extension is fixed at `workEndedOn`. These figures are worked out on each request, not stored. Invoices will be raised against them in a later phase.

### Stock

Every unit of a material is in exactly one place: the **yard** (available), **at another site** (free units waiting there), **damaged** (in the yard, not usable), **lost** (written off) or **in use** on one open contract. `GET /materials/{id}/distribution` returns the buckets (`totalOwned` after write-offs, `inUse`, `available`, `elsewhere`, `damaged`, `lost`), the contracts holding the material, the lots waiting at other sites (`lots`) and the stock history (`movements`). `GET /materials` carries `lost`, `damaged` and `elsewhere` too.

- **Concluding a contract** moves what came back: intact units go back to the yard (available again) or to a lot waiting at another site (`siteNote` says which); damaged units go to the damaged bucket; units that did not come back are written off as lost. A concluded contract holds nothing. Each move is a ledger entry (`stock_movements`).
- **Planning a contract** can use the yard plus the free units waiting at other sites (they can be dispatched from where they are). **Dispatching** needs the user to say where each material is taken from: `sources: [{lotId, quantity}]` on each dispatched material (`lotId` empty = the yard), adding up to the quantity dispatched; the yard part can't be more than the yard has free and a lot part can't be more than the lot holds. A contract that is only planned holds the yard only for what the free lots can't cover. Each line's `sources` show where its units came from.
- `POST /contracts/{id}/send-more` (`{materials: [{materialId, sources}]}`) sends more units of materials already on a dispatched, not concluded contract, choosing the sources the same way. On conclusion, intact units moved to another site can go straight to another running contract with that material (`assignToContractId`): they never pass through the yard. `GET /materials/lots/waiting` lists the free lots with how long they have waited (the bell warns after 7 days).
- `POST /materials/{id}/stock-actions` (`{action, quantity, reason, lotId?}`, a reason is required) corrects stock: `repair` and `write-off-damaged` (from damaged), `mark-damaged` and `write-off-yard` (from the yard), `lot-to-yard` (bring units from another site to the yard) and `restore-lost` (written-off units turned up). Entries are never edited or deleted.

### Payments

A deployed or concluded contract is billed in **lines**: each month of the plan (`"1"`, `"2"`, ...) and, if the work ran past its end date, the extended period (`"extension"`). The contract response lists them in `billingLines` (`amount`, `accrued` = built up so far from the days worked, `paid`, `dueNow` = built up so far less paid, `balance` = left for the whole month, `status`: Unpaid, Part paid, Paid or Overpaid) with `totalBilled`, `totalReceived`, `totalOutstanding` and `creditBalance`.

- `POST /contracts/{id}/payments` (multipart form): `line`, `amount` (rupees and paise, more than 0), `paidOn` (not in the future), optional `method` (Cash, UPI, Bank Transfer, Cheque, Other) and 1 or 2 image files in `proofs` (checked by their contents, 25MB each). Paying less than a line's amount leaves the balance on that same line; paying more is carried forward as credit to the next line.
- `GET /contracts/{id}/payments/{paymentId}/proofs/{proof1|proof2}` shows a proof image.
- `POST /contracts/{id}/payments/{paymentId}/void` with a `reason`: a mistaken payment stops counting but stays on record. Payments are never deleted, and a contract with payments can't be deleted (409).

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
