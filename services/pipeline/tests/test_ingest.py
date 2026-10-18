import json
import shutil

import pytest

from orchados_pipeline.context import RunContext
from orchados_pipeline.hashing import hash_object, sha256_file
from orchados_pipeline.ingest import IngestError, build_manifest
from orchados_pipeline.models import FileRole


def _copy(session, tmp_path):
    dst = tmp_path / "s"
    shutil.copytree(session, dst)
    return dst


def test_manifest_hashes_and_roles(synthetic_session, tmp_path):
    session, _ = synthetic_session
    m = build_manifest(RunContext.create(session, tmp_path / "out"))
    roles = {f.path: f.role for f in m.files}
    assert roles["session.json"] == FileRole.session_meta
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
