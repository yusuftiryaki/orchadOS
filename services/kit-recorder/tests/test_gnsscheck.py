"""gnss-check against a scripted receiver on a fake clock (no device)."""

from __future__ import annotations

import struct

import pytest

from orchados_recorder import cli
from orchados_recorder.gnsscheck import (
    CFG_MSGOUT_NAV_SIG_USB,
    CLASS_MON,
    ID_MON_RF,
    ID_MON_VER,
    ID_NAV_SIG,
    Report,
    format_report,
    nav_sig_signals,
    parse_mon_ver,
    rawx_phase_satellites,
    run_check,
    verdict,
)
from orchados_recorder.ubx import (
    CLASS_ACK,
    CLASS_CFG,
    CLASS_NAV,
    CLASS_RXM,
    ID_ACK_ACK,
    ID_ACK_NAK,
    ID_CFG_VALSET,
    ID_NAV_PVT,
    ID_RXM_RAWX,
    ID_RXM_SFRBX,
    Framer,
    NavPvt,
    build_nav_pvt,
    frame,
)

GPS_L1, GPS_L2CL, GAL_E1C, GAL_E5BQ = (0, 0), (0, 3), (2, 0), (2, 6)


def mon_ver(module: str = "ZED-F9P") -> bytes:
    def pad(text: str, n: int) -> bytes:
        return text.encode().ljust(n, b"\0")

    ext = ["ROM BASE 0x118B2060", "FWVER=HPG 1.32", "PROTVER=27.31", f"MOD={module}"]
    return (
        pad("EXT CORE 1.00 (0fa0ae)", 30) + pad("00190000", 10) + b"".join(pad(e, 30) for e in ext)
    )


def mon_rf() -> bytes:
    block = bytes([0, 0, 1, 2]) + bytes(12) + bytes([5]) + bytes(7)
    return bytes([0, 1, 0, 0]) + block


def nav_sig(signals: list[tuple[tuple[int, int], int, int]]) -> bytes:
    """signals: ((gnssId, sigId), svId, cno)."""
    body = struct.pack("<IBB2s", 0, 0, len(signals), b"\0\0")
    for (g, sig), sv, cno in signals:
        body += struct.pack("<BBBBhBBBBH4s", g, sv, sig, 0, 0, cno, 7, 0, 0, 0x08, b"\0" * 4)
    return body


def rawx(meas: list[tuple[tuple[int, int], int, int, int]]) -> bytes:
    """meas: ((gnssId, sigId), svId, cno, trkStat)."""
    body = struct.pack("<dHbBBB2s", 0.0, 2342, 18, len(meas), 0x01, 1, b"\0\0")
    for (g, sig), sv, cno, trk in meas:
        body += struct.pack(
            "<ddfBBBBHBBBBBB", 2e7, 1e8, 0.0, g, sv, sig, 0, 1000, cno, 0, 0, 0, trk, 0
        )
    return body


def pvt(fix_type: int, num_sv: int) -> bytes:
    p = NavPvt(
        year=2026, month=11, day=20, hour=14, minute=1, second=45, valid=0x07,
        fix_type=fix_type, flags=0x01 if fix_type else 0, num_sv=num_sv, h_acc_mm=1630,
    )  # fmt: skip
    return build_nav_pvt(p)


class Clock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


class SkyReceiver:
    """A ZED-F9P under the sky: NMEA until configured, then 5 Hz NAV-PVT and
    NAV-SIG, 1 Hz RAWX and SFRBX. Every read is one 200 ms epoch."""

    def __init__(
        self,
        clock: Clock,
        *,
        fix_after_s: float | None = 5.0,
        dual: int = 12,
        second_band: bool = True,
        module: str = "ZED-F9P",
        answer_mon: bool = True,
        valset: str = "ack",
    ) -> None:
        self.clock = clock
        self.fix_after_s = fix_after_s
        self.dual = dual
        self.second_band = second_band
        self.module = module
        self.answer_mon = answer_mon
        self.valset = valset
        self.configured_at: float | None = None
        self.nav_sig_on = False
        self.pending = bytearray()
        self.written: list[bytes] = []
        self.epoch = 0

    def write(self, data: bytes) -> None:
        self.written.append(bytes(data))
        cls, msg_id = data[2], data[3]
        if (cls, msg_id) == (CLASS_CFG, ID_CFG_VALSET):
            if not self.valset:
                return
            ack = ID_ACK_ACK if self.valset == "ack" else ID_ACK_NAK
            self.pending += frame(CLASS_ACK, ack, bytes([CLASS_CFG, ID_CFG_VALSET]))
            if self.valset == "ack":
                key = CFG_MSGOUT_NAV_SIG_USB.to_bytes(4, "little")
                i = data.find(key)
                if i >= 0:
                    self.nav_sig_on = bool(data[i + 4])
                if self.configured_at is None:
                    self.configured_at = self.clock.t
        elif self.answer_mon and (cls, msg_id) == (CLASS_MON, ID_MON_VER):
            self.pending += frame(CLASS_MON, ID_MON_VER, mon_ver(self.module))
        elif self.answer_mon and (cls, msg_id) == (CLASS_MON, ID_MON_RF):
            self.pending += frame(CLASS_MON, ID_MON_RF, mon_rf())

    def read(self, _max_bytes: int) -> bytes:
        self.clock.t += 0.2
        out = bytes(self.pending)
        self.pending.clear()
        if self.configured_at is None:
            return out + b"$GNGGA,,,,*00\r\n$GNRMC,,,,*00\r\n"
        self.epoch += 1
        since = self.clock.t - self.configured_at
        fixed = self.fix_after_s is not None and since >= self.fix_after_s
        out += frame(CLASS_NAV, ID_NAV_PVT, pvt(3 if fixed else 0, 14 if fixed else 0))
        sigs = [(GPS_L1, sv, 44) for sv in range(1, self.dual + 3)]
        if self.second_band:
            sigs += [(GPS_L2CL, sv, 38) for sv in range(1, self.dual + 1)]
        if self.nav_sig_on:
            out += frame(CLASS_NAV, ID_NAV_SIG, nav_sig(sigs))
        if self.epoch % 5 == 0:
            phase = 0x03 if fixed else 0x01
            out += frame(CLASS_RXM, ID_RXM_RAWX, rawx([(s, sv, c, phase) for s, sv, c in sigs]))
            if fixed:
                out += frame(CLASS_RXM, ID_RXM_SFRBX, bytes(16))
        return out


def check(**kw) -> tuple[Report, SkyReceiver]:
    clock = Clock()
    rx = SkyReceiver(clock, **kw)
    return run_check(rx, 60, now=clock), rx


def test_good_receiver_passes():
    report, rx = check()
    assert report.default_nmea > 0 and report.default_ubx == 0
    assert report.version["module"] == "ZED-F9P"
    assert report.version["firmware"] == "HPG 1.32"
    assert report.rf == [{"block": 0, "antenna": "DONTKNOW", "jamming_state": 0, "jam_ind": 5}]
    assert report.config == "ok"
    assert report.counts["NAV-PVT"] == pytest.approx(300, abs=2)
    assert report.counts["RXM-RAWX"] == pytest.approx(60, abs=1)
    assert report.counts["RXM-SFRBX"] > 0
    assert report.first_fix_s == pytest.approx(5.0, abs=0.5)
    assert report.max_used_sv == 14
    assert report.last_fix["utc"] == "2026-11-20T14:01:45Z"
    assert report.dual_band_best == 12 and report.phase_first_last == 14
    assert report.signals == {"GPS L1C/A": 44, "GPS L2CL": 38}
    assert verdict(report) == ([], [])
    assert "RESULT: PASS" in format_report(report, [], [])
    # NAV-SIG is on only for the check: the last VALSET turns it off again.
    assert not rx.nav_sig_on


def test_raw_stream_is_copied(tmp_path):
    clock = Clock()
    out = tmp_path / "bench.ubx"
    with open(out, "wb") as raw:
        run_check(SkyReceiver(clock), 20, raw=raw, now=clock)
    msgs = Framer().feed(out.read_bytes())
    assert sum((m.cls, m.msg_id) == (CLASS_RXM, ID_RXM_RAWX) for m in msgs) == pytest.approx(
        20, abs=1
    )


def test_blocked_sky_warns():
    report, _ = check(dual=6)
    fails, warns = verdict(report)
    assert fails == []
    assert any("6 satellites with phase on both bands" in w for w in warns)
    assert verdict(report, min_dual=6) == ([], [])


def test_slow_fix_warns():
    clock = Clock()
    report = run_check(SkyReceiver(clock, fix_after_s=150), 200, now=clock)
    fails, warns = verdict(report)
    assert fails == [] and any("first 3D fix after 150 s" in w for w in warns)


def test_no_fix_fails():
    report, _ = check(fix_after_s=None)
    fails, _ = verdict(report)
    assert any("no 3D fix" in f for f in fails)
    assert any("RXM-SFRBX" in f for f in fails)
    assert any("second band" in f for f in fails)


def test_single_band_antenna_fails():
    report, _ = check(second_band=False)
    fails, _ = verdict(report)
    assert fails == ["no satellite with carrier phase on the second band (L2/E5b)"]


def test_wrong_module_fails():
    report, _ = check(module="NEO-M8P")
    assert verdict(report)[0] == ["module is 'NEO-M8P', expected ZED-F9P"]


@pytest.mark.parametrize(("valset", "status"), [("nak", "nak"), (None, "no_response")])
def test_configuration_not_accepted_stops_the_check(valset, status):
    report, rx = check(valset=valset)
    assert report.config == status and report.counts == {}
    assert verdict(report)[0] == [f"configuration: {status}"]


def test_silent_port_fails():
    report, _ = check(answer_mon=False, valset=None)
    fails, _ = verdict(report)
    assert fails[0].startswith("no answer to MON-VER")


def test_parsers_on_real_shapes():
    v = parse_mon_ver(mon_ver())
    assert v["sw"] == "EXT CORE 1.00 (0fa0ae)" and v["hw"] == "00190000"
    assert nav_sig_signals(nav_sig([(GAL_E5BQ, 7, 39)])) == [("GAL E5bQ", 39)]
    first, second = rawx_phase_satellites(
        rawx([(GAL_E1C, 7, 40, 0x03), (GAL_E5BQ, 7, 39, 0x03), (GPS_L2CL, 9, 30, 0x01)])
    )
    assert first == {(2, 7)} and second == {(2, 7)}  # GPS 9 has no valid phase


def test_cli_missing_port(capsys):
    assert cli.main(["gnss-check", "--port", "/dev/does-not-exist"]) == 2
    assert "not found" in capsys.readouterr().err
