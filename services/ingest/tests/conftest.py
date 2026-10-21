"""Fixtures: stores for every backend (local; MinIO and Azurite in containers).

MinIO and Azurite come from ORCHADOS_TEST_MINIO_URL / ORCHADOS_TEST_AZURITE_URL
when set, otherwise the fixture starts a container (images outside Docker Hub:
Chainguard's MinIO on cgr.dev, Azurite on mcr.microsoft.com). Without docker the
integration tests are skipped; CI fails on such skips.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import time
import uuid
from pathlib import Path

import httpx
import pytest

from orchados_ingest.config import StoreConfig
from orchados_ingest.state import JsonState
from orchados_ingest.store.base import MiB

MINIO_IMAGE = os.environ.get("ORCHADOS_TEST_MINIO_IMAGE", "cgr.dev/chainguard/minio:latest")
AZURITE_IMAGE = os.environ.get(
    "ORCHADOS_TEST_AZURITE_IMAGE", "mcr.microsoft.com/azure-storage/azurite:3.35.0"
)
# Test-only server credentials for the throwaway MinIO container.
MINIO_USER, MINIO_PASSWORD = "orchados", "orchados-test-only"
# Azurite's published, fixed development account (same for every Azurite install).
AZURITE_ACCOUNT = "devstoreaccount1"
AZURITE_KEY = (
    "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
)
PART = 5 * MiB  # S3 minimum part size; multipart tests use files of a few parts


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait(url: str, ok=(200,), timeout: float = 60) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if httpx.get(url, timeout=2).status_code in ok:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    return False


def _container(image: str, port: int, inner: int, args: list[str], env: dict[str, str]):
    docker = shutil.which("docker")
    if docker is None:
        return None, "docker not found"
    name = f"orchados-ingest-test-{uuid.uuid4().hex[:8]}"
    cmd = [docker, "run", "-d", "--rm", "--name", name, "-p", f"127.0.0.1:{port}:{inner}"]
    for k, v in env.items():
        cmd += ["-e", f"{k}={v}"]
    proc = subprocess.run([*cmd, image, *args], capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        return None, f"docker run {image} failed: {proc.stderr.strip()[-300:]}"
    return name, None


def _stop(name: str | None) -> None:
    if name:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, timeout=60)


@pytest.fixture(scope="session")
def minio_url():
    url = os.environ.get("ORCHADOS_TEST_MINIO_URL")
    name = None
    if not url:
        port = _free_port()
        env = {"MINIO_ROOT_USER": MINIO_USER, "MINIO_ROOT_PASSWORD": MINIO_PASSWORD}
        name, err = _container(MINIO_IMAGE, port, 9000, ["server", "/tmp/data"], env)
        if err:
            pytest.skip(f"MinIO not available: {err}")
        url = f"http://127.0.0.1:{port}"
    if not _wait(f"{url}/minio/health/ready"):
        _stop(name)
        pytest.skip(f"MinIO not available: {url} not ready")
    yield url
    _stop(name)


@pytest.fixture(scope="session")
def azurite_url():
    url = os.environ.get("ORCHADOS_TEST_AZURITE_URL")
    name = None
    if not url:
        port = _free_port()
        args = ["azurite-blob", "--blobHost", "0.0.0.0", "--skipApiVersionCheck", "--loose"]
        name, err = _container(AZURITE_IMAGE, port, 10000, args, {})
        if err:
            pytest.skip(f"Azurite not available: {err}")
        url = f"http://127.0.0.1:{port}"
    if not _wait(f"{url}/{AZURITE_ACCOUNT}?comp=list", ok=(200, 400, 403)):
        _stop(name)
        pytest.skip(f"Azurite not available: {url} not ready")
    yield url
    _stop(name)


def minio_env(url: str, bucket: str) -> dict[str, str]:
    return {
        "ORCHADOS_STORE_BACKEND": "s3",
        "ORCHADOS_STORE_PROVIDER": "minio",
        "ORCHADOS_STORE_ENDPOINT": url,
        "ORCHADOS_STORE_BUCKET": bucket,
        "ORCHADOS_STORE_PART_SIZE_MB": "5",
        "AWS_ACCESS_KEY_ID": MINIO_USER,
        "AWS_SECRET_ACCESS_KEY": MINIO_PASSWORD,
    }


def azurite_conn(url: str) -> str:
    return (
        f"DefaultEndpointsProtocol=http;AccountName={AZURITE_ACCOUNT};AccountKey={AZURITE_KEY};"
        f"BlobEndpoint={url}/{AZURITE_ACCOUNT};"
    )


def azurite_env(url: str, bucket: str) -> dict[str, str]:
    return {
        "ORCHADOS_STORE_BACKEND": "azure",
        "ORCHADOS_STORE_BUCKET": bucket,
        "ORCHADOS_STORE_PART_SIZE_MB": "5",
        "AZURE_STORAGE_CONNECTION_STRING": azurite_conn(url),
    }


def _bucket() -> str:
    return f"t-{uuid.uuid4().hex[:12]}"


def make_store(kind: str, request, tmp_path: Path, concurrency: int = 2):
    """A fresh, empty store of the given backend (own bucket/container)."""
    if kind == "local":
        from orchados_ingest.store.local import LocalStore

        return LocalStore(tmp_path / "store", part_size=PART, concurrency=concurrency)
    if kind == "minio":
        from orchados_ingest.store.s3 import S3Store, make_client

        url = request.getfixturevalue("minio_url")
        mp = request.getfixturevalue("monkeypatch")
        for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
            mp.setenv(k, minio_env(url, "")[k])
        cfg = StoreConfig(
            backend="s3", provider="minio", endpoint=url, bucket=_bucket(), concurrency=concurrency
        )
        store = S3Store(
            make_client(cfg),
            cfg.bucket,
            state=JsonState(tmp_path / "state" / "uploads.json"),
            part_size=PART,
            concurrency=concurrency,
        )
        store.ensure_bucket()
        return store
    if kind == "azurite":
        from azure.storage.blob import BlobServiceClient

        from orchados_ingest.store.azure import AzureStore

        url = request.getfixturevalue("azurite_url")
        svc = BlobServiceClient.from_connection_string(azurite_conn(url))
        store = AzureStore(
            svc.get_container_client(_bucket()), part_size=PART, concurrency=concurrency
        )
        store.ensure_bucket()
        return store
    raise AssertionError(kind)


BACKENDS = [
    pytest.param("local", id="local"),
    pytest.param("minio", id="minio", marks=pytest.mark.minio),
    pytest.param("azurite", id="azurite", marks=pytest.mark.azurite),
]


@pytest.fixture(params=BACKENDS)
def store(request, tmp_path):
    return make_store(request.param, request, tmp_path)


def write_session(root: Path, video_bytes: int = 11 * MiB, seed: int = 1, **ids) -> Path:
    """A small synthetic session folder (random bytes in place of real media)."""
    import random

    rnd = random.Random(seed)
    ids = {"session_id": "s-1", "parcel_id": "p-1", "org_id": "o-1", **ids}
    (root / "gnss").mkdir(parents=True, exist_ok=True)
    (root / "video").mkdir(exist_ok=True)
    (root / "session.json").write_text(json.dumps({**ids, "kind": "scan"}), encoding="utf-8")
    logger = {"session_id": ids["session_id"], "parcel_id": ids["parcel_id"]}
    (root / "gnss" / "session.json").write_text(json.dumps(logger), encoding="utf-8")
    (root / "gnss" / "events.csv").write_text("esp_micros,gps_time_ns\n1,2\n", encoding="utf-8")
    (root / "gnss" / "gnss.ubx").write_bytes(rnd.randbytes(300_000))
    (root / "video" / "VID_0001.mp4").write_bytes(rnd.randbytes(video_bytes))
    return root
