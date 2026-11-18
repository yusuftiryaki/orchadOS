from __future__ import annotations

import json

import pytest
from conftest import write_session

from orchados_ingest.sources import SourceError, plan


def test_session_folder(tmp_path):
    root = write_session(tmp_path / "s", video_bytes=10)
    (root / ".DS_Store").write_text("x")
    (root / ".orchados").mkdir()
    (root / ".orchados" / "manifest.json").write_text("{}")
    (root / "Thumbs.db").write_text("x")
    p = plan(root, "s-1")
    assert p.layout == "session"
    assert [f.rel for f in p.files] == [
        "gnss/events.csv",
        "gnss/gnss.ubx",
        "gnss/session.json",
        "session.json",
        "video/VID_0001.mp4",
    ]
    assert (p.session_id, p.org_id, p.parcel_id) == ("s-1", "o-1", "p-1")


def test_session_files_must_agree(tmp_path):
    root = write_session(tmp_path / "s", video_bytes=10)
    (root / "gnss" / "session.json").write_text(json.dumps({"session_id": "other"}))
    with pytest.raises(SourceError, match="session_id differs"):
        plan(root, "s-1")


def test_logger_card(tmp_path):
    card = tmp_path / "sd"
    sess = card / "sessions" / "s-1"
    sess.mkdir(parents=True)
    (sess / "gnss.ubx").write_bytes(b"u")
    (sess / "events.csv").write_text("e")
    (sess / "session.json").write_text(json.dumps({"session_id": "s-1", "parcel_id": "p-1"}))
    (card / "sessions" / "other").mkdir()
    (card / "sessions" / "other" / "gnss.ubx").write_bytes(b"x")
    p = plan(card, "s-1")
    assert p.layout == "logger-card"
    assert [f.rel for f in p.files] == ["gnss/events.csv", "gnss/gnss.ubx", "gnss/session.json"]
    assert (p.parcel_id, p.org_id) == ("p-1", None)
    with pytest.raises(SourceError, match="sessions/s-2"):
        plan(card, "s-2", "logger-card")


def test_kit_ssd_maps_session_to_root(tmp_path):
    ssd = tmp_path / "ssd"
    s = ssd / "sessions" / "S-1"
    (s / "gnss").mkdir(parents=True)
    (s / "lidar" / "raw" / "bag").mkdir(parents=True)
    (s / "gnss" / "session.json").write_text(
        json.dumps({"session_id": "S-1", "parcel_id": "P-12", "recorder": "kit-recorder"})
    )
    (s / "gnss" / "gnss.ubx").write_bytes(b"x")
    (s / "gnss" / "events.csv").write_text("e")
    (s / "lidar" / "raw" / "bag" / "bag_0.mcap").write_bytes(b"y")
    (s / "lidar" / "raw" / "bag" / "metadata.yaml").write_text("m")
    # ros2 bag restarted mid-session: a second folder.
    (s / "lidar" / "raw" / "bag.1").mkdir()
    (s / "lidar" / "raw" / "bag.1" / "bag.1_0.mcap").write_bytes(b"w")
    (s / "lidar" / "raw" / "recording.json").write_text("{}")
    (ssd / "sessions" / "other" / "gnss").mkdir(parents=True)
    (ssd / "sessions" / "other" / "gnss" / "gnss.ubx").write_bytes(b"z")
    (ssd / "lost+found").mkdir()
    p = plan(ssd, "S-1")
    assert p.layout == "kit-ssd"
    assert [f.rel for f in p.files] == [
        "gnss/events.csv",
        "gnss/gnss.ubx",
        "gnss/session.json",
        "lidar/raw/bag/bag_0.mcap",
        "lidar/raw/bag/metadata.yaml",
        "lidar/raw/bag.1/bag.1_0.mcap",
        "lidar/raw/recording.json",
    ]
    assert (p.session_id, p.parcel_id, p.org_id) == ("S-1", "P-12", None)


def test_kit_ssd_explicit_layout_needs_gnss_folder(tmp_path):
    ssd = tmp_path / "ssd"
    (ssd / "sessions" / "S-1").mkdir(parents=True)
    (ssd / "sessions" / "S-1" / "gnss.ubx").write_bytes(b"u")
    # A logger card layout (no gnss/ subfolder) is still detected as logger-card.
    assert plan(ssd, "S-1").layout == "logger-card"
    with pytest.raises(SourceError, match="sessions/S-1/gnss/"):
        plan(ssd, "S-1", "kit-ssd")
    with pytest.raises(SourceError, match="sessions/S-2/gnss/"):
        plan(ssd, "S-2", "kit-ssd")


def test_camera_card(tmp_path):
    card = tmp_path / "cam"
    d = card / "DCIM" / "Camera01"
    d.mkdir(parents=True)
    for name in ("VID_1_00_001.insv", "VID_1_10_001.insv", "LRV_1_01_001.lrv", "x.jpg"):
        (d / name).write_bytes(b"v")
    (card / "MISC").mkdir()
    (card / "MISC" / "log.txt").write_text("x")
    p = plan(card, "s-1")
    assert p.layout == "camera-card"
    assert [f.rel for f in p.files] == [
        "camera/Camera01/VID_1_00_001.insv",
        "camera/Camera01/VID_1_10_001.insv",
        "camera/Camera01/x.jpg",
    ]


def test_video_export_folder(tmp_path):
    d = tmp_path / "export"
    d.mkdir()
    (d / "VID_0001.mp4").write_bytes(b"v")
    (d / "notes.txt").write_text("x")
    p = plan(d, "s-1")
    assert p.layout == "video"
    assert [f.rel for f in p.files] == ["video/VID_0001.mp4"]


def test_nothing_to_upload(tmp_path):
    (tmp_path / "e").mkdir()
    with pytest.raises(SourceError, match="pass --layout"):
        plan(tmp_path / "e", "s-1")
    with pytest.raises(SourceError, match="nothing to upload"):
        plan(tmp_path / "e", "s-1", "video")
