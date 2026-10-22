"""Store configuration: a TOML file and/or ORCHADOS_STORE_* environment variables.

Only *where* the store is lives here (backend, bucket, region, endpoint, profile).
Credentials come from each provider's standard chain (environment, profile file,
instance role / managed identity) and are refused in the config file.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, fields, replace
from pathlib import Path

BACKENDS = ("s3", "azure", "local")
# S3-compatible flavours; they share one code path (store/s3.py) and differ only
# in endpoint, region and addressing defaults.
S3_PROVIDERS = ("aws", "r2", "gcs", "minio", "generic")

CONFIG_ENV = "ORCHADOS_INGEST_CONFIG"
ENV_PREFIX = "ORCHADOS_STORE_"
GCS_ENDPOINT = "https://storage.googleapis.com"
DEFAULT_AWS_REGION = "eu-central-1"

# Key fragments that mark a credential; such keys are rejected in the config file.
_SECRET_HINTS = ("secret", "password", "token", "connection_string", "access_key", "account_key")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class StoreConfig:
    backend: str = "local"
    # s3 only: aws | r2 | gcs | minio | generic
    provider: str = "aws"
    # s3 bucket or azure container
    bucket: str = ""
    # optional key prefix inside the bucket (e.g. a shared bucket)
    prefix: str = ""
    region: str = ""
    endpoint: str = ""
    # s3: named profile in ~/.aws/{config,credentials}
    profile: str = ""
    # azure: https://<account>.blob.core.windows.net (credentials: DefaultAzureCredential);
    # without it AZURE_STORAGE_CONNECTION_STRING is used
    account_url: str = ""
    # local: root folder
    root: str = ""
    part_size_mb: int = 64
    concurrency: int = 4

    def validate(self) -> StoreConfig:
        if self.backend not in BACKENDS:
            raise ConfigError(f"backend must be one of {', '.join(BACKENDS)}, not {self.backend!r}")
        if self.backend == "local":
            if not self.root:
                raise ConfigError("local backend needs root (ORCHADOS_STORE_ROOT)")
        elif not self.bucket:
            raise ConfigError(f"{self.backend} backend needs bucket (ORCHADOS_STORE_BUCKET)")
        if self.backend == "s3":
            if self.provider not in S3_PROVIDERS:
                raise ConfigError(
                    f"s3 provider must be one of {', '.join(S3_PROVIDERS)}, not {self.provider!r}"
                )
            if self.provider in ("r2", "minio") and not self.endpoint:
                raise ConfigError(f"s3 provider {self.provider} needs endpoint")
        if self.part_size_mb < 5:
            raise ConfigError("part_size_mb must be at least 5 (S3 minimum part size)")
        if self.concurrency < 1:
            raise ConfigError("concurrency must be at least 1")
        if self.prefix and (self.prefix.startswith("/") or ".." in self.prefix.split("/")):
            raise ConfigError(f"bad prefix {self.prefix!r}")
        return self

    @property
    def key_prefix(self) -> str:
        p = self.prefix.strip("/")
        return f"{p}/" if p else ""

    def describe(self) -> str:
        """One line for logs; never contains credentials (none are stored here)."""
        if self.backend == "local":
            return f"local:{self.root}"
        if self.backend == "azure":
            where = self.account_url or "connection string"
            return f"azure:{self.bucket} ({where})"
        s3 = s3_settings(self)
        return f"s3/{self.provider}:{self.bucket} ({s3.endpoint or 'aws'}, {s3.region})"


@dataclass(frozen=True)
class S3Settings:
    """Resolved client settings for one S3-compatible provider."""

    endpoint: str | None
    region: str
    addressing_style: str


def s3_settings(cfg: StoreConfig) -> S3Settings:
    """Provider presets. GCS (HMAC keys, XML API) and R2 are plain S3 with another endpoint."""
    endpoint = cfg.endpoint or None
    if cfg.provider == "aws":
        return S3Settings(endpoint, cfg.region or DEFAULT_AWS_REGION, "virtual")
    if cfg.provider == "gcs":
        return S3Settings(endpoint or GCS_ENDPOINT, cfg.region or "auto", "path")
    if cfg.provider == "r2":
        return S3Settings(endpoint, cfg.region or "auto", "path")
    if cfg.provider == "minio":
        return S3Settings(endpoint, cfg.region or "us-east-1", "path")
    return S3Settings(endpoint, cfg.region or "us-east-1", "path" if endpoint else "virtual")


def _coerce(name: str, value: object) -> object:
    if name in ("part_size_mb", "concurrency"):
        try:
            return int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise ConfigError(f"{name} must be an integer, not {value!r}") from exc
    if not isinstance(value, str):
        raise ConfigError(f"{name} must be a string, not {value!r}")
    return value


def from_mapping(
    data: dict, base: StoreConfig | None = None, source: str = "config"
) -> StoreConfig:
    known = {f.name for f in fields(StoreConfig)}
    updates: dict[str, object] = {}
    for key, value in data.items():
        k = key.lower()
        if any(h in k for h in _SECRET_HINTS):
            raise ConfigError(
                f"{source}: {key!r} looks like a credential; credentials come from the "
                "provider's environment variables, profile or machine role, not the config"
            )
        if k not in known:
            raise ConfigError(f"{source}: unknown setting {key!r}")
        updates[k] = _coerce(k, value)
    return replace(base or StoreConfig(), **updates)


def default_config_path(env: dict[str, str] | None = None) -> Path:
    env = os.environ if env is None else env
    base = env.get("XDG_CONFIG_HOME") or (env.get("APPDATA") if os.name == "nt" else None)
    root = Path(base) if base else Path.home() / ".config"
    return root / "orchados" / "ingest.toml"


def load(path: Path | None = None, env: dict[str, str] | None = None) -> StoreConfig:
    """File (explicit, $ORCHADOS_INGEST_CONFIG or the default path if present), then env."""
    env = dict(os.environ) if env is None else env
    cfg = StoreConfig()
    explicit = path or (Path(env[CONFIG_ENV]) if env.get(CONFIG_ENV) else None)
    file = explicit or default_config_path(env)
    if explicit and not file.is_file():
        raise ConfigError(f"config file {file} not found")
    if file.is_file():
        with file.open("rb") as fh:
            data = tomllib.load(fh)
        # Accept either top-level keys or a [store] table.
        cfg = from_mapping(data.get("store", data), cfg, str(file))
    env_values = {
        k[len(ENV_PREFIX) :].lower(): v
        for k, v in env.items()
        if k.startswith(ENV_PREFIX) and v != ""
    }
    if env_values:
        cfg = from_mapping(env_values, cfg, "environment")
    return cfg.validate()
