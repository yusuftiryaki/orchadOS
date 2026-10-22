"""push -> interrupt -> resume -> pull -> verify on every backend; list; prune."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta

import pytest
from conftest import PART, write_session

from orchados_ingest import ops
from orchados_ingest.hashing import HashCache
from orchados_ingest.manifest import MANIFEST_REL, Manifest
from orchados_ingest.ops import IngestError, parse_duration
from orchados_ingest.state import JsonState
from orchados_ingest.store.local import LocalStore
from orchados_ingest.transfer import Progress

SID = "4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b"
ORG, PARCEL = "11111111-2222-4333-8444-555555555555", "9b1d7e2a-3c4f-4a5b-8c6d-7e8f9a0b1c2d"


class Cut(BaseException):
    """Like Ctrl-C: not an Exception, so SDK retry loops do not swallow it."""


def _session(tmp_path, **kw):
    return write_session(tmp_path / "session", session_id=SID, org_id=ORG, parcel_id=PARCEL, **kw)


def test_push_interrupt_resume_pull_verify(store, tmp_path, monkeypatch):
    src = _session(tmp_path, video_bytes=3 * PART + 77)
    store.concurrency = 1
    total = sum(p.stat().st_size for p in src.rglob("*") if p.is_file())

    # Cut the connection halfway through the video's second part.
    real_advance = Progress.advance

    def cutting(self, n):
        real_advance(self, n)
        if self.label == "push" and self.moved > PART + PART // 2:
            raise Cut("connection lost")

    monkeypatch.setattr(Progress, "advance", cutting)
    with pytest.raises(Cut):
        ops.push(store, src, SID, quiet=True)
    monkeypatch.setattr(Progress, "advance", real_advance)
    prefix = f"raw/{ORG}/{PARCEL}/{SID}/"
    assert store.get_bytes(prefix + MANIFEST_REL) is None  # no manifest: not complete
    assert ops.read_index(store, SID).prefix == prefix  # but findable

    # Resume: the video continues where it stopped.
    res = ops.push(store, src, SID, quiet=True)
    assert res.prefix == prefix
    assert "video/VID_0001.mp4" in res.uploaded
    man = Manifest.from_json(store.get_bytes(prefix + MANIFEST_REL))
    assert man.total_bytes == total and len(man.files) == 5
    assert (
        man.files["video/VID_0001.mp4"].sha256
        == hashlib.sha256((src / "video" / "VID_0001.mp4").read_bytes()).hexdigest()
    )

    # A second push sends nothing.
    again = ops.push(store, src, SID, quiet=True)
    assert again.uploaded == [] and len(again.skipped) == 5

    # Pull on the processing machine, with checksums.
    dest = tmp_path / "pulled"
    pulled = ops.pull(store, SID, dest, quiet=True)
    assert len(pulled.downloaded) == 5
    for e in man.files.values():
        assert hashlib.sha256((dest / e.path).read_bytes()).hexdigest() == e.sha256
    assert (dest / ".orchados" / "manifest.json").is_file()
    assert ops.verify(store, SID).ok
    assert ops.verify(store, SID, deep=True).ok
    assert ops.verify(store, SID, local=dest).ok

    # Interrupted download resumes from the .part file.
    video = dest / "video" / "VID_0001.mp4"
    data = video.read_bytes()
    video.unlink()
    video.with_name(video.name + ".part").write_bytes(data[: PART + 5])
    again = ops.pull(store, SID, dest, quiet=True)
    assert again.downloaded == ["video/VID_0001.mp4"] and video.read_bytes() == data

    rows = ops.list_sessions(store)
    assert [(r.session_id, r.files, r.complete) for r in rows] == [(SID, 5, True)]


def test_pull_detects_corruption(tmp_path):
    store = LocalStore(tmp_path / "store", part_size=PART)
    src = _session(tmp_path, video_bytes=1000)
    ops.push(store, src, SID, quiet=True)
    obj = tmp_path / "store" / "raw" / ORG / PARCEL / SID / "gnss" / "gnss.ubx"
    obj.write_bytes(b"tampered" + obj.read_bytes()[8:])
    with pytest.raises(IngestError, match="checksum mismatch"):
        ops.pull(store, SID, tmp_path / "out", quiet=True)
    assert not (tmp_path / "out" / "gnss" / "gnss.ubx").exists()
    assert not (tmp_path / "out" / "gnss" / "gnss.ubx.part").exists()
    rep = ops.verify(store, SID, deep=True)
    assert [p.split(":")[0] for p in rep.problems] == ["gnss/gnss.ubx"]


def test_pull_filters(tmp_path):
    store = LocalStore(tmp_path / "store", part_size=PART)
    ops.push(store, _session(tmp_path, video_bytes=10), SID, quiet=True)
    res = ops.pull(store, SID, tmp_path / "o", include=["gnss/*"], exclude=["*.ubx"], quiet=True)
    assert sorted(res.downloaded) == ["gnss/events.csv", "gnss/session.json"]
    with pytest.raises(IngestError, match="no files match"):
        ops.pull(store, SID, tmp_path / "o", include=["camera/*"], quiet=True)


def test_ids_and_immutability(tmp_path):
    store = LocalStore(tmp_path / "store", part_size=PART)
    src = _session(tmp_path, video_bytes=10)
    with pytest.raises(IngestError, match="session.json says"):
        ops.push(store, src, "other-session", quiet=True)
    ops.push(store, src, SID, quiet=True)

    # The exported video from the Windows machine: no session.json, ids from the index.
    export = tmp_path / "export"
    export.mkdir()
    (export / "VID_0002.mp4").write_bytes(b"stitched")
    res = ops.push(store, export, SID, quiet=True)
    assert res.uploaded == ["video/VID_0002.mp4"]
    assert len(ops.require_session(store, SID)[1].files) == 6

    # Raw media is immutable: same path, other content is refused.
    (export / "VID_0002.mp4").write_bytes(b"stitched again")
    with pytest.raises(IngestError, match="immutable"):
        ops.push(store, export, SID, quiet=True)
    ops.push(store, export, SID, quiet=True, replace=True)

    # Unknown session without ids.
    with pytest.raises(IngestError, match="org_id unknown"):
        ops.push(store, export, "new-session", quiet=True)
    with pytest.raises(IngestError, match="parcel_id disagrees"):
        ops.push(store, src, SID, parcel_id="another", quiet=True)


def test_hash_cache_reused(tmp_path):
    store = LocalStore(tmp_path / "store", part_size=PART)
    src = _session(tmp_path, video_bytes=1000)
    cache = HashCache(JsonState(tmp_path / "hashes.json"))
    ops.push(store, src, SID, hash_cache=cache, quiet=True)
    calls = []
    import orchados_ingest.hashing as hashing

    real = hashing.sha256_file
    hashing.sha256_file = lambda p, progress=None: calls.append(p) or real(p, progress)
    try:
        ops.push(store, src, SID, hash_cache=HashCache(JsonState(tmp_path / "hashes.json")),
                 quiet=True)  # fmt: skip
    finally:
        hashing.sha256_file = real
    assert calls == []


def test_parse_duration():
    assert parse_duration("30d") == timedelta(days=30)
    assert parse_duration("12h") == timedelta(hours=12)
    assert parse_duration("2w") == timedelta(weeks=2)
    assert parse_duration(" 90M ") == timedelta(minutes=90)
    for bad in ("30", "d", "0d", "-1d", "1y", "1.5d"):
        with pytest.raises(ValueError):
            parse_duration(bad)


def _age(store_root, prefix: str, when: datetime) -> None:
    import os

    for p in (store_root / prefix).rglob("*"):
        if p.is_file():
            os.utime(p, (when.timestamp(), when.timestamp()))


def test_prune_date_math(tmp_path):
    root = tmp_path / "store"
    store = LocalStore(root, part_size=PART)
    now = datetime(2026, 12, 1, 12, 0, tzinfo=UTC)
    old, edge, fresh = (f"s-{n}" for n in ("old", "edge", "fresh"))
    for sid in (old, edge, fresh):
        src = write_session(tmp_path / sid, video_bytes=10, session_id=sid, org_id="o",
                            parcel_id="p")  # fmt: skip
        ops.push(store, src, sid, quiet=True)
    _age(root, f"raw/o/p/{old}", now - timedelta(days=31))
    _age(root, f"raw/o/p/{edge}", now - timedelta(days=30))  # exactly 30 days: kept
    _age(root, f"raw/o/p/{fresh}", now - timedelta(days=31))
    # One file added later (e.g. the exported video) keeps the whole session.
    _age(root, f"raw/o/p/{fresh}/video", now - timedelta(days=2))
    for sid in (old, edge, fresh):
        _age(root, f"raw/_index/{sid}.json", now - timedelta(days=31))

    dry = ops.prune(store, timedelta(days=30), now=now, dry_run=True)
    assert dry.sessions == [f"raw/o/p/{old}/"] and dry.indexes == 1
    assert store.exists(f"raw/o/p/{old}/session.json")

    res = ops.prune(store, timedelta(days=30), now=now)
    assert res.sessions == [f"raw/o/p/{old}/"] and res.objects == 6
    assert res.cutoff == now - timedelta(days=30)
    assert [o.key for o in store.list(f"raw/o/p/{old}/")] == []
    assert ops.read_index(store, old) is None
    assert ops.read_index(store, edge) and ops.read_index(store, fresh)
    assert {s.session_id for s in ops.list_sessions(store)} == {edge, fresh}


def test_prune_orphan_index_and_partials(tmp_path):
    root = tmp_path / "store"
    store = LocalStore(root, part_size=PART)
    now = datetime(2026, 12, 1, tzinfo=UTC)
    store.put_bytes(
        "raw/_index/gone.json",
        json.dumps(
            {
                "format": "orchados.raw-index/1",
                "session_id": "gone",
                "org_id": "o",
                "parcel_id": "p",
            }
        ).encode(),  # fmt: skip
    )
    partial = root / ".partial" / "raw" / "x.bin.abc"
    partial.parent.mkdir(parents=True)
    partial.write_bytes(b"x")
    _age(root, "raw/_index", now - timedelta(days=40))
    _age(root, ".partial", now - timedelta(days=40))
    res = ops.prune(store, timedelta(days=30), now=now)
    assert (res.indexes, res.uploads_aborted) == (1, 1)
    assert not partial.exists()
