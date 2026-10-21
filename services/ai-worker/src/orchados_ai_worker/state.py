"""Local job state: batch ids, answers and written rows of one session's run.

One folder per session and (prompt version, model cascade) under the state
directory:

    <state dir>/<session id>/<key>/
        state.json        stages, batch ids, answers per tree, written assessment ids
        mosaics/          the request images (<tree id>.jpg, <tree id>.prev.jpg)
        report.json       last run report (counts and cost)

A run that stops (network, ^C, --no-wait) continues from here with
`ai-worker resume`. Batch results stay on the API side for 29 days.
The state holds no personal data: tree ids and codes, crop asset ids,
staff answers by metric code and the model's answers.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

STATE_VERSION = 1


def default_state_dir() -> Path:
    env = os.environ.get("AI_WORKER_STATE_DIR")
    if env:
        return Path(env)
    base = os.environ.get("XDG_STATE_HOME") or str(Path.home() / ".local" / "state")
    return Path(base) / "orchados-ai-worker"


def job_dir(state_dir: Path, session_id: str, prompt_version: str, config_key: str) -> Path:
    key = hashlib.sha256(f"{prompt_version}|{config_key}".encode()).hexdigest()[:12]
    return Path(state_dir) / session_id / key


class JobState:
    def __init__(self, folder: Path, data: dict[str, Any]):
        self.folder = Path(folder)
        self.data = data

    @classmethod
    def new(cls, folder: Path, **header: Any) -> JobState:
        data = {
            "version": STATE_VERSION,
            **header,
            "trees": {},
            "rounds": [],
            "outcomes": {},
            "written": {},
        }
        return cls(folder, data)

    @classmethod
    def load(cls, folder: Path) -> JobState | None:
        path = Path(folder) / "state.json"
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") != STATE_VERSION:
            raise ValueError(f"{path}: unknown state version {data.get('version')}")
        return cls(folder, data)

    def save(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        path = self.folder / "state.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=1, sort_keys=True), encoding="utf-8")
        os.replace(tmp, path)

    # --- convenience -------------------------------------------------------------

    @property
    def trees(self) -> dict[str, dict[str, Any]]:
        return self.data["trees"]

    @property
    def outcomes(self) -> dict[str, list[dict[str, Any]]]:
        return self.data["outcomes"]

    @property
    def written(self) -> dict[str, str]:
        return self.data["written"]

    @property
    def rounds(self) -> list[dict[str, Any]]:
        return self.data["rounds"]

    def mosaic_path(self, tree_id: str, previous: bool = False) -> Path:
        return self.folder / "mosaics" / f"{tree_id}{'.prev' if previous else ''}.jpg"

    def write_report(self, report: dict[str, Any]) -> Path:
        path = self.folder / "report.json"
        path.write_text(json.dumps(report, indent=1, sort_keys=True), encoding="utf-8")
        return path
