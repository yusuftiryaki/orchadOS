"""Run the stages in order; each stage can also be run alone from its saved inputs."""

from __future__ import annotations

from pathlib import Path

from . import coverage, crops, frames, ingest, outputs, panoramas, position, sync
from .context import RunContext
from .models import (
    ClockModel,
    CoverageReport,
    CropSet,
    FrameSelection,
    Manifest,
    PanoramaSet,
    Trajectory,
    TreeList,
    read_model,
)


def default_trees_path(ctx: RunContext) -> Path | None:
    p = ctx.session_dir / "trees.json"
    return p if p.is_file() else None


def _load(ctx: RunContext, cls, path: Path, stage: str):
    if not path.is_file():
        raise FileNotFoundError(f"{path} not found; run the '{stage}' stage first")
    return read_model(cls, path)


def stage_ingest(ctx: RunContext) -> Manifest:
    return ingest.run(ctx)


def stage_position(ctx: RunContext) -> Trajectory:
    return position.run(ctx, _load(ctx, Manifest, ctx.manifest_path, "ingest"))


def stage_sync(ctx: RunContext) -> ClockModel:
    return sync.run(ctx, _load(ctx, Manifest, ctx.manifest_path, "ingest"))


def stage_frames(ctx: RunContext) -> FrameSelection:
    return frames.run(
        ctx,
        _load(ctx, Manifest, ctx.manifest_path, "ingest"),
        _load(ctx, Trajectory, ctx.trajectory_path, "position"),
        _load(ctx, ClockModel, ctx.sync_path, "sync"),
    )


def stage_panoramas(ctx: RunContext) -> PanoramaSet:
    return panoramas.run(
        ctx,
        _load(ctx, Manifest, ctx.manifest_path, "ingest"),
        _load(ctx, FrameSelection, ctx.frames_path, "frames"),
    )


def stage_crops(
    ctx: RunContext, trees_path: Path | None = None, tree_list: TreeList | None = None
) -> CropSet | None:
    """Crops from a tree list (e.g. trees_db.session_tree_list), a trees file, or the
    session's trees.json; None when there is none of them."""
    if tree_list is None:
        trees_path = trees_path or default_trees_path(ctx)
        if trees_path is None:
            return None
        tree_list = crops.load_trees(trees_path)
    return crops.run(
        ctx,
        _load(ctx, Manifest, ctx.manifest_path, "ingest"),
        _load(ctx, PanoramaSet, ctx.panoramas_path, "panoramas"),
        tree_list,
    )


def stage_coverage(
    ctx: RunContext, trees_path: Path | None = None, tree_list: TreeList | None = None
) -> CoverageReport | None:
    """Coverage of a tree list (as stage_crops; else the list the crops stage saved in
    the run folder); None when there is no tree list."""
    if tree_list is None:
        trees_path = trees_path or (ctx.trees_path if ctx.trees_path.is_file() else None)
        trees_path = trees_path or default_trees_path(ctx)
        if trees_path is None:
            return None
        tree_list = crops.load_trees(trees_path)
    return coverage.run(
        ctx,
        _load(ctx, Manifest, ctx.manifest_path, "ingest"),
        _load(ctx, PanoramaSet, ctx.panoramas_path, "panoramas"),
        tree_list,
    )


def stage_outputs(ctx: RunContext) -> outputs.Outputs:
    cset = read_model(CropSet, ctx.crops_path) if ctx.crops_path.is_file() else None
    return outputs.run(
        ctx,
        _load(ctx, Manifest, ctx.manifest_path, "ingest"),
        _load(ctx, PanoramaSet, ctx.panoramas_path, "panoramas"),
        cset,
    )


def run_all(
    ctx: RunContext, trees_path: Path | None = None, tree_list: TreeList | None = None
) -> outputs.Outputs:
    stage_ingest(ctx)
    stage_position(ctx)
    stage_sync(ctx)
    stage_frames(ctx)
    stage_panoramas(ctx)
    for stale in (ctx.crops_path, ctx.trees_path, ctx.coverage_path):
        stale.unlink(missing_ok=True)
    stage_crops(ctx, trees_path, tree_list)
    stage_coverage(ctx, trees_path, tree_list)
    return stage_outputs(ctx)
