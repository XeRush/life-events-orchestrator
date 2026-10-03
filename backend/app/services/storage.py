"""Document storage behind an interface (local disk now; object storage later) with upload validation."""
from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

import anyio

from app.core.errors import ValidationFailed

# Magic-number check: the declared type must match the bytes, and only these types are accepted.
SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF-",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
}
EXTENSIONS = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg"}


@dataclass(frozen=True)
class StoredFile:
    key: str
    sha256: str
    size: int
    mime_type: str
    file_name: str


def detect_mime(data: bytes) -> str | None:
    for mime, prefixes in SIGNATURES.items():
        if any(data.startswith(p) for p in prefixes):
            return mime
    return None


def safe_filename(name: str) -> str:
    base = Path(name or "document").name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:120].strip(". ")
    return cleaned or "document"


def validate_upload(data: bytes, declared_mime: str | None, file_name: str, max_mb: int) -> str:
    if not data:
        raise ValidationFailed("The file is empty.", code="empty_file")
    if len(data) > max_mb * 1024 * 1024:
        raise ValidationFailed(f"Files must be {max_mb} MB or smaller.", code="file_too_large")
    detected = detect_mime(data)
    if detected is None:
        raise ValidationFailed("Only PDF, PNG or JPEG documents are accepted.", code="unsupported_type")
    if declared_mime and declared_mime not in (detected, "application/octet-stream"):
        raise ValidationFailed("The file content does not match its declared type.", code="type_mismatch")
    return detected


class LocalFileStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()

    async def save(self, case_id: uuid.UUID, file_name: str, data: bytes, mime_type: str) -> StoredFile:
        key = f"{case_id}/{uuid.uuid4().hex}{EXTENSIONS[mime_type]}"
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValidationFailed("Invalid storage path")
        await anyio.Path(path.parent).mkdir(parents=True, exist_ok=True)
        await anyio.Path(path).write_bytes(data)
        return StoredFile(key=key, sha256=hashlib.sha256(data).hexdigest(), size=len(data), mime_type=mime_type,
                          file_name=safe_filename(file_name))

    async def read(self, key: str) -> bytes:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValidationFailed("Invalid storage path")
        return await anyio.Path(path).read_bytes()
