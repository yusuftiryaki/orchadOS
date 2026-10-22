"""Transfer helpers shared by every backend: bandwidth limit, progress, throttled reader."""

from __future__ import annotations

import io
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

SLICE = 256 * 1024  # bytes per limiter step: keeps the rate smooth


def parse_hours(spec: str) -> tuple[int, int]:
    """'08-19' -> (8, 19): the limit applies from 08:00 to 18:59 local time."""
    try:
        a, b = (int(x) for x in spec.split("-", 1))
    except ValueError as exc:
        raise ValueError(f"hours must look like 08-19, not {spec!r}") from exc
    if not (0 <= a <= 23 and 1 <= b <= 24 and a != b):
        raise ValueError(f"bad hour range {spec!r}")
    return a, b


def in_hours(hours: tuple[int, int] | None, now: datetime) -> bool:
    if hours is None:
        return True
    a, b = hours
    h = now.hour
    return a <= h < b if a < b else (h >= a or h < b)


class Limiter:
    """Token bucket shared by all transfer threads; optional active hours (local time)."""

    def __init__(
        self,
        mbit_per_s: float,
        hours: tuple[int, int] | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        now: Callable[[], datetime] = datetime.now,
    ):
        if mbit_per_s <= 0:
            raise ValueError("bandwidth limit must be positive")
        self.rate = mbit_per_s * 1_000_000 / 8  # bytes per second
        self.hours = hours
        self._clock, self._sleep, self._now = clock, sleep, now
        self._lock = threading.Lock()
        self._next = clock()  # time at which the next byte may go

    def acquire(self, n: int) -> None:
        if n <= 0 or not in_hours(self.hours, self._now()):
            return
        with self._lock:
            now = self._clock()
            # No credit for idle time beyond a small burst.
            start = max(self._next, now - 0.25)
            self._next = start + n / self.rate
            wait = self._next - now
        if wait > 0:
            self._sleep(wait)


def fmt_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1000 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000
    return f"{n:.1f} TB"


def fmt_duration(s: float) -> str:
    s = int(s)
    if s >= 3600:
        return f"{s // 3600}h{s % 3600 // 60:02d}m"
    if s >= 60:
        return f"{s // 60}m{s % 60:02d}s"
    return f"{s}s"


@dataclass
class Progress:
    """Thread-safe byte counter with rate and ETA; prints to stderr unless quiet.

    `skip` counts bytes already in place (not part of the rate); `advance` counts
    bytes actually moved.
    """

    label: str
    total: int
    quiet: bool = False
    interval: float | None = None
    clock: Callable[[], float] = time.monotonic
    moved: int = 0
    skipped: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _t0: float = 0.0
    _last_print: float = 0.0
    _samples: list[tuple[float, int]] = field(default_factory=list, repr=False)

    def __post_init__(self):
        self._t0 = self._last_print = self.clock()
        if self.interval is None:
            self.interval = 2.0 if sys.stderr.isatty() else 30.0

    def skip(self, n: int) -> None:
        with self._lock:
            self.skipped += n

    def advance(self, n: int) -> None:
        with self._lock:
            self.moved += n
            now = self.clock()
            self._samples.append((now, self.moved))
            # Rate over the last ~30 s.
            while len(self._samples) > 2 and now - self._samples[0][0] > 30:
                self._samples.pop(0)
            due = now - self._last_print >= (self.interval or 0)
            if due:
                self._last_print = now
        if due and not self.quiet:
            print(self.line(), file=sys.stderr, flush=True)

    @property
    def done(self) -> int:
        return min(self.moved + self.skipped, self.total)

    def rate(self) -> float:
        """Bytes per second over the recent window."""
        if len(self._samples) < 2:
            elapsed = self.clock() - self._t0
            return self.moved / elapsed if elapsed > 0 else 0.0
        (t0, b0), (t1, b1) = self._samples[0], self._samples[-1]
        return (b1 - b0) / (t1 - t0) if t1 > t0 else 0.0

    def eta(self) -> float | None:
        r = self.rate()
        return (self.total - self.done) / r if r > 0 else None

    def line(self) -> str:
        pct = 100 * self.done / self.total if self.total else 100.0
        eta = self.eta()
        return (
            f"{self.label}: {fmt_bytes(self.done)} / {fmt_bytes(self.total)} ({pct:.1f}%)"
            f"  {self.rate() * 8 / 1e6:.1f} Mbit/s"
            + (f"  ETA {fmt_duration(eta)}" if eta is not None and self.done < self.total else "")
        )

    def finish(self) -> None:
        if not self.quiet:
            elapsed = self.clock() - self._t0
            print(
                f"{self.label}: {fmt_bytes(self.moved)} moved, {fmt_bytes(self.skipped)} already "
                f"in place, {fmt_duration(elapsed)}",
                file=sys.stderr,
                flush=True,
            )


@dataclass
class Transfer:
    """What a store needs to report and pace a transfer."""

    progress: Progress | None = None
    limiter: Limiter | None = None

    def moved(self, n: int) -> None:
        if self.limiter:
            self.limiter.acquire(n)
        if self.progress:
            self.progress.advance(n)


class ThrottledReader(io.RawIOBase):
    """Read-only, seekable view of a bytes buffer that paces and counts what is read.

    Only bytes read past the furthest position so far are counted, so an SDK that
    reads the body twice (e.g. to sign it, then to send it) is not counted twice.
    """

    def __init__(self, data: bytes, transfer: Transfer):
        self._buf = memoryview(data)
        self._pos = 0
        self._high = 0
        self._t = transfer

    def __len__(self) -> int:
        return len(self._buf)

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self._pos, io.SEEK_END: len(self._buf)}[whence]
        self._pos = max(0, min(len(self._buf), base + offset))
        return self._pos

    def read(self, size: int = -1) -> bytes:
        end = len(self._buf) if size is None or size < 0 else min(len(self._buf), self._pos + size)
        out = bytes(self._buf[self._pos : end])
        new = end - max(self._pos, self._high)
        self._pos = end
        if new > 0:
            self._high = end
            while new > 0:
                step = min(new, SLICE)
                self._t.moved(step)
                new -= step
        return out

    def readinto(self, b) -> int:
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)
