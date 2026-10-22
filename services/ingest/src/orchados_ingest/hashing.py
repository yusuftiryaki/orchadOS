"""SHA-256 of files, with a cache keyed by path, size and modification time.

Hashing a 90 GB visit from a card reader takes long; a resumed push reuses the
hashes of files that did not change.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .state import JsonState
from .transfer import Progress

CHUNK = 4 * 1024 * 1024


def sha256_file(path: Path, progress: Progress | None = None) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK):
            h.update(chunk)
            if progress:
                progress.advance(len(chunk))
    return h.hexdigest()


class HashCache:
    def __init__(self, state: JsonState | None):
        self.state = state

    @staticmethod
    def _key(path: Path) -> str:
        st = path.stat()
        return f"{path.resolve()}|{st.st_size}|{st.st_mtime_ns}"

    def sha256(self, path: Path, progress: Progress | None = None) -> str:
        key = self._key(path)
        if self.state is not None:
            cached = self.state.get(key)
            if cached:
                if progress:
                    progress.skip(path.stat().st_size)
                return cached
        digest = sha256_file(path, progress)
        if self.state is not None:
            self.state.set(key, digest)
        return digest
