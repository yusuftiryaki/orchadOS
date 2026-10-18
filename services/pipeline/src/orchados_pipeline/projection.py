"""Equirectangular <-> viewing directions and gnomonic (perspective) crops.

Panorama convention: the centre column looks along the panorama heading;
azimuth grows to the right (clockwise seen from above); the top row is the
zenith, the bottom row the nadir.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from .geo import wrap180


def direction_to_pixel(
    yaw_deg: float, pitch_deg: float, width: int, height: int
) -> tuple[float, float]:
    """Pixel (x, y) of a direction given relative to the panorama heading."""
    x = (wrap180(yaw_deg) / 360.0 + 0.5) * width
    y = (0.5 - pitch_deg / 180.0) * height
    return x, y


def gnomonic_crop(
    pano: np.ndarray, yaw_deg: float, pitch_deg: float, fov_deg: float, size: int
) -> np.ndarray:
    """Square perspective view centred on (yaw, pitch) relative to the panorama heading."""
    h, w = pano.shape[:2]
    f = (size / 2) / math.tan(math.radians(fov_deg) / 2)
    c = (size - 1) / 2
    u, v = np.meshgrid(np.arange(size, dtype=np.float64), np.arange(size, dtype=np.float64))
    # Camera rays: x right, y down, z forward.
    x, y, z = (u - c) / f, (v - c) / f, np.ones_like(u)
    pitch, yaw = math.radians(pitch_deg), math.radians(yaw_deg)
    # Tilt up by `pitch` (rotation about x), then turn by `yaw` (about the vertical).
    cp, sp = math.cos(pitch), math.sin(pitch)
    y2 = y * cp - z * sp
    z2 = y * sp + z * cp
    cy, sy = math.cos(yaw), math.sin(yaw)
    x3 = x * cy + z2 * sy
    z3 = -x * sy + z2 * cy
    lon = np.arctan2(x3, z3)  # azimuth relative to heading, right positive
    lat = np.arctan2(-y2, np.hypot(x3, z3))
    map_x = ((lon / (2 * math.pi) + 0.5) * w - 0.5).astype(np.float32)
    map_y = ((0.5 - lat / math.pi) * h - 0.5).astype(np.float32)
    map_y = np.clip(map_y, 0, h - 1)
    return cv2.remap(pano, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
