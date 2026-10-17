"""Import every model here so Alembic's autogenerate can see them."""

from app.db.base import Base  # noqa: F401
from app.models.contract import Contract, Payment, contract_materials  # noqa: F401
from app.models.customer import Customer  # noqa: F401
from app.models.driver import Driver  # noqa: F401
from app.models.material import Material  # noqa: F401
from app.models.staff import Staff  # noqa: F401
from app.models.stored_file import StoredFile  # noqa: F401
from app.models.truck import Truck, TruckDocument  # noqa: F401
from app.models.stock import ContractMaterialSource, StockLot, StockMovement  # noqa: F401
