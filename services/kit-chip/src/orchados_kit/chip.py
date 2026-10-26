"""The DS2431 on Linux through the kernel's w1_ds2431 driver (family 0x2d).

The robot reads the same sysfs file: /sys/bus/w1/devices/2d-*/eeprom. Writing
needs root (or a udev rule) on the machine the kit is plugged into.

Tested only against a fake sysfs directory; no real chip has been written yet.
"""

from __future__ import annotations

import glob
import os
from pathlib import Path

from .manifest import EEPROM_SIZE, Manifest, ManifestError, decode, encode

DEFAULT_GLOB = "/sys/bus/w1/devices/2d-*/eeprom"


class ChipError(RuntimeError):
    """The chip could not be found, read or written as expected."""


def find_chip(pattern: str = DEFAULT_GLOB) -> Path:
    """The one DS2431 on the bus; refuses zero or several."""
    found = sorted(glob.glob(pattern))
    if not found:
        raise ChipError(f"no DS2431 on the 1-Wire bus ({pattern})")
    if len(found) > 1:
        names = ", ".join(Path(p).parent.name for p in found)
        raise ChipError(f"{len(found)} DS2431 chips on the bus ({names}); expected exactly one")
    return Path(found[0])


def read_image(path: Path) -> bytes:
    try:
        with open(path, "rb") as handle:
            data = handle.read(EEPROM_SIZE)
    except OSError as exc:
        raise ChipError(f"reading {path}: {exc}") from exc
    if len(data) != EEPROM_SIZE:
        raise ChipError(f"{path}: read {len(data)} bytes, expected {EEPROM_SIZE}")
    return data


def write_image(path: Path, image: bytes) -> None:
    """Writes the whole image from offset 0 (the driver splits it into 8-byte rows)."""
    if len(image) != EEPROM_SIZE:
        raise ChipError(f"image is {len(image)} bytes, expected {EEPROM_SIZE}")
    try:
        fd = os.open(path, os.O_WRONLY)
        try:
            written = os.write(fd, image)
        finally:
            os.close(fd)
    except OSError as exc:
        raise ChipError(f"writing {path}: {exc}") from exc
    if written != EEPROM_SIZE:
        raise ChipError(f"{path}: wrote {written} bytes, expected {EEPROM_SIZE}")


def write_manifest(manifest: Manifest, pattern: str = DEFAULT_GLOB) -> tuple[Path, Manifest]:
    """Encodes, writes, reads back, compares byte for byte and decodes."""
    image = encode(manifest)
    path = find_chip(pattern)
    write_image(path, image)
    back = read_image(path)
    if back != image:
        first = next(i for i, (a, b) in enumerate(zip(back, image, strict=True)) if a != b)
        raise ChipError(f"read-back differs from what was written (first at offset {first})")
    try:
        return path, decode(back)
    except ManifestError as exc:  # cannot happen if encode validated; keep the check anyway
        raise ChipError(f"read-back does not decode: {exc}") from exc


def read_manifest(pattern: str = DEFAULT_GLOB) -> tuple[Path, Manifest]:
    path = find_chip(pattern)
    return path, decode(read_image(path))
