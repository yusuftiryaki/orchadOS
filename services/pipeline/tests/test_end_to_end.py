import json
import shutil

from conftest import fast_params

from orchados_pipeline import __version__
from orchados_pipeline.cli import main
from orchados_pipeline.context import RunContext
from orchados_pipeline.hashing import sha256_file
from orchados_pipeline.outputs import LocalUploader, load_outputs, upload_run
from orchados_pipeline.pipeline import run_all


def test_outputs_manifest(processed_run):
    ctx, out, truth = processed_run
    data = json.loads(ctx.outputs_path.read_text())
    assert data["schema"] == "orchados.outputs/1"
    assert data["pipeline"]["version"] == __version__
    assert data["pipeline"]["params_hash"] == ctx.params_hash
    assert ctx.run_dir.name == f"v{__version__}_{ctx.params_hash[:12]}"

    kinds = {}
    for a in out.assets:
        kinds.setdefault(a.kind, []).append(a)
        assert a.asset_id == a.file.sha256 == sha256_file(ctx.run_dir / a.file.path)
        if a.sidecar:
            assert a.sidecar.sha256 == sha256_file(ctx.run_dir / a.sidecar.path)
    assert {
        "manifest",
        "trajectory",
        "time_sync",
        "frame_selection",
        "panorama",
        "panorama_preview",
        "tree_crop",
    } <= set(kinds)
    assert len(kinds["panorama"]) == len(kinds["panorama_preview"])

    # Lineage: every referenced capture and parent asset exists.
    capture_ids = {c.capture_id for c in out.captures}
    asset_ids = {a.asset_id for a in out.assets}
    for a in out.assets:
        assert set(a.derived_from.captures) <= capture_ids
        assert set(a.derived_from.assets) <= asset_ids
    video_capture = next(c for c in out.captures if c.kind == "video")
    pano = kinds["panorama"][0]
    assert video_capture.capture_id in pano.derived_from.captures
    crop = kinds["tree_crop"][0]
    assert crop.derived_from.assets[0] in {p.asset_id for p in kinds["panorama"]}
    assert crop.subject["tree_id"]

    # Panorama sizes and sidecar content.
    assert (pano.file.width, pano.file.height) == (3840, 1920)
    assert (kinds["panorama_preview"][0].file.width, kinds["panorama_preview"][0].file.height) == (
        1920,
        960,
    )
    side = json.loads((ctx.run_dir / pano.sidecar.path).read_text())
    assert side["source_video"] == "video/VID_0001.mp4"
    assert side["producer"]["version"] == __version__
    assert side["image"]["sha256"] == pano.file.sha256
    assert {"lat", "lon", "heading_deg"} <= set(side["pose"])
    assert any("face-blurred" in w for w in out.warnings)


def test_rerun_is_deterministic(processed_run, tmp_path):
    ctx, out, _ = processed_run
    again = run_all(RunContext.create(ctx.session_dir, tmp_path / "again", fast_params()))
    assert [a.asset_id for a in again.assets] == [a.asset_id for a in out.assets]
    assert again.model_dump() == out.model_dump()


def test_new_params_do_not_overwrite_old_results(processed_run):
    ctx, _, _ = processed_run
    p = fast_params()
    p.frames.slice_m = 5.0
    other = RunContext.create(ctx.session_dir, ctx.out_root, p)
    assert other.run_dir != ctx.run_dir


def test_local_uploader_is_content_addressed(processed_run, tmp_path):
    ctx, out, _ = processed_run
    dest = tmp_path / "bucket"
    res = upload_run(ctx.run_dir, LocalUploader(dest))
    n_files = len({r.sha256 for a in out.assets for r in (a.file, a.sidecar) if r})
    assert res["objects"] == n_files
    for a in out.assets:
        obj = dest / "objects" / a.asset_id[:2] / a.asset_id
        assert sha256_file(obj) == a.asset_id
    meta = load_outputs(res["metadata"])
    assert meta == out
    # Idempotent: uploading again changes nothing.
    assert upload_run(ctx.run_dir, LocalUploader(dest))["objects"] == n_files


def test_cli_run_and_stages(synthetic_session, tmp_path, capsys):
    session, _ = synthetic_session
    params = tmp_path / "params.json"
    params.write_text(fast_params().model_dump_json())
    out_a, out_b = tmp_path / "a", tmp_path / "b"
    assert main(["run", str(session), "--out", str(out_a), "--params", str(params)]) == 0
    assert "tree_crop=" in capsys.readouterr().out
    for stage in ["ingest", "position", "sync", "frames", "panoramas", "crops", "outputs"]:
        assert main([stage, str(session), "--out", str(out_b), "--params", str(params)]) == 0
    (run_a,) = out_a.iterdir()
    (run_b,) = out_b.iterdir()
    assert (run_a / "outputs.json").read_bytes() == (run_b / "outputs.json").read_bytes()


def test_cli_reports_invalid_session(tmp_path, capsys):
    (tmp_path / "s").mkdir()
    assert main(["ingest", str(tmp_path / "s")]) == 1
    err = capsys.readouterr().err
    assert "missing session.json" in err and "no video/*.mp4" in err


def test_cli_stage_needs_previous_stage(synthetic_session, tmp_path, capsys):
    session, _ = synthetic_session
    s = tmp_path / "s"
    shutil.copytree(session, s)
    assert main(["frames", str(s), "--out", str(tmp_path / "o")]) == 1
    assert "run the 'ingest' stage first" in capsys.readouterr().err
