from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from orchados_ai_worker.methodology import (
    COMMON_RULES,
    HARD_SCALES,
    NO_AI_DEAD_IN_SEASON,
    PEST_CLASS_LEVELS,
    SUPPORTED_METHODOLOGY_VERSIONS,
    scale_texts,
    season_of,
    season_of_month,
)

# Shared with apps/web and apps/field (test-vectors/season.json).
VECTORS = json.loads(
    (Path(__file__).resolve().parents[3] / "test-vectors" / "season.json").read_text("utf-8")
)
CASES = [
    (None if version == "null" else version, month, season)
    for version, calendar in VECTORS["versions"].items()
    for month, season in enumerate(VECTORS["calendars"][calendar], start=1)
]


def test_shared_vectors_are_complete():
    assert len(CASES) == 60


@pytest.mark.parametrize(("version", "month", "season"), CASES)
def test_season_of_month_matches_the_shared_vectors(version, month, season):
    assert season_of_month(month, version) == season


def test_visit_keeps_the_season_of_its_methodology():
    late_march = datetime(2027, 3, 28, 7, 0, tzinfo=UTC)
    early_august = datetime(2027, 8, 5, 5, 0, tzinfo=UTC)
    assert season_of(late_march, "methodology-v0.2") == "winter"
    assert season_of(early_august, "methodology-v0.2") == "summer"
    assert season_of(late_march, "methodology-v0.1") == "spring"
    assert season_of(early_august, "methodology-v0.1") == "harvest"
    assert season_of(early_august, None) == "harvest"


def test_v02_keeps_the_v01_assessment_rules():
    assert "methodology-v0.2" in SUPPORTED_METHODOLOGY_VERSIONS
    for table in (PEST_CLASS_LEVELS, COMMON_RULES, NO_AI_DEAD_IN_SEASON, HARD_SCALES):
        assert table["methodology-v0.2"] == table["methodology-v0.1"]
    assert scale_texts("methodology-v0.2") == scale_texts("methodology-v0.1")
