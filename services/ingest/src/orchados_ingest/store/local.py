"""Local folder store: development and single-computer use."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from ..transfer import Transfer
from .base import CHUNK, SHA256_META, ObjectInfo, RawStore, StoreError, check_key

# Hidden folders under the root: object metadata and unfinished uploads.
META_DIR = ".meta"
PARTIAL_DIR = ".partial"


class LocalStore(RawStore):
    name = "local"

    def __init__(self, root: Path, **kw):
        super().__init__(**kw)
        self.root = Path(root)

    def describe(self) -> str:
        return f"local:{self.root}"

    def _path(self, key: str) -> Path:
        return self.root.joinpath(*check_key(key).split("/"))

    def _meta_path(self, key: str) -> Path:
        return self.root / META_DIR / (check_key(key) + ".json")

    def _partial_path(self, key: str, sha256: str) -> Path:
        return self.root / PARTIAL_DIR / (check_key(key) + f".{sha256[:16]}")

    def ensure_bucket(self) -> bool:
        created = not self.root.exists()
        self.root.mkdir(parents=True, exist_ok=True)
        return created

    def list(self, prefix: str = "") -> Iterator[ObjectInfo]:
        if not self.root.is_dir():
            return
        for p in sorted(self.root.rglob("*")):
            rel = p.relative_to(self.root).as_posix()
            if not p.is_file() or rel.split("/")[0] in (META_DIR, PARTIAL_DIR):
                continue
            if rel.startswith(prefix):
                st = p.stat()
                yield ObjectInfo(rel, st.st_size, datetime.fromtimestamp(st.st_mtime, UTC))

    def stat(self, key: str) -> ObjectInfo | None:
        p = self._path(key)
        if not p.is_file():
            return None
        st = p.stat()
        sha = None
        mp = self._meta_path(key)
        if mp.is_file():
            sha = json.loads(mp.read_text(encoding="utf-8")).get(SHA256_META)
        return ObjectInfo(key, st.st_size, datetime.fromtimestamp(st.st_mtime, UTC), sha)

    def upload(self, path: Path, key: str, sha256: str, transfer: Transfer | None = None) -> bool:
        transfer = transfer or Transfer()
        size = path.stat().st_size
        if self._already_complete(key, path, sha256):
            return False
        part = self._partial_path(key, sha256)
        part.parent.mkdir(parents=True, exist_ok=True)
        done = part.stat().st_size if part.exists() else 0
        if done > size:
            part.unlink()
            done = 0
        if done and transfer.progress:
            transfer.progress.skip(done)
        with path.open("rb") as src, part.open("ab") as dst:
            src.seek(done)
            while chunk := src.read(CHUNK):
                dst.write(chunk)
                transfer.moved(len(chunk))
        if part.stat().st_size != size:
            raise StoreError(f"{path}: size changed during upload")
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        mp = self._meta_path(key)
        mp.parent.mkdir(parents=True, exist_ok=True)
        mp.write_text(json.dumps({SHA256_META: sha256}), encoding="utf-8")
        os.replace(part, dest)
        return True

    def read_chunks(self, key: str, start: int = 0) -> Iterator[bytes]:
        p = self._path(key)
        if not p.is_file():
            raise StoreError(f"{key}: not found")
        with p.open("rb") as fh:
            fh.seek(start)
            while chunk := fh.read(CHUNK):
                yield chunk

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/json") -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)
        self._meta_path(key).unlink(missing_ok=True)

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
        self._meta_path(key).unlink(missing_ok=True)

    def abort_stale_uploads(self, older_than: datetime, dry_run: bool = False) -> int:
        pdir = self.root / PARTIAL_DIR
        n = 0
        if pdir.is_dir():
            for p in pdir.rglob("*"):
                if p.is_file() and datetime.fromtimestamp(p.stat().st_mtime, UTC) < older_than:
                    n += 1
                    if not dry_run:
                        p.unlink()
        return n
