"""push, pull, verify, list and prune on top of a RawStore."""

from __future__ import annotations

import fnmatch
import hashlib
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .hashing import CHUNK, HashCache, sha256_file
from .manifest import (
    INDEX_DIR,
    MANIFEST_REL,
    RAW,
    Entry,
    Manifest,
    ManifestError,
    SessionIndex,
    check_id,
    check_rel,
    index_key,
)
from .sources import SourceFile, plan
from .store import RawStore, StoreError
from .store.base import part_size_for
from .transfer import Limiter, Progress, Transfer


class IngestError(RuntimeError):
    pass


# --- lookup -------------------------------------------------------------------
def read_index(store: RawStore, session_id: str) -> SessionIndex | None:
    data = store.get_bytes(index_key(session_id))
    return SessionIndex.from_json(data) if data is not None else None


def read_manifest(store: RawStore, idx: SessionIndex) -> Manifest | None:
    data = store.get_bytes(idx.prefix + MANIFEST_REL)
    return Manifest.from_json(data) if data is not None else None


def require_session(store: RawStore, session_id: str) -> tuple[SessionIndex, Manifest]:
    idx = read_index(store, session_id)
    if idx is None:
        raise IngestError(f"session {session_id} is not in the store ({store.describe()})")
    man = read_manifest(store, idx)
    if man is None:
        raise IngestError(f"session {session_id} has no manifest: push did not finish")
    return idx, man


# --- push ---------------------------------------------------------------------
@dataclass
class PushResult:
    session_id: str
    prefix: str
    uploaded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    bytes_total: int = 0
    manifest: Manifest | None = None


def _resolve_ids(
    session_id: str,
    found: dict[str, str | None],
    given: dict[str, str | None],
    idx: SessionIndex | None,
) -> tuple[str, str]:
    if found.get("session_id") and found["session_id"] != session_id:
        raise IngestError(
            f"session.json says session {found['session_id']}, --session-id is {session_id}"
        )
    out = {}
    for k in ("org_id", "parcel_id"):
        candidates = {
            "--" + k.replace("_", "-"): given.get(k),
            "session.json": found.get(k),
            "store index": getattr(idx, k) if idx else None,
        }
        values = {v for v in candidates.values() if v}
        if len(values) > 1:
            where = ", ".join(f"{s}={v}" for s, v in candidates.items() if v)
            raise IngestError(f"{k} disagrees: {where}")
        if not values:
            raise IngestError(
                f"{k} unknown: not in session.json and session {session_id} is not in the "
                f"store yet; pass --{k.replace('_', '-')}"
            )
        out[k] = check_id(k, values.pop())
    return out["org_id"], out["parcel_id"]


def push(
    store: RawStore,
    source: Path,
    session_id: str,
    *,
    layout: str = "auto",
    org_id: str | None = None,
    parcel_id: str | None = None,
    limiter: Limiter | None = None,
    hash_cache: HashCache | None = None,
    replace: bool = False,
    quiet: bool = False,
    dry_run: bool = False,
) -> PushResult:
    check_id("session id", session_id)
    src = plan(source, session_id, layout)
    idx = read_index(store, session_id)
    org, parcel = _resolve_ids(
        session_id,
        {"session_id": src.session_id, "org_id": src.org_id, "parcel_id": src.parcel_id},
        {"org_id": org_id, "parcel_id": parcel_id},
        idx,
    )
    idx = SessionIndex(session_id, org, parcel)
    man = read_manifest(store, idx) or Manifest(session_id, org, parcel)
    if (man.org_id, man.parcel_id) != (org, parcel):
        raise IngestError("store manifest belongs to another org or parcel")

    total = sum(f.size for f in src.files)
    hashing = Progress("hash", total, quiet=quiet)
    cache = hash_cache or HashCache(None)
    entries = [Entry(f.rel, f.size, cache.sha256(f.local, hashing)) for f in src.files]
    hashing.finish()
    conflicts = Manifest(session_id, org, parcel, dict(man.files)).merge(entries, replace)
    if conflicts and not replace:
        raise IngestError(
            "already in the store with other content (raw media is immutable; "
            f"--replace to overwrite): {', '.join(conflicts)}"
        )

    res = PushResult(session_id, idx.prefix, bytes_total=total)
    if dry_run:
        res.skipped = [e.path for e in entries]
        return res
    store.put_bytes(index_key(session_id), idx.to_json())

    progress = Progress("push", total, quiet=quiet)
    transfer = Transfer(progress, limiter)
    by_rel = {e.path: e for e in entries}

    def one(f: SourceFile) -> None:
        sent = store.upload(f.local, idx.prefix + f.rel, by_rel[f.rel].sha256, transfer)
        if sent:
            res.uploaded.append(f.rel)
        else:
            progress.skip(f.size)
            res.skipped.append(f.rel)

    # Large files one after another (their parts go in parallel), small ones in parallel.
    large = [f for f in src.files if f.size > part_size_for(f.size, store.part_size)]
    small = [f for f in src.files if f not in large]
    for f in large:
        one(f)
    if small:
        with ThreadPoolExecutor(max_workers=store.concurrency) as pool:
            for fut in [pool.submit(one, f) for f in small]:
                fut.result()
    progress.finish()

    man.merge(entries, replace=True)
    store.put_bytes(idx.prefix + MANIFEST_REL, man.to_json())
    res.manifest = man
    return res


# --- pull ---------------------------------------------------------------------
@dataclass
class PullResult:
    session_id: str
    dest: Path
    downloaded: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def select(entries, include: list[str] | None, exclude: list[str] | None) -> list[Entry]:
    out = []
    for e in entries:
        if include and not any(fnmatch.fnmatch(e.path, p) for p in include):
            continue
        if exclude and any(fnmatch.fnmatch(e.path, p) for p in exclude):
            continue
        out.append(e)
    return out


def _download(store: RawStore, key: str, e: Entry, dest: Path, transfer: Transfer) -> bool:
    """Fetch one file with resume and SHA-256 check. False when it was already there."""
    if dest.is_file() and dest.stat().st_size == e.size and sha256_file(dest) == e.sha256:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    h = hashlib.sha256()
    have = part.stat().st_size if part.exists() else 0
    if have > e.size:
        part.unlink()
        have = 0
    if have:
        with part.open("rb") as fh:
            while chunk := fh.read(CHUNK):
                h.update(chunk)
        if transfer.progress:
            transfer.progress.skip(have)
    if have < e.size:
        with part.open("ab") as out:
            for chunk in store.read_chunks(key, have):
                out.write(chunk)
                h.update(chunk)
                transfer.moved(len(chunk))
    if part.stat().st_size != e.size or h.hexdigest() != e.sha256:
        part.unlink()
        raise IngestError(f"{e.path}: checksum mismatch after download (removed, run pull again)")
    os.replace(part, dest)
    return True


def pull(
    store: RawStore,
    session_id: str,
    dest: Path,
    *,
    include: list[str] | None = None,
    exclude: list[str] | None = None,
    limiter: Limiter | None = None,
    quiet: bool = False,
) -> PullResult:
    idx, man = require_session(store, session_id)
    entries = select(man.files.values(), include, exclude)
    if not entries:
        raise IngestError("no files match --include/--exclude")
    dest = Path(dest)
    progress = Progress("pull", sum(e.size for e in entries), quiet=quiet)
    transfer = Transfer(progress, limiter)
    res = PullResult(session_id, dest)

    def one(e: Entry) -> None:
        target = dest.joinpath(*check_rel(e.path).split("/"))
        if _download(store, idx.prefix + e.path, e, target, transfer):
            res.downloaded.append(e.path)
        else:
            progress.skip(e.size)
            res.skipped.append(e.path)

    with ThreadPoolExecutor(max_workers=store.concurrency) as pool:
        for fut in [pool.submit(one, e) for e in entries]:
            fut.result()
    progress.finish()
    local = dest.joinpath(*MANIFEST_REL.split("/"))
    local.parent.mkdir(parents=True, exist_ok=True)
    location = {"store": store.describe(), "uri": session_uri(store, idx.prefix)}
    local.write_bytes(man.to_json(location))
    return res


def session_uri(store: RawStore, prefix: str) -> str:
    """Uri of a session prefix ('raw/<org>/<parcel>/<session>/'), ending with '/'."""
    return store.uri(prefix.rstrip("/")) + "/"


# --- verify -------------------------------------------------------------------
@dataclass
class VerifyReport:
    session_id: str
    checked: int = 0
    problems: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def verify(
    store: RawStore,
    session_id: str,
    *,
    local: Path | None = None,
    deep: bool = False,
) -> VerifyReport:
    """Store objects (and optionally a local copy) against the manifest.

    Store check: every file exists with its size and SHA-256 metadata; `deep`
    downloads and hashes the content. Objects under the session not in the
    manifest are reported as notes (a push that did not finish).
    """
    idx, man = require_session(store, session_id)
    rep = VerifyReport(session_id)
    listed = {o.key[len(idx.prefix) :] for o in store.list(idx.prefix)}
    for e in sorted(man.files.values(), key=lambda e: e.path):
        rep.checked += 1
        if local is not None:
            p = Path(local).joinpath(*e.path.split("/"))
            if not p.is_file():
                rep.problems.append(f"{e.path}: missing locally")
            elif p.stat().st_size != e.size:
                rep.problems.append(f"{e.path}: local size {p.stat().st_size}, manifest {e.size}")
            elif sha256_file(p) != e.sha256:
                rep.problems.append(f"{e.path}: local SHA-256 differs from the manifest")
            continue
        info = store.stat(idx.prefix + e.path)
        if info is None:
            rep.problems.append(f"{e.path}: missing in the store")
            continue
        if info.size != e.size:
            rep.problems.append(f"{e.path}: store size {info.size}, manifest {e.size}")
            continue
        if info.sha256 and info.sha256 != e.sha256:
            rep.problems.append(f"{e.path}: store SHA-256 metadata differs from the manifest")
            continue
        if deep or not info.sha256:
            h = hashlib.sha256()
            for chunk in store.read_chunks(idx.prefix + e.path):
                h.update(chunk)
            if h.hexdigest() != e.sha256:
                rep.problems.append(f"{e.path}: store content SHA-256 differs from the manifest")
    if local is None:
        extra = sorted(listed - set(man.files) - {MANIFEST_REL})
        for k in extra:
            rep.notes.append(f"{k}: in the store but not in the manifest")
    return rep


# --- list ---------------------------------------------------------------------
@dataclass
class SessionSummary:
    session_id: str
    org_id: str
    parcel_id: str
    files: int
    bytes: int
    complete: bool
    last_modified: datetime | None


def list_sessions(store: RawStore) -> list[SessionSummary]:
    newest = _newest_by_session(store)
    out = []
    for o in store.list(INDEX_DIR + "/"):
        sid = o.key.rsplit("/", 1)[-1].removesuffix(".json")
        try:
            idx = read_index(store, sid)
        except (ValueError, ManifestError):
            continue
        if idx is None:
            continue
        man = read_manifest(store, idx)
        out.append(
            SessionSummary(
                sid,
                idx.org_id,
                idx.parcel_id,
                len(man.files) if man else 0,
                man.total_bytes if man else 0,
                man is not None,
                newest.get(idx.prefix),
            )
        )
    return sorted(out, key=lambda s: s.last_modified or datetime.min.replace(tzinfo=UTC))


# --- prune --------------------------------------------------------------------
_DURATION = re.compile(r"^(\d+)\s*([smhdw])$")
_UNITS = {"s": "seconds", "m": "minutes", "h": "hours", "d": "days", "w": "weeks"}


def parse_duration(spec: str) -> timedelta:
    """'30d', '12h', '2w', '90m', '45s'."""
    m = _DURATION.match(spec.strip().lower())
    if not m or int(m.group(1)) <= 0:
        raise ValueError(f"duration must look like 30d, 12h or 2w, not {spec!r}")
    return timedelta(**{_UNITS[m.group(2)]: int(m.group(1))})


def _session_prefix_of(key: str) -> str | None:
    parts = key.split("/")
    if len(parts) >= 5 and parts[0] == RAW and parts[1] != "_index":
        return "/".join(parts[:4]) + "/"
    return None


def _newest_by_session(store: RawStore) -> dict[str, datetime]:
    newest: dict[str, datetime] = {}
    for o in store.list(RAW + "/"):
        p = _session_prefix_of(o.key)
        if p and (p not in newest or o.last_modified > newest[p]):
            newest[p] = o.last_modified
    return newest


@dataclass
class PruneResult:
    cutoff: datetime
    sessions: list[str] = field(default_factory=list)  # session prefixes removed
    objects: int = 0
    bytes: int = 0
    indexes: int = 0
    uploads_aborted: int = 0


def prune(
    store: RawStore,
    older_than: timedelta,
    *,
    now: datetime | None = None,
    dry_run: bool = False,
) -> PruneResult:
    """Delete sessions whose newest object is older than the cutoff.

    A session is removed as a whole (files, manifest, index) once nothing in it
    changed for `older_than`; a session that just got its exported video stays.
    Unfinished multipart uploads older than the cutoff are aborted too.
    """
    now = now or datetime.now(UTC)
    cutoff = now - older_than
    res = PruneResult(cutoff)
    objects: dict[str, list] = {}
    for o in store.list(RAW + "/"):
        p = _session_prefix_of(o.key)
        if p:
            objects.setdefault(p, []).append(o)
    for prefix, objs in sorted(objects.items()):
        if max(o.last_modified for o in objs) >= cutoff:
            continue
        res.sessions.append(prefix)
        for o in objs:
            res.objects += 1
            res.bytes += o.size
            if not dry_run:
                store.delete(o.key)
    # Index entries whose session is gone (or never got files) and are old enough.
    live = {p for p in objects if p not in res.sessions}
    for o in store.list(INDEX_DIR + "/"):
        sid = o.key.rsplit("/", 1)[-1].removesuffix(".json")
        try:
            idx = read_index(store, sid)
        except (ValueError, ManifestError, StoreError):
            idx = None
        if idx is not None and idx.prefix in live:
            continue
        pruned_now = idx is not None and idx.prefix in res.sessions
        if not pruned_now and o.last_modified >= cutoff:
            continue
        res.indexes += 1
        if not dry_run:
            store.delete(o.key)
    res.uploads_aborted = store.abort_stale_uploads(cutoff, dry_run=dry_run)
    return res
