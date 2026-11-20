import json
import socket

from orchados_recorder import __version__
from orchados_recorder.ble import device_name
from orchados_recorder.cli import main
from orchados_recorder.clock import ChronySockFeed
from orchados_recorder.fakes import synthetic_nav_pvt
from orchados_recorder.receiver import QueuedTransport
from orchados_recorder.ubx import Framer, parse_nav_pvt


def test_device_name():
    assert device_name("2C:CF:67:12:1A:2B") == "orchados-gnss-1A2B"
    assert device_name("2c:cf:67:12:1a:2b") == "orchados-gnss-1A2B"


def test_bless_has_the_api_the_server_uses():
    # Only an import (no BlueZ here): guards against bless/bleak version breaks.
    from bless import BlessServer, GATTAttributePermissions, GATTCharacteristicProperties

    for name in ("add_new_service", "add_new_characteristic", "start", "stop", "update_value"):
        assert hasattr(BlessServer, name)
    for name in ("get_characteristic", "is_connected", "is_advertising"):
        assert hasattr(BlessServer, name)
    assert GATTCharacteristicProperties.notify and GATTAttributePermissions.writeable


def test_version(capsys):
    assert main(["version"]) == 0
    assert capsys.readouterr().out.strip() == __version__


def test_fake_run_writes_a_session(tmp_path, capsys):
    assert (
        main(
            [
                "fake-run",
                str(tmp_path),
                "--session-id",
                "S-1",
                "--parcel-id",
                "P-12",
                "--seconds",
                "20",
                "--lidar-gap",
                "5",
            ]
        )
        == 0
    )
    d = tmp_path / "sessions/S-1"
    events = (d / "gnss/events.csv").read_text()
    assert "lidar_lost" in events and "lidar_regained" in events
    kinds = [r.split(",")[2] for r in events.splitlines()[1:]]
    assert kinds[0] == "session_start" and kinds[-1] == "session_stop"
    assert kinds.count("qr_sync") == 2
    meta = json.loads((d / "gnss/session.json").read_text())
    assert meta["stop_reason"] == "command" and meta["recorder"] == "kit-recorder"
    rec = json.loads((d / "lidar/raw/recording.json").read_text())
    assert len(rec["gaps"]) == 1
    summary = json.loads(capsys.readouterr().out)
    assert summary["session_dir"] == str(d) and summary["lidar_gap_count"] == 1


def test_fake_run_refuses_a_bad_session_id(tmp_path):
    args = ["fake-run", str(tmp_path), "--session-id", "a b", "--parcel-id", "P", "--seconds", "5"]
    assert main(args) == 2


def test_chrony_feed_sends_the_receiver_time(tmp_path):
    path = tmp_path / "chrony.sock"
    server = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    server.bind(str(path))
    try:
        # Not on a full second: those solutions are not sent (they arrive late).
        unix_ns = 1_792_314_902_200_000_000
        (msg,) = Framer().feed(synthetic_nav_pvt(unix_ns))
        feed = ChronySockFeed(path)
        feed.send(parse_nav_pvt(msg.payload), unix_ns + 40_000_000)  # received 40 ms later
        server.settimeout(1.0)
        sample = server.recv(64)
        assert len(sample) == 40
        import struct

        sec, usec, offset, *_ = struct.unpack("<qqdiiii", sample)
        assert (sec, usec) == (1_792_314_902, 240_000)
        assert abs(offset + 0.040) < 1e-9
    finally:
        server.close()


def test_chrony_feed_without_chrony_does_not_raise(tmp_path):
    unix_ns = 1_792_314_902_000_000_000
    (msg,) = Framer().feed(synthetic_nav_pvt(unix_ns))
    ChronySockFeed(tmp_path / "missing.sock").send(parse_nav_pvt(msg.payload), unix_ns)


class _Inner:
    def __init__(self, chunks):
        self.chunks = list(chunks)
        self.reconnected = False
        self.written = []

    def read(self, max_bytes):
        import time

        if not self.chunks:
            time.sleep(0.01)
            return b""
        return self.chunks.pop(0)

    def write(self, data):
        self.written.append(data)


def test_queued_transport_reads_in_the_background():
    import time

    inner = _Inner([b"ab", b"cd"])
    t = QueuedTransport(inner)
    try:
        deadline = time.monotonic() + 2
        got = b""
        while got != b"abcd" and time.monotonic() < deadline:
            got += t.read(4096)
        assert got == b"abcd"
        t.write(b"x")
        assert inner.written == [b"x"]
        inner.reconnected = True
        assert t.reconnected
        t.reconnected = False
        assert not inner.reconnected
    finally:
        t.close()


def _recording_rig(tmp_path):
    from orchados_recorder.fakes import FakeRig
    from orchados_recorder.protocol import StartSession, encode_command

    rig = FakeRig(tmp_path / "ssd")
    rig.run(seconds=3)
    rig.command(encode_command(StartSession(1, "S-1", "P-12")))
    rig.run(seconds=2)
    assert rig.recorder.recording
    return rig


def _stop_reason(rig):
    d = rig.ssd / "sessions/S-1/gnss"
    meta = json.loads((d / "session.json").read_text())
    last = (d / "events.csv").read_text().splitlines()[-1].split(",")
    assert last[2:4] == ["session_stop", meta["stop_reason"]]
    return meta["stop_reason"]


def test_service_failure_closes_the_session_as_service_error(tmp_path, caplog):
    import threading

    from orchados_recorder.cli import serve

    rig = _recording_rig(tmp_path)

    async def broken():
        raise RuntimeError("tick blew up")

    assert serve(rig.recorder, broken, threading.Lock()) == 1
    assert not rig.recorder.recording and _stop_reason(rig) == "service_error"
    assert "tick blew up" in caplog.text and "service_error" in caplog.text


def test_clean_service_stop_closes_the_session_as_command(tmp_path):
    import threading

    from orchados_recorder.cli import serve

    rig = _recording_rig(tmp_path)

    async def stopped():
        raise KeyboardInterrupt  # SIGTERM

    assert serve(rig.recorder, stopped, threading.Lock()) == 0
    assert _stop_reason(rig) == "command"
