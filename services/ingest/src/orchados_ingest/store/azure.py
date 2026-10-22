"""Azure Blob Storage store (block blobs).

Credentials: AZURE_STORAGE_CONNECTION_STRING when set (Azurite, account keys or
SAS), otherwise `account_url` with DefaultAzureCredential (AZURE_CLIENT_* env,
`az login`, managed identity of the VM).

Resuming: block ids are derived from the file's SHA-256 and the block number, so
blocks staged by an interrupted attempt of the same content are found in the
blob's uncommitted block list and skipped; no local state is needed. Azure drops
uncommitted blocks after 7 days.
"""

from __future__ import annotations

import base64
import os
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import BlobBlock, BlobServiceClient, ContentSettings

from ..config import StoreConfig
from ..transfer import ThrottledReader, Transfer
from .base import (
    SHA256_META,
    ObjectInfo,
    RawStore,
    StoreError,
    check_key,
    part_ranges,
    part_size_for,
    read_range,
)

CONNECTION_ENV = "AZURE_STORAGE_CONNECTION_STRING"


def service_client(cfg: StoreConfig) -> BlobServiceClient:
    conn = os.environ.get(CONNECTION_ENV)
    if conn:
        return BlobServiceClient.from_connection_string(conn)
    if not cfg.account_url:
        raise StoreError(f"azure backend needs account_url or {CONNECTION_ENV}")
    from azure.identity import DefaultAzureCredential

    return BlobServiceClient(cfg.account_url, credential=DefaultAzureCredential())


def block_id(sha256: str, n: int) -> str:
    # All ids of a blob must have the same length (<= 64 bytes before encoding).
    return base64.b64encode(f"{sha256[:32]}-{n:06d}".encode()).decode()


class AzureStore(RawStore):
    name = "azure"

    def __init__(self, container_client, prefix: str = "", label: str = "", **kw):
        super().__init__(**kw)
        self.cc = container_client
        self.prefix = prefix
        self.label = label or f"azure:{container_client.container_name}"

    @classmethod
    def from_config(cls, cfg: StoreConfig) -> AzureStore:
        return cls(
            service_client(cfg).get_container_client(cfg.bucket),
            cfg.key_prefix,
            label=cfg.describe(),
            part_size=cfg.part_size_mb * 1024 * 1024,
            concurrency=cfg.concurrency,
        )

    def describe(self) -> str:
        return self.label

    def uri(self, key: str) -> str:
        return f"az://{self.cc.container_name}/{self._k(key)}"

    def _k(self, key: str) -> str:
        return self.prefix + check_key(key)

    def ensure_bucket(self) -> bool:
        try:
            self.cc.create_container()
            return True
        except ResourceExistsError:
            return False

    def list(self, prefix: str = "") -> Iterator[ObjectInfo]:
        for b in self.cc.list_blobs(name_starts_with=self.prefix + prefix):
            yield ObjectInfo(b.name[len(self.prefix) :], b.size, b.last_modified)

    def stat(self, key: str) -> ObjectInfo | None:
        try:
            p = self.cc.get_blob_client(self._k(key)).get_blob_properties()
        except ResourceNotFoundError:
            return None
        meta = {k.lower(): v for k, v in (p.metadata or {}).items()}
        return ObjectInfo(key, p.size, p.last_modified, meta.get(SHA256_META))

    def upload(self, path: Path, key: str, sha256: str, transfer: Transfer | None = None) -> bool:
        transfer = transfer or Transfer()
        if self._already_complete(key, path, sha256):
            return False
        size = path.stat().st_size
        bc = self.cc.get_blob_client(self._k(key))
        part = part_size_for(size, self.part_size)
        if size <= part:
            data = path.read_bytes()
            if len(data) != size:
                raise StoreError(f"{path}: size changed during upload")
            bc.upload_blob(
                ThrottledReader(data, transfer),
                length=size,
                overwrite=True,
                metadata={SHA256_META: sha256},
                max_concurrency=1,
            )
            return True

        try:
            _, uncommitted = bc.get_block_list("uncommitted")
        except ResourceNotFoundError:
            uncommitted = []
        staged = {b.id: b.size for b in uncommitted}

        def one(n: int, off: int, length: int) -> str:
            bid = block_id(sha256, n)
            if staged.get(bid) == length:
                if transfer.progress:
                    transfer.progress.skip(length)
                return bid
            data = read_range(path, off, length)
            bc.stage_block(bid, ThrottledReader(data, transfer), length=length,
                           validate_content=True)  # fmt: skip
            return bid

        ranges = part_ranges(size, part)
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(one, *r) for r in ranges]
            try:
                ids = [f.result() for f in futures]
            except BaseException:
                for f in futures:
                    f.cancel()
                raise
        bc.commit_block_list([BlobBlock(block_id=i) for i in ids], metadata={SHA256_META: sha256})
        return True

    def read_chunks(self, key: str, start: int = 0) -> Iterator[bytes]:
        try:
            dl = self.cc.get_blob_client(self._k(key)).download_blob(offset=start or None)
        except ResourceNotFoundError as exc:
            raise StoreError(f"{key}: not found") from exc
        yield from dl.chunks()

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/json") -> None:
        self.cc.get_blob_client(self._k(key)).upload_blob(
            data, overwrite=True, content_settings=ContentSettings(content_type=content_type)
        )

    def delete(self, key: str) -> None:
        try:
            self.cc.get_blob_client(self._k(key)).delete_blob()
        except ResourceNotFoundError:
            pass
