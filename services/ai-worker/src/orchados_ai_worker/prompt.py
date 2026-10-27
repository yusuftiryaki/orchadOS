"""Prompt of the AI pre-assessment: system prompt, user message and request parameters.

Personal data rule (docs/teknik-mimari.md, KVKK): a request carries only the
tree code, the season, the crop mosaics, the scale definitions and the staff's
yes/no answers (metric code + answer). TreeInput holds nothing else, so the
request builder cannot reach owner names, phones, deeds, parcel names,
villages or question wording.

Prompt caching: the system prompt depends only on the season, the methodology
version and the season's metrics, so it is the same for every tree of a visit.
It is one text block with a cache breakpoint; the per-tree user message comes
after it. Reference images (docs/metodoloji.md, Ek A) are not ready yet; when
they are added to the cached prefix, PROMPT_REVISION goes up.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any

from .config import StageConfig
from .methodology import (
    COMMON_RULES,
    DEFAULT_METHODOLOGY_VERSION,
    NO_AI_DEAD_IN_SEASON,
    PEST_CLASS_LEVELS,
    STAFF_QUESTIONS,
    SUPPORTED_METHODOLOGY_VERSIONS,
    Season,
    scale_texts,
)
from .schema import FLAGS, MetricDef, output_schema

# Bump on any change to the texts below, to the scale texts in methodology.py or
# to the output schema. Stored with every AI row (prompt_version).
# v0.3: methodology-v0.1 visible criteria per scale value, borderline rule, winter
# dead rule enforced by the worker; methodology-v0 prompts unchanged but for the
# revision.
PROMPT_REVISION = "v0.3"


def prompt_version(methodology_version: str | None) -> str:
    """Prompt version as stored: '<revision>/<methodology version>'."""
    mv = methodology_version or DEFAULT_METHODOLOGY_VERSION
    if mv not in SUPPORTED_METHODOLOGY_VERSIONS:
        raise ValueError(
            f"the prompt does not know methodology version {mv!r} "
            f"(supported: {', '.join(SUPPORTED_METHODOLOGY_VERSIONS)})"
        )
    return f"ai-{PROMPT_REVISION}/{mv}"


@dataclass(frozen=True)
class TreeInput:
    """Everything about one tree that may go into a request. Nothing else may."""

    tree_code: str
    season: Season
    # JPEG mosaic of this visit's crops (mosaic.build_mosaic).
    mosaic: bytes
    # Directions present in the mosaic (N, E, S, W).
    directions: tuple[str, ...]
    # Same mosaic from the previous published visit, if any.
    previous_mosaic: bytes | None = None
    previous_directions: tuple[str, ...] = ()
    # Staff yes/no answers of this visit: metric code -> answer.
    staff_answers: dict[str, bool] = field(default_factory=dict)


_SEASON_NOTES: dict[str, str] = {
    "winter": (
        "Winter visit: the trees are leafless. Dead wood is told from live wood by colour, bark "
        "and buds. In winter only the expert may call a tree dead: do not suggest the class "
        "'dead' in winter; if the tree looks lifeless, give your scale values, use the class "
        "'problem' with a low confidence and say so in the rationale."
    ),
    "spring": "Spring visit: flowering and early leaf period.",
    "summer": "Summer visit: leafy period with fruit clusters.",
    "harvest": "Harvest visit: late summer to autumn, during or after the harvest.",
}

# Seasons of methodology.NO_AI_DEAD_IN_SEASON: the rule is enforced on the answer
# (schema.apply_worker_rules), so the model is told what happens.
_NO_DEAD_NOTE = (
    "Winter visit: the trees are leafless. Dead wood is told from live wood by colour, bark "
    "and buds. In winter only the expert may call a tree dead, after close-up tests at the "
    "tree: do not suggest the class 'dead' in winter. If the tree looks lifeless, give "
    "dead_branch_scale 3 and the class 'problem', and say in the rationale that it looks "
    "lifeless. An answer with the class 'dead' in winter is changed to 'problem' with "
    "dead_branch_scale 3 and marked winter_dead_downgraded for the expert."
)


def _season_note(season: Season, methodology_version: str) -> str:
    if season == "winter" and season in NO_AI_DEAD_IN_SEASON.get(methodology_version, ()):
        return _NO_DEAD_NOTE
    return _SEASON_NOTES[season]


def _metric_block(m: MetricDef, methodology_version: str) -> str:
    text = scale_texts(methodology_version)[m.code]
    lines = [f"### {m.code}: {text.title}"]
    lines += [f"- {value}: {meaning}" for value, meaning in text.values]
    if text.how:
        lines.append(text.how)
    return "\n".join(lines)


def _class_rules(methodology_version: str) -> str:
    """Rules 3 and 4 of the general class; pest signs weigh as the version says."""
    mild, marked = PEST_CLASS_LEVELS.get(methodology_version, PEST_CLASS_LEVELS["methodology-v0"])
    problem = ["any 0-3 scale above is 3"]
    attention = ["any 0-3 scale above is 2"]
    for level, name in ((marked, "marked"), (mild, "mild")):
        if level == 2:
            problem.append(f"pest signs are {name}")
        elif level == 1:
            attention.append(f"pest signs are {name}")
    problem.append("dried leaves hang on the branches")
    attention.append("the dieback pattern is one_sided or top_down")
    note = "\nMild pest signs do not change the class." if mild == 0 else ""
    return (
        f"3. problem: {', '.join(problem[:-1])}, or {problem[-1]}.\n"
        f"4. attention: {', '.join(attention[:-1])}, or {attention[-1]}.{note}"
    )


def system_prompt(season: Season, metrics: list[MetricDef], methodology_version: str) -> str:
    """The cached prefix. Same for every tree of a season and methodology version."""
    scales = "\n\n".join(_metric_block(m, methodology_version) for m in metrics)
    flags = ", ".join(FLAGS)
    extra = "".join(
        f"\n{n}. {rule}"
        for n, rule in enumerate(COMMON_RULES.get(methodology_version, ()), start=5)
    )
    return f"""\
You assist an agricultural expert who audits pistachio (Pistacia vera) orchards in Turkey. \
For one tree at a time you get images and suggest values on the audit scales. The expert \
sees your suggestion next to the images and decides; your answer is never shown to the \
orchard owner. Methodology: {methodology_version}. Prompt: {prompt_version(methodology_version)}.

## Rules
1. Do not diagnose. Report only signs that are visible in the images. Never name a disease \
or recommend a treatment.
2. If you are not sure about a value, give no value (null) for it. A missing value is better \
than a guess; never give a lower value instead.
3. Confidence is your probability (0 to 1) that the expert will agree with the value or the \
class. For a null value, give the confidence that the value cannot be judged from these images.
4. Judge the four directions together. One direction may be blocked or blurred; \
use the others.{extra}

## Images
- Image 1 is a mosaic of four crops of this visit, each looking at the tree from one side: \
top-left N (taken from the north of the tree), top-right E, bottom-left S, bottom-right W. \
Each tile is labelled. A grey tile means there is no crop from that side.
- Image 2, if present, is the same mosaic from the previous published visit of the same tree. \
Use it to notice large changes; the values are for this visit only.
- Crops are cut from 360 degree panoramas taken while walking the orchard, so they can be \
blurred, dark, partly blocked, or show a neighbouring tree. The target tree is near the \
centre of each crop.

## Season
{_season_note(season, methodology_version)}

## Scales of this visit
Common rule for 0-3 scales: 0 no sign, 1 mild (no care needed or routine care), 2 clear \
(intervention advised this season), 3 severe (threatens yield or the tree's life).

{scales}

## Overall class
Apply the rules from the top; the first that holds wins.
1. absent: no tree at the position (the expert confirms this from two directions).
2. dead: in the leafy period no live shoots or leaves on the grafted crown and trunk; shoots \
from the base or the rootstock do not count (not in winter, see the season note).
{_class_rules(methodology_version)}
5. healthy: all other cases.
Pruning, fruit load, basal sprouts, harvest and broken branch do not affect the class. \
If no scale can be judged (for example the images do not show the tree), give no class (null).

## Field staff answers
Field staff may have answered yes/no questions at the tree. They are given by code:
{chr(10).join(f"- {code}: {gloss}" for code, gloss in STAFF_QUESTIONS.items())}

## Output
Answer with one JSON object, matching the given schema:
- rationale: at most three short sentences in Turkish for the expert: what you see and why.
- tree_visible: yes, no or unsure: is a tree visible at the target position?
- values: for every scale above, {{"value": <value or null>, "confidence": <0..1>}}.
- overall_class and class_confidence: the class by the rules above, or null.
- flags, any of: {flags}.
  - staff_answer_conflict: a staff answer contradicts what the images show.
  - large_change_from_previous: compared with the previous visit's mosaic, the tree changed \
a lot (for example many new dead branches, lost crown, or the tree is gone).
  - poor_image: the images are too blurred, dark or blocked to judge the tree well.
"""


def user_content(tree: TreeInput) -> list[dict[str, Any]]:
    """The per-tree user message: text, the mosaic(s), staff answers."""

    def image(data: bytes) -> dict[str, Any]:
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.b64encode(data).decode("ascii"),
            },
        }

    def missing(dirs: tuple[str, ...]) -> str:
        gone = [d for d in ("N", "E", "S", "W") if d not in dirs]
        return f" No crop from: {', '.join(gone)}." if gone else ""

    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": f"Tree {tree.tree_code}, {tree.season} visit."},
        {"type": "text", "text": "Image 1: this visit." + missing(tree.directions)},
        image(tree.mosaic),
    ]
    if tree.previous_mosaic is not None:
        blocks += [
            {
                "type": "text",
                "text": "Image 2: previous published visit." + missing(tree.previous_directions),
            },
            image(tree.previous_mosaic),
        ]
    else:
        blocks.append({"type": "text", "text": "There is no previous published visit."})
    if tree.staff_answers:
        answers = "\n".join(
            f"- {code}: {'yes' if v else 'no'}"
            for code, v in sorted(tree.staff_answers.items())
            if code in STAFF_QUESTIONS
        )
        blocks.append({"type": "text", "text": "Field staff answers:\n" + answers})
    else:
        blocks.append({"type": "text", "text": "No field staff answers."})
    blocks.append({"type": "text", "text": "Assess the tree."})
    return blocks


def request_params(
    tree: TreeInput,
    metrics: list[MetricDef],
    methodology_version: str,
    stage: StageConfig,
) -> dict[str, Any]:
    """Messages API parameters for one tree (a Batches API request's params)."""
    return {
        "model": stage.model,
        "max_tokens": stage.max_tokens,
        "system": [
            {
                "type": "text",
                "text": system_prompt(tree.season, metrics, methodology_version),
                "cache_control": {"type": "ephemeral"},
            }
        ],
        "messages": [{"role": "user", "content": user_content(tree)}],
        "thinking": {"type": "adaptive"},
        "output_config": {
            "effort": stage.effort,
            "format": {"type": "json_schema", "schema": output_schema(metrics)},
        },
    }
