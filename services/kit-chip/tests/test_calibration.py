"""Manifest from a calibration record; Supabase replaced by a local HTTP server."""

import json
import threading
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

from orchados_kit.calibration import (
    CalibrationError,
    fetch_calibration,
    manifest_from_calibration,
)
from orchados_kit.cli import main
from orchados_kit.manifest import ManifestError, decode, to_dict

CAL_ID = "d3290000-0000-4000-8000-000000000001"


def row(**over) -> dict:
    r = {
        "id": CAL_ID,
        "version": "kit-v2",
        "chip_id": 42,
        "valid_to": None,
        "extrinsics": {
            "camera_to_antenna_m": [0, 0, 0.15],
            "kit_mount": {
                "kit_gnss": [0.0, 0.0, 0.9, 0.0, 0.0, 0.0],
                "kit_cam360": [0.02, 0.0, 0.75, 0.0, 0.0, 1.5],
            },
        },
        "rig": {
            "name": "Kit 1 pole",
            "rig_sensor": [
                {
                    "sensor": {
                        "kind": "camera_360",
                        "device": {"kind": "human_kit", "serial_number": "KIT-0001"},
                    }
                },
                {
                    "sensor": {
                        "kind": "gnss",
                        "device": {"kind": "human_kit", "serial_number": "KIT-0001"},
                    }
                },
            ],
        },
    }
    r.update(over)
    return r


def build(r=None, **kw):
    kw.setdefault("hw_rev", (1, 0))
    kw.setdefault("gnss_link", "usb")
    return manifest_from_calibration(r or row(), **kw)


def test_fields_come_from_the_record():
    m = build(extra_caps=["pps"])
    assert m.calib_id == 42
    assert m.serial == "KIT-0001"
    assert m.caps == {"gnss_rtk", "cam360", "pps"}
    assert m.frames["kit_cam360"].values() == (0.02, 0.0, 0.75, 0.0, 0.0, 1.5)
    assert set(m.frames) == {"kit_gnss", "kit_cam360"}


@pytest.mark.parametrize(
    "r, why",
    [
        (row(extrinsics={"camera_to_antenna_m": [0, 0, 0.15]}), "no extrinsics.kit_mount"),
        (row(valid_to="2026-10-01T00:00:00+00:00"), "expired"),
        (row(extrinsics={"kit_mount": {"kit_lidar": [0, 0, 1, 0, 0, 0]}}), "no lidar sensor"),
        (row(rig={"name": "empty", "rig_sensor": []}), "no gnss sensor"),
        (
            row(
                rig={
                    "name": "robot",
                    "rig_sensor": [
                        {"sensor": {"kind": k, "device": {"kind": "robot", "serial_number": "R1"}}}
                        for k in ("gnss", "camera_360")
                    ],
                }
            ),
            "exactly one scan kit",
        ),
        (
            row(
                rig={
                    "name": "r",
                    "rig_sensor": [
                        {
                            "sensor": {
                                "kind": "gnss",
                                "device": {"kind": "human_kit", "serial_number": "A"},
                            }
                        },
                        {
                            "sensor": {
                                "kind": "camera_360",
                                "device": {"kind": "human_kit", "serial_number": "B"},
                            }
                        },
                    ],
                }
            ),
            "exactly one scan kit",
        ),
    ],
)
def test_unusable_records_are_refused(r, why):
    with pytest.raises(CalibrationError, match=why):
        build(r, now=datetime(2026, 10, 27, tzinfo=UTC))


def test_robot_rules_still_apply():
    with pytest.raises(ManifestError, match="gnss_link is 'none'"):
        build(gnss_link="none")
    with pytest.raises(ManifestError, match="ASCII|8"):
        build(
            row(
                rig={
                    "name": "r",
                    "rig_sensor": [
                        {
                            "sensor": {
                                "kind": "gnss",
                                "device": {"kind": "human_kit", "serial_number": "KIT-000001"},
                            }
                        },
                        {
                            "sensor": {
                                "kind": "camera_360",
                                "device": {"kind": "human_kit", "serial_number": "KIT-000001"},
                            }
                        },
                    ],
                }
            )
        )


class FakeSupabase(BaseHTTPRequestHandler):
    rows: list = []
    seen: list = []

    def log_message(self, *a):
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if body["password"] != "pw":
            return self._send(400, {"error": "invalid_grant"})
        self._send(200, {"access_token": "tok"})

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        FakeSupabase.seen.append((self.headers["Authorization"], q))
        self._send(200, FakeSupabase.rows)


@pytest.fixture
def supabase(monkeypatch):
    server = HTTPServer(("127.0.0.1", 0), FakeSupabase)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    FakeSupabase.rows, FakeSupabase.seen = [row()], []
    env = {
        "SUPABASE_URL": f"http://127.0.0.1:{server.server_port}",
        "SUPABASE_ANON_KEY": "anon",
        "ORCHADOS_EMAIL": "field@example.com",
        "ORCHADOS_PASSWORD": "pw",
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    yield env
    server.shutdown()


def test_fetch_signs_in_and_asks_for_one_row(supabase):
    assert fetch_calibration(CAL_ID)["chip_id"] == 42
    auth, q = FakeSupabase.seen[0]
    assert auth == "Bearer tok"
    assert q["id"] == [f"eq.{CAL_ID}"]


def test_fetch_errors(supabase):
    FakeSupabase.rows = []
    with pytest.raises(CalibrationError, match="not found"):
        fetch_calibration(CAL_ID)
    with pytest.raises(CalibrationError, match="400"):
        fetch_calibration(CAL_ID, {**supabase, "ORCHADOS_PASSWORD": "bad"})
    with pytest.raises(CalibrationError, match="SUPABASE_URL"):
        fetch_calibration(CAL_ID, {})


def test_cli_writes_the_image_and_manifest(supabase, tmp_path, capsys):
    out, saved = tmp_path / "kit.bin", tmp_path / "manifest.json"
    args = ["from-calibration", CAL_ID, "--hw-rev", "1.0", "--gnss-link", "usb", "--cap", "pps"]
    assert main([*args, "--out", str(out), "--save-manifest", str(saved)]) == 0
    back = to_dict(decode(out.read_bytes()))
    assert back["calib_id"] == 42 and back["caps"] == ["cam360", "gnss_rtk", "pps"]
    saved_dict = json.loads(saved.read_text())
    assert saved_dict["frames"]["kit_cam360"] == [0.02, 0.0, 0.75, 0.0, 0.0, 1.5]
    assert {k: v for k, v in saved_dict.items() if k != "frames"} == {
        k: v for k, v in back.items() if k != "frames"
    }
    assert "no chip touched" in capsys.readouterr().out


def test_cli_reports_a_record_without_poses(supabase, capsys):
    FakeSupabase.rows = [row(extrinsics={})]
    args = ["from-calibration", CAL_ID, "--hw-rev", "1.0", "--gnss-link", "usb", "--dry-run"]
    assert main(args) == 1
    assert "kit_mount" in capsys.readouterr().err
