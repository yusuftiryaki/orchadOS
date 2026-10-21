"""S3-compatible store: AWS S3, Cloudflare R2, Google Cloud Storage (XML API, HMAC), MinIO.

One code path for all of them; only endpoint, region and addressing differ
(config.s3_settings). Credentials: boto3's standard chain (AWS_* environment
variables, AWS_PROFILE / profile setting, instance role). For R2 and GCS the HMAC
key pair goes in the same AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY variables or
a named profile.

Resuming a multipart upload: the upload id is kept in local state, keyed by the
object and the file's SHA-256 and part size, so a restarted push continues the
same upload from the same machine. Parts already in the store are checked by
size and MD5 (ETag) and skipped. Without a matching state entry, unfinished
uploads of that key are aborted and the file starts over.
"""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from ..config import StoreConfig, s3_settings
from ..state import JsonState
from ..transfer import ThrottledReader, Transfer
from .base import (
    CHUNK,
    SHA256_META,
    ObjectInfo,
    RawStore,
    StoreError,
    check_key,
    part_ranges,
    part_size_for,
    read_range,
)


def client_config(cfg: StoreConfig) -> Config:
    s3 = s3_settings(cfg)
    return Config(
        region_name=s3.region,
        s3={"addressing_style": s3.addressing_style},
        # boto3 >= 1.36 adds CRC checksums by default; GCS, R2 and older MinIO reject
        # or ignore them. Send them only where the API requires; we send Content-MD5.
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
        retries={"max_attempts": 5, "mode": "standard"},
        max_pool_connections=max(10, cfg.concurrency * 2),
    )


def make_client(cfg: StoreConfig):
    s3 = s3_settings(cfg)
    session = boto3.session.Session(profile_name=cfg.profile or None)
    return session.client("s3", endpoint_url=s3.endpoint, config=client_config(cfg))


def _md5_b64(data: bytes) -> str:
    return base64.b64encode(hashlib.md5(data).digest()).decode()


def _missing(exc: ClientError) -> bool:
    code = exc.response.get("Error", {}).get("Code", "")
    status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in ("404", "NoSuchKey", "NotFound", "NoSuchUpload") or status == 404


class S3Store(RawStore):
    name = "s3"

    def __init__(self, client, bucket: str, prefix: str = "", state: JsonState | None = None,
                 label: str = "", **kw):  # fmt: skip
        super().__init__(**kw)
        self.client = client
        self.bucket = bucket
        self.prefix = prefix
        self.state = state
        self.label = label or f"s3:{bucket}"

    @classmethod
    def from_config(cls, cfg: StoreConfig, state: JsonState | None = None) -> S3Store:
        return cls(
            make_client(cfg),
            cfg.bucket,
            cfg.key_prefix,
            state,
            label=cfg.describe(),
            part_size=cfg.part_size_mb * 1024 * 1024,
            concurrency=cfg.concurrency,
        )

    def describe(self) -> str:
        return self.label

    def _k(self, key: str) -> str:
        return self.prefix + check_key(key)

    def ensure_bucket(self) -> bool:
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return False
        except ClientError as exc:
            if not _missing(exc):
                raise
        self.client.create_bucket(Bucket=self.bucket)
        return True

    def list(self, prefix: str = "") -> Iterator[ObjectInfo]:
        pager = self.client.get_paginator("list_objects_v2")
        for page in pager.paginate(Bucket=self.bucket, Prefix=self.prefix + prefix):
            for o in page.get("Contents", []):
                yield ObjectInfo(o["Key"][len(self.prefix) :], o["Size"], o["LastModified"])

    def stat(self, key: str) -> ObjectInfo | None:
        try:
            r = self.client.head_object(Bucket=self.bucket, Key=self._k(key))
        except ClientError as exc:
            if _missing(exc):
                return None
            raise
        meta = {k.lower(): v for k, v in r.get("Metadata", {}).items()}
        return ObjectInfo(key, r["ContentLength"], r["LastModified"], meta.get(SHA256_META))

    # --- upload -------------------------------------------------------------
    def upload(self, path: Path, key: str, sha256: str, transfer: Transfer | None = None) -> bool:
        transfer = transfer or Transfer()
        if self._already_complete(key, path, sha256):
            return False
        size = path.stat().st_size
        part = part_size_for(size, self.part_size)
        if size <= part:
            data = path.read_bytes()
            if len(data) != size:
                raise StoreError(f"{path}: size changed during upload")
            self.client.put_object(
                Bucket=self.bucket,
                Key=self._k(key),
                Body=ThrottledReader(data, transfer),
                ContentLength=size,
                ContentMD5=_md5_b64(data),
                Metadata={SHA256_META: sha256},
            )
            return True
        self._multipart(path, key, sha256, size, part, transfer)
        return True

    def _state_key(self, key: str, sha256: str, part: int) -> str:
        return f"s3|{self.label}|{self._k(key)}|{sha256}|{part}"

    def _start_upload(self, key: str, sha256: str, skey: str) -> str:
        full = self._k(key)
        # Unfinished uploads of this key we cannot resume (other content or lost state).
        pager = self.client.get_paginator("list_multipart_uploads")
        for page in pager.paginate(Bucket=self.bucket, Prefix=full):
            for u in page.get("Uploads", []):
                if u["Key"] == full:
                    self._abort(full, u["UploadId"])
        r = self.client.create_multipart_upload(
            Bucket=self.bucket, Key=full, Metadata={SHA256_META: sha256}
        )
        if self.state:
            self.state.set(skey, r["UploadId"])
        return r["UploadId"]

    def _abort(self, full_key: str, upload_id: str) -> None:
        try:
            self.client.abort_multipart_upload(Bucket=self.bucket, Key=full_key, UploadId=upload_id)
        except ClientError as exc:
            if not _missing(exc):
                raise

    def _existing_parts(self, full: str, upload_id: str) -> dict[int, dict] | None:
        parts: dict[int, dict] = {}
        try:
            pager = self.client.get_paginator("list_parts")
            for page in pager.paginate(Bucket=self.bucket, Key=full, UploadId=upload_id):
                for p in page.get("Parts", []):
                    parts[p["PartNumber"]] = p
        except ClientError as exc:
            if _missing(exc):
                return None
            raise
        return parts

    def _multipart(
        self, path: Path, key: str, sha256: str, size: int, part: int, transfer: Transfer
    ) -> None:
        full = self._k(key)
        skey = self._state_key(key, sha256, part)
        upload_id = self.state.get(skey) if self.state else None
        existing = self._existing_parts(full, upload_id) if upload_id else None
        if existing is None:
            upload_id = self._start_upload(key, sha256, skey)
            existing = {}

        def one(n: int, off: int, length: int) -> dict:
            data = read_range(path, off, length)
            have = existing.get(n)
            md5 = hashlib.md5(data)
            if have and have["Size"] == length and have["ETag"].strip('"') == md5.hexdigest():
                if transfer.progress:
                    transfer.progress.skip(length)
                return {"PartNumber": n, "ETag": have["ETag"]}
            r = self.client.upload_part(
                Bucket=self.bucket,
                Key=full,
                UploadId=upload_id,
                PartNumber=n,
                Body=ThrottledReader(data, transfer),
                ContentLength=length,
                ContentMD5=base64.b64encode(md5.digest()).decode(),
            )
            return {"PartNumber": n, "ETag": r["ETag"]}

        ranges = part_ranges(size, part)
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(one, *r) for r in ranges]
            try:
                done = [f.result() for f in futures]
            except BaseException:
                for f in futures:
                    f.cancel()
                raise
        self.client.complete_multipart_upload(
            Bucket=self.bucket,
            Key=full,
            UploadId=upload_id,
            MultipartUpload={"Parts": sorted(done, key=lambda p: p["PartNumber"])},
        )
        if self.state:
            self.state.pop(skey)

    # --- the rest -------------------------------------------------------------
    def read_chunks(self, key: str, start: int = 0) -> Iterator[bytes]:
        kw = {"Range": f"bytes={start}-"} if start else {}
        try:
            r = self.client.get_object(Bucket=self.bucket, Key=self._k(key), **kw)
        except ClientError as exc:
            if _missing(exc):
                raise StoreError(f"{key}: not found") from exc
            raise
        yield from r["Body"].iter_chunks(CHUNK)

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/json") -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=self._k(key),
            Body=data,
            ContentType=content_type,
            ContentMD5=_md5_b64(data),
        )

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._k(key))

    def abort_stale_uploads(self, older_than: datetime, dry_run: bool = False) -> int:
        n = 0
        pager = self.client.get_paginator("list_multipart_uploads")
        for page in pager.paginate(Bucket=self.bucket, Prefix=self.prefix):
            for u in page.get("Uploads", []):
                if u["Initiated"] < older_than:
                    n += 1
                    if not dry_run:
                        self._abort(u["Key"], u["UploadId"])
        return n
