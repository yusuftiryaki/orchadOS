import json
import shutil

import cv2
import numpy as np
import pytest
from conftest import DATA

from orchados_pipeline.context import RunContext
from orchados_pipeline.events import read_events
from orchados_pipeline.hashing import hash_object, sha256_file
from orchados_pipeline.ingest import IngestError, build_manifest
from orchados_pipeline.models import FileRole, Manifest, read_model, write_model


def _copy(session, tmp_path):
    dst = tmp_path / "s"
    shutil.copytree(session, dst)
    return dst


def _kit_session(tmp_path):
    """The kit recorder fixture (gnss/ only) plus a tiny equirectangular video."""
    dst = _copy(DATA / "kit_recorder_session", tmp_path)
    (dst / "video").mkdir()
    writer = cv2.VideoWriter(
        str(dst / "video" / "VID_0001.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (64, 32)
    )
    for i in range(5):
        writer.write(np.full((32, 64, 3), 40 * i, dtype=np.uint8))
    writer.release()
    return dst


def test_kit_recorder_session_passes_ingest(tmp_path):
    session = _kit_session(tmp_path)
    m = build_manifest(RunContext.create(session, tmp_path / "out"))
    assert m.warnings == []
    assert m.event_counts == {
        "lidar_lost": 1,
        "lidar_regained": 1,
        "precheck_override": 1,
        "qr_sync": 2,
        "session_start": 1,
        "session_stop": 1,
    }
    assert m.ubx_frame_counts["NAV-PVT"] > 100
    assert m.logger is not None
    # Kit recorder keys are not in the model; they are kept as extra keys.
    assert m.logger.recorder == "kit-recorder"
    assert m.logger.precheck_overrides == ["lidar"]
    assert m.logger.clock_state_at_start == "pps"
    assert m.logger.receiver["port"] == "USB"
    assert m.logger.receiver["baud"] is None and m.logger.receiver["detected_baud"] is None
    # ... and survive the manifest round trip.
    back = read_model(Manifest, write_model(m, tmp_path / "manifest.json"))
    assert back.logger.recorder == "kit-recorder"


def test_kit_recorder_fixture_follows_the_contract():
    events = read_events(DATA / "kit_recorder_session" / "gnss" / "events.csv")
    assert [e.event_type for e in events[:2]] == ["session_start", "precheck_override"]
    assert events[0].payload == "parcel_id=P-12"
    assert events[1].payload == "lidar"
    for e in events:
        # PPS-locked throughout: every row carries its GPS time and a valid anchor.
        assert e.gps_time_ns is not None and not e.gps_time_derived
        assert e.pps_esp_micros is not None and e.pps_gps_time_ns is not None
        assert e.pps_gps_time_ns % 1_000_000_000 == 0
        assert e.gps_time_ns == e.pps_gps_time_ns + (e.esp_micros - e.pps_esp_micros) * 1000
        assert 0 <= e.esp_micros - e.pps_esp_micros < 1_000_000


def test_kit_recorder_power_loss_passes_ingest(tmp_path):
    session = _kit_session(tmp_path)
    logger_path = session / "gnss" / "session.json"
    info = json.loads(logger_path.read_text())
    (session / "gnss" / "session.json").write_text(
        json.dumps({**info, "stop": None, "stop_reason": "power_loss"})
    )
    events = session / "gnss" / "events.csv"
    lines = events.read_text().splitlines(keepends=True)
    events.write_text("".join(x for x in lines if ",session_stop," not in x))
    m = build_manifest(RunContext.create(session, tmp_path / "out"))
    assert m.logger.stop is None and m.logger.stop_reason == "power_loss"
    assert m.warnings == ["gnss/session.json: session was not closed (stop is null)"]
    assert "session_stop" not in m.event_counts


def test_manifest_hashes_and_roles(synthetic_session, tmp_path):
    session, _ = synthetic_session
    m = build_manifest(RunContext.create(session, tmp_path / "out"))
    roles = {f.path: f.role for f in m.files}
    assert roles["session.json"] == FileRole.session_meta
    assert roles["gnss/session.json"] == FileRole.logger_session
    assert roles["gnss/gnss.ubx"] == FileRole.gnss_raw
    assert roles["gnss/events.csv"] == FileRole.gnss_events
    assert roles["video/VID_0001.mp4"] == FileRole.video
    assert roles["trees.json"] == FileRole.extra
    for f in m.files:
        assert f.sha256 == sha256_file(session / f.path)
        assert f.size == (session / f.path).stat().st_size
    video = m.by_role(FileRole.video)[0].video
    assert video.width == 2 * video.height and video.frame_count > 0
    assert m.ubx_frame_counts["NAV-PVT"] > 100
    assert m.event_counts["qr_sync"] == 2
    assert any("bad checksum" in w for w in m.warnings)
    assert m.session.session_id == "synth-0001"
    assert m.logger is not None and m.logger.session_id == "synth-0001"
    assert any("recomputed from the PPS anchor for 1 event" in w for w in m.warnings)
    assert not any("camera_height_m" in w for w in m.warnings)


def test_manifest_is_deterministic(synthetic_session, tmp_path):
    session, _ = synthetic_session
    a = build_manifest(RunContext.create(session, tmp_path / "a"))
    b = build_manifest(RunContext.create(session, tmp_path / "b"))
    assert hash_object(a.model_dump(mode="json")) == hash_object(b.model_dump(mode="json"))


def test_output_inside_session_is_not_hashed(synthetic_session, tmp_path):
    s = _copy(synthetic_session[0], tmp_path)
    (s / "processed").mkdir()
    (s / "processed" / "x.bin").write_bytes(b"x")
    m = build_manifest(RunContext.create(s, s / "processed"))
    assert not any(f.path.startswith("processed/") for f in m.files)


def test_missing_and_corrupt_inputs_are_reported_together(synthetic_session, tmp_path):
    s = _copy(synthetic_session[0], tmp_path)
    (s / "gnss" / "events.csv").unlink()
    (s / "gnss" / "gnss.ubx").write_bytes(b"\x00" * 100)
    (s / "video" / "VID_0001.mp4").write_bytes(b"not a video")
    with pytest.raises(IngestError) as exc:
        build_manifest(RunContext.create(s, tmp_path / "out"))
    problems = "\n".join(exc.value.problems)
    assert "missing gnss/events.csv" in problems
    assert "no valid UBX frames" in problems
    assert "VID_0001.mp4" in problems


def test_invalid_session_json(synthetic_session, tmp_path):
    s = _copy(synthetic_session[0], tmp_path)
    (s / "session.json").write_text(json.dumps({"session_id": "x"}))
    with pytest.raises(IngestError, match="parcel_id"):
        build_manifest(RunContext.create(s, tmp_path / "out"))


def test_base_rinex_classified(synthetic_session, tmp_path):
    s = _copy(synthetic_session[0], tmp_path)
    (s / "base").mkdir()
    (s / "base" / "base.obs").write_text(
        "     3.04           OBSERVATION DATA    M                   RINEX VERSION / TYPE\n"
    )
    (s / "base" / "base.nav").write_text(
        "     3.04           N: GNSS NAV DATA    M                   RINEX VERSION / TYPE\n"
    )
    m = build_manifest(RunContext.create(s, tmp_path / "out"))
    assert [f.path for f in m.by_role(FileRole.base_obs)] == ["base/base.obs"]
    assert [f.path for f in m.by_role(FileRole.base_nav)] == ["base/base.nav"]


@pytest.mark.parametrize(
    ("change", "warning"),
    [
        ({"camera_height_m": None}, "camera_height_m not set"),
        ({"camera_height_m": 4.2}, "outside 0.5-3.5 m"),
    ],
    ids=["unset", "out-of-range"],
)
def test_camera_height_warnings(synthetic_session, tmp_path, change, warning):
    s = _copy(synthetic_session[0], tmp_path)
    info = json.loads((s / "session.json").read_text())
    for key, value in change.items():
        if value is None:
            info.pop(key)
        else:
            info[key] = value
    (s / "session.json").write_text(json.dumps(info))
    m = build_manifest(RunContext.create(s, tmp_path / "out"))
    assert any(warning in w for w in m.warnings)


def test_scan_platform_is_validated(synthetic_session, tmp_path):
    s = _copy(synthetic_session[0], tmp_path)
    info = json.loads((s / "session.json").read_text())
    (s / "session.json").write_text(json.dumps({**info, "scan_platform": "tractor"}))
    with pytest.raises(IngestError, match="scan_platform"):
        build_manifest(RunContext.create(s, tmp_path / "out"))
