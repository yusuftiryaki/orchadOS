"""Raw kit LiDAR log: segments, stamp checks, IMU rate, restamped copy."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from mcap.reader import make_reader
from mcap.writer import Writer
from mcap_ros2.decoder import DecoderFactory

from orchados_pipeline.lidar import ros2msg
from orchados_pipeline.lidar.models import RegistrationParams
from orchados_pipeline.lidar.rawlog import (
    gps_to_unix_ns,
    iter_clouds,
    plan_segments,
    unix_to_gps_ns,
    write_restamped,
)
from orchados_pipeline.lidar.synth_moving import MovingConfig, MovingTruth, make_moving_session


def _session(root: Path, name: str, **kw) -> tuple[Path, MovingTruth]:
    cfg = MovingConfig(rows=1, trees_per_row=3, points_per_s=1500, ppk=False, **kw)
    dest = root / name
    return dest, make_moving_session(dest, cfg)


@pytest.fixture(scope="module")
def split_session(tmp_path_factory):
    return _session(
        tmp_path_factory.mktemp("raw"), "split", duration_s=70.0, gap=(25.0, 28.0),
        second_bag_at_s=50.0,
    )  # fmt: skip


def test_gps_unix_round_trip():
    g = 1_444_550_418_000_000_000
    assert unix_to_gps_ns(gps_to_unix_ns(g)) == g
    # 2026: GPS - UTC = 18 s; GPS epoch 1980-01-06 is UNIX 315964800.
    assert g - gps_to_unix_ns(g) == (18 - 315_964_800) * 1_000_000_000


def test_gaps_and_bags_split_segments(split_session):
    dest, truth = split_session
    segs = plan_segments(dest, RegistrationParams())
    assert [s.index for s in segs] == [0, 1, 2]
    t0 = truth.t0_ns
    starts = [(s.start_gps_ns - t0) / 1e9 for s in segs]
    ends = [(s.end_gps_ns - t0) / 1e9 for s in segs]
    assert starts == pytest.approx([0.0, 28.0, 50.0], abs=1e-6)
    assert ends == pytest.approx([24.9, 49.9, 69.9], abs=1e-6)
    assert [s.bag_dirs for s in segs] == [
        [dest / "lidar/raw/bag"],
        [dest / "lidar/raw/bag"],
        [dest / "lidar/raw/bag.1"],
    ]
    # The last one is 19.9 s long: kept in the list with its reason, not run.
    assert [s.skip_reason for s in segs] == [None, None, "too_short"]
    assert not any(s.needs_restamp for s in segs)
    assert segs[0].imu_rate_hz == pytest.approx(250.0, rel=0.02)


def test_stamp_offset_needs_restamp(tmp_path):
    dest, _ = _session(tmp_path, "late", duration_s=22.0, stamp_offset_s=0.2)
    (seg,) = plan_segments(dest, RegistrationParams())
    assert seg.needs_restamp
    assert seg.skip_reason is None


def test_stamp_clock_rate_needs_restamp(tmp_path):
    """A stamp clock running at a different rate (unilidar_sdk2 #25), offset well below 50 ms."""
    dest, _ = _session(tmp_path, "slow", duration_s=22.0)
    src = dest / "lidar/raw/bag/bag_0.mcap"
    out = dest / "lidar/raw/bag/bag_0.tmp"
    with open(src, "rb") as f, open(out, "wb") as g:
        reader = make_reader(f)
        w = Writer(g)
        w.start(profile="ros2")
        summary = reader.get_summary()
        ids = {}
        for sid, sc in summary.schemas.items():
            ids[sid] = w.register_schema(sc.name, sc.encoding, sc.data)
        chans = {
            cid: w.register_channel(c.topic, c.message_encoding, ids[c.schema_id])
            for cid, c in summary.channels.items()
        }
        first = None
        for _s, ch, msg in reader.iter_messages():
            data = msg.data
            if ch.topic != "/orchados/gnss_ubx":
                first = msg.log_time if first is None else first
                stamp = first + round((msg.log_time - first) * (1 + 1e-3))  # 20 ms after 20 s
                data = ros2msg.with_stamp(data, stamp)
            w.add_message(chans[ch.id], msg.log_time, data, msg.publish_time)
        w.finish()
    out.replace(src)
    (seg,) = plan_segments(dest, RegistrationParams())
    assert seg.needs_restamp


def test_low_imu_rate_skips_segment(tmp_path):
    dest, _ = _session(tmp_path, "imu", duration_s=22.0, imu_hz=100.0)
    (seg,) = plan_segments(dest, RegistrationParams(expected_imu_hz=250.0))
    assert seg.skip_reason == "imu_rate_low"
    assert seg.imu_rate_hz == pytest.approx(100.0, rel=0.03)
    (seg,) = plan_segments(dest, RegistrationParams(expected_imu_hz=150.0))
    assert seg.skip_reason is None


def test_missing_or_empty_raw_has_no_segments(tmp_path):
    assert plan_segments(tmp_path / "nothing", RegistrationParams()) == []
    bag = tmp_path / "empty" / "lidar/raw/bag"
    bag.mkdir(parents=True)
    with open(bag / "bag_0.mcap", "wb") as f:
        w = Writer(f)
        w.start(profile="ros2")
        w.finish()
    assert plan_segments(tmp_path / "empty", RegistrationParams()) == []
    (bag / "bag_1.mcap").write_bytes(b"")  # zero-length file left by a power loss
    assert plan_segments(tmp_path / "empty", RegistrationParams()) == []


def test_write_restamped(tmp_path):
    dest, truth = _session(tmp_path, "late", duration_s=22.0, stamp_offset_s=0.2)
    (seg,) = plan_segments(dest, RegistrationParams())
    out = write_restamped(seg, tmp_path / "restamped")
    assert out.suffix == ".mcap" and out.is_file()
    n = 0
    with open(out, "rb") as f:
        reader = make_reader(f, decoder_factories=[DecoderFactory()])
        for _s, ch, msg, ros in reader.iter_decoded_messages():
            assert ch.topic in ("/unilidar/cloud", "/unilidar/imu")
            stamp = ros.header.stamp.sec * 1_000_000_000 + ros.header.stamp.nanosec
            assert stamp == msg.log_time
            assert seg.start_gps_ns <= unix_to_gps_ns(msg.log_time) <= seg.end_gps_ns + 10**8
            n += 1
    assert n > 22 * (10 + 250) * 0.95
    # Points are untouched: the same relative times and coordinates.
    a = next(iter_clouds(seg))
    b_seg = type(seg)(**{**seg.__dict__, "bag_dirs": [out.parent], "needs_restamp": False})
    b = next(iter_clouds(b_seg))
    assert a.log_gps_ns == b.log_gps_ns
    np.testing.assert_array_equal(a.xyz, b.xyz)
    np.testing.assert_array_equal(a.rel_time_s, b.rel_time_s)
