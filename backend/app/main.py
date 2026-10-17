import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.migrate import upgrade_to_head
from app.db.session import SessionLocal
from app.services.deployment import auto_deploy_due

async def _deploy_when_due() -> None:
    """Every hour, marks dispatched contracts whose start date has come as Deployed (reads also do this)."""
    while True:
        await asyncio.sleep(3600)
        try:
            with SessionLocal() as db:
                await asyncio.to_thread(auto_deploy_due, db)
        except Exception:  # never let a failed check stop the loop
            pass


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.migrate_on_startup:
        upgrade_to_head()  # fails loudly: better not to start than to run against an out-of-date database
    task = asyncio.create_task(_deploy_when_due())
    yield
    task.cancel()


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    docs_url="/docs",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs"}
