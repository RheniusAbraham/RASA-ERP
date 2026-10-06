from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel, text


class MaterialIn(CamelModel):
    name: text(min_length=1, max_length=200)
    cost_per_piece: float = Field(ge=0)
    total_quantity_owned: int = Field(ge=0)
    structural_description: text(min_length=1, max_length=4000)
    additional_information: text(max_length=4000) = ""


class MaterialOut(MaterialIn):
    id: int
    created_at: datetime
