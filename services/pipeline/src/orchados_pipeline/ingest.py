"""Stage 1 – ingest: validate the session folder and hash every input file."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

from .context import RunContext
from .events import KNOWN_TYPES, EventsFormatError, read_events
from .hashing import sha256_file
from .models import FileRole, Manifest, ManifestFile, SessionInfo, VideoInfo, write_model
from .ubx import ScanStats, iter_frames
from .video import VideoError, probe

SESSION_JSON = "session.json"
UBX_PATH = "gnss/gnss.ubx"
EVENTS_PATH = "gnss/events.csv"
VIDEO_DIR = "video"
BASE_DIR = "base"


class IngestError(RuntimeError):
    def __init__(self, session_dir: Path, problems: list[str]):
        self.problems = problems
        lines = "\n".join(f"  - {p}" for p in problems)
        super().__init__(f"invalid session folder {session_dir}:\n{lines}")


def rinex_kind(path: Path) -> FileRole | None:
    """Classify a RINEX file by its first header line (columns 21-40)."""
    try:
        with open(path, encoding="ascii", errors="replace") as f:
            first = f.readline()
    except OSError:
        return None
    if "RINEX VERSION" not in first:
        return None
    kind = first[20:40].upper()
    if kind.startswith("O"):
        return FileRole.base_obs
    if kind[:1] in {"N", "G", "H", "L", "C", "M"} or "NAV" in kind:
        return FileRole.base_nav
    return None


def _scan_ubx(path: Path) -> ScanStats:
    stats = ScanStats()
    for _ in iter_frames(path.read_bytes(), stats):
        pass
    return stats


def build_manifest(ctx: RunContext) -> Manifest:
    root = ctx.session_dir
    problems: list[str] = []
    warnings: list[str] = []
    if not root.is_dir():
        raise IngestError(root, ["session folder does not exist"])

    session: SessionInfo | None = None
    sj = root / SESSION_JSON
    if not sj.is_file():
        problems.append(f"missing {SESSION_JSON}")
    else:
        try:
            session = SessionInfo.model_validate(json.loads(sj.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            problems.append(f"{SESSION_JSON}: not valid JSON ({exc})")
        except ValidationError as exc:
            fields = ", ".join(".".join(map(str, e["loc"])) for e in exc.errors())
            problems.append(f"{SESSION_JSON}: invalid or missing fields: {fields}")

    ubx_counts: dict[str, int] = {}
    ubx = root / UBX_PATH
    if not ubx.is_file():
        problems.append(f"missing {UBX_PATH}")
    elif ubx.stat().st_size == 0:
        problems.append(f"{UBX_PATH} is empty")
    else:
        stats = _scan_ubx(ubx)
        ubx_counts = dict(sorted(stats.frames.items()))
        if stats.total == 0:
            problems.append(f"{UBX_PATH}: no valid UBX frames")
        else:
            if not stats.frames.get("NAV-PVT") and not stats.frames.get("RXM-RAWX"):
                problems.append(f"{UBX_PATH}: neither NAV-PVT nor RXM-RAWX frames")
            if stats.bad_checksum:
                warnings.append(f"{UBX_PATH}: {stats.bad_checksum} frames with bad checksum")
            if stats.truncated_tail:
                warnings.append(f"{UBX_PATH}: truncated last frame ({stats.truncated_tail} B)")

    event_counts: dict[str, int] = {}
    ev = root / EVENTS_PATH
    if not ev.is_file():
        problems.append(f"missing {EVENTS_PATH}")
    else:
        try:
            counts = Counter(e.event_type for e in read_events(ev))
            event_counts = dict(sorted(counts.items()))
            unknown = sorted(set(counts) - KNOWN_TYPES)
            if unknown:
                warnings.append(f"{EVENTS_PATH}: unknown event types {unknown}")
        except (EventsFormatError, UnicodeDecodeError) as exc:
            problems.append(f"{EVENTS_PATH}: {exc}")

    videos: dict[str, VideoInfo] = {}
    vdir = root / VIDEO_DIR
    mp4s = sorted(p for p in vdir.glob("*") if p.suffix.lower() == ".mp4") if vdir.is_dir() else []
    if not mp4s:
        problems.append(f"no {VIDEO_DIR}/*.mp4 files")
    for p in mp4s:
        rel = p.relative_to(root).as_posix()
        try:
            info = probe(p)
        except VideoError as exc:
            problems.append(f"{rel}: {exc}")
            continue
        if info.width != 2 * info.height:
            problems.append(
                f"{rel}: {info.width}x{info.height} is not equirectangular (2:1 expected)"
            )
        if info.frame_count <= 0:
            problems.append(f"{rel}: frame count unknown")
        videos[rel] = info

    base_roles: dict[str, FileRole] = {}
    bdir = root / BASE_DIR
    if bdir.is_dir():
        for p in sorted(x for x in bdir.rglob("*") if x.is_file() and not x.name.startswith(".")):
            role = rinex_kind(p)
            rel = p.relative_to(root).as_posix()
            if role is None:
                warnings.append(f"{rel}: not a RINEX file, ignored")
            else:
                base_roles[rel] = role
        if base_roles and FileRole.base_obs not in base_roles.values():
            warnings.append(f"{BASE_DIR}/ has no RINEX observation file; PPK not possible")

    if problems:
        raise IngestError(root, problems)

    files: list[ManifestFile] = []
    out_root = ctx.out_root.resolve()
    for p in sorted(x for x in root.rglob("*") if x.is_file()):
        rel = p.relative_to(root).as_posix()
        if any(part.startswith(".") for part in Path(rel).parts):
            continue
        if out_root in p.resolve().parents:
            continue
        if rel == SESSION_JSON:
            role = FileRole.session_meta
        elif rel == UBX_PATH:
            role = FileRole.gnss_raw
        elif rel == EVENTS_PATH:
            role = FileRole.gnss_events
        elif rel in videos:
            role = FileRole.video
        elif rel in base_roles:
            role = base_roles[rel]
        else:
            role = FileRole.extra
        files.append(
            ManifestFile(
                path=rel,
                role=role,
                size=p.stat().st_size,
                sha256=sha256_file(p),
                video=videos.get(rel),
            )
        )

    assert session is not None
    return Manifest(
        producer=ctx.producer("ingest"),
        session=session,
        files=files,
        event_counts=event_counts,
        ubx_frame_counts=ubx_counts,
        warnings=warnings,
    )


def run(ctx: RunContext) -> Manifest:
    manifest = build_manifest(ctx)
    ctx.write_params()
    write_model(manifest, ctx.manifest_path)
    return manifest
