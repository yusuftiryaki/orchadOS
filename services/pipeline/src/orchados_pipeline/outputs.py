"""Stage 7 – outputs.json (uploading is in upload.py).

outputs.json follows the Capture/Asset split of docs/veri-modeli.md: captures
are the raw input files (by content hash), assets are derived files with their
lineage (source captures and parent assets) and the producing pipeline version
and parameter hash.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import Field

from . import PIPELINE_NAME, __version__
from .context import RunContext
from .hashing import sha256_file
from .models import (
    CropSet,
    CropStatus,
    FileRef,
    FileRole,
    Manifest,
    Model,
    PanoramaSet,
    Pose,
    write_model,
)

AssetKind = Literal[
    "manifest",
    "trajectory",
    "time_sync",
    "frame_selection",
    "panorama",
    "panorama_preview",
    "tree_crop",
]


class CaptureEntry(Model):
    capture_id: str  # sha256 of the file
    kind: FileRole
    path: str
    size: int


class Lineage(Model):
    captures: list[str] = Field(default_factory=list)
    assets: list[str] = Field(default_factory=list)


class AssetEntry(Model):
    asset_id: str  # sha256 of the file
    kind: AssetKind
    file: FileRef
    sidecar: FileRef | None = None
    gps_time_ns: int | None = None
    pose: Pose | None = None
    quality_score: float | None = None
    subject: dict[str, str] | None = None  # e.g. {"tree_id": ..., "slot_code": ...}
    derived_from: Lineage
    producer_stage: str


class PipelineRef(Model):
    name: str
    version: str
    params_hash: str
    params: dict


class Outputs(Model):
    schema_: Literal["orchados.outputs/1"] = Field("orchados.outputs/1", alias="schema")
    pipeline: PipelineRef
    session_id: str
    parcel_id: str
    org_id: str | None
    captures: list[CaptureEntry]
    assets: list[AssetEntry]
    # crops.json status (ok, no_tree_positions, inventory_session); null without a tree list.
    crops_status: CropStatus | None = None
    warnings: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid", "populate_by_name": True}


def _file_ref(run_dir: Path, rel: str, media_type: str = "application/json") -> FileRef:
    path = run_dir / rel
    return FileRef(
        path=rel, sha256=sha256_file(path), size=path.stat().st_size, media_type=media_type
    )


def build_outputs(
    ctx: RunContext, manifest: Manifest, pset: PanoramaSet, cset: CropSet | None
) -> Outputs:
    run_dir = ctx.run_dir
    captures = [
        CaptureEntry(capture_id=f.sha256, kind=f.role, path=f.path, size=f.size)
        for f in manifest.files
        if f.role != FileRole.extra
    ]
    cap = {f.role: [f.sha256 for f in manifest.by_role(f.role)] for f in manifest.files}
    gnss = (
        cap.get(FileRole.gnss_raw, [])
        + cap.get(FileRole.base_obs, [])
        + cap.get(FileRole.base_nav, [])
    )
    videos = cap.get(FileRole.video, [])
    events = cap.get(FileRole.gnss_events, [])

    assets: list[AssetEntry] = []

    def add(kind, rel, lineage, stage, **kw) -> str:
        ref = _file_ref(run_dir, rel)
        assets.append(
            AssetEntry(
                asset_id=ref.sha256,
                kind=kind,
                file=ref,
                derived_from=lineage,
                producer_stage=stage,
                **kw,
            )
        )
        return ref.sha256

    man = add(
        "manifest",
        ctx.manifest_path.name,
        Lineage(captures=[c.capture_id for c in captures]),
        "ingest",
    )
    traj = add(
        "trajectory", ctx.trajectory_path.name, Lineage(captures=gnss, assets=[man]), "position"
    )
    sync = add(
        "time_sync", ctx.sync_path.name, Lineage(captures=videos + events, assets=[man]), "sync"
    )
    frames = add(
        "frame_selection",
        ctx.frames_path.name,
        Lineage(captures=videos, assets=[traj, sync]),
        "frames",
    )

    for rec, side in zip(pset.panoramas, pset.sidecars, strict=True):
        lineage = Lineage(captures=[rec.source_video_sha256], assets=[traj, sync, frames])
        common = dict(
            gps_time_ns=rec.gps_time_ns,
            pose=rec.pose,
            quality_score=rec.quality_score,
            producer_stage="panoramas",
            sidecar=side,
        )
        assets.append(
            AssetEntry(
                asset_id=rec.image.sha256,
                kind="panorama",
                file=rec.image,
                derived_from=lineage,
                **common,
            )
        )
        assets.append(
            AssetEntry(
                asset_id=rec.preview.sha256,
                kind="panorama_preview",
                file=rec.preview,
                derived_from=lineage,
                **common,
            )
        )

    if cset is not None:
        for rec, side in zip(cset.crops, cset.sidecars, strict=True):
            assets.append(
                AssetEntry(
                    asset_id=rec.image.sha256,
                    kind="tree_crop",
                    file=rec.image,
                    sidecar=side,
                    gps_time_ns=rec.gps_time_ns,
                    quality_score=rec.score,
                    subject={
                        "tree_id": rec.tree_id,
                        "slot_code": rec.slot_code,
                        "direction": rec.direction,
                    },
                    derived_from=Lineage(assets=[rec.panorama_sha256]),
                    producer_stage="crops",
                )
            )

    warnings = list(manifest.warnings)
    if cset is not None and cset.status == "ok" and cset.unlocated_slots:
        warnings.append(
            f"{len(cset.unlocated_slots)} active trees have no position yet, no crops: "
            + ", ".join(cset.unlocated_slots)
        )
    return Outputs(
        pipeline=PipelineRef(
            name=PIPELINE_NAME,
            version=__version__,
            params_hash=ctx.params_hash,
            params=ctx.params.model_dump(mode="json"),
        ),
        session_id=manifest.session.session_id,
        parcel_id=manifest.session.parcel_id,
        org_id=manifest.session.org_id,
        captures=captures,
        assets=assets,
        crops_status=None if cset is None else cset.status,
        warnings=warnings,
    )


def run(ctx: RunContext, manifest: Manifest, pset: PanoramaSet, cset: CropSet | None) -> Outputs:
    out = build_outputs(ctx, manifest, pset, cset)
    write_model(out, ctx.outputs_path)
    return out


def load_outputs(path: Path) -> Outputs:
    return Outputs.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
