"""Synthetic LiDAR crown measurements of the demo scans (docs/demo-turu.md §8.2, dataset version 4).

The portal draws the crown measurements over the tree crops and the panoramas
(apps/web/src/lib/portal/crown-guide.ts). For the drawing to land on the drawn
tree, the values come from the same geometry the renderer draws (render.py
tree_shape), measured by the pipeline's own crown stage (lidar/crown.py,
measure_tree with the default CrownParams):

1. The primitives of a tree as it looked in the scan (its class and values of
   that year) are sampled as a walking LiDAR would see them: points on the
   foliage ellipsoids where the renderer draws leaves (the same leaf noise and
   holes), on the nut clusters, the trunk and the scaffold branches. Points hidden
   inside another foliage cluster are dropped; the side facing away from the
   scan aisle keeps fewer points (seen through the crown and from along the
   aisle). Points get the registration's noise (POINT_SIGMA_M).
2. The points are moved to the crown stage's tree-local frame (x east, y north
   of the inventory trunk position, z above the ground) and measured. Height,
   crown diameter, crown volume and crown base, their 1-sigma uncertainties and
   confidences are what the stage writes for such a cloud; size_class (a hidden
   proposal for the office) is not part of the demo.

Every random choice is seeded from (SEED_VERSION, key): the same dataset gives
the same values. A tree that is the same in both years is measured from a new
sample of the same crown, so its values differ by a few centimetres, as two
scans of a real tree would. A cut tree (class absent) has nothing to measure.
"""

from __future__ import annotations

import math
import multiprocessing as mp
import os
from contextlib import contextmanager
from functools import cache

import numpy as np

from .. import PIPELINE_NAME, __version__
from ..lidar.cloud import TreeCloud
from ..lidar.crown import (
    METHOD,
    METHOD_VERSION,
    REPORT_FILE,
    STAGE,
    CrownParams,
    CrownReport,
    measure_tree,
)
from ..models import Producer
from .dataset import Dataset, Tree, Visit, load, rng, tree_class, tree_values
from .render import Capsule, Ellipsoid, _bilinear, fbm_tile, tree_shape

# Metric codes the demo writes (method lidar_crown; size_class is left out).
CODES = ("tree_height", "crown_diameter", "crown_volume", "crown_base_height")
# 1-sigma point noise of the (synthetic) registered cloud, metres.
POINT_SIGMA_M = 0.02
# Point density on the drawn surfaces (points per m2), and the bounds per tree.
DENSITY = 600.0
MIN_POINTS = 6000
MAX_POINTS = 40000
# Wood (trunk, branches): points per metre of length at least.
WOOD_PER_M = 80
# Share of the points kept on the side of the crown facing away from the aisle.
FAR_SIDE_KEEP = 0.3
# Points below this height are ground and grass (cloud.extract_trees drops them).
MIN_HEIGHT_M = 0.25
# Thread settings of the BLAS libraries numpy may use (measure_visit's workers).
BLAS_THREADS = ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS")


def params() -> CrownParams:
    return CrownParams()


def _surface_points(e: Ellipsoid, n: int, g: np.random.Generator) -> np.ndarray:
    """n points on the ellipsoid surface (a stretched unit sphere)."""
    u = g.normal(size=(n, 3))
    u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-12
    return e.c + u * e.r


def _ellipsoid_area(r: np.ndarray) -> float:
    """Surface area of an ellipsoid (Knud Thomsen's approximation)."""
    a, b, c = (float(x) for x in r)
    p = 1.6075
    return 4 * math.pi * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p)


def _capsule_points(cp: Capsule, n: int, g: np.random.Generator) -> np.ndarray:
    axis = cp.b - cp.a
    length = float(np.linalg.norm(axis))
    if length < 1e-6:
        return np.zeros((0, 3))
    w = axis / length
    helper = np.array([1.0, 0, 0]) if abs(w[0]) < 0.9 else np.array([0, 1.0, 0])
    e1 = np.cross(w, helper)
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(w, e1)
    t = g.uniform(0, 1, n)[:, None]
    phi = g.uniform(0, 2 * math.pi, n)[:, None]
    return cp.a + t * axis + cp.r * (np.cos(phi) * e1 + np.sin(phi) * e2)


@cache
def _leaf_tiles() -> tuple[np.ndarray, np.ndarray]:
    # The renderer's leaf noise (render.make_scene): same keys, same tiles.
    return fbm_tile("leaf", 256, 4, 16), fbm_tile("leaf-fine", 256, 2, 64)


def _leaves(e: Ellipsoid, pts: np.ndarray) -> np.ndarray:
    """Where the renderer draws leaves on the ellipsoid (not a hole), as a mask."""
    leaf, leaf_fine = _leaf_tiles()
    px, py, pz = (pts[:, i].astype(np.float32) for i in range(3))
    fine = _bilinear(leaf_fine, (px + 0.7 * py) * 40 + e.tex[0], pz * 40 + e.tex[1])
    clump = _bilinear(leaf, (px - 0.6 * py) * 6 + e.tex[1], pz * 6 + e.tex[0])
    return (0.6 * fine + 0.4 * clump) >= e.holes


def _aisle_side(visit: Visit, tree: Tree) -> np.ndarray:
    """Unit vector (parcel-local x, y) from the tree towards the aisle it is scanned from."""
    y = tree.xy[1]
    aisle = min(visit.aisles, key=lambda a: abs(a - y)) if visit.aisles else y - 1.0
    return np.array([0.0, 1.0 if aisle >= y else -1.0])


def tree_points(ds: Dataset, visit: Visit, tree: Tree) -> np.ndarray:
    """Synthetic LiDAR points of one tree in a scan, parcel-local metres (x, y, z)."""
    cls = tree_class(visit.key, tree.code)
    shape = tree_shape(tree, cls, tree_values(visit, tree, cls), visit.key)
    g = rng(f"lidar:{visit.key}:{tree.code}")
    foliage = [p for p in shape.prims if isinstance(p, Ellipsoid)]
    # Wood: trunk and branches; a sapling's planting stake is not the tree.
    wood = [p for p in shape.prims if isinstance(p, Capsule) and p.bark]
    areas = np.array([_ellipsoid_area(e.r) for e in foliage]) if foliage else np.zeros(0)
    wood_len = np.array([float(np.linalg.norm(c.b - c.a)) for c in wood])
    wood_area = 2 * math.pi * np.array([c.r for c in wood]) * wood_len
    total = float(areas.sum() + wood_area.sum())
    n_total = int(np.clip(total * DENSITY, MIN_POINTS, MAX_POINTS))
    scale = n_total / max(total, 1e-9)

    chunks = []
    for e, a in zip(foliage, areas, strict=True):
        n = max(20, int(a * scale))
        pts = _surface_points(e, n, g)
        if e.scale > 0:  # leaves: holes where the renderer shows through
            pts = pts[_leaves(e, pts)]
        chunks.append(pts)
    for c, length, a in zip(wood, wood_len, wood_area, strict=True):
        n = max(int(length * WOOD_PER_M), int(a * scale))
        chunks.append(_capsule_points(c, n, g))
    pts = np.vstack(chunks) if chunks else np.zeros((0, 3))

    # Hidden inside another foliage cluster: not seen.
    inside = np.zeros(len(pts), dtype=bool)
    for e in foliage:
        if e.scale <= 0:
            continue
        q = (pts - e.c) / e.r
        inside |= (q * q).sum(axis=1) < 0.97
    pts = pts[~inside]

    # Far side of the crown, away from the aisle: fewer points.
    side = _aisle_side(visit, tree)
    rel = pts[:, :2] - np.asarray(tree.xy)
    r = np.hypot(rel[:, 0], rel[:, 1]) + 1e-9
    facing = (rel @ side) / r
    keep = FAR_SIDE_KEEP + (1 - FAR_SIDE_KEEP) * np.clip(0.5 + 0.5 * facing, 0, 1)
    pts = pts[g.random(len(pts)) < keep]

    pts = pts + g.normal(0, POINT_SIGMA_M, pts.shape)
    return pts[pts[:, 2] >= MIN_HEIGHT_M]


def tree_cloud(ds: Dataset, visit: Visit, tree: Tree) -> TreeCloud:
    """The tree's points in the crown stage's frame (cloud.extract_trees)."""
    p = visit.parcel
    pts = tree_points(ds, visit, tree)
    dx, dy = pts[:, 0] - tree.xy[0], pts[:, 1] - tree.xy[1]
    e, n = p.to_en(dx, dy)  # linear: a local offset maps to an east/north offset
    local = np.column_stack([e, n, pts[:, 2]])
    neighbours = []
    for other in ds.trees[p.key]:
        if other is tree:
            continue
        ox, oy = other.xy[0] - tree.xy[0], other.xy[1] - tree.xy[1]
        if math.hypot(ox, oy) <= 2 * params().extract_radius_m:
            neighbours.append(tuple(float(v) for v in p.to_en(ox, oy)))
    ce, cn = p.to_en(*tree.xy)
    return TreeCloud(
        tree_id=tree.id,
        slot_code=tree.code,
        points=local,
        ground_z=0.0,
        center_en=(float(ce), float(cn)),
        neighbours_en=neighbours,
    )


def present_trees(ds: Dataset, visit: Visit) -> list[Tree]:
    """Trees with something to measure in the scan: all but the cut ones."""
    return [t for t in ds.trees[visit.parcel.key] if tree_class(visit.key, t.code) != "absent"]


def _measure(job: tuple[str, str]) -> tuple:
    visit_key, code = job
    ds = load()
    v = ds.visit(visit_key)
    return measure_tree(tree_cloud(ds, v, ds.tree(v.parcel.key, code)), POINT_SIGMA_M, params())


@contextmanager
def _single_threaded_blas():
    """Spawned workers start with one BLAS thread each (they read it at import):
    n workers with n threads each run slower than one process."""
    saved = {k: os.environ.get(k) for k in BLAS_THREADS}
    os.environ.update({k: "1" for k in BLAS_THREADS})
    try:
        yield
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def measure_visit(ds: Dataset, visit: Visit, workers: int = 1) -> CrownReport:
    """The crown stage's report of a scan (lidar/crown.py measure, tree by tree).

    With workers > 1 the trees are measured in spawned processes (as the renderer:
    a fork after OpenCV has started its thread pool can deadlock); the result does
    not depend on it.
    """
    jobs = [(visit.key, t.code) for t in present_trees(ds, visit)]
    if workers <= 1 or len(jobs) <= 2:
        results = [_measure(j) for j in jobs]
    else:
        with _single_threaded_blas(), mp.get_context("spawn").Pool(min(workers, len(jobs))) as pool:
            results = list(pool.imap(_measure, jobs, chunksize=4))
    p = params()
    return CrownReport(
        producer=Producer(
            pipeline=PIPELINE_NAME, version=__version__, params_hash=p.params_hash(), stage=STAGE
        ),
        method=METHOD,
        method_version=METHOD_VERSION,
        session_id=visit.id,
        parcel_id=visit.parcel.id,
        trees=[q for q, _row, _m in results],
        measurements=[m for _q, _row, ms in results for m in ms],
        point_sigma_m=POINT_SIGMA_M,
        details=[row for _q, row, _m in results],
    )


__all__ = ["CODES", "METHOD", "METHOD_VERSION", "REPORT_FILE", "measure_visit", "tree_cloud"]
