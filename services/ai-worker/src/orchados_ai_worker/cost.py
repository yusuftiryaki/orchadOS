"""Token use and estimated cost of a run (batch prices, docs/teknik-mimari.md)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .config import BATCH_DISCOUNT, PRICES

USAGE_KEYS = (
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
)


def usage_of(message: dict[str, Any] | None) -> dict[str, int]:
    usage = (message or {}).get("usage") or {}
    return {k: int(usage.get(k) or 0) for k in USAGE_KEYS}


def cost_usd(model: str, usage: dict[str, int]) -> float:
    """Estimated cost of one batch request in US dollars."""
    p = PRICES[model]
    total = (
        usage.get("input_tokens", 0) * p.input
        + usage.get("output_tokens", 0) * p.output
        + usage.get("cache_read_input_tokens", 0) * p.input * p.cache_read_share
        + usage.get("cache_creation_input_tokens", 0) * p.input * p.cache_write_share
    )
    return total / 1_000_000 * BATCH_DISCOUNT


@dataclass
class ModelTotals:
    requests: int = 0
    succeeded: int = 0
    usage: dict[str, int] = field(default_factory=lambda: dict.fromkeys(USAGE_KEYS, 0))
    cost_usd: float = 0.0

    def add(self, model: str, usage: dict[str, int], ok: bool) -> None:
        self.requests += 1
        self.succeeded += int(ok)
        for k in USAGE_KEYS:
            self.usage[k] += usage.get(k, 0)
        self.cost_usd += cost_usd(model, usage)


def cost_report(outcomes: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Per-model and total requests, tokens, cache use and cost from the stored outcomes."""
    by_model: dict[str, ModelTotals] = {}
    for tree_outcomes in outcomes.values():
        for o in tree_outcomes:
            by_model.setdefault(o["model"], ModelTotals()).add(
                o["model"], o.get("usage") or {}, o.get("output") is not None
            )
    total = ModelTotals()
    for t in by_model.values():
        total.requests += t.requests
        total.succeeded += t.succeeded
        for k in USAGE_KEYS:
            total.usage[k] += t.usage[k]
        total.cost_usd += t.cost_usd
    cached = total.usage["cache_read_input_tokens"]
    prompt = cached + total.usage["input_tokens"] + total.usage["cache_creation_input_tokens"]

    def as_dict(t: ModelTotals) -> dict[str, Any]:
        return {
            "requests": t.requests,
            "succeeded": t.succeeded,
            **t.usage,
            "cost_usd": round(t.cost_usd, 6),
        }

    return {
        "models": {m: as_dict(t) for m, t in sorted(by_model.items())},
        "total": as_dict(total),
        "cache_hit_share": round(cached / prompt, 3) if prompt else 0.0,
    }


def format_cost_report(report: dict[str, Any]) -> str:
    lines = ["cost (batch prices, estimate):"]
    for model, t in report["models"].items():
        lines.append(
            f"  {model}: {t['requests']} requests ({t['succeeded']} ok), "
            f"input {t['input_tokens']}, output {t['output_tokens']}, "
            f"cache read {t['cache_read_input_tokens']}, "
            f"cache write {t['cache_creation_input_tokens']}, ${t['cost_usd']:.4f}"
        )
    t = report["total"]
    lines.append(
        f"  total: {t['requests']} requests, ${t['cost_usd']:.4f}, "
        f"cache hits {report['cache_hit_share']:.0%} of prompt tokens"
    )
    return "\n".join(lines)
