"""What the AI is told about the methodology (docs/metodoloji.md, sections 4-6 and Ek B).

The texts here are the prompt's view of the scales: English renderings of the
methodology document, keyed by the metric codes of the registry
(public.metric_definition). They are versioned with the prompt
(prompt.PROMPT_REVISION); a change here is a new prompt version. Rules and
texts that differ between methodology versions are keyed by the version, so a
visit planned with an older version is assessed by its own rules.

Nothing in this module is read from the database at prompt time except which
codes exist, their value type and range, so a free-text column of the registry
can never leak into a request.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

Season = Literal["winter", "spring", "summer", "harvest"]
SEASONS: tuple[Season, ...] = ("winter", "spring", "summer", "harvest")
HealthClass = Literal["healthy", "attention", "problem", "dead", "absent"]
HEALTH_CLASSES: tuple[HealthClass, ...] = ("healthy", "attention", "problem", "dead", "absent")

# The methodology versions this prompt knows. The session row names its version
# (session.methodology_version); a visit without one uses the default, as the
# expert panel does (apps/web, DEFAULT_METHODOLOGY_VERSION).
DEFAULT_METHODOLOGY_VERSION = "methodology-v0"
SUPPORTED_METHODOLOGY_VERSIONS = ("methodology-v0", "methodology-v0.1", "methodology-v0.2")

# How far pest signs raise the general class, per methodology version (same as
# apps/web/src/lib/expert/mandatory-review.ts, classRule): 0 not at all,
# 1 attention, 2 problem. v0.1 (expert agent decision, awaiting the pilot
# expert): mild signs no longer change the class, marked ones mean attention.
# v0.2 changed the calendar and the close-up protocol, not the class rules.
PEST_CLASS_LEVELS: dict[str, tuple[int, int]] = {
    "methodology-v0": (1, 2),
    "methodology-v0.1": (0, 1),
    "methodology-v0.2": (0, 1),
}

# Visit calendars (docs/metodoloji.md, section 2), same rule as
# apps/web/src/lib/expert/season.ts and the field app (shared vectors:
# test-vectors/season.json). Month in UTC. Legacy (v0, v0.1, no version): March
# is spring, August harvest, November winter.
_LEGACY_CALENDAR: tuple[Season, ...] = (
    "winter",
    "winter",
    "spring",
    "spring",
    "spring",
    "summer",
    "summer",
    "harvest",
    "harvest",
    "harvest",
    "winter",
    "winter",
)
# methodology-v0.2 (expert agent, docs/uzman-ajan-onerileri.md, section 6):
# winter November-March, spring April-May, summer June-August, harvest
# September-October.
_V0_2_CALENDAR: tuple[Season, ...] = (
    "winter",
    "winter",
    "winter",
    "spring",
    "spring",
    "summer",
    "summer",
    "summer",
    "harvest",
    "harvest",
    "winter",
    "winter",
)
_CALENDAR_BY_VERSION: dict[str, tuple[Season, ...]] = {"methodology-v0.2": _V0_2_CALENDAR}


def season_of_month(month: int, methodology_version: str | None) -> Season:
    """Season of a UTC month (1-12); unknown versions and None use the legacy calendar."""
    calendar = _CALENDAR_BY_VERSION.get(methodology_version or "", _LEGACY_CALENDAR)
    return calendar[month - 1]


def season_of(when: datetime, methodology_version: str | None) -> Season:
    """Season of a visit at `when` (UTC) under its methodology version."""
    return season_of_month(when.month, methodology_version)


@dataclass(frozen=True)
class ScaleText:
    """Prompt text of one metric: what it is and what each value means."""

    title: str
    values: tuple[tuple[str, str], ...]
    how: str = ""


# Metric code -> prompt text. Only tree metrics the AI may suggest from crops;
# parcel metrics (theft_trace), measured quantities (crown_diameter, ...) and the
# staff's own yes/no questions are not asked of the AI.
SCALE_TEXTS: dict[str, ScaleText] = {
    "dead_branch_scale": ScaleText(
        "Dead branches (share of the visible crown volume that is dead)",
        (
            ("0", "no dead branches, or only thin tip shoots"),
            ("1", "less than 10% of the crown is dead"),
            ("2", "10-30% of the crown is dead"),
            ("3", "more than 30% of the crown is dead"),
        ),
        "Judge the four directions together; estimate by crown volume, not by branch count. "
        "In winter, dead wood is ash grey with cracked or peeling bark and no buds at the tips. "
        "Cut stubs left by pruning are not dead branches.",
    ),
    "trunk_base_scale": ScaleText(
        "Trunk and base (wounds, cavities, bark loss, gummosis, root collar); root suckers are "
        "basal_sprout_level",
        (
            ("0", "sound trunk, clean base"),
            ("1", "small wound"),
            (
                "2",
                "wound or cavity on less than a quarter of the trunk circumference; gummosis",
            ),
            (
                "3",
                "wound on more than a quarter of the circumference, deep cavity or bark loss",
            ),
        ),
        "Panorama crops often hide the trunk (tall grass, hoses, angle). If the trunk is not "
        "clearly visible, give no value. Values 2 and 3 need a close-up to confirm, so give them "
        "only when the damage is unmistakable, and with a moderate confidence.",
    ),
    "pruning_status": ScaleText(
        "Pruning this season (care compliance; does not affect the overall class)",
        (
            ("done", "clear pruning traces this season: fresh cuts, opened crown centre"),
            ("partial", "some main branches pruned, part of the crown not"),
            ("not_done", "no pruning traces this season"),
        ),
        "If it cannot be decided from the images, give no value.",
    ),
    "crown_density_scale": ScaleText(
        "Crown density (leafy period)",
        (
            ("0", "normal: little sky visible through the crown"),
            ("1", "slightly sparse"),
            ("2", "clearly sparse: sky visible through large parts of the crown"),
            ("3", "very sparse: leaves only at branch tips or on a few branches"),
        ),
        "Compare with a healthy tree of the same size. A general late-summer thinning on rainfed "
        "orchards is normal and is not a high value for a single tree.",
    ),
    "frost_damage_scale": ScaleText(
        "Frost damage (spring)",
        (
            ("0", "no damage"),
            ("1", "blackening on a few shoots or flower clusters"),
            ("2", "blackened flowers and shoots on a clear part of the crown"),
            ("3", "loss of flowers and young shoots on most of the crown"),
        ),
    ),
    "pest_sign_severity": ScaleText(
        "Visible pest signs (severity). Visible signs only; this is not a diagnosis",
        (
            ("none", "no visible pest signs"),
            ("mild", "signs on a few branches"),
            ("marked", "signs across the crown or on many branches"),
        ),
    ),
    "pest_sign_type": ScaleText(
        "Pest suggested by the visible signs (only when the severity is mild or marked)",
        (
            (
                "psylla",
                "honeydew and shine on leaves, black sooty mould spots, leaf curling and drop",
            ),
            ("bud_borer", "drying of shoot tips and buds, dying tip shoots"),
            ("stink_bug", "feeding spots on fruit, empty kernels (usually needs a close-up)"),
            ("other", "another or uncertain pest"),
        ),
        "If the type is not clear, choose other. Give no value when the severity is none.",
    ),
    "fruit_load_scale": ScaleText(
        "Fruit load (summer; alternate bearing is normal and does not affect the overall class)",
        (
            ("0", "no or very few clusters"),
            ("1", "few: clusters on a small part of the branches"),
            ("2", "medium"),
            ("3", "loaded: clusters on most branches"),
        ),
    ),
    "basal_sprout_level": ScaleText(
        "Basal sprouts: thin shoots from the trunk base or the roots (care; does not affect the "
        "overall class)",
        (
            ("none", "no thin shoots at the base or on the ground under the crown"),
            ("few", "1-5 thin shoots (pencil thick or thinner), below knee height"),
            (
                "dense",
                "more than 5 shoots, a cluster around the base, or shoots above waist height or "
                "wrist thick",
            ),
        ),
        "The base is often hidden by grass or the angle; then give no value. Leafless winter "
        "shoots are hard to see in panorama crops.",
    ),
    "dieback_pattern": ScaleText(
        "Dieback pattern: how the dead wood is spread over the crown (the amount is "
        "dead_branch_scale)",
        (
            ("none", "no dead wood, or scattered without a pattern"),
            ("tip_dieback", "many branches dead at the tips, dying back; branch bases alive"),
            ("one_sided", "one side of the crown or one main branch entirely dead, the rest alive"),
            ("top_down", "the upper crown dead or sparse, the lower crown alive"),
            (
                "top_dead_base_alive",
                "the grafted crown and upper trunk dead, live shoots from the base",
            ),
        ),
        "Give it only together with dead_branch_scale; if dead_branch_scale is 0 the pattern is "
        "none. one_sided and top_down raise the overall class to at least attention.",
    ),
    "dried_leaves_attached": ScaleText(
        "Dried brown leaves still hanging on the branches (sudden wilting)",
        (
            ("true", "dried brown leaves hang on branches instead of falling"),
            ("false", "no hanging dried leaves"),
        ),
        "Only in the leafy period. true raises the overall class to at least problem.",
    ),
    "harvest_complete": ScaleText(
        "Harvest of the tree is complete",
        (("true", "no clusters left on the tree"), ("false", "clusters still on the tree")),
    ),
    "branch_break": ScaleText(
        "Broken branch",
        (("true", "a broken branch is visible"), ("false", "no broken branch visible")),
    ),
}

# methodology-v0.1 scale texts (expert agent decisions, docs/uzman-ajan-onerileri.md,
# section 1.1; awaiting the pilot expert): visible criteria per value. Codes not
# listed here keep the shared text above, so methodology-v0 visits are asked
# exactly as before.
_SCALE_TEXTS_V01: dict[str, ScaleText] = {
    "dead_branch_scale": ScaleText(
        "Dead branches (share of the visible crown that is dead; dead scaffold branches count "
        "on their own)",
        (
            ("0", "no dead branches; only a few dead tip shoots thinner than a pencil"),
            (
                "1",
                "less than about 10% of the crown is dead, typically 1-3 side branches or "
                "scattered dead tips; no scaffold branch is dead",
            ),
            ("2", "10-30% of the crown is dead, or one scaffold branch is entirely dead"),
            (
                "3",
                "more than 30% of the crown is dead, or two or more scaffold branches are "
                "entirely dead",
            ),
        ),
        "A scaffold branch (Turkish: ana kol) is a thick framework branch growing from the "
        "trunk. One entirely dead scaffold branch means at least 2, two or more mean 3, whatever "
        "the share of the crown. Judge the four directions together; estimate the share by "
        "crown volume, not by branch count. Cut stubs left by pruning are not dead branches. "
        "In winter, live pistachio bark is reddish brown to grey with plump buds at the tips; "
        "dead wood is ash grey with cracked or peeling bark and shrivelled or no buds. "
        "Common mistakes: shaded inner branches and wet branches look dark in winter but are "
        "not dead; branches of the tree behind (next row) overlap the crown but are not part "
        "of it.",
    ),
    "trunk_base_scale": ScaleText(
        "Trunk and root collar (wounds, cavities, bark loss, gummosis); root suckers are not in "
        "this scale, they are basal_sprout_level",
        (
            ("0", "sound trunk and root collar; old pruning wounds closed over by bark are fine"),
            (
                "1",
                "an open, shallow wound smaller than a palm (about 10 cm), or a few small spots "
                "of gum (amber coloured, hardened drops)",
            ),
            (
                "2",
                "a wound larger than a palm but around less than a quarter of the trunk "
                "circumference, a shallow cavity, gum at several places, or darkened, sunken "
                "bark at the root collar",
            ),
            (
                "3",
                "a wound or bark loss around more than a quarter of the circumference, a cavity "
                "deep enough to put a hand in, or dead bark all around the root collar",
            ),
        ),
        "Tractor and hoe wounds count here. Panorama crops often hide the trunk (tall grass, "
        "hoses, angle). If the trunk is not clearly visible, give no value. Values 2 and 3 need "
        "a close-up to confirm, so give them only when the damage is unmistakable, and with a "
        "moderate confidence.",
    ),
    "pruning_status": ScaleText(
        "Pruning this season (care compliance; does not affect the overall class)",
        SCALE_TEXTS["pruning_status"].values,
        "A fresh cut is light cream, not yet grey, and the bark has not started to close over "
        "it; last year's cuts are grey and closing from the edges. If it cannot be decided "
        "from the images, give no value.",
    ),
    "crown_density_scale": ScaleText(
        "Crown density (leafy period)",
        (
            (
                "0",
                "normal: as full as good trees of the same size in the parcel; sky shows only "
                "through small gaps",
            ),
            (
                "1",
                "slightly sparse: noticeably more open than the comparison trees; sky shows "
                "through many scattered gaps",
            ),
            (
                "2",
                "clearly sparse: sky shows through roughly half of the crown area, or clearly "
                "fewer leaves on one side",
            ),
            (
                "3",
                "very sparse: leaves only at branch tips or on a few branches; the crown is "
                "mostly bare branches",
            ),
        ),
        "Compare with good trees of the same size in the same parcel (neighbouring trees in the "
        "images); compare male trees and young saplings with their own group only. A heavily "
        "loaded tree in an on year can look less leafy next to its fruit; that is not "
        "sparseness. A general late-summer thinning on rainfed orchards is normal and is not a "
        "high value for a single tree.",
    ),
    "frost_damage_scale": ScaleText(
        "Frost damage (spring)",
        (
            ("0", "no blackened flowers or shoots"),
            (
                "1",
                "blackening or shrivelling on less than about 10% of the flower clusters and "
                "young shoots",
            ),
            ("2", "blackening on 10-50% of them, often more in the lower crown or on one side"),
            (
                "3",
                "flowers and young shoots lost on more than half; clusters brown or black, "
                "dried and drooping",
            ),
        ),
        "Late frost usually hits the lower crown; the top may stay sound. Say in the rationale "
        "where the damage is. Shoot tips dried by a pest or blighted clusters can look the "
        "same; report the visible sign, do not name its cause.",
    ),
    "pest_sign_severity": ScaleText(
        "Visible pest signs (severity). Visible signs only; this is not a diagnosis",
        SCALE_TEXTS["pest_sign_severity"].values,
        "Mild signs do not change the overall class; marked signs mean at least attention.",
    ),
    "pest_sign_type": ScaleText(
        "Pest suggested by the visible signs (only when the severity is mild or marked)",
        (
            (
                "psylla",
                "shine and stickiness (honeydew) on leaves; white, sugar-grain or flake-like "
                "secretion on leaves or on the ground under the tree; black sooty mould on it; "
                "in heavy cases yellowing leaves and leaf drop in midsummer",
            ),
            (
                "bud_borer",
                "dried shoot tips or buds, sometimes a small hole in the dried tip shoot",
            ),
            (
                "stink_bug",
                "stink bugs (Turkish: kokarca, not kımıl): small dark feeding spots on the "
                "hull, green fruit dropped early on the ground; the kernel damage shows only "
                "when the nut is cracked",
            ),
            ("other", "another or uncertain pest; describe the sign in the rationale"),
        ),
        "Psylla is most common from late spring to the end of summer (June-August), bud borer "
        "in spring and early summer, stink bugs in summer with traces at harvest. If the type "
        "is not clear, choose other. Give no value when the severity is none.",
    ),
    "fruit_load_scale": ScaleText(
        "Fruit load (summer; alternate bearing is normal and does not affect the overall class)",
        (
            ("0", "no clusters, or only a few"),
            ("1", "few: clusters on less than about a third of the branches"),
            ("2", "medium: clusters on a third to two thirds of the branches"),
            (
                "3",
                "loaded: clusters on more than two thirds of the branches; branches may bend "
                "under the load",
            ),
        ),
        "Male trees bear no fruit and are not on this scale: for a tree that is clearly male, "
        "give no value.",
    ),
    "harvest_complete": ScaleText(
        SCALE_TEXTS["harvest_complete"].title,
        SCALE_TEXTS["harvest_complete"].values,
        "Judge by the clusters left on the tree. Leaves, stalks and broken twigs under the tree "
        "are normal after a legitimate harvest.",
    ),
}

_SCALE_TEXTS_BY_VERSION: dict[str, dict[str, ScaleText]] = {
    "methodology-v0": SCALE_TEXTS,
    "methodology-v0.1": {**SCALE_TEXTS, **_SCALE_TEXTS_V01},
    # v0.2 changed the calendar and the close-up protocol, not the scale texts.
    "methodology-v0.2": {**SCALE_TEXTS, **_SCALE_TEXTS_V01},
}


def scale_texts(methodology_version: str = DEFAULT_METHODOLOGY_VERSION) -> dict[str, ScaleText]:
    """Prompt texts of the scales for a methodology version (same codes in every version)."""
    return _SCALE_TEXTS_BY_VERSION.get(methodology_version, SCALE_TEXTS)


# Extra common rules for the 0-3 scales, per methodology version (v0.1: expert agent,
# section 1.1). Numbered after the prompt's own rules.
COMMON_RULES: dict[str, tuple[str, ...]] = {
    "methodology-v0": (),
    "methodology-v0.1": (
        "Borderline values: if a value lies between two steps and the evidence is good, give "
        "the upper one; if the evidence is weak, give no value.",
    ),
}
COMMON_RULES["methodology-v0.2"] = COMMON_RULES["methodology-v0.1"]

# Seasons in which the AI may never suggest the class dead, per methodology version.
# v0.1 (expert agent, section 1.4): in the leafless winter only the expert calls a
# tree dead, from close-up tests. An answer that says dead anyway is turned into
# problem with dead_branch_scale 3 and the flag winter_dead_downgraded
# (schema.apply_worker_rules). v0 visits keep the answer as it came.
NO_AI_DEAD_IN_SEASON: dict[str, tuple[Season, ...]] = {
    "methodology-v0": (),
    "methodology-v0.1": ("winter",),
    "methodology-v0.2": ("winter",),
}

# Scales that are hardest to judge from images (expert agent, section 1.8): from this
# value up, a triage answer goes to stage 2 whatever its confidence.
HARD_SCALES: dict[str, tuple[str, ...]] = {
    "methodology-v0": (),
    "methodology-v0.1": ("dead_branch_scale", "trunk_base_scale"),
    "methodology-v0.2": ("dead_branch_scale", "trunk_base_scale"),
}
HARD_SCALE_MIN = 2

# Scales that drive the overall class (docs/metodoloji.md, section 5). Pruning
# and fruit load do not affect it.
CLASS_SCALES = (
    "dead_branch_scale",
    "trunk_base_scale",
    "crown_density_scale",
    "frost_damage_scale",
)

# Metrics the AI is not asked about in a season although the registry allows
# them: in winter the dieback pattern needs close-up evidence, so only the expert
# enters it (docs/metodoloji.md, section 4.10); frost damage is a winter metric
# only for a late-March visit under v0.2, where frost on swelling buds needs a
# close look, so only the expert enters it too (section 4.5).
# Seasons the registry gained with methodology-v0.2 (migration
# 20261103100800_methodology_v02). The registry is not versioned, so visits of
# earlier versions are not asked about these (same as the expert panel,
# apps/web expert/metrics.ts V0_2_SEASON_EXTRAS).
V0_2_SEASON_EXTRAS: dict[str, tuple[Season, ...]] = {
    "frost_damage_scale": ("winter",),
    "branch_break": ("summer",),
}
V0_2_VERSIONS = ("methodology-v0.2",)

AI_SKIP_IN_SEASON: dict[str, tuple[Season, ...]] = {
    "dieback_pattern": ("winter",),
    "frost_damage_scale": ("winter",),
}

# Field staff yes/no questions (supabase/migrations/20261021230000_field_sync.sql).
# Only the code and the answer go into a request; this gloss is ours, so the
# question wording shown to staff never does.
STAFF_QUESTIONS: dict[str, str] = {
    "dead_branch_present": "a dead branch is seen",
    "trunk_damage_present": "wound, cavity or bark loss on the trunk",
    "root_sucker_present": "root suckers at the base",
    "pruned": "the tree was pruned this winter",
    "frost_damage_present": "blackened flowers or young shoots",
    "pest_sign_present": "visible pest signs",
    "fruit_present": "the tree carries fruit clusters",
    "drought_stress_sign": "signs of drought stress",
    "theft_sign_present": "signs of early picking or theft at the tree",
    "harvest_complete": "harvest of the tree is complete",
    "branch_break": "a broken branch is seen",
}


def expected_class(
    values: dict[str, object], methodology_version: str = DEFAULT_METHODOLOGY_VERSION
) -> HealthClass | None:
    """Overall class from scale values by rules 3-5 (section 5); None if nothing to judge by.

    The dieback pattern and hanging dried leaves raise the class (section 4.10).

    Rules 1 (absent) and 2 (dead) need the images, not the scales; the model decides
    those. Used to check that a suggestion is consistent with its own scales.
    """
    scales = [values.get(code) for code in CLASS_SCALES]
    given = [v for v in scales if isinstance(v, int) and not isinstance(v, bool)]
    pest = values.get("pest_sign_severity")
    pattern = values.get("dieback_pattern")
    leaves = values.get("dried_leaves_attached")
    if not given and pest is None and pattern is None and leaves is None:
        return None
    mild, marked = PEST_CLASS_LEVELS.get(methodology_version, PEST_CLASS_LEVELS["methodology-v0"])
    pest_level = marked if pest == "marked" else mild if pest == "mild" else 0
    if any(v == 3 for v in given) or pest_level == 2 or leaves is True:
        return "problem"
    if any(v == 2 for v in given) or pest_level == 1 or pattern in ("one_sided", "top_down"):
        return "attention"
    return "healthy"
