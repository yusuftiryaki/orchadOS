from __future__ import annotations

import json

import pytest

from orchados_ingest.manifest import (
    Entry,
    Manifest,
    ManifestError,
    SessionIndex,
    check_rel,
    index_key,
    session_prefix,
)
from orchados_ingest.store.base import StoreError, check_key, part_ranges, part_size_for

SID = "4f2a9c1e-7b2d-4e8f-9a51-0c3d2e1f6a7b"


def test_layout():
    assert session_prefix("o", "p", SID) == f"raw/o/p/{SID}/"
    assert index_key(SID) == f"raw/_index/{SID}.json"
    for bad in ("../x", "a/b", "", "a" * 65, "x y"):
        with pytest.raises(ManifestError):
            session_prefix(bad, "p", SID)


@pytest.mark.parametrize("path", ["../a", "/a", "a//b", "a/./b", "C:/x", "a\\b", ""])
def test_bad_relative_paths(path):
    with pytest.raises(ManifestError):
        check_rel(path)


def test_store_keys():
    assert check_key("raw/a/b.mp4") == "raw/a/b.mp4"
    for bad in ("", "/a", "a/../b", "a//b", "a\\b"):
        with pytest.raises(StoreError):
            check_key(bad)


def test_manifest_roundtrip_has_only_ids_names_sizes_hashes():
    m = Manifest(SID, "org", "parcel")
    m.merge([Entry("video/VID_1.mp4", 10, "a" * 64), Entry("session.json", 3, "b" * 64)])
    d = json.loads(m.to_json())
    assert set(d) == {
        "format",
        "session_id",
        "org_id",
        "parcel_id",
        "created_at",
        "updated_at",
        "tool",
        "file_count",
        "total_bytes",
        "files",
    }
    assert all(set(f) == {"path", "size", "sha256"} for f in d["files"])
    assert [f["path"] for f in d["files"]] == ["session.json", "video/VID_1.mp4"]
    back = Manifest.from_json(m.to_json())
    assert back.files == m.files and back.total_bytes == 13


def test_merge_refuses_other_content():
    m = Manifest(SID, "o", "p")
    m.merge([Entry("a", 1, "x" * 64)])
    assert m.merge([Entry("a", 1, "y" * 64)]) == ["a"]
    assert m.files["a"].sha256 == "x" * 64
    m.merge([Entry("a", 1, "y" * 64)], replace=True)
    assert m.files["a"].sha256 == "y" * 64
    assert m.merge([Entry("a", 1, "y" * 64), Entry("b", 2, "z" * 64)]) == []


def test_index_roundtrip():
    idx = SessionIndex(SID, "o", "p")
    assert SessionIndex.from_json(idx.to_json()) == idx
    assert json.loads(idx.to_json())["prefix"] == f"raw/o/p/{SID}/"
    with pytest.raises(ManifestError):
        SessionIndex.from_json(b'{"format": "x"}')


def test_part_sizing():
    mib = 1024 * 1024
    assert part_size_for(10 * mib, 64 * mib) == 64 * mib
    # 1 TB file: parts grow so that it fits in 10,000
    big = 1000 * 1000 * mib
    assert big / part_size_for(big, 64 * mib) <= 10_000
    assert part_ranges(10, 4) == [(1, 0, 4), (2, 4, 4), (3, 8, 2)]
    assert part_ranges(8, 4) == [(1, 0, 4), (2, 4, 4)]
