"""Raw store backends behind one interface (base.RawStore)."""

from __future__ import annotations

from pathlib import Path

from ..config import StoreConfig
from ..state import JsonState, default_state_dir
from .base import ObjectInfo, RawStore, StoreError, check_key

__all__ = ["ObjectInfo", "RawStore", "StoreError", "check_key", "open_store"]


def open_store(cfg: StoreConfig, state_dir: Path | None = None) -> RawStore:
    """The configured backend. SDKs are imported only for the backend in use."""
    kw = {"part_size": cfg.part_size_mb * 1024 * 1024, "concurrency": cfg.concurrency}
    if cfg.backend == "local":
        from .local import LocalStore

        return LocalStore(Path(cfg.root), **kw)
    if cfg.backend == "s3":
        from .s3 import S3Store

        state = JsonState((state_dir or default_state_dir()) / "uploads.json")
        return S3Store.from_config(cfg, state)
    if cfg.backend == "azure":
        from .azure import AzureStore

        return AzureStore.from_config(cfg)
    raise StoreError(f"unknown backend {cfg.backend!r}")
