"""Media storage for derived files: content-addressed, immutable objects.

Object key: org/<org_id>/parcel/<parcel_id>/<sha256> (docs/arayuzler.md,
"Medya depolama"). A key is written once and never updated; uploading an
existing key is a no-op. The row's uri is "storage://media/" + key.

Implementations: Supabase Storage now, a local folder for tests and offline
runs; Cloudflare R2 may follow in the pilot (docs/deployment.md).
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from .hashing import sha256_file

if TYPE_CHECKING:
    from .supabase import SupabaseClient

BUCKET = "media"
URI_PREFIX = f"storage://{BUCKET}/"


def media_key(org_id: str, parcel_id: str, sha256: str) -> str:
    return f"org/{org_id}/parcel/{parcel_id}/{sha256}"


def media_uri(key: str) -> str:
    return URI_PREFIX + key


class ImmutableObjectError(RuntimeError):
    pass


class MediaStore(Protocol):
    """Content-addressed object store for the media bucket."""

    def keys(self, prefix: str) -> set[str]:
        """Full keys of the objects directly under prefix (one folder, no recursion)."""
        ...

    def put(self, key: str, local_path: Path, media_type: str) -> bool:
        """Store a file under key; False if the key already existed (nothing written)."""
        ...


class LocalMediaStore:
    """Media bucket in a local folder: <root>/<key>."""

    def __init__(self, root: Path):
        self.root = Path(root)

    def keys(self, prefix: str) -> set[str]:
        folder = self.root / prefix
        if not folder.is_dir():
            return set()
        return {f"{prefix}/{p.name}" for p in folder.iterdir() if p.is_file()}

    def put(self, key: str, local_path: Path, media_type: str) -> bool:
        sha256 = key.rsplit("/", 1)[-1]
        dest = self.root / key
        if dest.exists():
            if sha256_file(dest) != sha256:
                raise ImmutableObjectError(f"object {key} exists with other content")
            return False
        if sha256_file(local_path) != sha256:
            raise ImmutableObjectError(f"{local_path}: content does not match {sha256}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(dest.name + ".tmp")
        shutil.copyfile(local_path, tmp)
        tmp.replace(dest)
        return True


class SupabaseMediaStore:
    """The media bucket in Supabase Storage, written with the user's own token (RLS applies)."""

    def __init__(self, client: SupabaseClient, bucket: str = BUCKET):
        self.client = client
        self.bucket = bucket

    def keys(self, prefix: str) -> set[str]:
        return {f"{prefix}/{name}" for name in self.client.storage_list(self.bucket, prefix)}

    def put(self, key: str, local_path: Path, media_type: str) -> bool:
        return self.client.storage_upload(self.bucket, key, Path(local_path), media_type)
