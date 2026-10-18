"""Small-area geodesy: WGS84 <-> local east/north tangent plane, bearings."""

from __future__ import annotations

import math

import numpy as np

_A = 6378137.0
_F = 1 / 298.257223563
_E2 = _F * (2 - _F)


class LocalFrame:
    """East/north metres around a reference point.

    Uses the meridian and prime-vertical radii at the reference latitude; the
    error is millimetres over a parcel-sized area (a few hundred metres).
    """

    def __init__(self, lat0: float, lon0: float):
        self.lat0, self.lon0 = lat0, lon0
        phi = math.radians(lat0)
        s = math.sin(phi)
        w = math.sqrt(1 - _E2 * s * s)
        self.r_n = _A * (1 - _E2) / w**3  # meridian radius
        self.r_e = _A / w * math.cos(phi)  # parallel radius

    def to_en(self, lat, lon):
        e = np.radians(np.asarray(lon, dtype=float) - self.lon0) * self.r_e
        n = np.radians(np.asarray(lat, dtype=float) - self.lat0) * self.r_n
        return e, n

    def to_latlon(self, e, n):
        lat = self.lat0 + np.degrees(np.asarray(n, dtype=float) / self.r_n)
        lon = self.lon0 + np.degrees(np.asarray(e, dtype=float) / self.r_e)
        return lat, lon


def bearing_deg(de: float, dn: float) -> float:
    """Azimuth of a local east/north vector, degrees clockwise from north in [0, 360)."""
    return math.degrees(math.atan2(de, dn)) % 360.0


def wrap180(angle_deg: float) -> float:
    return (angle_deg + 180.0) % 360.0 - 180.0
