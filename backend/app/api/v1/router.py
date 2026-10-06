from fastapi import APIRouter

from app.api.v1.endpoints import contracts, customers, drivers, health, materials, staff, trucks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(customers.router)
api_router.include_router(materials.router)
api_router.include_router(contracts.router)
api_router.include_router(drivers.router)
api_router.include_router(staff.router)
api_router.include_router(trucks.router)
