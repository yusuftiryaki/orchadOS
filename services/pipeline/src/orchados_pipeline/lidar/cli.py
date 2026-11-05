"""orchados-pipeline lidar <command>: LiDAR measurements from a registered cloud.

Each measuring module exposes ``run(session_dir, trees_path, out_dir, params_path)``
returning its report (written to out_dir) and ``summary_line(report)``.
"""

from __future__ import annotations

import argparse
from importlib import import_module
from pathlib import Path

import numpy as np

from .synthetic import SIZE_PRESETS, make_plot, prune, write_plot_session

# Session id of the synthetic scan written by synth --pruned-copy.
PRUNED_SESSION_ID = "00000000-0000-4000-8000-0000000000a2"


def default_out(session_dir: Path) -> Path:
    session_dir = Path(session_dir)
    return session_dir.parent / f"{session_dir.name}.processed" / "lidar"


def add_parser(sub) -> None:
    lp = sub.add_parser("lidar", help="LiDAR measurements from a registered point cloud")
    lsub = lp.add_subparsers(dest="lidar_command", required=True)

    def measuring(name: str, help_: str):
        p = lsub.add_parser(name, help=help_)
        p.add_argument("session", help="session folder with lidar/cloud.ply + cloud.json")
        p.add_argument("--trees", help="trees JSON (default: <session>/trees.json)")
        p.add_argument("--out", help="output folder (default: <session>.processed/lidar)")
        p.add_argument("--params", help="JSON file overriding the stage's default parameters")
        return p

    measuring("crown", "crown diameter, tree height, crown volume, size class proposal")
    measuring("skeleton", "winter branch skeleton: scaffold branches, wood volume (research)")
    pr = lsub.add_parser("pruning", help="compare two winter skeletons: what was pruned")
    pr.add_argument("before", help="session folder before pruning")
    pr.add_argument("after", help="session folder after pruning")
    pr.add_argument("--trees", help="trees JSON (default: <after>/trees.json)")
    pr.add_argument("--out", help="output folder (default: <after>.processed/lidar)")
    pr.add_argument("--params", help="JSON file overriding the stage's default parameters")

    up = lsub.add_parser(
        "upload",
        help="record the measurements of crown.json / skeleton.json / pruning.json in "
        "Supabase (env: as for upload)",
    )
    up.add_argument("out_dir", help="LiDAR output folder (<session>.processed/lidar)")
    up.add_argument("--session-id", required=True, help="public.session id of the scan")
    up.add_argument("--dry-run", action="store_true", help="print the payload, write nothing")

    syn = lsub.add_parser("synth", help="synthetic registered cloud of a small plot")
    syn.add_argument("dest")
    syn.add_argument(
        "--rows",
        default="sapling,young,productive;old,,productive",
        help="size presets per row, rows separated by ';' (" + ", ".join(SIZE_PRESETS) + ")",
    )
    syn.add_argument("--leafless", action="store_true", help="winter scan: wood only")
    syn.add_argument("--seed", type=int, default=1)
    syn.add_argument(
        "--pruned-copy",
        metavar="DEST",
        help="also write a second winter scan of the same trees after pruning (needs --leafless)",
    )
    syn.add_argument("--cuts", type=int, default=3, help="cuts per tree for --pruned-copy")
    syn.add_argument(
        "--cut-orders", default="2", help="branch orders to cut, e.g. 2 or 1,2 (default: 2)"
    )


def run(args: argparse.Namespace) -> int:
    cmd = args.lidar_command
    if cmd == "synth":
        sizes = [r.split(",") for r in args.rows.split(";")]
        if args.pruned_copy and not args.leafless:
            raise SystemExit("--pruned-copy needs --leafless (pruning is compared in winter)")
        rng = np.random.default_rng(args.seed)
        plot = make_plot(sizes, rng, leafy=not args.leafless)
        write_plot_session(Path(args.dest), plot)
        print(f"{args.dest}: {len(plot.points)} points, {len(plot.positions)} trees")
        if args.pruned_copy:
            orders = tuple(int(o) for o in args.cut_orders.split(","))
            pruned = {
                tid: prune(t, rng, n_cuts=args.cuts, orders=orders) for tid, t in plot.trees.items()
            }
            after = make_plot(
                sizes,
                rng,
                leafy=False,
                trees_override=pruned,
                session_id=PRUNED_SESSION_ID,
                parcel_id=plot.meta.parcel_id,
            )
            write_plot_session(Path(args.pruned_copy), after)
            cuts = sum(len(t.pruned) for t in pruned.values())
            print(f"{args.pruned_copy}: {len(after.points)} points, {cuts} cuts")
        return 0
    if cmd == "upload":
        from .upload import run as run_upload

        return run_upload(Path(args.out_dir), args.session_id, dry_run=args.dry_run)
    mod = import_module(f".{cmd}", __package__)
    params = args.params and Path(args.params)
    if cmd == "pruning":
        after = Path(args.after)
        trees = Path(args.trees) if args.trees else after / "trees.json"
        out = Path(args.out) if args.out else default_out(after)
        report = mod.run(Path(args.before), after, trees, out, params)
    else:
        session = Path(args.session)
        trees = Path(args.trees) if args.trees else session / "trees.json"
        out = Path(args.out) if args.out else default_out(session)
        report = mod.run(session, trees, out, params)
    print(mod.summary_line(report))
    return 0
