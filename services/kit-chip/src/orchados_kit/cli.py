"""orchados-kit: write and read the scan kit's identity chip.

orchados-kit write MANIFEST.json            # to the one DS2431 on the bus
orchados-kit write MANIFEST.json --out kit.bin   # no hardware: the image to a file
orchados-kit from-calibration CALIBRATION_UUID --hw-rev 1.0 --gnss-link usb
                                            # manifest from public.calibration, to the chip
orchados-kit read                           # the chip's manifest
orchados-kit read --image kit.bin           # an image file (e.g. the robot's FileEeprom)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import chip
from .calibration import (
    CalibrationError,
    fetch_calibration,
    manifest_from_calibration,
    parse_hw_rev,
)
from .manifest import (
    CAPS,
    EEPROM_SIZE,
    GNSS_LINKS,
    ManifestError,
    decode,
    encode,
    from_dict,
    to_dict,
)


def _load(path: str):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"{path}: {exc}") from exc
    return from_dict(data)


def _emit(manifest, args) -> int:
    """To the chip, or with --out / --dry-run to a file / stdout only."""
    if args.out or args.dry_run:
        image = encode(manifest)
        decode(image)  # the same check as after a real write
        if args.out:
            Path(args.out).write_bytes(image)
            print(f"wrote {EEPROM_SIZE}-byte image to {args.out} (no chip touched)")
        else:
            print(image.hex())
        return 0
    path, back = chip.write_manifest(manifest, args.sysfs_glob)
    print(f"wrote and verified {path.parent.name}: serial {back.serial}, calib_id {back.calib_id}")
    return 0


def _cmd_write(args) -> int:
    return _emit(_load(args.manifest), args)


def _cmd_from_calibration(args) -> int:
    row = fetch_calibration(args.calibration_id)
    manifest = manifest_from_calibration(
        row,
        hw_rev=parse_hw_rev(args.hw_rev),
        gnss_link=args.gnss_link,
        extra_caps=args.cap,
    )
    if args.save_manifest:
        Path(args.save_manifest).write_text(json.dumps(to_dict(manifest), indent=2) + "\n")
    print(json.dumps({"calibration": row["id"], "manifest": to_dict(manifest)}, indent=2))
    return _emit(manifest, args)


def _cmd_read(args) -> int:
    if args.image:
        data = Path(args.image).read_bytes()
        manifest, source = decode(data), args.image
    else:
        path, manifest = chip.read_manifest(args.sysfs_glob)
        source = path.parent.name
    print(json.dumps({"source": str(source), "manifest": to_dict(manifest)}, indent=2))
    return 0


def _output_args(p) -> None:
    p.add_argument("--out", help="write the 128-byte image to this file instead of the chip")
    p.add_argument("--dry-run", action="store_true", help="print the image as hex, touch nothing")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="orchados-kit", description=__doc__.split("\n")[0])
    parser.add_argument("--sysfs-glob", default=chip.DEFAULT_GLOB, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest="command", required=True)

    w = sub.add_parser("write", help="encode a manifest and write it to the chip")
    w.add_argument("manifest", help="manifest JSON (the shared vector format)")
    _output_args(w)
    w.set_defaults(func=_cmd_write)

    c = sub.add_parser(
        "from-calibration",
        help="build the manifest from a calibration record and write it to the chip",
        description="Reads public.calibration as ORCHADOS_EMAIL (SUPABASE_URL, "
        "SUPABASE_ANON_KEY, ORCHADOS_PASSWORD). Poses come from extrinsics.kit_mount, "
        "calib_id from chip_id, the serial from the rig's scan kit; caps follow from the "
        "calibrated frames plus --cap.",
    )
    c.add_argument("calibration_id", help="public.calibration id (uuid)")
    c.add_argument("--hw-rev", required=True, help="kit hardware revision, e.g. 1.0")
    c.add_argument("--gnss-link", required=True, choices=list(GNSS_LINKS.values()))
    c.add_argument(
        "--cap",
        action="append",
        default=[],
        choices=[k for k in CAPS if k not in ("gnss_rtk", "cam360", "lidar")],
        help="wired extra (repeatable): pps, cam360_ctrl",
    )
    c.add_argument("--save-manifest", help="also save the manifest JSON to this file")
    _output_args(c)
    c.set_defaults(func=_cmd_from_calibration)

    r = sub.add_parser("read", help="show the manifest on the chip")
    r.add_argument("--image", help="read an image file instead of the chip")
    r.set_defaults(func=_cmd_read)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ManifestError, CalibrationError, chip.ChipError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
