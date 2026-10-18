"""Run directory layout shared by the stages."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

from . import PIPELINE_NAME, __version__
from .models import Producer
from .params import PipelineParams


@dataclass
class RunContext:
    """One processing run: a session, an output root and a parameter set.

    Results go to <out_root>/v<version>_<params_hash[:12]>/, so reprocessing
    with another version or other parameters never overwrites earlier results.
    """

    session_dir: Path
    out_root: Path
    params: PipelineParams

    def __post_init__(self):
        self.session_dir = Path(self.session_dir)
        self.out_root = Path(self.out_root)

    @classmethod
    def create(
        cls, session_dir: Path, out_root: Path | None = None, params: PipelineParams | None = None
    ) -> RunContext:
        session_dir = Path(session_dir)
        if out_root is None:
            out_root = session_dir.parent / f"{session_dir.name}.processed"
        return cls(session_dir, Path(out_root), params or PipelineParams())

    @cached_property
    def params_hash(self) -> str:
        return self.params.params_hash()

    @property
    def run_dir(self) -> Path:
        return self.out_root / f"v{__version__}_{self.params_hash[:12]}"

    def producer(self, stage: str) -> Producer:
        return Producer(
            pipeline=PIPELINE_NAME, version=__version__, params_hash=self.params_hash, stage=stage
        )

    def path(self, name: str) -> Path:
        return self.run_dir / name

    @property
    def manifest_path(self) -> Path:
        return self.path("manifest.json")

    @property
    def trajectory_path(self) -> Path:
        return self.path("trajectory.json")

    @property
    def sync_path(self) -> Path:
        return self.path("sync.json")

    @property
    def frames_path(self) -> Path:
        return self.path("frames.json")

    @property
    def panoramas_path(self) -> Path:
        return self.path("panoramas.json")

    @property
    def crops_path(self) -> Path:
        return self.path("crops.json")

    @property
    def outputs_path(self) -> Path:
        return self.path("outputs.json")

    def write_params(self) -> Path:
        p = self.path("params.json")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(self.params.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return p
