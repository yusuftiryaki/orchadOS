"""Minimal ROS 2 CDR encoding and decoding of the kit's MCAP messages, without ROS.

Only the three message types the kit recorder writes (docs/arayuzler.md, "Kit
kaydedicisi"): sensor_msgs/msg/PointCloud2, sensor_msgs/msg/Imu and
std_msgs/msg/UInt8MultiArray. Hand-written because the generic encoder of
mcap-ros2-support writes byte arrays one value at a time (too slow for clouds);
its decoder is used by the tests to check these bytes.

CDR here is little-endian (encapsulation header 00 01 00 00); alignment is
relative to the first byte after that header. ROS time stamps are UNIX time
(UTC) split into int32 sec and uint32 nanosec.
"""

from __future__ import annotations

import struct

import numpy as np

POINTCLOUD2 = "sensor_msgs/msg/PointCloud2"
IMU = "sensor_msgs/msg/Imu"
UINT8_ARRAY = "std_msgs/msg/UInt8MultiArray"

_SEP = "=" * 80 + "\n"
_HEADER_DEFS = (
    _SEP
    + "MSG: std_msgs/Header\nbuiltin_interfaces/Time stamp\nstring frame_id\n"
    + _SEP
    + "MSG: builtin_interfaces/Time\nint32 sec\nuint32 nanosec\n"
)

MSGDEFS = {
    POINTCLOUD2: (
        "std_msgs/Header header\nuint32 height\nuint32 width\nPointField[] fields\n"
        "bool is_bigendian\nuint32 point_step\nuint32 row_step\nuint8[] data\nbool is_dense\n"
        + _HEADER_DEFS
        + _SEP
        + "MSG: sensor_msgs/PointField\nuint8 INT8=1\nuint8 UINT8=2\nuint8 INT16=3\n"
        "uint8 UINT16=4\nuint8 INT32=5\nuint8 UINT32=6\nuint8 FLOAT32=7\nuint8 FLOAT64=8\n"
        "string name\nuint32 offset\nuint8 datatype\nuint32 count\n"
    ),
    IMU: (
        "std_msgs/Header header\ngeometry_msgs/Quaternion orientation\n"
        "float64[9] orientation_covariance\ngeometry_msgs/Vector3 angular_velocity\n"
        "float64[9] angular_velocity_covariance\ngeometry_msgs/Vector3 linear_acceleration\n"
        "float64[9] linear_acceleration_covariance\n"
        + _HEADER_DEFS
        + _SEP
        + "MSG: geometry_msgs/Quaternion\nfloat64 x\nfloat64 y\nfloat64 z\nfloat64 w\n"
        + _SEP
        + "MSG: geometry_msgs/Vector3\nfloat64 x\nfloat64 y\nfloat64 z\n"
    ),
    UINT8_ARRAY: (
        "std_msgs/MultiArrayLayout layout\nuint8[] data\n"
        + _SEP
        + "MSG: std_msgs/MultiArrayLayout\nMultiArrayDimension[] dim\nuint32 data_offset\n"
        + _SEP
        + "MSG: std_msgs/MultiArrayDimension\nstring label\nuint32 size\nuint32 stride\n"
    ),
}

# sensor_msgs/PointField datatypes -> numpy (little-endian).
FIELD_DTYPES = {1: "i1", 2: "u1", 3: "<i2", 4: "<u2", 5: "<i4", 6: "<u4", 7: "<f4", 8: "<f8"}
FLOAT32, UINT16 = 7, 4

_ENCAPSULATION = b"\x00\x01\x00\x00"


class CdrError(ValueError):
    pass


class _Writer:
    def __init__(self) -> None:
        self.buf = bytearray(_ENCAPSULATION)

    def _align(self, n: int) -> None:
        pad = (-(len(self.buf) - 4)) % n
        self.buf += b"\x00" * pad

    def u8(self, v: int) -> None:
        self.buf += struct.pack("<B", v)

    def u32(self, v: int) -> None:
        self._align(4)
        self.buf += struct.pack("<I", v)

    def i32(self, v: int) -> None:
        self._align(4)
        self.buf += struct.pack("<i", v)

    def f64s(self, values) -> None:
        self._align(8)
        self.buf += struct.pack(f"<{len(values)}d", *values)

    def string(self, s: str) -> None:
        b = s.encode() + b"\x00"
        self.u32(len(b))
        self.buf += b

    def blob(self, data: bytes) -> None:
        self.u32(len(data))
        self.buf += data

    def header(self, stamp_ns: int, frame_id: str) -> None:
        sec, nsec = divmod(int(stamp_ns), 1_000_000_000)
        self.i32(sec)
        self.u32(nsec)
        self.string(frame_id)


class _Reader:
    def __init__(self, data: bytes) -> None:
        if len(data) < 4 or data[1] != 1:
            raise CdrError("not little-endian CDR")
        self.data = memoryview(data)
        self.pos = 4

    def _align(self, n: int) -> None:
        self.pos += (-(self.pos - 4)) % n

    def _take(self, n: int) -> memoryview:
        if self.pos + n > len(self.data):
            raise CdrError("truncated CDR message")
        out = self.data[self.pos : self.pos + n]
        self.pos += n
        return out

    def u8(self) -> int:
        return self._take(1)[0]

    def u32(self) -> int:
        self._align(4)
        return struct.unpack("<I", self._take(4))[0]

    def i32(self) -> int:
        self._align(4)
        return struct.unpack("<i", self._take(4))[0]

    def f64s(self, n: int) -> tuple[float, ...]:
        self._align(8)
        return struct.unpack(f"<{n}d", self._take(8 * n))

    def string(self) -> str:
        n = self.u32()
        return bytes(self._take(n)).rstrip(b"\x00").decode()

    def blob(self) -> memoryview:
        return self._take(self.u32())

    def header(self) -> tuple[int, str]:
        sec = self.i32()
        nsec = self.u32()
        return sec * 1_000_000_000 + nsec, self.string()


# --- encoding ------------------------------------------------------------------------


def cloud_fields() -> tuple[list[tuple[str, int, int, int]], int]:
    """The L2 driver's point layout: x, y, z, intensity float32, ring uint16, time float32
    (seconds relative to the message stamp). Returns (fields, point_step)."""
    fields = [
        ("x", 0, FLOAT32, 1),
        ("y", 4, FLOAT32, 1),
        ("z", 8, FLOAT32, 1),
        ("intensity", 12, FLOAT32, 1),
        ("ring", 16, UINT16, 1),
        ("time", 20, FLOAT32, 1),
    ]
    return fields, 24


def cloud_dtype(fields, point_step: int) -> np.dtype:
    return np.dtype(
        {
            "names": [f[0] for f in fields],
            "formats": [FIELD_DTYPES[f[2]] for f in fields],
            "offsets": [f[1] for f in fields],
            "itemsize": point_step,
        }
    )


def encode_pointcloud2(
    stamp_ns: int,
    xyz: np.ndarray,
    intensity: np.ndarray,
    ring: np.ndarray,
    rel_time_s: np.ndarray,
    frame_id: str = "unilidar_lidar",
) -> bytes:
    fields, step = cloud_fields()
    arr = np.zeros(len(xyz), dtype=cloud_dtype(fields, step))
    arr["x"], arr["y"], arr["z"] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    arr["intensity"] = intensity
    arr["ring"] = ring
    arr["time"] = rel_time_s
    w = _Writer()
    w.header(stamp_ns, frame_id)
    w.u32(1)  # height
    w.u32(len(arr))  # width
    w.u32(len(fields))
    for name, offset, datatype, count in fields:
        w.string(name)
        w.u32(offset)
        w.u8(datatype)
        w.u32(count)
    w.u8(0)  # is_bigendian
    w.u32(step)
    w.u32(step * len(arr))
    w.blob(arr.tobytes())
    w.u8(1)  # is_dense
    return bytes(w.buf)


def encode_imu(
    stamp_ns: int,
    q_xyzw,
    gyro,
    acc,
    frame_id: str = "unilidar_imu",
) -> bytes:
    w = _Writer()
    w.header(stamp_ns, frame_id)
    w.f64s(list(map(float, q_xyzw)))
    w.f64s([0.0] * 9)
    w.f64s(list(map(float, gyro)))
    w.f64s([0.0] * 9)
    w.f64s(list(map(float, acc)))
    w.f64s([0.0] * 9)
    return bytes(w.buf)


def encode_uint8_array(data: bytes) -> bytes:
    w = _Writer()
    w.u32(0)  # layout.dim: empty
    w.u32(0)  # layout.data_offset
    w.blob(bytes(data))
    return bytes(w.buf)


# --- decoding ------------------------------------------------------------------------


def stamp_ns(payload: bytes) -> int:
    """header.stamp of a PointCloud2 or Imu message (the header is the first field)."""
    sec, nsec = struct.unpack_from("<iI", payload, 4)
    return sec * 1_000_000_000 + nsec


def with_stamp(payload: bytes, new_stamp_ns: int) -> bytes:
    """The same message with header.stamp replaced; nothing else changes."""
    sec, nsec = divmod(int(new_stamp_ns), 1_000_000_000)
    out = bytearray(payload)
    struct.pack_into("<iI", out, 4, sec, nsec)
    return bytes(out)


def decode_pointcloud2(payload: bytes) -> tuple[int, np.ndarray]:
    """(header.stamp ns, structured array of the points with the message's own fields)."""
    r = _Reader(payload)
    stamp, _frame = r.header()
    height, width = r.u32(), r.u32()
    fields = []
    for _ in range(r.u32()):
        name = r.string()
        offset = r.u32()
        datatype = r.u8()
        count = r.u32()
        if datatype not in FIELD_DTYPES:
            raise CdrError(f"PointField {name!r}: unsupported datatype {datatype}")
        if count == 1:
            fields.append((name, offset, datatype, count))
    if r.u8():
        raise CdrError("big-endian point data is not supported")
    step = r.u32()
    r.u32()  # row_step
    data = r.blob()
    n = height * width
    if len(data) < n * step:
        raise CdrError("PointCloud2 data shorter than width x height x point_step")
    arr = np.frombuffer(bytes(data[: n * step]), dtype=cloud_dtype(fields, step))
    return stamp, arr


def decode_imu(payload: bytes) -> tuple[int, np.ndarray, np.ndarray, np.ndarray]:
    """(stamp ns, orientation xyzw, angular velocity, linear acceleration)."""
    r = _Reader(payload)
    stamp, _frame = r.header()
    q = np.array(r.f64s(4))
    r.f64s(9)
    gyro = np.array(r.f64s(3))
    r.f64s(9)
    acc = np.array(r.f64s(3))
    return stamp, q, gyro, acc
