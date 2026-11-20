"""`orchados-recorder gnss-check`: a bench test of the receiver, antenna and cable.

Run with the antenna under open sky and the service stopped (the port has one
owner). Steps: what the receiver sends by default, MON-VER, MON-RF, the
recorder's own USB_CONFIG to RAM (plus NAV-SIG for this check), then
`seconds` of logging. At the end NAV-SIG is switched off again; everything is in
the RAM layer, a power cycle restores the receiver's saved settings.

The verdict (docs/kit-siparis-listesi.md, "Doğrulanacaklar"):
- fail: no answer or not a ZED-F9P, configuration not ACKed, NAV-PVT or
  RXM-RAWX below 90 % of their rate, no RXM-SFRBX, no 3D fix, no satellite
  with carrier phase on the second band;
- warn: fewer than `min_dual` satellites with carrier phase on both bands at
  best (sky partly blocked, or a weak antenna), first 3D fix later than 120 s;
  with the system clock on an NTP server, a USB latency more than 5 ms away from
  chrony's `offset` for the receiver (CHRONY_USB_OFFSET_MS).

USB latency: the system time at which a NAV-PVT is read minus its epoch's UTC,
over 3D-fix solutions off the full second (those wait for RXM-RAWX). It is the
receiver's delay only when the system clock is right, i.e. set by NTP; against
the receiver itself (chrony on GNSS or PPS) it measures nothing.
"""

from __future__ import annotations

import statistics
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from typing import BinaryIO

from .receiver import NAV_PVT_RATE_HZ, RAWX_RATE_HZ, USB_CONFIG, Transport
from .thresholds import CHRONY_USB_OFFSET_MS
from .ubx import (
    CLASS_CFG,
    CLASS_NAV,
    CLASS_RXM,
    ID_CFG_VALSET,
    ID_NAV_PVT,
    ID_RXM_RAWX,
    ID_RXM_SFRBX,
    NAV_PVT_LEN,
    Framer,
    UbxMessage,
    cfg_valset_ram,
    frame,
    is_ack,
    parse_nav_pvt,
)

CLASS_MON = 0x0A
ID_MON_VER = 0x04
ID_MON_RF = 0x38
ID_NAV_SIG = 0x43
CFG_MSGOUT_NAV_SIG_USB = 0x20910348

DEFAULT_OUTPUT_S = 3.0
POLL_TIMEOUT_S = 2.0
RATE_MARGIN = 0.9
SLOW_FIX_S = 120.0
DEFAULT_MIN_DUAL = 10
LATENCY_TOLERANCE_MS = 5
RECEIVER_REFERENCES = ("GNSS", "PPS")  # chrony references that are the receiver itself

GNSS = {0: "GPS", 1: "SBAS", 2: "GAL", 3: "BDS", 5: "QZSS", 6: "GLO"}
# (gnssId, sigId) -> signal (u-blox F9P interface description, signal identifiers).
SIGNALS = {
    (0, 0): "L1C/A", (0, 3): "L2CL", (0, 4): "L2CM",
    (1, 0): "L1C/A",
    (2, 0): "E1C", (2, 1): "E1B", (2, 5): "E5bI", (2, 6): "E5bQ",
    (3, 0): "B1I", (3, 1): "B1I", (3, 2): "B2I", (3, 3): "B2I",
    (5, 0): "L1C/A", (5, 1): "L1S", (5, 4): "L2CM", (5, 5): "L2CL",
    (6, 0): "L1OF", (6, 2): "L2OF",
}  # fmt: skip
SECOND_BAND = {"L2CL", "L2CM", "E5bI", "E5bQ", "B2I", "L2OF"}
ANTENNA = {0: "INIT", 1: "DONTKNOW", 2: "OK", 3: "SHORT", 4: "OPEN"}
FIX_TYPES = {0: "no fix", 1: "dead reckoning", 2: "2D", 3: "3D", 4: "GNSS+DR", 5: "time only"}
MESSAGE_NAMES = {
    (CLASS_NAV, ID_NAV_PVT): "NAV-PVT",
    (CLASS_NAV, ID_NAV_SIG): "NAV-SIG",
    (CLASS_RXM, ID_RXM_RAWX): "RXM-RAWX",
    (CLASS_RXM, ID_RXM_SFRBX): "RXM-SFRBX",
}


def signal_name(gnss_id: int, sig_id: int) -> str:
    return f"{GNSS.get(gnss_id, str(gnss_id))} {SIGNALS.get((gnss_id, sig_id), str(sig_id))}"


def is_second_band(name: str) -> bool:
    return name.split(" ", 1)[1] in SECOND_BAND


def parse_mon_ver(payload: bytes) -> dict:
    def text(b: bytes) -> str:
        return b.split(b"\0", 1)[0].decode("ascii", errors="replace")

    ext = [text(payload[i : i + 30]) for i in range(40, len(payload), 30)]
    module = next((e[4:] for e in ext if e.startswith("MOD=")), None)
    firmware = next((e[6:] for e in ext if e.startswith("FWVER=")), None)
    return {
        "sw": text(payload[:30]),
        "hw": text(payload[30:40]),
        "module": module,
        "firmware": firmware,
        "extensions": ext,
    }


def parse_mon_rf(payload: bytes) -> list[dict]:
    blocks = []
    for b in range(payload[1] if len(payload) > 1 else 0):
        o = 4 + 24 * b
        if len(payload) < o + 24:
            break
        blk = payload[o : o + 24]
        blocks.append(
            {
                "block": blk[0],
                "antenna": ANTENNA.get(blk[2], str(blk[2])),
                "jamming_state": blk[1] & 0x03,
                "jam_ind": blk[16],
            }
        )
    return blocks


def nav_sig_signals(payload: bytes) -> list[tuple[str, int]]:
    """(signal name, C/N0 dB-Hz) for every signal in a NAV-SIG message."""
    out = []
    for i in range(payload[5] if len(payload) > 5 else 0):
        o = 8 + 16 * i
        if len(payload) < o + 16:
            break
        gnss_id, _sv, sig_id = payload[o], payload[o + 1], payload[o + 2]
        out.append((signal_name(gnss_id, sig_id), payload[o + 6]))
    return out


def rawx_phase_satellites(payload: bytes) -> tuple[set, set]:
    """Satellites (gnssId, svId) with valid carrier phase on the first and the second band."""
    first: set = set()
    second: set = set()
    for i in range(payload[11] if len(payload) > 11 else 0):
        o = 16 + 32 * i
        if len(payload) < o + 32:
            break
        gnss_id, sv_id, sig_id, trk = (
            payload[o + 20],
            payload[o + 21],
            payload[o + 22],
            payload[o + 30],
        )
        if not trk & 0x02:  # cpValid
            continue
        band = second if is_second_band(signal_name(gnss_id, sig_id)) else first
        band.add((gnss_id, sv_id))
    return first, second


@dataclass
class Report:
    seconds: float
    default_nmea: int = 0
    default_ubx: int = 0
    version: dict | None = None
    rf: list[dict] = field(default_factory=list)
    config: str = "no_response"
    counts: dict[str, int] = field(default_factory=dict)
    checksum_errors: int = 0
    first_fix_s: float | None = None
    last_fix: dict | None = None
    max_used_sv: int = 0
    signals: dict[str, int] = field(default_factory=dict)
    dual_band_best: int = 0
    dual_band_last: int = 0
    phase_first_last: int = 0
    phase_second_last: int = 0
    usb_latency_ms: dict | None = None  # median, min, max, n
    clock_reference: str | None = None  # chrony's reference, set by the caller

    def to_dict(self) -> dict:
        return asdict(self)


class _Reader:
    """Reads the transport against a clock, frames UBX and copies raw bytes to `raw`."""

    def __init__(
        self,
        transport: Transport,
        now: Callable[[], float],
        raw: BinaryIO | None,
        wall: Callable[[], int] = time.time_ns,
    ):
        self.transport = transport
        self.now = now
        self.raw = raw
        self.wall = wall
        self.framer = Framer()
        # System time (Unix ns) at which each message of the last read_for was read.
        self.walls: list[int] = []

    def read_for(
        self, seconds: float, until: Callable[[UbxMessage], bool] | None = None
    ) -> tuple[list[UbxMessage], int]:
        """Messages and NMEA sentences read for `seconds`, or up to the first `until`."""
        msgs: list[UbxMessage] = []
        self.walls = []
        nmea = 0
        end = self.now() + seconds
        while self.now() < end:
            data = self.transport.read(4096)
            if not data:
                continue
            rx_ns = self.wall()
            nmea += data.count(b"$G")
            if self.raw is not None:
                self.raw.write(data)
            for m in self.framer.feed(data):
                msgs.append(m)
                self.walls.append(rx_ns)
                if until is not None and until(m):
                    return msgs, nmea
        return msgs, nmea

    def poll(self, cls: int, msg_id: int) -> UbxMessage | None:
        self.transport.write(frame(cls, msg_id, b""))
        msgs, _ = self.read_for(
            POLL_TIMEOUT_S, lambda m: m.cls == cls and m.msg_id == msg_id and len(m.payload) > 0
        )
        found = [m for m in msgs if m.cls == cls and m.msg_id == msg_id and len(m.payload) > 0]
        return found[-1] if found else None

    def valset(self, items: list[tuple[int, int, int]]) -> str:
        self.transport.write(cfg_valset_ram(items))
        msgs, _ = self.read_for(
            POLL_TIMEOUT_S, lambda m: is_ack(m, CLASS_CFG, ID_CFG_VALSET) is not None
        )
        answers = [is_ack(m, CLASS_CFG, ID_CFG_VALSET) for m in msgs]
        answers = [a for a in answers if a is not None]
        if not answers:
            return "no_response"
        return "ok" if answers[-1] else "nak"


def run_check(
    transport: Transport,
    seconds: float,
    *,
    raw: BinaryIO | None = None,
    now: Callable[[], float] = time.monotonic,
    wall: Callable[[], int] = time.time_ns,
) -> Report:
    report = Report(seconds=seconds)
    r = _Reader(transport, now, raw, wall)

    msgs, report.default_nmea = r.read_for(DEFAULT_OUTPUT_S)
    report.default_ubx = len(msgs)
    ver = r.poll(CLASS_MON, ID_MON_VER)
    report.version = parse_mon_ver(ver.payload) if ver else None
    rf = r.poll(CLASS_MON, ID_MON_RF)
    report.rf = parse_mon_rf(rf.payload) if rf else []
    report.config = r.valset(USB_CONFIG + [(CFG_MSGOUT_NAV_SIG_USB, 1, 1)])
    if report.config != "ok":
        return report

    counts: Counter = Counter()
    latencies: list[float] = []
    start = now()
    while now() - start < seconds:
        msgs, _ = r.read_for(min(1.0, seconds - (now() - start)))
        for m, rx_ns in zip(msgs, r.walls, strict=True):
            key = (m.cls, m.msg_id)
            if key in MESSAGE_NAMES:
                counts[MESSAGE_NAMES[key]] += 1
            if key == (CLASS_NAV, ID_NAV_PVT) and len(m.payload) == NAV_PVT_LEN:
                pvt = parse_nav_pvt(m.payload)
                if pvt.gnss_fix_ok and pvt.fix_type in (3, 4):
                    if report.first_fix_s is None:
                        report.first_fix_s = round(now() - start, 1)
                    utc_ns = pvt.utc_unix_ns()
                    if utc_ns is not None and pvt.i_tow_ms % 1000:
                        latencies.append((rx_ns - utc_ns) / 1e6)
                    report.max_used_sv = max(report.max_used_sv, pvt.num_sv)
                report.last_fix = {
                    "fix": FIX_TYPES.get(pvt.fix_type, str(pvt.fix_type)),
                    "fix_ok": pvt.gnss_fix_ok,
                    "num_sv": pvt.num_sv,
                    "h_acc_m": round(pvt.h_acc_mm / 1000, 2),
                    "carr_soln": pvt.carr_soln,
                    "utc": (
                        f"{pvt.year}-{pvt.month:02d}-{pvt.day:02d}T"
                        f"{pvt.hour:02d}:{pvt.minute:02d}:{pvt.second:02d}Z"
                        if pvt.time_resolved
                        else None
                    ),
                }
            elif key == (CLASS_NAV, ID_NAV_SIG):
                for name, cno in nav_sig_signals(m.payload):
                    if cno > 0:
                        report.signals[name] = max(report.signals.get(name, 0), cno)
            elif key == (CLASS_RXM, ID_RXM_RAWX):
                first, second = rawx_phase_satellites(m.payload)
                dual = len(first & second)
                report.dual_band_best = max(report.dual_band_best, dual)
                report.dual_band_last = dual
                report.phase_first_last = len(first)
                report.phase_second_last = len(second)

    report.counts = dict(counts)
    if latencies:
        report.usb_latency_ms = {
            "median": round(statistics.median(latencies), 1),
            "min": round(min(latencies), 1),
            "max": round(max(latencies), 1),
            "n": len(latencies),
        }
    report.checksum_errors = r.framer.checksum_errors
    # Leave the receiver as the recorder configures it: NAV-SIG off again.
    r.valset([(CFG_MSGOUT_NAV_SIG_USB, 0, 1)])
    return report


def verdict(report: Report, min_dual: int = DEFAULT_MIN_DUAL) -> tuple[list[str], list[str]]:
    """(failures, warnings)."""
    fails: list[str] = []
    warns: list[str] = []
    if report.version is None:
        fails.append("no answer to MON-VER (is this the receiver's port?)")
    elif report.version.get("module") != "ZED-F9P":
        fails.append(f"module is {report.version.get('module')!r}, expected ZED-F9P")
    if report.config != "ok":
        fails.append(f"configuration: {report.config}")
        return fails, warns
    for name, hz in (("NAV-PVT", NAV_PVT_RATE_HZ), ("RXM-RAWX", RAWX_RATE_HZ)):
        expected = hz * report.seconds
        got = report.counts.get(name, 0)
        if got < RATE_MARGIN * expected:
            fails.append(f"{name}: {got} messages, expected about {expected:.0f}")
    if not report.counts.get("RXM-SFRBX"):
        fails.append("no RXM-SFRBX (navigation data): no satellite decoded")
    if report.first_fix_s is None:
        fails.append("no 3D fix (antenna connected and under open sky?)")
    elif report.first_fix_s > SLOW_FIX_S:
        warns.append(f"first 3D fix after {report.first_fix_s:.0f} s")
    lat = report.usb_latency_ms
    if (
        lat is not None
        and report.clock_reference
        and report.clock_reference not in RECEIVER_REFERENCES
        and abs(lat["median"] - CHRONY_USB_OFFSET_MS) > LATENCY_TOLERANCE_MS
    ):
        warns.append(
            f"USB latency {lat['median']:.0f} ms differs from the chrony offset "
            f"{CHRONY_USB_OFFSET_MS} ms"
        )
    if report.dual_band_best == 0:
        fails.append("no satellite with carrier phase on the second band (L2/E5b)")
    elif report.dual_band_best < min_dual:
        warns.append(
            f"at best {report.dual_band_best} satellites with phase on both bands "
            f"(expected {min_dual}+ under open sky): sky partly blocked or a weak antenna"
        )
    return fails, warns


def format_report(report: Report, fails: list[str], warns: list[str]) -> str:
    lines = [
        f"default output: ~{report.default_nmea} NMEA sentences, "
        f"{report.default_ubx} UBX messages in {DEFAULT_OUTPUT_S:.0f} s"
    ]
    v = report.version
    if v:
        lines.append(f"receiver: {v['module']}, firmware {v['firmware']}, hw {v['hw']}")
    for b in report.rf:
        lines.append(
            f"RF block {b['block']}: antenna {b['antenna']}, "
            f"jamming state {b['jamming_state']}, jamInd {b['jam_ind']}"
        )
    lines.append(f"configuration (RAM): {report.config}")
    if report.config == "ok":
        lines.append(f"messages in {report.seconds:.0f} s:")
        for name in ("NAV-PVT", "RXM-RAWX", "RXM-SFRBX", "NAV-SIG"):
            lines.append(f"  {name:10s} {report.counts.get(name, 0)}")
        lines.append(f"  checksum errors {report.checksum_errors}")
        first = f"{report.first_fix_s:.0f} s" if report.first_fix_s is not None else "none"
        lines.append(f"first 3D fix: {first}; most satellites used: {report.max_used_sv}")
        if report.last_fix:
            f = report.last_fix
            lines.append(
                f"last: {f['fix']}, {f['num_sv']} satellites, hAcc {f['h_acc_m']} m, "
                f"carrSoln {f['carr_soln']}, UTC {f['utc']}"
            )
        if report.usb_latency_ms:
            lat = report.usb_latency_ms
            ref = report.clock_reference or "unknown"
            lines.append(
                f"USB latency: median {lat['median']:.0f} ms ({lat['min']:.0f}-{lat['max']:.0f}, "
                f"n {lat['n']}) against the system clock (chrony reference: {ref}; "
                f"meaningful only with an NTP server); chrony offset {CHRONY_USB_OFFSET_MS} ms"
            )
        lines.append(
            f"carrier phase, last epoch: {report.phase_first_last} satellites on the first band, "
            f"{report.phase_second_last} on the second, {report.dual_band_last} on both "
            f"(best {report.dual_band_best})"
        )
        if report.signals:
            lines.append("signals (max C/N0 dB-Hz):")
            for name in sorted(report.signals):
                band = "  second band" if is_second_band(name) else ""
                lines.append(f"  {name:12s} {report.signals[name]:3d}{band}")
    lines += [f"FAIL: {m}" for m in fails] + [f"WARN: {m}" for m in warns]
    lines.append("RESULT: " + ("FAIL" if fails else "PASS (with warnings)" if warns else "PASS"))
    return "\n".join(lines)
