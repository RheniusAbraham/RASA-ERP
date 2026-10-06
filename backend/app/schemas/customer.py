from datetime import datetime

from app.schemas.common import CamelModel, text


class CustomerIn(CamelModel):
    name: text(min_length=1, max_length=200)
    phone: text(min_length=1, max_length=30)
    contact_person: text(max_length=200) = ""
    gst: text(max_length=30) = ""
    email: text(max_length=254) = ""
    address: text(max_length=2000) = ""


class CustomerOut(CustomerIn):
    id: int
    created_at: datetime

