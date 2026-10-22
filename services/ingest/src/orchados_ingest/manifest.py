"""Store layout, the session manifest and the session index.

Layout (under the configured prefix):

    raw/<org_id>/<parcel_id>/<session_id>/<path in the session folder>
    raw/<org_id>/<parcel_id>/<session_id>/.orchados/manifest.json
    raw/_index/<session_id>.json        -> where the session lives

The manifest holds only ids, relative file names, sizes and SHA-256 hashes; no
personal data. It is written after all files of a push are in the store, so a
session without a manifest (or with fewer entries than objects) is incomplete.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from . import __version__

MANIFEST_FORMAT = "orchados.raw-manifest/1"
INDEX_FORMAT = "orchados.raw-index/1"
RAW = "raw"
INDEX_DIR = f"{RAW}/_index"
MANIFEST_REL = ".orchados/manifest.json"

_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class ManifestError(ValueError):
    pass


def check_id(kind: str, value: str) -> str:
    if not value or not _ID.match(value):
        raise ManifestError(f"{kind} must be 1-64 characters of [A-Za-z0-9_-], not {value!r}")
    return value


def check_rel(path: str) -> str:
    """Relative POSIX path inside a session folder."""
    parts = path.split("/")
    if (
        not path
        or path.startswith("/")
        or "\\" in path
        or any(p in ("", ".", "..") for p in parts)
        or (len(parts[0]) == 2 and parts[0][1] == ":")
    ):
        raise ManifestError(f"bad session file path {path!r}")
    return path


def session_prefix(org_id: str, parcel_id: str, session_id: str) -> str:
    ids = (check_id("org id", org_id), check_id("parcel id", parcel_id))
    return f"{RAW}/{ids[0]}/{ids[1]}/{check_id('session id', session_id)}/"


def index_key(session_id: str) -> str:
    return f"{INDEX_DIR}/{check_id('session id', session_id)}.json"


def now_utc() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class Entry:
    path: str
    size: int
    sha256: str


@dataclass
class SessionIndex:
    session_id: str
    org_id: str
    parcel_id: str

    @property
    def prefix(self) -> str:
        return session_prefix(self.org_id, self.parcel_id, self.session_id)

    def to_json(self) -> bytes:
        body = {"format": INDEX_FORMAT, **self.__dict__, "prefix": self.prefix}
        return json.dumps(body, indent=2).encode()

    @classmethod
    def from_json(cls, data: bytes) -> SessionIndex:
        d = json.loads(data)
        if d.get("format") != INDEX_FORMAT:
            raise ManifestError(f"not a session index: format {d.get('format')!r}")
        return cls(d["session_id"], d["org_id"], d["parcel_id"])


@dataclass
class Manifest:
    session_id: str
    org_id: str
    parcel_id: str
    files: dict[str, Entry] = field(default_factory=dict)
    created_at: str = field(default_factory=now_utc)
    updated_at: str = field(default_factory=now_utc)

    @property
    def total_bytes(self) -> int:
        return sum(e.size for e in self.files.values())

    def merge(self, entries: list[Entry], replace: bool = False) -> list[str]:
        """Add entries; returns paths that already had another content.

        Raw media is immutable: a path with another hash is refused unless replace.
        """
        conflicts = [
            e.path
            for e in entries
            if e.path in self.files and self.files[e.path].sha256 != e.sha256
        ]
        if conflicts and not replace:
            return conflicts
        for e in entries:
            self.files[e.path] = e
        self.updated_at = now_utc()
        return conflicts

    def to_json(self) -> bytes:
        body = {
            "format": MANIFEST_FORMAT,
            "session_id": self.session_id,
            "org_id": self.org_id,
            "parcel_id": self.parcel_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "tool": f"orchados-ingest {__version__}",
            "file_count": len(self.files),
            "total_bytes": self.total_bytes,
            "files": [
                {"path": e.path, "size": e.size, "sha256": e.sha256}
                for e in sorted(self.files.values(), key=lambda e: e.path)
            ],
        }
        return json.dumps(body, indent=2).encode()

    @classmethod
    def from_json(cls, data: bytes) -> Manifest:
        d = json.loads(data)
        if d.get("format") != MANIFEST_FORMAT:
            raise ManifestError(f"not a raw manifest: format {d.get('format')!r}")
        files = {}
        for f in d["files"]:
            e = Entry(check_rel(f["path"]), int(f["size"]), str(f["sha256"]))
            files[e.path] = e
        return cls(
            d["session_id"],
            d["org_id"],
            d["parcel_id"],
            files,
            d.get("created_at", ""),
            d.get("updated_at", ""),
        )
