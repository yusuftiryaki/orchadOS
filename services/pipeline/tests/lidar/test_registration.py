"""lidar register: cloud, quality metrics and verdict on synthetic moving scans."""

from __future__ import annotations

import hashlib
import json
import re

import numpy as np
import pytest

from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.lidar.cloud import (
    CloudError,
    load_session_cloud,
    read_ply,
    resolve_cloud,
    write_session_cloud,
)
from orchados_pipeline.lidar.frontend.fake import FakeFrontend
from orchados_pipeline.lidar.models import CloudMeta, RegistrationParams, RegistrationReport
from orchados_pipeline.lidar.registration import (
    NoLidarData,
    decide,
    read_poses,
    run,
    self_mask,
    trunk_candidates,
)
from orchados_pipeline.lidar.synth_moving import MovingConfig, make_moving_session
from orchados_pipeline.models import read_model

from .conftest import link_session

PARAMS = RegistrationParams()


def _truth_trunks_in_cloud(truth, meta: CloudMeta) -> np.ndarray:
    lat, lon = LocalFrame(truth.origin_lat, truth.origin_lon).to_latlon(
        np.array([e for _, e, _ in truth.trees]), np.array([n for _, _, n in truth.trees])
    )
    e, n = LocalFrame(meta.origin_lat, meta.origin_lon).to_en(lat, lon)
    return np.column_stack([e, n])


def _files(folder) -> dict[str, str]:
    return {
        p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(folder.rglob("*"))
        if p.is_file()
    }


# --- the good scan -------------------------------------------------------------------


def test_good_scan_is_accepted(good_registration):
    session, _, folder, report = good_registration
    assert report.verdict == "accepted_auto", report.reasons
    assert report.metrics["gnss_fix_fraction"] > 0.9
    assert report.reasons == []
    m = report.metrics
    assert m["gnss_residual_p95_m"] < 0.05
    assert m["trees_checked"] >= 10
    assert m["trunk_spread_p95_m"] < 0.05
    assert m["lio_coverage"] > 0.95
    assert m["lio_drift_m_per_100m"] < 0.2
    assert m["gaps_s_total"] == 0
    assert report.ppk_status == "ppk"
    assert report.method == "fake+gtsam_ppk"
    assert [s.status for s in report.segments] == ["ok"]
    # Folder: <method>-<method_version>-<params_hash[:8]>-<run_id[:8]>
    assert folder.name == (
        f"{report.method}-{report.method_version}-{report.params_hash[:8]}-{report.run_id[:8]}"
    )
    for name in ("cloud.ply", "cloud.json", "registration.json", "poses.csv", "params.json"):
        assert (folder / name).is_file(), name
    assert (folder / "frontend" / "frontend.json").is_file()
    assert (folder / "frontend" / "keyframes.csv").is_file()
    # The front end's scans are work files (GBs per session): gone after the registration.
    assert not (folder / "frontend" / "scans").exists()
    assert not [p for p in folder.parent.iterdir() if p.name.startswith(".work-")]
    back = read_model(RegistrationReport, folder / "registration.json")
    assert back.run_id == report.run_id
    body = json.loads((folder / "registration.json").read_text())
    assert body["schema"] == "orchados.lidar_registration/1"
    assert set(body["thresholds"]) >= {"accept_gnss_p95_m", "reject_trunk_spread_m"}


def test_cloud_trunks_match_the_true_trees(good_registration):
    session, truth, folder, _ = good_registration
    assert resolve_cloud(session) == folder  # no lidar/cloud.ply in the session itself
    cloud = load_session_cloud(session)
    cands = trunk_candidates(cloud.points, PARAMS)
    want = _truth_trunks_in_cloud(truth, cloud.meta)
    d = np.linalg.norm(want[:, None] - cands[None], axis=2).min(1)
    assert np.sum(d < 0.05) >= len(want) - 2, np.round(d, 3)


def test_cloud_json_contract(good_registration):
    session, truth, folder, report = good_registration
    meta = CloudMeta.model_validate(json.loads((folder / "cloud.json").read_text()))
    traj = json.loads(
        (session.parent / f"{session.name}.processed/synthetic-ppk/trajectory.json").read_text()
    )
    first = min(traj["points"], key=lambda p: p["gps_time_ns"])
    assert (meta.origin_lat, meta.origin_lon) == (first["lat"], first["lon"])
    assert meta.origin_height_m == first["height_m"]
    assert meta.session_id == report.session_id and meta.parcel_id == report.parcel_id
    assert meta.registration_method == "fake+gtsam_ppk"
    assert meta.registration_version == report.method_version
    p95 = report.metrics["gnss_residual_p95_m"]
    assert meta.point_sigma_m == pytest.approx(np.hypot(p95, 0.02), abs=1e-3)
    assert meta.sensor == "unitree_l2"
    assert truth.t0_ns <= meta.gps_time_start_ns < meta.gps_time_end_ns <= truth.poses[-1, 0]
    pts, inten = read_ply(folder / "cloud.ply")
    assert len(pts) == report.metrics["points"] and inten is not None


def test_self_mask_removes_the_kit(good_registration):
    _, _, folder, _ = good_registration
    poses = read_poses(folder / "poses.csv")
    cloud, _ = read_ply(folder / "cloud.ply")
    cloud = cloud[np.argsort(cloud[:, 0])]
    near = 0
    for p in poses[:, 3:6]:
        lo, hi = np.searchsorted(cloud[:, 0], [p[0] - 0.7, p[0] + 0.7])
        near += int(np.sum(np.linalg.norm(cloud[lo:hi] - p, axis=1) < 0.7))
    assert near == 0
    # The mask itself: close points and the mast cone go, the rest stays.
    xyz = np.array([[0.2, 0, 0], [0, 0, 0.5], [0.05, 0, 2.5], [5, 0, 0.5], [0, 0, 4.0]])
    assert self_mask(xyz, PARAMS).tolist() == [False, False, False, True, True]


# --- other scans ---------------------------------------------------------------------


def test_without_ppk_never_accepted(small_nav, tmp_path):
    src, _ = small_nav
    session = link_session(src, tmp_path / "s")
    _, report = run(session, frontend=FakeFrontend())
    assert report.ppk_status == "no_ppk"
    assert report.method == "fake+gtsam_navpvt"
    assert report.verdict == "review"
    assert "no_ppk" in report.reasons
    assert report.trajectory == "gnss/gnss.ubx"


def test_double_trunk_is_caught(small_nav, tmp_path):
    """A front end that jumps one tree along the row (row similarity), without PPK. The
    robust between factor lets NAV-PVT hold most of it; the session is still only review.
    A jump the fusion does not undo (no kernel here) shows as trunks seen twice that do
    not line up: the trunk check is the safety net."""
    src, _ = small_nav
    session = link_session(src, tmp_path / "s")
    fe = FakeFrontend(swap_tree_at=30.0)
    _, report = run(session, frontend=fe)
    assert report.verdict == "review"
    assert "no_ppk" in report.reasons
    assert report.metrics["frontend_jumps"] == 1
    plain = PARAMS.model_copy(update={"between_robust": "none"})
    _, report = run(session, params=plain, frontend=fe)
    assert report.verdict in ("review", "rejected_auto")
    assert "trunk_spread_high" in report.reasons


def test_front_end_jump_with_ppk_is_held(good_session, tmp_path):
    """The same one-tree jump with PPK: the robust between factor lets GNSS hold the poses,
    trunks line up, the jump is counted in the metrics."""
    src, _ = good_session
    session = link_session(src, tmp_path / "s")
    _, report = run(session, frontend=FakeFrontend(swap_tree_at=30.0))
    m = report.metrics
    assert m["frontend_jumps"] == 1
    assert m["trunk_spread_p95_m"] < 0.05
    assert m["gnss_residual_p95_m"] < 0.05
    assert report.verdict == "accepted_auto", report.reasons


def test_drift_through_a_gnss_hole_is_not_accepted(good_session, tmp_path):
    src, truth = good_session
    t0 = truth.t0_ns

    def outside_hole(p):
        return not 10e9 < p["gps_time_ns"] - t0 < 40e9

    session = link_session(src, tmp_path / "s", ppk_points=outside_hole)
    fe = FakeFrontend(drift_m_per_100m=8.0, yaw_drift_deg_per_100m=5.0)
    _, report = run(session, frontend=fe)
    assert report.verdict != "accepted_auto"
    assert set(report.reasons) & {"trunk_spread_high", "gnss_residual_high", "few_trees_checked"}
    assert report.metrics["lio_drift_m_per_100m"] > 2.0
    assert report.metrics["gnss_factors"] < report.metrics["keyframes"]


def test_keep_frontend_scans(small_ppk, tmp_path):
    src, _ = small_ppk
    session = link_session(src, tmp_path / "s")
    folder, report = run(session, frontend=FakeFrontend(), keep_frontend_scans=True)
    scans = sorted((folder / "frontend" / "scans").glob("*.npz"))
    assert len(scans) == report.metrics["keyframes"]


def test_register_twice_new_run(small_ppk, tmp_path):
    src, _ = small_ppk
    session = link_session(src, tmp_path / "s")
    out = tmp_path / "out"
    first, r1 = run(session, out_root=out, frontend=FakeFrontend())
    before = _files(first)
    second, r2 = run(session, out_root=out, frontend=FakeFrontend())
    assert first != second and r1.run_id != r2.run_id
    assert first.name.rsplit("-", 1)[0] == second.name.rsplit("-", 1)[0]
    assert _files(first) == before  # the earlier run is untouched
    assert sorted(p.name for p in out.iterdir()) == sorted([first.name, second.name])
    assert re.fullmatch(r"[0-9a-f]{8}", second.name.rsplit("-", 1)[1])


def test_unlocked_clock_and_missing_recording(small_ppk, tmp_path):
    src, _ = small_ppk
    rec = json.loads((src / "lidar/raw/recording.json").read_text())
    unlocked = link_session(
        src, tmp_path / "u", recording={**rec, "clock_state_at_start": "coarse"}
    )
    _, report = run(unlocked, frontend=FakeFrontend())
    assert report.verdict == "review" and "clock_unlocked" in report.reasons
    missing = link_session(src, tmp_path / "m", recording=False)
    _, report = run(missing, frontend=FakeFrontend())
    assert report.verdict == "review" and "no_recording_json" in report.reasons
    assert report.metrics["segments_placed"] == 1  # segments from the MCAP alone


def test_restamped_segment(tmp_path):
    session = tmp_path / "late"
    cfg = MovingConfig(
        rows=1, trees_per_row=3, duration_s=25.0, points_per_s=2000, stamp_offset_s=0.2
    )
    make_moving_session(session, cfg)
    folder, report = run(session, frontend=FakeFrontend())
    assert report.segments[0].restamped and report.segments[0].status == "ok"
    assert "restamped" in report.reasons
    assert not (folder / "restamped").exists()
    assert not list(folder.rglob("*.mcap"))


def test_low_imu_rate_is_rejected(tmp_path):
    session = tmp_path / "imu"
    cfg = MovingConfig(rows=1, trees_per_row=3, duration_s=22.0, points_per_s=1500, imu_hz=100.0)
    make_moving_session(session, cfg)
    folder, report = run(session, frontend=FakeFrontend())
    assert report.verdict == "rejected_auto"
    assert {"no_segments", "imu_rate_low"} <= set(report.reasons)
    assert [s.status for s in report.segments] == ["skipped"]
    assert not (folder / "cloud.ply").exists()
    with pytest.raises(CloudError):
        resolve_cloud(session)


def test_no_lidar_data(tmp_path):
    (tmp_path / "s").mkdir()
    with pytest.raises(NoLidarData):
        run(tmp_path / "s", frontend=FakeFrontend())


# --- verdict rules -------------------------------------------------------------------

GOOD_METRICS = {
    "segments_run": 1,
    "lio_coverage": 0.99,
    "gnss_residual_p95_m": 0.03,
    "trunk_spread_p95_m": 0.05,
    "trees_checked": 12,
    "clock_state": "pps",
    "recording_json": True,
    "gnss_fix_fraction": 0.95,
}


@pytest.mark.parametrize(
    ("change", "ppk", "verdict", "reason"),
    [
        ({}, True, "accepted_auto", None),
        ({}, False, "review", "no_ppk"),
        ({"segments_run": 0, "lio_coverage": 0.0}, True, "rejected_auto", "no_segments"),
        ({"lio_coverage": 0.4}, True, "rejected_auto", "low_coverage"),
        ({"lio_coverage": 0.8}, True, "review", "low_coverage"),
        ({"gnss_residual_p95_m": 1.5}, True, "rejected_auto", "gnss_residual_high"),
        ({"gnss_residual_p95_m": 1.5}, False, "review", "gnss_residual_high"),
        ({"gnss_residual_p95_m": 0.3}, True, "review", "gnss_residual_high"),
        ({"gnss_residual_p95_m": None}, True, "rejected_auto", "no_gnss"),
        ({"trunk_spread_p95_m": 0.6}, True, "rejected_auto", "trunk_spread_high"),
        ({"trunk_spread_p95_m": 0.3}, True, "review", "trunk_spread_high"),
        ({"trees_checked": 9}, True, "review", "few_trees_checked"),
        ({"trunk_spread_p95_m": None, "trees_checked": 0}, True, "review", "few_trees_checked"),
        ({"clock_state": "coarse"}, True, "review", "clock_unlocked"),
        ({"recording_json": False, "clock_state": None}, True, "review", "no_recording_json"),
        ({"restamped_segments": 1}, True, "accepted_auto", "restamped"),
        ({"imu_rate_low_segments": 1}, True, "accepted_auto", "imu_rate_low"),
        # PPK, but the residual check runs over a handful of fix epochs only.
        ({"gnss_fix_fraction": 0.3}, True, "review", "few_fixes"),
        ({"gnss_fix_fraction": None}, True, "review", "few_fixes"),
        ({"gnss_fix_fraction": 0.5}, True, "accepted_auto", None),
    ],
)
def test_decide(change, ppk, verdict, reason):
    got, reasons = decide({**GOOD_METRICS, **change}, ppk, PARAMS)
    assert got == verdict
    if reason is None:
        assert reasons == []
    else:
        assert reason in reasons


def test_thresholds_are_parameters():
    p = RegistrationParams.model_validate({"thresholds": {"accept_min_trees": 5}})
    assert decide({**GOOD_METRICS, "trees_checked": 6}, True, p)[0] == "accepted_auto"
    assert p.params_hash() != PARAMS.params_hash()
    p = RegistrationParams.model_validate({"thresholds": {"min_fix_fraction": 0.2}})
    assert decide({**GOOD_METRICS, "gnss_fix_fraction": 0.3}, True, p)[0] == "accepted_auto"


def test_few_fixes_only_with_ppk():
    """NAV-PVT has no fix epochs: no_ppk already holds it, few_fixes would only repeat it."""
    _, reasons = decide({**GOOD_METRICS, "gnss_fix_fraction": 0.0}, False, PARAMS)
    assert "few_fixes" not in reasons and "no_ppk" in reasons


# --- finding the cloud ---------------------------------------------------------------


def _fake_run(root, name, verdict, created, cloud=True):
    d = root / name
    d.mkdir(parents=True)
    body = {"schema": "orchados.lidar_registration/1", "verdict": verdict, "created_utc": created}
    (d / "registration.json").write_text(json.dumps(body))
    if cloud:
        meta = CloudMeta(
            session_id="s",
            parcel_id="p",
            origin_lat=37.0,
            origin_lon=37.0,
            origin_height_m=850.0,
            registration_method="fake+gtsam_ppk",
            registration_version=name,
        )
        (d / "cloud.json").write_text(meta.model_dump_json(by_alias=True))
        (d / "cloud.ply").write_bytes(b"")
    return d


def test_resolve_cloud_order(tmp_path):
    session = tmp_path / "s"
    session.mkdir()
    with pytest.raises(CloudError):
        resolve_cloud(session)
    root = tmp_path / "s.processed/lidar/registration"
    old = _fake_run(root, "a-old", "review", "2026-11-18T08:00:00Z")
    _fake_run(root, "b-rejected", "rejected_auto", "2026-11-18T10:00:00Z")
    _fake_run(root, "c-nocloud", "accepted_auto", "2026-11-18T11:00:00Z", cloud=False)
    _fake_run(root, ".work-x", "accepted_auto", "2026-11-18T12:00:00Z")
    assert resolve_cloud(session) == old
    newer = _fake_run(root, "d-new", "accepted_auto", "2026-11-18T09:00:00.5Z")
    assert resolve_cloud(session) == newer  # by created_utc, not by folder name
    explicit = _fake_run(tmp_path, "elsewhere", "review", "x")
    assert resolve_cloud(session, explicit) == explicit
    with pytest.raises(CloudError):
        resolve_cloud(session, tmp_path / "missing")
    # A cloud in the session itself (synthetic, old layout) comes first.
    meta = CloudMeta(
        session_id="s",
        parcel_id="p",
        origin_lat=37.0,
        origin_lon=37.0,
        origin_height_m=850.0,
        registration_method="synthetic",
        registration_version="1",
    )
    write_session_cloud(session, np.zeros((3, 3)), meta)
    assert resolve_cloud(session) == session / "lidar"


def test_keyframe_params_reach_the_front_end(small_ppk, tmp_path):
    """The front end comes from the parameters (get_frontend(name, params)): a coarser
    keyframe spacing gives fewer keyframes."""
    session = link_session(small_ppk[0], tmp_path / "s")
    fine = RegistrationParams(frontend="fake")
    coarse = RegistrationParams(
        frontend="fake", keyframe_dist_m=3.0, keyframe_angle_deg=90.0, keyframe_dt_s=5.0
    )
    _, r1 = run(session, params=fine)
    _, r2 = run(session, params=coarse)
    assert 0 < r2.metrics["keyframes"] < r1.metrics["keyframes"] / 3
    assert r1.frontend["config_hash"] != r2.frontend["config_hash"]
