"""Kit manifest, schema 1: the 128-byte image of the kit's DS2431 identity chip.

The contract lives in the robot repository (yusuftiryaki/maraba):
docs/kit-soketi.md, "Kimlik çipinin içeriği (manifest)" and "Repolar arası
sözleşme". Its reference reader is ros2/src/robot_kit/robot_kit/manifest.py; if
that file and the document disagree, the file wins. Both repositories run the
same test vectors (tests/vectors/kit_manifest_v1.json, copied verbatim): change
the format in both places together, never on one side.

Layout, little-endian, from offset 0 of the EEPROM:

    off  size  field
    0    4     magic b"HKIT"
    4    1     schema (1)
    5    1     body length: bytes from offset 6 up to the CRC
    6    1     kind (1 = orchados-scan-kit)
    7    8     serial, ASCII, NUL-padded
    15   2     hw_rev major, minor
    17   2     caps bit field
    19   1     gnss_link
    20   4     calib_id (uint32)
    24   1     frame count k (<= 3)
    25   25*k  sensor id + x y z roll pitch yaw (float32), in the kit's frame
               `kit_mount`, sorted by sensor id
    ..   2     CRC-16/CCITT-FALSE over everything before it

The rest of the chip stays erased (0xFF).

The writer refuses everything the robot would refuse: a chip the robot rejects
leaves it in kitless mode, so writing one is never useful.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field

MAGIC = b"HKIT"
SCHEMA = 1
EEPROM_SIZE = 128

KINDS = {1: "orchados-scan-kit"}
# Installed hardware, not whether it works.
CAPS = {"gnss_rtk": 0, "pps": 1, "cam360": 2, "cam360_ctrl": 3, "lidar": 4}
GNSS_LINKS = {0: "none", 1: "usb", 2: "ros"}
SENSORS = {1: "kit_gnss", 2: "kit_cam360", 3: "kit_lidar"}
CAP_NEEDS_FRAME = {"gnss_rtk": "kit_gnss", "cam360": "kit_cam360", "lidar": "kit_lidar"}
MAX_OFFSET_M = 5.0
MAX_FRAMES = len(SENSORS)

_HEAD = struct.Struct("<4sBB")  # magic, schema, body length
_FIXED = struct.Struct("<B8sBBHBIB")  # kind, serial, hw major, minor, caps, link, calib, count
_FRAME = struct.Struct("<B6f")
_CRC = struct.Struct("<H")

_KIND_ID = {v: k for k, v in KINDS.items()}
_LINK_ID = {v: k for k, v in GNSS_LINKS.items()}
_SENSOR_ID = {v: k for k, v in SENSORS.items()}


class ManifestError(ValueError):
    """Not a manifest the robot would accept; the message says why."""


@dataclass(frozen=True)
class Pose:
    """A sensor in `kit_mount`: metres and radians."""

    x: float
    y: float
    z: float
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0

    def values(self) -> tuple[float, float, float, float, float, float]:
        return (self.x, self.y, self.z, self.roll, self.pitch, self.yaw)


@dataclass(frozen=True)
class Manifest:
    kind: str
    serial: str
    hw_rev: tuple[int, int]
    caps: frozenset[str]
    gnss_link: str
    calib_id: int
    frames: dict[str, Pose] = field(default_factory=dict)
    schema: int = SCHEMA

    def has(self, cap: str) -> bool:
        return cap in self.caps


def crc16_ccitt_false(data: bytes) -> int:
    """CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no xorout."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else crc << 1
            crc &= 0xFFFF
    return crc


def validate(m: Manifest) -> None:
    if m.schema != SCHEMA:
        raise ManifestError(f"schema {m.schema}: this writer knows only schema {SCHEMA}")
    if m.kind not in _KIND_ID:
        raise ManifestError(f"unknown kind {m.kind!r}")
    unknown = set(m.caps) - set(CAPS)
    if unknown:
        raise ManifestError(f"unknown capabilities {sorted(unknown)}")
    if m.gnss_link not in _LINK_ID:
        raise ManifestError(f"unknown gnss_link {m.gnss_link!r}")
    if m.has("gnss_rtk") and m.gnss_link == "none":
        raise ManifestError("gnss_rtk installed but gnss_link is 'none'")
    if m.has("cam360_ctrl") and not m.has("cam360"):
        raise ManifestError("cam360_ctrl without cam360")
    if len(m.frames) > MAX_FRAMES:
        raise ManifestError(f"{len(m.frames)} frames; at most {MAX_FRAMES}")
    for name, pose in m.frames.items():
        if name not in _SENSOR_ID:
            raise ManifestError(f"unknown frame {name!r}")
        values = pose.values()
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in values):
            raise ManifestError(f"{name}: non-finite calibration")
        if max(abs(pose.x), abs(pose.y), abs(pose.z)) > MAX_OFFSET_M:
            raise ManifestError(f"{name}: more than {MAX_OFFSET_M} m from kit_mount")
        if max(abs(pose.roll), abs(pose.pitch), abs(pose.yaw)) > math.pi + 1e-6:
            raise ManifestError(f"{name}: angle outside [-pi, pi]")
    for cap, frame in CAP_NEEDS_FRAME.items():
        if m.has(cap) and frame not in m.frames:
            raise ManifestError(f"{cap} installed but {frame} has no calibration")
    try:
        serial = m.serial.encode("ascii")
    except (UnicodeEncodeError, AttributeError) as exc:
        raise ManifestError(f"serial must be ASCII, got {m.serial!r}") from exc
    if not serial or len(serial) > 8 or b"\0" in serial:
        raise ManifestError(f"serial must be 1-8 ASCII characters, got {m.serial!r}")
    if len(m.hw_rev) != 2 or not all(isinstance(v, int) and 0 <= v <= 255 for v in m.hw_rev):
        raise ManifestError(f"hw_rev must be two bytes, got {m.hw_rev!r}")
    if not isinstance(m.calib_id, int) or not 0 <= m.calib_id <= 0xFFFFFFFF:
        raise ManifestError(f"calib_id must be a uint32, got {m.calib_id!r}")


def encode(m: Manifest) -> bytes:
    """The full 128-byte chip image. Raises ManifestError for anything invalid."""
    validate(m)
    caps = 0
    for cap in m.caps:
        caps |= 1 << CAPS[cap]
    body = _FIXED.pack(
        _KIND_ID[m.kind],
        m.serial.encode("ascii"),
        m.hw_rev[0],
        m.hw_rev[1],
        caps,
        _LINK_ID[m.gnss_link],
        m.calib_id,
        len(m.frames),
    )
    for name in sorted(m.frames, key=_SENSOR_ID.__getitem__):
        body += _FRAME.pack(_SENSOR_ID[name], *m.frames[name].values())
    used = _HEAD.pack(MAGIC, SCHEMA, len(body)) + body
    used += _CRC.pack(crc16_ccitt_false(used))
    if len(used) > EEPROM_SIZE:  # cannot happen with <= 3 frames; guard the layout
        raise ManifestError(f"manifest is {len(used)} bytes; the chip holds {EEPROM_SIZE}")
    return used + b"\xff" * (EEPROM_SIZE - len(used))


def decode(image: bytes) -> Manifest:
    """Reads a chip image; raises ManifestError unless it is a valid schema-1 manifest."""
    if len(image) < EEPROM_SIZE:
        raise ManifestError(f"{len(image)} bytes; a chip image is {EEPROM_SIZE}")
    if set(image[:EEPROM_SIZE]) == {0xFF}:
        raise ManifestError("the chip is blank")
    magic, schema, length = _HEAD.unpack_from(image)
    if magic != MAGIC:
        raise ManifestError(f"not a kit manifest (magic {magic!r})")
    if schema != SCHEMA:
        raise ManifestError(f"schema {schema}; only schema {SCHEMA} is known")
    end = _HEAD.size + length
    if length < _FIXED.size or end + _CRC.size > EEPROM_SIZE:
        raise ManifestError(f"body length {length} does not fit the chip")
    (stored,) = _CRC.unpack_from(image, end)
    if stored != crc16_ccitt_false(image[:end]):
        raise ManifestError("CRC mismatch")
    kind, serial, major, minor, caps_bits, link, calib_id, count = _FIXED.unpack_from(
        image, _HEAD.size
    )
    if _FIXED.size + count * _FRAME.size != length:
        raise ManifestError(f"{count} frames do not match body length {length}")
    if kind not in KINDS:
        raise ManifestError(f"unknown kind {kind}")
    if link not in GNSS_LINKS:
        raise ManifestError(f"unknown gnss_link {link}")
    known = sum(1 << bit for bit in CAPS.values())
    if caps_bits & ~known:
        raise ManifestError(f"unknown capability bits {caps_bits & ~known:#x}")
    frames: dict[str, Pose] = {}
    offset = _HEAD.size + _FIXED.size
    for _ in range(count):
        sensor, *values = _FRAME.unpack_from(image, offset)
        offset += _FRAME.size
        if sensor not in SENSORS:
            raise ManifestError(f"unknown sensor id {sensor}")
        if SENSORS[sensor] in frames:
            raise ManifestError(f"{SENSORS[sensor]} written twice")
        frames[SENSORS[sensor]] = Pose(*values)
    try:
        serial_text = serial.rstrip(b"\0").decode("ascii")
    except UnicodeDecodeError as exc:
        raise ManifestError("serial is not ASCII") from exc
    m = Manifest(
        kind=KINDS[kind],
        serial=serial_text,
        hw_rev=(major, minor),
        caps=frozenset(c for c, bit in CAPS.items() if caps_bits >> bit & 1),
        gnss_link=GNSS_LINKS[link],
        calib_id=calib_id,
        frames=frames,
    )
    validate(m)
    return m


def to_dict(m: Manifest) -> dict:
    """The JSON form used by the shared test vectors and the CLI."""
    return {
        "kind": m.kind,
        "schema": m.schema,
        "serial": m.serial,
        "hw_rev": list(m.hw_rev),
        "caps": sorted(m.caps),
        "gnss_link": m.gnss_link,
        "calib_id": m.calib_id,
        "frames": {name: list(pose.values()) for name, pose in sorted(m.frames.items())},
    }


def from_dict(data: dict) -> Manifest:
    try:
        frames = {name: Pose(*map(float, v)) for name, v in data.get("frames", {}).items()}
        return Manifest(
            kind=data["kind"],
            serial=data["serial"],
            hw_rev=tuple(int(v) for v in data["hw_rev"]),
            caps=frozenset(data["caps"]),
            gnss_link=data["gnss_link"],
            calib_id=int(data["calib_id"]),
            frames=frames,
            schema=int(data.get("schema", SCHEMA)),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ManifestError(f"malformed manifest: {exc}") from exc
