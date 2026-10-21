"""Command line: orchados-pipeline <stage> <session> [options]."""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import __version__
from .context import RunContext
from .params import PipelineParams
from .supabase import Credentials


def _ctx(args) -> RunContext:
    return RunContext.create(
        Path(args.session),
        args.out and Path(args.out),
        PipelineParams.load(args.params and Path(args.params)),
    )


CROPS_STATUS = {
    None: "no tree list, no crops",
    "ok": "cut from the tree list",
    "no_tree_positions": "none, the parcel has no tree positions yet (panoramas only)",
    "inventory_session": "none, inventory session (panoramas only)",
}


def _summary(ctx: RunContext, out) -> None:
    kinds: dict[str, int] = {}
    for a in out.assets:
        kinds[a.kind] = kinds.get(a.kind, 0) + 1
    print(f"run directory: {ctx.run_dir}")
    print("assets: " + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    print(f"crops: {CROPS_STATUS[out.crops_status]}")
    for w in out.warnings:
        print(f"warning: {w}")


def _db_tree_list(ctx: RunContext, session_id: str | None):
    """The session's parcel trees from the database (ops credentials from the environment)."""
    from .models import SessionInfo
    from .supabase import SupabaseClient
    from .trees_db import TreesError, session_tree_list

    info = SessionInfo.model_validate_json((ctx.session_dir / "session.json").read_bytes())
    session_id = session_id or info.session_id
    with SupabaseClient.sign_in(Credentials.from_env()) as client:
        tlist = session_tree_list(client, session_id)
    if tlist.parcel_id != info.parcel_id:
        raise TreesError(
            f"session {session_id} is on parcel {tlist.parcel_id}, "
            f"session.json says {info.parcel_id}"
        )
    print(
        f"trees from the database: {len(tlist.trees)} active trees with a position"
        + (f", {len(tlist.unlocated_slots)} without" if tlist.unlocated_slots else "")
    )
    return tlist


def _boundary(ctx: RunContext, session_id: str | None, write_db: bool = True) -> None:
    """Boundary stage: corner events from the database -> boundary.json -> boundary version."""
    from . import boundary
    from .models import SessionInfo
    from .supabase import SupabaseClient

    info = SessionInfo.model_validate_json((ctx.session_dir / "session.json").read_bytes())
    with SupabaseClient.sign_in(Credentials.from_env()) as client:
        res = boundary.run(ctx, client, session_id or info.session_id, info.parcel_id, write_db)
    print("\n".join(res.lines()))


def _trees_options(p: argparse.ArgumentParser) -> None:
    g = p.add_mutually_exclusive_group()
    g.add_argument("--trees", help="trees JSON (default: <session>/trees.json)")
    g.add_argument(
        "--trees-from-db",
        action="store_true",
        help="active trees of the session's parcel from the database (env: "
        + ", ".join(Credentials.ENV)
        + ")",
    )


def upload_options(p: argparse.ArgumentParser, required: bool) -> None:
    from .upload import DEFAULT_KINDS, UPLOAD_KINDS

    p.add_argument("--session-id", required=required, help="public.session id (uuid)")
    p.add_argument(
        "--only",
        help=f"comma separated kinds to upload: {', '.join(sorted(UPLOAD_KINDS))} "
        f"(default: {','.join(sorted(DEFAULT_KINDS))})",
    )
    p.add_argument("--station", help="processing station name in station:// uris (default: host)")


def _upload(args, run_dir: Path, session_dir: Path | None) -> None:
    from .upload import UploadOptions, parse_kinds, upload_to_supabase

    opts = UploadOptions(
        session_dir=session_dir,
        require_db_trees=args.trees_from_db,
    )
    if args.only:
        opts.kinds = parse_kinds(args.only)
    if args.station:
        opts.station = args.station
    report = upload_to_supabase(run_dir, args.session_id, opts, log=print)
    print("\n".join(report.lines()))


def main(argv: list[str] | None = None) -> int:
    from . import pipeline

    parser = argparse.ArgumentParser(prog="orchados-pipeline", description=__doc__)
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    def stage(name, help_):
        p = sub.add_parser(name, help=help_)
        p.add_argument("session", help="session folder")
        p.add_argument("--out", help="output root (default: <session>.processed next to it)")
        p.add_argument("--params", help="JSON file overriding default parameters")
        return p

    stage("ingest", "validate the session and write manifest.json")
    stage("position", "trajectory from PPK or NAV-PVT")
    stage("sync", "camera clock from QR time codes")
    stage("frames", "candidate frames and per-slice selection")
    stage("panoramas", "write 4K/2K WebP panoramas")
    crops_p = stage("crops", "tree crops")
    _trees_options(crops_p)
    crops_p.add_argument("--session-id", help="public.session id (default: from session.json)")
    stage("outputs", "write outputs.json")
    bnd = stage(
        "boundary",
        "boundary version from the session's corner events (database; env: "
        + ", ".join(Credentials.ENV)
        + ")",
    )
    bnd.add_argument("--session-id", help="public.session id (default: from session.json)")
    bnd.add_argument(
        "--dry-run", action="store_true", help="write boundary.json, do not add a boundary version"
    )
    run = stage("run", "all stages in order")
    _trees_options(run)
    run.add_argument(
        "--boundary",
        action="store_true",
        help="also run the boundary stage after the others (database)",
    )
    run.add_argument("--upload", action="store_true", help="upload the run when it is done")
    upload_options(run, required=False)

    up = sub.add_parser(
        "upload",
        help="upload a finished run to Supabase (env: " + ", ".join(Credentials.ENV) + ")",
    )
    up.add_argument("run_dir", help="run folder: <session>.processed/v<version>_<hash>")
    up.add_argument("--session-dir", help="session folder (default: next to <session>.processed)")
    up.add_argument(
        "--trees-from-db",
        action="store_true",
        help="require crops cut with run --trees-from-db; match them by tree id",
    )
    upload_options(up, required=True)

    syn = sub.add_parser("synth", help="generate a synthetic session folder")
    syn.add_argument("dest")
    syn.add_argument("--session-id", help="session id to write (e.g. a public.session id)")
    syn.add_argument("--parcel-id", help="parcel id to write")
    fit = syn.add_mutually_exclusive_group()
    fit.add_argument(
        "--trees-from-db",
        action="store_true",
        help="build the scene from the active trees of --parcel-id in the database",
    )
    fit.add_argument("--trees", help="build the scene from a trees JSON")
    syn.add_argument("--rows", help="rows to drive around, e.g. 1-2 (default: all)")
    syn.add_argument("--positions", help="positions within the rows, e.g. 1-5 (default: all)")
    syn.add_argument(
        "--start-utc", help="recording start, ISO 8601 UTC (default: 2026-10-18 09:00)"
    )
    syn.add_argument("--seed", type=int, help="background noise seed (different image hashes)")
    syn.add_argument(
        "--boundary-walk",
        action="store_true",
        help="walk the boundary before the scan: corner rows in events.csv and the "
        "phone's corner events in phone_events.json",
    )

    pp = sub.add_parser("params", help="print default parameters as JSON")
    pp.add_argument("--hash", action="store_true", help="print only the parameter hash")

    args = parser.parse_args(argv)
    try:
        if args.command == "synth":
            return _synth(args, parser)
        if args.command == "params":
            p = PipelineParams()
            print(p.params_hash() if args.hash else p.model_dump_json(indent=2))
            return 0
        if args.command == "upload":
            _upload(args, Path(args.run_dir), args.session_dir and Path(args.session_dir))
            return 0
        if args.command == "run" and args.upload and not args.session_id:
            parser.error("--upload needs --session-id")

        ctx = _ctx(args)
        trees = Path(args.trees) if getattr(args, "trees", None) else None
        tlist = (
            _db_tree_list(ctx, args.session_id) if getattr(args, "trees_from_db", False) else None
        )
        if args.command == "run":
            _summary(ctx, pipeline.run_all(ctx, trees, tlist))
            if args.boundary:
                _boundary(ctx, args.session_id)
            if args.upload:
                _upload(args, ctx.run_dir, ctx.session_dir)
        elif args.command == "crops":
            res = pipeline.stage_crops(ctx, trees, tlist)
            if res is None:
                print("no trees JSON, skipped")
            else:
                print(f"{len(res.crops)} crops; {CROPS_STATUS[res.status]}")
        elif args.command == "boundary":
            _boundary(ctx, args.session_id, write_db=not args.dry_run)
        elif args.command == "outputs":
            _summary(ctx, pipeline.stage_outputs(ctx))
        else:
            getattr(pipeline, f"stage_{args.command}")(ctx)
            print(f"{args.command}: done ({ctx.run_dir})")
        return 0
    except Exception as exc:  # noqa: BLE001 - report any stage failure as one line
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _synth(args, parser: argparse.ArgumentParser) -> int:
    from .crops import load_trees
    from .synthetic import SyntheticConfig, make_session, parse_range

    cfg = SyntheticConfig()
    cfg.session_id = args.session_id or cfg.session_id
    cfg.parcel_id = args.parcel_id or cfg.parcel_id
    if args.trees_from_db:
        from .supabase import SupabaseClient
        from .trees_db import parcel_tree_list

        if not args.parcel_id:
            parser.error("--trees-from-db needs --parcel-id")
        with SupabaseClient.sign_in(Credentials.from_env()) as client:
            cfg.parcel_trees = parcel_tree_list(client, args.parcel_id).trees
        if not cfg.parcel_trees:
            raise ValueError(f"parcel {args.parcel_id} has no active trees with a position")
    elif args.trees:
        cfg.parcel_trees = load_trees(Path(args.trees)).trees
    elif args.rows or args.positions:
        parser.error("--rows and --positions need --trees-from-db or --trees")
    if args.start_utc:
        start = datetime.fromisoformat(args.start_utc)
        cfg.start_utc = start.replace(tzinfo=UTC) if start.tzinfo is None else start.astimezone(UTC)
    if args.seed is not None:
        cfg.seed = args.seed
    cfg.rows = parse_range(args.rows) if args.rows else None
    cfg.positions = parse_range(args.positions) if args.positions else None
    cfg.boundary_walk = args.boundary_walk
    truth = make_session(Path(args.dest), cfg)
    print(
        f"synthetic session written to {args.dest} ({truth.frame_count} frames, "
        f"{len(truth.trees)} trees, {truth.path_length_m:.0f} m path"
        + (
            f", boundary walk: {len(truth.boundary_corners)} corners, "
            f"{truth.boundary_area_m2:.0f} m2"
            if truth.boundary_corners
            else ""
        )
        + ")"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
