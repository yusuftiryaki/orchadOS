"""Stage – presence: is the inventory's tree still there? Has an empty slot been planted?

MVP Module 4, step 5 ("ağaç var/yok kontrol edilir"). A first, model-free version
on the crops: a simple image signal instead of a trunk detector (which the
trunk_label clicks will train later). Method `crop_greenness`, versioned with
METHOD_VERSION and the parameter hash.

Signal: the share of vegetation pixels (excess green 2g - r - b of the
chromaticity above `exg_min`, not too dark) in boxes of the crop where the tree
must be. The crop looks at the tree's position from a known distance and pitch
(crop sidecar), so a box of heights and widths at the tree projects to pixels:

- upper crown box (2.5-4.0 m high, +/- 1.5 m): filled by a grown tree's crown;
  a tree of the next row, 6-8 m further away, appears lower and smaller and
  does not reach it.
- whole box (0.5-4.0 m, +/- 1.5 m): anything green where the tree stands,
  background trees and weeds included.

Per view: `present` when the upper box is green (>= present_min_share); `absent`
when even the whole box is nearly free of green (<= absent_max_share);
`ambiguous` in between; `unusable` for a weak view (crop score below
min_view_score) or a dark or washed-out box.

Per tree (value of the `tree_visible` measurement):
- yes: at least one view is present;
- no: no view is present and views from at least `min_absent_views` different
  sides are absent. A tree that stands there fills the whole box from every
  side (an occluding object adds green, never removes it), so two empty sides
  are strong evidence; a background tree only makes a side ambiguous;
- unsure: everything else. A wrong "no" is worse than "unsure": a young tree
  whose crown stays below the upper box gives ambiguous views, not absent ones,
  as long as it has any leaves in the whole box.

Out of the leafy months (`leafy_months`, April-October) greenness says nothing
about a bare tree: every tree is unsure (reason leafless_season).

Empty slots (no active tree): a lower box (0.2-2.0 m, +/- 1.0 m), where a
sapling stands, green in at least `min_planted_views` views -> yes, "yeni dikim
olabilir"; a suggestion for the expert, never a change to the inventory.
"""

from __future__ import annotations

import math
from typing import Literal

import cv2
import numpy as np

from .context import RunContext
from .gpstime import gps_ns_to_utc
from .models import (
    CropRecord,
    CropSet,
    Manifest,
    PresenceReport,
    PresenceResult,
    ViewSignal,
    write_model,
)
from .params import PresenceParams

METHOD = "crop_greenness"
METHOD_VERSION = "0.1.0"

State = Literal["present", "absent", "ambiguous", "unusable"]


def vegetation_mask(img: np.ndarray, p: PresenceParams) -> np.ndarray:
    """Vegetation pixels of a BGR image: excess green of the chromaticity."""
    f = img.astype(np.float32)
    total = f.sum(axis=2) + 1e-6
    b, g, r = f[..., 0] / total, f[..., 1] / total, f[..., 2] / total
    return ((2 * g - r - b) > p.exg_min) & (f.max(axis=2) >= p.min_brightness)


def project(
    rec: CropRecord, size: int, camera_height_m: float, right_m: float, height_m: float
) -> tuple[float, float]:
    """Pixel (x, y) in the crop of a point beside (right_m) and above the ground
    (height_m) at the tree's position. Inverse of projection.gnomonic_crop."""
    f = (size / 2) / math.tan(math.radians(rec.fov_deg) / 2)
    c = (size - 1) / 2
    p = math.radians(rec.pitch_deg)
    fwd, up = rec.distance_m, height_m - camera_height_m
    y = -math.cos(p) * up + math.sin(p) * fwd
    z = math.sin(p) * up + math.cos(p) * fwd
    return c + f * right_m / z, c + f * y / z


def box(
    rec: CropRecord,
    size: int,
    camera_height_m: float,
    heights: tuple[float, float],
    half_width_m: float,
) -> tuple[int, int, int, int] | None:
    """x0, x1, y0, y1 of a box at the tree, clipped to the crop; None if outside."""
    h_lo, h_hi = heights
    mid = (h_lo + h_hi) / 2
    x0, _ = project(rec, size, camera_height_m, -half_width_m, mid)
    x1, _ = project(rec, size, camera_height_m, half_width_m, mid)
    _, y_top = project(rec, size, camera_height_m, 0.0, h_hi)
    _, y_bot = project(rec, size, camera_height_m, 0.0, h_lo)
    xa, xb = max(0, math.floor(x0)), min(size, math.ceil(x1))
    ya, yb = max(0, math.floor(y_top)), min(size, math.ceil(y_bot))
    if xb - xa < 2 or yb - ya < 2:
        return None
    return xa, xb, ya, yb


def _share(mask: np.ndarray, b: tuple[int, int, int, int] | None) -> float | None:
    if b is None:
        return None
    x0, x1, y0, y1 = b
    return float(mask[y0:y1, x0:x1].mean())


def _brightness(img: np.ndarray, b: tuple[int, int, int, int] | None) -> float | None:
    if b is None:
        return None
    x0, x1, y0, y1 = b
    return float(img[y0:y1, x0:x1].mean())


def tree_view(img: np.ndarray, rec: CropRecord, cam_h: float, p: PresenceParams) -> ViewSignal:
    size = img.shape[0]
    upper = box(rec, size, cam_h, p.upper_box_m, p.box_half_width_m)
    whole = box(rec, size, cam_h, p.whole_box_m, p.box_half_width_m)
    mask = vegetation_mask(img, p)
    up, wh, light = _share(mask, upper), _share(mask, whole), _brightness(img, whole)
    state: State
    if rec.score < p.min_view_score or up is None or wh is None or light is None:
        state = "unusable"
    elif not p.min_mean_brightness <= light <= p.max_mean_brightness:
        state = "unusable"
    elif up >= p.present_min_share:
        state = "present"
    elif wh <= p.absent_max_share:
        state = "absent"
    else:
        state = "ambiguous"
    return ViewSignal(
        direction=rec.direction,
        crop_sha256=rec.image.sha256,
        score=rec.score,
        upper_share=None if up is None else round(up, 4),
        whole_share=None if wh is None else round(wh, 4),
        brightness=None if light is None else round(light, 1),
        state=state,
    )


def slot_view(img: np.ndarray, rec: CropRecord, cam_h: float, p: PresenceParams) -> ViewSignal:
    size = img.shape[0]
    low = box(rec, size, cam_h, p.sapling_box_m, p.sapling_half_width_m)
    mask = vegetation_mask(img, p)
    share, light = _share(mask, low), _brightness(img, low)
    state: State
    if rec.score < p.min_view_score or share is None or light is None:
        state = "unusable"
    elif not p.min_mean_brightness <= light <= p.max_mean_brightness:
        state = "unusable"
    elif share >= p.planted_min_share:
        state = "present"
    else:
        state = "absent"
    return ViewSignal(
        direction=rec.direction,
        crop_sha256=rec.image.sha256,
        score=rec.score,
        sapling_share=None if share is None else round(share, 4),
        brightness=None if light is None else round(light, 1),
        state=state,
    )


def tree_decision(views: list[ViewSignal], leafy: bool, p: PresenceParams) -> tuple[str, str]:
    """(value, reason) of one tree."""
    if not leafy:
        return "unsure", "leafless_season"
    present = [v.direction for v in views if v.state == "present"]
    if present:
        return "yes", "green_crown:" + ",".join(present)
    usable = [v for v in views if v.state != "unusable"]
    absent = sorted({v.direction for v in usable if v.state == "absent"})
    if not usable:
        return "unsure", "no_usable_view"
    if len(absent) >= p.min_absent_views:
        return "no", "no_vegetation:" + ",".join(absent)
    if len(absent) == len(usable):
        return "unsure", "too_few_views"
    return "unsure", "ambiguous"


def slot_decision(views: list[ViewSignal], leafy: bool, p: PresenceParams) -> tuple[str, str]:
    if not leafy:
        return "unsure", "leafless_season"
    present = sorted({v.direction for v in views if v.state == "present"})
    usable = [v for v in views if v.state != "unusable"]
    if len(present) >= p.min_planted_views:
        return "yes", "green_at_slot:" + ",".join(present)
    if not usable:
        return "unsure", "no_usable_view"
    if present:
        return "unsure", "green_in_one_view"
    return "no", "no_vegetation"


def visit_month(cset: CropSet) -> int | None:
    """UTC month of the visit: the earliest crop's panorama time."""
    times = [c.gps_time_ns for c in cset.crops + cset.slot_crops]
    return gps_ns_to_utc(min(times)).month if times else None


def make_report(ctx: RunContext, manifest: Manifest, cset: CropSet) -> PresenceReport:
    p = ctx.params.presence
    cam_h = manifest.session.camera_height_m
    month = visit_month(cset)
    leafy = month is not None and month in p.leafy_months

    def load(rec: CropRecord) -> np.ndarray:
        img = cv2.imread(str(ctx.run_dir / rec.image.path), cv2.IMREAD_COLOR)
        if img is None:
            raise FileNotFoundError(ctx.run_dir / rec.image.path)
        return img

    by_tree: dict[str, list[CropRecord]] = {}
    for c in cset.crops:
        by_tree.setdefault(c.tree_id or "", []).append(c)
    trees = []
    for tree_id, recs in by_tree.items():
        views = [tree_view(load(r), r, cam_h, p) for r in recs]
        value, reason = tree_decision(views, leafy, p)
        trees.append(
            PresenceResult(
                subject="tree",
                tree_id=tree_id,
                slot_code=recs[0].slot_code,
                value=value,
                reason=reason,
                views=views,
            )
        )
    # Trees without any crop are not judged: nothing was seen (coverage reports them).

    by_slot: dict[str, list[CropRecord]] = {}
    for c in cset.slot_crops:
        by_slot.setdefault(c.slot_code, []).append(c)
    slots = []
    for code, recs in by_slot.items():
        views = [slot_view(load(r), r, cam_h, p) for r in recs]
        value, reason = slot_decision(views, leafy, p)
        slots.append(
            PresenceResult(
                subject="slot",
                slot_id=recs[0].slot_id,
                slot_code=code,
                value=value,
                reason=reason,
                views=views,
            )
        )

    return PresenceReport(
        producer=ctx.producer("presence"),
        method=METHOD,
        method_version=METHOD_VERSION,
        session_id=manifest.session.session_id,
        parcel_id=manifest.session.parcel_id,
        month=month,
        leafy=leafy,
        status="ok" if cset.crops or cset.slot_crops else "no_crops",
        trees=trees,
        slots=slots,
    )


def run(ctx: RunContext, manifest: Manifest, cset: CropSet) -> PresenceReport:
    report = make_report(ctx, manifest, cset)
    write_model(report, ctx.presence_path)
    return report
