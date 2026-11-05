"""Stage – lidar world: the coloured, thinned cloud of the portal's 3D world (İP17).

Writes ``world.owc`` in the format of docs/arayuzler.md, "3D dünya bulutu", and
a small sidecar ``world.json`` (header copy, file hash and size, producer) for
the upload step. Method ``lidar_world``, versioned with METHOD_VERSION and the
hash of WorldParams.

Steps:

1. Carrier. Points within ``carrier_radius_m`` (horizontal) of a panorama
   camera and below ``carrier_top_above_camera_m`` above it are the person or
   the rig carrying the sensor and are dropped; points within
   ``carrier_keep_ground_m`` of the local ground stay, so the ground under the
   camera has no hole.
2. Thinning. One point per ``voxel_m`` voxel (the centroid of its points), then
   at most ``max_points`` by a fixed-seed uniform subsample.
3. Trees. The tree of each point by the rule of cloud.extract_trees() (nearest
   inventory trunk within ``extract_radius_m``); points less than
   ``ground_height_m`` above that tree's ground plane are not a tree's (65535).
4. Colour. For each panorama a coarse equirectangular depth buffer is made from
   the points themselves (a point is splatted over the cells its footprint
   ``splat_voxels * voxel_m`` covers, through a pyramid of buffers). A point is
   seen by a panorama if its distance is within ``depth_tolerance`` (relative)
   plus ``depth_tolerance_m`` of the buffer, below ``max_color_distance_m`` and
   above ``min_elevation_deg`` (the rig and the stamp at the nadir). It takes
   the colour of the nearest panorama that sees it, sampled bilinearly from the
   full image (the preview if there is none). Points no panorama sees take the
   colour of the nearest coloured point (a grid search). Without panoramas the
   colour is a grey by height and ``colorized`` is false.
5. Order and packing. Points are shuffled with a fixed seed (any prefix is a
   uniform subsample), positions are quantised to uint16 over the bounding box.

Panorama convention (projection.py): the centre column looks along heading_deg,
azimuth grows to the right (clockwise from above), the top row is the zenith.
The camera stands at the panorama pose: east/north from LocalFrame(origin),
up = pose.height_m - origin_height_m (both ellipsoidal), unless
``camera_height_m`` is set: then local ground + camera_height_m.

H05: the file carries no time, no trajectory and no frame order. Panorama times
are read only to pick the images; nothing of them is written.
"""

from __future__ import annotations

import json
import math
import struct
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from pydantic import BaseModel, ConfigDict

from .. import PIPELINE_NAME, __version__
from ..geo import LocalFrame
from ..hashing import hash_object, sha256_bytes
from ..models import PanoramaRecord, PanoramaSet, Producer
from .cloud import (
    CloudError,
    TreePosition,
    ground_plane,
    load_session_cloud,
    load_tree_positions,
    tree_index,
)
from .models import CloudMeta

METHOD = "lidar_world"
METHOD_VERSION = "0.1.0"
STAGE = "lidar_world"
SCHEMA = "orchados.world_cloud/1"
MAGIC = b"OWC1"
WORLD_FILE = "world.owc"
WORLD_META_FILE = "world.json"
MEDIA_TYPE = "application/vnd.orchados.world-cloud"
NO_TREE = 65535
_Q = 65535


class WorldParams(BaseModel):
    """Parameters of the world stage; their canonical hash is the header's params_hash."""

    model_config = ConfigDict(extra="forbid")

    # 1. Carrier.
    carrier_radius_m: float = 1.5
    carrier_top_above_camera_m: float = 0.2
    carrier_keep_ground_m: float = 0.15
    ground_radius_m: float = 3.0  # local ground around a camera
    # 2. Thinning.
    voxel_m: float = 0.04
    max_points: int = 1_500_000
    seed: int = 17
    # 3. Trees (cloud.extract_trees).
    extract_radius_m: float = 5.0
    ground_height_m: float = 0.25
    ground_cell_m: float = 0.5
    # 4. Colour.
    camera_height_m: float | None = None
    depth_width: int = 1024  # depth buffer columns (power of two); rows = half
    depth_levels: int = 6
    splat_voxels: float = 2.0
    depth_tolerance: float = 0.03
    depth_tolerance_m: float = 0.05
    max_color_distance_m: float = 25.0
    min_color_distance_m: float = 0.3
    min_elevation_deg: float = -65.0
    # Silhouettes: a point with a much farther (or empty) buffer cell within
    # edge_cells of its own is not coloured from that panorama.
    edge_cells: int = 2
    edge_ratio: float = 0.25
    edge_margin_m: float = 0.5
    # Samples above the horizon that look like sky are not used (looks_like_sky).
    sky_mask: bool = True
    use_full_image: bool = True
    fill_cell_m: float = 0.25
    fill_levels: int = 8

    def params_hash(self) -> str:
        return hash_object(self.model_dump(mode="json"))

    @classmethod
    def load(cls, path: Path | None) -> WorldParams:
        if path is None:
            return cls()
        return cls.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))


@dataclass
class View:
    """One panorama: camera position in the cloud frame, heading, image loader (RGB uint8)."""

    position: np.ndarray  # (3,) east, north, up (metres, cloud frame)
    heading_deg: float
    load: Callable[[], np.ndarray]
    from_pose: bool = True  # up from the pose height (camera_height_m may replace it)


@dataclass
class World:
    header: dict[str, Any]
    position: np.ndarray  # (N, 3) uint16
    color: np.ndarray  # (N, 3) uint8
    tree: np.ndarray  # (N,) uint16
    stats: dict[str, Any] = field(default_factory=dict)


# --- steps ------------------------------------------------------------------------------


def remove_carrier(points: np.ndarray, cams: np.ndarray, p: WorldParams) -> np.ndarray:
    """Mask of the points to keep (step 1). cams: (K, 3) camera positions."""
    keep = np.ones(len(points), dtype=bool)
    if p.carrier_radius_m <= 0 or len(cams) == 0 or len(points) == 0:
        return keep
    order = np.argsort(points[:, 0], kind="stable")
    xs = points[order, 0]
    reach = max(p.carrier_radius_m, p.ground_radius_m)
    for cam in cams:
        lo, hi = np.searchsorted(xs, [cam[0] - reach, cam[0] + reach])
        idx = order[lo:hi]
        sub = points[idx]
        d2 = ((sub[:, :2] - cam[:2]) ** 2).sum(1)
        body = (d2 <= p.carrier_radius_m**2) & (sub[:, 2] < cam[2] + p.carrier_top_above_camera_m)
        if not body.any():
            continue
        if p.carrier_keep_ground_m > 0:
            near = d2 <= p.ground_radius_m**2
            coef = ground_plane(sub[near, :2] - cam[:2], sub[near, 2])
            if np.isfinite(coef[0]):
                g = coef[0] + (sub[:, :2] - cam[:2]) @ coef[1:]
                body &= sub[:, 2] >= g + p.carrier_keep_ground_m
        keep[idx[body]] = False
    return keep


def local_ground(points: np.ndarray, xy: np.ndarray, radius_m: float) -> float:
    """Ground height at xy from the points within radius_m (ground_plane)."""
    near = ((points[:, :2] - xy) ** 2).sum(1) <= radius_m**2
    return float(ground_plane(points[near, :2] - xy, points[near, 2])[0])


def voxel_centroids(points: np.ndarray, voxel_m: float) -> np.ndarray:
    """One point per voxel: the centroid of its points, in voxel key order (step 2)."""
    if len(points) == 0 or voxel_m <= 0:
        return points.copy()
    lo = points.min(axis=0)
    cell = np.floor((points - lo) / voxel_m).astype(np.int64)
    dims = cell.max(axis=0) + 1
    key = (cell[:, 0] * dims[1] + cell[:, 1]) * dims[2] + cell[:, 2]
    _, inv, counts = np.unique(key, return_inverse=True, return_counts=True)
    out = np.empty((len(counts), 3))
    for k in range(3):
        out[:, k] = np.bincount(inv, weights=points[:, k], minlength=len(counts)) / counts
    return out


def subsample(n: int, max_points: int, seed: int) -> np.ndarray:
    """Sorted indices of a fixed-seed uniform subsample of at most max_points."""
    if n <= max_points:
        return np.arange(n)
    rng = np.random.default_rng(seed)
    return np.sort(rng.choice(n, size=max_points, replace=False))


def _directions(points: np.ndarray, cam: np.ndarray, heading_deg: float):
    """Distance, azimuth relative to the heading (u in [0, 1)) and v (0 zenith, 1 nadir)."""
    d = points - cam
    horiz = np.hypot(d[:, 0], d[:, 1])
    dist = np.sqrt(horiz * horiz + d[:, 2] * d[:, 2])
    az = np.degrees(np.arctan2(d[:, 0], d[:, 1]))
    yaw = np.mod(az - heading_deg + 180.0, 360.0) - 180.0
    u = np.mod(yaw / 360.0 + 0.5, 1.0)
    el = np.arctan2(d[:, 2], horiz)
    v = np.clip(0.5 - el / math.pi, 0.0, 1.0)
    return dist, u, v, np.degrees(el)


def depth_buffer_lookup(
    dist: np.ndarray, u: np.ndarray, v: np.ndarray, footprint_m: float, p: WorldParams
) -> tuple[np.ndarray, np.ndarray]:
    """Buffer depth at each point's own cell, and the farthest depth around it (step 4).

    Each point is written at the pyramid level whose cell is about as wide as
    its angular footprint (footprint_m / dist), so a surface sampled at the voxel
    spacing occludes what is behind it at any distance; the full-resolution
    buffer is the minimum over the levels. The second array is the maximum of
    the buffer over the ``edge_cells`` neighbourhood (empty cells: infinity), to
    find points on a silhouette.
    """
    W = p.depth_width
    H = W // 2
    col = np.minimum((u * W).astype(np.int64), W - 1)
    row = np.minimum((v * H).astype(np.int64), H - 1)
    cell0 = 2 * math.pi / W
    with np.errstate(divide="ignore"):
        ratio = footprint_m / np.maximum(dist, 1e-6) / cell0
        level = np.clip(np.ceil(np.log2(np.maximum(ratio, 1e-12))), 0, p.depth_levels - 1)
    level = level.astype(np.int64)
    full = np.full((H, W), np.inf, dtype=np.float32)
    for lv in range(p.depth_levels):
        w, h = W >> lv, H >> lv
        sel = level == lv
        if w < 1 or h < 1 or not sel.any():
            continue
        buf = np.full(w * h, np.inf, dtype=np.float32)
        np.minimum.at(buf, (row[sel] >> lv) * w + (col[sel] >> lv), dist[sel].astype(np.float32))
        up = np.repeat(np.repeat(buf.reshape(h, w), 1 << lv, axis=0), 1 << lv, axis=1)
        np.minimum(full, up, out=full)
    depth = full[row, col].astype(np.float64)
    e = p.edge_cells
    if e <= 0:
        return depth, depth
    big = np.where(np.isfinite(full), full, np.float32(1e9))
    wrapped = np.concatenate([big[:, -e:], big, big[:, :e]], axis=1)
    k = np.ones((2 * e + 1, 2 * e + 1), np.uint8)
    far = cv2.dilate(wrapped, k, borderType=cv2.BORDER_REPLICATE)[:, e:-e]
    return depth, far[row, col].astype(np.float64)


def sample_bilinear(img: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """RGB at (u, v) of an equirectangular image, bilinear, wrapping horizontally."""
    h, w = img.shape[:2]
    x = u * w - 0.5
    y = np.clip(v * h - 0.5, 0, h - 1)
    x0 = np.floor(x)
    y0 = np.floor(y)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    x0 = x0.astype(np.int64) % w
    x1 = (x0 + 1) % w
    y0 = y0.astype(np.int64)
    y1 = np.minimum(y0 + 1, h - 1)
    im = img.astype(np.float32)
    top = im[y0, x0] * (1 - fx) + im[y0, x1] * fx
    bot = im[y1, x0] * (1 - fx) + im[y1, x1] * fx
    return np.clip(np.rint(top * (1 - fy) + bot * fy), 0, 255).astype(np.uint8)


def colorize(
    points: np.ndarray, views: list[View], p: WorldParams
) -> tuple[np.ndarray, np.ndarray, int]:
    """Colour from the nearest panorama that sees each point.

    Returns (colours (N, 3) uint8, seen mask, panoramas used).
    """
    n = len(points)
    color = np.zeros((n, 3), dtype=np.uint8)
    best = np.full(n, np.inf)
    # Without thinning (voxel_m 0) the input spacing is unknown: assume 2 cm.
    footprint = p.splat_voxels * max(p.voxel_m, 0.02)
    used = 0
    lo = points.min(axis=0) if n else np.zeros(3)
    hi = points.max(axis=0) if n else np.zeros(3)
    for view in views:
        cam = view.position
        # Nothing of the cloud within reach: skip without loading the image.
        gap = np.maximum(np.maximum(lo - cam, cam - hi), 0)
        if float(np.linalg.norm(gap)) > p.max_color_distance_m:
            continue
        d2 = ((points - cam) ** 2).sum(1)
        cand = np.flatnonzero((d2 <= p.max_color_distance_m**2) & (d2 >= p.min_color_distance_m**2))
        if len(cand) == 0:
            continue
        dist, u, v, el = _directions(points[cand], cam, view.heading_deg)
        depth, far = depth_buffer_lookup(dist, u, v, footprint, p)
        seen = (
            (dist <= depth * (1 + p.depth_tolerance) + p.depth_tolerance_m)
            # Not on a silhouette: there the pixel may already be the background.
            & (far <= dist * (1 + p.edge_ratio) + p.edge_margin_m)
            & (el >= p.min_elevation_deg)
            & (dist < best[cand])
        )
        if not seen.any():
            continue
        img = view.load()
        rgb = sample_bilinear(img, u[seen], v[seen])
        ok = ~looks_like_sky(rgb, el[seen]) if p.sky_mask else np.ones(len(rgb), dtype=bool)
        idx = cand[seen][ok]
        color[idx] = rgb[ok]
        best[idx] = dist[seen][ok]
        used += 1
    return color, np.isfinite(best), used


def looks_like_sky(rgb: np.ndarray, elevation_deg: np.ndarray) -> np.ndarray:
    """Pixels above the horizon that look like sky: blue, or bright grey (cloud, haze).

    A point is never sky; such a sample means the photo sees past the point (a
    leaf gap, a silhouette, a small registration error). A heuristic, not a
    segmentation: leaves, bark, soil and fruit are not blue and not bright grey.
    """
    c = rgb.astype(np.int16)
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    blue = (b > g + 12) & (b > r + 30)
    grey = (c.min(1) > 175) & (c.max(1) - c.min(1) < 40)
    return (elevation_deg > 0) & (blue | grey)


def fill_nearest(
    points: np.ndarray, color: np.ndarray, have: np.ndarray, p: WorldParams
) -> np.ndarray:
    """Points without a colour take the colour of the nearest coloured point.

    Grid search: at cell sizes fill_cell_m * 2^k the coloured points are binned
    (one representative per cell, its first point), and each uncoloured point
    takes the colour of the nearest representative among the 27 cells around its
    own (deterministic). Points still without a colour after fill_levels levels
    keep theirs.
    """
    color = color.copy()
    todo = np.flatnonzero(~have)
    src = np.flatnonzero(have)
    if len(todo) == 0 or len(src) == 0:
        return color
    lo = points.min(axis=0)
    sp = points[src]
    for lv in range(p.fill_levels):
        if len(todo) == 0:
            break
        cell = p.fill_cell_m * (2**lv)
        ci = np.floor((sp - lo) / cell).astype(np.int64) + 1
        dims = ci.max(axis=0) + 2
        qi = np.floor((points[todo] - lo) / cell).astype(np.int64) + 1
        dims = np.maximum(dims, qi.max(axis=0) + 2)

        def key(c: np.ndarray, dims: np.ndarray = dims) -> np.ndarray:
            return (c[:, 0] * dims[1] + c[:, 1]) * dims[2] + c[:, 2]

        # One representative per cell: its first coloured point (cells are small).
        ukey, rep = np.unique(key(ci), return_index=True)
        best_d = np.full(len(todo), np.inf)
        best_i = np.full(len(todo), -1, dtype=np.int64)
        q = points[todo]
        for off in np.array(np.meshgrid([-1, 0, 1], [-1, 0, 1], [-1, 0, 1])).T.reshape(-1, 3):
            k = key(qi + off)
            pos = np.minimum(np.searchsorted(ukey, k), len(ukey) - 1)
            hit = np.flatnonzero(ukey[pos] == k)
            j = rep[pos[hit]]
            d = ((sp[j] - q[hit]) ** 2).sum(1)
            better = d < best_d[hit]
            best_d[hit[better]] = d[better]
            best_i[hit[better]] = j[better]
        found = best_i >= 0
        color[todo[found]] = color[src[best_i[found]]]
        todo = todo[~found]
    return color


def grey_by_height(points: np.ndarray) -> np.ndarray:
    if len(points) == 0:
        return np.zeros((0, 3), dtype=np.uint8)
    z = points[:, 2]
    zlo, zhi = np.percentile(z, (1, 99))
    t = np.clip((z - zlo) / max(zhi - zlo, 1e-6), 0, 1)
    g = np.rint(70 + 150 * t).astype(np.uint8)
    return np.repeat(g[:, None], 3, axis=1)


def quantize(points: np.ndarray) -> tuple[np.ndarray, list[float], list[float]]:
    """uint16 positions over the bounding box: pos = min + q * scale."""
    if len(points) == 0:
        return np.zeros((0, 3), dtype=np.uint16), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]
    lo = points.min(axis=0)
    ext = points.max(axis=0) - lo
    scale = np.where(ext > 0, ext / _Q, 1e-6)
    lo_l = [float(x) for x in lo]
    sc_l = [float(x) for x in scale]
    q = np.rint((points - np.array(lo_l)) / np.array(sc_l))
    return np.clip(q, 0, _Q).astype(np.uint16), lo_l, sc_l


# --- the stage --------------------------------------------------------------------------


def build_world(
    points: np.ndarray,
    meta: CloudMeta,
    trees: list[TreePosition],
    views: list[View],
    p: WorldParams,
    log: Callable[[str], None] = lambda _m: None,
) -> World:
    """The world cloud of a registered cloud (all steps; deterministic)."""
    pts = np.asarray(points, dtype=np.float64).reshape(-1, 3)
    n_in = len(pts)
    cams = np.array([v.position for v in views], dtype=np.float64).reshape(-1, 3)
    if p.camera_height_m is not None and len(cams):
        for k in range(len(views)):
            g = local_ground(pts, cams[k, :2], p.ground_radius_m)
            if np.isfinite(g):
                cams[k, 2] = g + p.camera_height_m
    views = [View(cams[k].copy(), v.heading_deg, v.load, v.from_pose) for k, v in enumerate(views)]
    pts = pts[remove_carrier(pts, cams, p)]
    n_carrier = n_in - len(pts)
    pts = voxel_centroids(pts, p.voxel_m)
    n_voxel = len(pts)
    pts = pts[subsample(len(pts), p.max_points, p.seed)]
    frame = LocalFrame(meta.origin_lat, meta.origin_lon)
    tree = tree_index(
        pts,
        frame,
        trees,
        radius_m=p.extract_radius_m,
        min_height_m=p.ground_height_m,
        ground_cell_m=p.ground_cell_m,
        no_tree=NO_TREE,
    )
    if len(trees) >= NO_TREE:
        raise CloudError(f"{len(trees)} trees: the tree array holds at most {NO_TREE - 1}")
    seen_n = 0
    used = 0
    if views and len(pts):
        color, seen, used = colorize(pts, views, p)
        seen_n = int(seen.sum())
        colorized = seen_n > 0
        if colorized:
            color = fill_nearest(pts, color, seen, p)
        else:
            color = grey_by_height(pts)
    else:
        colorized = False
        color = grey_by_height(pts)
    # Shuffle: any prefix of the file is a uniform subsample, and the voxel order
    # (which follows the space, not the time) is gone too.
    perm = np.random.default_rng(p.seed + 1).permutation(len(pts))
    pts, color, tree = pts[perm], color[perm], tree[perm]
    q, qmin, qscale = quantize(pts)
    header = {
        "schema": SCHEMA,
        "session_id": meta.session_id,
        "parcel_id": meta.parcel_id,
        "origin_lat": meta.origin_lat,
        "origin_lon": meta.origin_lon,
        "origin_height_m": meta.origin_height_m,
        "point_count": len(pts),
        "quantization": {"min": qmin, "scale": qscale},
        "voxel_m": p.voxel_m,
        "arrays": {},
        "trees": [{"index": i, "tree_id": t.tree_id} for i, t in enumerate(trees)],
        "colorized": colorized,
        "method": METHOD,
        "method_version": METHOD_VERSION,
        "params_hash": p.params_hash(),
        "registration_method": meta.registration_method,
        "registration_version": meta.registration_version,
    }
    stats = {
        "input_points": n_in,
        "carrier_points": n_carrier,
        "voxel_points": n_voxel,
        "points": len(pts),
        "tree_points": int((tree != NO_TREE).sum()),
        "panoramas": len(views),
        "panoramas_used": used,
        "seen_points": seen_n,
    }
    log(
        f"world: {n_in} -> {len(pts)} points ({n_carrier} carrier), "
        f"{seen_n} seen by {used}/{len(views)} panoramas"
    )
    return World(header, q, color.astype(np.uint8), tree.astype(np.uint16), stats)


def _align4(n: int) -> int:
    return (n + 3) & ~3


def encode_world(world: World) -> bytes:
    """The bytes of world.owc (docs/arayuzler.md, "3D dünya bulutu")."""
    n = world.header["point_count"]
    header = dict(world.header)
    sizes = (("position", "uint16", 3, 6), ("color", "uint8", 3, 3), ("tree", "uint16", 1, 2))
    hlen = 0
    for _ in range(8):
        off = _align4(8 + hlen)
        arrays = {}
        for name, typ, comp, nbytes in sizes:
            arrays[name] = {"offset": off, "type": typ, "components": comp}
            off = _align4(off + n * nbytes)
        header["arrays"] = arrays
        text = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(text) == hlen:
            break
        hlen = len(text)
    else:  # pragma: no cover - the offsets settle after two rounds
        raise RuntimeError("world header length does not settle")
    out = bytearray(MAGIC + struct.pack("<I", hlen) + text)
    data = {
        "position": world.position.astype("<u2").tobytes(),
        "color": world.color.astype("u1").tobytes(),
        "tree": world.tree.astype("<u2").tobytes(),
    }
    for name, *_ in sizes:
        off = header["arrays"][name]["offset"]
        out += b"\0" * (off - len(out))
        out += data[name]
    world.header = header
    return bytes(out)


@dataclass
class WorldCloud:
    """A read world.owc: header and decoded arrays (positions in metres)."""

    header: dict[str, Any]
    position: np.ndarray  # (N, 3) float64, cloud frame
    color: np.ndarray  # (N, 3) uint8
    tree: np.ndarray  # (N,) uint16
    quantized: np.ndarray  # (N, 3) uint16


_DTYPES = {"uint16": "<u2", "uint8": "u1", "float32": "<f4"}


def read_world(source: Path | bytes) -> WorldCloud:
    """Read world.owc (a path or its bytes); unknown arrays are ignored."""
    data = source if isinstance(source, bytes) else Path(source).read_bytes()
    if data[:4] != MAGIC:
        raise CloudError("not a world cloud (magic)")
    (hlen,) = struct.unpack("<I", data[4:8])
    header = json.loads(data[8 : 8 + hlen].decode("utf-8"))
    if header.get("schema") != SCHEMA:
        raise CloudError(f"unknown world cloud schema {header.get('schema')!r}")
    n = int(header["point_count"])

    def array(name: str) -> np.ndarray:
        a = header["arrays"][name]
        if a["offset"] % 4:
            raise CloudError(f"array {name} is not 4-byte aligned")
        dt = np.dtype(_DTYPES[a["type"]])
        count = n * a["components"]
        buf = np.frombuffer(data, dtype=dt, count=count, offset=a["offset"])
        return buf.reshape(n, a["components"]) if a["components"] > 1 else buf

    q = array("position")
    qm = header["quantization"]
    pos = np.array(qm["min"]) + q.astype(np.float64) * np.array(qm["scale"])
    return WorldCloud(header, pos, array("color"), array("tree"), q)


# --- panoramas --------------------------------------------------------------------------


def _decode_rgb(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise CloudError(f"{path}: cannot read the panorama image")
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def panorama_records(source: Path) -> tuple[list[PanoramaRecord], Path]:
    """Panorama records and the folder their file paths are relative to.

    source: a panoramas.json (PanoramaSet), a run folder holding one, or a folder
    of pano-*.json sidecars (paths relative to its parent, the run folder).
    """
    source = Path(source)
    if source.is_dir() and (source / "panoramas.json").is_file():
        source = source / "panoramas.json"
    if source.is_file():
        body = json.loads(source.read_text(encoding="utf-8"))
        return PanoramaSet.model_validate(body).panoramas, source.parent
    if source.is_dir():
        recs = [
            PanoramaRecord.model_validate(json.loads(f.read_text(encoding="utf-8")))
            for f in sorted(source.glob("pano-*.json"))
        ]
        return recs, source.parent
    raise CloudError(f"{source}: no panoramas (panoramas.json, a run folder or pano-*.json)")


def views_from_records(
    records: list[PanoramaRecord], base: Path, meta: CloudMeta, p: WorldParams
) -> list[View]:
    """Views at the panorama poses; the full image if present (and wanted), else the preview."""
    frame = LocalFrame(meta.origin_lat, meta.origin_lon)
    views = []
    for r in records:
        if r.session_id != meta.session_id:
            raise CloudError(
                f"panorama {r.panorama_id} is of session {r.session_id}, the cloud of "
                f"{meta.session_id}"
            )
        refs = [r.image, r.preview] if p.use_full_image else [r.preview, r.image]
        path = next(
            (base / f.path for f in refs if (base / f.path).is_file()),
            None,
        )
        if path is None:
            raise CloudError(f"panorama {r.panorama_id}: image not found under {base}")
        e, n = frame.to_en(r.pose.lat, r.pose.lon)
        pos = np.array([float(e), float(n), r.pose.height_m - meta.origin_height_m])
        views.append(View(pos, r.pose.heading_deg, lambda path=path: _decode_rgb(path)))
    return views


def default_panoramas(session_dir: Path) -> Path | None:
    """The only run folder with panoramas next to the session, if there is exactly one."""
    session_dir = Path(session_dir)
    processed = session_dir.parent / f"{session_dir.name}.processed"
    runs = sorted(processed.glob("v*/panoramas.json")) if processed.is_dir() else []
    if len(runs) > 1:
        raise CloudError(
            f"{processed}: {len(runs)} runs with panoramas; choose one with --panoramas"
        )
    return runs[0] if runs else None


class WorldReport(BaseModel):
    """world.json: the header of world.owc, its hash and size, producer and counts."""

    model_config = ConfigDict(extra="forbid")

    file: str = WORLD_FILE
    media_type: str = MEDIA_TYPE
    sha256: str
    byte_size: int
    producer: Producer
    # 1-sigma point noise of the registration (cloud.json), metres: the asset
    # row's position uncertainty.
    origin_sigma_m: float
    header: dict[str, Any]
    stats: dict[str, Any]


def write_world(world: World, out_dir: Path, origin_sigma_m: float) -> WorldReport:
    data = encode_world(world)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / WORLD_FILE).write_bytes(data)
    report = WorldReport(
        sha256=sha256_bytes(data),
        byte_size=len(data),
        producer=Producer(
            pipeline=PIPELINE_NAME,
            version=__version__,
            params_hash=world.header["params_hash"],
            stage=STAGE,
        ),
        origin_sigma_m=origin_sigma_m,
        header=world.header,
        stats=world.stats,
    )
    (out_dir / WORLD_META_FILE).write_text(
        report.model_dump_json(indent=2) + "\n", encoding="utf-8"
    )
    return report


def run(
    session_dir: Path,
    trees_path: Path,
    out_dir: Path,
    params_path: Path | None = None,
    panoramas: Path | None = None,
    log: Callable[[str], None] = lambda _m: None,
) -> WorldReport:
    p = WorldParams.load(params_path)
    cloud = load_session_cloud(Path(session_dir))
    trees = load_tree_positions(Path(trees_path)) if Path(trees_path).is_file() else []
    source = Path(panoramas) if panoramas else default_panoramas(Path(session_dir))
    views: list[View] = []
    if source is not None:
        recs, base = panorama_records(source)
        views = views_from_records(recs, base, cloud.meta, p)
    world = build_world(cloud.points, cloud.meta, trees, views, p, log)
    return write_world(world, Path(out_dir), cloud.meta.point_sigma_m)


def summary_line(report: WorldReport) -> str:
    h, s = report.header, report.stats
    colour = (
        f"coloured from {s['panoramas_used']}/{s['panoramas']} panoramas "
        f"({s['seen_points']} points seen)"
        if h["colorized"]
        else "grey (no panoramas)"
    )
    return (
        f"world: {h['point_count']} points ({s['input_points']} in, {s['carrier_points']} "
        f"carrier), {s['tree_points']} on trees, {colour}; {WORLD_FILE} "
        f"{report.byte_size / 1e6:.1f} MB"
    )
