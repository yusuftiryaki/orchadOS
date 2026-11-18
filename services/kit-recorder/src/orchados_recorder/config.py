"""Service configuration (TOML). On the Pi: /etc/orchados/recorder.toml.

Every key is optional; the defaults are those of config/recorder.toml.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from .lidar import LidarConfig

DEFAULT_PATH = Path("/etc/orchados/recorder.toml")

_SCHEMA = {
    "ssd": {"mount"},
    "receiver": {"port"},
    "lidar": {"points_topic", "imu_topic", "ubx_topic", "mode_command"},
    "chrony": {"sock"},
}


@dataclass
class Config:
    ssd_mount: Path = Path("/mnt/orchados-ssd")
    receiver_port: str = "auto"
    lidar: LidarConfig = field(default_factory=LidarConfig)
    chrony_sock: Path = Path("/run/chrony.gnss.sock")


def load(path: Path) -> Config:
    """Read a config file; unknown sections or keys are refused (typos)."""
    data = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    for section, values in data.items():
        allowed = _SCHEMA.get(section)
        if allowed is None or not isinstance(values, dict):
            raise ValueError(f"{path}: unknown section [{section}]")
        unknown = set(values) - allowed
        if unknown:
            raise ValueError(f"{path}: unknown keys in [{section}]: {sorted(unknown)}")

    c = Config()
    ssd = data.get("ssd", {})
    if "mount" in ssd:
        c.ssd_mount = Path(ssd["mount"])
    receiver = data.get("receiver", {})
    if "port" in receiver:
        c.receiver_port = str(receiver["port"])
    lidar = data.get("lidar", {})
    for key in ("points_topic", "imu_topic", "ubx_topic"):
        if key in lidar:
            setattr(c.lidar, key, str(lidar[key]))
    mode = lidar.get("mode_command")
    if mode:
        if not isinstance(mode, list) or not all(isinstance(a, str) for a in mode):
            raise ValueError(f"{path}: [lidar] mode_command must be a list of strings")
        c.lidar.mode_command = list(mode)
    chrony = data.get("chrony", {})
    if "sock" in chrony:
        c.chrony_sock = Path(chrony["sock"])
    return c
