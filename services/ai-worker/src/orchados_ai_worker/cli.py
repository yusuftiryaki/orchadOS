"""Command line: ai-worker run | resume | eval."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

from .config import WorkerConfig
from .cost import format_cost_report
from .state import default_state_dir
from .supabase import SupabaseError
from .worker import RunOptions, RunReport, Worker, WorkerError


def _common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--session-id", required=True, help="public.session id of the scan visit")
    p.add_argument("--config", type=Path, help="JSON file overriding config.WorkerConfig fields")
    p.add_argument(
        "--with-opus",
        action="store_true",
        help="add Claude Opus 5.5 as a third stage for the hardest cases",
    )
    p.add_argument("--threshold", type=float, help="triage confidence threshold (default 0.70)")
    p.add_argument(
        "--state-dir",
        type=Path,
        help="job state folder (default $AI_WORKER_STATE_DIR or ~/.local/state/orchados-ai-worker)",
    )
    p.add_argument(
        "--no-wait",
        action="store_true",
        help="submit and exit; finish later with `ai-worker resume`",
    )
    p.add_argument(
        "--no-write",
        action="store_true",
        help="keep the answers in the job state only (e.g. published visits, for eval)",
    )
    p.add_argument("--limit", type=int, help="assess at most this many new trees")
    p.add_argument(
        "--test-data-only",
        action="store_true",
        help="confirm the visit holds test data only (required by providers that may "
        "train on requests, e.g. free hosted tiers)",
    )
    p.add_argument("--json", action="store_true", help="print the report as JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ai-worker", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    _common(sub.add_parser("run", help="assess the trees of a processed visit"))
    _common(sub.add_parser("resume", help="continue an interrupted run"))

    ev = sub.add_parser("eval", help="compare AI suggestions with expert decisions")
    target = ev.add_mutually_exclusive_group(required=True)
    target.add_argument("--session-id", action="append", help="visit(s) to evaluate")
    target.add_argument("--parcel-id", help="every visit of the parcel with expert decisions")
    ev.add_argument(
        "--from-state",
        action="store_true",
        help="also use answers kept in the job state (runs with --no-write)",
    )
    ev.add_argument("--state-dir", type=Path)
    ev.add_argument("--threshold", type=float, help="confidence threshold (default 0.70)")
    ev.add_argument("--json", action="store_true", help="print the result as JSON")
    return parser


def _config(args: argparse.Namespace) -> WorkerConfig:
    cfg = WorkerConfig.load(args.config, with_hard=args.with_opus)
    if args.threshold is not None:
        cfg = replace(cfg, confidence_threshold=args.threshold)
    return cfg


def _catalog():
    from .catalog import SupabaseCatalog
    from .supabase import Credentials, SupabaseClient

    return SupabaseCatalog(SupabaseClient.sign_in(Credentials.from_env()))


def _api(cfg: WorkerConfig, state_dir: Path, test_data_only: bool):
    p = cfg.provider
    if p.kind == "anthropic":
        from .api import AnthropicBatchApi

        return AnthropicBatchApi()
    if p.may_train_on_requests and not test_data_only:
        raise ValueError(
            f"{p.base_url} may use the requests to train its models: run it only on test "
            "data and confirm with --test-data-only (real orchard images stay with providers "
            "that do not train on them)"
        )
    from .openai_compat import OpenAICompatBatchApi

    return OpenAICompatBatchApi.from_env(
        p.base_url,
        p.api_key_env,
        state_dir / "openai-results",
        request_interval_s=p.request_interval_s,
    )


def format_report(r: RunReport) -> str:
    lines = [
        f"session {r.session_id}: {r.status}",
        f"  prompt {r.prompt_version}, models {r.config_key}",
        f"  trees: {r.trees_active} active, {r.sent} sent, {r.already_done} already assessed",
    ]
    if r.skipped:
        lines.append("  skipped: " + ", ".join(f"{k} {v}" for k, v in sorted(r.skipped.items())))
    if r.stage_counts:
        lines.append("  requests: " + ", ".join(f"{m} {n}" for m, n in r.stage_counts.items()))
    lines.append(f"  written: {r.written} AI assessments")
    if r.final_models:
        lines.append(
            "  final model: " + ", ".join(f"{m} {n}" for m, n in sorted(r.final_models.items()))
        )
    if r.no_answer:
        lines.append(f"  no usable answer (expert starts from scratch): {', '.join(r.no_answer)}")
    lines.append(f"  job folder: {r.job_dir}")
    return "\n".join(lines) + "\n" + format_cost_report(r.cost)


def main(argv: list[str] | None = None, *, catalog=None, api=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command in ("run", "resume"):
            options = RunOptions(
                write=not args.no_write,
                wait=not args.no_wait,
                limit=args.limit,
            )
            cfg = _config(args)
            state_dir = args.state_dir or default_state_dir()
            worker = Worker(
                catalog or _catalog(),
                api if api is not None else _api(cfg, state_dir, args.test_data_only),
                cfg,
                state_dir,
                options,
            )
            report = worker.run(args.session_id, resume_only=args.command == "resume")
            print(json.dumps(report.to_json(), indent=1) if args.json else format_report(report))
            return 0
        if args.command == "eval":
            from .evaluate import evaluate, format_eval

            result = evaluate(
                catalog or _catalog(),
                session_ids=args.session_id,
                parcel_id=args.parcel_id,
                state_dir=(args.state_dir or default_state_dir()) if args.from_state else None,
                threshold=args.threshold,
            )
            print(json.dumps(result, indent=1) if args.json else format_eval(result))
            return 0
    except (WorkerError, SupabaseError, LookupError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
