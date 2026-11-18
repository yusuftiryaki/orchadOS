"""Contract tests against the GNSS logger's documented formats (firmware/gnss-logger/README.md).

The README's example events.csv and session.json are kept verbatim in tests/data/
so the tests also run without the firmware folder; a test checks the copies still
match the README.
"""

import json
import re
import shutil
from pathlib import Path

import pytest
from conftest import DATA

from orchados_pipeline.context import RunContext
from orchados_pipeline.events import COLUMNS, read_events
from orchados_pipeline.ingest import IngestError, build_manifest
from orchados_pipeline.models import FileRole, LoggerSession
from orchados_pipeline.params import SyncParams
from orchados_pipeline.sync import check_qr_events, decode_event_payload

README = Path(__file__).parents[3] / "firmware" / "gnss-logger" / "README.md"
INTERFACES = Path(__file__).parents[3] / "docs" / "arayuzler.md"
# Written only by the kit recorder (Raspberry Pi); documented in docs/arayuzler.md, not
# in the ESP32 firmware README.
KIT_ONLY_TYPES = {
    "lidar_lost",
    "lidar_regained",
    "gnss_lost",
    "gnss_regained",
    "precheck_override",
    "lidar_bag_restart",
}
EVENTS = DATA / "ip2_readme_events.csv"
LOGGER_SESSION = DATA / "ip2_readme_session.json"


def _readme_blocks() -> list[tuple[str, str]]:
    return re.findall(r"```(\w*)\n(.*?)```", README.read_text(encoding="utf-8"), re.S)


@pytest.mark.skipif(not README.is_file(), reason="firmware README not in this checkout")
def test_fixtures_match_firmware_readme():
    blocks = _readme_blocks()
    events = [b for _, b in blocks if b.startswith(",".join(COLUMNS) + "\n") and "\n1" in b]
    sessions = [b for lang, b in blocks if lang == "json" and '"format_version"' in b]
    assert events == [EVENTS.read_text(encoding="utf-8")]
    assert sessions == [LOGGER_SESSION.read_text(encoding="utf-8")]


@pytest.mark.skipif(not README.is_file(), reason="firmware README not in this checkout")
def test_readme_header_and_event_types():
    text = README.read_text(encoding="utf-8")
    assert f"```\n{','.join(COLUMNS)}\n```" in text
    from orchados_pipeline.events import KNOWN_TYPES

    for kind in KNOWN_TYPES - KIT_ONLY_TYPES:
        assert f"`{kind}`" in text


@pytest.mark.skipif(not INTERFACES.is_file(), reason="docs/arayuzler.md not in this checkout")
def test_interfaces_doc_lists_every_event_type():
    from orchados_pipeline.events import KNOWN_TYPES

    text = INTERFACES.read_text(encoding="utf-8")
    section = text[text.index("## `gnss/events.csv`") : text.index("## İki ayrı oturum dosyası")]
    assert KIT_ONLY_TYPES <= KNOWN_TYPES
    for kind in KNOWN_TYPES:
        assert f"`{kind}`" in section


def test_readme_events_parse():
    ev = read_events(EVENTS)
    assert [e.event_type for e in ev] == ["session_start", "qr_sync"]
    assert ev[0].payload == "parcel_id=P-12"
    assert ev[1].gps_time_ns == 1476350122249980000 and not ev[1].gps_time_derived
    assert (ev[1].pps_esp_micros, ev[1].pps_gps_time_ns) == (12000020, 1476350122000000000)


def test_readme_logger_session_parses():
    s = LoggerSession.model_validate(json.loads(LOGGER_SESSION.read_text(encoding="utf-8")))
    assert (s.session_id, s.parcel_id, s.format_version) == ("S-1", "P-12", 1)
    assert s.start.gps_time_ns == 1476350120500000000
    assert s.stop is not None and s.stop.gps_time_ns is None
    assert s.receiver["config_status"] == "ok"


def test_readme_qr_payload_cross_check():
    # The README example carries the QR value as ISO-8601 UTC; it matches the event time.
    ev = [e for e in read_events(EVENTS) if e.event_type == "qr_sync"]
    # Firmware README example: the QR showed 1476350122230 ms; the ESP32 processed the
    # qr_sync command ~20 ms later (BLE latency), well inside the warning threshold.
    assert decode_event_payload(ev[0].payload) == (1476350122230, "S-1")
    (check,) = check_qr_events(ev, [], "S-1", SyncParams())
    assert check.event_minus_qr_ms == pytest.approx(19.98, abs=0.01)
    assert check.warning is None


def _readme_session(synthetic_session, tmp_path) -> Path:
    """The synthetic session with the logger files replaced by the README examples."""
    s = tmp_path / "s"
    shutil.copytree(synthetic_session[0], s)
    shutil.copy(EVENTS, s / "gnss" / "events.csv")
    shutil.copy(LOGGER_SESSION, s / "gnss" / "session.json")
    root = json.loads((s / "session.json").read_text())
    root.update(session_id="S-1", parcel_id="P-12")
    (s / "session.json").write_text(json.dumps(root))
    return s


def test_ingest_accepts_readme_files(synthetic_session, tmp_path):
    s = _readme_session(synthetic_session, tmp_path)
    m = build_manifest(RunContext.create(s, tmp_path / "out"))
    assert m.logger is not None and m.logger.firmware_version == "0.3.0"
    assert m.session.session_id == m.logger.session_id == "S-1"
    assert m.event_counts == {"qr_sync": 1, "session_start": 1}
    roles = {f.path: f.role for f in m.files}
    assert roles["gnss/session.json"] == FileRole.logger_session


@pytest.mark.parametrize("field", ["session_id", "parcel_id"])
def test_ingest_rejects_session_mismatch(synthetic_session, tmp_path, field):
    s = _readme_session(synthetic_session, tmp_path)
    root = json.loads((s / "session.json").read_text())
    root[field] = "other"
    (s / "session.json").write_text(json.dumps(root))
    with pytest.raises(IngestError, match=f"{field} mismatch"):
        build_manifest(RunContext.create(s, tmp_path / "out"))


def test_ingest_rejects_parcel_mismatch_in_events(synthetic_session, tmp_path):
    s = _readme_session(synthetic_session, tmp_path)
    text = (s / "gnss" / "events.csv").read_text().replace("parcel_id=P-12", "parcel_id=P-99")
    (s / "gnss" / "events.csv").write_text(text)
    with pytest.raises(IngestError, match="events.csv line 2 has 'P-99'"):
        build_manifest(RunContext.create(s, tmp_path / "out"))


def test_ingest_requires_logger_session(synthetic_session, tmp_path):
    s = _readme_session(synthetic_session, tmp_path)
    (s / "gnss" / "session.json").unlink()
    with pytest.raises(IngestError, match="missing gnss/session.json"):
        build_manifest(RunContext.create(s, tmp_path / "out"))


def test_ingest_rejects_legacy_events(synthetic_session, tmp_path):
    s = _readme_session(synthetic_session, tmp_path)
    (s / "gnss" / "events.csv").write_text(
        "esp_micros,gps_time_ns,event_type,payload\n1,2,session_start,x\n"
    )
    with pytest.raises(IngestError, match="legacy 4-column"):
        build_manifest(RunContext.create(s, tmp_path / "out"))


def test_unclosed_logger_session_warns(synthetic_session, tmp_path):
    s = _readme_session(synthetic_session, tmp_path)
    data = json.loads(LOGGER_SESSION.read_text())
    data.update(stop=None, dropped_bytes=512)
    (s / "gnss" / "session.json").write_text(json.dumps(data))
    m = build_manifest(RunContext.create(s, tmp_path / "out"))
    assert any("not closed" in w for w in m.warnings)
    assert any("dropped 512 bytes" in w for w in m.warnings)
