"""Evaluation: AI suggestions against expert decisions (docs/teknik-mimari.md, model choice).

For every tree of the chosen visits that has both an AI suggestion and an
expert decision:
- per scale: how often the AI value equals the expert's (and, for 0-3
  scales, is within one step), and how often the AI gave no value where the
  expert gave one;
- the class confusion matrix (AI class x expert class) and agreement;
- the share of trees that would go to mandatory review (docs/metodoloji.md,
  section 6): low confidence, problem/dead/absent, a flag (staff answer
  conflict among them), or a class change against the previous published
  visit. The staff "Sorun gördüm" mark is not in the database yet and is not
  counted.

AI suggestions come from the database (the newest AI assessment per tree and
visit) and, with --from-state, from answers kept in job folders by
`run --no-write`, e.g. for winter visits that were published before the AI ran.
Bulk-approved expert rows (auto_approved) are copies of the AI and are left
out; only decisions the expert made count.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, Protocol

from .catalog import SessionInfo
from .config import WorkerConfig
from .methodology import HEALTH_CLASSES
from .schema import MetricDef, validate
from .triage import ESCALATED_CLASSES, StageOutcome, final_outcome

NONE = "none"


class EvalSource(Protocol):
    def session(self, session_id: str) -> SessionInfo: ...

    def sessions_of_parcel(self, parcel_id: str) -> list[SessionInfo]: ...

    def previous_published_session(self, session: SessionInfo) -> SessionInfo | None: ...

    def metric_registry(self) -> list[dict[str, Any]]: ...

    def assessments(self, session_id: str) -> list[dict[str, Any]]:
        """Tree assessments with id, tree_id, source, overall_class, confidence, model_name,
        auto_approved, assessed_at, created_at, links (measurement ids)."""
        ...

    def measurements(self, session_id: str) -> dict[str, dict[str, Any]]:
        """Measurements of the session by id: metric_definition_id and the value columns."""
        ...

    def ai_details(self, session_id: str) -> dict[str, dict[str, Any]]:
        """ai_assessment_detail rows by assessment id."""
        ...


def _newest(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    return max(rows, key=lambda r: (r["assessed_at"], r["created_at"], r["id"]), default=None)


def _value(m: dict[str, Any]) -> Any:
    for col in ("value_scale", "value_category", "value_boolean", "value_numeric"):
        if m.get(col) is not None:
            return m[col]
    return None


def _decisions(
    src: EvalSource, session_id: str, codes: dict[str, str]
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """(expert decisions, AI suggestions from the database) by tree id."""
    rows = [r for r in src.assessments(session_id) if r.get("tree_id")]
    ms = src.measurements(session_id)
    details = src.ai_details(session_id)

    def values(row: dict[str, Any]) -> dict[str, Any]:
        out = {}
        for mid in row.get("links", []):
            m = ms.get(mid)
            if m and m["metric_definition_id"] in codes:
                out[codes[m["metric_definition_id"]]] = _value(m)
        return out

    by_tree: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_tree.setdefault(r["tree_id"], []).append(r)
    expert: dict[str, dict[str, Any]] = {}
    ai: dict[str, dict[str, Any]] = {}
    for tree_id, list_ in by_tree.items():
        e = _newest([r for r in list_ if r["source"] == "expert" and not r.get("auto_approved")])
        if e is not None:
            expert[tree_id] = {"class": e["overall_class"], "values": values(e)}
        a = _newest([r for r in list_ if r["source"] == "ai"])
        if a is not None:
            d = details.get(a["id"], {})
            ai[tree_id] = {
                "class": a["overall_class"],
                "confidence": a["confidence"],
                "values": values(a),
                "flags": list(d.get("flags") or []),
                "model": a.get("model_name"),
                "origin": "database",
            }
    return expert, ai


def _from_state(
    state_dir: Path, session_id: str, metrics_by_season: dict[str, list[MetricDef]]
) -> dict[str, dict[str, Any]]:
    """Final answers kept in this session's job folders (newest job wins per tree)."""
    out: dict[str, dict[str, Any]] = {}
    folders = sorted(
        (Path(state_dir) / session_id).glob("*/state.json"), key=lambda p: p.stat().st_mtime
    )
    for path in folders:
        data = json.loads(path.read_text(encoding="utf-8"))
        metrics = metrics_by_season[data["season"]]
        for tree_id, outcomes in data.get("outcomes", {}).items():
            final = final_outcome(
                [
                    StageOutcome(
                        o["stage"],
                        o["model"],
                        validate(o["output"], metrics) if o["output"] else None,
                    )
                    for o in outcomes
                ]
            )
            if final is None or final.output is None:
                continue
            o = final.output
            out[tree_id] = {
                "class": o.overall_class,
                "confidence": o.class_confidence if o.overall_class else None,
                "values": o.given(),
                "flags": list(o.flags),
                "model": final.model,
                "origin": "state",
            }
    return out


def mandatory_reasons(
    ai: dict[str, Any], previous_class: str | None, threshold: float
) -> list[str]:
    reasons = []
    if ai["class"] is None or (ai["confidence"] or 0.0) < threshold:
        reasons.append("low_confidence")
    if ai["class"] in ESCALATED_CLASSES:
        reasons.append("flagged_class")
    if "staff_answer_conflict" in ai["flags"]:
        reasons.append("staff_conflict")
    if set(ai["flags"]) - {"staff_answer_conflict"}:
        reasons.append("other_flag")
    if previous_class is not None and ai["class"] is not None and ai["class"] != previous_class:
        reasons.append("class_changed")
    return reasons


def evaluate(
    src: EvalSource,
    *,
    session_ids: list[str] | None = None,
    parcel_id: str | None = None,
    state_dir: Path | None = None,
    threshold: float | None = None,
) -> dict[str, Any]:
    threshold = WorkerConfig().confidence_threshold if threshold is None else threshold
    registry = src.metric_registry()
    codes = {r["id"]: r["code"] for r in registry}
    scale_codes = {r["code"] for r in registry if r["value_type"] == "scale"}
    if session_ids:
        sessions = [src.session(s) for s in session_ids]
    elif parcel_id:
        sessions = src.sessions_of_parcel(parcel_id)
    else:
        raise ValueError("give session ids or a parcel id")

    from .methodology import SEASONS
    from .schema import season_metrics

    metrics_by_season = {s: season_metrics(registry, s) for s in SEASONS}

    pairs: list[tuple[str, dict[str, Any], dict[str, Any], str | None]] = []
    per_session: list[dict[str, Any]] = []
    for s in sessions:
        expert, ai = _decisions(src, s.id, codes)
        if state_dir is not None:
            for tree_id, a in _from_state(state_dir, s.id, metrics_by_season).items():
                ai.setdefault(tree_id, a)
        prev = src.previous_published_session(s)
        prev_class: dict[str, str | None] = {}
        if prev is not None:
            prev_expert, _ = _decisions(src, prev.id, codes)
            prev_class = {t: d["class"] for t, d in prev_expert.items()}
        both = sorted(set(expert) & set(ai))
        per_session.append(
            {"session_id": s.id, "expert": len(expert), "ai": len(ai), "pairs": len(both)}
        )
        pairs += [(t, ai[t], expert[t], prev_class.get(t)) for t in both]

    metrics: dict[str, dict[str, Any]] = {}
    confusion: dict[str, Counter[str]] = {c: Counter() for c in (*HEALTH_CLASSES, NONE)}
    mandatory = Counter()
    mandatory_trees = 0
    by_model: dict[str, Counter[str]] = {}
    for _tree, a, e, prev in pairs:
        for code, ev in e["values"].items():
            if ev is None:
                continue
            m = metrics.setdefault(
                code, {"expert_values": 0, "ai_values": 0, "exact": 0, "within_one": 0}
            )
            m["expert_values"] += 1
            av = a["values"].get(code)
            if av is None:
                continue
            m["ai_values"] += 1
            m["exact"] += int(av == ev)
            if code in scale_codes:
                m["within_one"] += int(abs(int(av) - int(ev)) <= 1)
        confusion[a["class"] or NONE][e["class"] or NONE] += 1
        mc = by_model.setdefault(a["model"] or "unknown", Counter())
        mc["trees"] += 1
        mc["class_agree"] += int(a["class"] == e["class"])
        reasons = mandatory_reasons(a, prev, threshold)
        mandatory.update(reasons)
        mandatory_trees += int(bool(reasons))

    for code, m in metrics.items():
        m["coverage"] = round(m["ai_values"] / m["expert_values"], 3) if m["expert_values"] else 0
        m["agreement"] = round(m["exact"] / m["ai_values"], 3) if m["ai_values"] else None
        if code in scale_codes:
            m["within_one_rate"] = (
                round(m["within_one"] / m["ai_values"], 3) if m["ai_values"] else None
            )
        else:
            m.pop("within_one")
    n = len(pairs)
    agree = sum(confusion[c][c] for c in HEALTH_CLASSES)
    return {
        "trees": n,
        "threshold": threshold,
        "sessions": per_session,
        "metrics": dict(sorted(metrics.items())),
        "class_agreement": round(agree / n, 3) if n else None,
        "confusion": {
            ai_c: {ex_c: confusion[ai_c][ex_c] for ex_c in (*HEALTH_CLASSES, NONE)}
            for ai_c in (*HEALTH_CLASSES, NONE)
        },
        "mandatory_review_share": round(mandatory_trees / n, 3) if n else None,
        "mandatory_reasons": dict(sorted(mandatory.items())),
        "by_model": {
            m: {
                "trees": c["trees"],
                "class_agreement": round(c["class_agree"] / c["trees"], 3),
            }
            for m, c in sorted(by_model.items())
        },
    }


def format_eval(r: dict[str, Any]) -> str:
    lines = [f"evaluation: {r['trees']} trees with both an AI suggestion and an expert decision"]
    for s in r["sessions"]:
        lines.append(
            f"  session {s['session_id']}: expert {s['expert']}, AI {s['ai']}, pairs {s['pairs']}"
        )
    if not r["trees"]:
        return "\n".join(lines)
    lines.append("scales (agreement = AI value equals the expert's, where the AI gave one):")
    for code, m in r["metrics"].items():
        extra = (
            f", within one step {m['within_one_rate']:.0%}"
            if m.get("within_one_rate") is not None
            else ""
        )
        agreement = f"{m['agreement']:.0%}" if m["agreement"] is not None else "-"
        lines.append(
            f"  {code}: agreement {agreement}{extra}; AI gave a value for "
            f"{m['ai_values']}/{m['expert_values']} ({m['coverage']:.0%})"
        )
    lines.append(f"class agreement: {r['class_agreement']:.0%}")
    cols = (*HEALTH_CLASSES, NONE)
    lines.append("confusion (rows AI, columns expert):")
    lines.append("  " + " " * 10 + "".join(f"{c:>10}" for c in cols))
    for a in cols:
        row = r["confusion"][a]
        if sum(row.values()):
            lines.append("  " + f"{a:<10}" + "".join(f"{row[c]:>10}" for c in cols))
    lines.append(
        f"mandatory review: {r['mandatory_review_share']:.0%} of trees "
        f"(threshold {r['threshold']:.2f}; "
        + ", ".join(f"{k} {v}" for k, v in r["mandatory_reasons"].items())
        + ")"
    )
    for m, c in r["by_model"].items():
        lines.append(
            f"  final model {m}: {c['trees']} trees, class agreement {c['class_agreement']:.0%}"
        )
    return "\n".join(lines)
