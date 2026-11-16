"""LiDAR (Unitree L2): live monitoring and the MCAP recording.

The L2's ROS 2 driver publishes the point cloud and IMU. The recorder
- watches both topics to know whether data arrives (`RosLidarMonitor`),
- republishes the raw UBX bytes on a topic so the bag has them too,
- runs `ros2 bag record -s mcap` into `lidar/raw/bag/` in segments (`BagRecorder`).

rclpy exists only on the Pi; it is imported lazily and never in CI.
Topics and the bag layout: docs/arayuzler.md, "lidar/raw/recording.json".
"""

from __future__ import annotations

import logging
import re
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Protocol

from .thresholds import BAG_SEGMENT_S

log = logging.getLogger(__name__)

LidarMode = Literal["unknown", "ok", "wrong"]
BAG_DIR = "bag"
MODE_EXIT_WRONG = 3


@dataclass
class LidarConfig:
    points_topic: str = "/unilidar/cloud"
    imu_topic: str = "/unilidar/imu"
    ubx_topic: str = "/orchados/gnss_ubx"
    # Turns the negative-angle mode on and checks it: exit 0 on, 3 off, else unknown.
    # Empty: the mode is not checked ("unknown" passes the pre-check).
    mode_command: list[str] | None = field(default=None)


@dataclass(frozen=True)
class LidarSample:
    """What arrived since the previous drain."""

    mono_us: int
    points: int
    imu_messages: int


class LidarMonitor(Protocol):
    def drain(self) -> LidarSample: ...

    def mode(self) -> LidarMode:
        """The result of the last apply_mode(); runs nothing."""
        ...

    def apply_mode(self) -> LidarMode: ...

    def publish_ubx(self, data: bytes) -> None: ...


def run_mode_command(cmd: list[str] | None) -> LidarMode:
    if not cmd:
        return "unknown"
    try:
        rc = subprocess.run(cmd, timeout=15, capture_output=True).returncode
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("lidar mode command failed: %s", exc)
        return "unknown"
    if rc == 0:
        return "ok"
    if rc == MODE_EXIT_WRONG:
        return "wrong"
    return "unknown"


class RosLidarMonitor:
    """Counts PointCloud2 points and Imu messages; publishes UBX as UInt8MultiArray."""

    def __init__(self, config: LidarConfig) -> None:
        try:
            import rclpy
            from rclpy.executors import SingleThreadedExecutor
            from rclpy.qos import QoSProfile, qos_profile_sensor_data
            from sensor_msgs.msg import Imu, PointCloud2
            from std_msgs.msg import UInt8MultiArray
        except ImportError as exc:
            raise RuntimeError("ROS 2 not available (rclpy cannot be imported)") from exc

        self.config = config
        self._lock = threading.Lock()
        self._points = 0
        self._imu = 0
        self._mode: LidarMode = "unknown"
        self._msg_type = UInt8MultiArray

        if not rclpy.ok():
            rclpy.init()
        self._node = rclpy.create_node("orchados_recorder")
        self._node.create_subscription(
            PointCloud2, config.points_topic, self._on_cloud, qos_profile_sensor_data
        )
        self._node.create_subscription(Imu, config.imu_topic, self._on_imu, qos_profile_sensor_data)
        self._ubx_pub = self._node.create_publisher(
            UInt8MultiArray, config.ubx_topic, QoSProfile(depth=200)
        )
        self._executor = SingleThreadedExecutor()
        self._executor.add_node(self._node)
        threading.Thread(target=self._executor.spin, name="ros-spin", daemon=True).start()

    def _on_cloud(self, msg) -> None:
        with self._lock:
            self._points += int(msg.width) * int(msg.height)

    def _on_imu(self, msg) -> None:
        with self._lock:
            self._imu += 1

    def drain(self) -> LidarSample:
        with self._lock:
            points, imu = self._points, self._imu
            self._points = self._imu = 0
        return LidarSample(time.monotonic_ns() // 1000, points, imu)

    def mode(self) -> LidarMode:
        return self._mode

    def apply_mode(self) -> LidarMode:
        self._mode = run_mode_command(self.config.mode_command)
        return self._mode

    def publish_ubx(self, data: bytes) -> None:
        msg = self._msg_type()
        msg.data = bytes(data)
        self._ubx_pub.publish(msg)


class NullLidarMonitor:
    """No ROS 2: nothing ever arrives (the pre-check fails; it can be overridden)."""

    def drain(self) -> LidarSample:
        return LidarSample(time.monotonic_ns() // 1000, 0, 0)

    def mode(self) -> LidarMode:
        return "unknown"

    def apply_mode(self) -> LidarMode:
        return "unknown"

    def publish_ubx(self, data: bytes) -> None:
        pass


class FakeLidarMonitor:
    """Test LiDAR: points and IMU messages at fixed rates on a fake clock."""

    def __init__(
        self,
        clock,
        rate_pps: float = 64_000,
        imu_hz: float = 200,
        silent: bool = False,
        mode_value: LidarMode = "unknown",
    ) -> None:
        self.clock = clock
        self.rate_pps = rate_pps
        self.imu_hz = imu_hz
        self.silent = silent
        self.mode_value: LidarMode = mode_value
        self.published: list[bytes] = []
        self._mode: LidarMode = "unknown"
        self._last_us = clock.now_mono_us()
        self._carry_points = 0.0
        self._carry_imu = 0.0

    def drain(self) -> LidarSample:
        now = self.clock.now_mono_us()
        dt_s = (now - self._last_us) / 1e6
        self._last_us = now
        if self.silent:
            return LidarSample(now, 0, 0)
        self._carry_points += self.rate_pps * dt_s
        self._carry_imu += self.imu_hz * dt_s
        points, imu = int(self._carry_points), int(self._carry_imu)
        self._carry_points -= points
        self._carry_imu -= imu
        return LidarSample(now, points, imu)

    def mode(self) -> LidarMode:
        return self._mode

    def apply_mode(self) -> LidarMode:
        self._mode = self.mode_value
        return self._mode

    def publish_ubx(self, data: bytes) -> None:
        self.published.append(bytes(data))


def _segment_key(path: Path) -> tuple[int, str]:
    m = re.search(r"_(\d+)\.mcap$", path.name)
    return (int(m.group(1)) if m else -1, path.name)


class BagRecorder:
    """`ros2 bag record` as a child process, writing MCAP segments."""

    def __init__(self, config: LidarConfig, popen=subprocess.Popen) -> None:
        self.config = config
        self.popen = popen
        self._proc = None

    def command(self, out_dir: Path) -> list[str]:
        return [
            "ros2",
            "bag",
            "record",
            "-s",
            "mcap",
            "-o",
            str(Path(out_dir) / BAG_DIR),
            "--max-bag-duration",
            str(BAG_SEGMENT_S),
            self.config.points_topic,
            self.config.imu_topic,
            self.config.ubx_topic,
        ]

    def start(self, out_dir: Path) -> None:
        """Raises OSError if the process cannot be started (e.g. no ros2)."""
        self._proc = None
        self._proc = self.popen(self.command(out_dir), stdin=subprocess.DEVNULL)

    def stop(self, timeout_s: float = 10) -> None:
        """SIGINT (ros2 bag closes the MCAP cleanly), then SIGKILL if it hangs."""
        proc, self._proc = self._proc, None
        if proc is None or proc.poll() is not None:
            return
        proc.send_signal(signal.SIGINT)
        try:
            proc.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            log.warning("ros2 bag did not stop in %s s; killing it", timeout_s)
            proc.kill()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass

    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def _files(self, out_dir: Path) -> list[Path]:
        return sorted((Path(out_dir) / BAG_DIR).glob("*.mcap"), key=_segment_key)

    def written_bytes(self, out_dir: Path) -> int:
        total = 0
        for f in self._files(out_dir):
            try:
                total += f.stat().st_size
            except OSError:
                pass
        return total

    def segments(self, out_dir: Path) -> list[dict]:
        out = []
        for f in self._files(out_dir):
            try:
                size = f.stat().st_size
            except OSError:
                continue
            out.append({"file": f"{BAG_DIR}/{f.name}", "bytes": size})
        return out
