"""Google Cloud Storage goes through S3 compatibility (XML API + HMAC keys).

The gcs preset differs from minio only in endpoint and region; the store class,
client options and every request are the same. With the endpoint pointed at
MinIO, the gcs configuration runs the whole push/pull/verify path.
"""

from __future__ import annotations

import pytest
from conftest import MINIO_PASSWORD, MINIO_USER, write_session

from orchados_ingest import ops
from orchados_ingest.config import GCS_ENDPOINT, StoreConfig, load
from orchados_ingest.store import open_store
from orchados_ingest.store.s3 import S3Store, client_config


def _opts(cfg: StoreConfig) -> dict:
    c = client_config(cfg)
    return {
        "addressing": c.s3["addressing_style"],
        "request_checksum": c.request_checksum_calculation,
        "response_checksum": c.response_checksum_validation,
        "retries": c.retries,
    }


def test_gcs_preset_is_plain_s3(tmp_path, monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "GOOG-hmac-id")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "hmac-secret")
    gcs = StoreConfig(backend="s3", provider="gcs", bucket="orchados-raw")
    store = open_store(gcs, tmp_path)
    assert type(store) is S3Store
    assert store.client.meta.endpoint_url == GCS_ENDPOINT
    assert store.client.meta.region_name == "auto"
    minio = StoreConfig(backend="s3", provider="minio", bucket="b", endpoint="http://m:9000")
    assert _opts(gcs) == _opts(minio)


@pytest.mark.minio
def test_gcs_config_against_minio(minio_url, tmp_path, monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", MINIO_USER)
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", MINIO_PASSWORD)
    cfg = load(
        env={
            "XDG_CONFIG_HOME": str(tmp_path),
            "ORCHADOS_STORE_BACKEND": "s3",
            "ORCHADOS_STORE_PROVIDER": "gcs",
            "ORCHADOS_STORE_BUCKET": "gcs-compat",
            "ORCHADOS_STORE_ENDPOINT": minio_url,  # in place of storage.googleapis.com
            "ORCHADOS_STORE_REGION": "us-east-1",  # MinIO's region; GCS takes "auto"
            "ORCHADOS_STORE_PART_SIZE_MB": "5",
        }
    )
    store = open_store(cfg, tmp_path / "state")
    assert type(store) is S3Store and store.client.meta.endpoint_url == minio_url
    store.ensure_bucket()

    calls: list[str] = []
    store.client.meta.events.register("before-call.s3", lambda model, **_: calls.append(model.name))
    src = write_session(tmp_path / "s", video_bytes=11 * 1024 * 1024)
    ops.push(store, src, "s-1", quiet=True)
    assert {"CreateMultipartUpload", "UploadPart", "CompleteMultipartUpload", "PutObject"} <= set(
        calls
    )
    ops.pull(store, "s-1", tmp_path / "out", quiet=True)
    assert ops.verify(store, "s-1", deep=True).ok
