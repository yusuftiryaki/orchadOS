"""Structured output of one AI pre-assessment: JSON schema for the API and local validation.

The API enforces the schema's shape (output_config.format); numeric ranges are
not expressible there, so validate() checks them again, together with the
metric registry's value ranges and categories.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

from .methodology import (
    AI_SKIP_IN_SEASON,
    DEFAULT_METHODOLOGY_VERSION,
    HEALTH_CLASSES,
    NO_AI_DEAD_IN_SEASON,
    SCALE_TEXTS,
    HealthClass,
    Season,
)

TreeVisible = Literal["yes", "no", "unsure"]
TREE_VISIBLE: tuple[TreeVisible, ...] = ("yes", "no", "unsure")

# Inconsistency flags (docs/MVP.md, Modül 4) the model may set; the output schema
# offers only these.
FLAGS = ("staff_answer_conflict", "large_change_from_previous", "poor_image")
# Flags only the worker sets (apply_worker_rules), never the model:
# - winter_dead_downgraded: the answer said dead in a season where only the expert
#   may (methodology.NO_AI_DEAD_IN_SEASON); the worker made it problem.
WORKER_FLAGS = ("winter_dead_downgraded",)
WINTER_DEAD_NOTE = (
    "Not: AI kışın 'kuru' önerdi; kışın kuru kararını yalnız uzman verir. "
    "Sınıf 'sorunlu', kuru dal 3 yapıldı."
)


@dataclass(frozen=True)
class MetricDef:
    """A registry row (public.metric_definition) the AI is asked about."""

    code: str
    value_type: Literal["scale", "category", "boolean"]
    id: str | None = None
    scale_min: int | None = None
    scale_max: int | None = None
    categories: tuple[str, ...] = ()

    @property
    def allowed(self) -> tuple[Any, ...]:
        if self.value_type == "scale":
            assert self.scale_min is not None and self.scale_max is not None
            return tuple(range(self.scale_min, self.scale_max + 1))
        if self.value_type == "category":
            return self.categories
        return (True, False)


def season_metrics(registry: list[dict[str, Any]], season: Season) -> list[MetricDef]:
    """Metrics of the season the AI is asked about, in prompt order.

    registry: metric_definition rows (code, value_type, scale_min, scale_max,
    categories, valid_seasons, subject_kinds, id). A code needs both a registry
    row and a prompt text (methodology.SCALE_TEXTS).
    """
    by_code = {r["code"]: r for r in registry}
    out: list[MetricDef] = []
    for code in SCALE_TEXTS:
        r = by_code.get(code)
        if r is None or season not in r["valid_seasons"] or "tree" not in r["subject_kinds"]:
            continue
        if season in AI_SKIP_IN_SEASON.get(code, ()):
            continue
        if r["value_type"] not in ("scale", "category", "boolean"):
            continue
        out.append(
            MetricDef(
                code=code,
                value_type=r["value_type"],
                id=r.get("id"),
                scale_min=r.get("scale_min"),
                scale_max=r.get("scale_max"),
                categories=tuple(r.get("categories") or ()),
            )
        )
    return out


def _value_schema(m: MetricDef) -> dict[str, Any]:
    if m.value_type == "scale":
        value: dict[str, Any] = {"type": "integer", "enum": list(m.allowed)}
    elif m.value_type == "category":
        value = {"type": "string", "enum": list(m.categories)}
    else:
        value = {"type": "boolean"}
    return {
        "type": "object",
        "properties": {
            "value": {"anyOf": [value, {"type": "null"}]},
            "confidence": {"type": "number", "description": "0 to 1"},
        },
        "required": ["value", "confidence"],
        "additionalProperties": False,
    }


def output_schema(metrics: list[MetricDef]) -> dict[str, Any]:
    """JSON schema for output_config.format. Deterministic for a given metric list."""
    return {
        "type": "object",
        "properties": {
            "rationale": {"type": "string"},
            "tree_visible": {"type": "string", "enum": list(TREE_VISIBLE)},
            "values": {
                "type": "object",
                "properties": {m.code: _value_schema(m) for m in metrics},
                "required": [m.code for m in metrics],
                "additionalProperties": False,
            },
            "overall_class": {
                "anyOf": [{"type": "string", "enum": list(HEALTH_CLASSES)}, {"type": "null"}]
            },
            "class_confidence": {"type": "number", "description": "0 to 1"},
            "flags": {"type": "array", "items": {"type": "string", "enum": list(FLAGS)}},
        },
        "required": [
            "rationale",
            "tree_visible",
            "values",
            "overall_class",
            "class_confidence",
            "flags",
        ],
        "additionalProperties": False,
    }


class OutputError(ValueError):
    """The model's answer does not match the schema or the registry."""


@dataclass
class MetricValue:
    code: str
    value: int | str | bool | None
    confidence: float


@dataclass
class AiOutput:
    rationale: str
    tree_visible: TreeVisible
    values: dict[str, MetricValue]
    overall_class: HealthClass | None
    class_confidence: float
    flags: list[str] = field(default_factory=list)

    def given(self) -> dict[str, int | str | bool]:
        """Metrics with a value (no value = the model was not sure)."""
        return {c: v.value for c, v in self.values.items() if v.value is not None}

    def to_json(self) -> dict[str, Any]:
        return {
            "rationale": self.rationale,
            "tree_visible": self.tree_visible,
            "values": {
                c: {"value": v.value, "confidence": v.confidence} for c, v in self.values.items()
            },
            "overall_class": self.overall_class,
            "class_confidence": self.class_confidence,
            "flags": list(self.flags),
        }


def parse_message(message: dict[str, Any], metrics: list[MetricDef]) -> AiOutput:
    """Validate a Messages API response (as a dict) and return its answer.

    Raises OutputError for a refusal, a truncated answer or an answer that does
    not match the schema; the triage treats all of them as "no usable answer".
    """
    stop = message.get("stop_reason")
    if stop == "refusal":
        details = message.get("stop_details") or {}
        raise OutputError(f"refused ({details.get('category') or 'no category'})")
    if stop == "max_tokens":
        raise OutputError("answer truncated at max_tokens")
    texts = [b.get("text", "") for b in message.get("content", []) if b.get("type") == "text"]
    if not texts:
        raise OutputError(f"no text block in the answer (stop_reason {stop})")
    return validate(texts[0], metrics, model_answer=True)


def _confidence(x: Any, where: str) -> float:
    if isinstance(x, bool) or not isinstance(x, int | float):
        raise OutputError(f"{where}: confidence must be a number")
    if not 0.0 <= float(x) <= 1.0:
        raise OutputError(f"{where}: confidence {x} is outside 0..1")
    return float(x)


def validate(data: Any, metrics: list[MetricDef], *, model_answer: bool = False) -> AiOutput:
    """Check a decoded answer against the season's metrics; raise OutputError if invalid.

    A stored answer may carry the worker's own flags (WORKER_FLAGS); a model answer
    (model_answer=True) may not, and any such flag in it is dropped.
    """
    if isinstance(data, str | bytes):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as exc:
            raise OutputError(f"not JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise OutputError("answer is not a JSON object")
    expected = {
        "rationale",
        "tree_visible",
        "values",
        "overall_class",
        "class_confidence",
        "flags",
    }
    if set(data) != expected:
        raise OutputError(f"unexpected keys: {sorted(set(data) ^ expected)}")
    if not isinstance(data["rationale"], str):
        raise OutputError("rationale must be a string")
    if data["tree_visible"] not in TREE_VISIBLE:
        raise OutputError(f"tree_visible must be one of {TREE_VISIBLE}")
    oc = data["overall_class"]
    if oc is not None and oc not in HEALTH_CLASSES:
        raise OutputError(f"unknown overall_class {oc!r}")
    flags = data["flags"]
    if not isinstance(flags, list) or any(f not in FLAGS + WORKER_FLAGS for f in flags):
        raise OutputError(f"flags must be a list of {FLAGS}")
    if model_answer:
        flags = [f for f in flags if f in FLAGS]

    raw = data["values"]
    if not isinstance(raw, dict) or set(raw) != {m.code for m in metrics}:
        raise OutputError("values must hold exactly the season's metrics")
    values: dict[str, MetricValue] = {}
    for m in metrics:
        item = raw[m.code]
        if not isinstance(item, dict) or set(item) != {"value", "confidence"}:
            raise OutputError(f"{m.code}: expected value and confidence")
        v = item["value"]
        if v is not None:
            ok = (
                (m.value_type == "boolean" and isinstance(v, bool))
                or (m.value_type == "scale" and isinstance(v, int) and not isinstance(v, bool))
                or (m.value_type == "category" and isinstance(v, str))
            )
            if not ok or v not in m.allowed:
                raise OutputError(f"{m.code}: {v!r} is not one of {m.allowed}")
        values[m.code] = MetricValue(m.code, v, _confidence(item["confidence"], m.code))

    # A pest type only makes sense with signs; drop it rather than reject the answer.
    sev = values.get("pest_sign_severity")
    typ = values.get("pest_sign_type")
    if typ is not None and typ.value is not None and (sev is None or sev.value in (None, "none")):
        typ.value = None

    return AiOutput(
        rationale=data["rationale"].strip(),
        tree_visible=data["tree_visible"],
        values=values,
        overall_class=oc,
        class_confidence=_confidence(data["class_confidence"], "class"),
        flags=list(dict.fromkeys(flags)),
    )


def apply_worker_rules(
    out: AiOutput,
    season: Season,
    methodology_version: str = DEFAULT_METHODOLOGY_VERSION,
) -> AiOutput:
    """Methodology rules the worker enforces on a model answer, whatever the model said.

    Winter dead (methodology-v0.1, docs/uzman-ajan-onerileri.md section 1.4): in a
    season of NO_AI_DEAD_IN_SEASON the class dead becomes problem with
    dead_branch_scale 3, as the expert would enter it without close-up evidence, and
    the answer gets the flag winter_dead_downgraded and a note in the rationale so
    the expert sees what the model suggested. Idempotent.
    """
    if out.overall_class != "dead" or season not in NO_AI_DEAD_IN_SEASON.get(
        methodology_version, ()
    ):
        return out
    out.overall_class = "problem"
    dead = out.values.get("dead_branch_scale")
    if dead is not None and dead.value != 3:
        dead.value = 3
        dead.confidence = out.class_confidence
    if "winter_dead_downgraded" not in out.flags:
        out.flags.append("winter_dead_downgraded")
    out.rationale = f"{out.rationale} {WINTER_DEAD_NOTE}".strip()
    return out
