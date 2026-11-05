"""Demo dataset invariants (docs/demo-turu.md §8): ids, people, seasons, structure."""

from __future__ import annotations

import json
import re
import uuid
from collections import Counter

import numpy as np
import pytest

from orchados_pipeline.demo import dataset, ids, sqlgen
from orchados_pipeline.demo.dataset import CLASSES_BY_SCAN, TODAY

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
# E.164 numbers and Turkish mobile numbers written the usual ways.
PHONE = re.compile(r"\+\d{8,15}|\b0?5\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b")


@pytest.fixture(scope="module")
def ds():
    return dataset.load()


def test_fixed_ids_and_tour(ds):
    assert ids.ORG_ID == "de000000-0000-4000-8000-000000000001"
    assert [p.id for p in dataset.PARCELS] == [ids.PARCEL_A, ids.PARCEL_B]
    assert {v.key: v.id for v in ds.visits if not v.key.endswith(("VER25", "VER26"))} == {
        "A-INV25": "de200000-0000-4000-8000-000000000001",
        "A-SCN25": "de200000-0000-4000-8000-000000000002",
        "A-SCN26": "de200000-0000-4000-8000-000000000003",
        "B-INV26": "de200000-0000-4000-8000-000000000004",
        "B-SCN26": "de200000-0000-4000-8000-000000000005",
    }
    tour = ds.tour()
    assert tour["tree_id"] == ds.tree("A", "S3-6").id
    assert tour["session_id"] == ids.A_SCAN_2026 and tour["previous_session_id"] == ids.A_SCAN_2025
    assert tour["inventory_session_id"] == ids.A_INVENTORY and tour["parcel_id"] == ids.PARCEL_A
    # Version 2: B's mowing job (session, request).
    assert ids.B_MOWING_2026 == "de200000-0000-4000-8000-000000000006"
    assert ids.B_MOWING_2026_REQUEST == "de300000-0000-4000-8000-000000000001"
    assert tour["service_request_id"] == ids.B_MOWING_2026_REQUEST


def test_derived_ids_use_the_namespace():
    assert ids.did("tree", "A:S3-6") == str(uuid.uuid5(ids.NAMESPACE, "v1:tree:A:S3-6"))
    assert ids.did("tree", "A:S3-6", version=2) != ids.did("tree", "A:S3-6")


def test_personas():
    for pid, _role, local, name in ids.PERSONAS:
        assert pid.startswith("de900000-")
        assert ids.persona_email(local).endswith("@demo.orchados.invalid")
        assert name.startswith("Örnek")


def test_names_and_no_phones(ds):
    names = [p.name for p in dataset.PARCELS] + [n for *_x, n in ids.PERSONAS]
    assert all(n.startswith("Örnek") for n in names)
    text = json.dumps(
        [f.__dict__ for f in ds.findings()] + [q.__dict__ for q in dataset.QUESTIONS],
        ensure_ascii=False,
    )
    assert not PHONE.search(UUID.sub("", text)), "phone-like number in the dataset"


def test_scans_a_year_apart_in_summer(ds):
    a25, a26 = ds.visit("A-SCN25"), ds.visit("A-SCN26")
    days = (a26.start - a25.start).days
    assert 300 <= days <= 430  # portal previousYearVisit window
    for v in ds.scans():
        assert v.start.month in (6, 7) and v.status == "published"
        assert v.published_at > v.end and v.published_at < TODAY
    for v in ds.visits:
        assert v.end < TODAY


def test_class_distribution(ds):
    c26 = Counter(ds.classes(ds.visit("A-SCN26")).values())
    c25 = Counter(ds.classes(ds.visit("A-SCN25")).values())
    assert len(ds.slots["A"]) == 72 and len(ds.trees["A"]) == 70
    assert 50 <= c26["healthy"] <= 56 and c26["attention"] == 9 and c26["problem"] == 5
    assert c26["dead"] == 1 and c26["absent"] == 1
    assert c25["healthy"] > c26["healthy"]
    assert ds.classes(ds.visit("A-SCN25"))["S3-6"] == "healthy"
    assert ds.classes(ds.visit("A-SCN26"))["S3-6"] == "problem"
    assert set(CLASSES_BY_SCAN) == {v.key for v in ds.scans()}
    assert [t.code for t in ds.trees["A"] if t.age_class == "sapling"] == ["S3-11"]


@pytest.mark.parametrize("parcel", ["A", "B"])
def test_tree_attributes(ds, parcel):
    trees = ds.trees[parcel]
    for t in trees:
        assert t.sex in ("female", "male") and t.graft in ("grafted", "ungrafted")
        assert t.age_class in ("sapling", "young", "productive", "old") and t.cultivar
        assert t.stem_form in ("single", "multi")
    females = sum(t.sex == "female" for t in trees)
    males = sum(t.sex == "male" for t in trees)
    assert 8 <= females / males <= 10
    assert any(t.graft == "ungrafted" for t in trees)


def test_fruit_load_alternate_bearing(ds):
    def mean(key):
        v = ds.visit(key)
        cls = ds.classes(v)
        vals = [
            dataset.tree_values(v, t, cls[t.code]).get("fruit_load_scale") for t in ds.trees["A"]
        ]
        return float(np.mean([x for x in vals if x is not None]))

    assert mean("A-SCN25") - mean("A-SCN26") >= 0.5


def test_no_out_of_season_metric(ds):
    m = sqlgen.FALLBACK_METRICS
    summer = set(sqlgen.portal_codes(m, "summer"))
    assert {"pest_sign_severity", "fruit_load_scale", "basal_sprout_level"} <= summer
    assert "pruning_status" not in summer and "harvest_complete" not in summer
    for v in ds.scans():
        cls = ds.classes(v)
        for t in ds.trees[v.parcel.key]:
            assert set(dataset.tree_values(v, t, cls[t.code])) <= summer
    for v in ds.visits:
        if v.kind == "inventory":
            assert set(dataset.INVENTORY_CODES) <= summer


def test_findings_and_questions(ds):
    a26 = ds.findings("A-SCN26")
    assert (
        10 <= len(a26) <= 14
        and 4 <= len(ds.findings("A-SCN25")) <= 6
        and len(ds.findings("B-SCN26")) == 3
    )
    for f in ds.findings():
        assert f.description and f.recommendation
        assert (f.tree is None) != (f.zone is None)
    assert {f.kind for f in a26} >= {
        "dead_branch",
        "trunk_damage",
        "pest_sign",
        "missing_tree",
        "irrigation_leak",
    }
    s36 = next(f for f in a26 if f.tree == "S3-6")
    assert 2 <= len(s36.closeups) <= 3
    assert {q.author for q in dataset.QUESTIONS} == {ids.OWNER, ids.VIEWER}
    assert sum(q.tree == "S3-6" for q in dataset.QUESTIONS) == 1
    assert sum(q.finding is not None for q in dataset.QUESTIONS) == 1


def test_versions_are_cumulative():
    """Version 2 adds the service layer, version 3 the robot, version 4 the 3D world;
    earlier rows keep their ids and seeds."""
    assert dataset.DATASET_VERSION == 4 and dataset.SEED_VERSION == 1
    assert dataset.SERVICES_VERSION == 2 and dataset.ROBOT_VERSION == 3
    assert dataset.WORLD_VERSION == 4
    assert sqlgen.SERVICE_TYPE_ID == ids.did("service_type", "weed_mowing", version=2)


def test_the_robot_does_the_mowing():
    """Owner decision of 2 November 2026: the service is presented as done by the
    autonomous robot MARABA-I and never names another method."""
    description = dataset.SERVICE_TYPE["description"]
    assert "otonom robotumuz MARABA-I" in description
    assert "tırpan" not in description.lower()
    assert dataset.ROBOT_MODEL_CODE == "maraba_i"
    for job in dataset.SERVICE_JOBS:
        assert job.performer == "robot" and job.robot_model_id == dataset.ROBOT_MODEL_ID


def test_service_catalogue_is_unpriced():
    """Prices live in the price list (price_list_service_item); the demo has none."""
    assert not {
        "price_per_donum_kurus",
        "minimum_fee_kurus",
        "vat_rate_bp",
        "price_is_draft",
    } & set(dataset.SERVICE_TYPE)
    assert dataset.SERVICE_SEASON == (3, 1, 6, 30)
    t = dataset.SERVICE_TYPE
    assert (t["season_start_month"], t["season_start_day"]) == dataset.SERVICE_SEASON[:2]
    assert (t["season_end_month"], t["season_end_day"]) == dataset.SERVICE_SEASON[2:]
    assert dataset.DEMO_SPECIES == "antep_fistigi"


def test_service_job_timeline(ds):
    """Requested in season after B's inventory, done before B's scan, paid after."""
    (job,) = dataset.SERVICE_JOBS
    inv, scan = ds.visit("B-INV26"), ds.visit("B-SCN26")
    t = dataset.SERVICE_TYPE
    day = job.requested_at.date()
    assert (t["season_start_month"], t["season_start_day"]) <= (day.month, day.day)
    assert (day.month, day.day) <= (t["season_end_month"], t["season_end_day"])
    assert inv.published_at < job.requested_at < job.scheduled_at < job.work_start < job.done_at
    assert job.done_at < scan.start
    assert job.scheduled_date == job.completed_on == job.work_start.date().isoformat()
    assert job.completed_on <= job.payment_on < TODAY.date().isoformat()
    # H37: within the withdrawal period only on the owner's early-performance request.
    assert job.early_performance or (job.work_start - job.requested_at).days >= 15
    assert all(job.work_start <= p.time <= job.done_at for p in job.photos)
    assert [p.phase for p in job.photos] == ["before", "after"]
    # Unpriced: ops entered the amount (3.000 TL, VAT included) when scheduling.
    assert job.quote_total_kurus == 300000
    assert (job.id, job.request_id) == (ids.B_MOWING_2026, ids.B_MOWING_2026_REQUEST)
    assert ds.tour()["service_request_id"] == ids.B_MOWING_2026_REQUEST
    assert dataset.WEED_HEIGHTS["B-SCN26"] == "short" and dataset.WEED_HEIGHTS["A-SCN26"] == "tall"
