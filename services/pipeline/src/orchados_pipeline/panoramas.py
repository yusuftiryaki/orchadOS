"""Stage 5 – panoramas: write selected frames as 4K and 2K WebP with a JSON sidecar."""

from __future__ import annotations

import shutil
from collections import defaultdict
from pathlib import Path

import cv2

from .context import RunContext
from .gpstime import gps_ns_to_iso
from .imaging import resize, write_image, write_json_file
from .insta360 import Insta360Error, export_frames, is_insv
from .models import (
    FileRole,
    FrameCandidate,
    FrameSelection,
    Manifest,
    PanoramaRecord,
    PanoramaSet,
    Pose,
    SolutionQuality,
    write_model,
)
from .video import iter_frames

_POSITION_FACTOR = {
    SolutionQuality.fix: 1.0,
    SolutionQuality.ppp: 0.9,
    SolutionQuality.float: 0.7,
    SolutionQuality.dgps: 0.5,
    SolutionQuality.sbas: 0.4,
    SolutionQuality.single: 0.4,
}


def quality_score(c: FrameCandidate, median_sharpness: float) -> float:
    """v0 score in [0, 1]: relative sharpness (capped at the median) × position quality."""
    rel = min(1.0, c.sharpness / median_sharpness) if median_sharpness > 0 else 0.0
    return round(rel * _POSITION_FACTOR[c.position_quality], 3)


def panorama_id(c: FrameCandidate) -> str:
    return f"pano-{c.gps_time_ns // 1_000_000}"


def render_panoramas(
    ctx: RunContext,
    manifest: Manifest,
    selection: FrameSelection,
) -> PanoramaSet:
    p = ctx.params.panoramas
    video_sha = {f.path: f.sha256 for f in manifest.by_role(FileRole.video)}
    by_video: dict[str, dict[int, FrameCandidate]] = defaultdict(dict)
    for c in selection.selected():
        by_video[c.video][c.frame_index] = c
    producer = ctx.producer("panoramas")

    records: list[PanoramaRecord] = []
    sidecars = []
    for video in sorted(by_video):
        wanted = by_video[video]
        for idx, frame in _frames(ctx, video, set(wanted)):
            c = wanted[idx]
            pid = panorama_id(c)
            full = write_image(
                resize(frame, p.full_size),
                ctx.run_dir,
                f"panoramas/{pid}_4k.webp",
                p.full_quality,
            )
            preview = write_image(
                resize(frame, p.preview_size),
                ctx.run_dir,
                f"panoramas/{pid}_2k.webp",
                p.preview_quality,
            )
            rec = PanoramaRecord(
                panorama_id=pid,
                session_id=manifest.session.session_id,
                gps_time_ns=c.gps_time_ns,
                utc=gps_ns_to_iso(c.gps_time_ns),
                pose=Pose(
                    lat=c.lat,
                    lon=c.lon,
                    height_m=c.height_m,
                    heading_deg=c.heading_deg,
                    sd_h_m=c.sd_h_m,
                    quality=c.position_quality,
                ),
                quality_score=quality_score(c, selection.median_sharpness),
                sharpness=c.sharpness,
                source_video=video,
                source_video_sha256=video_sha[video],
                frame_index=idx,
                camera_s=c.camera_s,
                image=full,
                preview=preview,
                producer=producer,
            )
            records.append(rec)
            sidecars.append(
                write_json_file(
                    rec.model_dump_json(indent=2, by_alias=True) + "\n",
                    ctx.run_dir,
                    f"panoramas/{pid}.json",
                )
            )
    order = sorted(range(len(records)), key=lambda i: records[i].gps_time_ns)
    return PanoramaSet(
        producer=producer,
        panoramas=[records[i] for i in order],
        sidecars=[sidecars[i] for i in order],
    )


def _frames(ctx: RunContext, video: str, wanted: set[int]):
    """Equirectangular frames: decoded from an MP4, or stitched from an .insv by the SDK."""
    if not is_insv(video):
        yield from iter_frames(ctx.session_dir / video, wanted)
        return
    out = ctx.run_dir / "tmp" / "stitch" / Path(video).stem
    try:
        images = export_frames([ctx.session_dir / video], sorted(wanted), out, ctx.params.insta360)
        for idx in sorted(images):
            frame = cv2.imread(str(images[idx]), cv2.IMREAD_COLOR)
            if frame is None:
                raise Insta360Error(f"{images[idx].name}: cannot be read")
            yield idx, frame
    finally:
        shutil.rmtree(out, ignore_errors=True)
        for parent in (out.parent, out.parent.parent):  # tmp/stitch, tmp: only if empty
            try:
                parent.rmdir()
            except OSError:
                break


def run(
    ctx: RunContext,
    manifest: Manifest,
    selection: FrameSelection,
) -> PanoramaSet:
    pset = render_panoramas(ctx, manifest, selection)
    write_model(pset, ctx.panoramas_path)
    return pset
