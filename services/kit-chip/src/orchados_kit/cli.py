"""orchados-kit: write and read the scan kit's identity chip.

orchados-kit write MANIFEST.json            # to the one DS2431 on the bus
orchados-kit write MANIFEST.json --out kit.bin   # no hardware: the image to a file
orchados-kit read                           # the chip's manifest
orchados-kit read --image kit.bin           # an image file (e.g. the robot's FileEeprom)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import chip
from .manifest import EEPROM_SIZE, ManifestError, decode, encode, from_dict, to_dict


def _load(path: str):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"{path}: {exc}") from exc
    return from_dict(data)


def _cmd_write(args) -> int:
    manifest = _load(args.manifest)
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


def _cmd_read(args) -> int:
    if args.image:
        data = Path(args.image).read_bytes()
        manifest, source = decode(data), args.image
    else:
        path, manifest = chip.read_manifest(args.sysfs_glob)
        source = path.parent.name
    print(json.dumps({"source": str(source), "manifest": to_dict(manifest)}, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="orchados-kit", description=__doc__.split("\n")[0])
    parser.add_argument("--sysfs-glob", default=chip.DEFAULT_GLOB, help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest="command", required=True)

    w = sub.add_parser("write", help="encode a manifest and write it to the chip")
    w.add_argument("manifest", help="manifest JSON (the shared vector format)")
    w.add_argument("--out", help="write the 128-byte image to this file instead of the chip")
    w.add_argument("--dry-run", action="store_true", help="print the image as hex, touch nothing")
    w.set_defaults(func=_cmd_write)

    r = sub.add_parser("read", help="show the manifest on the chip")
    r.add_argument("--image", help="read an image file instead of the chip")
    r.set_defaults(func=_cmd_read)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ManifestError, chip.ChipError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
