"""Local state: unfinished multipart upload ids and a file hash cache.

Default folder: $ORCHADOS_INGEST_STATE, else %LOCALAPPDATA%\\orchados-ingest on
Windows, else ~/.local/state/orchados-ingest. Holds no personal data: store keys
(ids and file names), sizes, hashes and upload ids.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

STATE_ENV = "ORCHADOS_INGEST_STATE"


def default_state_dir() -> Path:
    if os.environ.get(STATE_ENV):
        return Path(os.environ[STATE_ENV])
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "orchados-ingest"
    base = os.environ.get("XDG_STATE_HOME")
    return (Path(base) if base else Path.home() / ".local" / "state") / "orchados-ingest"


class JsonState:
    """A small JSON dict on disk, safe to use from several threads of one process."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        try:
            self._data: dict = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self._data = {}

    def get(self, key: str):
        with self._lock:
            return self._data.get(key)

    def set(self, key: str, value) -> None:
        with self._lock:
            self._data[key] = value
            self._save()

    def pop(self, key: str) -> None:
        with self._lock:
            if self._data.pop(key, None) is not None:
                self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(self.path.name + f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(self._data, indent=1, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.path)
