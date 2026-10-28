"""The run: crops -> mosaics -> batches (triage, then review) -> rows.

    prepare   read the session, its active trees and crops; build one mosaic per
              tree (and per tree of the previous published visit); save them in
              the job folder
    stage k   submit one batch (or several, by size) with the trees of stage k;
              wait for it; store every answer
    write     per tree, save the last usable answer with save_ai_assessment

Every step is saved to the job state before the next one starts, so a run
that stops continues with `ai-worker resume`. A tree that already has a
result with the same prompt version and model cascade is not sent again; the
database function also refuses to write it twice.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .api import BatchApi
from .catalog import Catalog, Crop, CropIntegrityError, SessionInfo
from .config import WorkerConfig
from .cost import cost_report, usage_of
from .methodology import DEFAULT_METHODOLOGY_VERSION, season_of
from .mosaic import DIRECTIONS, build_mosaic
from .prompt import TreeInput, prompt_version, request_params
from .rows import save_args
from .schema import (
    MetricDef,
    OutputError,
    apply_worker_rules,
    parse_message,
    season_metrics,
    validate,
)
from .state import JobState, job_dir
from .triage import StageOutcome, final_outcome, hard_reasons, review_reasons

WRITABLE = ("processed", "in_review")
# Batches API limit is 256 MB per batch; stay well below it.
MAX_BATCH_BYTES = 200_000_000


class WorkerError(RuntimeError):
    pass


@dataclass
class RunOptions:
    write: bool = True
    wait: bool = True
    # Only these trees (ids), e.g. for a trial run; None = all.
    tree_ids: frozenset[str] | None = None
    # At most this many new trees per run; None = all.
    limit: int | None = None
    max_batch_bytes: int = MAX_BATCH_BYTES


@dataclass
class RunReport:
    session_id: str
    prompt_version: str
    config_key: str
    status: str = "done"  # done | pending | nothing_to_do
    trees_active: int = 0
    sent: int = 0
    already_done: int = 0
    skipped: dict[str, int] = field(default_factory=dict)
    stage_counts: dict[str, int] = field(default_factory=dict)
    written: int = 0
    no_answer: list[str] = field(default_factory=list)
    final_models: dict[str, int] = field(default_factory=dict)
    cost: dict[str, Any] = field(default_factory=dict)
    job_dir: str = ""

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def pick_crops(crops: list[Crop]) -> dict[str, dict[str, Crop]]:
    """tree id -> direction -> crop to use.

    Per direction the newest crop wins (a later pipeline version), then the higher
    quality score, then the asset id.
    """
    out: dict[str, dict[str, Crop]] = {}
    ordered = sorted(
        crops, key=lambda c: (c.produced_at, c.quality_score or 0.0, c.asset_id), reverse=True
    )
    for c in ordered:
        if c.direction not in DIRECTIONS:
            continue
        out.setdefault(c.tree_id, {}).setdefault(c.direction, c)
    return out


def custom_id(stage: int, tree_id: str) -> str:
    return f"s{stage}-{tree_id.replace('-', '')}"


class Worker:
    def __init__(
        self,
        catalog: Catalog,
        api: BatchApi | None,
        config: WorkerConfig,
        state_dir: Path,
        options: RunOptions | None = None,
        log: Callable[[str], None] = print,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.catalog = catalog
        self.api = api
        self.cfg = config
        self.state_dir = Path(state_dir)
        self.opts = options or RunOptions()
        self.log = log
        self.sleep = sleep

    # --- entry points ------------------------------------------------------------

    def run(self, session_id: str, *, resume_only: bool = False) -> RunReport:
        session = self.catalog.session(session_id)
        if self.opts.write and session.status not in WRITABLE:
            hint = " (use --no-write to assess it for evaluation only)" * (
                session.status == "published"
            )
            raise WorkerError(
                f"session {session.id} is {session.status}; AI results are written to "
                f"{' or '.join(WRITABLE)} sessions only{hint}"
            )
        methodology = session.methodology_version or DEFAULT_METHODOLOGY_VERSION
        pv = prompt_version(methodology)
        season = season_of(session.time, session.methodology_version)
        metrics = season_metrics(
            self.catalog.metric_registry(), season, session.methodology_version
        )
        if not metrics:
            raise WorkerError(f"no metrics for the {season} season in the registry")

        folder = job_dir(self.state_dir, session.id, pv, self.cfg.config_key)
        state = JobState.load(folder)
        if state is None:
            if resume_only:
                raise WorkerError(f"nothing to resume for session {session.id} (no {folder})")
            state = JobState.new(
                folder,
                session_id=session.id,
                prompt_version=pv,
                config_key=self.cfg.config_key,
                params_hash=self.cfg.params_hash(),
                methodology_version=methodology,
                season=season,
            )
        elif state.data.get("params_hash") != self.cfg.params_hash():
            self.log(
                "note: configuration changed since this job started; continuing with the new one"
            )
        report = RunReport(session.id, pv, self.cfg.config_key, job_dir=str(folder))

        rnd = next((r for r in state.rounds if not r["done"]), None)
        if rnd is None and not resume_only:
            rnd = self._prepare(session, state, report)
        elif rnd is not None:
            self.log(f"resuming round {len(state.rounds)} ({len(rnd['trees'])} trees)")
        if rnd is not None:
            if self.api is None:
                raise WorkerError("no API client (ANTHROPIC_API_KEY) for a run that sends requests")
            if not self._stages(state, rnd, metrics, report):
                report.status = "pending"
                return self._finish(state, report)
            rnd["done"] = True
            state.save()

        if self.opts.write:
            self._write(state, metrics, report)
        if rnd is None and report.written == 0:
            report.status = "nothing_to_do"
        return self._finish(state, report)

    # --- prepare -----------------------------------------------------------------

    def _usable(self, state: JobState, tree_id: str) -> bool:
        return any(o.get("output") is not None for o in state.outcomes.get(tree_id, []))

    def _prepare(
        self, session: SessionInfo, state: JobState, report: RunReport
    ) -> dict[str, Any] | None:
        trees = self.catalog.active_trees(session.parcel_id)
        report.trees_active = len(trees)
        done = (
            self.catalog.existing_results(
                session.id, state.data["prompt_version"], self.cfg.config_key
            )
            if self.opts.write
            else set()
        )
        crops = pick_crops(self.catalog.crops(session.id))
        previous = self.catalog.previous_published_session(session)
        prev_crops: dict[str, dict[str, Crop]] = {}
        if previous is not None:
            prev_crops = pick_crops(self.catalog.crops(previous.id))
        staff = self.catalog.staff_answers(session.id)

        def skip(reason: str) -> None:
            report.skipped[reason] = report.skipped.get(reason, 0) + 1

        chosen: list[str] = []
        for t in sorted(trees, key=lambda t: (t.code, t.id)):
            if self.opts.tree_ids is not None and t.id not in self.opts.tree_ids:
                continue
            if t.id in done:
                report.already_done += 1
                continue
            if self._usable(state, t.id):
                continue  # answered before; only the write is left
            if t.id not in crops:
                skip("no_crops")
                continue
            if self.opts.limit is not None and len(chosen) >= self.opts.limit:
                skip("over_limit")
                continue
            try:
                entry = self._tree_inputs(state, t.id, t.code, crops[t.id], prev_crops.get(t.id))
            except CropIntegrityError as exc:
                self.log(f"warning: {t.code}: {exc}")
                skip("crop_download_failed")
                continue
            entry["staff_answers"] = staff.get(t.id, {})
            state.trees[t.id] = entry
            chosen.append(t.id)
        if not chosen:
            state.save()
            return None
        rnd = {"trees": chosen, "stages": [], "done": False}
        state.rounds.append(rnd)
        state.save()
        self.log(f"prepared {len(chosen)} trees (season {state.data['season']})")
        return rnd

    def _tree_inputs(
        self,
        state: JobState,
        tree_id: str,
        code: str,
        current: dict[str, Crop],
        previous: dict[str, Crop] | None,
    ) -> dict[str, Any]:
        size = self.cfg.mosaic_size
        path = state.mosaic_path(tree_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(
            build_mosaic({d: self.catalog.download(c) for d, c in current.items()}, size)
        )
        entry: dict[str, Any] = {
            "code": code,
            "directions": sorted(current, key=DIRECTIONS.index),
            "evidence": sorted(c.asset_id for c in current.values()),
            "previous_directions": [],
        }
        if previous:
            state.mosaic_path(tree_id, previous=True).write_bytes(
                build_mosaic({d: self.catalog.download(c) for d, c in previous.items()}, size)
            )
            entry["previous_directions"] = sorted(previous, key=DIRECTIONS.index)
        return entry

    def tree_input(self, state: JobState, tree_id: str) -> TreeInput:
        e = state.trees[tree_id]
        prev = state.mosaic_path(tree_id, previous=True)
        return TreeInput(
            tree_code=e["code"],
            season=state.data["season"],
            mosaic=state.mosaic_path(tree_id).read_bytes(),
            directions=tuple(e["directions"]),
            previous_mosaic=prev.read_bytes() if e["previous_directions"] else None,
            previous_directions=tuple(e["previous_directions"]),
            staff_answers=dict(e.get("staff_answers") or {}),
        )

    # --- stages ------------------------------------------------------------------

    def _output(self, raw: dict[str, Any] | None, metrics: list[MetricDef]):
        return None if raw is None else validate(raw, metrics)

    def _stage_trees(
        self, state: JobState, rnd: dict[str, Any], k: int, metrics: list[MetricDef]
    ) -> list[str]:
        if k == 1:
            return list(rnd["trees"])
        before = rnd["stages"][k - 2]
        out: list[str] = []
        for tid in before["tree_ids"]:
            answer = next(
                (
                    o
                    for o in state.outcomes.get(tid, [])
                    if o["stage"] == k - 1 and o["round"] == len(state.rounds)
                ),
                None,
            )
            parsed = self._output(answer.get("output") if answer else None, metrics)
            if k == 2:
                reasons = review_reasons(
                    parsed, self.cfg.confidence_threshold, state.data["methodology_version"]
                )
                state.trees[tid]["review_reasons"] = reasons
            else:
                reasons = hard_reasons(parsed, self.cfg.hard_threshold)
                if reasons:
                    state.trees[tid]["review_reasons"] = state.trees[tid].get(
                        "review_reasons", []
                    ) + [f"hard_{r}" for r in reasons]
            if reasons:
                out.append(tid)
        return out

    def _stages(
        self, state: JobState, rnd: dict[str, Any], metrics: list[MetricDef], report: RunReport
    ) -> bool:
        """Run the round's stages; False if a batch is still running and we do not wait."""
        assert self.api is not None
        methodology = state.data["methodology_version"]
        report.sent = len(rnd["trees"])
        for k, stage_cfg in enumerate(self.cfg.stages, start=1):
            if len(rnd["stages"]) < k:
                tree_ids = self._stage_trees(state, rnd, k, metrics)
                if not tree_ids:
                    break
                requests = [
                    {
                        "custom_id": custom_id(k, tid),
                        "params": request_params(
                            self.tree_input(state, tid), metrics, methodology, stage_cfg
                        ),
                    }
                    for tid in tree_ids
                ]
                batch_ids: list[str] = []
                batch_of: dict[str, str] = {}
                for chunk in self._chunks(requests):
                    batch_ids.append(self.api.create(chunk))
                    batch_of.update(
                        {
                            tid: batch_ids[-1]
                            for tid in tree_ids
                            if custom_id(k, tid) in {r["custom_id"] for r in chunk}
                        }
                    )
                rnd["stages"].append(
                    {
                        "stage": k,
                        "model": stage_cfg.model,
                        "tree_ids": tree_ids,
                        "batch_ids": batch_ids,
                        "batch_of": batch_of,
                        "collected": [],
                    }
                )
                state.save()
                self.log(
                    f"stage {k}: {len(tree_ids)} trees to {stage_cfg.model} "
                    f"(batch {', '.join(batch_ids)})"
                )
            st = rnd["stages"][k - 1]
            report.stage_counts[st["model"]] = len(st["tree_ids"])
            for batch_id in st["batch_ids"]:
                if batch_id in st["collected"]:
                    continue
                if not self._wait(batch_id):
                    return False
                self._collect(state, st, batch_id, metrics)
        return True

    def _chunks(self, requests: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        chunks: list[list[dict[str, Any]]] = [[]]
        size = 0
        for r in requests:
            n = len(json.dumps(r))
            if chunks[-1] and size + n > self.opts.max_batch_bytes:
                chunks.append([])
                size = 0
            chunks[-1].append(r)
            size += n
        return chunks

    def _wait(self, batch_id: str) -> bool:
        assert self.api is not None
        while True:
            status = self.api.status(batch_id)
            if status == "ended":
                return True
            if not self.opts.wait:
                self.log(f"batch {batch_id} is {status}; continue later with `ai-worker resume`")
                return False
            self.log(
                f"batch {batch_id} is {status}; checking again in {self.cfg.poll_interval_s:.0f} s"
            )
            self.sleep(self.cfg.poll_interval_s)

    def _collect(
        self, state: JobState, st: dict[str, Any], batch_id: str, metrics: list[MetricDef]
    ) -> None:
        assert self.api is not None
        by_custom = {custom_id(st["stage"], tid): tid for tid in st["tree_ids"]}
        seen: set[str] = set()
        for item in self.api.results(batch_id):
            tid = by_custom.get(item.get("custom_id", ""))
            if tid is None:
                continue
            seen.add(tid)
            result = item.get("result") or {}
            message = result.get("message") if result.get("type") == "succeeded" else None
            output, error = None, None
            if message is None:
                err = (result.get("error") or {}).get("error") or result.get("error") or {}
                error = f"{result.get('type', 'unknown')}: {err.get('type', '') or err}"
            else:
                try:
                    output = apply_worker_rules(
                        parse_message(message, metrics),
                        state.data["season"],
                        state.data["methodology_version"],
                    ).to_json()
                except OutputError as exc:
                    error = f"invalid answer: {exc}"
            self._record(state, tid, st, batch_id, output, error, message)
        for tid in by_custom.values():
            if tid not in seen and st["batch_of"].get(tid) == batch_id:
                self._record(state, tid, st, batch_id, None, "missing from batch results", None)
        st["collected"].append(batch_id)
        state.save()
        failed = sum(
            1
            for tid in by_custom.values()
            for o in state.outcomes.get(tid, [])
            if o["batch_id"] == batch_id and o["output"] is None
        )
        self.log(f"batch {batch_id}: results collected ({failed} without a usable answer)")

    def _record(self, state, tid, st, batch_id, output, error, message) -> None:
        outcomes = state.outcomes.setdefault(tid, [])
        rnd_no = len(state.rounds)
        if any(o["stage"] == st["stage"] and o["round"] == rnd_no for o in outcomes):
            return
        outcomes.append(
            {
                "round": rnd_no,
                "stage": st["stage"],
                "model": st["model"],
                "served_model": (message or {}).get("model"),
                "batch_id": batch_id,
                "output": output,
                "error": error,
                "usage": usage_of(message),
            }
        )

    # --- write -------------------------------------------------------------------

    def _write(self, state: JobState, metrics: list[MetricDef], report: RunReport) -> None:
        for tid, entry in state.trees.items():
            if tid in state.written:
                continue
            stored = state.outcomes.get(tid, [])
            final = final_outcome(
                [
                    StageOutcome(o["stage"], o["model"], self._output(o["output"], metrics))
                    for o in stored
                ]
            )
            if final is None:
                report.no_answer.append(entry["code"])
                continue
            final_raw = max(
                (o for o in stored if o["output"] is not None and o["stage"] == final.stage),
                key=lambda o: o["round"],
            )
            assert final.output is not None
            args = save_args(
                session_id=state.data["session_id"],
                tree_id=tid,
                methodology_version=state.data["methodology_version"],
                prompt_version=state.data["prompt_version"],
                config_key=state.data["config_key"],
                params_hash=state.data["params_hash"],
                metrics=metrics,
                outcomes=stored,
                final=final_raw,
                output=final.output,
                review_reasons=entry.get("review_reasons", []),
                evidence_asset_ids=entry["evidence"],
            )
            state.written[tid] = self.catalog.save(args)
            state.save()
            report.written += 1
            report.final_models[final.model] = report.final_models.get(final.model, 0) + 1
        if report.written:
            self.log(f"wrote {report.written} AI assessments")

    def _finish(self, state: JobState, report: RunReport) -> RunReport:
        report.cost = cost_report(state.outcomes)
        state.save()
        state.write_report(report.to_json())
        return report
