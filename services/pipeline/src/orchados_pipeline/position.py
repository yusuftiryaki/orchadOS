"""Stage 2 – position: trajectory from PPK (RTKLIB) or, without base data, from NAV-PVT."""

from __future__ import annotations

import math

import numpy as np

from .context import RunContext
from .geo import LocalFrame
from .ingest import UBX_PATH
from .models import (
    FileRole,
    Manifest,
    PpkStatus,
    SolutionQuality,
    Trajectory,
    TrajectoryPoint,
    write_model,
)
from .rtklib import RtklibError, Runner, default_runner, plan_ppk, read_pos, run_ppk
from .ubx import CLS_NAV, ID_NAV_PVT, decode_nav_pvt, iter_frames


class PositionError(RuntimeError):
    pass


def trajectory_from_nav_pvt(data: bytes) -> list[TrajectoryPoint]:
    """Valid NAV-PVT epochs as trajectory points (receiver's own RTK/standalone solution)."""
    points: dict[int, TrajectoryPoint] = {}
    for frame in iter_frames(data):
        if (frame.msg_class, frame.msg_id) != (CLS_NAV, ID_NAV_PVT) or len(frame.payload) != 92:
            continue
        pvt = decode_nav_pvt(frame.payload)
        if not pvt.gnss_fix_ok or not pvt.time_valid or pvt.fix_type not in (3, 4):
            continue
        quality = {2: SolutionQuality.fix, 1: SolutionQuality.float}.get(
            pvt.carr_soln, SolutionQuality.dgps if pvt.flags & 0x02 else SolutionQuality.single
        )
        sd_h = pvt.h_acc_m / math.sqrt(2)  # hAcc is horizontal; split equally over N and E
        t = pvt.gps_time_ns()
        points[t] = TrajectoryPoint(
            gps_time_ns=t,
            lat=pvt.lat_deg,
            lon=pvt.lon_deg,
            height_m=pvt.height_m,
            quality=quality,
            sd_n_m=sd_h,
            sd_e_m=sd_h,
            sd_u_m=pvt.v_acc_m,
            num_sv=pvt.num_sv,
        )
    return [points[t] for t in sorted(points)]


def compute_trajectory(
    ctx: RunContext, manifest: Manifest, runner: Runner = default_runner
) -> Trajectory:
    ubx = ctx.session_dir / UBX_PATH
    base_obs = [ctx.session_dir / f.path for f in manifest.by_role(FileRole.base_obs)]
    base_nav = [ctx.session_dir / f.path for f in manifest.by_role(FileRole.base_nav)]
    notes: list[str] = []
    producer = ctx.producer("position")

    if base_obs:
        if len(base_obs) > 1:
            notes.append(f"several base observation files; using {base_obs[0].name}")
        plan = plan_ppk(ubx, base_obs[0], base_nav, ctx.path("ppk"), ctx.params.position)
        try:
            points = read_pos(run_ppk(plan, ctx.params.position, runner))
            if not points:
                raise RtklibError("rnx2rtkp returned no solutions")
            return Trajectory(
                producer=producer,
                source="rtklib_pos",
                ppk_status=PpkStatus.ppk,
                points=points,
                notes=notes,
            )
        except RtklibError as exc:
            if not ctx.params.position.ppk_fallback:
                raise PositionError(f"PPK failed: {exc}") from exc
            notes.append(f"PPK failed, NAV-PVT used: {exc}")
            status = PpkStatus.ppk_failed
    else:
        status = PpkStatus.no_ppk
        notes.append("no base data: receiver NAV-PVT solution, not post-processed")

    points = trajectory_from_nav_pvt(ubx.read_bytes())
    if not points:
        raise PositionError("no valid NAV-PVT epochs in gnss.ubx")
    return Trajectory(
        producer=producer, source="nav_pvt", ppk_status=status, points=points, notes=notes
    )


def run(ctx: RunContext, manifest: Manifest, runner: Runner = default_runner) -> Trajectory:
    traj = compute_trajectory(ctx, manifest, runner)
    write_model(traj, ctx.trajectory_path)
    return traj


class TrajectoryInterpolator:
    """Linear interpolation of position in a local east/north frame."""

    def __init__(self, traj: Trajectory, max_gap_s: float = 2.0):
        pts = traj.points
        if len(pts) < 2:
            raise PositionError("trajectory needs at least two points")
        self.points = pts
        self.t = np.array([p.gps_time_ns for p in pts], dtype=np.int64)
        self.frame = LocalFrame(pts[0].lat, pts[0].lon)
        e, n = self.frame.to_en([p.lat for p in pts], [p.lon for p in pts])
        self.e, self.n = np.asarray(e), np.asarray(n)
        self.h = np.array([p.height_m for p in pts])
        self.sd_h = np.array([math.hypot(p.sd_n_m, p.sd_e_m) for p in pts])
        self.max_gap_ns = int(max_gap_s * 1e9)
        steps = np.hypot(np.diff(self.e), np.diff(self.n))
        self.along = np.concatenate([[0.0], np.cumsum(steps)])

    def _locate(self, t_ns: int) -> tuple[int, float] | None:
        if t_ns < self.t[0] or t_ns > self.t[-1]:
            return None
        i = int(np.searchsorted(self.t, t_ns, side="right")) - 1
        i = min(max(i, 0), len(self.t) - 2)
        dt = int(self.t[i + 1] - self.t[i])
        if dt > self.max_gap_ns:
            return None
        return i, (t_ns - int(self.t[i])) / dt if dt else 0.0

    def en(self, t_ns: int) -> tuple[float, float] | None:
        loc = self._locate(t_ns)
        if loc is None:
            return None
        i, w = loc
        return (
            float(self.e[i] + w * (self.e[i + 1] - self.e[i])),
            float(self.n[i] + w * (self.n[i + 1] - self.n[i])),
        )

    def sample(self, t_ns: int) -> dict | None:
        loc = self._locate(t_ns)
        if loc is None:
            return None
        i, w = loc

        def lerp(a):
            return float(a[i] + w * (a[i + 1] - a[i]))

        e, n = lerp(self.e), lerp(self.n)
        lat, lon = self.frame.to_latlon(e, n)
        worst = max((self.points[i], self.points[i + 1]), key=lambda p: _QUALITY_RANK[p.quality])
        return {
            "e": e,
            "n": n,
            "lat": float(lat),
            "lon": float(lon),
            "height_m": lerp(self.h),
            "along_m": lerp(self.along),
            "sd_h_m": max(self.sd_h[i], self.sd_h[i + 1]),
            "quality": worst.quality,
        }


_QUALITY_RANK = {
    SolutionQuality.fix: 0,
    SolutionQuality.ppp: 1,
    SolutionQuality.float: 2,
    SolutionQuality.dgps: 3,
    SolutionQuality.sbas: 4,
    SolutionQuality.single: 5,
}
