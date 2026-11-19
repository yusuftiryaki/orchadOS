"""Synthetic moving LiDAR scan: a raw kit session with known truth (lidar synth --moving).

A kit drives a lawn-mower path along the aisles of a small orchard (every row is
passed on both sides, half-circle turns at the row ends) and records what the
kit recorder writes (docs/arayuzler.md, "Kit kaydedicisi"):

- lidar/raw/bag/bag_0.mcap: /unilidar/cloud (PointCloud2 like the L2 driver:
  x, y, z, intensity float32, ring uint16, time float32 relative to the stamp;
  10 messages/s, points in the LiDAR frame at their own capture time, so the
  scan is motion-distorted as a real one), /unilidar/imu (Imu: specific force
  and angular rate from the path's derivatives, with noise), /orchados/gnss_ubx;
  bag.1/ after a simulated recorder restart; recording.json with the gaps;
- gnss/gnss.ubx: the receiver's own NAV-PVT (5 Hz, metre-level, slowly varying
  error) at the antenna (pose + lever arm); gnss/session.json;
- with ppk: the PPK trajectory the position stage would write, as
  <dest>.processed/synthetic-ppk/trajectory.json (fixed, about 1 cm);
- session.json, trees.json and truth.json (true poses, not part of any contract).

Scene: flat ground (z = 0), trunks as vertical cylinders a little off the
planting grid and crowns as ellipsoids whose bottom is above 1.5 m (the trunk
band of the registration's quality check stays clear). The LiDAR sits 1.2 m
above the ground (docs/tarama-kiti.md) and sees from 6 deg below its base plane
(negative angle mode): the ground only from about 11 m away. The kit's mast
(LiDAR to antenna) returns points close to the sensor, as the real one does.

Frames: ENU metres around (origin_lat, origin_lon, origin_height_m); the LiDAR
body frame is x forward, y left, z up. MCAP log times are UNIX ns (the Pi's
PPS-locked clock); header.stamp = log time - stamp_offset_s.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from mcap.writer import CompressionType, Writer

from .. import PIPELINE_NAME, __version__
from ..geo import LocalFrame
from ..gpstime import gps_ns_to_iso, utc_to_gps_ns
from ..models import (
    PpkStatus,
    Producer,
    SolutionQuality,
    Trajectory,
    TrajectoryPoint,
    write_model,
)
from ..ubx import build_frame, encode_nav_pvt
from . import ros2msg

SESSION_ID = "00000000-0000-4000-8000-0000000000c1"
PARCEL_ID = "00000000-0000-4000-8000-0000000000b1"
ORIGIN = (37.0662, 37.3833, 850.0)
START_UTC = datetime(2026, 10, 15, 8, 0, 0, tzinfo=UTC)
TOPICS = {"points": "/unilidar/cloud", "imu": "/unilidar/imu", "ubx": "/orchados/gnss_ubx"}
PPK_DIR = "synthetic-ppk"

SENSOR_HEIGHT_M = 1.2  # docs/tarama-kiti.md, Montaj ve yükseklikler
# LiDAR body -> antenna phase centre: antenna ~2.1 m, LiDAR ~1.2 m (docs/tarama-kiti.md).
LEVER_ARM_M = (0.0, 0.0, 0.9)
MSG_HZ = 10
TRUTH_HZ = 100
MAX_RANGE_M = 30.0
MIN_EL_DEG = -6.0
MAST_CONE_DEG = 4.0
RANGE_NOISE_M = 0.008
TREE_JITTER_M = 0.15
GRAVITY = 9.81
NAV_PVT_HZ = 5
_NS = 1_000_000_000


def unix_ns(gps_ns):
    """GPS ns -> UNIX ns (UTC) at the synthetic date (GPS - UTC = 18 s)."""
    return gps_ns - _GPS_MINUS_UNIX_NS


_GPS_MINUS_UNIX_NS = utc_to_gps_ns(START_UTC) - int(START_UTC.timestamp()) * _NS


@dataclass
class MovingConfig:
    rows: int = 3
    trees_per_row: int = 6
    row_spacing_m: float = 7.0
    tree_spacing_m: float = 6.0
    speed_mps: float = 1.5
    duration_s: float | None = None  # None: the whole path
    seed: int = 0
    gap: tuple[float, float] | None = None  # LiDAR silent in [a, b) s after the start
    second_bag_at_s: float | None = None  # recorder restart: later messages in bag.1/
    stamp_offset_s: float = 0.0  # log_time - header.stamp
    imu_hz: float = 250.0
    ppk: bool = True
    points_per_s: int = 64_000
    lever_arm_m: tuple[float, float, float] = LEVER_ARM_M  # recorded in truth.json


@dataclass
class MovingTruth:
    poses: np.ndarray  # (N, 8): gps_time_ns, x, y, z, qx, qy, qz, qw (ENU of the origin)
    origin_lat: float
    origin_lon: float
    origin_height_m: float
    lever_arm_m: list[float]
    trees: list[tuple[str, float, float]]  # (tree_id, east, north) trunk centres
    tree_spacing_m: float = 6.0
    extra: dict = field(default_factory=dict)

    def write(self, path: Path) -> Path:
        body = {
            "origin_lat": self.origin_lat,
            "origin_lon": self.origin_lon,
            "origin_height_m": self.origin_height_m,
            "lever_arm_m": list(self.lever_arm_m),
            "tree_spacing_m": self.tree_spacing_m,
            "trees": [[t, round(e, 6), round(n, 6)] for t, e, n in self.trees],
            "poses": [
                [int(r[0]), *(round(float(v), 7) for v in r[1:])] for r in self.poses.tolist()
            ],
            **self.extra,
        }
        path.write_text(json.dumps(body, separators=(",", ":")) + "\n", encoding="utf-8")
        return path

    @classmethod
    def load(cls, path: Path) -> MovingTruth:
        body = json.loads(Path(path).read_text(encoding="utf-8"))
        poses = np.array(body.pop("poses"), dtype=np.float64)
        # Keep the exact integer times: float64 holds GPS ns only to ~256 ns.
        return cls(
            poses=poses,
            origin_lat=body.pop("origin_lat"),
            origin_lon=body.pop("origin_lon"),
            origin_height_m=body.pop("origin_height_m"),
            lever_arm_m=body.pop("lever_arm_m"),
            trees=[(t, e, n) for t, e, n in body.pop("trees")],
            tree_spacing_m=body.pop("tree_spacing_m", 6.0),
            extra=body,
        )

    @property
    def t0_ns(self) -> int:
        return int(self.poses[0, 0])

    def pose_at(self, t_ns) -> tuple[np.ndarray, np.ndarray]:
        """Position (N, 3) and rotation (N, 3, 3) at GPS times, linear in position and yaw."""
        t = np.atleast_1d(np.asarray(t_ns, dtype=np.int64))
        rel = (t - self.t0_ns) / 1e9
        tp = (self.poses[:, 0] - self.poses[0, 0]) / 1e9
        pos = np.column_stack([np.interp(rel, tp, self.poses[:, k]) for k in (1, 2, 3)])
        yaw = np.unwrap(2 * np.arctan2(self.poses[:, 6], self.poses[:, 7]))
        return pos, rot_z(np.interp(rel, tp, yaw))


def rot_z(yaw) -> np.ndarray:
    yaw = np.atleast_1d(np.asarray(yaw, dtype=np.float64))
    c, s = np.cos(yaw), np.sin(yaw)
    out = np.zeros((len(yaw), 3, 3))
    out[:, 0, 0], out[:, 0, 1], out[:, 1, 0], out[:, 1, 1] = c, -s, s, c
    out[:, 2, 2] = 1.0
    return out


# --- path --------------------------------------------------------------------------


@dataclass
class LawnMower:
    """Aisles k = 0..rows at north (k - 0.5) * row_spacing, joined by half circles."""

    pieces: list[tuple]  # ("line", p0, p1) | ("arc", centre, radius, angle0, sign)
    lengths: np.ndarray

    @property
    def length(self) -> float:
        return float(self.lengths.sum())

    def at(self, s: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(xy (N, 2), yaw (N,), curvature (N,)) at path lengths s (clamped to the path)."""
        s = np.clip(np.asarray(s, dtype=np.float64), 0.0, self.length)
        ends = np.cumsum(self.lengths)
        idx = np.minimum(np.searchsorted(ends, s, side="right"), len(self.pieces) - 1)
        local = s - (ends[idx] - self.lengths[idx])
        xy = np.zeros((len(s), 2))
        yaw = np.zeros(len(s))
        kappa = np.zeros(len(s))
        for k, piece in enumerate(self.pieces):
            m = idx == k
            if not m.any():
                continue
            if piece[0] == "line":
                p0, p1 = piece[1], piece[2]
                d = (p1 - p0) / self.lengths[k]
                xy[m] = p0 + local[m, None] * d
                yaw[m] = math.atan2(d[1], d[0])
            else:
                c, r, a0, sign = piece[1:]
                th = a0 + sign * local[m] / r
                xy[m] = c + r * np.column_stack([np.cos(th), np.sin(th)])
                yaw[m] = th + sign * math.pi / 2
                kappa[m] = sign / r
        return xy, yaw, kappa


def lawn_mower(cfg: MovingConfig, margin_m: float = 4.0) -> LawnMower:
    rs = cfg.row_spacing_m
    x_lo, x_hi = -margin_m, (cfg.trees_per_row - 1) * cfg.tree_spacing_m + margin_m
    pieces: list[tuple] = []
    lengths: list[float] = []
    for k in range(cfg.rows + 1):
        n = (k - 0.5) * rs
        east = k % 2 == 0
        a, b = (x_lo, x_hi) if east else (x_hi, x_lo)
        pieces.append(("line", np.array([a, n]), np.array([b, n])))
        lengths.append(abs(b - a))
        if k < cfg.rows:
            # East end: counter-clockwise from -90 deg; west end: clockwise from -90 deg.
            pieces.append(
                ("arc", np.array([b, n + rs / 2]), rs / 2, -math.pi / 2, 1 if east else -1)
            )
            lengths.append(math.pi * rs / 2)
    return LawnMower(pieces, np.array(lengths))


# --- scene -------------------------------------------------------------------------


@dataclass
class Scene:
    centres: np.ndarray  # (T, 2)
    trunk_r: np.ndarray
    trunk_top: np.ndarray
    crown_z: np.ndarray
    crown_a: np.ndarray
    crown_b: np.ndarray
    ids: list[str]

    def cast(self, o: np.ndarray, d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Range to the first surface along unit rays (inf: nothing) and its kind
        (0 none, 1 ground, 2 trunk, 3 crown).

        Rays are sorted by azimuth once; each tree is tested only against the rays
        whose azimuth points at it from the batch's origins (all close together)."""
        n = len(o)
        down = d[:, 2] < -1e-9
        with np.errstate(divide="ignore"):
            rng = np.where(down, -o[:, 2] / np.where(down, d[:, 2], -1.0), np.inf)
        rng[rng <= 0] = np.inf
        kind = np.where(np.isfinite(rng), 1, 0).astype(np.int8)
        if n == 0:
            return rng, kind
        centre = o.mean(0)
        spread = float(np.sqrt(((o[:, :2] - centre[:2]) ** 2).sum(1).max()))
        az = np.arctan2(d[:, 1], d[:, 0])
        order = np.argsort(az)
        az_sorted = az[order]
        for i in range(len(self.centres)):
            cx, cy = self.centres[i]
            top = self.crown_z[i] + self.crown_b[i]
            radius = max(self.crown_a[i], self.trunk_r[i]) + 0.05
            dist = math.hypot(cx - centre[0], cy - centre[1])
            if dist > MAX_RANGE_M + radius + spread:
                continue
            reach = radius + spread
            if dist <= reach:
                cand = order
            else:
                half = math.asin(reach / dist)
                bearing = math.atan2(cy - centre[1], cx - centre[0])
                lo, hi = bearing - half, bearing + half
                parts = []
                shifts = (0.0, 2 * math.pi, -2 * math.pi)
                for a, b in ((lo + sh, hi + sh) for sh in shifts):
                    i0, i1 = np.searchsorted(az_sorted, [a, b])
                    if i1 > i0:
                        parts.append(order[i0:i1])
                if not parts:
                    continue
                cand = np.concatenate(parts)
                # A ray that meets the ground before the tree's nearest edge misses it.
                cand = cand[rng[cand] > dist - reach]
            if len(cand) == 0:
                continue
            ex, ey, ez = o[cand, 0] - cx, o[cand, 1] - cy, o[cand, 2]
            ux, uy, uz = d[cand, 0], d[cand, 1], d[cand, 2]
            # Trunk: vertical cylinder from the ground to trunk_top.
            a = ux * ux + uy * uy
            b = 2 * (ex * ux + ey * uy)
            c = ex * ex + ey * ey - self.trunk_r[i] ** 2
            disc = b * b - 4 * a * c
            with np.errstate(invalid="ignore", divide="ignore"):
                t = (-b - np.sqrt(disc)) / (2 * a)
                z = ez + t * uz
                hit = (disc > 0) & (a > 1e-12) & (t > 0) & (z >= 0) & (z <= self.trunk_top[i])
            t = np.where(hit, t, np.inf)
            better = t < rng[cand]
            rng[cand[better]] = t[better]
            kind[cand[better]] = 2
            # Crown: ellipsoid, scaled to a sphere of radius a.
            s = self.crown_a[i] / self.crown_b[i]
            ez2, uz2 = (ez - self.crown_z[i]) * s, uz * s
            a2 = ux * ux + uy * uy + uz2 * uz2
            b2 = 2 * (ex * ux + ey * uy + ez2 * uz2)
            c2 = ex * ex + ey * ey + ez2 * ez2 - self.crown_a[i] ** 2
            disc = b2 * b2 - 4 * a2 * c2
            with np.errstate(invalid="ignore"):
                t = (-b2 - np.sqrt(disc)) / (2 * a2)
            t = np.where((disc > 0) & (t > 0) & (top > 0), t, np.inf)
            better = t < rng[cand]
            rng[cand[better]] = t[better]
            kind[cand[better]] = 3
        far = rng > MAX_RANGE_M
        rng[far] = np.inf
        kind[far] = 0
        return rng, kind


def make_scene(cfg: MovingConfig, rng: np.random.Generator) -> Scene:
    centres, ids = [], []
    for r in range(cfg.rows):
        for p in range(cfg.trees_per_row):
            centres.append((p * cfg.tree_spacing_m, r * cfg.row_spacing_m))
            ids.append(f"t-r{r + 1}-p{p + 1}")
    t = len(centres)
    # Planting is not exact: trunks stand a little off the grid.
    centres = np.array(centres, dtype=np.float64).reshape(-1, 2) + rng.normal(
        0, TREE_JITTER_M, (t, 2)
    )
    crown_b = rng.uniform(1.0, 1.4, t)
    crown_z = 1.6 + crown_b + rng.uniform(0.0, 0.3, t)  # crown bottom 1.6-1.9 m
    return Scene(
        centres=centres,
        trunk_r=rng.uniform(0.09, 0.14, t),
        trunk_top=crown_z - crown_b + 0.4,
        crown_z=crown_z,
        crown_a=rng.uniform(1.4, 2.0, t),
        crown_b=crown_b,
        ids=ids,
    )


# --- recording -----------------------------------------------------------------------


def _ray_dirs(n: int, rng: np.random.Generator) -> np.ndarray:
    """Upper hemisphere from -6 deg (body frame), uniform in solid angle."""
    az = rng.uniform(0, 2 * math.pi, n)
    sin_el = rng.uniform(math.sin(math.radians(MIN_EL_DEG)), 1.0, n)
    cos_el = np.sqrt(1 - sin_el * sin_el)
    return np.column_stack([cos_el * np.cos(az), cos_el * np.sin(az), sin_el])


class _Kinematics:
    def __init__(self, path: LawnMower, cfg: MovingConfig):
        self.path, self.v = path, cfg.speed_mps

    def at(self, rel_s: np.ndarray):
        """Position (N, 3), yaw, yaw rate, lateral accel at seconds after the start."""
        rel_s = np.asarray(rel_s, dtype=np.float64)
        s = rel_s * self.v
        moving = s < self.path.length
        xy, yaw, kappa = self.path.at(s)
        kappa = np.where(moving, kappa, 0.0)
        pos = np.column_stack([xy, np.full(len(xy), SENSOR_HEIGHT_M)])
        v = np.where(moving, self.v, 0.0)
        return pos, yaw, v * kappa, v * v * kappa


def _quat_z(yaw) -> np.ndarray:
    yaw = np.asarray(yaw, dtype=np.float64)
    z = np.zeros_like(yaw)
    return np.column_stack([z, z, np.sin(yaw / 2), np.cos(yaw / 2)])


def _scan_second(
    kin: _Kinematics,
    scene: Scene,
    starts: list[float],
    n_points: int,
    rng: np.random.Generator,
    lever_dir: np.ndarray,
    hit_ratio: list[float],
) -> list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
    """Messages starting at `starts` (seconds; 0.1 s each, about a second together):
    body-frame points at their capture times, n_points per message, sorted in time.
    hit_ratio carries the share of rays with a return from batch to batch."""
    k = len(starts)
    parts: list[list[tuple]] = [[] for _ in range(k)]
    lack = np.full(k, n_points)
    while lack.sum() > 0:
        m = (lack / hit_ratio[0] * 1.1).astype(int) + np.where(lack > 0, 32, 0)
        msg = np.repeat(np.arange(k), m)
        dt = rng.uniform(0, 1.0 / MSG_HZ, len(msg))
        t = np.asarray(starts)[msg] + dt
        d_body = _ray_dirs(len(msg), rng)
        pos, yaw, _, _ = kin.at(t)
        c, s_ = np.cos(yaw), np.sin(yaw)
        d_world = np.column_stack(
            [
                c * d_body[:, 0] - s_ * d_body[:, 1],
                s_ * d_body[:, 0] + c * d_body[:, 1],
                d_body[:, 2],
            ]
        )
        rg, kind = scene.cast(pos, d_world)
        mast = d_body @ lever_dir > math.cos(math.radians(MAST_CONE_DEG))
        rg = np.where(mast, rng.uniform(0.15, 0.55, len(msg)), rg)
        kind = np.where(mast, 4, kind)
        ok = np.isfinite(rg)
        hit_ratio[0] = min(max(float(ok.mean()), 0.05), 1.0)
        rg = rg + rng.normal(0, RANGE_NOISE_M, len(msg))
        inten = np.array([0.0, 20.0, 60.0, 40.0, 90.0])[kind] + rng.normal(0, 3.0, len(msg))
        for j in np.nonzero(lack)[0]:
            sel = np.nonzero(ok & (msg == j))[0][: lack[j]]
            parts[j].append((d_body[sel] * rg[sel, None], inten[sel], d_body[sel, 2], dt[sel]))
            lack[j] -= len(sel)
    out = []
    for j in range(k):
        xyz, inten, sin_el, rel = (np.concatenate([p[i] for p in parts[j]]) for i in range(4))
        el = np.degrees(np.arcsin(np.clip(sin_el, -1, 1)))
        ring = np.clip(((el - MIN_EL_DEG) / 96.0 * 18).astype(int), 0, 17)
        order = np.argsort(rel, kind="stable")
        out.append((xyz[order], inten[order], ring[order], rel[order]))
    return out


class _Bag:
    """One ros2 bag folder with a single MCAP file and its metadata.yaml."""

    def __init__(self, folder: Path):
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)
        self.name = f"{folder.name}_0.mcap"
        self.f = open(folder / self.name, "wb")
        self.w = Writer(self.f, compression=CompressionType.ZSTD)
        self.w.start(profile="ros2", library=f"{PIPELINE_NAME} {__version__} synth_moving")
        self.channels: dict[str, int] = {}
        self.counts: dict[str, int] = {}
        self.first: int | None = None
        self.last = 0
        for topic, schema in (
            (TOPICS["points"], ros2msg.POINTCLOUD2),
            (TOPICS["imu"], ros2msg.IMU),
            (TOPICS["ubx"], ros2msg.UINT8_ARRAY),
        ):
            sid = self.w.register_schema(schema, "ros2msg", ros2msg.MSGDEFS[schema].encode())
            self.channels[topic] = self.w.register_channel(topic, "cdr", sid)
            self.counts[topic] = 0

    def write(self, topic: str, log_ns: int, data: bytes) -> None:
        self.w.add_message(
            self.channels[topic],
            log_time=log_ns,
            data=data,
            publish_time=log_ns,
            sequence=self.counts[topic],
        )
        self.counts[topic] += 1
        self.first = log_ns if self.first is None else min(self.first, log_ns)
        self.last = max(self.last, log_ns)

    def close(self) -> int:
        self.w.finish()
        self.f.close()
        size = (self.folder / self.name).stat().st_size
        types = {
            TOPICS["points"]: ros2msg.POINTCLOUD2,
            TOPICS["imu"]: ros2msg.IMU,
            TOPICS["ubx"]: ros2msg.UINT8_ARRAY,
        }
        topics = "".join(
            f"    - topic_metadata:\n        name: {t}\n        type: {types[t]}\n"
            f"        serialization_format: cdr\n        offered_qos_profiles: ''\n"
            f"      message_count: {n}\n"
            for t, n in self.counts.items()
        )
        first = self.first or 0
        (self.folder / "metadata.yaml").write_text(
            "rosbag2_bagfile_information:\n  version: 5\n  storage_identifier: mcap\n"
            f"  duration:\n    nanoseconds: {self.last - first}\n"
            f"  starting_time:\n    nanoseconds_since_epoch: {first}\n"
            f"  message_count: {sum(self.counts.values())}\n"
            f"  topics_with_message_count:\n{topics}"
            "  compression_format: ''\n  compression_mode: ''\n"
            f"  relative_file_paths:\n    - {self.name}\n",
            encoding="utf-8",
        )
        return size


def _nav_error(rel_s: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Slowly varying metre-level error of a standalone receiver (east, north, up)."""
    bias = rng.normal(0, 0.6, 3)
    amp = rng.uniform(0.2, 0.4, 3)
    per = rng.uniform(200, 400, 3)
    ph = rng.uniform(0, 2 * math.pi, 3)
    return bias + amp * np.sin(2 * math.pi * rel_s[:, None] / per + ph)


def _setup(cfg: MovingConfig):
    rng = np.random.default_rng(cfg.seed)
    path = lawn_mower(cfg)
    duration = cfg.duration_s if cfg.duration_s is not None else path.length / cfg.speed_mps
    t0 = utc_to_gps_ns(START_UTC)
    kin = _Kinematics(path, cfg)
    scene = make_scene(cfg, rng)
    # Truth at 100 Hz (message starts fall on samples).
    rel_truth = np.arange(int(round(duration * TRUTH_HZ)) + 1) / TRUTH_HZ
    pos, yaw, _, _ = kin.at(rel_truth)
    t_truth = t0 + np.round(rel_truth * _NS).astype(np.int64)
    truth = MovingTruth(
        poses=np.column_stack([t_truth.astype(np.float64), pos, _quat_z(yaw)]),
        origin_lat=ORIGIN[0],
        origin_lon=ORIGIN[1],
        origin_height_m=ORIGIN[2],
        lever_arm_m=[float(v) for v in cfg.lever_arm_m],
        trees=[
            (tid, float(e), float(n)) for tid, (e, n) in zip(scene.ids, scene.centres, strict=True)
        ],
        tree_spacing_m=cfg.tree_spacing_m,
        extra={"trunk_radius_m": [round(float(r), 4) for r in scene.trunk_r]},
    )
    return rng, path, duration, t0, kin, scene, truth


def moving_truth(cfg: MovingConfig | None = None) -> MovingTruth:
    """The truth of make_moving_session(cfg) without writing anything (poses, trees)."""
    return _setup(cfg or MovingConfig())[-1]


def antenna_trajectory(
    truth: MovingTruth,
    rng: np.random.Generator,
    *,
    quality: SolutionQuality = SolutionQuality.fix,
    sd_m: tuple[float, float, float] = (0.01, 0.01, 0.015),
    noise_m: tuple[float, float, float] = (0.008, 0.008, 0.012),
    hz: float = NAV_PVT_HZ,
) -> Trajectory:
    """A trajectory of the antenna (true pose + lever arm) with white noise, like the
    position stage's PPK output (default) or, with other qualities and sd, a worse one."""
    span_s = (int(truth.poses[-1, 0]) - truth.t0_ns) / 1e9
    steps = np.arange(int(math.floor(span_s * hz + 1e-9)) + 1) / hz
    times = truth.t0_ns + np.round(steps * _NS).astype(np.int64)
    pos, rot = truth.pose_at(times)
    ant = pos + rot @ np.asarray(truth.lever_arm_m, dtype=np.float64)
    ant = ant + rng.normal(0, noise_m, ant.shape)
    frame = LocalFrame(truth.origin_lat, truth.origin_lon)
    lat, lon = frame.to_latlon(ant[:, 0], ant[:, 1])
    points = [
        TrajectoryPoint(
            gps_time_ns=int(g),
            lat=float(la),
            lon=float(lo),
            height_m=truth.origin_height_m + float(u),
            quality=quality,
            sd_n_m=sd_m[1],
            sd_e_m=sd_m[0],
            sd_u_m=sd_m[2],
            num_sv=24,
        )
        for g, la, lo, u in zip(times, lat, lon, ant[:, 2], strict=True)
    ]
    return Trajectory(
        producer=Producer(
            pipeline=PIPELINE_NAME, version=__version__, params_hash="synthetic", stage="position"
        ),
        source="rtklib_pos",
        ppk_status=PpkStatus.ppk,
        points=points,
        notes=["synthetic trajectory (lidar synth --moving)"],
    )


def make_moving_session(dest: Path, cfg: MovingConfig | None = None) -> MovingTruth:
    cfg = cfg or MovingConfig()
    dest = Path(dest)
    rng, path, duration, t0, kin, scene, truth = _setup(cfg)
    frame = LocalFrame(ORIGIN[0], ORIGIN[1])
    lever = np.array(truth.lever_arm_m, dtype=np.float64)
    lever_dir = lever / np.linalg.norm(lever)

    def silent(rel: float) -> bool:
        return cfg.gap is not None and cfg.gap[0] <= rel < cfg.gap[1]

    def bag_of(rel: float) -> int:
        return 1 if cfg.second_bag_at_s is not None and rel >= cfg.second_bag_at_s else 0

    raw = dest / "lidar" / "raw"
    bags = [_Bag(raw / "bag")]
    if cfg.second_bag_at_s is not None:
        bags.append(_Bag(raw / "bag.1"))
    offset_ns = int(round(cfg.stamp_offset_s * _NS))
    n_per_msg = max(1, int(cfg.points_per_s) // MSG_HZ)
    points_total = 0
    imu_total = 0

    # Events in time order per bag: clouds, IMU and UBX interleaved by log time.
    n_msgs = int(math.floor(duration * MSG_HZ + 1e-9))
    n_imu = int(math.floor(duration * cfg.imu_hz + 1e-9))
    imu_rel = np.arange(n_imu) / cfg.imu_hz
    ipos, iyaw, irate, ilat = kin.at(imu_rel)
    gyro_noise = rng.normal(0, 0.002, (n_imu, 3))
    acc_noise = rng.normal(0, 0.02, (n_imu, 3))
    nav_rel = np.arange(int(math.floor(duration * NAV_PVT_HZ + 1e-9)) + 1) / NAV_PVT_HZ
    nav_err = _nav_error(nav_rel, rng)
    npos, nyaw, _, _ = kin.at(nav_rel)
    antenna = npos + np.einsum("nij,j->ni", rot_z(nyaw), lever)

    events: list[tuple[float, int, int]] = [(k / MSG_HZ, 0, k) for k in range(n_msgs)]
    events += [(float(imu_rel[k]), 1, k) for k in range(n_imu)]
    events += [(float(nav_rel[k]), 2, k) for k in range(len(nav_rel))]
    events.sort()
    ubx_blob = bytearray()
    nav_frames: list[bytes] = []
    for k in range(len(nav_rel)):
        g = t0 + int(round(nav_rel[k] * _NS))
        e, n, u = antenna[k] + nav_err[k]
        lat, lon = frame.to_latlon(e, n)
        v = cfg.speed_mps if nav_rel[k] * cfg.speed_mps < path.length else 0.0
        payload = encode_nav_pvt(
            gps_time_ns=g,
            lat_deg=float(lat),
            lon_deg=float(lon),
            height_m=ORIGIN[2] + float(u),
            h_acc_m=1.5,
            v_acc_m=2.5,
            carr_soln=0,
            num_sv=14,
            vel_ned_mps=(v * math.sin(nyaw[k]), v * math.cos(nyaw[k]), 0.0),
            head_mot_deg=math.degrees(math.pi / 2 - nyaw[k]) % 360,
        )
        nav_frames.append(build_frame(0x01, 0x07, payload))
        ubx_blob += nav_frames[-1]
    (dest / "gnss").mkdir(parents=True, exist_ok=True)
    (dest / "gnss" / "gnss.ubx").write_bytes(bytes(ubx_blob))

    hit_ratio = [0.3]
    batch: dict[int, tuple] = {}
    for rel, kind, k in events:
        log_ns = unix_ns(t0) + int(round(rel * _NS))
        bag = bags[bag_of(rel)]
        if kind == 2:
            bag.write(TOPICS["ubx"], log_ns, ros2msg.encode_uint8_array(nav_frames[k]))
            continue
        if silent(rel):
            continue
        if kind == 0:
            if k not in batch:
                ks = [j for j in range(k, min(k + MSG_HZ, n_msgs)) if not silent(j / MSG_HZ)]
                made = _scan_second(
                    kin, scene, [j / MSG_HZ for j in ks], n_per_msg, rng, lever_dir, hit_ratio
                )
                batch = dict(zip(ks, made, strict=True))
            xyz, inten, ring, drel = batch.pop(k)
            data = ros2msg.encode_pointcloud2(log_ns - offset_ns, xyz, inten, ring, drel)
            bag.write(TOPICS["points"], log_ns, data)
            points_total += len(xyz)
        else:
            q = _quat_z(iyaw[k : k + 1])[0]
            gyro = np.array([0.0, 0.0, irate[k]]) + gyro_noise[k]
            acc = np.array([0.0, ilat[k], GRAVITY]) + acc_noise[k]
            bag.write(TOPICS["imu"], log_ns, ros2msg.encode_imu(log_ns - offset_ns, q, gyro, acc))
            imu_total += 1
    seg_files = []
    for b in bags:
        size = b.close()
        seg_files.append({"file": f"{b.folder.name}/{b.name}", "bytes": size})

    gaps = []
    if cfg.gap is not None:
        a = math.ceil(cfg.gap[0] * MSG_HZ - 1e-9) / MSG_HZ  # last message before: a - 0.1
        b = math.ceil(cfg.gap[1] * MSG_HZ - 1e-9) / MSG_HZ
        ga, gb = t0 + int(round((a - 0.1) * _NS)), t0 + int(round(b * _NS))
        gaps.append(
            {
                "start_gps_ns": ga,
                "end_gps_ns": gb,
                "start_mono_us": 1_000_000 + int((a - 0.1) * 1e6),
                "end_mono_us": 1_000_000 + int(b * 1e6),
                "duration_s": round((gb - ga) / _NS, 3),
            }
        )
    stop = t0 + int(round(duration * _NS))
    recording = {
        "schema": "orchados.lidar_recording/1",
        "session_id": SESSION_ID,
        "parcel_id": PARCEL_ID,
        "recorder_version": "synthetic",
        "start_gps_ns": t0,
        "stop_gps_ns": stop,
        "clock_state_at_start": "pps",
        "precheck_overrides": [],
        "lidar_mode": "ok",
        "topics": dict(TOPICS),
        "segments": seg_files,
        "points_total": points_total,
        "imu_messages_total": imu_total,
        "gaps": gaps,
        "alerts": [],
    }
    _write_json(raw / "recording.json", recording)
    _write_json(
        dest / "gnss" / "session.json",
        {
            "format_version": 1,
            "session_id": SESSION_ID,
            "parcel_id": PARCEL_ID,
            "firmware_version": "synthetic",
            "recorder": "kit-recorder",
            "receiver": {"model": "ZED-F9P", "port": "USB", "baud": None, "config_status": "ok"},
            "gps_utc_leap_seconds": 18,
            "clock_state_at_start": "pps",
            "precheck_overrides": [],
            "start": {"esp_micros": 1_000_000, "gps_time_ns": t0, "utc": gps_ns_to_iso(t0)},
            "stop": {
                "esp_micros": 1_000_000 + int(duration * 1e6),
                "gps_time_ns": stop,
                "utc": gps_ns_to_iso(stop),
            },
            "stop_reason": "command",
            "gnss_bytes": len(ubx_blob),
            "dropped_bytes": 0,
        },
    )
    _write_json(
        dest / "session.json",
        {
            "session_id": SESSION_ID,
            "parcel_id": PARCEL_ID,
            "kind": "scan",
            "methodology_version": "scan-v1",
            "rig_id": "kit-synth",
            "calibration_id": None,
            "scan_platform": "motorcycle",
            "app_version": "synthetic",
        },
    )
    trees = []
    for tid, (e, n) in zip(scene.ids, scene.centres, strict=True):
        lat, lon = frame.to_latlon(e, n)
        r, p = tid[3:].split("-p")
        trees.append(
            {"tree_id": tid, "slot_code": f"S{r}-{p}", "lat": float(lat), "lon": float(lon)}
        )
    _write_json(dest / "trees.json", trees)

    if cfg.ppk:
        traj = antenna_trajectory(truth, rng)
        write_model(traj, dest.parent / f"{dest.name}.processed" / PPK_DIR / "trajectory.json")
    truth.write(dest / "truth.json")
    return truth


def _write_json(path: Path, body) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
