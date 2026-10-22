"""What to upload from a folder: a session folder, or a card, mapped to session paths.

Layouts (``--layout``, ``auto`` detects them in this order):

- ``session``: a session folder (docs/arayuzler.md "Oturum klasörü"); every file
  at its relative path.
- ``logger-card``: the GNSS logger's microSD; ``sessions/<session_id>/*`` -> ``gnss/*``.
- ``camera-card``: the 360° camera's card; camera originals under ``DCIM/`` ->
  ``camera/<path under DCIM>``. Input of the desktop stitching step (Windows
  machine); the pipeline itself reads ``video/*.mp4``.
- ``video``: a folder of exported equirectangular MP4s -> ``video/<name>``
  (e.g. Insta360 Studio's export folder on the Windows machine).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .manifest import ManifestError, check_rel

LAYOUTS = ("auto", "session", "logger-card", "camera-card", "video")
# Camera originals worth keeping; low-resolution proxies (.lrv) and thumbnails are not.
CAMERA_SUFFIXES = {".insv", ".insp", ".mp4", ".mov", ".jpg", ".jpeg", ".dng"}
JUNK = {"system volume information", "$recycle.bin", "thumbs.db", "desktop.ini", "lost+found"}


class SourceError(ValueError):
    pass


@dataclass(frozen=True)
class SourceFile:
    local: Path
    rel: str  # path inside the session folder (POSIX)

    @property
    def size(self) -> int:
        return self.local.stat().st_size


@dataclass
class SourcePlan:
    layout: str
    files: list[SourceFile]
    # Ids found in the source (session.json files); None when not present.
    session_id: str | None = None
    org_id: str | None = None
    parcel_id: str | None = None


def _visible_files(root: Path):
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root)
        if any(part.startswith(".") or part.lower() in JUNK for part in rel.parts):
            continue
        if p.is_file():
            yield p, rel.as_posix()


def _read_ids(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SourceError(f"{path}: not readable JSON ({exc})") from exc
    return {k: d.get(k) for k in ("session_id", "org_id", "parcel_id") if d.get(k)}


def detect(root: Path, session_id: str) -> str:
    if (root / "session.json").is_file() or (root / "gnss").is_dir() or (root / "video").is_dir():
        return "session"
    if (root / "sessions" / session_id).is_dir():
        return "logger-card"
    if (root / "DCIM").is_dir():
        return "camera-card"
    if any(p.suffix.lower() == ".mp4" for p in root.glob("*")):
        return "video"
    raise SourceError(
        f"{root}: not a session folder, logger card (sessions/{session_id}/), camera card "
        "(DCIM/) or a folder of MP4s; pass --layout"
    )


def plan(root: Path, session_id: str, layout: str = "auto") -> SourcePlan:
    root = Path(root)
    if not root.is_dir():
        raise SourceError(f"{root}: not a folder")
    if layout not in LAYOUTS:
        raise SourceError(f"layout must be one of {', '.join(LAYOUTS)}")
    if layout == "auto":
        layout = detect(root, session_id)

    files: list[SourceFile] = []
    ids: dict = {}
    if layout == "session":
        files = [SourceFile(p, rel) for p, rel in _visible_files(root)]
        logger = _read_ids(root / "gnss" / "session.json")
        ids = {**logger, **_read_ids(root / "session.json")}
        for k in ("session_id", "parcel_id"):
            if logger.get(k) and ids.get(k) and logger[k] != ids[k]:
                raise SourceError(f"{k} differs between session.json and gnss/session.json")
    elif layout == "logger-card":
        src = root / "sessions" / session_id
        if not src.is_dir():
            raise SourceError(f"{root}: no sessions/{session_id}/ folder on the logger card")
        files = [SourceFile(p, f"gnss/{rel}") for p, rel in _visible_files(src)]
        ids = _read_ids(src / "session.json")
    elif layout == "camera-card":
        src = root / "DCIM"
        if not src.is_dir():
            raise SourceError(f"{root}: no DCIM/ folder on the camera card")
        files = [
            SourceFile(p, f"camera/{rel}")
            for p, rel in _visible_files(src)
            if p.suffix.lower() in CAMERA_SUFFIXES
        ]
    elif layout == "video":
        files = [
            SourceFile(p, f"video/{p.name}")
            for p in sorted(root.glob("*"))
            if p.is_file() and p.suffix.lower() == ".mp4" and not p.name.startswith(".")
        ]
    if not files:
        raise SourceError(f"{root}: nothing to upload ({layout} layout)")
    for f in files:
        try:
            check_rel(f.rel)
        except ManifestError as exc:
            raise SourceError(str(exc)) from exc
    return SourcePlan(layout, files, ids.get("session_id"), ids.get("org_id"), ids.get("parcel_id"))
