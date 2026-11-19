"""Front-end interface (orchados.lio_frontend/1 files) and the fake front end."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from orchados_pipeline.lidar.frontend import (
    FrontendResult,
    Keyframe,
    get_frontend,
    load_scan,
    read_frontend_output,
    write_frontend_output,
    write_scan,
)
from orchados_pipeline.lidar.frontend.fake import FakeFrontend
from orchados_pipeline.lidar.models import RegistrationParams
from orchados_pipeline.lidar.rawlog import plan_segments
from orchados_pipeline.lidar.synth_moving import MovingConfig, make_moving_session


def _quat_yaw(q) -> float:
    return 2 * math.atan2(q[2], q[3])


@pytest.fixture(scope="module")
def session(tmp_path_factory):
    dest = tmp_path_factory.mktemp("fe") / "s"
    cfg = MovingConfig(rows=1, trees_per_row=3, duration_s=24.0, points_per_s=3000, ppk=False)
    truth = make_moving_session(dest, cfg)
    return dest, truth, plan_segments(dest, RegistrationParams())


def test_write_read_round_trip(tmp_path):
    rng = np.random.default_rng(0)
    xyz = rng.normal(size=(50, 3)).astype(np.float32)
    inten = rng.uniform(0, 100, 50).astype(np.float32)
    scan = write_scan(tmp_path, 0, 3, xyz, inten)
    assert scan == tmp_path / "frontend/scans/0_3.npz"
    kf = Keyframe(
        segment=0,
        index=3,
        gps_time_ns=1_444_550_418_123_456_789,
        t=np.array([1.25, -2.5, 0.125]),
        q=np.array([0.0, 0.0, math.sin(0.3), math.cos(0.3)]),
        scan=scan,
    )
    res = FrontendResult(
        method="fake",
        method_version="1",
        config_hash="abc",
        segments=[
            {
                "index": 0,
                "start_gps_ns": 1,
                "end_gps_ns": 2,
                "keyframe_count": 1,
                "status": "ok",
                "message": "",
            }
        ],
        keyframes=[kf],
        imu_rate_hz=250.0,
        points_total=50,
    )
    write_frontend_output(tmp_path, res)
    body = json.loads((tmp_path / "frontend/frontend.json").read_text())
    assert body["schema"] == "orchados.lio_frontend/1"
    header = (tmp_path / "frontend/keyframes.csv").read_text().splitlines()[0]
    assert header == "segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw,scan"
    back = read_frontend_output(tmp_path)
    assert (back.method, back.method_version, back.config_hash) == ("fake", "1", "abc")
    assert back.segments == res.segments
    assert back.imu_rate_hz == 250.0 and back.points_total == 50
    (k,) = back.keyframes
    assert (k.segment, k.index, k.gps_time_ns) == (0, 3, kf.gps_time_ns)
    np.testing.assert_array_equal(k.t, kf.t)
    np.testing.assert_array_equal(k.q, kf.q)
    assert k.scan == scan
    x2, i2 = load_scan(k.scan)
    np.testing.assert_array_equal(x2, xyz)
    np.testing.assert_array_equal(i2, inten)


def test_get_frontend():
    assert isinstance(get_frontend("fake"), FakeFrontend)
    with pytest.raises(ValueError, match="unknown"):
        get_frontend("glim2")
    pl = get_frontend("point_lio")
    assert pl.method == "point_lio"


def test_fake_zero_drift_reproduces_truth(session, tmp_path):
    dest, truth, segs = session
    res = FakeFrontend().run(dest, segs, tmp_path)
    assert res.method == "fake"
    assert [s["status"] for s in res.segments] == ["ok"]
    kfs = res.keyframes
    assert len(kfs) > 24 * 1.5 / 0.5 * 0.8
    pos, rot = truth.pose_at([k.gps_time_ns for k in kfs])
    yaw = np.arctan2(rot[:, 1, 0], rot[:, 0, 0])
    c, s = math.cos(yaw[0]), math.sin(yaw[0])
    r0t = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    for k, p, y in zip(kfs, pos, yaw, strict=True):
        np.testing.assert_allclose(k.t, r0t @ (p - pos[0]), atol=1e-6)
        dyaw = math.remainder(_quat_yaw(k.q) - (y - yaw[0]), 2 * math.pi)
        assert abs(dyaw) < 1e-6
    # Keyframe spacing: 0.5 m, 10 deg or 1 s, whichever first.
    steps = np.linalg.norm(np.diff(pos, axis=0), axis=1)
    dts = np.diff([k.gps_time_ns for k in kfs]) / 1e9
    assert np.all((steps < 0.5 + 0.2) | (dts <= 1.0 + 1e-9))
    # Scans are in the keyframe's body frame, deskewed: moved by the true pose they
    # land on the ground or near a tree.
    trunks = np.array([[e, n] for _, e, n in truth.trees])
    shares = []
    for k, p, r in list(zip(kfs, pos, rot, strict=True))[::7]:
        xyz, _ = load_scan(k.scan)
        w = p + xyz.astype(np.float64) @ r.T
        near_tree = np.min(np.linalg.norm(w[:, None, :2] - trunks[None], axis=2), axis=1) < 2.2
        ground = np.abs(w[:, 2]) < 0.04
        near_kit = np.linalg.norm(xyz, axis=1) < 0.7
        shares.append(np.mean(ground | near_tree | near_kit))
    assert min(shares) > 0.99
    # Round trip through the files gives the same result.
    back = read_frontend_output(tmp_path)
    assert len(back.keyframes) == len(kfs)
    np.testing.assert_allclose(back.keyframes[-1].t, kfs[-1].t)


def test_fake_drift(session, tmp_path):
    dest, truth, segs = session
    res = FakeFrontend(drift_m_per_100m=2.0).run(dest, segs, tmp_path)
    kfs = res.keyframes
    pos, _ = truth.pose_at([k.gps_time_ns for k in kfs])
    path = np.linalg.norm(np.diff(pos, axis=0), axis=1).sum()
    ref = FakeFrontend().run(dest, segs, tmp_path / "ref").keyframes
    err = np.linalg.norm(kfs[-1].t - ref[-1].t)
    assert err == pytest.approx(0.02 * path, rel=0.05)


def test_fake_skips_segments_with_a_reason(session, tmp_path):
    dest, _, segs = session
    skipped = [type(segs[0])(**{**segs[0].__dict__, "skip_reason": "too_short"})]
    res = FakeFrontend().run(dest, skipped, tmp_path)
    assert res.keyframes == [] and res.segments == []


def test_scan_paths_are_relative_in_csv(session, tmp_path):
    dest, _, segs = session
    FakeFrontend().run(dest, segs, tmp_path)
    rows = (tmp_path / "frontend/keyframes.csv").read_text().splitlines()[1:]
    assert all("/" not in r.split(",")[-1] for r in rows)
    assert all((tmp_path / "frontend/scans" / r.split(",")[-1]).is_file() for r in rows)


def test_keyframe_dataclass_shapes():
    k = Keyframe(0, 0, 0, np.zeros(3), np.array([0, 0, 0, 1.0]), Path("x.npz"))
    assert k.t.shape == (3,) and k.q.shape == (4,)
