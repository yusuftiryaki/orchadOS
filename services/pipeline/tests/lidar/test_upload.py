"""lidar upload with a registration (spec 2026-11-18 §5.10, §5.11; docs/arayuzler.md
"Kaydın yüklenmesi").

Unit tests run the real upload against FakeClient, an in-memory stand-in for the
signed-in Supabase client (rpc, select, insert, storage) that keeps the database's
rules that matter here: record_lidar_registration is idempotent on run_id, the
measurements' "already exists" key includes registration_id, a rejected
registration takes no measurements. The supabase test records against the local
stack (pnpm db:start && pnpm db:reset), skipped when it is not reachable.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

import numpy as np
import pytest
from test_lidar_upload import PARCEL, START_NS, T1, crown, skeleton, write_world_cloud

from orchados_pipeline.gpstime import gps_ns_to_iso
from orchados_pipeline.hashing import sha256_file
from orchados_pipeline.lidar import upload as lidar_upload
from orchados_pipeline.lidar.cloud import write_ply
from orchados_pipeline.lidar.models import CloudMeta, RegistrationReport
from orchados_pipeline.lidar.upload import (
    REGISTRATION_PLACEHOLDER,
    REGISTRATION_RPC,
    RPC,
    LidarUploadError,
    plan_upload,
)
from orchados_pipeline.models import Producer
from orchados_pipeline.supabase import SupabaseClient, SupabaseError

SESSION = "11111111-1111-4111-8111-111111111111"
RUN_ID = "5f0c1a2b-0000-4000-8000-0000000000a1"
REG_START_NS = START_NS + 3_600_000_000_000  # the registered cloud starts an hour later
ENV = {k: "x" for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "ORCHADOS_EMAIL", "ORCHADOS_PASSWORD")}
STATUS_OF = {"accepted_auto": "accepted", "review": "pending_review", "rejected_auto": "rejected"}


def registration_report(session=SESSION, verdict="review", run_id=RUN_ID, ppk="ppk"):
    return RegistrationReport(
        producer=Producer(
            pipeline="orchados-pipeline", version="0.1.0", params_hash="reg-hash",
            stage="lidar_register",
        ),
        run_id=run_id,
        created_utc="2026-11-18T10:00:00.000000Z",
        session_id=session,
        parcel_id=PARCEL,
        method="fake+gtsam_ppk",
        method_version="0.1.0",
        params_hash="reg-hash",
        ppk_status=ppk,
        metrics={"lio_coverage": 0.97, "gnss_residual_p95_m": 0.04, "trunk_spread_p95_m": 0.2,
                 "trees_checked": 8},
        verdict=verdict,
        reasons=["few_trees_checked"] if verdict == "review" else [],
    )  # fmt: skip


def write_run(
    root: Path, verdict="review", session=SESSION, run_id=RUN_ID, results=True, ppk="ppk"
):
    """A registration run folder as `lidar process` leaves it: registration.json,
    cloud.json, crown.json, skeleton.json, world.owc + world.json."""
    run = root / "scan.processed" / "lidar" / "registration" / f"fake-0.1.0-reghash-{run_id[:8]}"
    run.mkdir(parents=True)
    rep = registration_report(session, verdict, run_id, ppk)
    (run / "registration.json").write_text(rep.model_dump_json(by_alias=True))
    meta = CloudMeta(
        session_id=session, parcel_id=PARCEL, origin_lat=37.0662, origin_lon=37.3833,
        origin_height_m=850.0, gps_time_start_ns=REG_START_NS, registration_method=rep.method,
        registration_version=rep.method_version, run_id=run_id,
    )  # fmt: skip
    (run / "cloud.json").write_text(meta.model_dump_json(by_alias=True))
    write_ply(
        run / "cloud.ply", np.arange(30, dtype=float).reshape(10, 3) + int(run_id[:8], 16) % 97
    )
    (run / "process.json").write_text(json.dumps({"steps": {}}))
    if results:
        (run / "crown.json").write_text(json.dumps({**crown(session), "run_id": run_id}))
        (run / "skeleton.json").write_text(json.dumps({**skeleton(session), "run_id": run_id}))
        write_world_cloud(run, session=session, run_id=run_id)
    return run


class FakeClient:
    """The signed-in client of lidar upload, in memory."""

    def __init__(self, session=SESSION, parcel=PARCEL):
        self.session = {"id": session, "org_id": "o", "parcel_id": parcel, "status": "processed"}
        self.calls: list[tuple] = []
        self.registrations: dict[str, dict] = {}  # run_id -> row
        self.measurements: list[tuple] = []
        self.assets: list[dict] = []
        self.objects: dict[str, bytes] = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None

    def reg_by_id(self, reg_id):
        return next((r for r in self.registrations.values() if r["id"] == reg_id), None)

    def rpc(self, fn, args):
        args = json.loads(json.dumps(args))  # what goes over the wire
        self.calls.append(("rpc", fn, args))
        p = args["p_payload"]
        if fn == REGISTRATION_RPC:
            assert args["p_session_id"] == self.session["id"] == p["session_id"]
            assert p["ppk_status"] in ("ppk", "no_ppk", "ppk_failed")
            if p["run_id"] not in self.registrations:
                self.registrations[p["run_id"]] = {
                    "id": str(uuid.uuid4()), "status": STATUS_OF[p["verdict"]], "payload": p,
                }  # fmt: skip
            return self.registrations[p["run_id"]]["id"]
        assert fn == RPC
        reg = p.get("registration_id")
        if reg is not None:
            row = self.reg_by_id(reg)
            if row is None:
                raise SupabaseError("invalid_input: not a registration of the session")
            if row["status"] == "rejected":
                raise SupabaseError("registration_rejected")
        out = {"created": 0, "existing": 0, "skipped": []}
        for item in p["items"]:
            if item.get("value_numeric") is None and item.get("value_category") is None:
                out["skipped"].append({"tree_id": item["tree_id"], "metric": item["metric"]})
                continue
            key = (item["tree_id"], item["metric"], item["method"], item["method_version"],
                   item["params_hash"], reg)  # fmt: skip
            if key in self.measurements:
                out["existing"] += 1
            else:
                self.measurements.append(key)
                out["created"] += 1
        return out

    def select(self, table, params):
        self.calls.append(("select", table))
        if table == "session":
            return [self.session] if params["id"] == f"eq.{self.session['id']}" else []
        if table == "asset":
            return [
                a
                for a in self.assets
                if f"eq.{a['session_id']}" == params["session_id"]
                and params.get("kind", f"eq.{a['kind']}") == f"eq.{a['kind']}"
            ]
        if table == "lidar_registration":
            row = self.reg_by_id(params["id"].removeprefix("eq."))
            return [{"status": row["status"]}] if row else []
        raise AssertionError(table)

    def insert(self, table, rows, returning="id"):
        assert table == "asset"
        rows = json.loads(json.dumps(rows))
        self.calls.append(("insert", table))
        out = []
        for r in rows:
            self.assets.append({**r, "id": str(uuid.uuid4())})
            out.append({"id": self.assets[-1]["id"]})
        return out

    def storage_list(self, bucket, prefix):
        return [k.removeprefix(prefix + "/") for k in self.objects if k.startswith(prefix + "/")]

    def storage_upload(self, bucket, key, path, media_type):
        self.objects[key] = Path(path).read_bytes()
        return True

    # What the upload did, in order.
    def rpcs(self):
        return [c[1] for c in self.calls if c[0] == "rpc"]

    def of_kind(self, kind):
        return [a for a in self.assets if a["kind"] == kind]


@pytest.fixture
def fake(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(SupabaseClient, "sign_in", classmethod(lambda cls, creds: client))
    return client


def no_sign_in(monkeypatch):
    def refuse(*_a, **_k):
        raise AssertionError("signed in")

    monkeypatch.setattr(SupabaseClient, "sign_in", refuse)


def json_blocks(text: str) -> list[dict]:
    """The JSON objects a dry run prints, in order."""
    dec, out, i = json.JSONDecoder(), [], 0
    while (i := text.find("{\n", i)) >= 0:
        body, end = dec.raw_decode(text, i)
        out.append(body)
        i = end
    return out


# --- unit ----------------------------------------------------------------------------------


def test_registration_first_then_measurements_and_world_with_its_id(tmp_path, fake, capsys):
    run = write_run(tmp_path)
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    assert fake.rpcs() == [REGISTRATION_RPC, RPC]
    (reg_call, meas_call) = [c for c in fake.calls if c[0] == "rpc"]
    assert reg_call[2]["p_payload"] == {
        "run_id": RUN_ID,
        "session_id": SESSION,
        "parcel_id": PARCEL,
        "method": "fake+gtsam_ppk",
        "method_version": "0.1.0",
        "params_hash": "reg-hash",
        "ppk_status": "ppk",
        "metrics": registration_report().metrics,
        "verdict": "review",
        "reasons": ["few_trees_checked"],
    }
    reg_id = fake.registrations[RUN_ID]["id"]
    payload = meas_call[2]["p_payload"]
    assert payload["registration_id"] == reg_id
    # measured_at: the start of the registered cloud (cloud.json of the run folder).
    assert payload["measured_at"] == gps_ns_to_iso(REG_START_NS)
    assert len(payload["items"]) == 9 and {i["tree_id"] for i in payload["items"]} >= {T1}
    # The world cloud after the measurements, naming the same registration.
    i_meas = fake.calls.index(meas_call)
    i_world = fake.calls.index(("insert", "asset"))
    assert i_world > i_meas
    assert [a["kind"] for a in fake.assets] == ["world_cloud", "point_cloud", "other"]
    asset = fake.assets[0]
    assert asset["pose"]["registration_id"] == reg_id
    # The registered cloud is kept: cloud.ply as a staff-only point_cloud asset, then its
    # cloud.json, both content addressed in the media bucket.
    ply, meta = fake.assets[1], fake.assets[2]
    assert ply["content_hash"] == sha256_file(run / "cloud.ply")
    assert ply["pose"] == {
        "schema": "orchados.lidar_cloud/1",
        "point_count": 10,
        "crs": "local_enu",
        "registration_id": reg_id,
        "origin": {"lat": 37.0662, "lon": 37.3833, "height_m": 850.0},
    }
    assert ply["position"] == "SRID=4326;POINT(37.3833 37.0662)"
    assert ply["position_uncertainty_m"] == 0.03 and ply["mime_type"] == "application/x-ply"
    assert (ply["pipeline"], ply["pipeline_version"], ply["params_hash"]) == (
        "orchados-pipeline", "0.1.0", "reg-hash",
    )  # fmt: skip
    assert "gps_time_ns" not in json.dumps(ply["pose"])
    assert meta["content_hash"] == sha256_file(run / "cloud.json")
    assert meta["mime_type"] == "application/json" and meta["position"] is None
    assert meta["pose"] == {"schema": "orchados.lidar_cloud/1", "registration_id": reg_id,
                            "role": "cloud_meta"}  # fmt: skip
    assert (
        fake.objects[ply["uri"].removeprefix("storage://media/")]
        == (run / "cloud.ply").read_bytes()
    )
    assert meta["uri"].removeprefix("storage://media/") in fake.objects
    out = capsys.readouterr().out
    assert f"LiDAR registration {reg_id}: run {RUN_ID[:8]}, review, pending_review" in out
    assert "8 created, 0 already recorded" in out and "world cloud: recorded" in out


def test_upload_registration_idempotent(tmp_path, fake, capsys):
    run = write_run(tmp_path)
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    capsys.readouterr()
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    out = capsys.readouterr().out
    assert len(fake.registrations) == 1 and len(fake.measurements) == 8 and len(fake.assets) == 3
    assert "0 created, 8 already recorded" in out and "world cloud: already recorded" in out
    assert "registered cloud: already recorded" in out
    ids = {c[2]["p_payload"]["registration_id"] for c in fake.calls if c[:2] == ("rpc", RPC)}
    assert ids == {fake.registrations[RUN_ID]["id"]}

    # A new run of the same session: its own registration, its rows next to the old ones,
    # and a world cloud row of its own even when the cloud is byte for byte the same.
    other = "6a1d2c3e-0000-4000-8000-0000000000a2"
    run2 = write_run(tmp_path / "again", run_id=other)
    assert lidar_upload.run(run2, SESSION, env=ENV) == 0
    assert "8 created, 0 already recorded" in capsys.readouterr().out
    assert len(fake.registrations) == 2 and len(fake.measurements) == 16
    worlds = fake.of_kind("world_cloud")
    assert len(worlds) == 2 and len(fake.of_kind("point_cloud")) == 2
    assert {a["pose"]["registration_id"] for a in worlds} == {
        r["id"] for r in fake.registrations.values()
    }


def test_rejected_auto_records_only_the_registration(tmp_path, fake, capsys):
    run = write_run(tmp_path, verdict="rejected_auto")
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    assert fake.rpcs() == [REGISTRATION_RPC]
    assert fake.registrations[RUN_ID]["status"] == "rejected"
    assert not fake.measurements and not fake.assets and not fake.objects
    out = capsys.readouterr().out
    assert "registration rejected: measurements and world cloud not uploaded" in out
    assert "crown.json" in out and "world.owc" in out


def test_rejected_without_results_still_records_the_registration(tmp_path, fake):
    """lidar process skips crown and world of a rejected run: only registration.json."""
    run = write_run(tmp_path, verdict="rejected_auto", results=False)
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    assert fake.rpcs() == [REGISTRATION_RPC]


def test_registration_rejected_by_ops_gets_no_results(tmp_path, fake, capsys):
    """A review run ops rejected before the (re-)upload: the report is recorded again
    (same id), its measurements and world cloud are not sent."""
    run = write_run(tmp_path)
    fake.registrations[RUN_ID] = {"id": str(uuid.uuid4()), "status": "rejected", "payload": {}}
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    assert fake.rpcs() == [REGISTRATION_RPC] and not fake.assets
    assert "pending_review" not in capsys.readouterr().out


def test_without_registration_measurements_are_refused(tmp_path, monkeypatch, capsys):
    no_sign_in(monkeypatch)
    out = tmp_path / "scan.processed" / "lidar"
    out.mkdir(parents=True)
    (out / "crown.json").write_text(json.dumps(crown()))
    assert lidar_upload.run(out, SESSION, env=ENV) == 1
    assert "need their registration" in capsys.readouterr().err
    assert lidar_upload.run(out, SESSION, dry_run=True, env=ENV) == 1
    with pytest.raises(LidarUploadError, match="need their registration"):
        lidar_upload.build_payload(lidar_upload.load_reports(out), SESSION)
    # A world cloud alone too.
    (out / "crown.json").unlink()
    write_world_cloud(out)
    assert lidar_upload.run(out, SESSION, env=ENV) == 1
    assert "need their registration" in capsys.readouterr().err


def test_allow_unregistered_uploads_without_registration_id(tmp_path, fake):
    out = tmp_path / "scan.processed" / "lidar"
    out.mkdir(parents=True)
    (out / "crown.json").write_text(json.dumps(crown()))
    write_world_cloud(out)
    assert lidar_upload.run(out, SESSION, env=ENV, allow_unregistered=True) == 0
    assert fake.rpcs() == [RPC]
    (call,) = [c for c in fake.calls if c[0] == "rpc"]
    assert "registration_id" not in call[2]["p_payload"]
    (asset,) = fake.assets  # no registration run, no registered cloud to keep
    assert "registration_id" not in asset["pose"]


def test_registration_flag_with_a_separate_output_folder(tmp_path, fake):
    """--registration <run folder> with the reports in <session>.processed/lidar."""
    run = write_run(tmp_path, results=False)
    out = tmp_path / "scan.processed" / "lidar"
    (out / "crown.json").write_text(json.dumps({**crown(), "run_id": RUN_ID}))
    assert lidar_upload.run(out, SESSION, env=ENV, registration=run) == 0
    assert fake.rpcs() == [REGISTRATION_RPC, RPC]
    payload = [c for c in fake.calls if c[:2] == ("rpc", RPC)][-1][2]["p_payload"]
    assert payload["registration_id"] == fake.registrations[RUN_ID]["id"]
    assert payload["measured_at"] == gps_ns_to_iso(REG_START_NS)
    # The registered cloud comes from the run folder, not the output folder.
    assert [a["kind"] for a in fake.assets] == ["point_cloud", "other"]


def test_registration_checks(tmp_path):
    run = write_run(tmp_path)
    with pytest.raises(LidarUploadError, match="registration.json is for session"):
        plan_upload(run, "22222222-2222-4222-8222-222222222222")
    with pytest.raises(LidarUploadError, match="--allow-unregistered does not apply"):
        plan_upload(run, SESSION, allow_unregistered=True)
    with pytest.raises(LidarUploadError, match="no registration.json"):
        plan_upload(run, SESSION, registration=tmp_path)
    # A report of another parcel than the registration's.
    other = {**crown(), "run_id": RUN_ID}
    other["parcel_id"] = "c0000000-0000-4000-8000-000000000002"
    (run / "crown.json").write_text(json.dumps(other))
    with pytest.raises(LidarUploadError, match="crown.json is of parcel"):
        plan_upload(run, SESSION)


def test_results_must_come_from_the_registration_run(tmp_path, monkeypatch, capsys):
    """Reports and the world cloud carry the run_id of the cloud they were made from
    (cloud.json); an upload refuses those of another run, and those without one, when a
    registration is given."""
    no_sign_in(monkeypatch)
    run = write_run(tmp_path)
    other = "6a1d2c3e-0000-4000-8000-0000000000a2"
    (run / "crown.json").write_text(json.dumps({**crown(), "run_id": other}))
    with pytest.raises(
        LidarUploadError, match=f"crown.json was made from registration run {other[:8]}"
    ):
        plan_upload(run, SESSION)
    assert lidar_upload.run(run, SESSION, env=ENV) == 1
    assert "registration run" in capsys.readouterr().err
    (run / "crown.json").write_text(json.dumps(crown()))  # no run_id
    with pytest.raises(LidarUploadError, match="crown.json names no registration run"):
        plan_upload(run, SESSION)
    (run / "crown.json").unlink()
    write_world_cloud(run, run_id=other)
    with pytest.raises(LidarUploadError, match="world.json was made from registration run"):
        plan_upload(run, SESSION)
    write_world_cloud(run)
    with pytest.raises(LidarUploadError, match="world.json names no registration run"):
        plan_upload(run, SESSION)


def test_unregistered_upload_refuses_results_of_a_registration_run(tmp_path, monkeypatch):
    """--allow-unregistered is for clouds without a registration (synthetic, demo): a
    report made from a registration run has to go up with it."""
    no_sign_in(monkeypatch)
    out = tmp_path / "scan.processed" / "lidar"
    out.mkdir(parents=True)
    (out / "crown.json").write_text(json.dumps({**crown(), "run_id": RUN_ID}))
    with pytest.raises(LidarUploadError, match="--registration"):
        plan_upload(out, SESSION, allow_unregistered=True)
    (out / "crown.json").write_text(json.dumps(crown()))
    write_world_cloud(out, run_id=RUN_ID)
    with pytest.raises(LidarUploadError, match="--registration"):
        plan_upload(out, SESSION, allow_unregistered=True)


def test_registered_cloud_must_be_the_runs(tmp_path, monkeypatch):
    no_sign_in(monkeypatch)
    run = write_run(tmp_path)
    meta = json.loads((run / "cloud.json").read_text())
    (run / "cloud.json").write_text(json.dumps({**meta, "run_id": "6a1d2c3e-0000"}))
    with pytest.raises(LidarUploadError, match="cloud.json was made by registration run"):
        plan_upload(run, SESSION)
    (run / "cloud.json").unlink()  # a run folder without a cloud: nothing to keep
    plan = plan_upload(run, SESSION)
    assert plan.cloud is None


def test_ppk_status_none_is_recorded_as_no_ppk(tmp_path, fake):
    run = write_run(tmp_path, verdict="rejected_auto", results=False, ppk="none")
    assert lidar_upload.run(run, SESSION, env=ENV) == 0
    assert fake.calls[0][2]["p_payload"]["ppk_status"] == "no_ppk"


def test_dry_run_prints_all_three_payloads(tmp_path, monkeypatch, capsys):
    no_sign_in(monkeypatch)
    run = write_run(tmp_path)
    assert lidar_upload.run(run, SESSION, dry_run=True, env={}) == 0
    text = capsys.readouterr().out
    reg, meas, world, ply, meta = json_blocks(text)
    assert reg["rpc"] == REGISTRATION_RPC and reg["p_payload"]["run_id"] == RUN_ID
    assert meas["rpc"] == RPC and meas["p_payload"]["registration_id"] == REGISTRATION_PLACEHOLDER
    assert len(meas["p_payload"]["items"]) == 9
    assert world["world_cloud_asset"]["pose"]["registration_id"] == REGISTRATION_PLACEHOLDER
    assert ply["point_cloud_asset"]["pose"]["registration_id"] == REGISTRATION_PLACEHOLDER
    assert meta["cloud_meta_asset"]["mime_type"] == "application/json"
    assert "nothing written" in text and "nothing uploaded" in text


def test_dry_run_of_a_rejected_registration(tmp_path, monkeypatch, capsys):
    no_sign_in(monkeypatch)
    run = write_run(tmp_path, verdict="rejected_auto")
    assert lidar_upload.run(run, SESSION, dry_run=True, env={}) == 0
    text = capsys.readouterr().out
    (reg,) = json_blocks(text)
    assert reg["p_payload"]["verdict"] == "rejected_auto"
    assert "rejected registration, its results would not be uploaded" in text


def test_cli_upload_flags(tmp_path, fake, monkeypatch):
    from orchados_pipeline.cli import main

    run = write_run(tmp_path, results=False)
    out = tmp_path / "scan.processed" / "lidar"
    (out / "crown.json").write_text(json.dumps({**crown(), "run_id": RUN_ID}))
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    assert main(["lidar", "upload", str(out), "--session-id", SESSION]) == 1
    assert not fake.calls
    args = ["lidar", "upload", str(out), "--session-id", SESSION, "--registration", str(run)]
    assert main(args) == 0
    assert fake.rpcs() == [REGISTRATION_RPC, RPC]
    (out / "crown.json").write_text(json.dumps(crown()))  # a synthetic cloud's report
    assert main(["lidar", "upload", str(out), "--session-id", SESSION, "--allow-unregistered"]) == 0
    assert "registration_id" not in fake.calls[-1][2]["p_payload"]


def test_process_upload_records_the_run(small_ppk, tmp_path, monkeypatch, capsys):
    """lidar process --upload: register (fake front end) -> crown, world -> upload of the
    run folder as its registration."""
    from orchados_pipeline.cli import main
    from orchados_pipeline.lidar.synth_moving import PARCEL_ID, SESSION_ID

    from .conftest import link_session

    src = small_ppk[0]
    session = link_session(src, tmp_path / "s", trees=False)
    # Database tree ids (uuids) for the synthetic trees.
    trees = json.loads((src / "trees.json").read_text())
    for t in trees:
        t["tree_id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, t["tree_id"]))
    (session / "trees.json").write_text(json.dumps(trees))
    client = FakeClient(session=SESSION_ID, parcel=PARCEL_ID)
    monkeypatch.setattr(SupabaseClient, "sign_in", classmethod(lambda cls, creds: client))
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)

    assert main(["lidar", "process", str(session), "--frontend", "fake", "--upload"]) == 0
    out = capsys.readouterr().out
    assert client.rpcs()[0] == REGISTRATION_RPC
    (reg,) = client.registrations.values()
    assert reg["payload"]["verdict"] == "review"  # 8 trees: few_trees_checked
    assert f"LiDAR registration {reg['id']}" in out
    meas = [c[2]["p_payload"] for c in client.calls if c[:2] == ("rpc", RPC)]
    assert meas and all(p["registration_id"] == reg["id"] for p in meas)
    cloud = json.loads(next((session.parent / "s.processed").rglob("cloud.json")).read_text())
    assert meas[0]["measured_at"] == gps_ns_to_iso(cloud["gps_time_start_ns"])
    (asset,) = client.of_kind("world_cloud")
    assert asset["pose"]["registration_id"] == reg["id"]
    (ply,) = client.of_kind("point_cloud")
    assert ply["pose"]["registration_id"] == reg["id"] and ply["pose"]["point_count"] > 0


# --- local Supabase ------------------------------------------------------------------------


@pytest.mark.supabase
def test_registration_against_local_supabase(supabase_env, test_sessions, tmp_path, capsys):
    from supabase_util import ORG, client, creds

    ops = client(supabase_env, "ops")
    owner = client(supabase_env, "owner")
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
    run_id = str(uuid.uuid4())
    run = write_run(tmp_path, session=session_id, run_id=run_id)

    # Without a registration: refused before signing in.
    out = tmp_path / "scan.processed" / "lidar"
    (out / "crown.json").write_text(json.dumps(crown(session_id)))
    assert lidar_upload.run(out, session_id, env=creds(supabase_env)) == 1
    assert "need their registration" in capsys.readouterr().err
    (out / "crown.json").unlink()

    # Only ops records a registration.
    assert lidar_upload.run(run, session_id, env=creds(supabase_env, "expert")) == 1
    assert "forbidden" in capsys.readouterr().err

    assert lidar_upload.run(run, session_id, env=creds(supabase_env)) == 0
    text = capsys.readouterr().out
    assert "review, pending_review" in text
    assert "8 created, 0 already recorded" in text and "world cloud: recorded" in text
    (reg,) = ops.select(
        "lidar_registration",
        {"session_id": f"eq.{session_id}", "select": "id,run_id,status,auto_verdict,reasons"},
    )
    assert (reg["run_id"], reg["status"], reg["reasons"]) == (
        run_id,
        "pending_review",
        ["few_trees_checked"],
    )
    rows = ops.select(
        "measurement",
        {"session_id": f"eq.{session_id}", "select": "registration_id,measured_at"},
    )
    assert len(rows) == 8 and {r["registration_id"] for r in rows} == {reg["id"]}
    assert datetime.fromisoformat(rows[0]["measured_at"]) == datetime.fromisoformat(
        gps_ns_to_iso(REG_START_NS).replace("Z", "+00:00")
    )
    (asset,) = ops.select(
        "asset", {"session_id": f"eq.{session_id}", "kind": "eq.world_cloud", "select": "pose"}
    )
    assert asset["pose"]["registration_id"] == reg["id"]
    (ply,) = ops.select(
        "asset", {"session_id": f"eq.{session_id}", "kind": "eq.point_cloud", "select": "pose"}
    )
    assert ply["pose"]["registration_id"] == reg["id"] and ply["pose"]["point_count"] == 10
    # Pending: the owner sees neither the measurements nor the world cloud.
    assert owner.select("measurement", {"session_id": f"eq.{session_id}", "select": "id"}) == []
    assert owner.select("asset", {"session_id": f"eq.{session_id}", "select": "id"}) == []

    # Idempotent: nothing new.
    assert lidar_upload.run(run, session_id, env=creds(supabase_env)) == 0
    text = capsys.readouterr().out
    assert "0 created, 8 already recorded" in text and "world cloud: already recorded" in text
    assert len(ops.select("lidar_registration", {"session_id": f"eq.{session_id}"})) == 1

    # Ops rejects it; a re-upload then records no results (and does not fail).
    ops.rpc("decide_lidar_registration", {"p_id": reg["id"], "p_accept": False, "p_note": "x"})
    assert lidar_upload.run(run, session_id, env=creds(supabase_env)) == 0
    assert "measurements and world cloud not uploaded" in capsys.readouterr().out

    # A rejected_auto run: only its report.
    run2 = write_run(tmp_path / "b", verdict="rejected_auto", session=session_id,
                     run_id=str(uuid.uuid4()))  # fmt: skip
    assert lidar_upload.run(run2, session_id, env=creds(supabase_env)) == 0
    regs = ops.select("lidar_registration", {"session_id": f"eq.{session_id}", "select": "id"})
    assert len(regs) == 2
    rows = ops.select("measurement", {"session_id": f"eq.{session_id}", "select": "id"})
    assert len(rows) == 8
    ops.close()
    owner.close()
