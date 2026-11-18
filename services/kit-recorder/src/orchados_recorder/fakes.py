"""A recorder wired to fakes: fake clock, receiver, LiDAR, ros2 bag and SSD.

Used by the tests and by `orchados-recorder fake-run` to write a synthetic
session without any hardware. Nothing here touches a device.
"""

from __future__ import annotations

import signal
import struct
import subprocess
import time
from pathlib import Path

from .clock import FakeClock
from .gpstime import unix_ns_to_gps_ns
from .lidar import BagRecorder, FakeLidarMonitor, LidarConfig
from .receiver import FakeTransport
from .recorder import Deps, Recorder
from .ssd import SsdStatus
from .ubx import CLASS_NAV, CLASS_RXM, ID_NAV_PVT, ID_RXM_RAWX, NavPvt, build_nav_pvt, frame

_WEEK_MS = 604_800_000
# Somewhere in an Antep pistachio orchard (synthetic).
LAT_E7 = 370_662_000
LON_E7 = 373_830_000
HEIGHT_MM = 892_340


def synthetic_nav_pvt(unix_ns: int) -> bytes:
    """A NAV-PVT frame for the given time: 3D fix, RTK fixed, valid position."""
    gps_ms = unix_ns_to_gps_ns(unix_ns) // 1_000_000
    t = time.gmtime(unix_ns // 1_000_000_000)
    pvt = NavPvt(
        i_tow_ms=gps_ms % _WEEK_MS,
        year=t.tm_year,
        month=t.tm_mon,
        day=t.tm_mday,
        hour=t.tm_hour,
        minute=t.tm_min,
        second=t.tm_sec,
        valid=0x07,
        t_acc_ns=20,
        nano=unix_ns % 1_000_000_000,
        fix_type=3,
        flags=0x01 | (2 << 6),
        num_sv=24,
        lon_e7=LON_E7,
        lat_e7=LAT_E7,
        height_mm=HEIGHT_MM,
        h_acc_mm=14,
    )
    return frame(CLASS_NAV, ID_NAV_PVT, build_nav_pvt(pvt))


def synthetic_rawx(unix_ns: int) -> bytes:
    """An RXM-RAWX frame without measurements (header only)."""
    gps_ns = unix_ns_to_gps_ns(unix_ns)
    week, tow_ns = divmod(gps_ns, _WEEK_MS * 1_000_000)
    payload = struct.pack("<dHbBBB2s", tow_ns / 1e9, week, 18, 0, 0x01, 1, b"\x00\x00")
    return frame(CLASS_RXM, ID_RXM_RAWX, payload)


class FakeBagProcess:
    """Stands in for `ros2 bag record`: creates the bag folder, stops on SIGINT."""

    def __init__(self, cmd: list[str]) -> None:
        self.cmd = cmd
        self.out_dir = Path(cmd[cmd.index("-o") + 1])
        self.out_dir.mkdir(parents=True, exist_ok=False)
        self.returncode: int | None = None

    def poll(self) -> int | None:
        return self.returncode

    def send_signal(self, sig: int) -> None:
        if sig == signal.SIGINT:
            self.returncode = 0

    def wait(self, timeout: float | None = None) -> int:
        if self.returncode is None:
            raise subprocess.TimeoutExpired(self.cmd, timeout)
        return self.returncode

    def kill(self) -> None:
        self.returncode = -9

    def die(self) -> None:
        self.returncode = 1


class FakePopen:
    def __init__(self) -> None:
        self.procs: list[FakeBagProcess] = []

    def __call__(self, cmd: list[str], **_kw) -> FakeBagProcess:
        self.procs.append(FakeBagProcess(cmd))
        return self.procs[-1]

    @property
    def current(self) -> FakeBagProcess | None:
        return self.procs[-1] if self.procs else None


class FakeRig:
    """A Recorder on fakes. `run(seconds)` drives it like the service does:
    ten pumps and one tick a second, the receiver sending one RAWX and five
    NAV-PVT a second, the LiDAR streaming and the bag growing."""

    def __init__(
        self,
        ssd: Path,
        *,
        clock: FakeClock | None = None,
        bag_bytes_per_s: int = 4096,
        version: str | None = None,
    ) -> None:
        self.ssd = Path(ssd)
        self.ssd.mkdir(parents=True, exist_ok=True)
        self.clock = clock if clock is not None else FakeClock()
        self.transport = FakeTransport()
        self.lidar = FakeLidarMonitor(self.clock)
        self.popen = FakePopen()
        self.bag = BagRecorder(LidarConfig(), popen=self.popen)
        self.ssd_status = SsdStatus(present=True, free_mib=400 * 1024, error=False)
        self.bag_bytes_per_s = bag_bytes_per_s
        self.receiver_sending = True
        deps = Deps(
            clock=self.clock,
            transport=self.transport,
            lidar=self.lidar,
            bag=self.bag,
            ssd_mount=self.ssd,
            probe_ssd=self._probe,
            receiver_timeout_s=0.05,
        )
        self.recorder = Recorder(deps) if version is None else Recorder(deps, version=version)

    def _probe(self, mount: Path, *, write_test: bool = True) -> SsdStatus:
        return self.ssd_status

    def cmd(self, hex_text: str) -> None:
        self.recorder.handle_command(bytes.fromhex(hex_text.replace(" ", "")))

    def command(self, data: bytes) -> None:
        self.recorder.handle_command(data)

    def status(self) -> bytes:
        return self.recorder.status()

    def run(self, seconds: float) -> bytes:
        status = self.status()
        for _ in range(round(seconds)):
            for i in range(10):
                self.clock.advance_us(100_000)
                if self.receiver_sending and self.transport.connected:
                    now = self.clock.now_unix_ns()
                    if i == 0:
                        self.transport.feed(synthetic_rawx(now))
                    if i % 2 == 0:
                        self.transport.feed(synthetic_nav_pvt(now))
                self.recorder.pump()
            self._grow_bag()
            status = self.recorder.tick()
        return status

    def _grow_bag(self) -> None:
        proc = self.popen.current
        if proc is None or proc.poll() is not None or self.lidar.silent:
            return
        with open(proc.out_dir / "bag_0.mcap", "ab") as f:
            f.write(bytes(self.bag_bytes_per_s))
