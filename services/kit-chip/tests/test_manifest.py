"""The shared vectors are the cross-repo contract; the rest are this writer's own checks."""

import json
import math
import struct
from dataclasses import replace
from pathlib import Path

import pytest

from orchados_kit.manifest import (
    EEPROM_SIZE,
    Manifest,
    ManifestError,
    Pose,
    crc16_ccitt_false,
    decode,
    encode,
    from_dict,
    to_dict,
)

VECTORS = json.loads((Path(__file__).parent / "vectors" / "kit_manifest_v1.json").read_text())


def f32(value: float) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def norm(d: dict) -> dict:
    """A manifest dict with the floats at float32 precision."""
    out = dict(d)
    out["frames"] = {k: [f32(v) for v in vals] for k, vals in d["frames"].items()}
    return out


def test_there_are_three_vectors():
    assert len(VECTORS) == 3


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_encode_matches_the_vector_byte_for_byte(vector):
    image = encode(from_dict(vector["manifest"]))
    assert len(image) == EEPROM_SIZE
    assert image.hex() == vector["image_hex"]


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_decode_gives_the_vector_manifest_back(vector):
    decoded = to_dict(decode(bytes.fromhex(vector["image_hex"])))
    assert norm(decoded) == norm(vector["manifest"])


def test_crc_reference_value():
    # CRC-16/CCITT-FALSE check value for "123456789".
    assert crc16_ccitt_false(b"123456789") == 0x29B1


GOOD = Manifest(
    kind="orchados-scan-kit",
    serial="K001",
    hw_rev=(1, 0),
    caps=frozenset({"gnss_rtk", "pps", "cam360"}),
    gnss_link="usb",
    calib_id=7,
    frames={"kit_gnss": Pose(0, 0, 1.92), "kit_cam360": Pose(0, 0, 1.82, yaw=math.pi / 2)},
)


def test_good_manifest_round_trips():
    assert to_dict(decode(encode(GOOD)))["serial"] == "K001"
    assert encode(GOOD)[-1] == 0xFF


@pytest.mark.parametrize(
    "changes, why",
    [
        ({"kind": "toaster"}, "unknown kind"),
        ({"caps": frozenset({"gnss_rtk", "sonar"})}, "unknown capabilities"),
        ({"gnss_link": "wifi"}, "unknown gnss_link"),
        ({"gnss_link": "none"}, "gnss_link is 'none'"),
        ({"caps": frozenset({"gnss_rtk", "cam360_ctrl"})}, "cam360_ctrl without cam360"),
        ({"frames": {"kit_cam360": Pose(0, 0, 1.8)}}, "kit_gnss has no calibration"),
        ({"caps": frozenset({"gnss_rtk", "lidar"})}, "kit_lidar has no calibration"),
        ({"frames": {"kit_gnss": Pose(0, 0, math.nan)}}, "non-finite"),
        ({"frames": {"kit_gnss": Pose(0, 0, 5.5)}}, "from kit_mount"),
        ({"frames": {"kit_gnss": Pose(0, 0, 1, roll=3.3)}}, "angle outside"),
        ({"frames": {"kit_gnss": Pose(0, 0, 1), "kit_mast": Pose(0, 0, 1)}}, "unknown frame"),
        ({"calib_id": -1}, "uint32"),
        ({"calib_id": 2**32}, "uint32"),
        ({"serial": ""}, "1-8 ASCII"),
        ({"serial": "K00123456"}, "1-8 ASCII"),
        ({"serial": "KÖ01"}, "ASCII"),
        ({"serial": "K\x0001"}, "1-8 ASCII"),
        ({"hw_rev": (1, 300)}, "two bytes"),
        ({"schema": 2}, "schema 2"),
    ],
)
def test_invalid_manifests_are_not_written(changes, why):
    m = replace(GOOD, **changes)
    if "frames" in changes and "caps" not in changes:
        m = replace(m, caps=frozenset({"gnss_rtk"}))
    with pytest.raises(ManifestError, match=why):
        encode(m)


def _image(**changes) -> bytearray:
    return bytearray(encode(replace(GOOD, **changes)))


def _fix_crc(image: bytearray) -> bytearray:
    end = 6 + image[5]
    image[end : end + 2] = struct.pack("<H", crc16_ccitt_false(bytes(image[:end])))
    return image


def test_damaged_images_are_refused():
    blank = b"\xff" * EEPROM_SIZE
    with pytest.raises(ManifestError, match="blank"):
        decode(blank)
    with pytest.raises(ManifestError, match="bytes"):
        decode(encode(GOOD)[:100])
    bad_magic = _image()
    bad_magic[0:4] = b"XKIT"
    with pytest.raises(ManifestError, match="magic"):
        decode(bytes(bad_magic))
    newer = _image()
    newer[4] = 2
    with pytest.raises(ManifestError, match="schema 2"):
        decode(bytes(newer))
    flipped = _image()
    flipped[30] ^= 0x01
    with pytest.raises(ManifestError, match="CRC"):
        decode(bytes(flipped))
    twice = _image()
    twice[25 + 25] = twice[25]  # second frame claims the first frame's sensor
    with pytest.raises(ManifestError, match="twice"):
        decode(bytes(_fix_crc(twice)))
    unknown_bit = _image()
    unknown_bit[17] |= 0x80
    with pytest.raises(ManifestError, match="capability bits"):
        decode(bytes(_fix_crc(unknown_bit)))
