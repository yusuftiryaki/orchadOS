"""Stage 4 – frames: candidate frames, their pose, sharpness and per-slice selection."""

from __future__ import annotations

import math

import cv2
import numpy as np

from .context import RunContext
from .geo import bearing_deg
from .models import (
    ClockModel,
    FileRole,
    FrameCandidate,
    FrameSelection,
    Manifest,
    Trajectory,
    write_model,
)
from .params import FrameParams
from .position import TrajectoryInterpolator
from .video import iter_frames, layout_parts


def sharpness(frame: np.ndarray, params: FrameParams) -> float:
    """Variance of the Laplacian on a central horizontal band, at a fixed working width."""
    h, w = frame.shape[:2]
    band = frame[int(h * params.band_top) : int(h * params.band_bottom)]
    gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY) if band.ndim == 3 else band
    if w != params.sharpness_width:
        scale = params.sharpness_width / w
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=interp)
    return float(cv2.Laplacian(gray, cv2.CV_64F, ksize=3).var())


def heading_at(interp: TrajectoryInterpolator, t_ns: int, params: FrameParams) -> float | None:
    """Direction of travel from positions before and after t; None when standing still."""
    window = params.heading_window_s
    for _ in range(4):
        dt = int(window * 1e9)
        a = interp.en(max(t_ns - dt, int(interp.t[0])))
        b = interp.en(min(t_ns + dt, int(interp.t[-1])))
        if a and b:
            de, dn = b[0] - a[0], b[1] - a[1]
            if math.hypot(de, dn) >= params.min_heading_baseline_m:
                return bearing_deg(de, dn)
        window *= 2
    return None


def select_slices(candidates: list[FrameCandidate], slice_m: float) -> list[int]:
    """Mark the sharpest eligible candidate of every along-track slice; return empty slices."""
    best: dict[int, FrameCandidate] = {}
    for c in candidates:
        if not c.eligible:
            continue
        cur = best.get(c.slice_index)
        if cur is None or c.sharpness > cur.sharpness:
            best[c.slice_index] = c
    for c in best.values():
        c.selected = True
    if not candidates:
        return []
    covered = {c.slice_index for c in candidates}
    return sorted(i for i in range(min(covered), max(covered) + 1) if i not in best)


def compute_selection(
    ctx: RunContext, manifest: Manifest, traj: Trajectory, clock: ClockModel
) -> FrameSelection:
    p = ctx.params.frames
    interp = TrajectoryInterpolator(traj, p.max_trajectory_gap_s)
    parts = layout_parts(
        ctx.session_dir, [(f.path, f.video) for f in manifest.by_role(FileRole.video)]
    )
    raw: list[dict] = []
    for part in parts:
        stride = max(1, round(part.info.fps / p.candidate_fps))
        wanted = set()
        for i in range(0, part.info.frame_count, stride):
            cam = part.camera_s(i)
            if clock.scan_start_camera_s < cam < clock.scan_end_camera_s:
                wanted.add(i)
        if not wanted:
            continue
        for idx, frame in iter_frames(part.path, wanted):
            cam = part.camera_s(idx)
            t = clock.camera_to_gps_ns(cam)
            s = interp.sample(t)
            if s is None:
                continue
            heading = heading_at(interp, t, p)
            raw.append(
                {
                    "part": part,
                    "idx": idx,
                    "cam": cam,
                    "t": t,
                    "s": s,
                    "heading": heading,
                    "sharp": sharpness(frame, p),
                }
            )

    # Standing still gives no heading: carry the last known one (or the next one).
    known = [r["heading"] for r in raw if r["heading"] is not None]
    last = known[0] if known else 0.0
    yaw = p.camera_yaw_offset_deg
    if manifest.session.camera_yaw_offset_deg is not None:
        yaw = manifest.session.camera_yaw_offset_deg
    candidates: list[FrameCandidate] = []
    for r in raw:
        if r["heading"] is not None:
            last = r["heading"]
        s = r["s"]
        candidates.append(
            FrameCandidate(
                video=r["part"].rel,
                frame_index=r["idx"],
                camera_s=round(r["cam"], 6),
                gps_time_ns=r["t"],
                lat=s["lat"],
                lon=s["lon"],
                height_m=round(s["height_m"], 4),
                heading_deg=round((last + yaw) % 360.0, 3),
                along_track_m=round(s["along_m"], 4),
                position_quality=s["quality"],
                sd_h_m=round(float(s["sd_h_m"]), 4),
                sharpness=round(r["sharp"], 4),
                slice_index=int(s["along_m"] // p.slice_m),
            )
        )

    median = float(np.median([c.sharpness for c in candidates])) if candidates else 0.0
    for c in candidates:
        c.eligible = c.sharpness >= p.min_relative_sharpness * median and c.sharpness > 0
    empty = select_slices(candidates, p.slice_m)
    return FrameSelection(
        producer=ctx.producer("frames"),
        slice_m=p.slice_m,
        median_sharpness=round(median, 4),
        candidates=candidates,
        empty_slices=empty,
    )


def run(ctx: RunContext, manifest: Manifest, traj: Trajectory, clock: ClockModel) -> FrameSelection:
    sel = compute_selection(ctx, manifest, traj, clock)
    write_model(sel, ctx.frames_path)
    return sel
