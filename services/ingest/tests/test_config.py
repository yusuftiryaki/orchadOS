from __future__ import annotations

import pytest

from orchados_ingest.config import (
    GCS_ENDPOINT,
    ConfigError,
    StoreConfig,
    load,
    s3_settings,
)


def test_env_only(tmp_path):
    cfg = load(
        env={
            "ORCHADOS_STORE_BACKEND": "s3",
            "ORCHADOS_STORE_BUCKET": "raw",
            "ORCHADOS_STORE_PART_SIZE_MB": "128",
            "ORCHADOS_INGEST_CONFIG": "",
            "XDG_CONFIG_HOME": str(tmp_path),  # no default file
        }
    )
    assert (cfg.backend, cfg.provider, cfg.bucket, cfg.part_size_mb) == ("s3", "aws", "raw", 128)
    assert s3_settings(cfg).region == "eu-central-1"


def test_file_then_env_override(tmp_path):
    f = tmp_path / "ingest.toml"
    f.write_text(
        '[store]\nbackend = "s3"\nprovider = "gcs"\nbucket = "a"\nprefix = "pilot/"\n',
        encoding="utf-8",
    )
    cfg = load(f, env={"ORCHADOS_STORE_BUCKET": "b"})
    assert (cfg.provider, cfg.bucket, cfg.key_prefix) == ("gcs", "b", "pilot/")


def test_default_file_location(tmp_path):
    d = tmp_path / "orchados"
    d.mkdir()
    (d / "ingest.toml").write_text('backend = "local"\nroot = "/srv/raw"\n', encoding="utf-8")
    cfg = load(env={"XDG_CONFIG_HOME": str(tmp_path)})
    assert (cfg.backend, cfg.root) == ("local", "/srv/raw")


@pytest.mark.parametrize(
    "key", ["secret_access_key", "connection_string", "account_key", "password", "sas_token"]
)
def test_credentials_refused_in_file(tmp_path, key):
    f = tmp_path / "c.toml"
    f.write_text(f'backend = "s3"\nbucket = "a"\n{key} = "x"\n', encoding="utf-8")
    with pytest.raises(ConfigError, match="credential"):
        load(f, env={})


def test_unknown_key_and_validation(tmp_path):
    f = tmp_path / "c.toml"
    f.write_text('backend = "s3"\nbuckett = "a"\n', encoding="utf-8")
    with pytest.raises(ConfigError, match="unknown"):
        load(f, env={})
    with pytest.raises(ConfigError, match="bucket"):
        StoreConfig(backend="s3").validate()
    with pytest.raises(ConfigError, match="endpoint"):
        StoreConfig(backend="s3", provider="r2", bucket="a").validate()
    with pytest.raises(ConfigError, match="root"):
        StoreConfig(backend="local").validate()
    with pytest.raises(ConfigError, match="part_size"):
        StoreConfig(backend="local", root="/x", part_size_mb=1).validate()
    with pytest.raises(ConfigError, match="backend"):
        StoreConfig(backend="ftp").validate()


def test_provider_presets():
    gcs = s3_settings(StoreConfig(backend="s3", provider="gcs", bucket="a"))
    assert (gcs.endpoint, gcs.region, gcs.addressing_style) == (GCS_ENDPOINT, "auto", "path")
    r2 = s3_settings(StoreConfig(backend="s3", provider="r2", bucket="a", endpoint="https://x"))
    assert (r2.endpoint, r2.region) == ("https://x", "auto")
    aws = s3_settings(StoreConfig(backend="s3", bucket="a", region="eu-west-1"))
    assert (aws.endpoint, aws.region, aws.addressing_style) == (None, "eu-west-1", "virtual")


def test_describe_has_no_credentials(monkeypatch):
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "very-secret")
    cfg = StoreConfig(backend="s3", provider="minio", bucket="a", endpoint="http://m:9000")
    assert "very-secret" not in cfg.describe()
