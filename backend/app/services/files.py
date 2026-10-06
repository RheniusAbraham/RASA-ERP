"""Storage and validation of uploaded files (PDF proofs, photos).

Files are written under `settings.upload_dir/<owner_type>/<owner_id>/<random>.<ext>` and tracked in the
`stored_files` table. The file's real type is decided from its first bytes ("magic numbers"), not from
the name or the browser-supplied content type, so a renamed .exe can't pass as a PDF.
"""

import shutil
import uuid
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.stored_file import StoredFile
from app.schemas.files import FileInfo


@dataclass(frozen=True)
class FileRule:
    accepts: str  # "pdf", "image" or "document" (a PDF or an image)
    required: bool = True


_ACCEPT_MESSAGE = {
    "pdf": "Please upload a PDF file.",
    "image": "Please upload an image (JPG, PNG, WebP or GIF).",
    "document": "Please upload a PDF or an image (JPG, PNG, WebP or GIF).",
}


def _detect(head: bytes) -> tuple[str, str, str] | None:
    """Returns (family, content_type, extension) from the file's first bytes, or None."""
    if head.startswith(b"%PDF-"):
        return "pdf", "application/pdf", ".pdf"
    if head.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg", ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "image/png", ".png"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image", "image/gif", ".gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", "image/webp", ".webp"
    return None


def _read_limited(upload: UploadFile) -> bytes:
    limit = settings.max_upload_bytes
    data = upload.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(
            413,
            f"File is larger than {settings.max_upload_mb:g}MB.",
        )
    return data


def absolute_path(stored: StoredFile) -> Path:
    root = settings.upload_dir.resolve()
    path = (root / stored.path).resolve()
    if not path.is_relative_to(root):  # never serve anything outside the upload folder
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return path


def store_upload(db: Session, upload: UploadFile, *, owner_type: str, owner_id: int, kind: str, rule: FileRule) -> StoredFile:
    data = _read_limited(upload)
    if not data:
        raise HTTPException(422, "The file is empty.")

    detected = _detect(data[:16])
    allowed = {"pdf": {"pdf"}, "image": {"image"}, "document": {"pdf", "image"}}[rule.accepts]
    if detected is None or detected[0] not in allowed:
        raise HTTPException(422, _ACCEPT_MESSAGE[rule.accepts])
    _, content_type, ext = detected

    relative = Path(owner_type) / str(owner_id) / f"{uuid.uuid4().hex}{ext}"
    target = settings.upload_dir / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

    existing = db.scalars(
        select(StoredFile).where(
            StoredFile.owner_type == owner_type, StoredFile.owner_id == owner_id, StoredFile.kind == kind
        )
    ).first()
    original_name = Path(upload.filename or "file").name[:255] or "file"

    if existing is not None:
        _remove_from_disk(existing)  # replacing: the old file is no longer needed
        existing.path = relative.as_posix()
        existing.original_name = original_name
        existing.content_type = content_type
        existing.size = len(data)
        stored = existing
    else:
        stored = StoredFile(
            owner_type=owner_type,
            owner_id=owner_id,
            kind=kind,
            path=relative.as_posix(),
            original_name=original_name,
            content_type=content_type,
            size=len(data),
        )
        db.add(stored)
    db.commit()
    return stored


def _remove_from_disk(stored: StoredFile) -> None:
    try:
        absolute_path(stored).unlink(missing_ok=True)
    except HTTPException:
        pass


def get_stored(db: Session, owner_type: str, owner_id: int, kind: str) -> StoredFile | None:
    return db.scalars(
        select(StoredFile).where(
            StoredFile.owner_type == owner_type, StoredFile.owner_id == owner_id, StoredFile.kind == kind
        )
    ).first()


def delete_stored(db: Session, stored: StoredFile) -> None:
    _remove_from_disk(stored)
    db.delete(stored)
    db.commit()


def delete_owner_files(db: Session, owner_type: str, owner_id: int) -> None:
    """Remove every file of a deleted owner (rows and the folder on disk). Caller commits."""
    for stored in db.scalars(select(StoredFile).where(StoredFile.owner_type == owner_type, StoredFile.owner_id == owner_id)):
        db.delete(stored)
    shutil.rmtree(settings.upload_dir / owner_type / str(owner_id), ignore_errors=True)


def files_for(db: Session, owner_type: str, owner_ids: list[int]) -> dict[int, dict[str, StoredFile]]:
    """All files of several owners in one query: {owner_id: {kind: StoredFile}}."""
    result: dict[int, dict[str, StoredFile]] = defaultdict(dict)
    if owner_ids:
        rows = db.scalars(
            select(StoredFile).where(StoredFile.owner_type == owner_type, StoredFile.owner_id.in_(owner_ids))
        )
        for stored in rows:
            result[stored.owner_id][stored.kind] = stored
    return result


def describe(stored_files: dict[str, StoredFile], url_base: str) -> dict[str, FileInfo]:
    return {
        kind: FileInfo(
            kind=kind,
            filename=s.original_name,
            content_type=s.content_type,
            size=s.size,
            url=f"{url_base}/files/{kind}",
        )
        for kind, s in stored_files.items()
    }


def missing_kinds(rules: dict[str, FileRule], present: dict[str, StoredFile]) -> list[str]:
    return [kind for kind, rule in rules.items() if rule.required and kind not in present]


# What each resource accepts. Keys are the `kind` used in the URL and in responses.
DRIVER_FILES = {
    "photo": FileRule("image", required=False),
    "aadhaarProof": FileRule("pdf"),
    "licenseProof": FileRule("pdf"),
}
STAFF_FILES = {
    "photo": FileRule("image", required=False),
    "aadharCard": FileRule("pdf"),
}
TRUCK_FILES = {
    "rc": FileRule("document"),
    "fc": FileRule("pdf"),
    "roadTax": FileRule("pdf"),
    "insurance": FileRule("document"),
    "nationalPermit": FileRule("pdf"),
    "localPermit": FileRule("pdf"),
    "pollution": FileRule("pdf"),
}
