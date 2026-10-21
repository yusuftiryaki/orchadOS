"""The raw store interface: list, upload (multipart, resumable), download, exists, delete."""

from __future__ import annotations

import math
import re
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from ..transfer import Transfer

MiB = 1024 * 1024
S3_MAX_PARTS = 10_000
CHUNK = 1 * MiB  # download chunk
SHA256_META = "sha256"

_KEY_PART = re.compile(r"^[^/\\\x00]+$")


class StoreError(RuntimeError):
    pass


def check_key(key: str) -> str:
    """Store keys are relative POSIX paths without '.', '..' or empty parts."""
    parts = key.split("/")
    if not key or any(p in ("", ".", "..") or not _KEY_PART.match(p) for p in parts):
        raise StoreError(f"bad store key {key!r}")
    return key


@dataclass(frozen=True)
class ObjectInfo:
    key: str
    size: int
    last_modified: datetime
    # SHA-256 of the content, from object metadata when the uploader set it.
    sha256: str | None = None


def part_size_for(size: int, min_part: int) -> int:
    """Part size for a file: the configured size, grown so the file fits in 10,000 parts."""
    need = math.ceil(size / S3_MAX_PARTS)
    part = max(min_part, need)
    return math.ceil(part / MiB) * MiB


def part_ranges(size: int, part: int) -> list[tuple[int, int, int]]:
    """[(part number from 1, offset, length), ...]."""
    out, n, off = [], 1, 0
    while off < size:
        length = min(part, size - off)
        out.append((n, off, length))
        n, off = n + 1, off + length
    return out


def read_range(path: Path, offset: int, length: int) -> bytes:
    with path.open("rb") as fh:
        fh.seek(offset)
        data = fh.read(length)
    if len(data) != length:
        raise StoreError(f"{path}: short read at {offset} (file changed during upload?)")
    return data


class RawStore(ABC):
    """One bucket / container / folder. Keys are relative to the configured prefix."""

    #: what `describe()` shows; set by subclasses
    name: str = "store"

    def __init__(self, part_size: int = 64 * MiB, concurrency: int = 4):
        self.part_size = part_size
        self.concurrency = concurrency

    # --- metadata ---------------------------------------------------------
    @abstractmethod
    def list(self, prefix: str = "") -> Iterator[ObjectInfo]:
        """Objects whose key starts with prefix (sha256 may be None in listings)."""

    @abstractmethod
    def stat(self, key: str) -> ObjectInfo | None:
        """Object info with sha256 metadata, or None when it does not exist."""

    def exists(self, key: str) -> bool:
        return self.stat(key) is not None

    # --- data -------------------------------------------------------------
    @abstractmethod
    def upload(self, path: Path, key: str, sha256: str, transfer: Transfer | None = None) -> bool:
        """Upload a file under key with its SHA-256 as metadata.

        Large files go in parts, several at a time; parts already in the store from an
        interrupted attempt of the same content are not sent again. Returns False when
        the object was already complete (same size and hash), True when bytes were sent.
        """

    @abstractmethod
    def read_chunks(self, key: str, start: int = 0) -> Iterator[bytes]:
        """Object content from byte `start` (for resumed downloads)."""

    @abstractmethod
    def put_bytes(self, key: str, data: bytes, content_type: str = "application/json") -> None:
        """Small objects (manifest, index); overwrites."""

    def get_bytes(self, key: str) -> bytes | None:
        if not self.exists(key):
            return None
        return b"".join(self.read_chunks(key))

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete one object; deleting a missing object is not an error."""

    # --- housekeeping -----------------------------------------------------
    def ensure_bucket(self) -> bool:
        """Create the bucket/container if missing (dev and tests). True when created."""
        return False

    def abort_stale_uploads(self, older_than: datetime, dry_run: bool = False) -> int:
        """Drop unfinished multipart uploads started before `older_than`; returns count."""
        return 0

    def describe(self) -> str:
        return self.name

    def _already_complete(self, key: str, path: Path, sha256: str) -> bool:
        info = self.stat(key)
        return info is not None and info.size == path.stat().st_size and info.sha256 == sha256
