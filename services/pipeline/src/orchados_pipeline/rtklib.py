"""RTKLIB wrapper for PPK: convbin (UBX -> RINEX) and rnx2rtkp (solution), .pos parsing."""

from __future__ import annotations

import re
import shutil
import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .gpstime import NS_PER_S, leap_seconds_at, utc_to_gps_ns, week_tow_to_gps_ns
from .models import SolutionQuality, TrajectoryPoint
from .params import PositionParams

# rnx2rtkp Q column
Q_CODES = {
    1: SolutionQuality.fix,
    2: SolutionQuality.float,
    3: SolutionQuality.sbas,
    4: SolutionQuality.dgps,
    5: SolutionQuality.single,
    6: SolutionQuality.ppp,
}


class RtklibError(RuntimeError):
    pass


Runner = Callable[[Sequence[str], Path], None]


def default_runner(cmd: Sequence[str], cwd: Path) -> None:
    proc = subprocess.run(list(cmd), cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout).strip().splitlines()[-5:]
        raise RtklibError(f"{cmd[0]} exited with {proc.returncode}: {' | '.join(tail)}")


def tools_available() -> bool:
    return shutil.which("convbin") is not None and shutil.which("rnx2rtkp") is not None


def make_config(params: PositionParams) -> str:
    """rnx2rtkp options for kinematic PPK with a static base."""
    navsys = {"gps": 1, "sbas": 2, "glo": 4, "gal": 8, "qzs": 16, "bds": 32}
    mask = sum(navsys[s] for s in params.navsys)
    opts = {
        "pos1-posmode": "kinematic",
        "pos1-frequency": params.frequencies,
        "pos1-soltype": "combined",
        "pos1-elmask": f"{params.elevation_mask_deg:g}",
        "pos1-dynamics": "on",
        "pos1-tidecorr": "off",
        "pos1-ionoopt": "brdc",
        "pos1-tropopt": "saas",
        "pos1-sateph": "brdc",
        "pos1-navsys": str(mask),
        "pos2-armode": params.ar_mode,
        "pos2-gloarmode": "off",
        "pos2-arthres": "3",
        "out-solformat": "llh",
        "out-outhead": "on",
        "out-outopt": "on",
        "out-timesys": "gpst",
        "out-timeform": "tow",
        "out-timendec": "3",
        "out-degform": "deg",
        "out-height": "ellipsoidal",
        "out-solstatic": "all",
        "ant1-postype": "llh",
        "ant2-postype": "rinexhead",
        "misc-timeinterp": "on",
    }
    return "".join(f"{k:<20}={v}\n" for k, v in opts.items())


@dataclass(frozen=True)
class PpkPlan:
    work_dir: Path
    config: Path
    rover_obs: Path
    rover_nav: Path
    pos: Path
    convbin: list[str]
    rnx2rtkp: list[str]


def plan_ppk(
    ubx: Path,
    base_obs: Path,
    base_navs: Sequence[Path],
    work_dir: Path,
    params: PositionParams,
) -> PpkPlan:
    work_dir = Path(work_dir)
    rover_obs = work_dir / "rover.obs"
    rover_nav = work_dir / "rover.nav"
    config = work_dir / "rnx2rtkp.conf"
    pos = work_dir / "rover.pos"
    convbin = [
        "convbin",
        "-r",
        "ubx",
        "-v",
        params.rinex_version,
        "-od",
        "-os",
        "-o",
        str(rover_obs),
        "-n",
        str(rover_nav),
        str(ubx),
    ]
    rnx2rtkp = [
        "rnx2rtkp",
        "-k",
        str(config),
        "-o",
        str(pos),
        str(rover_obs),
        str(base_obs),
        str(rover_nav),
        *map(str, base_navs),
    ]
    return PpkPlan(work_dir, config, rover_obs, rover_nav, pos, convbin, rnx2rtkp)


def run_ppk(plan: PpkPlan, params: PositionParams, runner: Runner = default_runner) -> Path:
    plan.work_dir.mkdir(parents=True, exist_ok=True)
    plan.config.write_text(make_config(params), encoding="ascii")
    runner(plan.convbin, plan.work_dir)
    if not plan.rover_obs.is_file() or not _has_obs_epochs(plan.rover_obs):
        raise RtklibError("convbin produced no observation epochs (is RXM-RAWX logged?)")
    runner(plan.rnx2rtkp, plan.work_dir)
    if not plan.pos.is_file():
        raise RtklibError("rnx2rtkp produced no .pos file")
    return plan.pos


def _has_obs_epochs(obs: Path) -> bool:
    with open(obs, encoding="ascii", errors="replace") as f:
        for line in f:
            if "END OF HEADER" in line:
                break
        return any(line.startswith(">") or line[:3].strip().isdigit() for line in f)


_HMS = re.compile(r"^\d{4}/\d{2}/\d{2}$")


def parse_pos(text: str) -> list[TrajectoryPoint]:
    """Parse an rnx2rtkp .pos file in llh format.

    Supports both time forms (GPS week + TOW, or calendar date + time) and both
    time systems (GPST, UTC) as declared in the header.
    """
    is_utc = False
    points: list[TrajectoryPoint] = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("%"):
            head = line[1:].strip()
            if head.startswith("UTC") or head.startswith("JST"):
                if head.startswith("JST"):
                    raise RtklibError("JST time system is not supported")
                is_utc = True
            elif head.startswith("GPST"):
                is_utc = False
            continue
        cols = line.split()
        try:
            if _HMS.match(cols[0]):
                dt = datetime.strptime(f"{cols[0]} {cols[1]}", "%Y/%m/%d %H:%M:%S.%f")
                dt = dt.replace(tzinfo=UTC)
                if is_utc:
                    t_ns = utc_to_gps_ns(dt)
                else:  # calendar GPST: no leap-second offset
                    t_ns = utc_to_gps_ns(dt) - _leap_ns(dt)
            else:
                if is_utc:
                    raise RtklibError(f"line {lineno}: week/TOW with UTC is not supported")
                t_ns = week_tow_to_gps_ns(int(cols[0]), float(cols[1]))
            lat, lon, h = float(cols[2]), float(cols[3]), float(cols[4])
            q, ns = int(cols[5]), int(cols[6])
            sdn, sde, sdu = float(cols[7]), float(cols[8]), float(cols[9])
        except (IndexError, ValueError) as exc:
            raise RtklibError(f".pos line {lineno}: cannot parse ({exc})") from None
        if q not in Q_CODES:
            continue
        points.append(
            TrajectoryPoint(
                gps_time_ns=t_ns,
                lat=lat,
                lon=lon,
                height_m=h,
                quality=Q_CODES[q],
                sd_n_m=sdn,
                sd_e_m=sde,
                sd_u_m=sdu,
                num_sv=ns,
            )
        )
    points.sort(key=lambda p: p.gps_time_ns)
    return points


def _leap_ns(dt: datetime) -> int:
    return leap_seconds_at(dt) * NS_PER_S


def read_pos(path: Path) -> list[TrajectoryPoint]:
    return parse_pos(Path(path).read_text(encoding="ascii", errors="replace"))
