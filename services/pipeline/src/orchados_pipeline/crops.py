"""Stage 6 – crops: perspective views of each tree from up to four sides."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import cv2

from .context import RunContext
from .geo import LocalFrame, bearing_deg, wrap180
from .imaging import write_image, write_json_file
from .models import (
    CropRecord,
    CropSet,
    CropStatus,
    Manifest,
    PanoramaRecord,
    PanoramaSet,
    Tree,
    TreeList,
    write_model,
)
from .params import CropParams
from .projection import gnomonic_crop

DIRECTIONS = ("N", "E", "S", "W")
INVENTORY = "inventory"  # public.session.kind of an inventory visit


def load_trees(path: Path) -> TreeList:
    """Tree positions: a list, or {"trees": [...]}, of {tree_id, slot_code, lat, lon};
    or a tree list written by a run (schema orchados.trees/1)."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict) and "schema" in data:
        tlist = TreeList.model_validate(data)
    else:
        if isinstance(data, dict):
            data = data.get("trees", [])
        tlist = TreeList(trees=[Tree.model_validate(t) for t in data])
    check_trees(tlist, str(path))
    return tlist


def check_trees(tlist: TreeList, what: str) -> None:
    ids = [t.tree_id for t in tlist.trees]
    if len(set(ids)) != len(ids):
        raise ValueError(f"{what}: duplicate tree_id")


def direction_of(bearing_tree_to_camera: float) -> str:
    return DIRECTIONS[int(((bearing_tree_to_camera + 45.0) % 360.0) // 90.0)]


def view_geometry(
    pano: PanoramaRecord, tree: Tree, camera_height_m: float, params: CropParams, frame: LocalFrame
) -> dict:
    ce, cn = frame.to_en(pano.pose.lat, pano.pose.lon)
    te, tn = frame.to_en(tree.lat, tree.lon)
    de, dn = float(te - ce), float(tn - cn)
    dist = math.hypot(de, dn)
    azimuth = bearing_deg(de, dn)
    yaw = wrap180(azimuth - pano.pose.heading_deg)
    pitch = math.degrees(math.atan2(params.target_height_m - camera_height_m, max(dist, 1e-6)))
    half = math.degrees(math.atan2(params.crown_width_m / 2, max(dist, 1e-6)))
    fov = min(max(2 * half * 1.2, params.min_fov_deg), params.max_fov_deg)
    back = (azimuth + 180.0) % 360.0  # tree -> camera
    return {
        "distance_m": dist,
        "azimuth_deg": azimuth,
        "yaw_deg": yaw,
        "pitch_deg": pitch,
        "fov_deg": fov,
        "direction": direction_of(back),
        "bearing_from_tree_deg": back,
    }


def candidate_views(
    trees: list[Tree], panoramas: list[PanoramaRecord], camera_height_m: float, params: CropParams
):
    """(tree, panorama, geometry, score) of every view in the crop distance range."""
    if not panoramas:
        return
    frame = LocalFrame(panoramas[0].pose.lat, panoramas[0].pose.lon)
    for tree in trees:
        for pano in panoramas:
            g = view_geometry(pano, tree, camera_height_m, params, frame)
            if not params.min_distance_m <= g["distance_m"] <= params.max_distance_m:
                continue
            yield tree, pano, g, view_score(g["distance_m"], pano.quality_score, params)


def view_score(distance_m: float, quality: float, params: CropParams) -> float:
    """Closeness to the ideal distance, weighted by the panorama quality score."""
    d = (distance_m - params.ideal_distance_m) / params.distance_sigma_m
    return math.exp(-d * d) * (0.5 + 0.5 * quality)


def _safe(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", s)


def crop_status(manifest: Manifest, tlist: TreeList) -> CropStatus:
    """Inventory sessions and parcels without tree positions get panoramas only."""
    if INVENTORY in (manifest.session.kind, tlist.session_kind):
        return "inventory_session"
    if not tlist.trees:
        return "no_tree_positions"
    return "ok"


def make_crops(ctx: RunContext, manifest: Manifest, pset: PanoramaSet, tlist: TreeList) -> CropSet:
    p = ctx.params.crops
    producer = ctx.producer("crops")
    cam_h = manifest.session.camera_height_m
    status = crop_status(manifest, tlist)
    common = {
        "producer": producer,
        "status": status,
        "trees_source": tlist.source,
        "unlocated_slots": tlist.unlocated_slots,
    }
    trees = tlist.trees if status == "ok" else []
    if not pset.panoramas or not trees:
        return CropSet(
            crops=[], sidecars=[], trees_without_crops=[t.tree_id for t in trees], **common
        )
    # Best panorama per (tree, direction).
    plan: dict[tuple[str, str], tuple[float, PanoramaRecord, dict]] = {}
    for tree, pano, g, score in candidate_views(trees, pset.panoramas, cam_h, p):
        key = (tree.tree_id, g["direction"])
        if key not in plan or score > plan[key][0]:
            plan[key] = (score, pano, g)

    crops: list[CropRecord] = []
    sidecars = []
    cache: dict[str, object] = {}
    tree_by_id = {t.tree_id: t for t in trees}
    # Grouped by panorama so each 4K image is decoded once.
    order = sorted(plan, key=lambda k: (plan[k][1].gps_time_ns, k[0], DIRECTIONS.index(k[1])))
    for tree_id, direction in order:
        score, pano, g = plan[(tree_id, direction)]
        img = cache.get(pano.panorama_id)
        if img is None:
            img = cv2.imread(str(ctx.run_dir / pano.image.path), cv2.IMREAD_COLOR)
            cache = {pano.panorama_id: img}  # keep one decoded 4K image in memory
        crop = gnomonic_crop(img, g["yaw_deg"], g["pitch_deg"], g["fov_deg"], p.size)
        stem = f"crops/{_safe(tree_id)}_{direction}"
        ref = write_image(crop, ctx.run_dir, f"{stem}.jpg", p.jpeg_quality)
        tree = tree_by_id[tree_id]
        rec = CropRecord(
            tree_id=tree_id,
            slot_code=tree.slot_code,
            direction=direction,
            panorama_id=pano.panorama_id,
            panorama_sha256=pano.image.sha256,
            gps_time_ns=pano.gps_time_ns,
            distance_m=round(g["distance_m"], 3),
            azimuth_deg=round(g["azimuth_deg"], 3),
            yaw_in_panorama_deg=round(g["yaw_deg"], 3),
            pitch_deg=round(g["pitch_deg"], 3),
            fov_deg=round(g["fov_deg"], 3),
            score=round(score, 4),
            image=ref,
            producer=producer,
        )
        crops.append(rec)
        sidecars.append(
            write_json_file(
                rec.model_dump_json(indent=2, by_alias=True) + "\n", ctx.run_dir, f"{stem}.json"
            )
        )
    idx = sorted(
        range(len(crops)), key=lambda i: (crops[i].tree_id, DIRECTIONS.index(crops[i].direction))
    )
    crops, sidecars = [crops[i] for i in idx], [sidecars[i] for i in idx]
    covered = {c.tree_id for c in crops}
    return CropSet(
        crops=crops,
        sidecars=sidecars,
        trees_without_crops=[t.tree_id for t in trees if t.tree_id not in covered],
        **common,
    )


def run(ctx: RunContext, manifest: Manifest, pset: PanoramaSet, tlist: TreeList) -> CropSet:
    if tlist.parcel_id is not None and tlist.parcel_id != manifest.session.parcel_id:
        raise ValueError(
            f"tree list is for parcel {tlist.parcel_id}, the session's parcel is "
            f"{manifest.session.parcel_id}"
        )
    # The list the crops were cut from stays next to them.
    write_model(tlist, ctx.trees_path)
    cset = make_crops(ctx, manifest, pset, tlist)
    write_model(cset, ctx.crops_path)
    return cset
