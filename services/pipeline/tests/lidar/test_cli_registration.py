"""orchados-pipeline lidar register / process / --cloud."""

from __future__ import annotations

import json
from pathlib import Path

from mcap.writer import Writer

from orchados_pipeline.cli import main
from orchados_pipeline.lidar.registration import registration_runs

from .conftest import link_session


def _runs(session: Path) -> list[Path]:
    return [d for d, _ in registration_runs(session)]


def test_register_prints_the_verdict(small_ppk, tmp_path, capsys):
    session = link_session(small_ppk[0], tmp_path / "s")
    assert main(["lidar", "register", str(session), "--frontend", "fake"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("registration: review (few_trees_checked)")
    (run,) = _runs(session)
    assert str(run) in out
    assert main(["lidar", "register", str(tmp_path / "nothing"), "--frontend", "fake"]) == 1
    assert not (run / "frontend/scans").exists()
    assert (
        main(["lidar", "register", str(session), "--frontend", "fake", "--keep-frontend-scans"])
        == 0
    )
    kept = [d for d in _runs(session) if d != run]
    assert len(kept) == 1 and list((kept[0] / "frontend/scans").glob("*.npz"))


def test_process_without_lidar_is_noop(tmp_path, capsys):
    """No lidar/raw, or only an empty MCAP: LiDAR is skipped, the visit is not blocked."""
    session = tmp_path / "s"
    session.mkdir()
    (session / "session.json").write_text(json.dumps({"session_id": "x", "parcel_id": "y"}))
    assert main(["lidar", "process", str(session), "--frontend", "fake"]) == 0
    assert "LiDAR skipped" in capsys.readouterr().out
    bag = session / "lidar/raw/bag"
    bag.mkdir(parents=True)
    with open(bag / "bag_0.mcap", "wb") as f:
        w = Writer(f)
        w.start(profile="ros2")
        w.finish()
    assert main(["lidar", "process", str(session), "--frontend", "fake", "--upload"]) == 0
    assert "LiDAR skipped" in capsys.readouterr().out
    assert not (tmp_path / "s.processed").exists()


def test_process_inventory_and_reuse(small_ppk, tmp_path, capsys):
    """Without trees.json crown is skipped and the world is still made; once the inventory
    is there, --reuse-registration runs crown on the same registration (no new run)."""
    src = small_ppk[0]
    session = link_session(src, tmp_path / "s", trees=False)
    assert main(["lidar", "process", str(session), "--frontend", "fake"]) == 0
    out = capsys.readouterr().out
    assert "crown skipped" in out
    (run,) = _runs(session)
    steps = json.loads((run / "process.json").read_text())["steps"]
    assert steps["crown"]["status"] == "skipped"
    assert steps["world"]["status"] == "done"
    assert (run / "world.owc").is_file() and not (run / "crown.json").exists()

    (session / "trees.json").symlink_to(src / "trees.json")
    assert main(["lidar", "process", str(session), "--reuse-registration"]) == 0
    assert "reusing" in capsys.readouterr().out
    assert _runs(session) == [run]
    crown = json.loads((run / "crown.json").read_text())
    assert len(crown["trees"]) == 8
    steps = json.loads((run / "process.json").read_text())["steps"]
    assert steps["crown"]["status"] == "done" and steps["world"]["status"] == "done"


def test_process_rejected_skips_measurements(tmp_path, capsys):
    from orchados_pipeline.lidar.synth_moving import MovingConfig, make_moving_session

    session = tmp_path / "s"
    cfg = MovingConfig(rows=1, trees_per_row=2, duration_s=22.0, points_per_s=1000, imu_hz=80.0)
    make_moving_session(session, cfg)
    assert main(["lidar", "process", str(session), "--frontend", "fake"]) == 0
    assert "rejected" in capsys.readouterr().out
    (run,) = _runs(session)
    assert not (run / "crown.json").exists() and not (run / "world.owc").exists()
    assert main(["lidar", "process", str(session), "--reuse-registration"]) == 1


def test_crown_with_cloud_option(small_ppk, tmp_path, capsys):
    session = link_session(small_ppk[0], tmp_path / "s")
    assert main(["lidar", "register", str(session), "--frontend", "fake"]) == 0
    (run,) = _runs(session)
    out = tmp_path / "crown"
    assert main(["lidar", "crown", str(session), "--cloud", str(run), "--out", str(out)]) == 0
    assert "crown: 8 trees" in capsys.readouterr().out
    assert (out / "crown.json").is_file()
