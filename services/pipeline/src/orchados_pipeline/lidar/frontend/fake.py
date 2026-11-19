"""Fake front end for tests: keyframes from a synthetic session's truth (truth.json).

Keyframes fall on cloud messages, by the spec spacing (0.5 m, 10 deg or 1 s,
whichever first). A keyframe's scan is the points of its message and of the
following messages up to the next keyframe, moved with the true poses into the
true body frame at the keyframe time (deskewed, as a LIO front end does). The
reported pose is the true pose in the segment's odometry frame (origin and yaw
of the first keyframe, gravity aligned), then degraded on request: position
drift growing with the distance travelled, yaw drift about the odometry origin,
white noise, and a jump by one tree spacing along the heading at swap_tree_at
seconds (a front end that mistakes one tree for its neighbour).
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from ...hashing import hash_object
from ..rawlog import Segment, iter_clouds
from ..synth_moving import MovingTruth
from . import FrontendResult, Keyframe, scan_path, write_frontend_output, write_scan

TRUTH_FILE = "truth.json"
_DRIFT_DIR = np.array([1.0, 1.0, 0.0]) / math.sqrt(2.0)


def rot_to_quat(r: np.ndarray) -> np.ndarray:
    """Rotation matrix -> quaternion x, y, z, w (w >= 0)."""
    m = np.asarray(r, dtype=np.float64)
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q)
    q /= np.linalg.norm(q)
    return q if q[3] >= 0 else -q


def _rz(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def _yaw(r: np.ndarray) -> float:
    return math.atan2(r[1, 0], r[0, 0])


class FakeFrontend:
    method = "fake"
    method_version = "1"

    def __init__(
        self,
        drift_m_per_100m: float = 0.0,
        yaw_drift_deg_per_100m: float = 0.0,
        noise_m: float = 0.0,
        swap_tree_at: float | None = None,
        *,
        keyframe_dist_m: float = 0.5,
        keyframe_angle_deg: float = 10.0,
        keyframe_dt_s: float = 1.0,
        seed: int = 0,
    ):
        self.drift = drift_m_per_100m
        self.yaw_drift = yaw_drift_deg_per_100m
        self.noise = noise_m
        self.swap_tree_at = swap_tree_at
        self.kf_dist = keyframe_dist_m
        self.kf_angle = math.radians(keyframe_angle_deg)
        self.kf_dt_ns = int(keyframe_dt_s * 1e9)
        self.seed = seed

    @property
    def config_hash(self) -> str:
        return hash_object(
            {
                "drift_m_per_100m": self.drift,
                "yaw_drift_deg_per_100m": self.yaw_drift,
                "noise_m": self.noise,
                "swap_tree_at": self.swap_tree_at,
                "keyframe": [self.kf_dist, self.kf_angle, self.kf_dt_ns],
                "seed": self.seed,
            }
        )

    def run(self, session_dir: Path, segments: list[Segment], work_dir: Path) -> FrontendResult:
        truth = MovingTruth.load(Path(session_dir) / TRUTH_FILE)
        rng = np.random.default_rng(self.seed)
        result = FrontendResult(
            method=self.method,
            method_version=self.method_version,
            config_hash=self.config_hash,
            segments=[],
        )
        rates = []
        for seg in segments:
            if seg.skip_reason is not None:
                continue
            kfs, n_points = self._segment(truth, seg, work_dir, rng)
            result.keyframes += kfs
            result.points_total += n_points
            rates.append(seg.imu_rate_hz)
            result.segments.append(
                {
                    "index": seg.index,
                    "start_gps_ns": seg.start_gps_ns,
                    "end_gps_ns": seg.end_gps_ns,
                    "keyframe_count": len(kfs),
                    "status": "ok" if kfs else "failed",
                    "message": "" if kfs else "no cloud messages",
                }
            )
        result.imu_rate_hz = float(np.mean(rates)) if rates else 0.0
        write_frontend_output(work_dir, result)
        return result

    def _segment(self, truth: MovingTruth, seg: Segment, work_dir: Path, rng):
        keyframes: list[Keyframe] = []
        buf_xyz: list[np.ndarray] = []
        buf_int: list[np.ndarray] = []
        n_points = 0
        kf: dict | None = None  # current keyframe: time, true pose
        origin = None  # (p0, R0z^T)
        travelled = 0.0
        shift = np.zeros(3)
        t_first = None

        def flush():
            if kf is not None:
                xyz = np.concatenate(buf_xyz) if buf_xyz else np.zeros((0, 3), np.float32)
                inten = np.concatenate(buf_int) if buf_int else np.zeros(0, np.float32)
                write_scan(work_dir, seg.index, len(keyframes) - 1, xyz, inten)
                buf_xyz.clear()
                buf_int.clear()

        for msg in iter_clouds(seg):
            n_points += len(msg.xyz)
            (p,), (r,) = truth.pose_at([msg.log_gps_ns])
            new = kf is None
            if not new:
                step = float(np.linalg.norm(p - kf["p"]))
                turn = abs(math.remainder(_yaw(r) - _yaw(kf["r"]), 2 * math.pi))
                new = (
                    step >= self.kf_dist
                    or turn >= self.kf_angle
                    or msg.log_gps_ns - kf["t"] >= self.kf_dt_ns
                )
            if new:
                flush()
                if kf is not None:
                    travelled += float(np.linalg.norm(p - kf["p"]))
                kf = {"t": msg.log_gps_ns, "p": p, "r": r}
                if origin is None:
                    origin = (p, _rz(_yaw(r)).T)
                    t_first = msg.log_gps_ns
                keyframes.append(
                    self._keyframe(seg, len(keyframes), kf, origin, travelled, rng, work_dir)
                )
                if (
                    self.swap_tree_at is not None
                    and not shift.any()
                    and (msg.log_gps_ns - t_first) / 1e9 >= self.swap_tree_at
                ):
                    heading = origin[1] @ r[:, 0]
                    shift = heading * truth.tree_spacing_m
                keyframes[-1].t = keyframes[-1].t + shift
            # Deskew: each point's own true pose -> world -> keyframe body frame.
            times = msg.log_gps_ns + np.round(msg.rel_time_s.astype(np.float64) * 1e9)
            pos, rot = truth.pose_at(times.astype(np.int64))
            world = pos + np.einsum("nij,nj->ni", rot, msg.xyz.astype(np.float64))
            buf_xyz.append(((world - kf["p"]) @ kf["r"]).astype(np.float32))
            buf_int.append(msg.intensity)
        flush()
        return keyframes, n_points

    def _keyframe(self, seg, index, kf, origin, travelled, rng, work_dir) -> Keyframe:
        p0, r0t = origin
        t = r0t @ (kf["p"] - p0)
        r = r0t @ kf["r"]
        t = t + _DRIFT_DIR * self.drift / 100.0 * travelled
        if self.yaw_drift:
            rz = _rz(math.radians(self.yaw_drift / 100.0 * travelled))
            t, r = rz @ t, rz @ r
        if self.noise:
            t = t + rng.normal(0, self.noise, 3)
        return Keyframe(
            segment=seg.index,
            index=index,
            gps_time_ns=int(kf["t"]),
            t=t,
            q=rot_to_quat(r),
            scan=scan_path(work_dir, seg.index, index),
        )
