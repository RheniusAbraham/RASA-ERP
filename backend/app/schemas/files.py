from app.schemas.common import CamelModel


class FileInfo(CamelModel):
    kind: str
    filename: str
    content_type: str
    size: int
    #: Relative to the server, e.g. /api/v1/drivers/3/files/photo (prefix with the API host)
    url: str
