"""Adds the upload / download / delete file endpoints to a resource's router.

    PUT    /{resource}/{id}/files/{kind}   upload (or replace) one file, multipart field name "file"
    GET    /{resource}/{id}/files/{kind}   download / view it
    DELETE /{resource}/{id}/files/{kind}   remove it
"""

from fastapi import APIRouter, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import DbSession, not_found
from app.core.config import settings
from app.schemas.files import FileInfo
from app.services import files as file_service
from app.services.files import FileRule


def add_file_routes(router: APIRouter, *, resource: str, owner_type: str, model: type, label: str, rules: dict[str, FileRule]):
    def check(db, owner_id: int, kind: str) -> FileRule:
        if db.get(model, owner_id) is None:
            raise not_found(label)
        rule = rules.get(kind)
        if rule is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown file kind '{kind}'. Valid kinds: {', '.join(rules)}")
        return rule

    @router.put("/{owner_id}/files/{kind}", response_model=FileInfo, summary=f"Upload a file for a {label.lower()}")
    def upload_file(owner_id: int, kind: str, file: UploadFile, db: DbSession):
        rule = check(db, owner_id, kind)
        stored = file_service.store_upload(db, file, owner_type=owner_type, owner_id=owner_id, kind=kind, rule=rule)
        return file_service.describe({kind: stored}, f"{settings.api_prefix}/{resource}/{owner_id}")[kind]

    @router.get("/{owner_id}/files/{kind}", summary=f"Download a {label.lower()}'s file")
    def download_file(owner_id: int, kind: str, db: DbSession):
        check(db, owner_id, kind)
        stored = file_service.get_stored(db, owner_type, owner_id, kind)
        if stored is None:
            raise not_found("File")
        path = file_service.absolute_path(stored)
        if not path.exists():
            raise not_found("File")
        return FileResponse(path, media_type=stored.content_type, filename=stored.original_name, content_disposition_type="inline")

    @router.delete("/{owner_id}/files/{kind}", status_code=status.HTTP_204_NO_CONTENT, summary=f"Remove a {label.lower()}'s file")
    def delete_file(owner_id: int, kind: str, db: DbSession):
        check(db, owner_id, kind)
        stored = file_service.get_stored(db, owner_type, owner_id, kind)
        if stored is None:
            raise not_found("File")
        file_service.delete_stored(db, stored)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
