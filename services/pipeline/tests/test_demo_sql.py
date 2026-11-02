"""SQL emission of the demo dataset: conflict targets, order, personas, row builders."""

from __future__ import annotations

import re

import pytest

from orchados_pipeline.demo import build as demo_build
from orchados_pipeline.demo import dataset, ids, sqlgen
from orchados_pipeline.demo.loader import insert_counts


@pytest.fixture(scope="module")
def generated():
    root, manifest = demo_build.build("test", log=lambda _m: None)  # reuses the cache
    ds = dataset.load()
    script = sqlgen.generate(ds, root, manifest, sqlgen.FALLBACK_METRICS)
    return ds, manifest, script, script.sql()


def _inserts(sql: str) -> list[str]:
    return re.findall(r"^insert into [^\n]+", sql, flags=re.M)


def test_every_insert_names_its_conflict_target(generated):
    _ds, _m, script, sql = generated
    statements = re.findall(r"^insert into .*?;$", sql, flags=re.M | re.S)
    assert statements and len(statements) == len(
        _inserts(sql)
    )  # the registry insert is inside DO, indented
    for st in statements:
        assert re.search(r"\non conflict \([a-z_, ]+\) do nothing;$", st), st[:120]
    assert "on conflict (org_id) do nothing" in sql
    assert " do update" not in sql


def test_steps_in_order(generated):
    _ds, _m, _script, sql = generated
    marks = re.findall(r"^-- step: (\w+)", sql, flags=re.M)
    assert marks == list(sqlgen.STEPS)
    pos = {s: sql.index(f"-- step: {s}") for s in sqlgen.STEPS}

    def step_of(table: str) -> str:
        i = sql.index(f"insert into {table} ")
        return max((p, s) for s, p in pos.items() if p < i)[1]

    assert step_of("auth.users") == "personas" and step_of("public.org") == "personas"
    assert step_of("public.calibration") == "acquisition"
    assert step_of("public.parcel") == "parcels" and step_of("public.session") == "sessions"
    assert step_of("public.tree") == "layout" and step_of("public.boundary") == "layout"
    assert step_of("public.asset") == "chain" and step_of("public.trunk_label") == "chain"
    assert step_of("public.finding") == "results" and step_of("public.measurement") == "results"
    assert (
        step_of("public.parcel_access") == "access" and step_of("private.owner_profile") == "access"
    )
    assert step_of("public.question") == "questions"
    # Findings before any parcel_access: finding_notify_critical finds no recipient.
    assert sql.index("insert into public.finding ") < sql.index("insert into public.parcel_access ")
    assert sql.index("private.demo_org") > sql.index("insert into public.question_reply ")


def test_no_delete_or_update_of_domain_rows(generated):
    _ds, _m, _script, sql = generated
    assert not re.search(r"^\s*(delete|update|truncate)\b", sql, flags=re.M | re.I)
    assert "status = 'published'" not in sql  # sessions are inserted published, never updated


def test_personas_have_empty_tokens_and_a_finite_ban(generated):
    _ds, _m, script, _sql = generated
    users = next(st for st in script.steps["personas"] if st.table == "auth.users")
    assert len(users.rows) == len(ids.PERSONAS)
    for row in users.rows:
        r = dict(zip(users.columns, row, strict=True))
        for c in sqlgen.TOKEN_COLUMNS:
            assert r[c] == "", c
        assert r["encrypted_password"] == "" and r["phone"] is None and r["email_confirmed_at"]
        assert (
            r["raw_app_meta_data"]["demo_persona"] is True and "demo" not in r["raw_app_meta_data"]
        )
        assert "2999-01-01" in r["banned_until"] and "infinity" not in r["banned_until"]
        assert r["email"].endswith("@demo.orchados.invalid")


def _rows(script, step: str, table: str) -> list[dict]:
    return [
        dict(zip(st.columns, r, strict=True))
        for st in script.steps[step]
        if st.table == table
        for r in st.rows
    ]


def test_no_viewer_invitation_and_billing_only_switches_services_on(generated):
    _ds, _m, script, sql = generated
    assert "viewer_invitation" not in sql
    assert "message_outbox" not in sql and "public.notification" not in sql
    (setting,) = _rows(script, "services", "public.org_billing_setting")
    assert setting["org_id"] == ids.ORG_ID and setting["services_enabled"] is True
    assert setting["accepts_signups"] is False and setting["allow_fake_payments"] is False
    assert sql.count("insert into public.org_billing_setting ") == 1


def test_service_layer_rows(generated):
    """docs/MVP.md Module 6: catalogue row, a done job of parcel B, robot notes."""
    _ds, manifest, script, sql = generated
    (st,) = _rows(script, "services", "public.service_type")
    assert st["org_id"] == ids.ORG_ID and st["code"] == "weed_mowing"
    assert st["id"] == ids.did("service_type", "weed_mowing", version=2)
    # Unpriced: no price column, no price list (prices live in price_list_service_item).
    assert not {
        "price_per_donum_kurus",
        "minimum_fee_kurus",
        "vat_rate_bp",
        "price_is_draft",
    } & set(st)
    assert "insert into public.price_list" not in sql
    # The season per fruit species, for every species in the lookup.
    services = sql[sql.index("-- step: services") : sql.index("-- step: access")]
    season = services[services.index("insert into public.service_type_season") :]
    assert "from public.fruit_species f" in season and f"'{st['id']}'" in season
    assert "f.code, 3, 1, 6, 30," in season
    assert (st["season_start_month"], st["season_start_day"]) == (3, 1)
    assert (st["season_end_month"], st["season_end_day"]) == (6, 30)
    assert st["recommend_from_weed_height"] == "medium" and st["observation_max_age_days"] == 60

    (job,) = dataset.SERVICE_JOBS
    (req,) = _rows(script, "services", "public.service_request")
    assert req["parcel_id"] == ids.PARCEL_B and req["status"] == "done"
    assert re.fullmatch(r"H-2026-\d{6}", req["number"])
    assert req["terms_version"] == "bakim-v2-taslak" and req["pricing_rule"] == "service-v1"
    assert req["id"] == ids.B_MOWING_2026_REQUEST
    # Unpriced at the request: the eight price and estimate columns all null.
    for c in (
        "price_list_id",
        "price_list_version",
        "price_per_donum_kurus",
        "minimum_fee_kurus",
        "vat_rate_bp",
        "estimate_subtotal_kurus",
        "estimate_vat_kurus",
        "estimate_total_kurus",
    ):
        assert req[c] is None, c
    assert req["quote_total_kurus"] == job.quote_total_kurus == 300000
    assert req["payment_amount_kurus"] == req["quote_total_kurus"]
    assert req["payment_received_on"] >= req["completed_on"] == req["scheduled_date"]
    assert "public.boundary" in req["area_m2"] and req["area_source"] == "boundary"
    assert req["session_id"] == job.id and req["operation_id"] == job.operation_id
    assert job.scheduled_date < job.completed_on or job.scheduled_date == job.completed_on
    assert job.completed_on < dataset.TODAY.date().isoformat()

    events = _rows(script, "services", "public.service_request_event")
    assert [(e["from_status"], e["to_status"]) for e in events] == [
        (None, "requested"),
        ("requested", "scheduled"),
        ("scheduled", "done"),
    ]
    assert [e["created_at"] for e in events] == sorted(e["created_at"] for e in events)

    (op,) = _rows(script, "services", "public.operation")
    assert (op["kind"], op["performer"], op["session_id"]) == ("mowing", "crew", job.id)
    assert op["details"] == {
        "service_request_id": job.request_id,
        "service_request_number": req["number"],
        "service_code": "weed_mowing",
        "by": "orchados",
    }

    sessions = _rows(script, "sessions", "public.session")
    (mow,) = [s for s in sessions if s["kind"] == "mowing"]
    assert mow["id"] == job.id and mow["status"] == "captured"
    assert mow["published_at"] is None and mow["published_by"] is None

    assets = {a["id"]: a for a in _rows(script, "services", "public.asset")}
    links = _rows(script, "services", "public.service_request_photo")
    assert {lk["phase"] for lk in links} == {"before", "after"}
    files = {f["sha256"]: f for f in manifest["files"]}
    for lk in links:
        a = assets[lk["asset_id"]]
        assert a["kind"] == "photo" and a["session_id"] == job.id and a["tree_id"] is None
        assert (
            a["uri"]
            == f"storage://media/org/{ids.ORG_ID}/parcel/{ids.PARCEL_B}/" + a["content_hash"]
        )
        assert files[a["content_hash"]]["kind"] == "service_photo"
        assert (a["pipeline"], a["pipeline_version"]) == ("service-proof", "v1")
    assert {p["sha256"] for p in manifest["service_photos"]} == {
        a["content_hash"] for a in assets.values()
    }

    notes = _rows(script, "services", "public.parcel_robot_note")
    assert {(n["parcel_id"], n["slope"], n["stoniness"], n["lowest_branch_cm"]) for n in notes} == {
        (ids.PARCEL_A, "flat", "low", 60),
        (ids.PARCEL_B, "gentle", "medium", 45),
    }
    # Children after their parents within the step.
    order = [
        "public.org_billing_setting",
        "public.service_type",
        "public.asset",
        "public.operation",
        "public.service_request ",
        "public.service_request_event",
        "public.service_request_photo",
    ]
    pos = [services.index(f"insert into {t}") for t in order]
    assert pos == sorted(pos)


def test_weed_question_is_a_parcel_staff_answer(generated):
    _ds, _m, script, _sql = generated
    weed = sqlgen.FALLBACK_METRICS["weed_height"].id
    rows = [
        r
        for r in _rows(script, "results", "public.measurement")
        if r["metric_definition_id"] == weed
    ]
    by_session = {r["session_id"]: r for r in rows}
    assert set(by_session) == {ids.A_SCAN_2026, ids.B_SCAN_2026}
    a = by_session[ids.A_SCAN_2026]
    assert a["value_category"] == "tall" and a["tree_id"] is None
    assert (a["method"], a["method_version"], a["source"]) == (
        "field_question",
        "summer-v0.3",
        "staff",
    )
    assert by_session[ids.B_SCAN_2026]["value_category"] == "short"


def test_weed_question_needs_the_metric(generated):
    ds, manifest, _script, _sql = generated
    metrics = {k: v for k, v in sqlgen.FALLBACK_METRICS.items() if k != "weed_height"}
    root = demo_build.build_dir(demo_build.DEFAULT_ROOT, "test")
    with pytest.raises(ValueError, match="weed_height"):
        sqlgen.generate(ds, root, manifest, metrics)


def test_crop_poses_follow_the_interface(generated):
    """docs/arayuzler.md, "Asset pose alanı"; rows built by upload.py."""
    _ds, _m, script, _sql = generated
    assets = [st for st in script.steps["chain"] if st.table == "public.asset"]
    rows = [dict(zip(st.columns, r, strict=True)) for st in assets for r in st.rows]
    crops = [r for r in rows if r["kind"] == "tree_crop"]
    panos = [r for r in rows if r["kind"] == "panorama"]
    assert crops and panos
    pano_ids = {r["id"] for r in panos}
    for r in crops:
        p = r["pose"]
        assert set(p) == {
            "direction",
            "slot_code",
            "panorama_asset_id",
            "distance_m",
            "azimuth_deg",
            "yaw_in_panorama_deg",
            "pitch_deg",
            "fov_deg",
            "score",
        }
        assert p["direction"] in "NESW" and p["panorama_asset_id"] in pano_ids
        assert all(
            isinstance(p[k], float)
            for k in ("distance_m", "azimuth_deg", "pitch_deg", "fov_deg", "score")
        )
        assert r["tree_id"] and r["uri"].startswith(f"storage://media/org/{ids.ORG_ID}/parcel/")
        assert (
            r["pipeline"] == "orchados-demo"
            and r["pipeline_version"] == "1"
            and r["mime_type"] == "image/jpeg"
        )
    for r in panos:
        p = r["pose"]
        assert p["variant"] in ("full", "preview") and isinstance(p["gps_time_ns"], str)
        assert isinstance(p["width_px"], int) and p["quality"] == "fix"
        assert r["mime_type"] == "image/webp"
    by_session = {}
    for r in panos:
        by_session.setdefault(r["session_id"], []).append(r["pose"]["variant"])
    assert set(by_session[ids.A_SCAN_2026]) == {"full", "preview"}
    assert set(by_session[ids.A_SCAN_2025]) == {"preview"}


def test_captures_and_closeups(generated):
    ds, manifest, script, _sql = generated
    caps = [
        dict(zip(st.columns, r, strict=True))
        for st in script.steps["chain"]
        if st.table == "public.capture"
        for r in st.rows
    ]
    raw = [c for c in caps if c["kind"] in ("video_360", "gnss_raw")]
    assert raw and all(
        re.match(r"^station://orchados-demo/synthetic/[0-9a-f-]{36}/", c["uri"]) for c in raw
    )
    photos = [c for c in caps if c["kind"] == "photo"]
    featured = ds.tree("A", "S3-6").id
    assert sum(c["tree_id"] == featured for c in photos) >= 2
    assert {c["content_hash"] for c in photos} == {c["sha256"] for c in manifest["closeups"]}


def test_measurements_are_in_season_and_versioned(generated):
    _ds, _m, script, _sql = generated
    rows = [
        dict(zip(st.columns, r, strict=True))
        for st in script.steps["results"]
        if st.table == "public.measurement"
        for r in st.rows
    ]
    by_id = {m.id: m for m in sqlgen.FALLBACK_METRICS.values()}
    for r in rows:
        m = by_id[r["metric_definition_id"]]
        assert "summer" in m.valid_seasons
        if m.code == "weed_height":
            assert r["method_version"] == dataset.FIELD_PROTOCOL["summer"]
            continue
        assert r["method_version"] in (dataset.METHODOLOGY, dataset.PRODUCER_VERSION)
        if r["source"] == "algorithm":
            assert r["method"] == "orchados-demo" and m.code == "tree_visible"


def test_out_of_season_code_is_refused(generated):
    ds, manifest, _script, _sql = generated
    metrics = dict(sqlgen.FALLBACK_METRICS)
    fruit = metrics["fruit_load_scale"]
    metrics["fruit_load_scale"] = sqlgen.Metric(
        fruit.id, fruit.code, fruit.value_type, ("harvest",), "shown", ("tree",)
    )
    root = demo_build.build_dir(demo_build.DEFAULT_ROOT, "test")
    with pytest.raises(ValueError, match="fruit_load_scale"):
        sqlgen.generate(ds, root, manifest, metrics)


def test_insert_counts_parse():
    out = (
        "@insert public.tree\nINSERT 0 3\n@insert public.slot\nINSERT 0 0\nSET\n"
        "@insert public.tree\nINSERT 0 2\n"
    )
    assert insert_counts(out) == {"public.tree": 5, "public.slot": 0}


def test_no_phone_numbers_or_real_addresses_in_the_sql(generated):
    _ds, _m, _script, sql = generated
    text = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64}", "", sql
    )
    assert not re.search(r"\+\d{8,15}|\b0?5\d{2}[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b", text)
    emails = set(re.findall(r"[\w.+-]+@[\w.-]+", text))
    assert emails and all(e.endswith("@demo.orchados.invalid") for e in emails)


def test_parcels_are_pistachio(generated):
    _ds, _m, script, _sql = generated
    parcels = _rows(script, "parcels", "public.parcel")
    assert {p["id"]: p["species"] for p in parcels} == {
        ids.PARCEL_A: "antep_fistigi",
        ids.PARCEL_B: "antep_fistigi",
    }


def test_service_rows_carry_version_2_ids(generated):
    """Rows added by dataset version 2 derive their ids with v2; version 1 rows keep v1."""
    _ds, _m, script, _sql = generated
    (job,) = dataset.SERVICE_JOBS
    (op,) = _rows(script, "services", "public.operation")
    assert op["id"] == ids.did("operation", job.key, version=2)
    events = _rows(script, "services", "public.service_request_event")
    assert [e["id"] for e in events] == [
        ids.did("service_request_event", f"{job.key}:{n}", version=2) for n in range(3)
    ]
    for a in _rows(script, "services", "public.asset"):
        assert a["id"] in {ids.did("asset", p.key(job), version=2) for p in job.photos}
