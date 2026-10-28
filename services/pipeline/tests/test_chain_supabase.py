"""End to end against the local Supabase stack: scan -> processing -> upload ->
expert decision -> publication -> the owner sees it; and the inventory's
boundary walk -> boundary version -> owner approval.

test_scan_to_owner, run in order (README, "Uçtan uca zincir testi"):

1. ops opens a periodic_scan session (planned) on the seed parcel;
2. synth fitted to the parcel's trees (rows 1-2, positions 1-5, from the
   database) -> run --trees-from-db -> upload --trees-from-db; the session is
   processed, every crop is bound to the database tree it was cut for, and the
   coverage summary is recorded (far below the threshold: an extra visit request);
3. the expert takes the session in review, saves a decision for every tree
   with crops (crops as evidence) and for the other active trees, and publishes;
4. the owner sees the visit's assessments in tree_latest_assessment and its
   assets, and a crop downloaded from its signed address has the uploaded hash;
5. before publication the owner sees the session row and nothing else.

test_boundary_walk_to_approval:

1. ops opens an inventory session; synth --boundary-walk fitted to the parcel;
   field staff send the phone's corner events to public.session_event;
2. run --trees-from-db --boundary: the corners become the parcel's next
   boundary version (source field_survey, the session, the largest corner
   uncertainty); the boundary command again adds no version;
3. field staff cannot approve it; the owner sees and approves it
   (approve_boundary).

The CLI is driven through main() with the ops credentials in the environment,
as at the processing station. The session is purged afterwards
(tests/supabase_util.py). Step timings are printed (pytest -s).
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from datetime import UTC, datetime

import httpx
import pytest
from conftest import fast_params
from supabase_util import ORG, PARCEL, client, creds

from orchados_pipeline.boundary import BoundarySurvey
from orchados_pipeline.cli import main
from orchados_pipeline.context import RunContext
from orchados_pipeline.media import media_key
from orchados_pipeline.models import CropSet, read_model
from orchados_pipeline.supabase import SupabaseError
from orchados_pipeline.trees_db import parcel_tree_list, slot_order

pytestmark = pytest.mark.supabase

ROWS, POSITIONS = (1, 2), (1, 5)
METHOD_VERSION = "chain-test"
CLASSES = ("healthy", "attention", "problem", "dead")


class Steps:
    def __init__(self):
        self.t0 = self.last = time.monotonic()

    def done(self, what: str) -> None:
        now = time.monotonic()
        print(f"[chain {now - self.t0:6.1f} s] {what} ({now - self.last:.1f} s)")
        self.last = now


def _owner_sees_nothing(owner, session_id: str, crop_key: str) -> None:
    assert owner.select("session", {"id": f"eq.{session_id}", "select": "id"}), "visit row"
    for table in ("capture", "asset", "assessment", "measurement"):
        rows = owner.select(table, {"session_id": f"eq.{session_id}", "select": "id"})
        assert rows == [], table
    latest = owner.select(
        "tree_latest_assessment", {"session_id": f"eq.{session_id}", "select": "id"}
    )
    assert latest == []
    with pytest.raises(SupabaseError):
        owner.storage_signed_url("media", crop_key)


def test_scan_to_owner(supabase_env, test_sessions, tmp_path, monkeypatch):
    steps = Steps()
    for k, v in creds(supabase_env, "ops").items():
        monkeypatch.setenv(k, v)
    ops, expert, owner = (client(supabase_env, who) for who in ("ops", "expert", "owner"))

    # 1. A planned periodic scan on the seed parcel.
    session_id = str(uuid.uuid4())
    test_sessions.append(session_id)
    start = datetime.now(UTC).replace(microsecond=0)
    ops.insert(
        "session",
        [
            {
                "id": session_id,
                "org_id": ORG,
                "parcel_id": PARCEL,
                "kind": "periodic_scan",
                "status": "planned",
                "planned_date": start.date().isoformat(),
                "started_at": start.isoformat(),
            }
        ],
    )
    steps.done("session planned")

    # 2. synth (fitted to the parcel) -> run --trees-from-db -> upload.
    session_dir = tmp_path / "session"
    params = tmp_path / "params.json"
    params.write_text(fast_params().model_dump_json(), encoding="utf-8")
    seed = str(uuid.UUID(session_id).int % 100_000)  # own background, own image hashes
    rows, positions = (f"{a}-{b}" for a, b in (ROWS, POSITIONS))
    synth = ["synth", str(session_dir), "--trees-from-db", "--parcel-id", PARCEL]
    synth += ["--session-id", session_id, "--rows", rows, "--positions", positions]
    assert main([*synth, "--start-utc", start.isoformat(), "--seed", seed]) == 0
    steps.done("synth fitted to rows 1-2, positions 1-5")

    assert main(["run", str(session_dir), "--trees-from-db", "--params", str(params)]) == 0
    run_dir = RunContext.create(session_dir, None, fast_params()).run_dir
    steps.done("run --trees-from-db")

    upload = ["upload", str(run_dir), "--session-id", session_id, "--trees-from-db"]
    assert main([*upload, "--station", "ci"]) == 0
    (row,) = ops.select("session", {"id": f"eq.{session_id}", "select": "status"})
    assert row["status"] == "processed"
    # The coverage summary is written too: rows 1-2, positions 1-5 of a 302-tree
    # parcel are far below the threshold, so the pipeline asks for an extra visit.
    (cov,) = ops.select(
        "coverage_report",
        {"session_id": f"eq.{session_id}", "select": "active_trees,covered_trees,passed"},
    )
    assert cov["active_trees"] > 300 and 0 < cov["covered_trees"] < 20 and not cov["passed"]
    (req,) = ops.select(
        "followup_request", {"source_session_id": f"eq.{session_id}", "select": "origin,kind"}
    )
    assert req == {"origin": "pipeline", "kind": "extra_visit"}
    steps.done("upload; session processed, coverage recorded")

    tlist = parcel_tree_list(ops, PARCEL)
    active = {t.tree_id: t.slot_code for t in tlist.trees}
    assert not tlist.unlocated_slots and len(active) > 300

    cset = read_model(CropSet, run_dir / "crops.json")
    assert (cset.status, cset.trees_source) == ("ok", "database")
    assert cset.crops and all(active[c.tree_id] == c.slot_code for c in cset.crops)
    chosen = {
        code
        for code in active.values()
        if ROWS[0] <= slot_order(code)[0] <= ROWS[1]
        and POSITIONS[0] <= slot_order(code)[1] <= POSITIONS[1]
    }
    sides = {(c.slot_code, c.direction) for c in cset.crops}
    assert {(code, d) for code in chosen for d in "NS"} <= sides  # both aisles of each row

    crops = ops.select(
        "asset",
        {
            "session_id": f"eq.{session_id}",
            "kind": "eq.tree_crop",
            "select": "id,tree_id,content_hash,pose",
        },
    )
    # Views of empty slots (presence check) are crops without a tree.
    crops = [a for a in crops if a["tree_id"] is not None]
    by_hash = {c.image.sha256: c for c in cset.crops}
    assert sorted(a["content_hash"] for a in crops) == sorted(by_hash)
    assert all(a["tree_id"] == by_hash[a["content_hash"]].tree_id for a in crops)
    crop_assets: dict[str, list[str]] = {}
    for a in crops:
        crop_assets.setdefault(a["tree_id"], []).append(a["id"])
    sample = crops[0]
    sample_key = media_key(ORG, PARCEL, sample["content_hash"])
    uploaded = ops.select("asset", {"session_id": f"eq.{session_id}", "select": "id,kind"})
    print(
        f"  {len(cset.crops)} crops of {len(crop_assets)} trees, "
        f"{len(uploaded)} asset rows; {len(active)} active trees on the parcel"
    )

    # 5. (before publication) The owner sees the visit, not its results.
    _owner_sees_nothing(owner, session_id, sample_key)

    # 3. Expert: review, decisions for every active tree, publication.
    expert.update("session", {"id": f"eq.{session_id}"}, {"status": "in_review"})
    (metric,) = expert.select("metric_definition", {"code": "eq.dead_branch_scale"})
    expected: dict[str, str] = {}
    for n, tree_id in enumerate(sorted(crop_assets)):
        cls = CLASSES[n % len(CLASSES)]
        expected[tree_id] = cls
        expert.rpc(
            "save_expert_assessment",
            {
                "p_session_id": session_id,
                "p_tree_id": tree_id,
                "p_overall_class": cls,
                "p_measurements": [
                    {
                        "metric_definition_id": metric["id"],
                        "value_scale": CLASSES.index(cls),
                        "uncertainty": 0.5,
                    }
                ],
                "p_evidence_asset_ids": crop_assets[tree_id],
                "p_method_version": METHOD_VERSION,
                "p_notes": None,
            },
        )
    steps.done(f"expert: in_review, {len(crop_assets)} trees with crops assessed")

    with pytest.raises(SupabaseError, match="no expert assessment"):
        expert.rpc("publish_session", {"p_session_id": session_id})

    rest = [t for t in active if t not in expected]
    for tree_id in rest:
        expected[tree_id] = "healthy"
        expert.rpc(
            "save_expert_assessment",
            {
                "p_session_id": session_id,
                "p_tree_id": tree_id,
                "p_overall_class": "healthy",
                "p_measurements": [],
                "p_evidence_asset_ids": [],
                "p_method_version": METHOD_VERSION,
                "p_notes": "Kesit yok; tarama bu sırayı kapsamadı.",
            },
        )
    steps.done(f"expert: {len(rest)} other active trees assessed")

    _owner_sees_nothing(owner, session_id, sample_key)

    published = expert.rpc("publish_session", {"p_session_id": session_id})
    assert published["status"] == "published" and published["published_by"] == expert.user_id
    steps.done("publish_session")

    # 4. The owner sees the published visit.
    latest = owner.select(
        "tree_latest_assessment",
        {"parcel_id": f"eq.{PARCEL}", "select": "tree_id,session_id,source,overall_class"},
    )
    mine = {r["tree_id"]: r for r in latest if r["session_id"] == session_id}
    assert set(mine) == set(active)  # the newest visit for every active tree
    assert {t: r["overall_class"] for t, r in mine.items()} == expected
    assert {r["source"] for r in mine.values()} == {"expert"}

    seen = owner.select("asset", {"session_id": f"eq.{session_id}", "select": "id,kind"})
    # T23 (kararlar.md H05): the owner reads panoramas, crops and photos; the
    # trajectory (the crew's GNSS track) and point clouds are staff only.
    owner_kinds = {"panorama", "tree_crop", "photo"}
    assert len(seen) == sum(a["kind"] in owner_kinds for a in uploaded)
    assert {a["kind"] for a in seen} <= owner_kinds
    assert sum(a["kind"] == "tree_crop" for a in seen) == len(crops)
    evidence = owner.select(
        "measurement_evidence",
        {
            "asset_id": "in.(" + ",".join(a["id"] for a in crops) + ")",
            "select": "asset_id,measurement_id",
            "order": "measurement_id,asset_id",
        },
    )
    assert {e["asset_id"] for e in evidence} == {a["id"] for a in crops}

    url = owner.storage_signed_url("media", sample_key)
    data = httpx.get(url, timeout=60).raise_for_status().content
    local = (run_dir / by_hash[sample["content_hash"]].image.path).read_bytes()
    assert hashlib.sha256(data).hexdigest() == sample["content_hash"]
    assert hashlib.sha256(local).hexdigest() == sample["content_hash"]
    steps.done("owner: assessments, assets and a crop from its signed address")

    for c in (ops, expert, owner):
        c.close()
    print("  " + json.dumps({"session_id": session_id, "trees": len(active)}))


def test_boundary_walk_to_approval(supabase_env, test_sessions, tmp_path, monkeypatch):
    steps = Steps()
    for k, v in creds(supabase_env, "ops").items():
        monkeypatch.setenv(k, v)
    ops, field, owner = (client(supabase_env, who) for who in ("ops", "field", "owner"))

    # 1. Inventory session, boundary walk, the phone's events in the database.
    session_id = str(uuid.uuid4())
    test_sessions.append(session_id)
    start = datetime.now(UTC).replace(microsecond=0)
    ops.insert(
        "session",
        [
            {
                "id": session_id,
                "org_id": ORG,
                "parcel_id": PARCEL,
                "kind": "inventory",
                "status": "planned",
                "planned_date": start.date().isoformat(),
                "started_at": start.isoformat(),
            }
        ],
    )
    session_dir = tmp_path / "session"
    params = tmp_path / "params.json"
    params.write_text(fast_params().model_dump_json(), encoding="utf-8")
    seed = str(uuid.UUID(session_id).int % 100_000)
    synth = ["synth", str(session_dir), "--trees-from-db", "--parcel-id", PARCEL]
    synth += ["--session-id", session_id, "--rows", "1-1", "--positions", "1-3"]
    synth += ["--boundary-walk", "--start-utc", start.isoformat(), "--seed", seed]
    assert main(synth) == 0
    truth = json.loads((session_dir / "synthetic_truth.json").read_text(encoding="utf-8"))
    phone = json.loads((session_dir / "phone_events.json").read_text(encoding="utf-8"))
    field.insert(
        "session_event",
        [{**ev, "org_id": ORG, "parcel_id": PARCEL, "session_id": session_id} for ev in phone],
    )
    before = ops.select("boundary", {"parcel_id": f"eq.{PARCEL}", "select": "id,version"})
    steps.done(f"inventory session, boundary walk, {len(phone)} session events")

    # 2. run + boundary stage: the next boundary version.
    run = ["run", str(session_dir), "--trees-from-db", "--boundary", "--params", str(params)]
    assert main(run) == 0
    run_dir = RunContext.create(session_dir, None, fast_params()).run_dir
    survey = read_model(BoundarySurvey, run_dir / "boundary.json")
    assert [c.corner_no for c in survey.corners] == [
        c["corner_no"] for c in truth["boundary_corners"]
    ]
    assert {c.source for c in survey.corners} == {"phone", "logger"}  # no base data: no PPK
    assert survey.area_m2 == pytest.approx(truth["boundary_area_m2"], rel=1e-3)
    rec = survey.record
    assert rec is not None and rec.created
    assert rec.version == max(b["version"] for b in before) + 1
    (row,) = ops.select(
        "boundary",
        {
            "id": f"eq.{rec.boundary_id}",
            "select": "source,session_id,vertex_uncertainty_m,surveyed_at,area_m2,"
            "owner_approved_at,geom",
        },
    )
    assert (row["source"], row["session_id"]) == ("field_survey", session_id)
    assert row["vertex_uncertainty_m"] == pytest.approx(survey.vertex_uncertainty_m)
    assert datetime.fromisoformat(row["surveyed_at"]) == datetime.fromisoformat(
        survey.surveyed_at.replace("Z", "+00:00")
    )
    assert row["area_m2"] == pytest.approx(survey.area_m2, rel=1e-3)
    assert row["owner_approved_at"] is None
    assert row["geom"]["coordinates"][0][:-1] == survey.ring()
    steps.done(f"run --boundary: version {rec.version}, {survey.area_m2:.0f} m2")

    # Same corners again: no new version.
    assert main(["boundary", str(session_dir), "--params", str(params)]) == 0
    again = read_model(BoundarySurvey, run_dir / "boundary.json")
    assert again.record is not None and not again.record.created
    assert again.record.boundary_id == rec.boundary_id
    after = ops.select("boundary", {"parcel_id": f"eq.{PARCEL}", "select": "id"})
    assert len(after) == len(before) + 1
    steps.done("boundary again: no new version")

    # 3. Owner approval.
    with pytest.raises(SupabaseError):
        field.rpc("approve_boundary", {"p_boundary_id": rec.boundary_id})
    (seen,) = owner.select(
        "boundary", {"id": f"eq.{rec.boundary_id}", "select": "id,version,source"}
    )
    assert seen["version"] == rec.version
    approved = owner.rpc("approve_boundary", {"p_boundary_id": rec.boundary_id})
    assert approved["owner_approved_by"] == owner.user_id
    assert approved["owner_approved_at"] is not None
    steps.done("owner approved the boundary")

    for c in (ops, field, owner):
        c.close()
