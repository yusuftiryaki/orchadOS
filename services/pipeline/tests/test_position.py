import math
import shutil
from datetime import UTC, datetime
from pathlib import Path

import pytest
from conftest import DATA

from orchados_pipeline import ubx
from orchados_pipeline.context import RunContext
from orchados_pipeline.gpstime import gps_ns_to_iso, utc_to_gps_ns, week_tow_to_gps_ns
from orchados_pipeline.ingest import build_manifest
from orchados_pipeline.models import PpkStatus, SolutionQuality
from orchados_pipeline.params import PositionParams
from orchados_pipeline.position import compute_trajectory, trajectory_from_nav_pvt
from orchados_pipeline.rtklib import (
    RtklibError,
    make_config,
    parse_pos,
    plan_ppk,
    read_pos,
    run_ppk,
    tools_available,
)


def test_checksum_known_vector():
    # UBX-MON-VER poll: B5 62 0A 04 00 00 0E 34
    assert ubx.build_frame(0x0A, 0x04, b"") == bytes.fromhex("b5620a0400000e34")
    body = bytes(range(200))
    a = b = 0
    for x in body:
        a, b = (a + x) & 0xFF, (b + a + x) & 0xFF
    assert ubx.checksum(body) == bytes((a, b))


def _handmade_nav_pvt() -> bytes:
    """NAV-PVT for 2026-10-18 09:00:00.200 UTC, RTK fixed, built field by field."""
    import struct

    gps_ns = utc_to_gps_ns(datetime(2026, 10, 18, 9, 0, 0, 200000, tzinfo=UTC))
    itow = (gps_ns // 1_000_000) % (604800 * 1000)
    payload = struct.pack(
        "<IHBBBBBBIiBBBBiiiiIIiiiiiIIHH4BihH",
        itow,
        2026,
        10,
        18,
        9,
        0,
        0,
        0x07,
        25,
        200_000_000,
        3,
        0b1000_0011,
        0xE0,
        21,
        373800000,
        370600000,
        880_123,
        844_000,
        14,
        21,
        1000,
        -500,
        20,
        1118,
        5_000_000,
        40,
        120000,
        95,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    )
    return payload


def test_nav_pvt_decode_handmade_frame():
    payload = _handmade_nav_pvt()
    frame = ubx.build_frame(0x01, 0x07, payload)
    frames = list(ubx.iter_frames(b"\x00garbage" + frame + frame[:20]))
    assert len(frames) == 1 and frames[0].name == "NAV-PVT"
    pvt = ubx.decode_nav_pvt(frames[0].payload)
    assert pvt.lat_deg == pytest.approx(37.06) and pvt.lon_deg == pytest.approx(37.38)
    assert pvt.height_m == pytest.approx(880.123)
    assert pvt.h_acc_m == pytest.approx(0.014)
    assert pvt.carr_soln == 2 and pvt.gnss_fix_ok and pvt.time_valid
    assert pvt.vel_n_mps == pytest.approx(1.0) and pvt.head_mot_deg == pytest.approx(50.0)
    assert gps_ns_to_iso(pvt.gps_time_ns()) == "2026-10-18T09:00:00.200Z"


def test_bad_checksum_frame_skipped():
    frame = bytearray(ubx.build_frame(0x01, 0x07, _handmade_nav_pvt()))
    frame[20] ^= 0x55
    stats = ubx.ScanStats()
    assert list(ubx.iter_frames(bytes(frame), stats)) == []
    assert stats.bad_checksum == 1


def test_trajectory_from_nav_pvt_quality_and_order():
    t = 1_475_000_000_000_000_000
    frames = b""
    for i, carr in enumerate([2, 1, 0]):
        frames += ubx.build_frame(
            0x01,
            0x07,
            ubx.encode_nav_pvt(
                gps_time_ns=t + (2 - i) * 200_000_000,
                lat_deg=37.06 + i * 1e-6,
                lon_deg=37.38,
                height_m=880.0,
                carr_soln=carr,
                h_acc_m=0.02 * (i + 1),
            ),
        )
    pts = trajectory_from_nav_pvt(frames)
    assert [p.gps_time_ns for p in pts] == sorted(p.gps_time_ns for p in pts)
    assert [p.quality for p in pts] == [
        SolutionQuality.single,
        SolutionQuality.float,
        SolutionQuality.fix,
    ]
    assert pts[-1].sd_n_m == pytest.approx(0.02 / math.sqrt(2), abs=1e-6)


def test_parse_pos_week_tow():
    pts = read_pos(DATA / "sample_tow.pos")
    assert len(pts) == 4  # Q=0 dropped
    assert pts[0].gps_time_ns == week_tow_to_gps_ns(2440, 32418.0)
    assert pts[1].gps_time_ns - pts[0].gps_time_ns == 200_000_000
    assert [p.quality for p in pts] == [
        SolutionQuality.fix,
        SolutionQuality.fix,
        SolutionQuality.float,
        SolutionQuality.single,
    ]
    assert pts[0].lat == 37.06 and pts[0].height_m == pytest.approx(880.1234)
    assert (pts[2].sd_n_m, pts[2].sd_e_m, pts[2].sd_u_m, pts[2].num_sv) == (0.045, 0.04, 0.08, 17)


def test_parse_pos_calendar_utc():
    pts = read_pos(DATA / "sample_hms_utc.pos")
    expect = utc_to_gps_ns(datetime(2026, 10, 18, 9, 0, tzinfo=UTC))
    assert pts[0].gps_time_ns == expect  # UTC + 18 leap seconds
    assert pts[1].quality == SolutionQuality.float


def test_parse_pos_calendar_gpst():
    text = (DATA / "sample_hms_utc.pos").read_text().replace("%  UTC", "%  GPST")
    pts = parse_pos(text)
    expect = utc_to_gps_ns(datetime(2026, 10, 18, 9, 0, tzinfo=UTC)) - 18 * 10**9
    assert pts[0].gps_time_ns == expect


def test_parse_pos_rejects_garbage():
    with pytest.raises(RtklibError, match="line 1"):
        parse_pos("2440 abc 37 37 880 1 10 0 0 0\n")


def test_config_and_commands(tmp_path):
    p = PositionParams()
    conf = make_config(p)
    assert "pos1-posmode        =kinematic" in conf
    assert "out-timesys         =gpst" in conf and "out-timeform        =tow" in conf
    assert "pos1-navsys         =45" in conf  # gps+glo+gal+bds
    plan = plan_ppk(Path("g.ubx"), Path("b.obs"), [Path("b.nav")], tmp_path, p)
    assert plan.convbin[:3] == ["convbin", "-r", "ubx"] and plan.convbin[-1] == "g.ubx"
    assert plan.rnx2rtkp[-4:] == [str(plan.rover_obs), "b.obs", str(plan.rover_nav), "b.nav"]


def _session_with_base(synthetic_session, tmp_path):
    s = tmp_path / "s"
    shutil.copytree(synthetic_session[0], s)
    (s / "base").mkdir()
    (s / "base" / "base.obs").write_text(
        "     3.04           OBSERVATION DATA    M                   RINEX VERSION / TYPE\n"
    )
    return s


def test_ppk_path_with_fake_runner(synthetic_session, tmp_path):
    s = _session_with_base(synthetic_session, tmp_path)
    ctx = RunContext.create(s, tmp_path / "out")
    calls = []

    def fake(cmd, cwd):
        calls.append(cmd[0])
        if cmd[0] == "convbin":
            Path(cmd[cmd.index("-o") + 1]).write_text(
                "     3.04           OBSERVATION DATA\n     END OF HEADER\n> 2026 10 18 9 0 0.0\n"
            )
        else:
            shutil.copy(DATA / "sample_tow.pos", cmd[cmd.index("-o") + 1])

    traj = compute_trajectory(ctx, build_manifest(ctx), runner=fake)
    assert calls == ["convbin", "rnx2rtkp"]
    assert traj.ppk_status == PpkStatus.ppk and traj.source == "rtklib_pos"
    assert len(traj.points) == 4
    assert (ctx.path("ppk") / "rnx2rtkp.conf").is_file()


def test_ppk_failure_falls_back_to_nav_pvt(synthetic_session, tmp_path):
    s = _session_with_base(synthetic_session, tmp_path)
    ctx = RunContext.create(s, tmp_path / "out")

    def failing(cmd, cwd):
        raise RtklibError("boom")

    traj = compute_trajectory(ctx, build_manifest(ctx), runner=failing)
    assert traj.ppk_status == PpkStatus.ppk_failed and traj.source == "nav_pvt"
    assert any("boom" in n for n in traj.notes)


def test_no_base_uses_nav_pvt(synthetic_session, tmp_path):
    ctx = RunContext.create(synthetic_session[0], tmp_path / "out")
    traj = compute_trajectory(ctx, build_manifest(ctx))
    assert traj.ppk_status == PpkStatus.no_ppk
    assert all(p.quality == SolutionQuality.fix for p in traj.points)


@pytest.mark.rtklib
@pytest.mark.skipif(not tools_available(), reason="RTKLIB (convbin, rnx2rtkp) not installed")
def test_real_convbin_reports_missing_raw_measurements(synthetic_session, tmp_path):
    """The synthetic log has NAV-PVT only: convbin runs, and the wrapper explains why PPK fails."""
    ubx_path = synthetic_session[0] / "gnss" / "gnss.ubx"
    p = PositionParams()
    plan = plan_ppk(ubx_path, tmp_path / "base.obs", [], tmp_path / "ppk", p)
    with pytest.raises(RtklibError, match="RXM-RAWX"):
        run_ppk(plan, p)
    assert plan.config.is_file()
