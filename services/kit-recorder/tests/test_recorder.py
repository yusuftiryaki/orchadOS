import json

from orchados_recorder.clock import Tracking
from orchados_recorder.fakes import FakeRig
from orchados_recorder.protocol import Alert, Check, Result
from orchados_recorder.ssd import SsdStatus

START = "01 07 03 53 2d 31 04 50 2d 31 32"  # start_session("S-1", "P-12"), seq 7


def qr_hex(text: str) -> str:
    return f"{len(text):02x}" + text.encode().hex()


def events(rig, session_id="S-1"):
    rows = (rig.ssd / "sessions" / session_id / "gnss/events.csv").read_text().splitlines()
    return [r.split(",") for r in rows[1:]]


def meta(rig, session_id="S-1"):
    return json.loads((rig.ssd / "sessions" / session_id / "gnss/session.json").read_text())


def u16(st, off):
    return int.from_bytes(st[off : off + 2], "little")


def test_idle_status_before_a_session(rig):
    st = rig.status()
    assert len(st) == 77 and st[0] == 1 and st[1] == 0 and st[51] == 1
    assert st[2] & 0x01 and st[2] & 0x08  # SSD present, clock locked to PPS
    assert st[2] & 0x20 and st[2] & 0x40  # gnssFixOK, position valid
    assert st[3] == 1 and st[4] == 1  # receiver ok, PPS locked
    assert st[52] == 1 and st[54] == 2 and st[55] == 0  # LiDAR streaming, PPS, pre-check ok
    assert st[20:22] == b"\x00\x00"  # battery not measured
    assert tuple(st[22:25]) == (0, 1, 0)
    assert int.from_bytes(st[31:39], "little") > 0  # GPS time
    assert int.from_bytes(st[59:63], "little") == 64_000
    assert u16(st, 63) == 200
    assert st[30] == 0xFF  # no command yet


def test_full_session_writes_files_and_status(rig):
    rig.cmd(START)
    assert rig.status()[30] == Result.OK and rig.status()[29] == 7 and rig.status()[1] == 1
    rig.cmd("03 08 02 " + qr_hex("OQ1:1476350122230:S-1"))
    assert rig.status()[30] == Result.OK
    rig.run(seconds=5)
    rig.cmd("02 09")
    st = rig.status()
    assert st[30] == Result.OK and st[1] == 0
    d = rig.ssd / "sessions/S-1"
    assert [r[2] for r in events(rig)] == ["session_start", "qr_sync", "session_stop"]
    start = events(rig)[0]
    assert start[3] == "parcel_id=P-12" and start[1] != "" and start[4] != "" and start[5] != ""
    assert (d / "gnss/gnss.ubx").stat().st_size > 0
    assert int.from_bytes(st[12:16], "little") == (d / "gnss/gnss.ubx").stat().st_size
    m = meta(rig)
    assert m["stop_reason"] == "command" and m["recorder"] == "kit-recorder"
    assert m["precheck_overrides"] == [] and m["clock_state_at_start"] == "pps"
    assert m["receiver"]["config_status"] == "ok" and m["receiver"]["port"] == "USB"
    rec = json.loads((d / "lidar/raw/recording.json").read_text())
    assert rec["schema"] == "orchados.lidar_recording/1"
    assert rec["session_id"] == "S-1" and rec["parcel_id"] == "P-12"
    assert rec["topics"] == {
        "points": "/unilidar/cloud",
        "imu": "/unilidar/imu",
        "ubx": "/orchados/gnss_ubx",
    }
    assert rec["segments"] == [{"file": "bag/bag_0.mcap", "bytes": 5 * 4096}]
    assert 5 * 64_000 <= rec["points_total"] <= 6 * 64_000
    assert rec["gaps"] == [] and rec["alerts"] == []
    assert rec["start_gps_ns"] and rec["stop_gps_ns"] > rec["start_gps_ns"]
    assert rec["clock_state_at_start"] == "pps" and rec["lidar_mode"] == "unknown"
    # Raw UBX goes to the bag too.
    assert b"".join(rig.lidar.published) == (d / "gnss/gnss.ubx").read_bytes()


def test_precheck_failure_blocks_start_unless_overridden(rig):
    rig.lidar.silent = True
    rig.run(seconds=4)
    assert rig.status()[55] & Check.LIDAR
    rig.cmd(START)
    assert rig.status()[30] == Result.PRECHECK_FAILED and rig.status()[1] == 0
    rig.cmd("01 08 03 53 2d 31 04 50 2d 31 32 01")
    assert rig.status()[30] == Result.OK
    assert rig.status()[57] == Check.LIDAR
    assert meta(rig)["precheck_overrides"] == ["lidar"]
    assert [r[2:4] for r in events(rig)][:2] == [
        ["session_start", "parcel_id=P-12"],
        ["precheck_override", "lidar"],
    ]


def test_receiver_cannot_be_overridden(rig):
    rig.receiver_sending = False
    rig.run(seconds=4)
    assert rig.status()[55] & Check.GNSS
    rig.cmd("01 08 03 53 2d 31 04 50 2d 31 32 07")
    assert rig.status()[30] == Result.PRECHECK_FAILED


def test_ssd_cannot_be_overridden(rig):
    rig.ssd_status = SsdStatus(False, 0, False)
    rig.run(seconds=1)
    assert rig.status()[55] & Check.SSD and not rig.status()[2] & 0x01
    rig.cmd("01 08 03 53 2d 31 04 50 2d 31 32 07")
    assert rig.status()[30] == Result.SD_MISSING
    rig.ssd_status = SsdStatus(True, 10 * 1024, False)
    rig.cmd("01 09 03 53 2d 31 04 50 2d 31 32 07")
    assert rig.status()[30] == Result.SD_FULL
    rig.ssd_status = SsdStatus(True, 100 * 1024, True)
    rig.cmd("01 0a 03 53 2d 31 04 50 2d 31 32 07")
    assert rig.status()[30] == Result.SD_ERROR


def test_command_errors_are_reported(rig):
    rig.cmd("03 05 01 01 33")
    assert rig.status()[29] == 5 and rig.status()[30] == Result.NOT_RECORDING
    rig.cmd("02 06")
    assert rig.status()[30] == Result.NOT_RECORDING
    rig.cmd("09 0b")
    assert rig.status()[29] == 0x0B and rig.status()[30] == Result.UNKNOWN_OPCODE
    rig.cmd(START)
    rig.cmd("01 0c 03 53 2d 32 04 50 2d 31 32")
    assert rig.status()[30] == Result.ALREADY_RECORDING


def test_restart_same_session_id_is_rejected(rig, tmp_path):
    rig.cmd(START)
    rig.run(seconds=2)  # the power goes off here: never stopped
    again = FakeRig(rig.ssd)
    assert meta(again)["stop_reason"] == "power_loss" and meta(again)["stop"] is None
    assert not again.recorder.recording
    again.run(seconds=3)
    assert again.status()[1] == 0  # no session started by itself
    again.cmd(START)
    assert again.status()[30] == Result.SESSION_EXISTS
    again.cmd("01 08 03 53 2d 32 04 50 2d 31 32")
    assert again.status()[30] == Result.OK


def test_ssd_removed_mid_session_stops_with_sd_error(rig):
    rig.cmd(START)
    rig.run(seconds=2)
    rig.ssd_status = SsdStatus(False, 0, False)
    st = rig.run(seconds=1)
    assert st[1] == 0 and st[2] & 0x01 == 0
    assert meta(rig)["stop_reason"] == "sd_error"
    assert [r[2:4] for r in events(rig)][-2:] == [
        ["sd_error", "ssd_lost"],
        ["session_stop", "sd_error"],
    ]
    st = rig.run(seconds=2)  # the service keeps running
    assert st[1] == 0


def test_ssd_removed_row_is_best_effort(rig, monkeypatch):
    rig.cmd(START)
    rig.run(seconds=2)

    def gone(*_a, **_kw):
        raise OSError(5, "Input/output error")

    monkeypatch.setattr(rig.recorder.writer, "event", gone)
    rig.ssd_status = SsdStatus(False, 0, False)
    st = rig.run(seconds=1)
    assert st[1] == 0 and st[2] & 0x04  # stopped, SSD error flag
    assert meta(rig)["stop_reason"] == "sd_error"


def test_write_error_stops_with_sd_error(rig, monkeypatch):
    rig.cmd(START)
    rig.run(seconds=1)
    writer = rig.recorder.writer

    def broken(data):
        raise OSError(5, "Input/output error")

    monkeypatch.setattr(writer, "append_gnss", broken)
    st = rig.run(seconds=1)
    assert st[1] == 0 and st[2] & 0x04  # SSD error flag
    assert meta(rig)["stop_reason"] == "sd_error"
    assert [r[2:4] for r in events(rig)][-2:] == [
        ["sd_error", "gnss_write"],
        ["session_stop", "sd_error"],
    ]


def test_ssd_full_mid_session_stops_with_sd_full(rig):
    rig.cmd(START)
    rig.run(seconds=1)
    rig.ssd_status = SsdStatus(True, 100, False)
    st = rig.run(seconds=1)
    assert st[1] == 0
    assert meta(rig)["stop_reason"] == "sd_full"
    assert [r[2:4] for r in events(rig)][-2:] == [
        ["sd_error", "sd_full"],
        ["session_stop", "sd_full"],
    ]


def test_ble_disconnect_does_not_stop_recording(rig):
    # The recorder has no BLE state: no commands for 30 s change nothing.
    rig.cmd(START)
    rig.run(seconds=10)
    ubx = rig.ssd / "sessions/S-1/gnss/gnss.ubx"
    size = ubx.stat().st_size
    st = rig.run(seconds=20)
    assert st[1] == 1 and rig.recorder.recording
    assert ubx.stat().st_size > size
    assert st[56] == 0  # no alerts


# chrony on the receiver's USB time: converged (error 2.3 ms) or not (12.3 ms).
USB_LOCKED = Tracking("GNSS", 300, True, 0, 2000)
USB_UNCONVERGED = Tracking("GNSS", 300, True, 0, 12_000)


def test_unlocked_clock_events_have_empty_gps_time(rig):
    rig.clock.tracking_value = USB_UNCONVERGED
    rig.clock.pps_enabled = False
    rig.run(seconds=2)
    st = rig.status()
    assert st[54] == 0 and st[55] == Check.CLOCK and st[4] == 2  # unlocked, PPS lost
    assert int.from_bytes(st[31:39], "little") == 0 and not st[2] & 0x08
    rig.cmd(START)
    assert rig.status()[30] == Result.PRECHECK_FAILED
    rig.cmd("01 08 03 53 2d 31 04 50 2d 31 32 04")
    assert rig.status()[30] == Result.OK
    row = events(rig)[0]
    assert row[2] == "session_start" and row[1] == "" and row[4:] == ["", ""]
    assert meta(rig)["clock_state_at_start"] == "unlocked"
    assert meta(rig)["start"]["gps_time_ns"] is None
    st = rig.run(seconds=1)
    assert st[56] & Alert.CLOCK_UNLOCKED


def test_clock_lock_lost_and_regained_mid_session(rig):
    rig.cmd(START)
    rig.run(seconds=1)
    rig.clock.pps_enabled = False
    rig.run(seconds=3)
    rig.clock.pps_enabled = True
    rig.run(seconds=2)
    kinds = [r[2] for r in events(rig)]
    assert kinds[1:3] == ["pps_lost", "pps_regained"]


def test_usb_clock_is_locked_without_anchor(rig):
    rig.clock.tracking_value = USB_LOCKED
    rig.clock.pps_enabled = False  # no PPS wire
    rig.run(seconds=2)
    st = rig.status()
    assert st[54] == 1 and st[55] & Check.CLOCK == 0 and st[2] & 0x08
    assert int.from_bytes(st[31:39], "little") != 0
    rig.cmd(START)
    assert rig.status()[30] == Result.OK
    row = events(rig)[0]
    assert row[2] == "session_start" and row[1] != "" and row[4:] == ["", ""]
    assert meta(rig)["clock_state_at_start"] == "usb"
    assert meta(rig)["start"]["gps_time_ns"] is not None
    st = rig.run(seconds=1)
    assert not st[56] & Alert.CLOCK_UNLOCKED
    # The lock drops (chrony's error grows) and comes back.
    rig.clock.tracking_value = USB_UNCONVERGED
    st = rig.run(seconds=2)
    assert st[56] & Alert.CLOCK_UNLOCKED
    rig.clock.tracking_value = USB_LOCKED
    rig.run(seconds=2)
    kinds = [r[2] for r in events(rig)]
    assert kinds[1:3] == ["pps_lost", "pps_regained"]


def test_status_reports_lidar_gap(rig):
    rig.cmd(START)
    rig.run(seconds=3)
    rig.lidar.silent = True
    st = rig.run(seconds=5)
    assert st[52] == 2 and st[56] & Alert.LIDAR_SILENT
    rig.lidar.silent = False
    st = rig.run(seconds=3)
    assert u16(st, 65) == 1 and u16(st, 67) >= 5
    assert st[52] == 1 and not st[56] & Alert.LIDAR_SILENT
    kinds = [r[2] for r in events(rig)]
    assert kinds.index("lidar_lost") < kinds.index("lidar_regained")
    rig.cmd("02 09")
    st = rig.status()
    assert u16(st, 65) == 1  # kept after the stop for the summary
    rec = json.loads((rig.ssd / "sessions/S-1/lidar/raw/recording.json").read_text())
    assert len(rec["gaps"]) == 1 and rec["gaps"][0]["start_gps_ns"] is not None
    assert {a["type"] for a in rec["alerts"]} >= {"lidar_silent"}


def test_dead_bag_is_reported(rig):
    rig.cmd(START)
    rig.run(seconds=2)
    rig.popen.current.die()
    st = rig.run(seconds=1)
    assert st[56] & Alert.LIDAR_NOT_WRITTEN and st[1] == 1
    assert ["sd_error", "lidar_write"] in [r[2:4] for r in events(rig)]


def test_receiver_unplugged_mid_session(rig):
    rig.cmd(START)
    rig.run(seconds=2)
    rig.transport.disconnect()
    st = rig.run(seconds=5)
    assert st[1] == 1 and st[56] & Alert.GNSS_SILENT
    rig.transport.reconnect()
    st = rig.run(seconds=2)
    assert not st[56] & Alert.GNSS_SILENT and st[3] == 1
    kinds = [r[2] for r in events(rig)]
    assert kinds.index("gnss_lost") < kinds.index("gnss_regained")
    valsets = [w for w in rig.transport.written if w[2:4] == b"\x06\x8a"]
    assert len(valsets) == 2  # configured again after the reconnect


def test_wrong_lidar_mode_blocks_start(rig):
    rig.lidar.mode_value = "wrong"
    rig.cmd(START)
    st = rig.status()
    assert st[30] == Result.PRECHECK_FAILED and st[53] == 2 and st[55] & Check.LIDAR_MODE
    rig.cmd("01 08 03 53 2d 31 04 50 2d 31 32 02")
    assert rig.status()[30] == Result.OK and rig.status()[57] == Check.LIDAR_MODE


def test_open_session_is_recovered_when_the_ssd_appears_later(tmp_path):
    # Boot: the SSD is mounted after the service started (fstab nofail).
    first = FakeRig(tmp_path / "ssd")
    first.run(seconds=3)
    first.cmd(START)
    first.run(seconds=2)  # the power goes off here
    rig = FakeRig(tmp_path / "ssd", ssd_status=SsdStatus(False, 0, False))
    rig.run(seconds=2)
    assert meta(rig)["stop_reason"] is None  # not looked at: the SSD is not there
    rig.ssd_status = SsdStatus(True, 400 * 1024, False)
    rig.run(seconds=1)
    assert meta(rig)["stop_reason"] == "power_loss" and meta(rig)["stop"] is None
    rig.run(seconds=2)
    rig.cmd(START)
    assert rig.status()[30] == Result.SESSION_EXISTS


def test_session_that_could_not_be_closed_is_closed_when_the_ssd_returns(rig, monkeypatch):
    rig.cmd(START)
    rig.run(seconds=2)
    writer = rig.recorder.writer

    def gone(*_a, **_kw):
        raise OSError(5, "Input/output error")

    for name in ("event", "close", "write_recording_json"):
        monkeypatch.setattr(writer, name, gone)
    rig.ssd_status = SsdStatus(False, 0, False)
    rig.run(seconds=1)
    assert not rig.recorder.recording and meta(rig)["stop_reason"] is None
    rig.ssd_status = SsdStatus(True, 400 * 1024, False)
    rig.run(seconds=1)
    assert meta(rig)["stop_reason"] == "sd_error"


def test_stop_time_is_taken_before_the_bag_is_stopped(rig, monkeypatch):
    # ros2 bag may take up to ~15 s to close its last segment.
    rig.cmd(START)
    rig.run(seconds=2)
    stop_bag = rig.bag.stop

    def slow_stop(*a, **kw):
        rig.clock.advance_us(12_000_000)
        stop_bag(*a, **kw)

    monkeypatch.setattr(rig.bag, "stop", slow_stop)
    before = rig.clock.now_mono_us()
    rig.cmd("02 09")
    assert meta(rig)["stop"]["esp_micros"] == before
    assert events(rig)[-1][0] == str(before)
    rec = json.loads((rig.ssd / "sessions/S-1/lidar/raw/recording.json").read_text())
    assert rec["stop_gps_ns"] == meta(rig)["stop"]["gps_time_ns"]


def test_receiver_not_ready_at_start_is_configured_later(tmp_path):
    from orchados_recorder.receiver import FakeTransport

    rig = FakeRig(tmp_path / "ssd", transport=FakeTransport(respond_to_valset=None))
    rig.run(seconds=3)
    st = rig.status()
    assert st[3] == 2 and st[55] & Check.GNSS  # no_response; cannot be overridden
    rig.transport.respond_to_valset = "ack"
    st = rig.run(seconds=6)
    assert st[3] == 1 and not st[55] & Check.GNSS
    rig.cmd(START)
    assert rig.status()[30] == Result.OK
    assert meta(rig)["receiver"]["config_status"] == "ok"


def test_bytes_lost_to_a_reconfiguration_are_dropped_bytes(rig):
    rig.cmd(START)
    rig.run(seconds=2)
    rig.transport.disconnect()
    rig.run(seconds=1)
    rig.transport.reconnect()
    st = rig.run(seconds=2)
    dropped = int.from_bytes(st[25:29], "little")
    assert dropped > 0 and st[2] & 0x10  # data dropped in this session
    rig.cmd("02 09")
    assert meta(rig)["dropped_bytes"] == dropped
    assert int.from_bytes(rig.status()[25:29], "little") == dropped  # kept for the summary
    rig.cmd("01 0a 03 53 2d 32 04 50 2d 31 32")
    st = rig.status()
    assert int.from_bytes(st[25:29], "little") == 0 and not st[2] & 0x10


def test_dead_bag_is_restarted_into_a_new_folder(rig):
    rig.cmd(START)
    rig.run(seconds=3)
    rig.popen.current.die()
    st = rig.run(seconds=1)
    assert st[56] & Alert.LIDAR_NOT_WRITTEN and len(rig.popen.procs) == 1
    st = rig.run(seconds=3)  # first restart after 2 s
    assert len(rig.popen.procs) == 2
    assert rig.popen.current.out_dir == rig.ssd / "sessions/S-1/lidar/raw/bag.1"
    st = rig.run(seconds=2)
    assert st[1] == 1 and not st[56] & Alert.LIDAR_NOT_WRITTEN
    kinds = [r[2:4] for r in events(rig)]
    death = kinds.index(["sd_error", "lidar_write"])
    assert kinds[death + 1] == ["lidar_bag_restart", "bag.1"]
    # Dies again at once: logged again, the next try waits longer (4 s).
    rig.popen.current.die()
    rig.run(seconds=3)
    assert len(rig.popen.procs) == 2
    rig.run(seconds=2)
    assert len(rig.popen.procs) == 3
    assert rig.popen.current.out_dir.name == "bag.2"
    assert [r[2:4] for r in events(rig)].count(["sd_error", "lidar_write"]) == 2
    rig.run(seconds=2)
    rig.cmd("02 09")
    rec = json.loads((rig.ssd / "sessions/S-1/lidar/raw/recording.json").read_text())
    assert [s["file"] for s in rec["segments"]] == [
        "bag/bag_0.mcap",
        "bag.1/bag.1_0.mcap",
        "bag.2/bag.2_0.mcap",
    ]
    total = sum(s["bytes"] for s in rec["segments"])
    assert int.from_bytes(rig.status()[69:73], "little") == total >> 20


def test_bag_that_never_started_is_retried(rig, monkeypatch):
    real = rig.popen.__call__
    calls = []

    def flaky(cmd, **kw):
        calls.append(cmd)
        if len(calls) == 1:
            raise FileNotFoundError("ros2")
        return real(cmd, **kw)

    rig.bag.popen = flaky
    rig.cmd(START)
    assert rig.status()[30] == Result.OK
    rig.run(seconds=4)
    assert len(calls) == 2 and rig.bag.alive()
    assert rig.popen.current.out_dir.name == "bag"
    assert ["lidar_bag_restart", "bag"] in [r[2:4] for r in events(rig)]
