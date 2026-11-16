import dataclasses

import pytest

from orchados_recorder.clock import ClockState
from orchados_recorder.health import Snapshot
from orchados_recorder.ssd import SsdStatus

HEALTHY_SSD = SsdStatus(present=True, free_mib=400 * 1024, error=False)


def make_healthy(t: int = 10_000_000, lidar_last: int | None = None, **changes) -> Snapshot:
    """A snapshot where every pre-check item passes, at monotonic time `t` (us).

    LiDAR and GNSS data arrived at `t` unless told otherwise; the bag grows with t.
    """
    s = Snapshot(
        mono_us=t,
        lidar_pps=64_000.0,
        imu_hz=200.0,
        lidar_last_mono_us=t if lidar_last is None else lidar_last,
        lidar_mode="ok",
        gnss_last_mono_us=t,
        rx_config="ok",
        clock=ClockState.PPS,
        ssd=HEALTHY_SSD,
        bag_bytes=t,
        bag_alive=True,
    )
    return dataclasses.replace(s, **changes)


@pytest.fixture
def healthy():
    return make_healthy


@pytest.fixture
def rig(tmp_path):
    """A recorder on fakes (fakes.FakeRig), warmed up so every pre-check passes."""
    from orchados_recorder.fakes import FakeRig

    r = FakeRig(tmp_path / "ssd")
    r.run(seconds=3)
    return r
