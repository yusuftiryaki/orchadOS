"""Command line: orchados-pipeline <stage> <session> [options]."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .context import RunContext
from .params import PipelineParams


def _ctx(args) -> RunContext:
    return RunContext.create(
        Path(args.session),
        args.out and Path(args.out),
        PipelineParams.load(args.params and Path(args.params)),
    )


def _summary(ctx: RunContext, out) -> None:
    kinds: dict[str, int] = {}
    for a in out.assets:
        kinds[a.kind] = kinds.get(a.kind, 0) + 1
    print(f"run directory: {ctx.run_dir}")
    print("assets: " + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    for w in out.warnings:
        print(f"warning: {w}")


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
    stage("crops", "tree crops").add_argument("--trees", help="trees JSON")
    stage("outputs", "write outputs.json")
    stage("run", "all stages in order").add_argument("--trees", help="trees JSON")

    up = sub.add_parser("upload", help="upload a finished run with the local fake uploader")
    up.add_argument("run_dir")
    up.add_argument("--dest", required=True, help="destination folder")

    syn = sub.add_parser("synth", help="generate a synthetic session folder")
    syn.add_argument("dest")

    pp = sub.add_parser("params", help="print default parameters as JSON")
    pp.add_argument("--hash", action="store_true", help="print only the parameter hash")

    args = parser.parse_args(argv)
    try:
        if args.command == "synth":
            from .synthetic import make_session

            truth = make_session(Path(args.dest))
            print(f"synthetic session written to {args.dest} ({truth.frame_count} frames)")
            return 0
        if args.command == "params":
            p = PipelineParams()
            print(p.params_hash() if args.hash else p.model_dump_json(indent=2))
            return 0
        if args.command == "upload":
            from .outputs import LocalUploader, upload_run

            res = upload_run(Path(args.run_dir), LocalUploader(Path(args.dest)))
            print(f"uploaded {res['objects']} objects; metadata: {res['metadata']}")
            return 0

        ctx = _ctx(args)
        trees = Path(args.trees) if getattr(args, "trees", None) else None
        if args.command == "run":
            _summary(ctx, pipeline.run_all(ctx, trees))
        elif args.command == "crops":
            res = pipeline.stage_crops(ctx, trees)
            print("no trees JSON, skipped" if res is None else f"{len(res.crops)} crops")
        elif args.command == "outputs":
            _summary(ctx, pipeline.stage_outputs(ctx))
        else:
            getattr(pipeline, f"stage_{args.command}")(ctx)
            print(f"{args.command}: done ({ctx.run_dir})")
        return 0
    except Exception as exc:  # noqa: BLE001 - report any stage failure as one line
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
