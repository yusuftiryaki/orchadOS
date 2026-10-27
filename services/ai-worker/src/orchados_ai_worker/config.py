"""Worker configuration: models, triage thresholds and list prices.

Defaults follow docs/teknik-mimari.md ("AI ve LLM maliyeti", strategy C):
Claude Haiku 5.5 triages every tree, uncertain cases go to Claude Sonnet 5.5.
Claude Opus 5.5 is available as a third stage for the hardest cases but off by
default. A JSON file (--config) can override any field; `provider` switches to
an OpenAI-compatible endpoint (openai_compat.py, e.g. local Ollama or a free
hosted tier), see configs/.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path
from typing import Any

TRIAGE_MODEL = "claude-haiku-5-5"
REVIEW_MODEL = "claude-sonnet-5-5"
HARD_MODEL = "claude-opus-5-5"


@dataclass(frozen=True)
class StageConfig:
    model: str
    # output_config.effort. Thinking is adaptive (always on for these models) and
    # counts toward max_tokens.
    effort: str = "low"
    max_tokens: int = 8000


@dataclass(frozen=True)
class ProviderConfig:
    """Where the requests go. `anthropic`: Message Batches API (ANTHROPIC_API_KEY).

    `openai`: an OpenAI-compatible chat completions endpoint at base_url, one
    request at a time. Its models need no entry in PRICES (cost reported as 0).
    """

    kind: str = "anthropic"
    base_url: str | None = None
    # Environment variable holding the key; None for a keyless local server.
    api_key_env: str | None = None
    # Seconds between requests (free tiers limit requests per minute).
    request_interval_s: float = 0.0
    # True for free tiers whose terms let them use the requests: test data only.
    may_train_on_requests: bool = False

    def __post_init__(self) -> None:
        if self.kind not in ("anthropic", "openai"):
            raise ValueError(f"unknown provider kind {self.kind!r}")
        if self.kind == "openai" and not self.base_url:
            raise ValueError("provider kind 'openai' needs base_url")


@dataclass(frozen=True)
class Price:
    """US dollars per million tokens, standard (non-batch) list price."""

    input: float
    output: float
    # Cache reads as a share of the input price (Opus 5.5: 5%, others 10%).
    cache_read_share: float = 0.10
    # 5-minute cache writes cost 1.25x the input price.
    cache_write_share: float = 1.25


# Anthropic list prices of 6 October 2026 (docs/teknik-mimari.md). Haiku 5.5 is
# priced for prompts up to 100K tokens; ours are far below that.
PRICES: dict[str, Price] = {
    "claude-haiku-5-5": Price(0.10, 0.50),
    "claude-sonnet-5-5": Price(2.00, 10.00),
    "claude-opus-5-5": Price(4.00, 20.00, cache_read_share=0.05),
}
BATCH_DISCOUNT = 0.5


@dataclass(frozen=True)
class WorkerConfig:
    triage: StageConfig = field(default_factory=lambda: StageConfig(TRIAGE_MODEL, "low", 8000))
    # Second stage for uncertain cases; None = one stage only (e.g. a small local model,
    # where asking the same model again adds nothing).
    review: StageConfig | None = field(
        default_factory=lambda: StageConfig(REVIEW_MODEL, "medium", 16000)
    )
    # Third stage for the hardest cases; None = off.
    hard: StageConfig | None = None
    # Below this the triage result goes to review (docs/metodoloji.md, section 6: 70%).
    confidence_threshold: float = 0.70
    # Below this, after review, the case goes to the hard stage (when enabled).
    hard_threshold: float = 0.50
    mosaic_size: int = 1024
    # Seconds between batch status checks.
    poll_interval_s: float = 30.0
    provider: ProviderConfig = field(default_factory=ProviderConfig)

    @property
    def stages(self) -> list[StageConfig]:
        if self.review is None:
            return [self.triage]
        return [self.triage, self.review] + ([self.hard] if self.hard else [])

    @property
    def config_key(self) -> str:
        """Models of the cascade; with the prompt version it identifies a result.

        A rerun with the same prompt version and config key writes nothing new.
        """
        return ">".join(s.model for s in self.stages)

    def params_hash(self) -> str:
        """Hash of everything that shapes a request or the triage; stored as params_hash."""
        data = asdict(self)
        if self.provider == ProviderConfig():
            del data["provider"]  # keeps the hash of Anthropic runs as before
        text = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    @classmethod
    def load(cls, path: Path | None, *, with_hard: bool = False) -> WorkerConfig:
        cfg = cls()
        if path is not None:
            data: dict[str, Any] = json.loads(Path(path).read_text(encoding="utf-8"))
            known = {f.name for f in fields(cls)}
            unknown = set(data) - known
            if unknown:
                raise ValueError(f"unknown config keys: {sorted(unknown)}")
            for key in ("triage", "review", "hard"):
                if key in data and data[key] is not None:
                    data[key] = StageConfig(**data[key])
            if "provider" in data:
                data["provider"] = ProviderConfig(**data["provider"])
            cfg = replace(cfg, **data)
        if with_hard and cfg.hard is None:
            cfg = replace(cfg, hard=StageConfig(HARD_MODEL, "medium", 16000))
        if cfg.hard is not None and cfg.review is None:
            raise ValueError("a hard stage needs a review stage")
        if with_hard and cfg.provider.kind != "anthropic":
            raise ValueError("--with-opus needs the anthropic provider")
        for s in cfg.stages:
            if cfg.provider.kind == "anthropic" and s.model not in PRICES:
                raise ValueError(f"no price for model {s.model}; add it to config.PRICES")
        return cfg
