from __future__ import annotations

import io
import sys
import uuid
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))


def jpeg(color: tuple[int, int, int] = (60, 120, 40), size=(320, 240), mark: str = "") -> bytes:
    """A small synthetic crop: a coloured background with a 'tree' blob."""
    img = Image.new("RGB", size, (150, 190, 230))
    d = ImageDraw.Draw(img)
    w, h = size
    d.rectangle([w // 2 - 6, h // 2, w // 2 + 6, h - 10], fill=(90, 60, 30))
    d.ellipse([w // 4, h // 6, 3 * w // 4, 2 * h // 3], fill=color)
    if mark:
        d.text((5, 5), mark, fill=(0, 0, 0))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=80)
    return out.getvalue()


# Registry rows as created by supabase/migrations/20261021180000_metric_registry.sql
# and 20261021230000_field_sync.sql (only the columns the worker reads).
def _row(code, value_type, seasons, *, smin=None, smax=None, cats=None, subjects=("tree",)):
    return {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"metric:{code}")),
        "code": code,
        "value_type": value_type,
        "scale_min": smin,
        "scale_max": smax,
        "categories": list(cats) if cats else None,
        "valid_seasons": list(seasons),
        "subject_kinds": list(subjects),
        # Free text that must never reach a request.
        "name": f"NAME-{code}",
        "description": f"DESCRIPTION-{code}",
    }


ALL = ("winter", "spring", "summer", "harvest")
REGISTRY = [
    _row("dead_branch_scale", "scale", ALL, smin=0, smax=3),
    _row("trunk_base_scale", "scale", ALL, smin=0, smax=3),
    _row("pruning_status", "category", ("winter",), cats=("done", "partial", "not_done")),
    _row("crown_density_scale", "scale", ("spring", "summer"), smin=0, smax=3),
    # Winter since methodology-v0.2 (late March); expert only, the AI skips it.
    _row("frost_damage_scale", "scale", ("winter", "spring"), smin=0, smax=3),
    _row("pest_sign_severity", "category", ("spring", "summer"), cats=("none", "mild", "marked")),
    _row(
        "pest_sign_type",
        "category",
        ("spring", "summer"),
        cats=("psylla", "bud_borer", "stink_bug", "other"),
    ),
    _row("fruit_load_scale", "scale", ("summer",), smin=0, smax=3),
    _row("basal_sprout_level", "category", ALL, cats=("none", "few", "dense")),
    _row(
        "dieback_pattern",
        "category",
        ALL,
        cats=("none", "tip_dieback", "one_sided", "top_down", "top_dead_base_alive"),
    ),
    _row("dried_leaves_attached", "boolean", ("spring", "summer", "harvest")),
    _row("harvest_complete", "boolean", ("harvest",)),
    _row("branch_break", "boolean", ("summer", "harvest")),
    _row("theft_trace", "boolean", ("summer", "harvest"), subjects=("parcel",)),
    _row("crown_diameter", "numeric", ("spring", "summer")),
    _row("dead_branch_present", "boolean", ("winter", "spring")),
    _row("pruned", "boolean", ("winter",)),
]


@pytest.fixture
def registry():
    return [dict(r) for r in REGISTRY]


@pytest.fixture(scope="session")
def supabase_env():
    from supabase_util import SKIP_REASON, local_env

    env = local_env()
    if env is None:
        pytest.skip(SKIP_REASON)
    return env


@pytest.fixture(scope="session")
def test_sessions(supabase_env):
    """Ids of sessions a test opened in the local database; purged after the test run."""
    import os
    import warnings

    from supabase_util import KEEP_ENV, purge_sessions

    ids: list[str] = []
    yield ids
    if os.environ.get(KEEP_ENV):
        return
    problem = purge_sessions(supabase_env, ids)
    if problem:
        warnings.warn(
            f"test sessions left in the database ({problem}); run pnpm db:reset before "
            "pnpm db:test",
            stacklevel=1,
        )


def pytest_collection_modifyitems(config, items):
    """Live tests (real Claude API) run only when asked for with -m live and a key is set."""
    import os

    asked = "live" in (config.option.markexpr or "")
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    reason = "real API tests run only with -m live" if not asked else "ANTHROPIC_API_KEY is not set"
    for item in items:
        if "live" in item.keywords and not (asked and has_key):
            item.add_marker(pytest.mark.skip(reason=reason))
