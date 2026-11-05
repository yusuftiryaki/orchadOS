"""lidar upload: stage reports -> record_lidar_measurements() payload.

The unit tests use hand-written reports in the stage format (no Supabase); the
supabase test records them against the local stack (pnpm db:start && pnpm
db:reset) on the seed parcel, whose trees have md5('orchados-seed:tree:<slot>') ids.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path

import pytest

from orchados_pipeline.gpstime import gps_ns_to_iso
from orchados_pipeline.lidar import upload as lidar_upload
from orchados_pipeline.lidar.upload import (
    LidarUploadError,
    build_payload,
    check_payload,
    load_reports,
    scan_start,
    summary_lines,
)

SESSION = "11111111-1111-4111-8111-111111111111"
PARCEL = "c0000000-0000-4000-8000-000000000001"
START_NS = 1_446_000_000_000_000_000


def seed_tree(slot: str) -> str:
    return str(uuid.UUID(hashlib.md5(f"orchados-seed:tree:{slot}".encode()).hexdigest()))


T1, T2 = seed_tree("S1-1"), seed_tree("S1-2")


def measurement(tree, metric, method, numeric=None, category=None, unc=None, unit=None, **kw):
    return {
        "tree_id": tree,
        "slot_code": kw.get("slot_code", "S1-1" if tree == T1 else "S1-2"),
        "metric": metric,
        "value_numeric": numeric,
        "value_category": category,
        "unit": unit,
        "uncertainty": unc,
        "confidence": kw.get("confidence", 0.9),
        "method": method,
        "method_version": kw.get("version", "0.1.0"),
    }


def report(stage, method, measurements, session=SESSION, params_hash=None, **extra):
    return {
        "schema": f"orchados.lidar_{stage}/1",
        "producer": {
            "pipeline": "orchados-pipeline",
            "version": "0.1.0",
            "params_hash": params_hash or f"{stage}-hash",
            "stage": f"lidar_{stage}",
        },
        "method": method,
        "method_version": "0.1.0",
        "session_id": session,
        "parcel_id": PARCEL,
        "trees": [
            {"tree_id": T1, "slot_code": "S1-1", "n_points": 5000, "sector_coverage": 1.0,
             "status": "ok", "notes": []},
            {"tree_id": T2, "slot_code": "S1-2", "n_points": 3, "sector_coverage": 0.125,
             "status": "too_few_points", "notes": []},
        ],
        "measurements": measurements,
        "details": [{"tree_id": T1, "anything": 1}],
        "warnings": [],
        **extra,
    }  # fmt: skip


def crown(session=SESSION, version="0.1.0"):
    m = "lidar_crown"
    return report(
        "crown",
        m,
        [
            measurement(T1, "tree_height", m, 3.2, unc=0.05, unit="m", version=version),
            measurement(T1, "crown_diameter", m, 2.9, unc=0.1, unit="m", version=version),
            measurement(T1, "crown_volume", m, 7.5, unc=1.2, unit="m3", version=version),
            measurement(T1, "size_class", m, category="productive", version=version),
            measurement(T2, "tree_height", m, version=version),  # too few points: no value
        ],
        session=session,
    )


def skeleton(session=SESSION):
    m = "lidar_qsm"
    return report(
        "skeleton",
        m,
        [
            measurement(T1, "scaffold_branch_count", m, 4, unc=0.5, unit="count"),
            measurement(T1, "wood_volume", m, 0.21, unc=0.04, unit="m3"),
            measurement(T1, "fractal_dimension", m, 1.62, unc=0.05),
        ],
        session=session,
    )


def write_session(root: Path, reports: dict[str, dict], session=SESSION) -> Path:
    """<root>/scan/lidar/cloud.json and <root>/scan.processed/lidar/<name>.json."""
    (root / "scan" / "lidar").mkdir(parents=True)
    (root / "scan" / "lidar" / "cloud.json").write_text(
        json.dumps({"schema": "orchados.lidar_cloud/1", "session_id": session,
                    "gps_time_start_ns": START_NS})
    )  # fmt: skip
    out = root / "scan.processed" / "lidar"
    out.mkdir(parents=True)
    for name, body in reports.items():
        (out / name).write_text(json.dumps(body))
    # Not a report: left alone.
    (out / "trees_used.json").write_text(json.dumps({"trees": []}))
    return out


# --- unit ----------------------------------------------------------------------------------


def test_reads_reports_with_extra_fields_and_skips_other_json(tmp_path):
    out = write_session(tmp_path, {"crown.json": crown(), "skeleton.json": skeleton()})
    reports = load_reports(out)
    assert [p.name for p, _ in reports] == ["crown.json", "skeleton.json"]
    assert reports[0][1].producer.params_hash == "crown-hash"


def test_payload_items(tmp_path):
    out = write_session(tmp_path, {"crown.json": crown(), "skeleton.json": skeleton()})
    payload = build_payload(load_reports(out), SESSION, scan_start(out, SESSION))
    assert payload["measured_at"] == gps_ns_to_iso(START_NS)
    items = payload["items"]
    assert len(items) == 8
    assert items[0] == {
        "tree_id": T1,
        "slot_code": "S1-1",
        "metric": "tree_height",
        "value_numeric": 3.2,
        "unit": "m",
        "uncertainty": 0.05,
        "confidence": 0.9,
        "method": "lidar_crown",
        "method_version": "0.1.0",
        "params_hash": "crown-hash",
    }
    assert items[3]["value_category"] == "productive" and "value_numeric" not in items[3]
    # Not measured: no value at all; the database lists it as skipped.
    assert not {"value_numeric", "value_category"} & items[4].keys()
    assert {i["params_hash"] for i in items[5:]} == {"skeleton-hash"}
    assert check_payload(payload) == []


def test_no_cloud_json_leaves_measured_at_to_the_database(tmp_path):
    out = tmp_path / "elsewhere"
    out.mkdir()
    (out / "crown.json").write_text(json.dumps(crown()))
    assert scan_start(out, SESSION) is None
    assert "measured_at" not in build_payload(load_reports(out), SESSION)


def test_report_of_another_session_is_refused(tmp_path):
    other = "22222222-2222-4222-8222-222222222222"
    pruning = report(
        "pruning",
        "lidar_pruning",
        [measurement(T1, "pruning_status", "lidar_pruning", category="done")],
        session=other,
    )
    out = write_session(tmp_path, {"crown.json": crown(), "pruning.json": pruning})
    with pytest.raises(LidarUploadError, match="pruning.json is for session .*after pruning"):
        build_payload(load_reports(out), SESSION)


def test_folder_without_reports(tmp_path):
    with pytest.raises(LidarUploadError, match="no LiDAR reports"):
        load_reports(tmp_path)


def test_check_payload_finds_what_the_database_refuses():
    def item(**kw):
        base = {"tree_id": T1, "metric": "tree_height", "value_numeric": 3.0, "uncertainty": 0.1,
                "method": "lidar_crown", "method_version": "0.1.0"}  # fmt: skip
        return {**base, **kw}

    payload = {
        "items": [
            item(),
            item(value_numeric=None),  # not measured: fine
            item(uncertainty=None),
            item(value_numeric=float("nan")),
            item(metric="wood_volume"),  # a skeleton metric under lidar_crown
            item(method="lidar_magic"),
            item(metric="size_class", value_numeric=None, value_category="giant"),
            item(metric="size_class", value_numeric=None, value_category="old"),
            item(tree_id="T7"),
        ]
    }
    problems = check_payload(payload)
    assert len(problems) == 6, problems
    assert "needs an uncertainty" in problems[0]
    assert "finite number" in problems[1]
    assert "not a metric of LiDAR method lidar_crown" in problems[2]
    assert "lidar_magic" in problems[3]
    assert "expects one of" in problems[4]
    assert "not a database id" in problems[5]


def test_dry_run_prints_the_payload_and_signs_in_nowhere(tmp_path, capsys, monkeypatch):
    from orchados_pipeline.supabase import SupabaseClient

    def no_sign_in(*_a, **_k):
        raise AssertionError("dry run signed in")

    monkeypatch.setattr(SupabaseClient, "sign_in", no_sign_in)
    out = write_session(tmp_path, {"crown.json": crown()})
    assert lidar_upload.run(out, SESSION, dry_run=True, env={}) == 0
    text = capsys.readouterr().out
    body = json.loads(text[: text.rindex("}") + 1])
    assert body["p_session_id"] == SESSION and len(body["p_payload"]["items"]) == 5
    assert "nothing written" in text


def test_run_stops_on_problems_before_signing_in(tmp_path, capsys):
    bad = crown()
    bad["measurements"][0]["uncertainty"] = None
    out = write_session(tmp_path, {"crown.json": bad})
    # Empty env: signing in would fail with "missing environment variables".
    assert lidar_upload.run(out, SESSION, env={}) == 1
    assert "needs an uncertainty" in capsys.readouterr().err


def test_summary_lines():
    lines = summary_lines(
        {"created": 3, "existing": 1, "skipped": [{"tree_id": T2, "metric": "tree_height"}]}
    )
    assert lines[0] == "LiDAR measurements: 3 created, 1 already recorded"
    assert lines[2] == f"  {T2} tree_height"


# --- local Supabase ------------------------------------------------------------------------


@pytest.mark.supabase
def test_records_against_local_supabase(supabase_env, test_sessions, tmp_path, capsys):
    from supabase_util import ORG, client, creds

    ops = client(supabase_env, "ops")
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
                "status": "captured",
                "started_at": "2026-11-20T08:00:00Z",
            }
        ],
    )
    out = write_session(
        tmp_path / "a",
        {"crown.json": crown(session_id), "skeleton.json": skeleton(session_id)},
        session=session_id,
    )

    # Only ops writes algorithm results.
    assert lidar_upload.run(out, session_id, env=creds(supabase_env, "expert")) == 1
    assert "forbidden" in capsys.readouterr().err

    assert lidar_upload.run(out, session_id, env=creds(supabase_env)) == 0
    text = capsys.readouterr().out
    assert "7 created, 0 already recorded" in text
    assert "1 not measured" in text and T2 in text

    rows = ops.select(
        "measurement",
        {
            "session_id": f"eq.{session_id}",
            "select": "tree_id,value_numeric,value_category,unit,uncertainty,source,method,"
            "method_version,params_hash,measured_at,metric_definition(code)",
        },
    )
    by_code = {r["metric_definition"]["code"]: r for r in rows}
    assert sorted(by_code) == sorted(
        ["tree_height", "crown_diameter", "crown_volume", "size_class",
         "scaffold_branch_count", "wood_volume", "fractal_dimension"]
    )  # fmt: skip
    h = by_code["tree_height"]
    assert (h["tree_id"], h["value_numeric"], h["unit"], h["source"]) == (T1, 3.2, "m", "algorithm")
    assert (h["method"], h["method_version"], h["params_hash"]) == (
        "lidar_crown",
        "0.1.0",
        "crown-hash",
    )
    assert datetime.fromisoformat(h["measured_at"]) == datetime.fromisoformat(
        gps_ns_to_iso(START_NS).replace("Z", "+00:00")
    )
    assert by_code["size_class"]["value_category"] == "productive"
    assert by_code["fractal_dimension"]["unit"] is None

    # Re-running adds nothing; a new crown version adds its rows and keeps the old ones.
    assert lidar_upload.run(out, session_id, env=creds(supabase_env)) == 0
    assert "0 created, 7 already recorded" in capsys.readouterr().out
    (out / "crown.json").write_text(json.dumps(crown(session_id, version="0.2.0")))
    assert lidar_upload.run(out, session_id, env=creds(supabase_env)) == 0
    assert "4 created, 3 already recorded" in capsys.readouterr().out
    rows = ops.select("measurement", {"session_id": f"eq.{session_id}", "select": "id"})
    assert len(rows) == 11
    ops.close()
