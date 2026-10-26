"""Coverage and presence checks against the local Supabase stack, through the CLI.

test_skipped_aisle_opens_one_rescan_request: a scan of rows 1-2, positions 5-8
of the seed parcel that skips the aisle between the two rows -> run -> upload:
the coverage report is below the threshold, the trees inside the rows are
uncovered (the row ends are also seen from the turn between the aisles) and
a pipeline extra visit request lists them; uploading again, and reprocessing
with other parameters, opens no second request.

test_cut_tree_is_not_visible: the same rows driven fully, S1-6 cut and S2-7 (an
empty slot) planted -> tree_visible = no on S1-6 with its crops as evidence
(mandatory review in the expert panel, apps/web tests), yes on the empty slot
(possible new planting), yes on the standing trees.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import pytest
from conftest import fast_params
from supabase_util import ORG, PARCEL, client, creds

from orchados_pipeline.cli import main
from orchados_pipeline.context import RunContext
from orchados_pipeline.models import CoverageReport, read_model
from orchados_pipeline.trees_db import parcel_tree_list

pytestmark = pytest.mark.supabase

START = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)  # leafy months
CHOSEN = [f"S{r}-{p}" for r in (1, 2) for p in (5, 6, 7, 8) if f"S{r}-{p}" != "S2-7"]


@pytest.fixture
def ops_env(supabase_env, monkeypatch):
    for k, v in creds(supabase_env, "ops").items():
        monkeypatch.setenv(k, v)
    return client(supabase_env, "ops")


def _session(ops, test_sessions) -> str:
    session_id = str(uuid.uuid4())
    test_sessions.append(session_id)
    ops.insert(
        "session",
        [
            {
                "id": session_id,
                "org_id": ORG,
                "parcel_id": PARCEL,
                "kind": "periodic_scan",
                "status": "planned",
                "planned_date": START.date().isoformat(),
                "started_at": START.isoformat(),
            }
        ],
    )
    return session_id


def _scan(tmp_path, session_id: str, *extra: str, params=None):
    """synth (fitted to rows 1-2, positions 5-8) -> run --trees-from-db -> upload."""
    params = params or fast_params()
    session_dir = tmp_path / "session"
    if not session_dir.exists():
        seed = str(uuid.UUID(session_id).int % 100_000)
        synth = ["synth", str(session_dir), "--trees-from-db", "--parcel-id", PARCEL]
        synth += ["--session-id", session_id, "--rows", "1-2", "--positions", "5-8"]
        synth += ["--start-utc", START.isoformat(), "--seed", seed, *extra]
        assert main(synth) == 0
    path = tmp_path / f"params-{params.params_hash()[:8]}.json"
    path.write_text(params.model_dump_json(), encoding="utf-8")
    assert main(["run", str(session_dir), "--trees-from-db", "--params", str(path)]) == 0
    run_dir = RunContext.create(session_dir, None, params).run_dir
    upload = ["upload", str(run_dir), "--session-id", session_id, "--trees-from-db"]
    assert main([*upload, "--station", "ci"]) == 0
    return run_dir


def test_skipped_aisle_opens_one_rescan_request(ops_env, test_sessions, tmp_path, capsys):
    ops = ops_env
    session_id = _session(ops, test_sessions)
    # Aisles in driving order: south of row 1, between rows 1 and 2, north of row 2.
    run_dir = _scan(tmp_path, session_id, "--skip-aisle", "2")

    rep = read_model(CoverageReport, run_dir / "coverage.json")
    by_code = {t.slot_code: t for t in rep.trees}
    # Each row is seen from one side only; the row ends also from the turn
    # between the aisles, so the last trees are seen from both faces.
    inner = [c for c in CHOSEN if not c.endswith("-8")]
    assert all(not by_code[c].covered for c in inner)
    assert by_code["S1-8"].covered and by_code["S2-8"].covered
    assert not rep.summary.passed and rep.summary.rescan_needed

    (row,) = ops.select(
        "coverage_report",
        {"session_id": f"eq.{session_id}", "select": "id,passed,rescan_needed,missing_slot_codes"},
    )
    assert (row["passed"], row["rescan_needed"]) == (False, True)
    assert set(inner) <= set(row["missing_slot_codes"])
    (req,) = ops.select(
        "followup_request",
        {
            "source_session_id": f"eq.{session_id}",
            "select": "id,kind,origin,status,note,coverage_report_id",
        },
    )
    assert (req["kind"], req["origin"], req["status"]) == ("extra_visit", "pipeline", "open")
    assert req["coverage_report_id"] == row["id"]
    assert req["note"].startswith("İşleme hattı: kapsama %")
    assert "S1-5" in req["note"]
    assert f"extra visit request {req['id']}: open" in capsys.readouterr().out

    # Uploading again: nothing new.
    upload = ["upload", str(run_dir), "--session-id", session_id, "--trees-from-db"]
    assert main([*upload, "--station", "ci"]) == 0
    assert (
        len(ops.select("coverage_report", {"session_id": f"eq.{session_id}", "select": "id"})) == 1
    )
    # Reprocessing with other parameters: a new report, still one request.
    other = fast_params()
    other.coverage.min_view_score = 0.25
    _scan(tmp_path, session_id, params=other)
    reports = ops.select("coverage_report", {"session_id": f"eq.{session_id}", "select": "id"})
    assert len(reports) == 2
    requests = ops.select(
        "followup_request", {"source_session_id": f"eq.{session_id}", "select": "id"}
    )
    assert [r["id"] for r in requests] == [req["id"]]


def test_cut_tree_is_not_visible(ops_env, supabase_env, test_sessions, tmp_path):
    ops = ops_env
    session_id = _session(ops, test_sessions)
    run_dir = _scan(tmp_path, session_id, "--missing", "S1-6", "--planted", "S2-7")
    presence = json.loads((run_dir / "presence.json").read_text())
    assert {t["slot_code"]: t["value"] for t in presence["trees"]}["S1-6"] == "no"

    tlist = parcel_tree_list(ops, PARCEL)
    tree_of = {t.slot_code: t.tree_id for t in tlist.trees}
    slot_of = {e.slot_code: e.slot_id for e in tlist.empty_slots}
    (metric,) = ops.select("metric_definition", {"code": "eq.tree_visible", "select": "id"})
    rows = ops.select(
        "measurement",
        {
            "session_id": f"eq.{session_id}",
            "metric_definition_id": f"eq.{metric['id']}",
            "select": "id,tree_id,slot_id,value_category,source,method,method_version,"
            "measurement_evidence(asset_id)",
        },
    )
    by_tree = {r["tree_id"]: r for r in rows if r["tree_id"]}
    cut = by_tree[tree_of["S1-6"]]
    assert (cut["value_category"], cut["source"], cut["method"]) == (
        "no",
        "algorithm",
        "crop_greenness",
    )
    evidence = [e["asset_id"] for e in cut["measurement_evidence"]]
    crops = ops.select("asset", {"id": f"in.({','.join(evidence)})", "select": "tree_id,kind"})
    assert len(crops) >= 2 and all(
        (c["kind"], c["tree_id"]) == ("tree_crop", tree_of["S1-6"]) for c in crops
    )
    standing = [c for c in CHOSEN if c != "S1-6"]
    assert all(by_tree[tree_of[c]]["value_category"] == "yes" for c in standing)
    (planted,) = [r for r in rows if r["slot_id"]]
    assert (planted["slot_id"], planted["value_category"]) == (slot_of["S2-7"], "yes")
    slot_crops = ops.select(
        "asset",
        {
            "session_id": f"eq.{session_id}",
            "kind": "eq.tree_crop",
            "tree_id": "is.null",
            "select": "id,pose",
        },
    )
    assert slot_crops and all(c["pose"]["subject"] == "slot" for c in slot_crops)

    # The owner sees none of it before publication.
    owner = client(supabase_env, "owner")
    assert owner.select("measurement", {"session_id": f"eq.{session_id}", "select": "id"}) == []
