"""The SSD every session is recorded to (label ORCHADOS-SSD, mounted with nofail)."""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from .thresholds import SSD_MIN_FREE_START_GIB

PROBE_NAME = ".orchados-probe"
PROBE_BYTES = 4096


@dataclass(frozen=True)
class SsdStatus:
    present: bool
    free_mib: int
    error: bool


def probe_ssd(mount: Path, *, write_test: bool = True) -> SsdStatus:
    """Is the SSD mounted, writable and how much room is left?

    The write test writes, fsyncs and removes a 4 KiB file. While recording the
    recorder skips it (`write_test=False`): its own writes show the errors.
    """
    mount = Path(mount)
    if not os.path.ismount(mount):
        return SsdStatus(present=False, free_mib=0, error=False)
    error = False
    if write_test:
        probe = mount / PROBE_NAME
        try:
            with open(probe, "wb") as f:
                f.write(bytes(PROBE_BYTES))
                f.flush()
                os.fsync(f.fileno())
            os.unlink(probe)
        except OSError:
            error = True
    try:
        free_mib = shutil.disk_usage(mount).free >> 20
    except OSError:
        return SsdStatus(present=True, free_mib=0, error=True)
    return SsdStatus(present=True, free_mib=free_mib, error=error)


def ssd_check_ok(s: SsdStatus) -> bool:
    return s.present and not s.error and s.free_mib >= SSD_MIN_FREE_START_GIB * 1024
