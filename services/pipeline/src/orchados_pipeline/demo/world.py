"""The 3D world of the demo's main visits (dataset version 5, İP17).

The demo kit has no LiDAR; the parcel's cloud is sampled from the very primitives
the panoramas are rendered from (render.visit_shapes: crown ellipsoids, trunk and
branch cylinders, stakes; flat ground z = 0), so the real ``lidar world`` stage
colours it from the rendered panoramas and the panorama -> 3D transition is
seamless. The crown measurements the 3D world draws are version 4's (lidar.py:
the same drawn trees, measured tree by tree by the real crown stage).

Frame: the cloud is in the parcel's local east/north/up frame with the parcel
origin (ParcelSpec.origin_lat/lon) as origin; origin_height_m is the antenna
height of the panorama poses minus CAMERA_HEIGHT_M, so the ground is at z = 0
and a panorama's camera stands at z = CAMERA_HEIGHT_M above its point, exactly
where render.render() put it (and pose.height_m - origin_height_m = 2.0 m up to
the poses' 5 cm noise).

Deterministic: every random choice is seeded from (SEED_VERSION, key).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache

import numpy as np

from ..lidar.cloud import TreePosition
from ..lidar.models import CloudMeta
from ..lidar.world import View, World, WorldParams, build_world
from .dataset import CAMERA_HEIGHT_M, PRODUCER, PRODUCER_VERSION, Dataset, Visit, rng
from .render import Capsule, Ellipsoid, _bilinear, fbm_tile, visit_shapes

# Visits with a world cloud: the tour's main visit and the one before it (the
# tour's time travel).
WORLD_VISITS = ("A-SCN26", "A-SCN25")
# The world stage's report in the visit's run folder (sqlgen.world_clouds).
REPORT_FILE = "world.json"
# Points per square metre of surface sampled before the world stage thins them.
DENSITY = {"crown": 90.0, "wood": 400.0, "ground": 45.0}
NOISE_M = 0.01
GROUND_MARGIN_M = 5.0
# World stage per profile: the file budget is ~4 MB (full) and ~400 KB (test) per
# cloud at 11 bytes per point.
WORLD_PARAMS = {
    "full": {"voxel_m": 0.1, "max_points": 360_000},
    "test": {"voxel_m": 0.45, "max_points": 36_000},
}


def world_params(profile: str) -> WorldParams:
    return WorldParams(**WORLD_PARAMS[profile])


@cache
def _leaf_tiles() -> tuple[np.ndarray, np.ndarray]:
    """The renderer's leaf noise (Scene.leaf, Scene.leaf_fine)."""
    return fbm_tile("leaf", 256, 4, 16), fbm_tile("leaf-fine", 256, 2, 64)


def _ellipsoid_area(r: np.ndarray) -> float:
    a, b, c = (float(x) for x in r)
    p = 1.6075
    return 4 * math.pi * ((a**p * b**p + a**p * c**p + b**p * c**p) / 3) ** (1 / p)


def _sample_ellipsoid(e: Ellipsoid, g: np.random.Generator) -> np.ndarray:
    n = int(g.poisson(_ellipsoid_area(e.r) * DENSITY["crown"]))
    u = g.normal(size=(n, 3))
    u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-12
    pts = e.c + u * e.r
    if e.scale > 0 and e.holes > 0:
        # See-through leaf holes of the renderer (render._ellipsoid without the rim term).
        leaf, fine_t = _leaf_tiles()
        px, py, pz = pts[:, 0], pts[:, 1], pts[:, 2]
        fine = _bilinear(fine_t, (px + 0.7 * py) * 40 + e.tex[0], pz * 40 + e.tex[1])
        clump = _bilinear(leaf, (px - 0.6 * py) * 6 + e.tex[1], pz * 6 + e.tex[0])
        pts = pts[0.6 * fine + 0.4 * clump >= e.holes]
    return pts


def _sample_capsule(cp: Capsule, g: np.random.Generator) -> np.ndarray:
    axis = cp.b - cp.a
    length = float(np.linalg.norm(axis))
    if length < 1e-6:
        return np.zeros((0, 3))
    n = int(g.poisson(2 * math.pi * cp.r * length * DENSITY["wood"]))
    w = axis / length
    e1 = np.cross(w, [0.0, 0.0, 1.0] if abs(w[2]) < 0.9 else [1.0, 0.0, 0.0])
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(w, e1)
    t = g.uniform(0, 1, n)[:, None]
    th = g.uniform(0, 2 * math.pi, n)[:, None]
    pts = cp.a + t * axis + cp.r * (np.cos(th) * e1 + np.sin(th) * e2)
    return pts[pts[:, 2] >= 0]


def _inside(pts: np.ndarray, ells: list[Ellipsoid]) -> np.ndarray:
    inside = np.zeros(len(pts), dtype=bool)
    for e in ells:
        inside |= (((pts - e.c) / e.r) ** 2).sum(1) < 1.0
    return inside


def scene_points(ds: Dataset, visit: Visit) -> np.ndarray:
    """Surface samples of the visit's scene, parcel-local (x along rows, y across, z up)."""
    g = rng(f"lidar:{visit.key}")
    out = []
    for shape in visit_shapes(ds, visit):
        ells = [p for p in shape.prims if isinstance(p, Ellipsoid)]
        for prim in shape.prims:
            if isinstance(prim, Ellipsoid):
                pts = _sample_ellipsoid(prim, g)
                others = [e for e in ells if e is not prim]
                pts = pts[~_inside(pts, others)]
            else:
                pts = _sample_capsule(prim, g)
                pts = pts[~_inside(pts, ells)]
            out.append(pts)
    p = visit.parcel
    m = GROUND_MARGIN_M
    step = 1 / math.sqrt(DENSITY["ground"])
    gx, gy = np.meshgrid(np.arange(-m, p.length_m + m, step), np.arange(-m, p.width_m + m, step))
    gx = gx.ravel() + g.uniform(-step / 2, step / 2, gx.size)
    gy = gy.ravel() + g.uniform(-step / 2, step / 2, gy.size)
    out.append(np.column_stack([gx, gy, np.zeros(gx.size)]))
    pts = np.vstack(out)
    return pts + g.normal(0, NOISE_M, pts.shape)


def to_en(visit: Visit, local: np.ndarray) -> np.ndarray:
    """Parcel-local points -> east/north/up from the parcel origin (ParcelSpec.to_en)."""
    t = math.radians(visit.parcel.row_azimuth_deg)
    x, y = local[:, 0], local[:, 1]
    return np.column_stack(
        [x * math.sin(t) - y * math.cos(t), x * math.cos(t) + y * math.sin(t), local[:, 2]]
    )


def cloud_meta(visit: Visit, antenna_height_m: float) -> CloudMeta:
    """No capture times: nothing of the cloud's time reaches the world file anyway."""
    return CloudMeta(
        session_id=visit.id,
        parcel_id=visit.parcel.id,
        origin_lat=visit.parcel.origin_lat,
        origin_lon=visit.parcel.origin_lon,
        origin_height_m=round(antenna_height_m - CAMERA_HEIGHT_M, 3),
        registration_method="synthetic",
        registration_version=f"{PRODUCER}/{PRODUCER_VERSION}",
        point_sigma_m=NOISE_M,
        sensor="synthetic",
    )


def tree_positions(ds: Dataset, visit: Visit) -> list[TreePosition]:
    p = visit.parcel
    return [TreePosition(t.id, t.code, *p.to_latlon(*t.xy)) for t in ds.trees[p.key]]


@dataclass
class VisitCloud:
    points: np.ndarray  # east/north/up, cloud frame
    meta: CloudMeta
    trees: list[TreePosition]


def visit_cloud(ds: Dataset, visit: Visit, antenna_height_m: float) -> VisitCloud:
    return VisitCloud(
        to_en(visit, scene_points(ds, visit)),
        cloud_meta(visit, antenna_height_m),
        tree_positions(ds, visit),
    )


def camera_view(visit: Visit, x: float, y: float, heading_deg: float, load: Callable) -> View:
    """Where render.render() put the camera: (x, y, CAMERA_HEIGHT_M) parcel-local."""
    e, n = visit.parcel.to_en(x, y)
    return View(np.array([e, n, CAMERA_HEIGHT_M]), heading_deg, load)


def world(vc: VisitCloud, views: list[View], profile: str) -> World:
    return build_world(vc.points, vc.meta, vc.trees, views, world_params(profile))
