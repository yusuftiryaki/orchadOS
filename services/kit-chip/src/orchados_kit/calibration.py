"""Manifest from an orchadOS calibration record (public.calibration).

The record carries what the chip needs (migration 20261027120000):
- `chip_id`: the manifest's calib_id, assigned by the database, never changes;
- `extrinsics.kit_mount`: {kit_gnss|kit_cam360|kit_lidar: [x, y, z, roll, pitch,
  yaw]} in the robot's `kit_mount` frame (hoverboard/docs/kit-soketi.md: origin at
  the kit's mounting plate, x forward, y left, z up; metres, radians).

The kit's serial comes from the rig's scan-kit device. What the database does
not model (hardware revision, how the GNSS reaches the robot, PPS and camera
control wiring) is given by the person writing the chip.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterable
from datetime import UTC, datetime

from .manifest import CAP_NEEDS_FRAME, Manifest, ManifestError, Pose, validate

KIND = "orchados-scan-kit"
# Kit frame -> the sensor kind the rig must have for it.
FRAME_SENSOR = {"kit_gnss": "gnss", "kit_cam360": "camera_360", "kit_lidar": "lidar"}
_CAP_OF_FRAME = {frame: cap for cap, frame in CAP_NEEDS_FRAME.items()}

SELECT = (
    "id,version,chip_id,valid_to,extrinsics,"
    "rig(name,rig_sensor(sensor(kind,device(kind,serial_number))))"
)


class CalibrationError(ValueError):
    """The calibration record cannot become a chip manifest; the message says why."""


def manifest_from_calibration(
    row: dict,
    *,
    hw_rev: tuple[int, int],
    gnss_link: str,
    extra_caps: Iterable[str] = (),
    now: datetime | None = None,
) -> Manifest:
    """Builds and validates the manifest for one calibration row (PostgREST shape of SELECT)."""
    label = f"calibration {row.get('id')} ({row.get('version')})"
    kit_mount = (row.get("extrinsics") or {}).get("kit_mount")
    if not kit_mount:
        raise CalibrationError(f"{label} has no extrinsics.kit_mount poses")
    valid_to = row.get("valid_to")
    if valid_to and datetime.fromisoformat(valid_to) <= (now or datetime.now(UTC)):
        raise CalibrationError(f"{label} expired at {valid_to}")

    rig = row.get("rig") or {}
    sensors = [rs["sensor"] for rs in rig.get("rig_sensor") or [] if rs.get("sensor")]
    kinds = {s["kind"] for s in sensors}
    for frame in kit_mount:
        need = FRAME_SENSOR.get(frame)
        if need and need not in kinds:
            raise CalibrationError(f"{label}: {frame} calibrated but rig has no {need} sensor")
    serials = {
        s["device"]["serial_number"]
        for s in sensors
        if (s.get("device") or {}).get("kind") == "human_kit"
    }
    if len(serials) != 1 or None in serials:
        raise CalibrationError(
            f"{label}: rig {rig.get('name')!r} needs exactly one scan kit with a serial "
            f"number, found {sorted(map(str, serials))}"
        )

    caps = {_CAP_OF_FRAME[f] for f in kit_mount if f in _CAP_OF_FRAME} | set(extra_caps)
    try:
        frames = {name: Pose(*map(float, v)) for name, v in kit_mount.items()}
    except (TypeError, ValueError) as exc:
        raise CalibrationError(f"{label}: bad kit_mount pose: {exc}") from exc
    manifest = Manifest(
        kind=KIND,
        serial=serials.pop(),
        hw_rev=hw_rev,
        caps=frozenset(caps),
        gnss_link=gnss_link,
        calib_id=int(row["chip_id"]),
        frames=frames,
    )
    validate(manifest)
    return manifest


def fetch_calibration(calibration_id: str, env: dict[str, str] | None = None) -> dict:
    """Reads one calibration row as the user in ORCHADOS_EMAIL (row-level security applies)."""
    env = os.environ if env is None else env
    try:
        url = env["SUPABASE_URL"].rstrip("/")
        key = env["SUPABASE_ANON_KEY"]
        email, password = env["ORCHADOS_EMAIL"], env["ORCHADOS_PASSWORD"]
    except KeyError as exc:
        raise CalibrationError(f"environment variable {exc} is not set") from exc

    token = _request(
        f"{url}/auth/v1/token?grant_type=password",
        {"apikey": key},
        {"email": email, "password": password},
    )["access_token"]
    query = urllib.parse.urlencode({"id": f"eq.{calibration_id}", "select": SELECT})
    rows = _request(
        f"{url}/rest/v1/calibration?{query}",
        {"apikey": key, "Authorization": f"Bearer {token}"},
    )
    if len(rows) != 1:
        raise CalibrationError(
            f"calibration {calibration_id} not found (or not visible to {email})"
        )
    return rows[0]


def _request(url: str, headers: dict[str, str], body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        raise CalibrationError(f"{exc.code} from {url.split('?')[0]}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise CalibrationError(f"cannot reach {url.split('?')[0]}: {exc.reason}") from exc


def parse_hw_rev(text: str) -> tuple[int, int]:
    try:
        major, minor = (int(p) for p in text.split("."))
    except ValueError as exc:
        raise ManifestError(f"hw_rev must look like 1.0, got {text!r}") from exc
    return major, minor
