"""Pose graph: front-end keyframes tied to the GNSS trajectory (spec 2026-11-18 §5.5).

Nodes are the keyframes' LiDAR body poses in the local ENU frame (LocalFrame
east/north, up = height above origin_height_m). Factors (GTSAM):

- between: consecutive keyframes of one segment, the front end's relative pose,
  sigma growing with the distance between them (params.between_sigma_*), robust
  kernel params.between_robust (default Cauchy): a single front-end jump is
  down-weighted against GNSS rather than spread over the GNSS factors; segments
  are separate chains, tied to each other only through GNSS;
- GNSS: the trajectory position at the keyframe time, linearly interpolated
  between two trajectory points at most params.gnss_max_gap_s apart (none
  otherwise: a keyframe in a trajectory gap or outside it gets no factor),
  through the lever arm (GPSFactorArm), sigma = max(trajectory sd, quality floor),
  Huber kernel;
- a prior on each segment's first roll and pitch (the odometry frame is gravity
  aligned), so a straight segment's roll about its own line stays determined.

A segment whose GNSS samples span less than MIN_BASELINE_M cannot be placed and
is left out (dropped_segments). Initial values: each segment's odometry aligned
to its GNSS samples by yaw and translation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import gtsam
import numpy as np

from ..geo import LocalFrame
from ..models import SolutionQuality, Trajectory
from .frontend import Keyframe
from .models import RegistrationParams

MIN_BASELINE_M = 1.0
_RANK = {
    SolutionQuality.fix: 0,
    SolutionQuality.ppp: 1,
    SolutionQuality.float: 2,
    SolutionQuality.dgps: 3,
    SolutionQuality.sbas: 4,
    SolutionQuality.single: 5,
}


def quat_to_rot(q) -> np.ndarray:
    x, y, z, w = (float(v) for v in q)
    n = math.sqrt(x * x + y * y + z * z + w * w)
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


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


@dataclass
class GnssSample:
    pos: np.ndarray  # (3,) antenna, ENU metres
    sigma: np.ndarray  # (3,) east, north, up 1-sigma, metres
    quality: str


@dataclass
class FusionResult:
    # (segment, index) -> (position (3,), quaternion x y z w) of the LiDAR body in ENU.
    poses_enu: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]]
    # GNSS factors after optimisation: (keyframe gps_time_ns, quality, |antenna - GNSS| m).
    residuals: list[tuple[int, str, float]]
    used_gnss: int
    dropped_segments: list[int] = field(default_factory=list)
    # Between factors further than params.between_outlier_sigma (whitened) from the fused
    # poses: front-end jumps the GNSS factors overruled.
    between_outliers: int = 0


def _floor(quality: SolutionQuality, params: RegistrationParams) -> float:
    if quality == SolutionQuality.fix:
        return params.gnss_sigma_fix_m
    if quality in (SolutionQuality.float, SolutionQuality.ppp):
        return params.gnss_sigma_float_m
    return params.gnss_sigma_other_m


def sample_gnss(
    times_ns,
    trajectory: Trajectory,
    frame: LocalFrame,
    params: RegistrationParams,
    origin_height_m: float | None = None,
) -> list[GnssSample | None]:
    """The trajectory at each time: interpolated between two points at most
    params.gnss_max_gap_s apart, exact at a point, None otherwise."""
    pts = sorted(trajectory.points, key=lambda p: p.gps_time_ns)
    if not pts:
        return [None for _ in times_ns]
    h0 = pts[0].height_m if origin_height_m is None else origin_height_m
    t = np.array([p.gps_time_ns for p in pts], dtype=np.int64)
    e, n = frame.to_en([p.lat for p in pts], [p.lon for p in pts])
    xyz = np.column_stack([e, n, np.array([p.height_m for p in pts]) - h0])
    sd = np.array([[p.sd_e_m, p.sd_n_m, p.sd_u_m] for p in pts])
    floor = np.array([_floor(p.quality, params) for p in pts])
    rank = np.array([_RANK[p.quality] for p in pts])
    max_gap = int(params.gnss_max_gap_s * 1e9)
    out: list[GnssSample | None] = []
    for tk in times_ns:
        tk = int(tk)
        i = int(np.searchsorted(t, tk, side="right")) - 1
        if i < 0 or tk > t[-1]:
            out.append(None)
            continue
        if t[i] == tk:
            idx, w = (i, i), 0.0
        else:
            j = i + 1
            if t[j] - t[i] > max_gap:
                out.append(None)
                continue
            idx, w = (i, j), (tk - t[i]) / (t[j] - t[i])
        a, b = idx
        worst = a if rank[a] >= rank[b] else b
        sigma = np.maximum(np.maximum(sd[a], sd[b]), max(floor[a], floor[b]))
        out.append(
            GnssSample(
                pos=xyz[a] + w * (xyz[b] - xyz[a]),
                sigma=sigma,
                quality=pts[worst].quality.value,
            )
        )
    return out


def _by_segment(keyframes: list[Keyframe]) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {}
    for i, k in enumerate(keyframes):
        out.setdefault(k.segment, []).append(i)
    for idx in out.values():
        idx.sort(key=lambda i: keyframes[i].index)
    return dict(sorted(out.items()))


def _align_yaw(a: np.ndarray, g: np.ndarray, w: np.ndarray) -> tuple[float, np.ndarray]:
    """Yaw and translation minimising sum w |Rz(yaw) a + t - g|^2."""
    w = w / w.sum()
    ca, cg = (w[:, None] * a).sum(0), (w[:, None] * g).sum(0)
    da, dg = a - ca, g - cg
    s = (w * (da[:, 0] * dg[:, 1] - da[:, 1] * dg[:, 0])).sum()
    c = (w * (da[:, 0] * dg[:, 0] + da[:, 1] * dg[:, 1])).sum()
    yaw = math.atan2(s, c)
    return yaw, cg - _rz(yaw) @ ca


def _antenna_odom(keyframes, idx, lever) -> np.ndarray:
    return np.array([keyframes[i].t + quat_to_rot(keyframes[i].q) @ lever for i in idx])


def rigid_drift(
    keyframes: list[Keyframe],
    samples: list[GnssSample | None],
    lever_arm_m,
    qualities: set[str] | None = None,
) -> dict[int, tuple[float, float]]:
    """Per segment, before fusion: the largest distance between the odometry antenna path,
    aligned to the GNSS samples by one yaw + translation, and the samples; with the
    segment's path length. Only samples of the given qualities (all if None); segments
    with fewer than three usable samples are left out."""
    lever = np.asarray(lever_arm_m, dtype=np.float64)
    out: dict[int, tuple[float, float]] = {}
    for seg, idx in _by_segment(keyframes).items():
        use = [
            i
            for i in idx
            if samples[i] is not None and (qualities is None or samples[i].quality in qualities)
        ]
        if len(use) < 3:
            continue
        a = _antenna_odom(keyframes, use, lever)
        g = np.array([samples[i].pos for i in use])
        yaw, tr = _align_yaw(a, g, np.ones(len(use)))
        dev = np.linalg.norm(a @ _rz(yaw).T + tr - g, axis=1)
        pos = np.array([keyframes[i].t for i in idx])
        length = float(np.linalg.norm(np.diff(pos, axis=0), axis=1).sum())
        out[seg] = (float(dev.max()), length)
    return out


def _robust(params: RegistrationParams):
    kind, k = params.between_robust, params.between_robust_k
    if kind == "cauchy":
        return gtsam.noiseModel.mEstimator.Cauchy.Create(k)
    if kind == "huber":
        return gtsam.noiseModel.mEstimator.Huber.Create(k)
    if kind == "none":
        return None
    raise ValueError(f"between_robust: {kind!r} (cauchy, huber or none)")


def fuse(
    keyframes: list[Keyframe],
    trajectory: Trajectory,
    frame: LocalFrame,
    params: RegistrationParams,
    origin_height_m: float | None = None,
) -> FusionResult:
    lever = np.asarray(params.lever_arm_m, dtype=np.float64)
    samples = sample_gnss(
        [k.gps_time_ns for k in keyframes], trajectory, frame, params, origin_height_m
    )
    graph = gtsam.NonlinearFactorGraph()
    initial = gtsam.Values()
    huber = gtsam.noiseModel.mEstimator.Huber.Create(params.gnss_huber_k)
    between_kernel = _robust(params)
    # (i, j, measured relative pose, sigmas rot rot rot trans trans trans)
    betweens: list[tuple[int, int, gtsam.Pose3, np.ndarray]] = []
    level = math.radians(params.level_prior_sigma_deg)
    prior_noise = gtsam.noiseModel.Diagonal.Sigmas(np.array([level, level, 10.0, 1e3, 1e3, 1e3]))
    placed: list[int] = []
    dropped: list[int] = []
    gnss_keys: list[int] = []
    for seg, idx in _by_segment(keyframes).items():
        matched = [i for i in idx if samples[i] is not None]
        if len(matched) < 2:
            dropped.append(seg)
            continue
        g = np.array([samples[i].pos for i in matched])
        if np.linalg.norm(g - g[0], axis=1).max() < MIN_BASELINE_M:
            dropped.append(seg)
            continue
        a = _antenna_odom(keyframes, matched, lever)
        wts = np.array([1.0 / float(samples[i].sigma[:2].mean()) ** 2 for i in matched])
        yaw, tr = _align_yaw(a, g, wts)
        rz = _rz(yaw)
        for i in idx:
            k = keyframes[i]
            r = rz @ quat_to_rot(k.q)
            initial.insert(i, gtsam.Pose3(gtsam.Rot3(r), gtsam.Point3(*(rz @ k.t + tr))))
        graph.add(gtsam.PriorFactorPose3(idx[0], initial.atPose3(idx[0]), prior_noise))
        for i, j in zip(idx[:-1], idx[1:], strict=True):
            ki, kj = keyframes[i], keyframes[j]
            pi = gtsam.Pose3(gtsam.Rot3(quat_to_rot(ki.q)), gtsam.Point3(*ki.t))
            pj = gtsam.Pose3(gtsam.Rot3(quat_to_rot(kj.q)), gtsam.Point3(*kj.t))
            dist = float(np.linalg.norm(kj.t - ki.t))
            st = max(params.between_sigma_m_per_m * dist, params.between_sigma_min_m)
            sr = math.radians(
                max(params.between_sigma_deg_per_m * dist, params.between_sigma_min_deg)
            )
            sigmas = np.array([sr, sr, sr, st, st, st])
            noise = gtsam.noiseModel.Diagonal.Sigmas(sigmas)
            if between_kernel is not None:
                noise = gtsam.noiseModel.Robust.Create(between_kernel, noise)
            rel = pi.between(pj)
            graph.add(gtsam.BetweenFactorPose3(i, j, rel, noise))
            betweens.append((i, j, rel, sigmas))
        for i in matched:
            s = samples[i]
            noise = gtsam.noiseModel.Robust.Create(
                huber, gtsam.noiseModel.Diagonal.Sigmas(np.asarray(s.sigma, dtype=np.float64))
            )
            graph.add(gtsam.GPSFactorArm(i, gtsam.Point3(*s.pos), gtsam.Point3(*lever), noise))
            gnss_keys.append(i)
        placed += idx
    poses: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}
    residuals: list[tuple[int, str, float]] = []
    outliers = 0
    if placed:
        lm = gtsam.LevenbergMarquardtParams()
        lm.setMaxIterations(100)
        lm.setRelativeErrorTol(1e-9)
        lm.setAbsoluteErrorTol(1e-12)
        values = gtsam.LevenbergMarquardtOptimizer(graph, initial, lm).optimize()
        for i in placed:
            p = values.atPose3(i)
            k = keyframes[i]
            poses[(k.segment, k.index)] = (
                np.asarray(p.translation(), dtype=np.float64),
                rot_to_quat(p.rotation().matrix()),
            )
        for i in gnss_keys:
            p = values.atPose3(i)
            ant = np.asarray(p.translation()) + p.rotation().matrix() @ lever
            s = samples[i]
            residuals.append(
                (keyframes[i].gps_time_ns, s.quality, float(np.linalg.norm(ant - s.pos)))
            )
        for i, j, rel, sigmas in betweens:
            fused = values.atPose3(i).between(values.atPose3(j))
            err = np.asarray(rel.localCoordinates(fused)) / sigmas
            outliers += int(np.linalg.norm(err) > params.between_outlier_sigma)
    return FusionResult(
        poses_enu=poses,
        residuals=residuals,
        used_gnss=len(gnss_keys),
        dropped_segments=dropped,
        between_outliers=outliers,
    )
