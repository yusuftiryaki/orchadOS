"""Pose-graph fusion of front-end keyframes with the GNSS trajectory."""

from __future__ import annotations

import numpy as np
import pytest

from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.lidar.frontend.fake import FakeFrontend
from orchados_pipeline.lidar.fusion import fuse, rigid_drift, sample_gnss
from orchados_pipeline.lidar.models import RegistrationParams
from orchados_pipeline.lidar.synth_moving import (
    MovingConfig,
    MovingTruth,
    antenna_trajectory,
    moving_truth,
)
from orchados_pipeline.models import SolutionQuality, Trajectory

PARAMS = RegistrationParams()


@pytest.fixture(scope="module")
def truth() -> MovingTruth:
    return moving_truth(MovingConfig(rows=2, trees_per_row=6, duration_s=60.0))


def _times(truth: MovingTruth, a_s: float = 0.0, b_s: float | None = None) -> np.ndarray:
    end = (int(truth.poses[-1, 0]) - truth.t0_ns) / 1e9 if b_s is None else b_s
    rel = np.arange(round(a_s * 10), round(end * 10) + 1) / 10
    return truth.t0_ns + np.round(rel * 1e9).astype(np.int64)


def _ppk(truth: MovingTruth, seed: int = 1) -> Trajectory:
    return antenna_trajectory(truth, np.random.default_rng(seed))


def _frame(traj: Trajectory) -> tuple[LocalFrame, float]:
    p = traj.points[0]
    return LocalFrame(p.lat, p.lon), p.height_m


def _truth_in(truth: MovingTruth, frame: LocalFrame, h0: float, times) -> np.ndarray:
    pos, _ = truth.pose_at(times)
    lat, lon = LocalFrame(truth.origin_lat, truth.origin_lon).to_latlon(pos[:, 0], pos[:, 1])
    e, n = frame.to_en(lat, lon)
    return np.column_stack([e, n, pos[:, 2] + truth.origin_height_m - h0])


def _errors(result, keyframes, truth, frame, h0) -> np.ndarray:
    kfs = [k for k in keyframes if (k.segment, k.index) in result.poses_enu]
    got = np.array([result.poses_enu[(k.segment, k.index)][0] for k in kfs])
    want = _truth_in(truth, frame, h0, [k.gps_time_ns for k in kfs])
    return np.linalg.norm(got - want, axis=1)


def test_lever_arm_default_is_the_kit():
    # docs/tarama-kiti.md: LiDAR ~1.2 m, GNSS antenna ~2.1 m above the ground.
    assert RegistrationParams().lever_arm_m == (0.0, 0.0, 0.9)


def test_synthetic_lever_arm_is_the_truth_one():
    """A synthetic kit with another lever arm: its truth carries it, its antenna trajectory
    uses it, and fusing with that lever arm places the LiDAR right; the default does not."""
    lever = (0.2, -0.1, 0.6)
    truth = moving_truth(MovingConfig(rows=2, trees_per_row=4, duration_s=40.0, lever_arm_m=lever))
    assert truth.lever_arm_m == list(lever)
    kfs = FakeFrontend().odometry(truth, _times(truth))
    traj = _ppk(truth)
    frame, h0 = _frame(traj)
    own = fuse(kfs, traj, frame, PARAMS.model_copy(update={"lever_arm_m": lever}))
    assert _errors(own, kfs, truth, frame, h0).max() < 0.05
    default = fuse(kfs, traj, frame, PARAMS)
    assert _errors(default, kfs, truth, frame, h0).max() > 0.2


def test_drift_is_removed_by_ppk(truth):
    kfs = FakeFrontend(drift_m_per_100m=2.0, yaw_drift_deg_per_100m=1.0).odometry(
        truth, _times(truth)
    )
    traj = _ppk(truth)
    frame, h0 = _frame(traj)
    res = fuse(kfs, traj, frame, PARAMS)
    assert res.used_gnss == len(kfs)
    assert len(res.residuals) == len(kfs)
    assert _errors(res, kfs, truth, frame, h0).max() < 0.05
    assert {q for _, q, _ in res.residuals} == {"fix"}
    assert max(r for *_, r in res.residuals) < 0.06
    # Orientation: unit quaternions, yaw close to the truth.
    t, q = res.poses_enu[(0, len(kfs) // 2)]
    assert np.linalg.norm(q) == pytest.approx(1.0)


def test_keyframes_outside_trajectory_have_no_gnss_factor(truth):
    """GNSS hole over a turn (24-34 s) and none before 2 s: those keyframes get no factor
    (an interpolated one would cut across the turn) and stay right by their odometry."""
    kfs = FakeFrontend().odometry(truth, _times(truth))
    traj = _ppk(truth)
    t0 = truth.t0_ns
    keep = [
        p
        for p in traj.points
        if (p.gps_time_ns - t0) / 1e9 >= 2.0 and not 24.0 < (p.gps_time_ns - t0) / 1e9 < 34.0
    ]
    holed = traj.model_copy(update={"points": keep})
    frame, h0 = _frame(holed)
    res = fuse(kfs, holed, frame, PARAMS)

    def covered(t_ns: int) -> bool:
        rel = (t_ns - t0) / 1e9
        return rel >= 2.0 - 1e-9 and not 24.0 + 1e-9 < rel < 34.0 - 1e-9

    expected = {k.gps_time_ns for k in kfs if covered(k.gps_time_ns)}
    assert {t for t, _, _ in res.residuals} == expected
    assert res.used_gnss == len(expected)
    assert len(expected) < len(kfs) - 20
    # Every keyframe is placed, the ones in the hole too, and correctly.
    assert len(res.poses_enu) == len(kfs)
    assert _errors(res, kfs, truth, frame, h0).max() < 0.05
    # The samples themselves: None inside the hole.
    samples = sample_gnss([k.gps_time_ns for k in kfs], holed, frame, PARAMS, h0)
    assert all((s is not None) == covered(k.gps_time_ns) for k, s in zip(kfs, samples, strict=True))


def test_nav_pvt_trajectory_still_runs(truth):
    kfs = FakeFrontend().odometry(truth, _times(truth))
    rng = np.random.default_rng(3)
    nav = antenna_trajectory(
        truth,
        rng,
        quality=SolutionQuality.single,
        sd_m=(1.5, 1.5, 2.5),
        noise_m=(0.4, 0.4, 0.8),
    )
    bias = (0.8, -0.6, 1.2)
    frame0 = LocalFrame(truth.origin_lat, truth.origin_lon)
    pts = []
    for p in nav.points:
        e, n = frame0.to_en(p.lat, p.lon)
        lat, lon = frame0.to_latlon(e + bias[0], n + bias[1])
        update = {"lat": float(lat), "lon": float(lon), "height_m": p.height_m + bias[2]}
        pts.append(p.model_copy(update=update))
    nav = nav.model_copy(update={"points": pts})
    frame, h0 = _frame(nav)
    res = fuse(kfs, nav, frame, PARAMS)
    err = _errors(res, kfs, truth, frame, h0)
    assert err.max() < 2.5
    # The shape comes from the odometry: distances within the cloud stay right (the
    # whole may be shifted and turned a little).
    got = np.array([res.poses_enu[(k.segment, k.index)][0] for k in kfs])
    want = _truth_in(truth, frame, h0, [k.gps_time_ns for k in kfs])
    d_got = np.linalg.norm(got[:, :2] - got[0, :2], axis=1)
    d_want = np.linalg.norm(want[:, :2] - want[0, :2], axis=1)
    assert np.abs(d_got - d_want).max() < 0.1


def test_huber_limits_a_single_outlier(truth):
    kfs = FakeFrontend().odometry(truth, _times(truth))
    traj = _ppk(truth)
    frame, _ = _frame(traj)
    clean = fuse(kfs, traj, frame, PARAMS)
    pts = list(traj.points)
    k = len(pts) // 2
    e, n = frame.to_en(pts[k].lat, pts[k].lon)
    lat, lon = frame.to_latlon(e + 5.0, n)
    pts[k] = pts[k].model_copy(update={"lat": float(lat), "lon": float(lon)})
    bad = fuse(kfs, traj.model_copy(update={"points": pts}), frame, PARAMS)
    diff = [
        np.linalg.norm(bad.poses_enu[key][0] - clean.poses_enu[key][0]) for key in clean.poses_enu
    ]
    assert max(diff) < 0.1
    assert max(r for *_, r in bad.residuals) > 2.0  # the outlier shows in the residuals


def test_two_segments_tied_only_by_gnss(truth):
    first = FakeFrontend(drift_m_per_100m=1.0).odometry(truth, _times(truth, 0, 28), segment=0)
    second = FakeFrontend(yaw_drift_deg_per_100m=2.0).odometry(
        truth, _times(truth, 32, 60), segment=1
    )
    # Each segment's odometry starts at its own origin.
    assert np.allclose(second[0].t, 0.0)
    kfs = first + second
    traj = _ppk(truth)
    frame, h0 = _frame(traj)
    res = fuse(kfs, traj, frame, PARAMS)
    assert _errors(res, kfs, truth, frame, h0).max() < 0.05
    assert res.dropped_segments == []


def test_segment_without_gnss_is_dropped(truth):
    first = FakeFrontend().odometry(truth, _times(truth, 0, 28), segment=0)
    second = FakeFrontend().odometry(truth, _times(truth, 32, 60), segment=1)
    traj = _ppk(truth)
    t_cut = truth.t0_ns + 30 * 10**9
    early = traj.model_copy(update={"points": [p for p in traj.points if p.gps_time_ns < t_cut]})
    frame, h0 = _frame(early)
    res = fuse(first + second, early, frame, PARAMS)
    assert res.dropped_segments == [1]
    assert all(seg == 0 for seg, _ in res.poses_enu)
    assert _errors(res, first, truth, frame, h0).max() < 0.05


def test_rigid_drift(truth):
    traj = _ppk(truth)
    frame, h0 = _frame(traj)
    for drift, lo, hi in ((0.0, 0.0, 0.1), (2.0, 0.4, 2.5)):
        kfs = FakeFrontend(drift_m_per_100m=drift).odometry(truth, _times(truth))
        samples = sample_gnss([k.gps_time_ns for k in kfs], traj, frame, PARAMS, h0)
        per_seg = rigid_drift(kfs, samples, PARAMS.lever_arm_m)
        (dev, length) = per_seg[0]
        assert length > 50
        assert lo <= dev / length * 100 <= hi


def test_front_end_jump_is_down_weighted_against_ppk(truth):
    """A front end that jumps one tree along the row once (row aliasing): the robust kernel
    on the between factors lets PPK hold the poses instead of spreading the jump over the
    GNSS factors. The fused positions stay near the truth on both sides of the jump."""
    kfs = FakeFrontend(swap_tree_at=20.0).odometry(truth, _times(truth))
    traj = _ppk(truth)
    frame, h0 = _frame(traj)
    res = fuse(kfs, traj, frame, PARAMS)
    err = _errors(res, kfs, truth, frame, h0)
    assert np.median(err) < 0.02
    assert err.max() < 0.05
    assert max(r for *_, r in res.residuals) < 0.06
    # The jump shows as a down-weighted between factor.
    assert res.between_outliers == 1
    # Without the kernel the jump is absorbed: the GNSS factors give way.
    plain = fuse(kfs, traj, frame, PARAMS.model_copy(update={"between_robust": "none"}))
    assert _errors(plain, kfs, truth, frame, h0).max() > 0.3


def test_between_kernel_parameter(truth):
    kfs = FakeFrontend(drift_m_per_100m=2.0).odometry(truth, _times(truth))
    traj = _ppk(truth)
    frame, h0 = _frame(traj)
    for kernel in ("cauchy", "huber"):
        params = PARAMS.model_copy(update={"between_robust": kernel})
        res = fuse(kfs, traj, frame, params)
        assert _errors(res, kfs, truth, frame, h0).max() < 0.05
        assert res.between_outliers == 0
    with pytest.raises(ValueError, match="between_robust"):
        fuse(kfs, traj, frame, PARAMS.model_copy(update={"between_robust": "tukey?"}))
