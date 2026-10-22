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
