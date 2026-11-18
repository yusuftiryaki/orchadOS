import signal
import subprocess
import sys

import pytest

from orchados_recorder.clock import FakeClock
from orchados_recorder.lidar import (
    BagRecorder,
    FakeLidarMonitor,
    LidarConfig,
    RosLidarMonitor,
    run_mode_command,
)


class FakeProcess:
    def __init__(self, cmd, ignore_sigint=False):
        self.cmd = cmd
        self.returncode = None
        self.signals = []
        self.ignore_sigint = ignore_sigint
        self.killed = False

    def poll(self):
        return self.returncode

    def send_signal(self, sig):
        self.signals.append(sig)
        if sig == signal.SIGINT and not self.ignore_sigint:
            self.returncode = 0

    def wait(self, timeout=None):
        if self.returncode is None:
            raise subprocess.TimeoutExpired(self.cmd, timeout)
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -9


def test_bag_command_records_three_topics_as_mcap_segments(tmp_path):
    cmd = BagRecorder(LidarConfig()).command(tmp_path)
    assert cmd[:5] == ["ros2", "bag", "record", "-s", "mcap"]
    assert cmd[cmd.index("-o") + 1] == str(tmp_path / "bag")
    assert "--max-bag-duration" in cmd and cmd[cmd.index("--max-bag-duration") + 1] == "180"
    assert cmd[-3:] == ["/unilidar/cloud", "/unilidar/imu", "/orchados/gnss_ubx"]


def test_start_stop_alive(tmp_path):
    procs = []

    def popen(cmd, **kw):
        procs.append(FakeProcess(cmd))
        return procs[-1]

    bag = BagRecorder(LidarConfig(), popen=popen)
    assert not bag.alive()
    bag.start(tmp_path)
    assert bag.alive() and procs[0].cmd == bag.command(tmp_path)
    bag.stop()
    assert procs[0].signals == [signal.SIGINT] and not bag.alive()


def test_stop_kills_a_stuck_recorder(tmp_path):
    proc = FakeProcess([], ignore_sigint=True)
    bag = BagRecorder(LidarConfig(), popen=lambda cmd, **kw: proc)
    bag.start(tmp_path)
    bag.stop(timeout_s=0)
    assert proc.killed and not bag.alive()


def test_start_failure_leaves_it_dead(tmp_path):
    def popen(cmd, **kw):
        raise FileNotFoundError("ros2")

    bag = BagRecorder(LidarConfig(), popen=popen)
    with pytest.raises(OSError):
        bag.start(tmp_path)
    assert not bag.alive()
    bag.stop()  # no-op


def test_written_bytes_sums_mcap_segments(tmp_path):
    bag = BagRecorder(LidarConfig())
    assert bag.written_bytes(tmp_path) == 0
    (tmp_path / "bag").mkdir()
    (tmp_path / "bag/bag_0.mcap").write_bytes(b"x" * 10)
    (tmp_path / "bag/bag_10.mcap").write_bytes(b"x" * 5)
    (tmp_path / "bag/bag_2.mcap").write_bytes(b"x" * 20)
    (tmp_path / "bag/metadata.yaml").write_text("rosbag2_bagfile_information: {}\n")
    assert bag.written_bytes(tmp_path) == 35
    assert bag.segments(tmp_path) == [
        {"file": "bag/bag_0.mcap", "bytes": 10},
        {"file": "bag/bag_2.mcap", "bytes": 20},
        {"file": "bag/bag_10.mcap", "bytes": 5},
    ]


def test_ros_monitor_requires_rclpy(monkeypatch):
    monkeypatch.setitem(sys.modules, "rclpy", None)
    with pytest.raises(RuntimeError, match="ROS 2 not available"):
        RosLidarMonitor(LidarConfig())


def test_mode_command_exit_codes():
    assert run_mode_command(["sh", "-c", "exit 0"]) == "ok"
    assert run_mode_command(["sh", "-c", "exit 3"]) == "wrong"
    assert run_mode_command(["sh", "-c", "exit 1"]) == "unknown"
    assert run_mode_command([]) == "unknown"
    assert run_mode_command(["/nonexistent/orchados-mode"]) == "unknown"


def test_fake_monitor_counts_by_elapsed_time():
    clock = FakeClock()
    lidar = FakeLidarMonitor(clock, rate_pps=64_000, imu_hz=200)
    lidar.drain()
    clock.advance_us(500_000)
    s = lidar.drain()
    assert (s.points, s.imu_messages, s.mono_us) == (32_000, 100, clock.now_mono_us())
    lidar.silent = True
    clock.advance_us(1_000_000)
    assert lidar.drain().points == 0
    lidar.publish_ubx(b"abc")
    assert lidar.published == [b"abc"]
    lidar.mode_value = "wrong"
    assert lidar.mode() == "unknown"  # until applied
    assert lidar.apply_mode() == "wrong" and lidar.mode() == "wrong"
