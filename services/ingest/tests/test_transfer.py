from __future__ import annotations

import io
from datetime import datetime

import pytest

from orchados_ingest.transfer import (
    Limiter,
    Progress,
    ThrottledReader,
    Transfer,
    fmt_duration,
    in_hours,
    parse_hours,
)


class FakeClock:
    def __init__(self):
        self.t = 100.0
        self.slept = 0.0

    def __call__(self) -> float:
        return self.t

    def sleep(self, s: float) -> None:
        self.slept += s
        self.t += s


def test_limiter_paces_to_rate():
    clock = FakeClock()
    lim = Limiter(8, clock=clock, sleep=clock.sleep)  # 8 Mbit/s = 1 MB/s
    for _ in range(10):
        lim.acquire(500_000)
    # 5 MB at 1 MB/s: ~5 s, minus at most the small burst allowance
    assert 4.7 <= clock.slept <= 5.0


def test_limiter_no_credit_for_idle_time():
    clock = FakeClock()
    lim = Limiter(8, clock=clock, sleep=clock.sleep)
    clock.t += 3600  # an hour idle does not allow an hour-long burst
    lim.acquire(2_000_000)
    assert clock.slept >= 1.7


def test_limiter_hours():
    clock = FakeClock()
    night = datetime(2026, 10, 22, 23, 0)
    lim = Limiter(8, hours=(8, 19), clock=clock, sleep=clock.sleep, now=lambda: night)
    lim.acquire(10_000_000)
    assert clock.slept == 0
    assert parse_hours("08-19") == (8, 19)
    assert in_hours((8, 19), datetime(2026, 1, 1, 8, 0))
    assert not in_hours((8, 19), datetime(2026, 1, 1, 19, 0))
    assert in_hours((22, 6), datetime(2026, 1, 1, 2, 0))  # wraps midnight
    with pytest.raises(ValueError):
        parse_hours("8")
    with pytest.raises(ValueError):
        Limiter(0)


def test_progress_rate_and_eta():
    clock = FakeClock()
    p = Progress("push", 100_000_000, quiet=True, clock=clock)
    p.skip(20_000_000)
    for _ in range(10):
        clock.t += 1
        p.advance(1_000_000)  # 1 MB/s
    assert p.done == 30_000_000
    assert p.rate() == pytest.approx(1_000_000)
    assert p.eta() == pytest.approx(70.0)
    line = p.line()
    assert "30.0%" in line and "8.0 Mbit/s" in line and "ETA 1m10s" in line
    assert fmt_duration(3 * 3600 + 5 * 60) == "3h05m"


def test_throttled_reader_counts_once():
    clock = FakeClock()
    p = Progress("x", 1000, quiet=True, clock=clock)
    r = ThrottledReader(b"a" * 1000, Transfer(p))
    assert r.read(400) == b"a" * 400
    r.seek(0)
    assert len(r.read()) == 1000  # second pass: only the last 600 bytes are new
    assert p.moved == 1000
    r.seek(0, io.SEEK_END)
    assert r.read(10) == b""
