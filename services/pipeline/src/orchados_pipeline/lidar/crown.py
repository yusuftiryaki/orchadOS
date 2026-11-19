"""Stage – lidar crown: tree height, crown diameter, crown volume, size class proposal.

Leafy-season measurements from the registered parcel cloud (docs/metodoloji.md
section 3, docs/veri-modeli.md "Metrik kaydı"). Method ``lidar_crown``,
versioned with METHOD_VERSION and the hash of CrownParams.

Per tree (TreeCloud from cloud.extract_trees: x east / y north of the inventory
trunk position, z height above the per-tree ground plane):

1. Cleaning. The lowest ``grass_layer_m`` above the ground plane (grass,
   weeds, ground noise; extract_trees already drops what is below 0.25 m) is
   ignored: a weed carpet would otherwise join the trunk and spread over the
   whole cell. The crown base is therefore never below it (pistachio skirts
   are pruned higher for harvest). The other points are binned in voxels
   (``voxel_m``); voxels with fewer than ``voxel_min_points`` points (single
   blades, stray returns) are dropped, the rest are joined with
   26-connectivity. The largest connected cluster that reaches the trunk
   region (horizontally within ``seed_radius_m`` of the inventory position,
   below ``seed_max_height_m``) is the tree; everything else (stray returns,
   fragments of a neighbour's crown that crossed the Voronoi split without
   touching this crown) is dropped. No cluster near the trunk -> no_points.

2. Robust support. All extents use the robust support function
   h(u) = k-th largest of u . p over the points, k = max(``tail_min_points``,
   ceil(``tail_fraction`` * N)); i.e. the (1 - tail_fraction) quantile of the
   projections. A handful of stray points does not move it; a full-coverage
   scan of a dense crown edge places it within a few centimetres of the edge.
   Above ``max_points`` a fixed-seed subsample is used (deterministic).

3. Tree height (``tree_height``): h(+z) over the whole cleaned tree.

4. Crown centre and crown base. The crown centre is the midpoint of the
   east-west and north-south calipers. The cleaned tree is cut in horizontal
   slices (``slice_m``); a slice's radius is the 90th percentile of the
   horizontal distance from the crown centre. Crown base = lower edge of the
   lowest slice that, together with the slice above it, is at least
   ``base_width_fraction`` of the widest slice (slices with fewer than
   ``slice_min_points`` points are ignored). The crown points are the points
   above the crown base.

5. Crown diameter (``crown_diameter``): mean caliper width of the crown points
   over ``diameter_directions`` horizontal directions evenly spread over 180
   degrees, width(u) = h(u) + h(-u). For a round crown it is the diameter of
   the horizontal projection; for an elliptic one, about the mean of the long
   and the short axis (as the field method: along and across the row). The
   narrowest and widest widths are kept in the detail row.

6. Crown volume (``crown_volume``): volume of the robust convex hull of the
   crown points, the intersection of the half spaces u . p <= h(u) over
   ``hull_directions`` near-uniform (Fibonacci) directions, integrated column
   by column on a horizontal grid. This is the classic "convex hull crown
   volume": it OVERESTIMATES the real foliage volume of irregular, open or
   one-sided crowns (concavities and gaps count as crown) and only matches an
   ellipsoid-like envelope. Treat it as an envelope volume, not leaf volume.

7. Size class proposal (``size_class``): crown diameter against the v0.1
   thresholds (sapling < 1.5 m, young 1.5-3 m, productive 3-6 m, old > 6 m).
   The trunk is not measured here; the crown wins anyway when trunk and crown
   disagree. confidence = probability that the true diameter (normal, mean D,
   sigma_D) lies inside the proposed class, capped at
   ``size_class_max_confidence`` because "old" also has non-geometric signs
   the cloud cannot see (the algorithm only proposes; the expert decides).
   Only for trees with status ok.

Uncertainties (1 sigma, in the metric's unit; they cover measurement noise and
coverage, not the model bias of the hull or of the crown definition):

- height: sqrt(2 sp^2 + tail^2): sp = CloudMeta.point_sigma_m (top point and
  ground plane), tail = half the change of h(+z) between tail fractions q/2
  and 2q (how sharply the top is defined).
- diameter: sqrt(2 sp^2 + tail^2 + (sd_dir / 2)^2 + (c (1 - coverage) D)^2):
  tail as above on the mean width, sd_dir the spread of the widths over the
  directions (an asymmetric crown has no single diameter; about 4 independent
  directions), c = ``coverage_sigma_fraction`` for missing azimuth sectors.
- volume: V sqrt((2 sigma_D / D)^2 + (sigma_Hc / Hc)^2), Hc = height - crown
  base, sigma_Hc = sqrt(sigma_height^2 + sp^2 + slice_m^2 / 12).

Quality (TreeQuality.status): no_points (nothing near the trunk), too_few_points
(cleaned tree, or its crown, below ``min_points``), one_sided (sector coverage
below ``min_sector_coverage``: height only, no diameter, volume or class), ok.
Sector coverage (see coverage()) is recomputed on the cleaned tree around the
trunk estimated from the points ``trunk_band_m`` above ground. The confidence of
the numeric measurements is the sector coverage, times the factors below.

Touching crowns: extract_trees splits touching crowns half way between the
inventory trunks. When h(u) towards a neighbour reaches the split line
(within ``touch_margin_m``), the crown is cut there: the diameter and volume are
lower bounds, their confidence and the class confidence are multiplied by
``touch_confidence_factor`` and a note names the neighbour's direction.

Season: crown measures need leaves. foliage_cover is the share of a
``cover_cell_m`` top-view grid inside a ring of the crown (``cover_ring``
times the crown radius around the crown centre) that holds crown
points; a leafy crown covers it, a bare branch frame does not. Trees below
``leafless_cover_max`` get a low_foliage note and lower confidences; if the
median over ok trees is below it the report carries a warning. No calendar
check: the cloud decides.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from .. import PIPELINE_NAME, __version__
from ..hashing import hash_object
from ..models import Model, Producer, write_model
from .cloud import TreeCloud, extract_trees, load_session_cloud, load_tree_positions
from .models import LidarMeasurement, LidarReport, TreeQuality

METHOD = "lidar_crown"
METHOD_VERSION = "0.2.0"  # 0.2.0: adds crown_base_height
STAGE = "lidar_crown"
REPORT_FILE = "crown.json"

SIZE_CLASSES = ("sapling", "young", "productive", "old")
LEAFLESS_WARNING = "leafless_cloud"

Status = Literal["ok", "too_few_points", "one_sided", "no_points"]


class CrownParams(BaseModel):
    """Parameters of the crown stage; their canonical hash is Producer.params_hash."""

    model_config = ConfigDict(extra="forbid")

    # Extraction (cloud.extract_trees).
    extract_radius_m: float = 5.0
    min_height_m: float = 0.25
    ground_cell_m: float = 0.5
    # Cleaning: voxel connectivity from the trunk region.
    voxel_m: float = 0.25
    voxel_min_points: int = 3
    seed_radius_m: float = 1.0
    seed_max_height_m: float = 1.5
    grass_layer_m: float = 0.4
    # Robust support: k = max(tail_min_points, ceil(tail_fraction * N)).
    tail_fraction: float = 0.0003
    tail_min_points: int = 8
    max_points: int = 30_000  # deterministic subsample for the support function
    # Trunk position estimate (for sector coverage): points in this band above ground.
    trunk_band_m: tuple[float, float] = (0.4, 0.8)
    # Crown base.
    slice_m: float = 0.1
    slice_min_points: int = 10
    base_width_fraction: float = 0.3
    # Diameter and volume.
    diameter_directions: int = 36
    hull_directions: int = 1000
    hull_grid_cells: int = 120
    # Quality.
    min_points: int = 300
    min_sector_coverage: float = 0.6
    sector_min_points: int = 20
    sector_min_share: float = 0.2
    coverage_inner_fraction: float = 0.3
    coverage_sigma_fraction: float = 0.25
    # Touching crowns.
    touch_margin_m: float = 0.15
    touch_confidence_factor: float = 0.6
    # Season.
    cover_cell_m: float = 0.1
    # Ring of the crown radius whose top view is checked (the trunk and the
    # scaffold bases fill the centre of a bare tree too).
    cover_ring: tuple[float, float] = (0.3, 0.8)
    leafless_cover_max: float = 0.7
    leafless_confidence_factor: float = 0.5
    # Size class (docs/metodoloji.md section 3, v0.1): crown diameter thresholds.
    size_thresholds_m: tuple[float, float, float] = (1.5, 3.0, 6.0)
    size_class_max_confidence: float = 0.9

    def params_hash(self) -> str:
        return hash_object(self.model_dump(mode="json"))

    @classmethod
    def load(cls, path: Path | None) -> CrownParams:
        if path is None:
            return cls()
        return cls.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))


class CrownTree(Model):
    """Detail row of one tree (all lengths metres, tree-local frame, rounded)."""

    tree_id: str
    slot_code: str | None = None
    status: Status
    n_points_raw: int
    n_points: int
    sector_coverage: float
    # Estimated trunk and crown centre, east/north of the inventory position.
    trunk_offset_en: tuple[float, float] | None = None
    crown_center_en: tuple[float, float] | None = None
    height_m: float | None = None
    height_sigma_m: float | None = None
    crown_base_m: float | None = None
    crown_diameter_m: float | None = None
    crown_diameter_sigma_m: float | None = None
    crown_width_min_m: float | None = None
    crown_width_max_m: float | None = None
    crown_volume_m3: float | None = None
    crown_volume_sigma_m3: float | None = None
    foliage_cover: float | None = None
    touches_neighbour: bool = False
    size_class: str | None = None
    size_class_confidence: float | None = None
    flags: list[str] = Field(default_factory=list)


class CrownReport(LidarReport):
    """<out>/crown.json."""

    schema_: Literal["orchados.lidar_crown/1"] = Field("orchados.lidar_crown/1", alias="schema")
    point_sigma_m: float
    warnings: list[str] = Field(default_factory=list)
    details: list[CrownTree] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


# --- geometry helpers ---------------------------------------------------------------


def fibonacci_directions(n: int) -> np.ndarray:
    """n near-uniform unit vectors; for even n none is exactly horizontal."""
    i = np.arange(n) + 0.5
    z = 1 - 2 * i / n
    r = np.sqrt(np.maximum(0.0, 1 - z * z))
    phi = i * math.pi * (3 - math.sqrt(5))
    return np.column_stack([r * np.cos(phi), r * np.sin(phi), z])


def horizontal_directions(n: int) -> np.ndarray:
    """n unit vectors spread over [0, 180) deg azimuth (from north, clockwise)."""
    th = np.arange(n) * math.pi / n
    return np.column_stack([np.sin(th), np.cos(th), np.zeros(n)])


def tail_k(n: int, p: CrownParams, fraction: float | None = None) -> int:
    q = p.tail_fraction if fraction is None else fraction
    return int(min(n, max(p.tail_min_points, math.ceil(q * n))))


def support(points: np.ndarray, dirs: np.ndarray, k: int) -> np.ndarray:
    """Robust support h(u): k-th largest of u . p, for each row u of dirs."""
    # Projections in float32 (sub-micrometre at tree scale) halve the partition time.
    pts = np.asarray(points, dtype=np.float32)
    d = np.asarray(dirs, dtype=np.float32)
    out = np.empty(len(dirs))
    for s in range(0, len(d), 64):
        proj = d[s : s + 64] @ pts.T
        out[s : s + 64] = np.partition(proj, len(pts) - k, axis=1)[:, len(pts) - k]
    return out


def subsample(points: np.ndarray, max_points: int) -> np.ndarray:
    """Deterministic subsample (fixed seed): same input, same subset."""
    if len(points) <= max_points:
        return points
    idx = np.sort(np.random.default_rng(0).choice(len(points), max_points, replace=False))
    return points[idx]


def hull_volume(
    dirs: np.ndarray, h: np.ndarray, bbox: tuple[float, float, float, float], grid_cells: int
) -> float:
    """Volume of {x : u . x <= h(u) for all u}, integrated over vertical columns.

    dirs must cover the sphere (with up- and down-pointing directions). bbox
    (x0, y0, x1, y1) must contain the body (the points' bounding box does).
    """
    up, down = dirs[:, 2] > 0, dirs[:, 2] < 0
    flat = ~(up | down)
    x0, y0, x1, y1 = bbox
    span = max(x1 - x0, y1 - y0)
    if not np.isfinite(span) or span <= 0:
        return 0.0
    cell = span / grid_cells
    xs = x0 + (np.arange(math.ceil((x1 - x0) / cell)) + 0.5) * cell
    ys = y0 + (np.arange(math.ceil((y1 - y0) / cell)) + 0.5) * cell
    gx, gy = np.meshgrid(xs, ys, indexing="ij")
    cols = np.column_stack([gx.ravel(), gy.ravel()])
    # u . (x, y, z) <= h  <=>  z <= (h - u_xy . xy) / u_z for u_z > 0 (>= for u_z < 0).
    d_up, d_dn, d_fl = dirs[up], dirs[down], dirs[flat]
    h_up, h_dn, h_fl = h[up], h[down], h[flat]
    total = 0.0
    for s in range(0, len(cols), 2048):
        c = cols[s : s + 2048]
        top = ((h_up[None, :] - c @ d_up[:, :2].T) / d_up[None, :, 2]).min(axis=1)
        bot = ((h_dn[None, :] - c @ d_dn[:, :2].T) / d_dn[None, :, 2]).max(axis=1)
        length = np.clip(top - bot, 0, None)
        if len(d_fl):
            length[((h_fl[None, :] - c @ d_fl[:, :2].T) < 0).any(axis=1)] = 0.0
        total += float(length.sum())
    return total * cell * cell


def voxel_components(points: np.ndarray, voxel_m: float) -> tuple[np.ndarray, np.ndarray]:
    """(voxel index per point, component label per voxel), 26-connectivity."""
    vox = np.floor(points / voxel_m).astype(np.int64)
    vox -= vox.min(axis=0)
    dims = vox.max(axis=0) + 3
    code = ((vox[:, 0] + 1) * dims[1] + (vox[:, 1] + 1)) * dims[2] + (vox[:, 2] + 1)
    uniq, inv = np.unique(code, return_inverse=True)
    m = len(uniq)
    labels = np.arange(m)
    offs = [
        (dx, dy, dz)
        for dx in (-1, 0, 1)
        for dy in (-1, 0, 1)
        for dz in (-1, 0, 1)
        if (dx, dy, dz) > (0, 0, 0)
    ]
    a_list, b_list = [], []
    for dx, dy, dz in offs:
        nb = uniq + (dx * dims[1] + dy) * dims[2] + dz
        pos = np.searchsorted(uniq, nb)
        pos_c = np.minimum(pos, m - 1)
        hit = uniq[pos_c] == nb
        a_list.append(np.nonzero(hit)[0])
        b_list.append(pos_c[hit])
    a = np.concatenate(a_list) if a_list else np.zeros(0, np.int64)
    b = np.concatenate(b_list) if b_list else np.zeros(0, np.int64)
    while len(a):
        lo = np.minimum(labels[a], labels[b])
        new = labels.copy()
        np.minimum.at(new, a, lo)
        np.minimum.at(new, b, lo)
        while True:
            jumped = new[new]
            if np.array_equal(jumped, new):
                break
            new = jumped
        if np.array_equal(new, labels):
            break
        labels = new
    return inv, labels


def clean_tree(points: np.ndarray, p: CrownParams) -> np.ndarray:
    """The connected cluster that holds the trunk; empty if none reaches the trunk region."""
    points = points[points[:, 2] >= p.grass_layer_m]
    if len(points) == 0:
        return points
    # Sparse voxels (single grass blades, stray returns) neither join nor bridge.
    vox = np.floor(points / p.voxel_m).astype(np.int64)
    _, vinv, vcount = np.unique(vox, axis=0, return_inverse=True, return_counts=True)
    points = points[vcount[vinv.ravel()] >= p.voxel_min_points]
    if len(points) == 0:
        return points
    inv, labels = voxel_components(points, p.voxel_m)
    lab = labels[inv]
    seed = (np.hypot(points[:, 0], points[:, 1]) <= p.seed_radius_m) & (
        points[:, 2] <= p.seed_max_height_m
    )
    if not seed.any():
        return points[:0]
    seed_labels = np.unique(lab[seed])
    sizes = np.bincount(lab, minlength=len(labels))[seed_labels]
    main = seed_labels[int(np.argmax(sizes))]
    return points[lab == main]


def trunk_position(points: np.ndarray, p: CrownParams) -> tuple[float, float]:
    lo, hi = p.trunk_band_m
    band = (
        (points[:, 2] >= lo)
        & (points[:, 2] <= hi)
        & (np.hypot(points[:, 0], points[:, 1]) <= p.seed_radius_m)
    )
    if band.sum() < 5:
        return 0.0, 0.0
    return float(np.median(points[band, 0])), float(np.median(points[band, 1]))


def coverage(points: np.ndarray, trunk: tuple[float, float], p: CrownParams) -> float:
    """Share of 8 azimuth sectors (45 deg) around the trunk holding crown points.

    The trunk and the crown centre are left out (points nearer than
    ``coverage_inner_fraction`` of the 90th percentile radius): seen from one
    side, a trunk still has points in every sector around its own median. A
    sector counts when it holds at least ``sector_min_points`` and at least
    ``sector_min_share`` of an even share (1/8) of the points, so the noisy edge
    of an occluded half does not count as seen.
    """
    rel = points[:, :2] - np.asarray(trunk)
    r = np.hypot(rel[:, 0], rel[:, 1])
    rel = rel[r >= p.coverage_inner_fraction * float(np.percentile(r, 90))]
    if len(rel) == 0:
        return 0.0
    az = np.mod(np.degrees(np.arctan2(rel[:, 0], rel[:, 1])), 360.0)
    counts = np.bincount(np.minimum((az / 45.0).astype(int), 7), minlength=8)
    need = max(p.sector_min_points, p.sector_min_share * len(rel) / 8)
    return float(np.count_nonzero(counts >= need) / 8)


def crown_base(points: np.ndarray, center: np.ndarray, top: float, p: CrownParams) -> float:
    z0 = float(points[:, 2].min())
    n_sl = max(1, math.ceil((top - z0) / p.slice_m))
    idx = np.clip(((points[:, 2] - z0) / p.slice_m).astype(int), 0, n_sl - 1)
    rad = np.hypot(points[:, 0] - center[0], points[:, 1] - center[1])
    r = np.full(n_sl, np.nan)
    order = np.argsort(idx, kind="stable")
    bounds = np.searchsorted(idx[order], np.arange(n_sl + 1))
    for i in range(n_sl):
        sl = rad[order[bounds[i] : bounds[i + 1]]]
        if len(sl) >= p.slice_min_points:
            r[i] = float(np.percentile(sl, 90))
    if np.all(np.isnan(r)):
        return z0
    wide = r >= p.base_width_fraction * np.nanmax(r)
    for i in range(n_sl):
        if wide[i] and (i + 1 >= n_sl or wide[i + 1]):
            return z0 + i * p.slice_m
    return z0


def foliage_cover(points: np.ndarray, center: np.ndarray, radius: float, p: CrownParams) -> float:
    r_lo, r_in = p.cover_ring[0] * radius, p.cover_ring[1] * radius
    if r_in <= 0:
        return 0.0
    n = max(1, math.ceil(r_in / p.cover_cell_m))
    ax = (np.arange(-n, n) + 0.5) * p.cover_cell_m
    gx, gy = np.meshgrid(ax, ax, indexing="ij")
    rr = np.hypot(gx, gy)
    inside = (rr <= r_in) & (rr >= r_lo)
    if not inside.any():
        return 0.0
    rel = points[:, :2] - center
    ij = np.floor(rel / p.cover_cell_m).astype(np.int64) + n
    ok = np.all((ij >= 0) & (ij < 2 * n), axis=1)
    occ = np.zeros((2 * n, 2 * n), dtype=bool)
    occ[ij[ok, 0], ij[ok, 1]] = True
    return float(occ[inside].mean())


def class_probabilities(d: float, sigma: float, p: CrownParams) -> tuple[str, float]:
    """(proposed class, probability the true diameter lies in it)."""
    edges = (-math.inf, *p.size_thresholds_m, math.inf)
    cls = int(np.searchsorted(np.asarray(p.size_thresholds_m), d, side="right"))
    s = max(sigma, 1e-6)

    def cdf(x: float) -> float:
        if math.isinf(x):
            return 0.0 if x < 0 else 1.0
        return 0.5 * (1 + math.erf((x - d) / (s * math.sqrt(2))))

    return SIZE_CLASSES[cls], cdf(edges[cls + 1]) - cdf(edges[cls])


def _r(x: float | None, nd: int = 3) -> float | None:
    return None if x is None else round(float(x), nd)


def _sigma(x: float) -> float:
    """An uncertainty as written: rounded, never zero (docs/veri-modeli.md)."""
    return max(round(float(x), 4), 1e-3)


def _compass(dx: float, dy: float) -> str:
    names = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    az = math.degrees(math.atan2(dx, dy)) % 360
    return names[int((az + 22.5) // 45) % 8]


# --- per tree -------------------------------------------------------------------------


def measure_tree(
    tc: TreeCloud, point_sigma_m: float, p: CrownParams
) -> tuple[TreeQuality, CrownTree, list[LidarMeasurement]]:
    sp = point_sigma_m
    notes: list[str] = []
    flags: list[str] = []
    pts = clean_tree(np.asarray(tc.points, dtype=np.float64).reshape(-1, 3), p)
    n = len(pts)
    row = CrownTree(
        tree_id=tc.tree_id,
        slot_code=tc.slot_code,
        status="no_points",
        n_points_raw=tc.n_points,
        n_points=n,
        sector_coverage=0.0,
    )

    def done(status: Status, meas: list[LidarMeasurement]):
        row.status = status
        row.flags = flags
        q = TreeQuality(
            tree_id=tc.tree_id,
            slot_code=tc.slot_code,
            n_points=n,
            sector_coverage=row.sector_coverage,
            status=status,
            notes=notes,
        )
        return q, row, meas

    if n == 0:
        if tc.n_points:
            notes.append("no points near the trunk position")
        return done("no_points", [])
    if n < p.min_points:
        notes.append(f"{n} points after cleaning (< {p.min_points})")
        return done("too_few_points", [])

    trunk = trunk_position(pts, p)
    row.trunk_offset_en = (_r(trunk[0]), _r(trunk[1]))
    cov = coverage(pts, trunk, p)
    row.sector_coverage = round(cov, 3)

    def m(metric: str, **kw) -> LidarMeasurement:
        return LidarMeasurement(
            tree_id=tc.tree_id,
            slot_code=tc.slot_code,
            metric=metric,
            method=METHOD,
            method_version=METHOD_VERSION,
            **kw,
        )

    # Height over the whole cleaned tree (z is exact, no subsample needed).
    z = pts[:, 2]
    zdir = np.array([[0.0, 0.0, 1.0]])
    k = tail_k(n, p)
    height = float(support(pts, zdir, k)[0])
    h_lo = float(support(pts, zdir, tail_k(n, p, 2 * p.tail_fraction))[0])
    h_hi = float(support(pts, zdir, tail_k(n, p, p.tail_fraction / 2))[0])
    sig_h = math.sqrt(2 * sp * sp + ((h_hi - h_lo) / 2) ** 2)
    row.height_m, row.height_sigma_m = _r(height), _sigma(sig_h)
    conf_cov = min(1.0, cov)
    height_m = m(
        "tree_height",
        value_numeric=_r(height),
        unit="m",
        uncertainty=_sigma(sig_h),
        confidence=_r(conf_cov),
    )

    if cov < p.min_sector_coverage:
        notes.append(
            f"one-sided scan: sector coverage {cov:.2f} < {p.min_sector_coverage}; height only"
        )
        return done("one_sided", [height_m])

    # Crown centre from the calipers of the whole tree, then the crown base.
    sub = subsample(pts, p.max_points)
    ks = tail_k(len(sub), p)
    axes = np.array([[1.0, 0, 0], [-1.0, 0, 0], [0, 1.0, 0], [0, -1.0, 0]])
    ha = support(sub, axes, ks)
    center = np.array([(ha[0] - ha[1]) / 2, (ha[2] - ha[3]) / 2])
    base = crown_base(pts, center, height, p)
    crown = pts[z >= base]
    if len(crown) < p.min_points:
        notes.append(f"{len(crown)} crown points above the crown base (< {p.min_points})")
        return done("too_few_points", [height_m])
    csub = subsample(crown, p.max_points)
    nc = len(csub)
    row.crown_base_m = _r(base)

    # Diameter: mean caliper width over horizontal directions.
    hd = horizontal_directions(p.diameter_directions)
    both = np.vstack([hd, -hd])
    w = support(csub, both, tail_k(nc, p))
    widths = w[: len(hd)] + w[len(hd) :]
    w_lo = support(csub, both, tail_k(nc, p, 2 * p.tail_fraction))
    w_hi = support(csub, both, tail_k(nc, p, p.tail_fraction / 2))
    diam = float(widths.mean())
    tail_d = float(
        ((w_hi[: len(hd)] + w_hi[len(hd) :]).mean() - (w_lo[: len(hd)] + w_lo[len(hd) :]).mean())
        / 2
    )
    sd_dir = float(widths.std())
    sig_d = math.sqrt(
        2 * sp * sp
        + tail_d**2
        + (sd_dir / 2) ** 2
        + (p.coverage_sigma_fraction * (1 - cov) * diam) ** 2
    )
    row.crown_center_en = (_r(center[0]), _r(center[1]))
    row.crown_diameter_m, row.crown_diameter_sigma_m = _r(diam), _sigma(sig_d)
    row.crown_width_min_m, row.crown_width_max_m = _r(widths.min()), _r(widths.max())

    # Volume: robust convex hull of the crown points.
    dirs = fibonacci_directions(p.hull_directions)
    hv = support(csub, dirs, tail_k(nc, p))
    bbox = (*csub[:, :2].min(axis=0), *csub[:, :2].max(axis=0))
    vol = hull_volume(dirs, hv, bbox, p.hull_grid_cells)
    hc = max(height - base, p.slice_m)
    sig_hc = math.sqrt(sig_h**2 + sp**2 + p.slice_m**2 / 12)
    sig_v = vol * math.sqrt((2 * sig_d / max(diam, 1e-6)) ** 2 + (sig_hc / hc) ** 2)
    row.crown_volume_m3, row.crown_volume_sigma_m3 = _r(vol), _sigma(sig_v)

    # Touching neighbours: does the crown reach the Voronoi split line?
    factor = 1.0
    touching = []
    for ne, nn in tc.neighbours_en:
        dist = math.hypot(ne, nn)
        if dist == 0 or dist / 2 > p.extract_radius_m:
            continue
        u = np.array([[ne / dist, nn / dist, 0.0]])
        reach = float(support(csub, u, tail_k(nc, p))[0])
        if reach >= dist / 2 - p.touch_margin_m:
            touching.append(_compass(ne, nn))
    if touching:
        row.touches_neighbour = True
        flags.append("touches_neighbour")
        factor *= p.touch_confidence_factor
        notes.append(
            "crown touches the neighbour split ("
            + ",".join(sorted(set(touching)))
            + "): diameter and volume are lower bounds"
        )

    cover = foliage_cover(csub, center, diam / 2, p)
    row.foliage_cover = _r(cover)
    if cover < p.leafless_cover_max:
        flags.append("low_foliage")
        factor *= p.leafless_confidence_factor
        notes.append(f"little foliage (cover {cover:.2f}): crown measures need a leafy scan")

    dm_conf = _r(conf_cov * factor)
    meas = [
        height_m,
        m(
            "crown_diameter",
            value_numeric=_r(diam),
            unit="m",
            uncertainty=_sigma(sig_d),
            confidence=dm_conf,
        ),
        m(
            "crown_volume",
            value_numeric=_r(vol),
            unit="m3",
            uncertainty=_sigma(sig_v),
            confidence=dm_conf,
        ),
        # For drawing the crown on photos and in the tour (portal), not a card value.
        m(
            "crown_base_height",
            value_numeric=_r(base),
            unit="m",
            uncertainty=_sigma(math.sqrt(sp * sp + p.slice_m**2 / 12)),
            confidence=_r(conf_cov),
        ),
    ]
    cls, prob = class_probabilities(diam, sig_d, p)
    conf = min(p.size_class_max_confidence, prob) * factor
    row.size_class, row.size_class_confidence = cls, _r(conf)
    meas.append(m("size_class", value_category=cls, confidence=_r(conf)))
    return done("ok", meas)


# --- stage ------------------------------------------------------------------------------


def measure(
    trees: list[TreeCloud],
    point_sigma_m: float,
    p: CrownParams,
    *,
    session_id: str,
    parcel_id: str,
) -> CrownReport:
    qualities, details, meas = [], [], []
    for tc in trees:
        q, row, ms = measure_tree(tc, point_sigma_m, p)
        qualities.append(q)
        details.append(row)
        meas.extend(ms)
    warnings: list[str] = []
    covers = [d.foliage_cover for d in details if d.status == "ok" and d.foliage_cover is not None]
    if covers and float(np.median(covers)) < p.leafless_cover_max:
        warnings.append(
            f"{LEAFLESS_WARNING}: median foliage cover {float(np.median(covers)):.2f} "
            f"< {p.leafless_cover_max}; the cloud looks leafless, crown diameter, volume "
            "and size class need a leafy-season scan"
        )
    return CrownReport(
        producer=Producer(
            pipeline=PIPELINE_NAME, version=__version__, params_hash=p.params_hash(), stage=STAGE
        ),
        method=METHOD,
        method_version=METHOD_VERSION,
        session_id=session_id,
        parcel_id=parcel_id,
        trees=qualities,
        measurements=meas,
        point_sigma_m=point_sigma_m,
        warnings=warnings,
        details=details,
    )


def run(
    session_dir: Path,
    trees_path: Path,
    out_dir: Path,
    params_path: Path | None = None,
    cloud_dir: Path | None = None,
) -> CrownReport:
    p = CrownParams.load(params_path)
    cloud = load_session_cloud(Path(session_dir), cloud_dir)
    positions = load_tree_positions(Path(trees_path))
    tcs = extract_trees(
        cloud,
        positions,
        radius_m=p.extract_radius_m,
        min_height_m=p.min_height_m,
        ground_cell_m=p.ground_cell_m,
    )
    report = measure(
        tcs,
        cloud.meta.point_sigma_m,
        p,
        session_id=cloud.meta.session_id,
        parcel_id=cloud.meta.parcel_id,
    )
    write_model(report, Path(out_dir) / REPORT_FILE)
    return report


def summary_line(report: CrownReport) -> str:
    counts: dict[str, int] = {}
    for t in report.trees:
        counts[t.status] = counts.get(t.status, 0) + 1
    classes: dict[str, int] = {}
    for d in report.details:
        if d.size_class:
            classes[d.size_class] = classes.get(d.size_class, 0) + 1
    parts = [f"crown: {len(report.trees)} trees"]
    parts.append(", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if classes:
        parts.append(
            "classes " + ", ".join(f"{c} {classes[c]}" for c in SIZE_CLASSES if c in classes)
        )
    if report.warnings:
        parts.append("WARNING " + LEAFLESS_WARNING)
    return "; ".join(parts)
