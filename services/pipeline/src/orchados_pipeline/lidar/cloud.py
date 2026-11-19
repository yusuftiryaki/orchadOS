"""Registered point cloud I/O and per-tree extraction.

PLY subset read and written here: binary_little_endian 1.0, one ``vertex``
element with float32/float64 properties x, y, z and optionally intensity
(float32 or uchar). Enough for what the registration writes; other files are
rejected with a clear error rather than misread.
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..geo import LocalFrame
from . import CLOUD_FILE, CLOUD_META_FILE, LIDAR_DIR
from .models import CloudMeta

_PLY_TYPES = {
    "float": "<f4",
    "float32": "<f4",
    "double": "<f8",
    "float64": "<f8",
    "uchar": "u1",
    "uint8": "u1",
    "ushort": "<u2",
    "uint16": "<u2",
}


class CloudError(ValueError):
    pass


def read_ply(path: Path) -> tuple[np.ndarray, np.ndarray | None]:
    """Return (points (N, 3) float64, intensity (N,) float32 or None)."""
    with open(path, "rb") as f:
        if f.readline().strip() != b"ply":
            raise CloudError(f"{path}: not a PLY file")
        fmt = None
        count = None
        props: list[tuple[str, str]] = []
        in_vertex = False
        while True:
            line = f.readline()
            if not line:
                raise CloudError(f"{path}: header has no end_header")
            words = line.decode("ascii", "replace").split()
            if not words or words[0] == "comment" or words[0] == "obj_info":
                continue
            if words[0] == "format":
                fmt = words[1]
            elif words[0] == "element":
                if count is not None and in_vertex:
                    raise CloudError(f"{path}: only a single vertex element is supported")
                in_vertex = words[1] == "vertex"
                if not in_vertex:
                    raise CloudError(f"{path}: unsupported element {words[1]!r}")
                count = int(words[2])
            elif words[0] == "property":
                if words[1] == "list":
                    raise CloudError(f"{path}: list properties are not supported")
                if words[1] not in _PLY_TYPES:
                    raise CloudError(f"{path}: unsupported property type {words[1]!r}")
                props.append((words[2], _PLY_TYPES[words[1]]))
            elif words[0] == "end_header":
                break
        if fmt != "binary_little_endian":
            raise CloudError(f"{path}: format {fmt!r}, expected binary_little_endian")
        names = [n for n, _ in props]
        for axis in ("x", "y", "z"):
            if axis not in names:
                raise CloudError(f"{path}: vertex has no {axis!r} property")
        dtype = np.dtype(props)
        data = np.frombuffer(f.read(dtype.itemsize * (count or 0)), dtype=dtype)
        if len(data) != (count or 0):
            raise CloudError(f"{path}: truncated, {len(data)} of {count} points")
    pts = np.column_stack([data["x"], data["y"], data["z"]]).astype(np.float64)
    inten = data["intensity"].astype(np.float32) if "intensity" in names else None
    return pts, inten


def ply_point_count(path: Path) -> int:
    """The vertex count of a PLY file's header (the body is not read)."""
    with open(path, "rb") as f:
        if f.readline().strip() != b"ply":
            raise CloudError(f"{path}: not a PLY file")
        for line in f:
            words = line.decode("ascii", "replace").split()
            if words[:2] == ["element", "vertex"]:
                return int(words[2])
            if words[:1] == ["end_header"]:
                break
    raise CloudError(f"{path}: no vertex element")


def write_ply(path: Path, points: np.ndarray, intensity: np.ndarray | None = None) -> Path:
    """Write float64 x, y, z (+ float32 intensity). Deterministic bytes for equal input."""
    pts = np.asarray(points, dtype=np.float64).reshape(-1, 3)
    fields = [("x", "<f8"), ("y", "<f8"), ("z", "<f8")]
    if intensity is not None:
        fields.append(("intensity", "<f4"))
    arr = np.empty(len(pts), dtype=np.dtype(fields))
    arr["x"], arr["y"], arr["z"] = pts[:, 0], pts[:, 1], pts[:, 2]
    if intensity is not None:
        arr["intensity"] = np.asarray(intensity, dtype=np.float32)
    header = ["ply", "format binary_little_endian 1.0", f"element vertex {len(pts)}"]
    header += ["property double x", "property double y", "property double z"]
    if intensity is not None:
        header.append("property float intensity")
    header.append("end_header")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(("\n".join(header) + "\n").encode("ascii"))
        f.write(arr.tobytes())
    return path


@dataclass
class RegisteredCloud:
    points: np.ndarray  # (N, 3) local east/north/up metres
    meta: CloudMeta
    intensity: np.ndarray | None = None

    @property
    def frame(self) -> LocalFrame:
        return LocalFrame(self.meta.origin_lat, self.meta.origin_lon)


def session_cloud_paths(session_dir: Path) -> tuple[Path, Path]:
    d = Path(session_dir) / LIDAR_DIR
    return d / CLOUD_FILE, d / CLOUD_META_FILE


REGISTRATION_ROOT = Path(LIDAR_DIR) / "registration"  # under <session>.processed/


def _has_cloud(folder: Path) -> bool:
    return (folder / CLOUD_FILE).is_file() and (folder / CLOUD_META_FILE).is_file()


def resolve_cloud(
    session_dir: Path, cloud_dir: Path | None = None, log: Callable[[str], None] = print
) -> Path:
    """The folder holding the session's cloud.ply + cloud.json (docs/arayuzler.md):

    1. cloud_dir when given (--cloud);
    2. <session>/lidar/ (synthetic sessions, the old layout);
    3. the newest registration run under <session>.processed/lidar/registration/ whose
       verdict is not rejected_auto (registration.json, created_utc); log says which.
    """
    session_dir = Path(session_dir)
    if cloud_dir is not None:
        cloud_dir = Path(cloud_dir)
        if not _has_cloud(cloud_dir):
            raise CloudError(f"{cloud_dir}: no {CLOUD_FILE} + {CLOUD_META_FILE}")
        return cloud_dir
    own = session_dir / LIDAR_DIR
    if _has_cloud(own):
        return own
    root = session_dir.parent / f"{session_dir.name}.processed" / REGISTRATION_ROOT
    runs = []
    if root.is_dir():
        for d in root.iterdir():
            rep = d / "registration.json"
            if d.name.startswith(".") or not rep.is_file() or not _has_cloud(d):
                continue
            try:
                body = json.loads(rep.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if body.get("verdict") != "rejected_auto":
                runs.append((body.get("created_utc") or "", d.name, d))
    if runs:
        created, _name, chosen = max(runs)
        log(
            f"cloud: registration run {chosen.name} (created {created or '?'}; newest of "
            f"{len(runs)} not rejected; --cloud chooses another)"
        )
        return chosen
    raise CloudError(
        f"{session_dir}: no registered cloud ({LIDAR_DIR}/{CLOUD_FILE} + {CLOUD_META_FILE}, "
        f"or a registration under {root} that was not rejected)"
    )


def load_session_cloud(session_dir: Path, cloud_dir: Path | None = None) -> RegisteredCloud:
    """The session's registered cloud, found by resolve_cloud()."""
    folder = resolve_cloud(session_dir, cloud_dir)
    ply, meta_path = folder / CLOUD_FILE, folder / CLOUD_META_FILE
    meta = CloudMeta.model_validate(json.loads(meta_path.read_text(encoding="utf-8")))
    pts, inten = read_ply(ply)
    return RegisteredCloud(pts, meta, inten)


def write_session_cloud(
    session_dir: Path, points: np.ndarray, meta: CloudMeta, intensity: np.ndarray | None = None
) -> tuple[Path, Path]:
    ply, meta_path = session_cloud_paths(session_dir)
    write_ply(ply, points, intensity)
    meta_path.write_text(meta.model_dump_json(indent=2, by_alias=True) + "\n", encoding="utf-8")
    return ply, meta_path


@dataclass(frozen=True)
class TreePosition:
    tree_id: str
    slot_code: str | None
    lat: float
    lon: float


def load_tree_positions(path: Path) -> list[TreePosition]:
    """trees.json as the crops stage reads it (services/pipeline/README.md)."""
    body = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = body["trees"] if isinstance(body, dict) else body
    return [TreePosition(r["tree_id"], r.get("slot_code"), r["lat"], r["lon"]) for r in rows]


@dataclass
class TreeCloud:
    """Points of one tree in a tree-local frame.

    x east and y north of the inventory trunk position, z height above the local
    ground plane (fitted per tree, so a slope does not tilt the tree; metres).
    ground_z is the ground height under the trunk in the parcel frame. Points
    below min_height_m (ground, grass) are already removed.
    """

    tree_id: str
    slot_code: str | None
    points: np.ndarray
    ground_z: float
    center_en: tuple[float, float]
    sector_coverage: float = 0.0
    neighbours_en: list[tuple[float, float]] = field(default_factory=list)

    @property
    def n_points(self) -> int:
        return len(self.points)


def _cell_minima(points_en: np.ndarray, z: np.ndarray, cell_m: float):
    cells = np.floor(points_en / cell_m).astype(np.int64)
    key = cells[:, 0] * 1_000_003 + cells[:, 1]
    order = np.lexsort((z, key))
    first = np.ones(len(order), dtype=bool)
    first[1:] = key[order][1:] != key[order][:-1]
    idx = order[first]
    return points_en[idx], z[idx]


def ground_plane(points_en: np.ndarray, z: np.ndarray, cell_m: float = 0.5) -> np.ndarray:
    """Robust ground plane z = c0 + c1*e + c2*n around a trunk.

    Fitted to the lowest point of each grid cell, so crown points do not pull it
    up; two rounds drop cells more than 2.5 MAD above the fit (low branches,
    a cell with no ground return). Falls back to a flat median for few cells.
    """
    if len(z) == 0:
        return np.array([np.nan, 0.0, 0.0])
    xy, zm = _cell_minima(points_en, z, cell_m)
    keep = np.ones(len(zm), dtype=bool)
    coef = np.array([float(np.median(zm)), 0.0, 0.0])
    if len(zm) < 12:
        return coef
    for _ in range(3):
        A = np.column_stack([np.ones(keep.sum()), xy[keep]])
        coef, *_ = np.linalg.lstsq(A, zm[keep], rcond=None)
        res = zm - (coef[0] + xy @ coef[1:])
        mad = float(np.median(np.abs(res[keep] - np.median(res[keep])))) * 1.4826 + 1e-3
        keep = res < 2.5 * mad
    return coef


def tree_index(
    points: np.ndarray,
    frame: LocalFrame,
    trees: list[TreePosition],
    radius_m: float = 5.0,
    min_height_m: float = 0.25,
    ground_cell_m: float = 0.5,
    no_tree: int = -1,
) -> np.ndarray:
    """Index into ``trees`` of the tree each point belongs to, by the rule of extract_trees().

    A point belongs to its nearest trunk if it is within radius_m horizontally
    and at least min_height_m above that tree's ground plane; otherwise (ground,
    grass, the space between trees beyond radius_m) it gets ``no_tree``.
    """
    out = np.full(len(points), no_tree, dtype=np.int64)
    if not trees or len(points) == 0:
        return out
    centers = tree_centers(frame, trees)
    owner, dist = nearest_trunk(points[:, :2], centers)
    planes = tree_ground_planes(points, centers, radius_m, ground_cell_m)
    coef = np.array(planes)  # (T, 3)
    rel = points[:, :2] - centers[owner]
    ground = coef[owner, 0] + (rel * coef[owner, 1:]).sum(1)
    with np.errstate(invalid="ignore"):
        mine = (dist <= radius_m) & (points[:, 2] - ground >= min_height_m)
    out[mine] = owner[mine]
    return out


def ground_height(points_en: np.ndarray, z: np.ndarray, radius_m: float, cell_m: float) -> float:
    """Ground height at the origin of points_en (the trunk), from ground_plane()."""
    del radius_m
    return float(ground_plane(points_en, z, cell_m)[0])


def sector_coverage(xy: np.ndarray, sectors: int = 8, min_points: int = 20) -> float:
    if len(xy) == 0:
        return 0.0
    az = np.mod(np.degrees(np.arctan2(xy[:, 0], xy[:, 1])), 360.0)
    idx = np.minimum((az / (360.0 / sectors)).astype(int), sectors - 1)
    counts = np.bincount(idx, minlength=sectors)
    return float(np.count_nonzero(counts >= min_points) / sectors)


def tree_centers(frame: LocalFrame, trees: list[TreePosition]) -> np.ndarray:
    """(T, 2) east/north of the inventory trunk positions in the cloud frame."""
    e, n = frame.to_en(np.array([t.lat for t in trees]), np.array([t.lon for t in trees]))
    return np.column_stack([e, n]).reshape(-1, 2)


def nearest_trunk(xy: np.ndarray, centers: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Index of the nearest trunk per point (Voronoi split) and its horizontal distance.

    Chunks keep memory bounded on large clouds.
    """
    owner = np.empty(len(xy), dtype=np.int64)
    dist = np.empty(len(xy), dtype=np.float64)
    step = 16_384
    for s in range(0, len(xy), step):
        # Two 2D squares instead of a 3D difference array: the same sums, in cache.
        de = xy[s : s + step, 0, None] - centers[None, :, 0]
        dn = xy[s : s + step, 1, None] - centers[None, :, 1]
        d2 = de * de + dn * dn
        k = d2.argmin(1)
        owner[s : s + step] = k
        dist[s : s + step] = np.sqrt(np.take_along_axis(d2, k[:, None], 1)[:, 0])
    return owner, dist


def tree_ground_planes(
    points: np.ndarray, centers: np.ndarray, radius_m: float, ground_cell_m: float
) -> list[np.ndarray]:
    """ground_plane() around each trunk, from the points within radius_m (before the split).

    Coefficients are relative to the trunk: z = c0 + c1 * (e - e_t) + c2 * (n - n_t).
    """
    xy = points[:, :2]
    # Candidates by an east window first (sorted indices: the same points in the same
    # order as a mask over the whole cloud, so the same planes, much faster).
    order = np.argsort(xy[:, 0], kind="stable")
    xs = xy[order, 0]
    planes = []
    for c in centers:
        lo = np.searchsorted(xs, c[0] - radius_m, side="left")
        hi = np.searchsorted(xs, c[0] + radius_m, side="right")
        idx = np.sort(order[lo:hi])
        near = idx[((xy[idx] - c) ** 2).sum(1) <= radius_m**2]
        planes.append(ground_plane(xy[near] - c, points[near, 2], ground_cell_m))
    return planes


def extract_trees(
    cloud: RegisteredCloud,
    trees: list[TreePosition],
    radius_m: float = 5.0,
    min_height_m: float = 0.25,
    ground_cell_m: float = 0.5,
) -> list[TreeCloud]:
    """Cut one cloud per tree.

    Each point goes to its nearest trunk (Voronoi split) and is kept if it is
    within radius_m horizontally, so touching crowns are divided half way
    between trunks. Ground is estimated per tree from the points within
    radius_m of the trunk, before the split. Output order follows ``trees``.
    """
    if not trees:
        return []
    centers = tree_centers(cloud.frame, trees)
    pts = cloud.points
    owner, dist = nearest_trunk(pts[:, :2], centers)
    planes = tree_ground_planes(pts, centers, radius_m, ground_cell_m)
    out: list[TreeCloud] = []
    for i, t in enumerate(trees):
        c = centers[i]
        plane = planes[i]
        gz = float(plane[0])
        mine = (owner == i) & (dist <= radius_m)
        local = pts[mine] - np.array([c[0], c[1], 0.0])
        # Height above the (tilted) local ground, not above the trunk's ground height.
        local[:, 2] -= plane[0] + local[:, :2] @ plane[1:]
        local = local[local[:, 2] >= min_height_m] if np.isfinite(gz) else local[:0]
        others = [tuple(centers[j]) for j in range(len(trees)) if j != i]
        nb = [
            (float(o[0] - c[0]), float(o[1] - c[1]))
            for o in others
            if (o[0] - c[0]) ** 2 + (o[1] - c[1]) ** 2 <= (2 * radius_m) ** 2
        ]
        out.append(
            TreeCloud(
                tree_id=t.tree_id,
                slot_code=t.slot_code,
                points=local,
                ground_z=gz,
                center_en=(float(c[0]), float(c[1])),
                sector_coverage=sector_coverage(local[:, :2]),
                neighbours_en=nb,
            )
        )
    return out


# Thread settings of the BLAS libraries numpy may use (map_trees' workers).
_BLAS_THREADS = ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS")


def map_trees[T](fn: Callable[..., T], jobs: Sequence[tuple], workers: int = 1) -> list[T]:
    """fn(*job) for every job, in order. With workers > 1 in spawned processes (a fork
    after OpenCV or a BLAS has started its threads can deadlock), one BLAS thread
    each; trees are measured independently, so the result does not depend on it."""
    if workers <= 1 or len(jobs) <= 2:
        return [fn(*job) for job in jobs]
    saved = {k: os.environ.get(k) for k in _BLAS_THREADS}
    os.environ.update({k: "1" for k in _BLAS_THREADS})
    try:
        n = min(workers, len(jobs))
        with mp.get_context("spawn").Pool(n) as pool:
            return pool.starmap(fn, jobs, chunksize=1)
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
