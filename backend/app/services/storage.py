"""Document byte storage abstraction. Local disk for development; swap for object storage later."""
import re
from abc import ABC, abstractmethod
from pathlib import Path


class FileStorage(ABC):
    @abstractmethod
    def save(self, key: str, content: bytes) -> str: ...

    @abstractmethod
    def read(self, key: str) -> bytes: ...


class LocalFileStorage(FileStorage):
    def __init__(self, base_dir: str) -> None:
        self.base = Path(base_dir)

    def _path(self, key: str) -> Path:
        safe = re.sub(r"[^A-Za-z0-9._/-]", "_", key).lstrip("/.")
        path = (self.base / safe).resolve()
        if self.base.resolve() not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    def save(self, key: str, content: bytes) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return key

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()
