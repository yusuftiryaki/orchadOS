"""Triage: which trees go from the fast model to the stronger one.

Stage 1 (Claude Haiku 5.5) sees every tree. A tree goes to stage 2 (Claude
Sonnet 5.5) when (docs/MVP.md, Modül 4; docs/metodoloji.md, section 6):
- there is no usable answer (error, refusal, invalid output),
- the class confidence is below the threshold, or no class was given,
- the suggested class is problem, dead or absent,
- the answer carries a flag,
- the tree is not clearly visible,
- the class does not follow from the answer's own scales.
Stage 3 (Claude Opus 5.5, off by default) takes stage 2 cases that still have no
usable answer or a confidence below the hard threshold.

The final answer is the last stage's usable answer; the model that gave it is
recorded. If a later stage fails, the earlier answer stands.
"""

from __future__ import annotations

from dataclasses import dataclass

from .methodology import expected_class
from .schema import AiOutput

ESCALATED_CLASSES = ("problem", "dead", "absent")


def review_reasons(out: AiOutput | None, threshold: float) -> list[str]:
    """Why a stage 1 answer goes to review; empty = it stands."""
    if out is None:
        return ["no_answer"]
    reasons: list[str] = []
    if out.overall_class is None:
        reasons.append("no_class")
    elif out.class_confidence < threshold:
        reasons.append("low_confidence")
    if out.overall_class in ESCALATED_CLASSES:
        reasons.append(f"class_{out.overall_class}")
    reasons += [f"flag_{f}" for f in out.flags]
    if out.tree_visible != "yes":
        reasons.append(f"tree_visible_{out.tree_visible}")
    expected = expected_class(out.given())
    if (
        out.overall_class in ("healthy", "attention", "problem")
        and expected is not None
        and expected != out.overall_class
    ):
        reasons.append("class_inconsistent")
    return reasons


def hard_reasons(out: AiOutput | None, threshold: float) -> list[str]:
    """Why a stage 2 answer goes to the hard stage (when it is enabled)."""
    if out is None:
        return ["no_answer"]
    if out.overall_class is None:
        return ["no_class"]
    if out.class_confidence < threshold:
        return ["low_confidence"]
    return []


@dataclass
class StageOutcome:
    """One stage's answer for one tree."""

    stage: int
    model: str
    output: AiOutput | None
    error: str | None = None
    # Model id the API reported (response.model).
    served_model: str | None = None


def final_outcome(outcomes: list[StageOutcome]) -> StageOutcome | None:
    """The latest stage with a usable answer."""
    usable = [o for o in outcomes if o.output is not None]
    return max(usable, key=lambda o: o.stage) if usable else None
