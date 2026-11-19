"""Point-LIO runner without Docker: a fake `docker` executable stands in for the image."""

from __future__ import annotations

import json
import os
import stat
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from orchados_pipeline.lidar.frontend import FrontendError, get_frontend
from orchados_pipeline.lidar.frontend.point_lio import PointLioFrontend
from orchados_pipeline.lidar.models import RegistrationParams
from orchados_pipeline.lidar.rawlog import plan_segments, write_restamped
from orchados_pipeline.lidar.registration import run as register
from orchados_pipeline.lidar.synth_moving import MovingConfig, make_moving_session

IMAGE_ID = "sha256:620f44875c70ca9b7aaa762c7334e23010e84bad8d0e47d57f602ffe51ebbcbe"

# Fake docker: `image inspect` answers from FAKE_DOCKER_* variables; `run` logs its
# argv and writes an orchados.lio_frontend/1 output for the mounted segments.json:
# segment 0 ok with two keyframes, every other segment failed.
FAKE_DOCKER = r"""
import json, os, sys
from pathlib import Path
import numpy as np

args = sys.argv[1:]
log = Path(os.environ["FAKE_DOCKER_LOG"])
with open(log, "a") as f:
    f.write(json.dumps(args) + "\n")
if args[:2] == ["image", "inspect"]:
    if os.environ.get("FAKE_DOCKER_NO_IMAGE"):
        print("Error: No such image: " + args[-1], file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"Id": os.environ["FAKE_DOCKER_ID"], "Config": {"Env": [
        "POINT_LIO_COMMIT=a8e2d0d5090af97ead8dd4fac3d37cf3dbb33ff7",
        "ORCHADOS_RECIPE_VERSION=" + os.environ.get("FAKE_DOCKER_RECIPE", "2")]}}))
    sys.exit(0)
if args[0] == "kill":
    sys.exit(0)
assert args[0] == "run"
mounts = {}
for i, a in enumerate(args):
    if a == "-v":
        host, inside = args[i + 1].split(":")[:2]
        mounts[inside] = Path(host)
print("[point-lio-frontend] fake run")
code = int(os.environ.get("FAKE_DOCKER_EXIT", "0"))
if code:
    print("point_lio crashed", file=sys.stderr)
    sys.exit(code)
spec = json.loads(mounts["/in/segments.json"].read_text())
out = mounts["/out"]
(out / "scans").mkdir(parents=True, exist_ok=True)
rows, segs = [], []
for s in spec["segments"]:
    ok = s["index"] == 0
    if ok:
        for k in range(2):
            name = f"{s['index']}_{k}.npz"
            np.savez(out / "scans" / name, xyz=np.ones((3, 3), np.float32),
                     intensity=np.zeros(3, np.float32))
            t = s["start_gps_ns"] + k * 10**9
            rows.append(f"{s['index']},{k},{t},{k * 0.5},0,0,0,0,0,1,{name}")
    segs.append({"index": s["index"], "start_gps_ns": s["start_gps_ns"],
                 "end_gps_ns": s["end_gps_ns"], "keyframe_count": 2 if ok else 0,
                 "status": "ok" if ok else "failed",
                 "message": None if ok else "point_lio exited during playback (code 139)"})
body = {"schema": "orchados.lio_frontend/1", "method": "point_lio",
        "method_version": "a8e2d0d-r2", "config_hash": "c0ffee", "segments": segs,
        "imu_rate_hz": 250.0, "points_total": 1234, "rate": spec["rate"],
        "keyframe": spec["keyframe"]}
if not os.environ.get("FAKE_DOCKER_OLD"):
    body["blind_m"] = spec.get("blind_m", 0.6)
(out / "frontend.json").write_text(json.dumps(body))
(out / "keyframes.csv").write_text(
    "segment,index,gps_time_ns,x,y,z,qx,qy,qz,qw,scan\n" + "".join(r + "\n" for r in rows))
"""


@pytest.fixture
def fake_docker(tmp_path, monkeypatch):
    exe = tmp_path / "bin" / "docker"
    exe.parent.mkdir()
    exe.write_text(f"#!{sys.executable}\n{FAKE_DOCKER}")
    exe.chmod(exe.stat().st_mode | stat.S_IXUSR)
    log = tmp_path / "docker-calls.jsonl"
    monkeypatch.setenv("FAKE_DOCKER_LOG", str(log))
    monkeypatch.setenv("FAKE_DOCKER_ID", IMAGE_ID)
    for var in ("FAKE_DOCKER_NO_IMAGE", "FAKE_DOCKER_EXIT", "FAKE_DOCKER_OLD"):
        monkeypatch.delenv(var, raising=False)

    def calls() -> list[list[str]]:
        if not log.exists():
            return []
        return [json.loads(line) for line in log.read_text().splitlines()]

    return str(exe), calls


@pytest.fixture(scope="module")
def two_bags(tmp_path_factory):
    """Two segments (recorder restart at 24 s) whose stamps lag the log times by 0.2 s."""
    dest = tmp_path_factory.mktemp("pl") / "s"
    cfg = MovingConfig(
        rows=1,
        trees_per_row=3,
        duration_s=50.0,
        points_per_s=1500,
        imu_hz=150.0,
        second_bag_at_s=24.0,
        stamp_offset_s=0.2,
        ppk=False,
    )
    make_moving_session(dest, cfg)
    segs = plan_segments(dest, RegistrationParams())
    assert len(segs) == 2 and all(s.needs_restamp and s.skip_reason is None for s in segs)
    return dest, segs


def test_get_frontend_and_image_from_env(monkeypatch):
    monkeypatch.delenv("ORCHADOS_POINT_LIO_IMAGE", raising=False)
    fe = get_frontend("point_lio")
    assert isinstance(fe, PointLioFrontend)
    assert fe.image == "orchados-lio-point-lio:local" and fe.rate == 1.0 and fe.blind_m == 0.6
    monkeypatch.setenv("ORCHADOS_POINT_LIO_IMAGE", "registry.local/pl:7")
    assert PointLioFrontend().image == "registry.local/pl:7"
    assert PointLioFrontend(image="x:1").image == "x:1"
    with pytest.raises(ValueError, match="rate"):
        PointLioFrontend(rate=0)


def test_command_line(tmp_path):
    fe = PointLioFrontend(image="img:1", docker="docker", docker_args=["--cpus", "4"])
    session = tmp_path / "session"
    cmd = fe.command(
        session,
        tmp_path / "w/point_lio/segments.json",
        tmp_path / "w/frontend",
        [(tmp_path / "w/point_lio/restamped", "/in/restamped")],
        name="orchados-point-lio-1",
    )
    uid = f"{os.getuid()}:{os.getgid()}"
    assert cmd == [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--user",
        uid,
        "--name",
        "orchados-point-lio-1",
        "-v",
        f"{session.resolve()}:/in/session:ro",
        "-v",
        f"{(tmp_path / 'w/point_lio/segments.json').resolve()}:/in/segments.json:ro",
        "-v",
        f"{(tmp_path / 'w/point_lio/restamped').resolve()}:/in/restamped:ro",
        "-v",
        f"{(tmp_path / 'w/frontend').resolve()}:/out",
        "--cpus",
        "4",
        "img:1",
    ]


def test_paths_restamped_by_the_runner(two_bags, tmp_path):
    dest, segs = two_bags
    spec, mounts = PointLioFrontend(rate=2.0, blind_m=0.7).prepare(dest, segs, tmp_path)
    restamped = tmp_path / "point_lio/restamped"
    assert mounts == [(restamped, "/in/restamped")]
    assert [s["mcap"] for s in spec["segments"]] == [
        ["/in/restamped/seg0/seg0_0.mcap"],
        ["/in/restamped/seg1/seg1_0.mcap"],
    ]
    assert (restamped / "seg0/seg0_0.mcap").is_file()
    assert spec["rate"] == 2.0 and spec["blind_m"] == 0.7
    assert spec["keyframe"] == {"dist_m": 0.5, "angle_deg": 10.0, "dt_s": 1.0}
    assert [(s["index"], s["start_gps_ns"], s["end_gps_ns"]) for s in spec["segments"]] == [
        (s.index, s.start_gps_ns, s.end_gps_ns) for s in segs
    ]


def test_paths_in_session_and_already_restamped(two_bags, tmp_path):
    dest, segs = two_bags
    plain = replace(segs[0], needs_restamp=False)
    # As registration.run does: the caller restamped segment 1 into its work folder.
    copy = write_restamped(segs[1], tmp_path / "restamped" / "seg1")
    done = replace(segs[1], bag_dirs=[copy.parent])
    skipped = replace(segs[1], index=2, skip_reason="too_short")
    spec, mounts = PointLioFrontend().prepare(dest, [plain, done, skipped], tmp_path / "w")
    assert [s["mcap"] for s in spec["segments"]] == [
        ["lidar/raw/bag/bag_0.mcap"],
        ["/in/extra/0/seg1_0.mcap"],
    ]
    assert mounts == [(copy.parent.resolve(), "/in/extra/0")]
    assert not (tmp_path / "w/point_lio/restamped").exists()


def test_docker_missing(two_bags, tmp_path):
    dest, segs = two_bags
    fe = PointLioFrontend(docker=str(tmp_path / "no-such-docker"))
    with pytest.raises(FrontendError, match="not found.*Docker is needed"):
        fe.run(dest, segs, tmp_path / "w")


def test_image_missing(two_bags, tmp_path, fake_docker, monkeypatch):
    dest, segs = two_bags
    exe, calls = fake_docker
    monkeypatch.setenv("FAKE_DOCKER_NO_IMAGE", "1")
    with pytest.raises(FrontendError, match="not available.*docker build -t img:9"):
        PointLioFrontend(image="img:9", docker=exe).run(dest, segs, tmp_path / "w")
    assert [c[:2] for c in calls()] == [["image", "inspect"]]


def test_run_reads_back_and_failed_segments_propagate(two_bags, tmp_path, fake_docker):
    dest, segs = two_bags
    exe, calls = fake_docker
    fe = PointLioFrontend(image="img:2", docker=exe)
    work = tmp_path / "w"
    res = fe.run(dest, segs, work)
    assert res.method == "point_lio"
    assert res.method_version == fe.method_version == "620f44875c70-a8e2d0d-r2"
    assert [(s["index"], s["status"]) for s in res.segments] == [(0, "ok"), (1, "failed")]
    assert res.segments[1]["message"] == "point_lio exited during playback (code 139)"
    assert [(k.segment, k.index) for k in res.keyframes] == [(0, 0), (0, 1)]
    assert all(k.scan.is_file() for k in res.keyframes)
    body = json.loads((work / "frontend/frontend.json").read_text())
    assert body["image"] == {"name": "img:2", "id": IMAGE_ID, "version": "a8e2d0d-r2"}
    assert body["method_version"] == "620f44875c70-a8e2d0d-r2"
    run_call = calls()[-1]
    assert run_call[0] == "run" and run_call[-1] == "img:2"
    assert f"{dest.resolve()}:/in/session:ro" in run_call
    assert f"{(work / 'frontend').resolve()}:/out" in run_call
    # The restamped copies are gone after the run; segments.json and the log stay.
    assert not (work / "point_lio/restamped").exists()
    assert (work / "point_lio/segments.json").is_file()
    assert "fake run" in (work / "point_lio/docker.log").read_text()


def test_run_fails_when_the_image_fails(two_bags, tmp_path, fake_docker, monkeypatch):
    dest, segs = two_bags
    exe, _ = fake_docker
    monkeypatch.setenv("FAKE_DOCKER_EXIT", "2")
    with pytest.raises(FrontendError, match=r"exited with 2(.|\n)*point_lio crashed"):
        PointLioFrontend(docker=exe).run(dest, segs, tmp_path / "w")
    assert not (tmp_path / "w/point_lio/restamped").exists()


def test_old_image_without_blind_is_refused(two_bags, tmp_path, fake_docker, monkeypatch):
    dest, segs = two_bags
    exe, _ = fake_docker
    monkeypatch.setenv("FAKE_DOCKER_OLD", "1")
    with pytest.raises(FrontendError, match="does not apply blind_m"):
        PointLioFrontend(docker=exe).run(dest, segs, tmp_path / "w")


def test_registration_reports_the_failed_segment(two_bags, tmp_path, fake_docker):
    src, _ = two_bags
    exe, _ = fake_docker
    folder, report = register(src, tmp_path / "reg", frontend=PointLioFrontend(docker=exe))
    by_index = {s.index: s for s in report.segments}
    assert by_index[1].status == "failed"
    assert by_index[1].message == "point_lio exited during playback (code 139)"
    assert by_index[1].restamped
    assert report.frontend["method_version"] == "620f44875c70-a8e2d0d-r2"
    assert report.method_version.endswith("+620f44875c70")
    assert Path(folder).is_dir()


def test_cli_without_docker_says_so(two_bags, tmp_path, monkeypatch, capsys):
    from orchados_pipeline.cli import main

    src, _ = two_bags
    empty = tmp_path / "empty-bin"
    empty.mkdir()
    monkeypatch.setenv("PATH", str(empty))
    out = tmp_path / "reg"
    assert main(["lidar", "register", str(src), "--out", str(out)]) == 2
    assert "Docker is needed" in capsys.readouterr().err
    assert main(["lidar", "process", str(src), "--out", str(out)]) == 2
    assert "Docker is needed" in capsys.readouterr().err
    # The failed run leaves no folder behind.
    assert not any(out.iterdir())
