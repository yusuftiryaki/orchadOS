"""Fake front end for tests: keyframes from a synthetic session's truth (truth.json).

Keyframes fall on cloud messages, by the spec spacing (0.5 m, 10 deg or 1 s,
whichever first). A keyframe's scan is the points of its message and of the
following messages up to the next keyframe, moved with the true poses into the
true body frame at the keyframe time (deskewed, as a LIO front end does). The
reported pose is the true pose in the segment's odometry frame (origin and yaw
of the first keyframe, gravity aligned), then degraded on request: position
drift growing with the distance travelled, yaw drift about the odometry origin,
white noise, and a jump by one tree spacing along the heading at swap_tree_at
seconds (a front end that mistakes one tree for its neighbour). Raw points closer
than blind_m are dropped before deskewing (Point-LIO's `blind`).
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from ...hashing import hash_object
from ..fusion import rot_to_quat
from ..rawlog import Segment, iter_clouds
from ..synth_moving import MovingTruth
from . import FrontendResult, Keyframe, scan_path, write_frontend_output, write_scan

TRUTH_FILE = "truth.json"
_DRIFT_DIR = np.array([1.0, 1.0, 0.0]) / math.sqrt(2.0)


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
        blind_m: float = 0.6,
        seed: int = 0,
    ):
        self.drift = drift_m_per_100m
        self.yaw_drift = yaw_drift_deg_per_100m
        self.noise = noise_m
        self.swap_tree_at = swap_tree_at
        self.kf_dist = keyframe_dist_m
        self.kf_angle = math.radians(keyframe_angle_deg)
        self.kf_dt_ns = int(keyframe_dt_s * 1e9)
        self.blind = blind_m
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
                "blind_m": self.blind,
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

    def odometry(
        self,
        truth: MovingTruth,
        times_ns,
        segment: int = 0,
        work_dir: Path | None = None,
        rng: np.random.Generator | None = None,
    ) -> list[Keyframe]:
        """Keyframes among candidate times (e.g. message times) without scans: the same
        selection and degradation as run(). Scan paths point under work_dir (or nowhere)."""
        odo = _Odometry(
            self, truth, segment, Path(work_dir or ""), rng or np.random.default_rng(self.seed)
        )
        for t in times_ns:
            odo.step(int(t))
        return odo.keyframes

    def _segment(self, truth: MovingTruth, seg: Segment, work_dir: Path, rng):
        odo = _Odometry(self, truth, seg.index, work_dir, rng)
        buf_xyz: list[np.ndarray] = []
        buf_int: list[np.ndarray] = []
        n_points = 0

        def flush():
            if odo.keyframes:
                xyz = np.concatenate(buf_xyz) if buf_xyz else np.zeros((0, 3), np.float32)
                inten = np.concatenate(buf_int) if buf_int else np.zeros(0, np.float32)
                write_scan(work_dir, seg.index, len(odo.keyframes) - 1, xyz, inten)
                buf_xyz.clear()
                buf_int.clear()

        for msg in iter_clouds(seg):
            n_points += len(msg.xyz)
            if odo.would_start(msg.log_gps_ns):
                flush()
                odo.step(msg.log_gps_ns)
            kf = odo.current
            # Blind range on the raw points (the kit's mast), as Point-LIO's `blind`: after
            # deskewing into a moving keyframe frame the mast is smeared along the path.
            far = np.linalg.norm(msg.xyz, axis=1) >= self.blind
            xyz, rel = msg.xyz[far].astype(np.float64), msg.rel_time_s[far].astype(np.float64)
            # Deskew: each point's own true pose -> world -> keyframe body frame.
            times = msg.log_gps_ns + np.round(rel * 1e9)
            pos, rot = truth.pose_at(times.astype(np.int64))
            world = pos + np.einsum("nij,nj->ni", rot, xyz)
            buf_xyz.append(((world - kf["p"]) @ kf["r"]).astype(np.float32))
            buf_int.append(msg.intensity[far])
        flush()
        return odo.keyframes, n_points


class _Odometry:
    """Keyframe selection on the true poses and the degraded odometry poses."""

    def __init__(self, fe: FakeFrontend, truth: MovingTruth, segment: int, work_dir: Path, rng):
        self.fe, self.truth, self.segment = fe, truth, segment
        self.work_dir, self.rng = work_dir, rng
        self.keyframes: list[Keyframe] = []
        self.current: dict | None = None  # time, true position and rotation
        self.origin: tuple[np.ndarray, np.ndarray] | None = None  # (p0, R0z^T)
        self.travelled = 0.0
        self.shift = np.zeros(3)
        self.t_first = 0

    def would_start(self, t_ns: int) -> bool:
        kf = self.current
        if kf is None:
            return True
        (p,), (r,) = self.truth.pose_at([t_ns])
        step = float(np.linalg.norm(p - kf["p"]))
        turn = abs(math.remainder(_yaw(r) - _yaw(kf["r"]), 2 * math.pi))
        return (
            step >= self.fe.kf_dist
            or turn >= self.fe.kf_angle
            or t_ns - kf["t"] >= self.fe.kf_dt_ns
        )

    def step(self, t_ns: int) -> None:
        """Consider t_ns as a keyframe time; start one if the spacing rule says so."""
        if not self.would_start(t_ns):
            return
        (p,), (r,) = self.truth.pose_at([t_ns])
        if self.current is not None:
            self.travelled += float(np.linalg.norm(p - self.current["p"]))
        self.current = {"t": t_ns, "p": p, "r": r}
        if self.origin is None:
            self.origin = (p, _rz(_yaw(r)).T)
            self.t_first = t_ns
        fe = self.fe
        p0, r0t = self.origin
        t = r0t @ (p - p0)
        rot = r0t @ r
        t = t + _DRIFT_DIR * fe.drift / 100.0 * self.travelled
        if fe.yaw_drift:
            rz = _rz(math.radians(fe.yaw_drift / 100.0 * self.travelled))
            t, rot = rz @ t, rz @ rot
        if fe.noise:
            t = t + self.rng.normal(0, fe.noise, 3)
        if (
            fe.swap_tree_at is not None
            and not self.shift.any()
            and (t_ns - self.t_first) / 1e9 >= fe.swap_tree_at
        ):
            self.shift = (r0t @ r[:, 0]) * self.truth.tree_spacing_m
        index = len(self.keyframes)
        self.keyframes.append(
            Keyframe(
                segment=self.segment,
                index=index,
                gps_time_ns=int(t_ns),
                t=t + self.shift,
                q=rot_to_quat(rot),
                scan=scan_path(self.work_dir, self.segment, index),
            )
        )
