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


def test_no_viewer_invitation_or_billing(generated):
    _ds, _m, _script, sql = generated
    assert "viewer_invitation" not in sql and "org_billing_setting" not in sql
    assert "message_outbox" not in sql and "public.notification" not in sql


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
