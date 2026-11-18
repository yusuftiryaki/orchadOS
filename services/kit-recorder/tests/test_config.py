from pathlib import Path

import pytest

from orchados_recorder.config import Config, load

EXAMPLE = Path(__file__).parents[1] / "config/recorder.toml"


def test_config_defaults(tmp_path):
    p = tmp_path / "recorder.toml"
    p.write_text("")
    c = load(p)
    assert c == Config()
    assert c.ssd_mount == Path("/mnt/orchados-ssd")
    assert c.receiver_port == "auto"
    assert c.lidar.points_topic == "/unilidar/cloud"
    assert c.lidar.imu_topic == "/unilidar/imu"
    assert c.lidar.ubx_topic == "/orchados/gnss_ubx"
    assert c.lidar.mode_command is None
    assert c.chrony_sock == Path("/run/chrony.gnss.sock")


def test_config_values(tmp_path):
    p = tmp_path / "recorder.toml"
    p.write_text(
        '[ssd]\nmount = "/media/ssd"\n'
        '[receiver]\nport = "/dev/ttyACM0"\n'
        '[lidar]\npoints_topic = "/l2/cloud"\nmode_command = ["l2-mode", "--negative"]\n'
        '[chrony]\nsock = "/run/x.sock"\n'
    )
    c = load(p)
    assert c.ssd_mount == Path("/media/ssd") and c.receiver_port == "/dev/ttyACM0"
    assert c.lidar.points_topic == "/l2/cloud" and c.lidar.imu_topic == "/unilidar/imu"
    assert c.lidar.mode_command == ["l2-mode", "--negative"]
    assert c.chrony_sock == Path("/run/x.sock")


def test_unknown_keys_are_refused(tmp_path):
    p = tmp_path / "recorder.toml"
    p.write_text('[lidar]\npoint_topic = "/typo"\n')
    with pytest.raises(ValueError, match="point_topic"):
        load(p)


def test_example_config_is_the_default():
    assert load(EXAMPLE) == Config()
