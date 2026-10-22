"""Upload with an in-memory catalog and a local media store (no Supabase needed)."""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

import pytest
from conftest import write_raw_manifest

from orchados_pipeline.cli import main
from orchados_pipeline.hashing import sha256_file
from orchados_pipeline.media import ImmutableObjectError, LocalMediaStore, media_key
from orchados_pipeline.upload import (
    SessionRow,
    UploadError,
    UploadOptions,
    parse_kinds,
    upload_run,
)

ORG = "b0000000-0000-4000-8000-000000000001"
PARCEL = "parcel-synth"  # synthetic session's parcel id
SESSION = "synth-0001"
# Synthetic trees are S1-1 .. S3-4; S2-3 has no active tree in the fake parcel.
TREES = {f"S{r}-{c}": f"tree-{r}-{c}" for r in (1, 2, 3) for c in (1, 2, 3, 4)}
TREES.pop("S2-3")


class Interrupted(RuntimeError):
    pass


class FakeCatalog:
    """The tables and unique keys the uploader touches, in memory."""

    def __init__(self, status: str = "captured", trees: dict[str, str] | None = None):
        self.row = SessionRow(SESSION, ORG, PARCEL, status, "2026-10-18T09:00:00Z")
        self.trees = TREES if trees is None else trees
        self.capture_rows: list[dict] = []
        self.asset_rows: list[dict] = []
        self.source_rows: list[dict] = []
        self.fail_sources_after: int | None = None

    def session(self, session_id):
        assert session_id == self.row.id
        return self.row

    def active_trees(self, parcel_id):
        assert parcel_id == PARCEL
        return dict(self.trees)

    def captures(self, session_id):
        return {
            r["content_hash"]: r["id"] for r in self.capture_rows if r["session_id"] == session_id
        }

    def insert_capture(self, row):
        key = (row["session_id"], row["content_hash"])
        assert key not in {(r["session_id"], r["content_hash"]) for r in self.capture_rows}
        self.capture_rows.append({**row, "id": str(uuid.uuid4())})
        return self.capture_rows[-1]["id"]

    def assets(self, session_id, pipeline_version):
        return {
            r["content_hash"]: r["id"]
            for r in self.asset_rows
            if r["session_id"] == session_id and r["pipeline_version"] == pipeline_version
        }

    def insert_asset(self, row):
        key = (row["session_id"], row["content_hash"], row["pipeline_version"])
        existing = {
            (r["session_id"], r["content_hash"], r["pipeline_version"]) for r in self.asset_rows
        }
        assert key not in existing
        self.asset_rows.append({**row, "id": str(uuid.uuid4())})
        return self.asset_rows[-1]["id"]

    def asset_sources(self, asset_ids):
        ids = set(asset_ids)
        return {
            (r["asset_id"], r["source_capture_id"], r["source_asset_id"])
            for r in self.source_rows
            if r["asset_id"] in ids
        }

    def insert_asset_sources(self, rows):
        if self.fail_sources_after is not None and len(self.source_rows) >= self.fail_sources_after:
            raise Interrupted("connection lost")
        have = self.asset_sources([r["asset_id"] for r in self.source_rows])
        for r in rows:
            key = (r["asset_id"], r["source_capture_id"], r["source_asset_id"])
            assert key not in have
            assert (r["source_capture_id"] is None) != (r["source_asset_id"] is None)
            have.add(key)
            self.source_rows.append(r)

    def mark_processed(self, session_id, from_statuses):
        if self.row.status in from_statuses:
            self.row = SessionRow(**{**self.row.__dict__, "status": "processed"})
        return self.row.status

    def snapshot(self):
        """Rows without generated ids, comparable between catalogs."""
        by_id = {r["id"]: r["content_hash"] for r in self.capture_rows + self.asset_rows}
        return (
            sorted((r["kind"], r["content_hash"], r["uri"]) for r in self.capture_rows),
            sorted(
                (r["kind"], r["content_hash"], r["tree_id"] is not None, r["pipeline_version"])
                for r in self.asset_rows
            ),
            sorted(
                (
                    by_id[r["asset_id"]],
                    by_id.get(r["source_capture_id"], ""),
                    by_id.get(r["source_asset_id"], ""),
                )
                for r in self.source_rows
            ),
        )


class FlakyStore(LocalMediaStore):
    """Fails after a number of successful uploads, like a dropped connection."""

    def __init__(self, root: Path, fail_after: int):
        super().__init__(root)
        self.left = fail_after

    def put(self, key, local_path, media_type):
        if self.left == 0:
            raise Interrupted("connection lost")
        self.left -= 1
        return super().put(key, local_path, media_type)


@pytest.fixture
def run(processed_run):
    ctx, out, _ = processed_run
    return (
        ctx.run_dir,
        out,
        UploadOptions(station="ist-01", session_dir=ctx.session_dir),
    )


def _pulled_session(ctx, tmp_path, uri, skip=()) -> Path:
    """The session folder as orchados-ingest pull leaves it (with its manifest copy)."""
    dest = tmp_path / "pulled"
    shutil.copytree(ctx.session_dir, dest)
    write_raw_manifest(dest, SESSION, uri, skip)
    return dest


RAW_URI = f"s3://orchados-raw/raw/{ORG}/{PARCEL}/{SESSION}/"


def test_pulled_session_captures_point_to_the_store(processed_run, tmp_path):
    ctx, out, _ = processed_run
    session_dir = _pulled_session(ctx, tmp_path, RAW_URI)
    cat = FakeCatalog()
    opts = UploadOptions(station="ist-01", session_dir=session_dir)
    rep = upload_run(ctx.run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)
    assert not [w for w in rep.warnings if "raw" in w or "station" in w]
    assert len(cat.capture_rows) == len(out.captures)
    for row in cat.capture_rows:
        assert row["uri"] == RAW_URI + row["metadata"]["path"]
    video = next(r for r in cat.capture_rows if r["kind"] == "video_360")
    assert video["uri"] == RAW_URI + "video/VID_0001.mp4"


@pytest.mark.parametrize(
    "uri", ["az://raw/raw/o/p/s/", "file:///srv/orchados-raw/raw/o/p/s/"], ids=["azure", "local"]
)
def test_store_uri_schemes(processed_run, tmp_path, uri):
    ctx, _, _ = processed_run
    cat = FakeCatalog()
    opts = UploadOptions(session_dir=_pulled_session(ctx, tmp_path, uri))
    upload_run(ctx.run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)
    assert all(r["uri"] == uri + r["metadata"]["path"] for r in cat.capture_rows)


def test_file_not_in_the_store_falls_back_to_the_station(processed_run, tmp_path):
    ctx, _, _ = processed_run
    session_dir = _pulled_session(ctx, tmp_path, RAW_URI, skip=("gnss/events.csv",))
    # The store holds other content under this path.
    m = session_dir / ".orchados" / "manifest.json"
    raw = json.loads(m.read_text())
    next(f for f in raw["files"] if f["path"] == "session.json")["sha256"] = "0" * 64
    m.write_text(json.dumps(raw))
    cat = FakeCatalog()
    opts = UploadOptions(station="ist-01", session_dir=session_dir)
    rep = upload_run(ctx.run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)
    by_path = {r["metadata"]["path"]: r["uri"] for r in cat.capture_rows}
    assert (
        by_path["gnss/events.csv"]
        == f"station://ist-01{(session_dir / 'gnss/events.csv').resolve()}"
    )
    assert by_path["session.json"].startswith("station://ist-01/")
    assert by_path["video/VID_0001.mp4"] == RAW_URI + "video/VID_0001.mp4"
    (warning,) = [w for w in rep.warnings if "not in the store" in w]
    assert "events.csv" in warning and "session.json" in warning


def test_manifest_without_location_keeps_station_uris(processed_run, tmp_path):
    ctx, _, _ = processed_run
    cat = FakeCatalog()
    opts = UploadOptions(station="ist-01", session_dir=_pulled_session(ctx, tmp_path, None))
    rep = upload_run(ctx.run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)
    assert all(r["uri"].startswith("station://ist-01/") for r in cat.capture_rows)
    assert any("no store location" in w for w in rep.warnings)


def test_manifest_of_another_session_is_refused(processed_run, tmp_path):
    ctx, _, _ = processed_run
    session_dir = _pulled_session(ctx, tmp_path, RAW_URI)
    m = session_dir / ".orchados" / "manifest.json"
    m.write_text(m.read_text().replace(SESSION, str(uuid.uuid4())))
    opts = UploadOptions(session_dir=session_dir)
    with pytest.raises(UploadError, match="is for session"):
        upload_run(ctx.run_dir, SESSION, FakeCatalog(), LocalMediaStore(tmp_path / "b"), opts)


def _copy_run(run_dir: Path, dest: Path, edit) -> Path:
    shutil.copytree(run_dir, dest)
    data = json.loads((dest / "outputs.json").read_text())
    edit(data)
    (dest / "outputs.json").write_text(json.dumps(data))
    return dest


def test_upload_creates_rows_objects_and_lineage(run, tmp_path):
    run_dir, out, opts = run
    cat, store = FakeCatalog(), LocalMediaStore(tmp_path / "bucket")
    rep = upload_run(run_dir, SESSION, cat, store, opts)

    previews = [a for a in out.assets if a.kind == "panorama_preview"]
    crops = [a for a in out.assets if a.kind == "tree_crop"]
    matched = [c for c in crops if c.subject["slot_code"] != "S2-3"]
    assert len(matched) < len(crops)
    n_assets = len(previews) + len(matched) + 1  # + trajectory
    assert rep.captures_created == len(out.captures) == len(cat.capture_rows)
    assert rep.assets_created == n_assets == len(cat.asset_rows)
    assert rep.objects_uploaded == n_assets
    assert rep.skipped_kinds["panorama"] == len(previews)
    assert rep.status_before == "captured" and rep.status_after == "processed"
    assert any("S2-3" in w and "not uploaded" in w for w in rep.warnings)

    # Objects are content-addressed under org/<org>/parcel/<parcel>/<sha256>.
    for row in cat.asset_rows:
        key = media_key(ORG, PARCEL, row["content_hash"])
        assert row["uri"] == f"storage://media/{key}"
        assert sha256_file(tmp_path / "bucket" / key) == row["content_hash"]
        assert (row["org_id"], row["parcel_id"], row["session_id"]) == (ORG, PARCEL, SESSION)
        assert row["pipeline"] == out.pipeline.name
        assert row["params_hash"] == out.pipeline.params_hash

    # Raw captures of a local folder (no pulled manifest) stay on the station.
    video = next(r for r in cat.capture_rows if r["kind"] == "video_360")
    assert video["uri"] == f"station://ist-01{(opts.session_dir / 'video/VID_0001.mp4').resolve()}"
    assert video["started_at"].startswith("2026-10-18T09:00") and video["ended_at"]
    assert {r["kind"] for r in cat.capture_rows} == {"video_360", "gnss_raw", "other"}

    # Panorama pose and position.
    by_hash = {r["content_hash"]: r for r in cat.asset_rows}
    p = by_hash[previews[0].asset_id]
    assert p["kind"] == "panorama"
    assert p["pose"] == {
        "variant": "preview",
        "heading_deg": previews[0].pose.heading_deg,
        "height_m": previews[0].pose.height_m,
        "sd_h_m": previews[0].pose.sd_h_m,
        "quality": previews[0].pose.quality.value,  # synthetic NAV-PVT says fix
        "gps_time_ns": str(previews[0].gps_time_ns),
        "width_px": 1920,
        "height_px": 960,
    }
    assert p["position"] == f"SRID=4326;POINT({previews[0].pose.lon!r} {previews[0].pose.lat!r})"
    assert p["position_uncertainty_m"] == previews[0].pose.sd_h_m

    # Crops: tree from the slot code, panorama = the preview of the source panorama.
    preview_ids = {r["id"] for r in cat.asset_rows if r["pose"] and r["pose"].get("variant")}
    for c in matched:
        row = by_hash[c.asset_id]
        assert row["tree_id"] == TREES[c.subject["slot_code"]]
        assert row["pose"]["slot_code"] == c.subject["slot_code"]
        assert row["pose"]["direction"] == c.subject["direction"]
        assert row["pose"]["panorama_asset_id"] in preview_ids
        assert set(row["pose"]) == {
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
        assert row["position"] is not None

    # Lineage: preview <- video capture + trajectory; crop <- preview.
    _, _, lineage = cat.snapshot()
    video_hash = next(c.capture_id for c in out.captures if c.kind == "video")
    traj_hash = next(a.asset_id for a in out.assets if a.kind == "trajectory")
    assert (previews[0].asset_id, video_hash, "") in lineage
    assert (previews[0].asset_id, "", traj_hash) in lineage
    crop_parents = [s for a, _, s in lineage if a == matched[0].asset_id]
    assert len(crop_parents) == 1 and crop_parents[0] in {p.asset_id for p in previews}
    assert rep.lineage_created == len(cat.source_rows)


def test_second_upload_adds_nothing(run, tmp_path):
    run_dir, _, opts = run
    cat, store = FakeCatalog(), LocalMediaStore(tmp_path / "bucket")
    upload_run(run_dir, SESSION, cat, store, opts)
    before = cat.snapshot()
    rep = upload_run(run_dir, SESSION, cat, store, opts)
    assert (rep.captures_created, rep.assets_created, rep.objects_uploaded) == (0, 0, 0)
    assert rep.lineage_created == 0
    assert rep.assets_existing == len(cat.asset_rows)
    assert cat.snapshot() == before


@pytest.mark.parametrize("where", ["object", "lineage"])
def test_interrupted_upload_resumes(run, tmp_path, where):
    run_dir, _, opts = run
    ref = FakeCatalog()
    upload_run(run_dir, SESSION, ref, LocalMediaStore(tmp_path / "ref"), opts)

    cat = FakeCatalog()
    store = LocalMediaStore(tmp_path / "bucket")
    if where == "object":
        first = FlakyStore(tmp_path / "bucket", fail_after=7)
    else:
        first = store
        cat.fail_sources_after = 20
    with pytest.raises(Interrupted):
        upload_run(run_dir, SESSION, cat, first, opts)
    assert cat.row.status == "captured"  # not processed until complete
    cat.fail_sources_after = None

    rep = upload_run(run_dir, SESSION, cat, store, opts)
    assert rep.status_after == "processed"
    assert cat.snapshot() == ref.snapshot()
    assert sorted(p.name for p in (tmp_path / "bucket").rglob("*") if p.is_file()) == sorted(
        p.name for p in (tmp_path / "ref").rglob("*") if p.is_file()
    )


@pytest.mark.parametrize(
    "before, after",
    [
        ("planned", "processed"),
        ("captured", "processed"),
        ("processed", "processed"),
        ("in_review", "in_review"),
        ("published", "published"),
    ],
)
def test_session_status(run, tmp_path, before, after):
    run_dir, _, opts = run
    opts.kinds = parse_kinds("trajectory")
    cat = FakeCatalog(status=before)
    rep = upload_run(run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)
    assert (rep.status_before, rep.status_after, cat.row.status) == (before, after, after)


def test_new_pipeline_version_adds_rows(run, tmp_path):
    run_dir, out, opts = run
    cat, store = FakeCatalog(), LocalMediaStore(tmp_path / "bucket")
    first = upload_run(run_dir, SESSION, cat, store, opts)

    def bump(data):
        data["pipeline"]["version"] = "0.2.0"

    rep = upload_run(_copy_run(run_dir, tmp_path / "v2", bump), SESSION, cat, store, opts)
    # Same files: no new objects or captures, but new asset rows; old rows stay.
    assert rep.objects_uploaded == 0 and rep.objects_existing == first.objects_uploaded
    assert rep.captures_created == 0
    assert rep.assets_created == first.assets_created
    versions = [r["pipeline_version"] for r in cat.asset_rows]
    assert versions.count(out.pipeline.version) == versions.count("0.2.0") == first.assets_created


def test_full_panoramas_on_request(run, tmp_path):
    run_dir, out, opts = run
    opts.kinds = parse_kinds("panorama,preview,tree_crop")
    cat = FakeCatalog()
    upload_run(run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)
    full = {r["id"] for r in cat.asset_rows if r["pose"] and r["pose"].get("variant") == "full"}
    assert len(full) == sum(a.kind == "panorama" for a in out.assets)
    crops = [r for r in cat.asset_rows if r["kind"] == "tree_crop"]
    assert crops and all(r["pose"]["panorama_asset_id"] in full for r in crops)
    assert not any(r["kind"] == "trajectory" for r in cat.asset_rows)


def test_session_must_match(run, tmp_path):
    run_dir, _, opts = run
    cat = FakeCatalog()
    cat.row = SessionRow(SESSION, ORG, "another-parcel", "captured")
    with pytest.raises(UploadError, match="parcel"):
        upload_run(run_dir, SESSION, cat, LocalMediaStore(tmp_path / "b"), opts)


def test_session_dir_is_inferred_or_required(run, tmp_path):
    run_dir, _, opts = run
    opts.session_dir = None
    with pytest.raises(UploadError, match="--session-dir"):
        upload_run(run_dir, SESSION, FakeCatalog(), LocalMediaStore(tmp_path / "b"), opts)


def test_parse_kinds():
    assert parse_kinds("preview, tree_crop") == {"preview", "tree_crop"}
    with pytest.raises(UploadError, match="unknown kinds"):
        parse_kinds("preview,video")


def test_local_store_is_immutable(tmp_path):
    src = tmp_path / "f"
    src.write_bytes(b"hello")
    sha = sha256_file(src)
    store = LocalMediaStore(tmp_path / "bucket")
    key = media_key(ORG, PARCEL, sha)
    assert store.put(key, src, "text/plain") is True
    assert store.put(key, src, "text/plain") is False
    assert store.keys(key.rsplit("/", 1)[0]) == {key}
    (tmp_path / "bucket" / key).write_bytes(b"changed")
    with pytest.raises(ImmutableObjectError):
        store.put(key, src, "text/plain")
    with pytest.raises(ImmutableObjectError):
        store.put(media_key(ORG, PARCEL, "0" * 64), src, "text/plain")


def test_cli_upload_needs_credentials(run, monkeypatch, capsys):
    run_dir, _, _ = run
    for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "ORCHADOS_EMAIL", "ORCHADOS_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
    assert main(["upload", str(run_dir), "--session-id", SESSION]) == 1
    assert "missing environment variables: SUPABASE_URL" in capsys.readouterr().err
