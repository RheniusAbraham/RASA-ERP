from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """JSON uses camelCase (matches the frontend); Python code uses snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


def text(*, min_length: int = 0, max_length: int = 1000):
    """A whitespace-trimmed string with length limits."""
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]
