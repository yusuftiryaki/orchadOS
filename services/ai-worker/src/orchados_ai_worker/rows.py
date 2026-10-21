"""An AI answer as database rows: the arguments of save_ai_assessment.

Contract: docs/arayuzler.md, "AI ön değerlendirme satırları".
"""

from __future__ import annotations

from typing import Any

from .cost import USAGE_KEYS, cost_usd
from .schema import AiOutput, MetricDef

METHOD = "ai_preassessment"


def uncertainty(m: MetricDef, confidence: float) -> float | None:
    """Uncertainty of a suggested value, in scale steps.

    The schema requires one for scale values. The model gives a confidence, not
    an interval; this maps it onto the scale: half the scale range at confidence
    0, none at confidence 1. Category and yes/no values carry no uncertainty.
    """
    if m.value_type != "scale":
        return None
    assert m.scale_min is not None and m.scale_max is not None
    return round((1.0 - confidence) * (m.scale_max - m.scale_min) / 2.0, 3)


def measurements(out: AiOutput, metrics: list[MetricDef]) -> list[dict[str, Any]]:
    """One measurement per metric with a value; metrics left empty are not written."""
    rows: list[dict[str, Any]] = []
    for m in metrics:
        v = out.values[m.code]
        if v.value is None:
            continue
        if m.id is None:
            raise ValueError(f"metric {m.code} has no registry id")
        column = {"scale": "value_scale", "category": "value_category", "boolean": "value_boolean"}
        rows.append(
            {
                "metric_definition_id": m.id,
                column[m.value_type]: v.value,
                "confidence": round(v.confidence, 4),
                "uncertainty": uncertainty(m, v.confidence),
            }
        )
    return rows


def save_args(
    *,
    session_id: str,
    tree_id: str,
    methodology_version: str,
    prompt_version: str,
    config_key: str,
    params_hash: str,
    metrics: list[MetricDef],
    outcomes: list[dict[str, Any]],
    final: dict[str, Any],
    output: AiOutput,
    review_reasons: list[str],
    evidence_asset_ids: list[str],
) -> dict[str, Any]:
    """save_ai_assessment arguments for one tree.

    outcomes: every stage answer of this tree (stored form, with usage and
    batch id); final: the one whose output is the result.
    """
    usage = {k: sum(int((o.get("usage") or {}).get(k, 0)) for o in outcomes) for k in USAGE_KEYS}
    cost = sum(cost_usd(o["model"], o.get("usage") or {}) for o in outcomes)
    models = list(dict.fromkeys(o["model"] for o in sorted(outcomes, key=lambda o: o["stage"])))
    batch_ids = list(dict.fromkeys(o["batch_id"] for o in outcomes if o.get("batch_id")))
    return {
        "p_session_id": session_id,
        "p_tree_id": tree_id,
        "p_overall_class": output.overall_class,
        "p_confidence": round(output.class_confidence, 4) if output.overall_class else None,
        "p_model_name": final["model"],
        "p_model_version": final.get("served_model") or final["model"],
        "p_methodology_version": methodology_version,
        "p_notes": output.rationale or None,
        "p_measurements": measurements(output, metrics),
        "p_evidence_asset_ids": sorted(evidence_asset_ids),
        "p_detail": {
            "prompt_version": prompt_version,
            "config_key": config_key,
            "params_hash": params_hash,
            "final_stage": final["stage"],
            "models": models,
            "review_reasons": review_reasons,
            "tree_visible": output.tree_visible,
            "flags": output.flags,
            **usage,
            "cost_usd": round(cost, 6),
            "batch_ids": batch_ids,
        },
    }
