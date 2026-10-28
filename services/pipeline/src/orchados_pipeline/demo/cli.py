"""`orchados-pipeline demo build|load|enable|disable|verify` (docs/demo-turu.md §10.1)."""

from __future__ import annotations

import argparse
from pathlib import Path

from .render import PROFILES

TARGETS = ("local", "remote")


def add_parser(sub) -> None:
    demo = sub.add_parser(
        "demo", help="demo tour dataset: build media, load, verify, enable, disable"
    )
    dsub = demo.add_subparsers(dest="demo_command", required=True)

    b = dsub.add_parser("build", help="render the synthetic media into the build cache")
    b.add_argument("--profile", choices=sorted(PROFILES), default="full")
    b.add_argument(
        "--out", help="build folder (default: services/pipeline/.demo-build/v<version>-<profile>)"
    )
    b.add_argument("--force", action="store_true", help="rebuild even when the cache is complete")
    b.add_argument("--workers", type=int, help="render processes (default: CPU count, at most 8)")

    ld = dsub.add_parser("load", help="build (or reuse) and load the dataset")
    ld.add_argument("--target", choices=TARGETS, required=True)
    ld.add_argument("--profile", choices=sorted(PROFILES), default="full")
    ld.add_argument("--build", help="use this build folder (e.g. a downloaded workflow artifact)")
    ld.add_argument(
        "--dry-run", action="store_true", help="run the SQL and roll it back; no media, no registry"
    )
    ld.add_argument(
        "--reset-local", action="store_true", help="remove the demo org first (local only)"
    )
    ld.add_argument("--verify", action="store_true", help="check the loaded dataset")
    ld.add_argument(
        "--demo-only", action="store_true", help="refuse a target that has any other org"
    )
    ld.add_argument("--enable", action="store_true", help="enable the demo after a passing verify")

    for name, help_ in (
        ("enable", "enable the loaded demo (verify first; disables other demo orgs)"),
        ("disable", "disable the demo"),
        ("verify", "check the loaded dataset"),
    ):
        p = dsub.add_parser(name, help=help_)
        p.add_argument("--target", choices=TARGETS, required=True)


def run(args: argparse.Namespace) -> int:
    from . import loader

    if args.demo_command == "build":
        from .build import build

        out, manifest = build(args.profile, args.out and Path(args.out), args.force, args.workers)
        mb = sum(f["bytes"] for f in manifest["files"]) / 1e6
        print(
            f"{len(manifest['files'])} files, {mb:.1f} MB, dataset_sha256 "
            f"{manifest['dataset_sha256']}"
        )
        return 0
    if args.demo_command == "load":
        loader.load_demo(
            args.target,
            profile=args.profile,
            build_dir=args.build and Path(args.build),
            dry_run=args.dry_run,
            reset=args.reset_local,
            do_verify=args.verify,
            demo_only=args.demo_only,
            do_enable=args.enable,
        )
        return 0
    db = loader.Psql(args.target)
    if args.demo_command == "verify":
        return 1 if loader.verify(db) else 0
    if args.demo_command == "enable":
        loader.enable(db)
        return 0
    loader.disable(db)
    return 0
