"""Synthetic moving LiDAR scan (lidar synth --moving): the raw kit session it writes."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from mcap.reader import make_reader
from mcap_ros2.decoder import DecoderFactory

from orchados_pipeline.cli import main
from orchados_pipeline.geo import LocalFrame
from orchados_pipeline.lidar import ros2msg
from orchados_pipeline.lidar.models import RegistrationParams
from orchados_pipeline.lidar.synth_moving import MovingConfig, MovingTruth, make_moving_session
from orchados_pipeline.models import Trajectory, read_model
from orchados_pipeline.position import trajectory_from_nav_pvt

GPS_UNIX_OFFSET_NS = (315_964_800 - 18) * 1_000_000_000  # GPS ns = UNIX ns - this


def read_ros2_messages(mcap: str, topics: list[str]):
    with open(mcap, "rb") as f:
        reader = make_reader(f, decoder_factories=[DecoderFactory()])
        for _s, _c, _m, ros_msg in reader.iter_decoded_messages(topics=topics):
            yield ros_msg


def _messages(mcap: Path, topic: str):
    with open(mcap, "rb") as f:
        reader = make_reader(f)
        for _schema, _channel, msg in reader.iter_messages(topics=[topic]):
            yield msg


@pytest.fixture(scope="module")
def short(tmp_path_factory) -> tuple[Path, MovingTruth]:
    dest = tmp_path_factory.mktemp("moving") / "session"
    truth = make_moving_session(dest, MovingConfig(rows=1, trees_per_row=3, duration_s=4.0))
    return dest, truth


def test_session_layout(short):
    dest, truth = short
    for rel in (
        "session.json",
        "gnss/gnss.ubx",
        "gnss/session.json",
        "lidar/raw/bag/bag_0.mcap",
        "lidar/raw/bag/metadata.yaml",
        "lidar/raw/recording.json",
        "trees.json",
        "truth.json",
    ):
        assert (dest / rel).is_file(), rel
    rec = json.loads((dest / "lidar/raw/recording.json").read_text())
    assert rec["schema"] == "orchados.lidar_recording/1"
    assert rec["clock_state_at_start"] == "pps"
    assert rec["topics"]["points"] == "/unilidar/cloud"
    assert rec["topics"]["imu"] == "/unilidar/imu"
    assert [s["file"] for s in rec["segments"]] == ["bag/bag_0.mcap"]
    assert rec["gaps"] == []
    session = json.loads((dest / "session.json").read_text())
    assert session["session_id"] == rec["session_id"]
    assert len(truth.trees) == 3
    # The kit's antenna about 0.9 m above the LiDAR (docs/tarama-kiti.md), as registered by
    # default: lidar register --frontend fake on a synthetic session needs no parameters.
    assert truth.lever_arm_m == [0.0, 0.0, 0.9]
    assert tuple(truth.lever_arm_m) == RegistrationParams().lever_arm_m


def test_mcap_messages_decode_with_mcap_ros2(short):
    dest, _ = short
    mcap = dest / "lidar/raw/bag/bag_0.mcap"
    with open(mcap, "rb") as f:
        summary = make_reader(f).get_summary()
    schemas = {c.topic: summary.schemas[c.schema_id].name for c in summary.channels.values()}
    assert schemas["/unilidar/cloud"] == "sensor_msgs/msg/PointCloud2"
    assert schemas["/unilidar/imu"] == "sensor_msgs/msg/Imu"
    assert schemas["/orchados/gnss_ubx"] == "std_msgs/msg/UInt8MultiArray"

    cloud = next(iter(read_ros2_messages(str(mcap), topics=["/unilidar/cloud"])))
    m = cloud
    names = [(f.name, f.datatype) for f in m.fields]
    assert names == [
        ("x", 7),
        ("y", 7),
        ("z", 7),
        ("intensity", 7),
        ("ring", 4),
        ("time", 7),
    ]
    assert m.width * m.height == len(m.data) // m.point_step
    imu = next(iter(read_ros2_messages(str(mcap), topics=["/unilidar/imu"])))
    assert imu.linear_acceleration.z == pytest.approx(9.81, abs=0.2)
    ubx = next(iter(read_ros2_messages(str(mcap), topics=["/orchados/gnss_ubx"])))
    assert bytes(ubx.data)[:2] == b"\xb5\x62"


def test_rates_and_stamps(short):
    dest, _ = short
    mcap = dest / "lidar/raw/bag/bag_0.mcap"
    clouds = list(_messages(mcap, "/unilidar/cloud"))
    span_s = (clouds[-1].log_time - clouds[0].log_time) / 1e9 + 0.1
    assert len(clouds) / span_s == pytest.approx(10.0, rel=0.02)
    points = sum(len(ros2msg.decode_pointcloud2(m.data)[1]) for m in clouds)
    assert points / span_s == pytest.approx(64_000, rel=0.02)
    for m in clouds:
        assert ros2msg.stamp_ns(m.data) == m.log_time
    _, pts = ros2msg.decode_pointcloud2(clouds[3].data)
    assert 0.0 <= pts["time"].min() and pts["time"].max() < 0.1
    imu = list(_messages(mcap, "/unilidar/imu"))
    assert len(imu) / span_s == pytest.approx(250.0, rel=0.03)


def test_points_lie_on_the_scene(short):
    """Points (body frame at their own time) moved by the true pose land on the scene."""
    dest, truth = short
    mcap = dest / "lidar/raw/bag/bag_0.mcap"
    msg = list(_messages(mcap, "/unilidar/cloud"))[20]
    _, pts = ros2msg.decode_pointcloud2(msg.data)
    gps0 = msg.log_time - GPS_UNIX_OFFSET_NS
    t = gps0 + np.round(pts["time"].astype(np.float64) * 1e9).astype(np.int64)
    pos, rot = truth.pose_at(t)
    body = np.column_stack([pts["x"], pts["y"], pts["z"]]).astype(np.float64)
    world = pos + np.einsum("nij,nj->ni", rot, body)
    trunks = np.array([[e, n] for _, e, n in truth.trees])
    d_trunk = np.min(np.linalg.norm(world[:, None, :2] - trunks[None], axis=2), axis=1)
    on_ground = np.abs(world[:, 2]) < 0.06
    near_tree = d_trunk < 2.5  # trunk or crown
    near_sensor = np.linalg.norm(body, axis=1) < 0.7  # the kit's mast
    share = np.mean(on_ground | near_tree | near_sensor)
    assert share > 0.99
    assert np.any(near_sensor), "mast points are part of the raw scan"


def test_gnss_follows_the_antenna(short):
    dest, truth = short
    frame = LocalFrame(truth.origin_lat, truth.origin_lon)
    ppk = read_model(
        Trajectory, dest.parent / f"{dest.name}.processed/synthetic-ppk/trajectory.json"
    )
    assert ppk.ppk_status == "ppk"
    t = np.array([p.gps_time_ns for p in ppk.points])
    inside = (t >= truth.poses[0, 0]) & (t <= truth.poses[-1, 0])
    pos, rot = truth.pose_at(t[inside])
    antenna = pos + rot @ np.array(truth.lever_arm_m)
    e, n = frame.to_en([p.lat for p in ppk.points], [p.lon for p in ppk.points])
    up = np.array([p.height_m for p in ppk.points]) - truth.origin_height_m
    got = np.column_stack([e, n, up])[inside]
    assert np.abs(got - antenna).max() < 0.06
    # The receiver's own NAV-PVT: same path, metre-level, 5 Hz.
    nav = trajectory_from_nav_pvt((dest / "gnss/gnss.ubx").read_bytes())
    assert np.diff([p.gps_time_ns for p in nav]).max() == 200_000_000
    e, n = frame.to_en([p.lat for p in nav], [p.lon for p in nav])
    tn = np.array([p.gps_time_ns for p in nav])
    ok = (tn >= truth.poses[0, 0]) & (tn <= truth.poses[-1, 0])
    pos, rot = truth.pose_at(tn[ok])
    err = np.hypot(np.asarray(e)[ok] - pos[:, 0], np.asarray(n)[ok] - pos[:, 1])
    assert 0.05 < np.median(err) < 3.0


def test_gap_second_bag_stamp_offset_low_imu(tmp_path):
    dest = tmp_path / "s"
    cfg = MovingConfig(
        rows=1,
        trees_per_row=2,
        duration_s=16.0,
        gap=(4.0, 7.0),
        second_bag_at_s=10.0,
        stamp_offset_s=0.2,
        imu_hz=100.0,
        ppk=False,
        points_per_s=4000,
    )
    make_moving_session(dest, cfg)
    rec = json.loads((dest / "lidar/raw/recording.json").read_text())
    assert [s["file"] for s in rec["segments"]] == ["bag/bag_0.mcap", "bag.1/bag.1_0.mcap"]
    assert len(rec["gaps"]) == 1
    assert rec["gaps"][0]["duration_s"] == pytest.approx(3.0, abs=0.11)
    first = list(_messages(dest / "lidar/raw/bag/bag_0.mcap", "/unilidar/cloud"))
    second = list(_messages(dest / "lidar/raw/bag.1/bag.1_0.mcap", "/unilidar/cloud"))
    t0 = first[0].log_time
    rel = np.array([(m.log_time - t0) / 1e9 for m in first])
    assert not np.any((rel > 4.0 + 1e-6) & (rel < 7.0 - 1e-6))
    assert rel.max() < 10.0
    assert (second[0].log_time - t0) / 1e9 == pytest.approx(10.0, abs=0.11)
    for m in first[:5]:
        assert m.log_time - ros2msg.stamp_ns(m.data) == 200_000_000
    imu = list(_messages(dest / "lidar/raw/bag/bag_0.mcap", "/unilidar/imu"))
    assert len(imu) / (rel.max() - 3.0) == pytest.approx(100.0, rel=0.1)
    assert not (tmp_path / "s.processed").exists()  # no PPK trajectory without --ppk


def test_cli_synth_moving(tmp_path, capsys):
    dest = tmp_path / "cli"
    rc = main(
        [
            "lidar",
            "synth",
            "--moving",
            str(dest),
            "--duration",
            "3",
            "--rows",
            "1",
            "--gap",
            "1,1.5",
            "--no-ppk",
        ]
    )
    assert rc == 0
    assert (dest / "lidar/raw/bag/bag_0.mcap").is_file()
    assert "moving scan" in capsys.readouterr().out
    rec = json.loads((dest / "lidar/raw/recording.json").read_text())
    assert len(rec["gaps"]) == 1
