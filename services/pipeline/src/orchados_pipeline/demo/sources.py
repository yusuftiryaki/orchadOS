"""Source adapters of the demo dataset (docs/demo-turu.md §10.5).

`synthetic` (now): the generated orchard of dataset.py and build.py.
`showcase` (later): a published visit of a real orchard, copied with written
consent, new ids, people and phones removed, a shifted position, EXIF/XMP
stripped and faces and plates blurred. Not implemented; its builds must be
written outside the repository, never under services/pipeline, so a real image
can never be added with `git add -f`.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from .build import PIPELINE_ROOT, build

SOURCES = ("synthetic", "showcase")


class SourceError(RuntimeError):
    pass


def check_showcase_out(out: Path) -> None:
    repo = PIPELINE_ROOT.parents[1].resolve()
    target = Path(out).resolve()
    if target == repo or repo in target.parents:
        raise SourceError(f"showcase builds are written outside the repository, not under {repo}")


def build_source(
    source: str, profile: str, out: Path | None, force: bool, log: Callable[[str], None]
) -> tuple[Path, dict]:
    if source == "synthetic":
        return build(profile, out, force, log=log)
    if source == "showcase":
        if out is None:
            raise SourceError("a showcase build needs --out outside the repository")
        check_showcase_out(out)
        raise SourceError("the showcase source is not implemented yet (docs/demo-turu.md §10.5)")
    raise SourceError(f"unknown source {source}; choose from {', '.join(SOURCES)}")
