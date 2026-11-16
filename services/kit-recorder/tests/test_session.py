import json

import pytest

from orchados_recorder.session import (
    EVENTS_HEADER,
    Anchor,
    SessionWriter,
    TimeStamp,
    recover_open_sessions,
)

RECEIVER = {"model": "ZED-F9P", "port": "USB", "baud": None, "config_status": "ok"}
START = TimeStamp(10_500_000, 1476350120500000000)
ANCHOR = Anchor(10_000_000, 1476350120000000000)


def create(root, session_id="S-1", **kw):
    args = dict(
        receiver=RECEIVER,
        recorder_version="0.1.0",
        overrides=[],
        clock_state="pps",
        start=START,
        anchor=ANCHOR,
    )
    args.update(kw)
    return SessionWriter.create(root, session_id, "P-12", **args)


def rows(root, session_id="S-1"):
    return (root / "sessions" / session_id / "gnss/events.csv").read_text().splitlines()


def meta(root, session_id="S-1"):
    return json.loads((root / "sessions" / session_id / "gnss/session.json").read_text())


def test_create_writes_esp32_compatible_files(tmp_path):
    w = create(tmp_path, overrides=["lidar", "clock"])
    d = tmp_path / "sessions/S-1"
    r = rows(tmp_path)
    assert r[0] == "esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns"
    assert r[0] == EVENTS_HEADER
    assert r[1] == (
        "10500000,1476350120500000000,session_start,parcel_id=P-12,10000000,1476350120000000000"
    )
    assert r[2].split(",")[2:4] == ["precheck_override", "lidar;clock"]
    m = meta(tmp_path)
    assert m["format_version"] == 1 and m["session_id"] == "S-1" and m["parcel_id"] == "P-12"
    assert m["stop"] is None and m["stop_reason"] is None and m["recorder"] == "kit-recorder"
    assert m["firmware_version"] == "0.1.0" and m["gps_utc_leap_seconds"] == 18
    assert m["start"] == {
        "esp_micros": 10_500_000,
        "gps_time_ns": 1476350120500000000,
        "utc": "2026-10-18T09:15:02.500Z",
    }
    assert m["precheck_overrides"] == ["lidar", "clock"]
    assert m["clock_state_at_start"] == "pps"
    assert m["receiver"] == RECEIVER
    assert m["gnss_bytes"] == 0 and m["dropped_bytes"] == 0
    assert (d / "lidar/raw").is_dir() and w.lidar_dir == d / "lidar/raw"
    assert (d / "gnss/gnss.ubx").exists()


def test_no_override_event_without_overrides(tmp_path):
    create(tmp_path)
    assert [r.split(",")[2] for r in rows(tmp_path)[1:]] == ["session_start"]


def test_unlocked_clock_leaves_time_and_anchor_empty(tmp_path):
    create(tmp_path, start=TimeStamp(5, None), anchor=None, clock_state="unlocked")
    assert rows(tmp_path)[1] == "5,,session_start,parcel_id=P-12,,"
    m = meta(tmp_path)
    assert m["start"] == {"esp_micros": 5, "gps_time_ns": None, "utc": None}
    assert m["clock_state_at_start"] == "unlocked"


def test_payload_with_comma_is_quoted(tmp_path):
    w = create(tmp_path)
    w.event("corner", 'a,b "c"', TimeStamp(11_000_000, None), None)
    assert rows(tmp_path)[2] == '11000000,,corner,"a,b ""c""",,'


def test_existing_session_folder_is_refused(tmp_path):
    create(tmp_path)
    with pytest.raises(FileExistsError):
        create(tmp_path)


def test_gnss_bytes_and_fsync(tmp_path):
    w = create(tmp_path)
    w.append_gnss(b"\xb5\x62abc")
    w.maybe_fsync(START.mono_us + 2_000_000)
    assert (tmp_path / "sessions/S-1/gnss/gnss.ubx").read_bytes() == b"\xb5\x62abc"
    assert w.gnss_bytes == 5


def test_close_writes_stop(tmp_path):
    w = create(tmp_path)
    w.append_gnss(b"x" * 10)
    w.close(TimeStamp(20_000_000, 1476350130000000000), "command", gnss_bytes=10, dropped_bytes=0)
    last = rows(tmp_path)[-1].split(",")
    assert last[:4] == ["20000000", "1476350130000000000", "session_stop", "command"]
    m = meta(tmp_path)
    assert m["stop_reason"] == "command" and m["gnss_bytes"] == 10
    assert m["stop"]["esp_micros"] == 20_000_000 and m["stop"]["utc"] == "2026-10-18T09:15:12.000Z"
    assert recover_open_sessions(tmp_path) == []


def test_recording_json(tmp_path):
    w = create(tmp_path)
    w.write_recording_json({"schema": "orchados.lidar_recording/1"})
    doc = json.loads((w.lidar_dir / "recording.json").read_text())
    assert doc == {"schema": "orchados.lidar_recording/1"}


def test_recover_closes_open_session_as_power_loss(tmp_path):
    w = create(tmp_path)
    w.append_gnss(b"y" * 7)
    w.maybe_fsync(START.mono_us + 2_000_000)  # never closed: the power went off
    assert recover_open_sessions(tmp_path) == ["S-1"]
    m = meta(tmp_path)
    assert m["stop_reason"] == "power_loss" and m["stop"] is None
    assert m["gnss_bytes"] == 7
    assert [r.split(",")[2] for r in rows(tmp_path)[1:]] == ["session_start"]
    assert recover_open_sessions(tmp_path) == []


def test_recover_skips_unreadable_and_missing(tmp_path):
    assert recover_open_sessions(tmp_path / "nothing") == []
    bad = tmp_path / "sessions/B/gnss"
    bad.mkdir(parents=True)
    (bad / "session.json").write_text("{not json")
    assert recover_open_sessions(tmp_path) == []
