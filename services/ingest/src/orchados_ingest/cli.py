"""Command line: orchados-ingest push | pull | verify | list | prune | init | config."""

from __future__ import annotations

import argparse
import dataclasses
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import __version__, config
from .hashing import HashCache
from .ops import IngestError, list_sessions, parse_duration, prune, pull, push, verify
from .sources import LAYOUTS
from .state import JsonState, default_state_dir
from .store import open_store
from .transfer import Limiter, fmt_bytes, parse_hours

BWLIMIT_ENV = "ORCHADOS_INGEST_BWLIMIT_MBPS"
BWLIMIT_HOURS_ENV = "ORCHADOS_INGEST_BWLIMIT_HOURS"


def _limiter(args) -> Limiter | None:
    mbps = args.bwlimit if args.bwlimit is not None else os.environ.get(BWLIMIT_ENV)
    if not mbps or float(mbps) <= 0:
        return None
    hours = args.bwlimit_hours or os.environ.get(BWLIMIT_HOURS_ENV)
    return Limiter(float(mbps), parse_hours(hours) if hours else None)


def _transfer_options(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--bwlimit",
        type=float,
        metavar="MBIT",
        help=f"bandwidth limit in Mbit/s (default ${BWLIMIT_ENV}; 0 = none)",
    )
    p.add_argument(
        "--bwlimit-hours",
        metavar="HH-HH",
        help=f"apply the limit only in these local hours, e.g. 08-19 (${BWLIMIT_HOURS_ENV})",
    )
    p.add_argument("--concurrency", type=int, help="parallel parts/files (default from config)")
    p.add_argument("-q", "--quiet", action="store_true", help="no progress lines")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="orchados-ingest",
        description="Session folders to and from the raw data store (S3, Azure Blob or local).",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument(
        "--config",
        type=Path,
        help=f"store config TOML (default ${config.CONFIG_ENV} or {config.default_config_path()})",
    )
    parser.add_argument(
        "--state-dir", type=Path, help=f"local state (default {default_state_dir()})"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("push", help="upload a session folder or card")
    p.add_argument("source", type=Path, help="session folder, logger card, camera card or MP4s")
    p.add_argument("--session-id", required=True, help="public.session id (uuid)")
    p.add_argument("--layout", choices=LAYOUTS, default="auto")
    p.add_argument("--org-id", help="org id when the source has no session.json")
    p.add_argument("--parcel-id", help="parcel id when the source has no session.json")
    p.add_argument(
        "--replace", action="store_true", help="overwrite files stored with other content"
    )
    p.add_argument("--dry-run", action="store_true", help="hash and check, upload nothing")
    _transfer_options(p)

    p = sub.add_parser("pull", help="download a session and check its checksums")
    p.add_argument("session_id")
    p.add_argument("dest", type=Path, help="target folder (the session folder)")
    p.add_argument("--include", action="append", metavar="GLOB", help="only these paths")
    p.add_argument("--exclude", action="append", metavar="GLOB", help="skip these paths")
    _transfer_options(p)

    p = sub.add_parser(
        "verify", help="check a stored session (or a local copy) against its manifest"
    )
    p.add_argument("session_id")
    p.add_argument("--local", type=Path, help="check this local folder instead of the store")
    p.add_argument("--deep", action="store_true", help="download and hash every stored file")

    p = sub.add_parser("list", help="sessions in the store, or one session's files")
    p.add_argument("session_id", nargs="?")

    p = sub.add_parser("prune", help="delete sessions older than the retention period")
    p.add_argument("--older-than", default="30d", help="e.g. 30d (default), 12h, 2w")
    p.add_argument("--dry-run", action="store_true")

    sub.add_parser("init", help="create the bucket/container if missing (dev, tests)")
    sub.add_parser("config", help="print the resolved store settings (no credentials)")
    return parser


def _age(ts: datetime | None) -> str:
    if ts is None:
        return "-"
    days = (datetime.now(UTC) - ts).total_seconds() / 86400
    return f"{days:.1f} d"


def run(args) -> int:
    cfg = config.load(args.config)
    if getattr(args, "concurrency", None):
        cfg = dataclasses.replace(cfg, concurrency=args.concurrency).validate()
    if args.command == "config":
        for k, v in cfg.__dict__.items():
            print(f"{k} = {v!r}")
        print(f"# {cfg.describe()}")
        return 0
    state_dir = args.state_dir or default_state_dir()
    store = open_store(cfg, state_dir)

    if args.command == "init":
        created = store.ensure_bucket()
        print(f"{store.describe()}: {'created' if created else 'exists'}")
        return 0

    if args.command == "push":
        res = push(
            store,
            args.source,
            args.session_id,
            layout=args.layout,
            org_id=args.org_id,
            parcel_id=args.parcel_id,
            limiter=_limiter(args),
            hash_cache=HashCache(JsonState(state_dir / "hashes.json")),
            replace=args.replace,
            quiet=args.quiet,
            dry_run=args.dry_run,
        )
        verb = "would upload" if args.dry_run else "uploaded"
        print(
            f"{store.describe()}/{res.prefix}: {verb} {len(res.uploaded)} files, "
            f"{len(res.skipped)} already there ({fmt_bytes(res.bytes_total)})"
        )
        if res.manifest:
            print(
                f"manifest: {len(res.manifest.files)} files, {fmt_bytes(res.manifest.total_bytes)}"
            )
        return 0

    if args.command == "pull":
        res = pull(
            store,
            args.session_id,
            args.dest,
            include=args.include,
            exclude=args.exclude,
            limiter=_limiter(args),
            quiet=args.quiet,
        )
        print(
            f"{args.dest}: downloaded {len(res.downloaded)} files, {len(res.skipped)} already "
            "there; checksums ok"
        )
        return 0

    if args.command == "verify":
        rep = verify(store, args.session_id, local=args.local, deep=args.deep)
        for n in rep.notes:
            print(f"note: {n}")
        for p in rep.problems:
            print(f"problem: {p}")
        where = args.local or store.describe()
        print(f"{where}: {rep.checked} files checked, {len(rep.problems)} problems")
        return 0 if rep.ok else 3

    if args.command == "list":
        if args.session_id:
            from .ops import require_session

            idx, man = require_session(store, args.session_id)
            print(f"# {idx.prefix} ({len(man.files)} files, {fmt_bytes(man.total_bytes)})")
            for e in sorted(man.files.values(), key=lambda e: e.path):
                print(f"{e.size:>14}  {e.sha256[:16]}  {e.path}")
            return 0
        rows = list_sessions(store)
        print(f"{'session':36}  {'parcel':36}  {'files':>5}  {'size':>9}  {'age':>7}  state")
        for s in rows:
            print(
                f"{s.session_id:36}  {s.parcel_id:36}  {s.files:>5}  {fmt_bytes(s.bytes):>9}  "
                f"{_age(s.last_modified):>7}  {'ok' if s.complete else 'incomplete'}"
            )
        return 0

    if args.command == "prune":
        res = prune(store, parse_duration(args.older_than), dry_run=args.dry_run)
        verb = "would delete" if args.dry_run else "deleted"
        for p in res.sessions:
            print(f"{verb} {p}")
        print(
            f"{verb} {len(res.sessions)} sessions ({res.objects} objects, {fmt_bytes(res.bytes)}), "
            f"{res.indexes} index entries; {res.uploads_aborted} unfinished uploads aborted; "
            f"cutoff {res.cutoff.isoformat(timespec='seconds')}"
        )
        return 0
    raise AssertionError(args.command)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return run(args)
    except KeyboardInterrupt:
        print("interrupted; run the same command again to continue", file=sys.stderr)
        return 130
    except Exception as exc:  # noqa: BLE001 - SDK errors too: one line, no traceback
        if os.environ.get("ORCHADOS_INGEST_DEBUG"):
            raise
        kind = "" if isinstance(exc, IngestError | ValueError) else f"{type(exc).__name__}: "
        print(f"error: {kind}{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
