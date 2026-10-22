"""The same behaviour from every backend (local, MinIO for S3, Azurite for Azure)."""

from __future__ import annotations

import hashlib
import random

import pytest
from conftest import PART

from orchados_ingest.store import StoreError
from orchados_ingest.transfer import Progress, Transfer


class Interrupted(BaseException):
    """Like Ctrl-C: not an Exception, so SDK retry loops do not swallow it."""


class InterruptingProgress(Progress):
    """Raises once `budget` bytes have moved: a cut connection in the middle of a part."""

    def __init__(self, total: int, budget: int):
        super().__init__("test", total, quiet=True)
        self.budget = budget

    def advance(self, n: int) -> None:
        super().advance(n)
        if self.moved > self.budget:
            raise Interrupted(f"cut after {self.moved} bytes")


def _file(tmp_path, size: int, seed: int = 7, name: str = "f.bin"):
    p = tmp_path / name
    p.write_bytes(random.Random(seed).randbytes(size))
    return p, hashlib.sha256(p.read_bytes()).hexdigest()


def test_small_object_lifecycle(store, tmp_path):
    p, sha = _file(tmp_path, 1000)
    assert store.stat("raw/a/f.bin") is None and not store.exists("raw/a/f.bin")
    assert store.upload(p, "raw/a/f.bin", sha) is True
    info = store.stat("raw/a/f.bin")
    assert (info.size, info.sha256) == (1000, sha)
    assert store.upload(p, "raw/a/f.bin", sha) is False  # already complete
    assert b"".join(store.read_chunks("raw/a/f.bin", 600)) == p.read_bytes()[600:]
    store.put_bytes("raw/a/m.json", b"{}")
    assert store.get_bytes("raw/a/m.json") == b"{}"
    assert store.get_bytes("raw/a/none.json") is None
    assert sorted(o.key for o in store.list("raw/a/")) == ["raw/a/f.bin", "raw/a/m.json"]
    assert [o.key for o in store.list("raw/b/")] == []
    store.delete("raw/a/f.bin")
    store.delete("raw/a/f.bin")  # missing: no error
    assert not store.exists("raw/a/f.bin")
    with pytest.raises(StoreError):
        list(store.read_chunks("raw/a/f.bin"))


def test_multipart_upload(store, tmp_path):
    p, sha = _file(tmp_path, 2 * PART + 12345)
    t = Transfer(Progress("t", p.stat().st_size, quiet=True))
    assert store.upload(p, "raw/big.bin", sha, t) is True
    assert t.progress.moved == p.stat().st_size
    info = store.stat("raw/big.bin")
    assert (info.size, info.sha256) == (p.stat().st_size, sha)
    got = hashlib.sha256(b"".join(store.read_chunks("raw/big.bin"))).hexdigest()
    assert got == sha


def test_interrupted_upload_resumes(store, tmp_path):
    store.concurrency = 1  # deterministic: part 1 done, cut inside part 2
    p, sha = _file(tmp_path, 3 * PART + 999)
    size = p.stat().st_size
    with pytest.raises(Interrupted):
        store.upload(p, "raw/r.bin", sha, Transfer(InterruptingProgress(size, PART + PART // 2)))
    assert store.stat("raw/r.bin") is None  # nothing visible until complete

    again = Progress("t", size, quiet=True)
    assert store.upload(p, "raw/r.bin", sha, Transfer(again)) is True
    assert again.skipped >= PART  # part 1 was not sent again
    assert again.moved <= size - PART
    info = store.stat("raw/r.bin")
    assert (info.size, info.sha256) == (size, sha)
    assert hashlib.sha256(b"".join(store.read_chunks("raw/r.bin"))).hexdigest() == sha


def test_changed_file_does_not_reuse_parts(store, tmp_path):
    store.concurrency = 1
    p, sha = _file(tmp_path, 2 * PART + 10, seed=1)
    with pytest.raises(Interrupted):
        store.upload(p, "raw/c.bin", sha, Transfer(InterruptingProgress(p.stat().st_size, PART)))
    p2, sha2 = _file(tmp_path, 2 * PART + 10, seed=2, name="g.bin")
    assert store.upload(p2, "raw/c.bin", sha2) is True
    assert store.stat("raw/c.bin").sha256 == sha2
    assert hashlib.sha256(b"".join(store.read_chunks("raw/c.bin"))).hexdigest() == sha2
