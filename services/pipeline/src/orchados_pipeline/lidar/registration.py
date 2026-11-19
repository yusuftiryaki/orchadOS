"""lidar register: raw kit MCAP + GNSS trajectory -> registered cloud and quality verdict.

Spec: docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md (§5, §5.11).

1. Segments of lidar/raw (rawlog.plan_segments); segments whose stamps disagree
   with the log times get a temporary restamped copy for the front end.
2. Front end (frontend.get_frontend): keyframes + body-frame scans per segment.
3. Trajectory: the position stage's trajectory.json given (--trajectory), else the
   newest one under the processed root (--processed-root, default
   <session>.processed/; a PPK one first), else the receiver's NAV-PVT in
   gnss/gnss.ubx; the cloud's origin is its first point.
4. Fusion (fusion.fuse): keyframe poses in ENU.
5. Cloud: every scan through its pose, self mask, 1 cm voxel dedupe, written
   segment by segment in chunks (cloud.ply + cloud.json).
6. Quality: GNSS residuals, LIO drift before fusion, coverage, trunk
   consistency on trunk candidates found in the cloud (no inventory needed);
   verdict accepted_auto / review / rejected_auto (decide()).

Each run gets a run_id and its own folder
<out_root>/<method>-<method_version>-<params_hash[:8]>-<run_id[:8]>/ (default
out_root <session>.processed/lidar/registration); the work happens in a hidden
folder renamed at the end, so a folder with registration.json is always complete.
The front end's scans (frontend/scans/, several GB per session) are work files:
removed when the run completes unless keep_frontend_scans; frontend.json and
keyframes.csv stay with the cloud and poses.csv.
"""

from __future__ import annotations

import json
import math
import shutil
import uuid
from collections.abc import Iterable, Iterator
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from .. import PIPELINE_NAME, __version__
from ..geo import LocalFrame
from ..models import PpkStatus, Producer, Trajectory, read_model, write_model
from ..position import trajectory_from_nav_pvt
from . import CLOUD_FILE, CLOUD_META_FILE
from .frontend import SCANS_DIR, Frontend, FrontendResult, frontend_dir, get_frontend, load_scan
from .fusion import FusionResult, fuse, quat_to_rot, rigid_drift, sample_gnss
from .models import (
    CloudMeta,
    RegistrationParams,
    RegistrationReport,
    RegistrationSegment,
)
from .rawlog import RAW_DIR, Segment, plan_segments, read_recording, write_restamped

REPORT_FILE = "registration.json"
PROCESS_FILE = "process.json"
POSES_FILE = "poses.csv"  # fused keyframe poses (staff only, like cloud.ply: H05)
REGISTRATION_DIR = Path("lidar") / "registration"
SCHEMA = "orchados.lidar_registration/1"
CHUNK_KEYFRAMES = 400
INFO_REASONS = ("imu_rate_low", "restamped")
_NS = 1_000_000_000


class RegistrationError(RuntimeError):
    pass


class NoLidarData(RegistrationError):
    """The session has no raw LiDAR log (no lidar/raw, or no cloud message in it)."""


def processed_dir(session_dir: Path) -> Path:
    session_dir = Path(session_dir)
    return session_dir.parent / f"{session_dir.name}.processed"


def default_out_root(session_dir: Path) -> Path:
    return processed_dir(session_dir) / REGISTRATION_DIR


# --- trajectory -------------------------------------------------------------------


def _shown(path: Path, session_dir: Path) -> str:
    """path relative to the session's parent folder when it is under it."""
    try:
        return str(Path(path).relative_to(Path(session_dir).parent))
    except ValueError:
        return str(path)


def find_trajectory(
    session_dir: Path,
    processed_root: Path | None = None,
    trajectory: Path | None = None,
) -> tuple[Trajectory | None, str | None]:
    """The position stage's trajectory, else the receiver's NAV-PVT.

    trajectory: that trajectory.json (RegistrationError if it cannot be read); else the
    newest */trajectory.json under processed_root (default <session>.processed), a PPK
    one first. A trajectory without points falls back to NAV-PVT."""
    session_dir = Path(session_dir)
    root = Path(processed_root) if processed_root is not None else processed_dir(session_dir)
    found: list[tuple[bool, float, Path, Trajectory]] = []
    if trajectory is not None:
        try:
            traj = read_model(Trajectory, Path(trajectory))
        except (OSError, ValueError) as exc:
            raise RegistrationError(f"trajectory {trajectory}: {exc}") from exc
        if traj.points:
            return traj, _shown(Path(trajectory), session_dir)
    else:
        for p in root.glob("*/trajectory.json"):
            try:
                traj = read_model(Trajectory, p)
            except (OSError, ValueError):
                continue
            if traj.points:
                found.append((traj.ppk_status == PpkStatus.ppk, p.stat().st_mtime, p, traj))
    if found:
        _, _, path, traj = max(found, key=lambda f: (f[0], f[1], str(f[2])))
        return traj, _shown(path, session_dir)
    ubx = session_dir / "gnss" / "gnss.ubx"
    if ubx.is_file():
        points = trajectory_from_nav_pvt(ubx.read_bytes())
        if points:
            producer = Producer(
                pipeline=PIPELINE_NAME, version=__version__, params_hash="", stage="position"
            )
            traj = Trajectory(
                producer=producer,
                source="nav_pvt",
                ppk_status=PpkStatus.no_ppk,
                points=points,
                notes=["receiver NAV-PVT read by lidar register (no position stage output)"],
            )
            return traj, "gnss/gnss.ubx"
    return None, None


# --- cloud ------------------------------------------------------------------------


def self_mask(xyz: np.ndarray, params: RegistrationParams) -> np.ndarray:
    """Boolean keep-mask in the LiDAR body frame: drops points closer than
    self_mask_radius_m and points in a cone around the lever arm (mast, antenna)
    closer than self_mask_cone_range_m."""
    r = np.linalg.norm(xyz, axis=1)
    keep = r >= params.self_mask_radius_m
    lever = np.asarray(params.lever_arm_m, dtype=np.float64)
    axis = lever / np.linalg.norm(lever) if np.linalg.norm(lever) > 0 else np.array([0, 0, 1.0])
    with np.errstate(invalid="ignore", divide="ignore"):
        cosang = (xyz @ axis) / r
    in_cone = (cosang > math.cos(math.radians(params.self_mask_cone_deg))) & (
        r < params.self_mask_cone_range_m
    )
    return keep & ~in_cone


def _voxel_keys(points: np.ndarray, voxel: float) -> np.ndarray:
    k = np.floor(points / voxel).astype(np.int64) + (1 << 20)
    return (k[:, 0] << 42) | (k[:, 1] << 21) | k[:, 2]


def voxel_dedupe(points: np.ndarray, voxel: float) -> np.ndarray:
    """Indices of the first point in each occupied voxel (deterministic order)."""
    if len(points) == 0:
        return np.zeros(0, dtype=np.int64)
    _, first = np.unique(_voxel_keys(points, voxel), return_index=True)
    return np.sort(first)


class _PlyWriter:
    """cloud.ply written in chunks: the body goes to a side file, the header (with the
    final count) is written in front of it at the end."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.body = self.path.with_suffix(".ply.body")
        self.f = open(self.body, "wb")
        self.count = 0
        self.dtype = np.dtype([("x", "<f8"), ("y", "<f8"), ("z", "<f8"), ("intensity", "<f4")])

    def append(self, points: np.ndarray, intensity: np.ndarray) -> None:
        arr = np.empty(len(points), dtype=self.dtype)
        arr["x"], arr["y"], arr["z"] = points[:, 0], points[:, 1], points[:, 2]
        arr["intensity"] = intensity
        self.f.write(arr.tobytes())
        self.count += len(arr)

    def close(self) -> Path:
        self.f.close()
        header = (
            "ply\nformat binary_little_endian 1.0\n"
            f"element vertex {self.count}\n"
            "property double x\nproperty double y\nproperty double z\n"
            "property float intensity\nend_header\n"
        )
        with open(self.path, "wb") as out, open(self.body, "rb") as body:
            out.write(header.encode("ascii"))
            shutil.copyfileobj(body, out, 1 << 22)
        self.body.unlink()
        return self.path


_CELL_K = 1 << 32


def _cell_keys(xy: np.ndarray, cell: float) -> np.ndarray:
    c = np.floor(np.asarray(xy, dtype=np.float64).reshape(-1, 2) / cell).astype(np.int64)
    return (c[:, 0] + (1 << 31)) * _CELL_K + (c[:, 1] + (1 << 31))


def _cell_minima(keys: np.ndarray, z: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(unique keys, lowest z per key, inverse index of each value)."""
    uk, inv = np.unique(keys, return_inverse=True)
    mins = np.full(len(uk), np.inf)
    np.minimum.at(mins, inv, z)
    return uk, mins, inv


class _Thinned:
    """A thinned copy of the cloud for the trunk search: points near the ground at
    0.25 m, points up to 2.5 m above it at 5 cm, nothing higher (crowns)."""

    def __init__(self, cell_m: float):
        self.cell = cell_m
        self.ground: dict[int, float] = {}
        self.parts: list[np.ndarray] = []

    def add(self, pts: np.ndarray) -> None:
        if len(pts) == 0:
            return
        uk, mins, inv = _cell_minima(_cell_keys(pts[:, :2], self.cell), pts[:, 2])
        g_cells = np.empty(len(uk))
        for i, (k, z) in enumerate(zip(uk.tolist(), mins.tolist(), strict=True)):
            g = min(z, self.ground.get(k, math.inf))
            self.ground[k] = g
            g_cells[i] = g
        h = pts[:, 2] - g_cells[inv]
        low = pts[h < 0.3]
        mid = pts[(h >= 0.3) & (h <= 2.5)]
        self.parts.append(low[voxel_dedupe(low, 0.25)])
        self.parts.append(mid[voxel_dedupe(mid, 0.05)])

    def points(self) -> np.ndarray:
        if not self.parts:
            return np.zeros((0, 3))
        pts = np.concatenate(self.parts)
        return pts[voxel_dedupe(pts, 0.05)]


def enu_scans(
    keyframes, fusion: FusionResult, params: RegistrationParams
) -> Iterator[tuple[int, int, int, np.ndarray, np.ndarray]]:
    """(segment, index, gps_time_ns, xyz ENU, intensity) of every placed keyframe, masked."""
    for k in keyframes:
        pose = fusion.poses_enu.get((k.segment, k.index))
        if pose is None:
            continue
        xyz, inten = load_scan(k.scan)
        keep = self_mask(xyz.astype(np.float64), params)
        r = quat_to_rot(pose[1])
        world = xyz[keep].astype(np.float64) @ r.T + pose[0]
        yield k.segment, k.index, k.gps_time_ns, world, inten[keep]


def write_cloud(
    out_dir: Path, keyframes, fusion: FusionResult, params: RegistrationParams
) -> tuple[Path | None, int, np.ndarray]:
    """cloud.ply from the placed keyframes, chunk by chunk (voxel dedupe within a chunk).
    Returns (path or None if empty, point count, thinned points for the trunk search)."""
    writer = _PlyWriter(Path(out_dir) / CLOUD_FILE)
    thin = _Thinned(params.ground_cell_m)
    buf_p: list[np.ndarray] = []
    buf_i: list[np.ndarray] = []
    last_seg = None
    n_kf = 0

    def flush():
        if not buf_p:
            return
        pts, inten = np.concatenate(buf_p), np.concatenate(buf_i)
        keep = voxel_dedupe(pts, params.voxel_m)
        writer.append(pts[keep], inten[keep])
        thin.add(pts[keep])
        buf_p.clear()
        buf_i.clear()

    for seg, _idx, _t, world, inten in enu_scans(keyframes, fusion, params):
        if seg != last_seg or n_kf >= CHUNK_KEYFRAMES:
            flush()
            last_seg, n_kf = seg, 0
        buf_p.append(world)
        buf_i.append(inten)
        n_kf += 1
    flush()
    path = writer.close()
    if writer.count == 0:
        path.unlink()
        return None, 0, thin.points()
    return path, writer.count, thin.points()


# --- trunk consistency ------------------------------------------------------------


def ground_heights(points: np.ndarray, at_xy: np.ndarray, cell: float) -> np.ndarray:
    """Ground height at positions: the lowest point of the 3 x 3 cells around each
    (NaN where none of them holds a point)."""
    pts = np.asarray(points, dtype=np.float64).reshape(-1, 3)
    uk, mins, _ = _cell_minima(_cell_keys(pts[:, :2], cell), pts[:, 2])
    q = _cell_keys(at_xy, cell)
    out = np.full(len(q), np.inf)
    for da in (-1, 0, 1):
        for db in (-1, 0, 1):
            nb = q + da * _CELL_K + db
            i = np.clip(np.searchsorted(uk, nb), 0, len(uk) - 1)
            hit = uk[i] == nb
            out[hit] = np.minimum(out[hit], mins[i[hit]])
    out[~np.isfinite(out)] = np.nan
    return out


def trunk_candidates(points_xyz: np.ndarray, params: RegistrationParams) -> np.ndarray:
    """(K, 2) east/north of trunk candidates found in the cloud (§5.11).

    Points 0.5-1.5 m above the local ground are binned in 0.3 m cells; a cell is
    occupied when it holds enough points spanning at least half the band vertically.
    Connected occupied cells form a cluster; a cluster no wider than trunk_max_width_m
    with at least trunk_min_points points is a trunk candidate (vertical and thin); its
    position is a circle fitted to its points (their mean if the fit fails)."""
    pts = np.asarray(points_xyz, dtype=np.float64).reshape(-1, 3)
    if len(pts) == 0:
        return np.zeros((0, 2))
    gk = _cell_keys(pts[:, :2], params.ground_cell_m)
    uq, inv = np.unique(gk, return_inverse=True)
    centres_q = (
        np.column_stack([(uq // _CELL_K - (1 << 31)) + 0.5, (uq % _CELL_K - (1 << 31)) + 0.5])
        * params.ground_cell_m
    )
    g = ground_heights(pts, centres_q, params.ground_cell_m)[inv]
    h = pts[:, 2] - g
    lo, hi = params.trunk_band_m
    in_band = (h >= lo) & (h <= hi)
    band, hb = pts[in_band], h[in_band]
    if len(band) == 0:
        return np.zeros((0, 2))
    cell = params.trunk_cell_m
    keys = _cell_keys(band[:, :2], cell)
    order = np.argsort(keys, kind="stable")
    uk, start, counts = np.unique(keys[order], return_index=True, return_counts=True)
    hmin = np.minimum.reduceat(hb[order], start)
    hmax = np.maximum.reduceat(hb[order], start)
    min_cell = max(3, params.trunk_min_points // 3)
    occ_mask = (counts >= min_cell) & (hmax - hmin >= 0.5 * (hi - lo))
    members = {int(k): order[s0 : s0 + n] for k, s0, n in zip(uk, start, counts, strict=True)}
    occ = {int(k) for k in uk[occ_mask]}
    seen: set[int] = set()
    out = []
    max_cells = max(1, int(round(params.trunk_max_width_m / cell)))
    for c in sorted(occ):
        if c in seen:
            continue
        comp, stack = [], [c]
        seen.add(c)
        while stack:
            k = stack.pop()
            comp.append(k)
            for da in (-1, 0, 1):
                for db in (-1, 0, 1):
                    nb = k + da * _CELL_K + db
                    if nb in occ and nb not in seen:
                        seen.add(nb)
                        stack.append(nb)
        xs = [k // _CELL_K for k in comp]
        ys = [k % _CELL_K for k in comp]
        if max(xs) - min(xs) + 1 > max_cells or max(ys) - min(ys) + 1 > max_cells:
            continue
        idx = np.concatenate([members[k] for k in comp])
        if len(idx) < params.trunk_min_points:
            continue
        centre = fit_circle(band[idx, :2])
        out.append(centre[:2] if centre is not None else band[idx, :2].mean(0))
    return np.array(out, dtype=np.float64).reshape(-1, 2)


def fit_circle(xy: np.ndarray) -> np.ndarray | None:
    """(cx, cy, r) of the circle through 2D points (algebraic fit, then a few
    Gauss-Newton steps on the geometric distances); None if ill-posed."""
    xy = np.asarray(xy, dtype=np.float64)
    if len(xy) < 5:
        return None
    m = xy.mean(0)
    p = xy - m
    a = np.column_stack([2 * p, np.ones(len(p))])
    b = (p * p).sum(1)
    try:
        sol, *_ = np.linalg.lstsq(a, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy = sol[0], sol[1]
    r = math.sqrt(max(sol[2] + cx * cx + cy * cy, 0.0))
    for _ in range(10):
        d = p - np.array([cx, cy])
        dist = np.linalg.norm(d, axis=1)
        if np.any(dist < 1e-9):
            break
        jac = np.column_stack([-d[:, 0] / dist, -d[:, 1] / dist, -np.ones(len(d))])
        res = dist - r
        try:
            step, *_ = np.linalg.lstsq(jac, -res, rcond=None)
        except np.linalg.LinAlgError:
            break
        cx, cy, r = cx + step[0], cy + step[1], r + step[2]
        if np.abs(step).max() < 1e-6:
            break
    if not (0.02 <= r <= 0.6) or not np.isfinite([cx, cy, r]).all():
        return None
    return np.array([cx + m[0], cy + m[1], r])


def trunk_spread(
    scans_by_time: Iterable[tuple[int, np.ndarray]],
    sensor_track: np.ndarray,
    candidates: np.ndarray,
    params: RegistrationParams,
) -> tuple[float | None, int]:
    """p95 over trunks of the largest distance between the trunk centres seen in
    different passes, and the number of trunks seen in at least two passes.

    A pass of a trunk is a continuous stretch of the sensor track (gps_time_ns, e, n, u;
    breaks over 2 s end a pass) closer than trunk_pass_range_m. Each pass's centre is a
    circle fitted to that pass's points within trunk_radius_m of the candidate and
    0.5-1.5 m above the ground there. The ground is the low end of the points near the
    trunk in every scan, passes or not: a LiDAR at 1.2 m sees the ground only from
    about 11 m away (6 deg below its base plane)."""
    cand = np.asarray(candidates, dtype=np.float64).reshape(-1, 2)
    track = np.asarray(sensor_track, dtype=np.float64).reshape(-1, 4)
    if len(cand) == 0 or len(track) == 0:
        return None, 0
    track = track[np.argsort(track[:, 0], kind="stable")]
    t = track[:, 0].astype(np.int64)
    d = np.linalg.norm(track[:, None, 1:3] - cand[None], axis=2)  # (M, K)
    near = d < params.trunk_pass_range_m
    brk = np.r_[True, np.diff(t) > 2 * _NS]
    prev = np.vstack([np.zeros((1, len(cand)), bool), near[:-1]])
    start = near & (~prev | brk[:, None])
    pass_id = np.where(near, np.cumsum(start, axis=0) - 1, -1)  # (M, K)
    radius = params.trunk_radius_m
    cell = max(radius, 0.5)
    ccell = np.floor(cand / cell).astype(np.int64)
    keys = np.unique(
        np.concatenate(
            [
                (ccell[:, 0] + da) * 1_000_003 + (ccell[:, 1] + db)
                for da in (-1, 0, 1)
                for db in (-1, 0, 1)
            ]
        )
    )
    lows: dict[int, list[np.ndarray]] = {}
    acc: dict[tuple[int, int], list[np.ndarray]] = {}
    for tk, xyz in scans_by_time:
        if len(xyz) == 0:
            continue
        m = int(np.searchsorted(t, int(tk)))
        if m >= len(t) or t[m] != int(tk):
            m = min(max(m - 1, 0), len(t) - 1)
        pc = np.floor(xyz[:, :2] / cell).astype(np.int64)
        sel = np.isin(pc[:, 0] * 1_000_003 + pc[:, 1], keys)
        if not sel.any():
            continue
        pts = xyz[sel]
        dd = np.linalg.norm(pts[:, None, :2] - cand[None], axis=2)
        owner = dd.argmin(1)
        ok = dd[np.arange(len(pts)), owner] <= radius
        for k in np.unique(owner[ok]):
            mine = pts[ok & (owner == k)]
            lows.setdefault(int(k), []).append(np.sort(mine[:, 2])[:10])
            if pass_id[m, k] >= 0:
                acc.setdefault((int(k), int(pass_id[m, k])), []).append(mine)
    lo, hi = params.trunk_band_m
    by_cand: dict[int, list[np.ndarray]] = {}
    for (k, _p), v in sorted(acc.items()):
        by_cand.setdefault(k, []).append(np.concatenate(v))
    spreads = []
    for k, passes in by_cand.items():
        if len(passes) < 2:
            continue
        ground = float(np.percentile(np.concatenate(lows[k]), 5))
        centres = []
        for pts in passes:
            h = pts[:, 2] - ground
            band = pts[(h >= lo) & (h <= hi)]
            if len(band) < params.trunk_min_points:
                continue
            fit = fit_circle(band[:, :2])
            if fit is not None:
                centres.append(fit[:2])
        if len(centres) < 2:
            continue
        c = np.array(centres)
        spreads.append(float(np.linalg.norm(c[:, None] - c[None], axis=2).max()))
    if not spreads:
        return None, 0
    return float(np.percentile(spreads, 95)), len(spreads)


# --- verdict ----------------------------------------------------------------------


def decide(metrics: dict, ppk: bool, params: RegistrationParams) -> tuple[str, list[str]]:
    """Verdict and reason codes (spec §5.7, §5.11). Without PPK never accepted_auto; a
    clock not locked to PPS or a missing recording.json at most review."""
    t = params.thresholds
    reasons: list[str] = []

    def add(code: str) -> None:
        if code not in reasons:
            reasons.append(code)

    runs = int(metrics.get("segments_run") or 0)
    cov = metrics.get("lio_coverage")
    p95 = metrics.get("gnss_residual_p95_m")
    spread = metrics.get("trunk_spread_p95_m")
    trees = int(metrics.get("trees_checked") or 0)
    reject = False
    if runs == 0:
        add("no_segments")
        reject = True
    if cov is None or cov < t.reject_min_coverage:
        add("low_coverage")
        reject = True
    if p95 is None:
        add("no_gnss")
        reject = True
    elif ppk and p95 > t.reject_gnss_p95_m:
        add("gnss_residual_high")
        reject = True
    if spread is not None and spread > t.reject_trunk_spread_m:
        add("trunk_spread_high")
        reject = True
    if not ppk:
        add("no_ppk")
    if p95 is not None and p95 > t.accept_gnss_p95_m:
        add("gnss_residual_high")
    if spread is None or trees < t.accept_min_trees:
        add("few_trees_checked")
    if spread is not None and spread > t.accept_trunk_spread_m:
        add("trunk_spread_high")
    if cov is not None and cov < t.accept_min_coverage:
        add("low_coverage")
    if metrics.get("recording_json") is False:
        add("no_recording_json")
    elif metrics.get("clock_state") not in (None, "pps"):
        add("clock_unlocked")
    if metrics.get("imu_rate_low_segments"):
        add("imu_rate_low")
    if metrics.get("restamped_segments"):
        add("restamped")
    if reject:
        return "rejected_auto", reasons
    blocking = [r for r in reasons if r not in INFO_REASONS]
    return ("review" if blocking else "accepted_auto"), reasons


def _stats(values: list[float]) -> tuple[float | None, float | None, float | None]:
    if not values:
        return None, None, None
    v = np.asarray(values)
    return (
        round(float(np.sqrt((v * v).mean())), 4),
        round(float(np.percentile(v, 95)), 4),
        round(float(v.max()), 4),
    )


# --- run --------------------------------------------------------------------------


def _session_ids(session_dir: Path, recording: dict | None) -> tuple[str, str, str | None]:
    try:
        info = json.loads((Path(session_dir) / "session.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        info = {}
    rec = recording or {}
    sid = info.get("session_id") or rec.get("session_id")
    pid = info.get("parcel_id") or rec.get("parcel_id")
    if not sid or not pid:
        raise RegistrationError(f"{session_dir}: no session_id / parcel_id (session.json)")
    return sid, pid, info.get("calibration_id")


def _rel_bags(seg: Segment, raw: Path) -> list[str]:
    out = []
    for b in seg.bag_dirs:
        try:
            out.append(Path(b).relative_to(raw).as_posix())
        except ValueError:
            out.append(Path(b).name)
    return out


def run(
    session_dir: Path,
    out_root: Path | None = None,
    params: RegistrationParams | None = None,
    frontend: Frontend | None = None,
    *,
    keep_frontend_scans: bool = False,
    trajectory: Path | None = None,
    processed_root: Path | None = None,
) -> tuple[Path, RegistrationReport]:
    """Register the session's raw LiDAR log. Returns the run folder and its report.
    The front end's scans are removed at the end unless keep_frontend_scans.
    trajectory / processed_root: where the position stage's trajectory is
    (find_trajectory); processed_root also moves the default out_root to
    <processed_root>/lidar/registration.

    Raises NoLidarData when there is nothing to register, RegistrationError when the
    given trajectory cannot be read."""
    session_dir = Path(session_dir)
    params = params or RegistrationParams()
    frontend = frontend or get_frontend(params.frontend)
    if out_root is None:
        out_root = (
            Path(processed_root) / REGISTRATION_DIR
            if processed_root is not None
            else default_out_root(session_dir)
        )
    out_root = Path(out_root)
    raw = session_dir / RAW_DIR
    recording = read_recording(raw)
    segments = plan_segments(session_dir, params)
    if not segments:
        raise NoLidarData(f"{session_dir}: no LiDAR data in {RAW_DIR}")
    session_id, parcel_id, calibration_id = _session_ids(session_dir, recording)
    traj, traj_src = find_trajectory(session_dir, processed_root, trajectory)
    run_id = str(uuid.uuid4())
    params_hash = params.params_hash()
    work = out_root / f".work-{run_id}"
    work.mkdir(parents=True)
    notes: list[str] = []
    try:
        runnable = []
        for s in segments:
            if s.skip_reason is not None:
                continue
            if s.needs_restamp:
                path = write_restamped(s, work / "restamped" / f"seg{s.index}")
                s = replace(s, bag_dirs=[path.parent])
            runnable.append(s)
        if runnable:
            fe = frontend.run(session_dir, runnable, work)
        else:
            fe = FrontendResult(
                method=frontend.method,
                method_version=str(getattr(frontend, "method_version", "")),
                config_hash="",
                segments=[],
            )
        shutil.rmtree(work / "restamped", ignore_errors=True)

        ppk = traj is not None and traj.ppk_status == PpkStatus.ppk
        method = f"{fe.method}+gtsam_{'ppk' if ppk else 'navpvt'}"
        method_version = f"{__version__}+{fe.method_version[:12]}"
        fusion = FusionResult({}, [], 0)
        frame = None
        if traj is None:
            notes.append("no GNSS trajectory (no position stage output and no NAV-PVT)")
        elif fe.keyframes:
            first = min(traj.points, key=lambda p: p.gps_time_ns)
            frame = LocalFrame(first.lat, first.lon)
            fusion = fuse(fe.keyframes, traj, frame, params, first.height_m)

        cloud_path, n_points, thinned = (None, 0, np.zeros((0, 3)))
        if fusion.poses_enu:
            cloud_path, n_points, thinned = write_cloud(work, fe.keyframes, fusion, params)

        # Quality metrics.
        placed = [k for k in fe.keyframes if (k.segment, k.index) in fusion.poses_enu]
        fixed_only = ppk and any(q == "fix" for _, q, _ in fusion.residuals)
        res = [r for _, q, r in fusion.residuals if q == "fix" or not fixed_only]
        rms, p95, rmax = _stats(res)
        drift = None
        if traj is not None and frame is not None:
            first = min(traj.points, key=lambda p: p.gps_time_ns)
            samples = sample_gnss(
                [k.gps_time_ns for k in fe.keyframes], traj, frame, params, first.height_m
            )
            per_seg = rigid_drift(
                fe.keyframes, samples, params.lever_arm_m, {"fix"} if fixed_only else None
            )
            vals = [dev / length * 100 for dev, length in per_seg.values() if length >= 10.0]
            drift = round(max(vals), 4) if vals else None
        posed_ns = 0
        for seg in {k.segment for k in placed}:
            ts = [k.gps_time_ns for k in placed if k.segment == seg]
            posed_ns += max(ts) - min(ts)
        rec_start = (recording or {}).get("start_gps_ns")
        rec_stop = (recording or {}).get("stop_gps_ns")
        if rec_start and rec_stop and rec_stop > rec_start:
            span_ns = rec_stop - rec_start
        else:
            span_ns = max(s.end_gps_ns for s in segments) - min(s.start_gps_ns for s in segments)
        coverage = round(min(posed_ns / span_ns, 1.0), 4) if span_ns > 0 else 0.0
        if recording is not None:
            gaps_s = sum(float(g.get("duration_s") or 0.0) for g in recording.get("gaps") or [])
        else:
            gaps_s = 0.0
            ordered = sorted(segments, key=lambda s: s.start_gps_ns)
            for a, b in zip(ordered[:-1], ordered[1:], strict=True):
                gaps_s += max(0.0, (b.start_gps_ns - a.end_gps_ns) / 1e9)
        spread, trees_checked = None, 0
        if cloud_path is not None:
            cands = trunk_candidates(thinned, params)
            track = np.array(
                [[k.gps_time_ns, *fusion.poses_enu[(k.segment, k.index)][0]] for k in placed]
            )
            scans = ((t, w) for _s, _i, t, w, _x in enu_scans(placed, fusion, params))
            spread, trees_checked = trunk_spread(scans, track, cands, params)
            metrics_cands = len(cands)
        else:
            metrics_cands = 0
        fe_status = {s["index"]: s for s in fe.segments}
        seg_reports = []
        for s in segments:
            kf = sum(1 for k in fe.keyframes if k.segment == s.index)
            if s.skip_reason is not None:
                status, msg = "skipped", s.skip_reason
            elif s.index in fusion.dropped_segments:
                status, msg = "not_placed", "no GNSS to place the segment"
            elif fe_status.get(s.index, {}).get("status") == "ok" and kf:
                status, msg = "ok", ""
            else:
                status = "failed"
                msg = fe_status.get(s.index, {}).get("message") or "no keyframes"
            seg_reports.append(
                RegistrationSegment(
                    index=s.index,
                    bags=_rel_bags(s, raw),
                    start_gps_ns=s.start_gps_ns,
                    end_gps_ns=s.end_gps_ns,
                    duration_s=round(s.duration_s, 3),
                    imu_rate_hz=s.imu_rate_hz,
                    needs_restamp=s.needs_restamp,
                    restamped=s.needs_restamp and s.skip_reason is None,
                    stamp_offset_s=s.stamp_offset_s,
                    stamp_rate=s.stamp_rate,
                    skip_reason=s.skip_reason,
                    status=status,
                    keyframes=kf,
                    message=msg,
                )
            )
        metrics = {
            "gnss_residual_rms_m": rms,
            "gnss_residual_p95_m": p95,
            "gnss_residual_max_m": rmax,
            "gnss_residuals_fix_only": fixed_only,
            "lio_drift_m_per_100m": drift,
            "lio_coverage": coverage,
            "trunk_spread_p95_m": None if spread is None else round(spread, 4),
            "trees_checked": trees_checked,
            "trunk_candidates": metrics_cands,
            "gaps_s_total": round(gaps_s, 3),
            "segments_total": len(segments),
            "segments_run": sum(1 for r in seg_reports if r.status in ("ok", "not_placed")),
            "segments_placed": sum(1 for r in seg_reports if r.status == "ok"),
            "restamped_segments": sum(1 for r in seg_reports if r.restamped),
            "imu_rate_low_segments": sum(1 for s in segments if s.skip_reason == "imu_rate_low"),
            "keyframes": len(fe.keyframes),
            "keyframes_placed": len(placed),
            "gnss_factors": fusion.used_gnss,
            "frontend_jumps": fusion.between_outliers,
            "points": n_points,
            "clock_state": (recording or {}).get("clock_state_at_start"),
            "recording_json": recording is not None,
        }
        verdict, reasons = decide(metrics, ppk, params)
        report = RegistrationReport(
            producer=Producer(
                pipeline=PIPELINE_NAME,
                version=__version__,
                params_hash=params_hash,
                stage="lidar_register",
            ),
            run_id=run_id,
            created_utc=datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z"),
            session_id=session_id,
            parcel_id=parcel_id,
            method=method,
            method_version=method_version,
            params_hash=params_hash,
            ppk_status=traj.ppk_status.value if traj is not None else "none",
            frontend={
                "method": fe.method,
                "method_version": fe.method_version,
                "config_hash": fe.config_hash,
                "imu_rate_hz": fe.imu_rate_hz,
                "points_total": fe.points_total,
            },
            trajectory=traj_src,
            segments=seg_reports,
            metrics=metrics,
            verdict=verdict,
            reasons=reasons,
            thresholds=params.thresholds,
            notes=notes,
        )
        if cloud_path is not None:
            first = min(traj.points, key=lambda p: p.gps_time_ns)
            sigma = math.hypot(p95 if p95 is not None else 1.0, params.frontend_point_sigma_m)
            meta = CloudMeta(
                session_id=session_id,
                parcel_id=parcel_id,
                origin_lat=first.lat,
                origin_lon=first.lon,
                origin_height_m=first.height_m,
                gps_time_start_ns=min(k.gps_time_ns for k in placed),
                gps_time_end_ns=max(k.gps_time_ns for k in placed),
                registration_method=method,
                registration_version=method_version,
                point_sigma_m=round(sigma, 4),
                sensor=params.sensor,
                calibration_id=calibration_id,
                run_id=run_id,
            )
            (work / CLOUD_META_FILE).write_text(
                meta.model_dump_json(indent=2, by_alias=True) + "\n", encoding="utf-8"
            )
        if placed:
            write_poses(work / POSES_FILE, placed, fusion)
        (work / "params.json").write_text(params.model_dump_json(indent=2) + "\n", "utf-8")
        write_model(report, work / REPORT_FILE)
        if not keep_frontend_scans:
            shutil.rmtree(frontend_dir(work) / SCANS_DIR, ignore_errors=True)
        final = out_root / f"{method}-{method_version}-{params_hash[:8]}-{run_id[:8]}"
        work.rename(final)
    except BaseException:
        shutil.rmtree(work, ignore_errors=True)
        raise
    return final, report


def write_poses(path: Path, keyframes, fusion: FusionResult) -> Path:
    """segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw of the LiDAR body in the cloud frame."""
    lines = ["segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw"]
    for k in keyframes:
        t, q = fusion.poses_enu[(k.segment, k.index)]
        vals = ",".join(f"{v:.6f}" for v in t) + "," + ",".join(f"{v:.9f}" for v in q)
        lines.append(f"{k.segment},{k.index},{k.gps_time_ns},{vals}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def read_poses(path: Path) -> np.ndarray:
    """(N, 10) array of poses.csv (segment, index, gps_time_ns as floats)."""
    return np.loadtxt(path, delimiter=",", skiprows=1, ndmin=2)


def summary_line(report: RegistrationReport, folder: Path | None = None) -> str:
    m = report.metrics

    def fmt(v, unit=""):
        return "-" if v is None else f"{v:.3g}{unit}"

    reasons = f" ({', '.join(report.reasons)})" if report.reasons else ""
    placed = m.get("segments_placed", 0)
    parts = [
        f"registration: {report.verdict}{reasons}",
        f"{m.get('keyframes_placed', 0)} keyframes in {placed}/{m.get('segments_total', 0)} "
        f"segments, {m.get('points', 0)} points",
        f"coverage {fmt(m.get('lio_coverage'))}",
        f"GNSS p95 {fmt(m.get('gnss_residual_p95_m'), ' m')} ({report.ppk_status})",
        f"trunk spread p95 {fmt(m.get('trunk_spread_p95_m'), ' m')} over "
        f"{m.get('trees_checked', 0)} trees",
    ]
    if folder is not None:
        parts.append(str(folder))
    return "; ".join(parts)


# --- finding runs -----------------------------------------------------------------


def registration_runs(session_dir: Path, out_root: Path | None = None) -> list[tuple[Path, dict]]:
    """Complete run folders (registration.json present), oldest first."""
    root = Path(out_root) if out_root is not None else default_out_root(session_dir)
    runs = []
    if root.is_dir():
        for d in root.iterdir():
            rep = d / REPORT_FILE
            if d.name.startswith(".") or not rep.is_file():
                continue
            try:
                body = json.loads(rep.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if body.get("schema") == SCHEMA:
                runs.append((d, body))
    runs.sort(key=lambda r: (r[1].get("created_utc") or "", r[0].name))
    return runs


def latest_registration(
    session_dir: Path, out_root: Path | None = None, with_cloud: bool = True
) -> Path | None:
    """The newest run that was not rejected_auto (and has a cloud, by default)."""
    for d, body in reversed(registration_runs(session_dir, out_root)):
        if body.get("verdict") == "rejected_auto":
            continue
        if with_cloud and not ((d / CLOUD_FILE).is_file() and (d / CLOUD_META_FILE).is_file()):
            continue
        return d
    return None


def write_process_report(folder: Path, steps: dict) -> Path:
    path = Path(folder) / PROCESS_FILE
    body = {"steps": steps, "updated_utc": datetime.now(UTC).isoformat(timespec="seconds")}
    path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    return path


__all__ = [
    "NoLidarData",
    "RegistrationError",
    "decide",
    "find_trajectory",
    "latest_registration",
    "run",
    "self_mask",
    "summary_line",
    "trunk_candidates",
    "trunk_spread",
]
