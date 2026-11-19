"""Point-LIO front end: runs the Docker image deploy/lidar-frontends/point-lio.

Point-LIO and its ROS 2 port are GPL-2.0; the pipeline never links to them. It writes
the image's input (segments.json), runs the image as a separate process and reads the
orchados.lio_frontend/1 output back (spec 2026-11-18 §5.3-5.4):

    docker run --rm --network none --user <uid>:<gid>
      -v <session>:/in/session:ro -v <segments.json>:/in/segments.json:ro
      [-v <restamped>:/in/restamped:ro] [-v <other bag folder>:/in/extra/<n>:ro]
      -v <work>/frontend:/out <image>

MCAP paths in segments.json are relative to /in/session for bag folders inside the
session, absolute container paths otherwise. A segment that needs restamping (§5.2)
and still points into the session gets a restamped copy under <work>/point_lio/;
one already restamped by the caller (bag folders outside the session) is used as is.

Every mounted path is the session, a file or folder under the work folder (inputs,
restamped copies, output) or a bag folder given by the caller. With the processing
container calling Docker through the host's socket, those must exist at the same path
on the host: orchados-process keeps the session, the output and TMPDIR on the work disk
mounted at the same path inside and out, so no path is translated here. The image runs
as the calling user (--user uid:gid) so its output stays deletable by that user.

method_version is the image's first 12 hex digits of its content id followed by the
image's own version (Point-LIO commit and recipe), e.g. 620f44875c70-a8e2d0d-r2:
the registration's version keeps its first 12 characters (§5.6).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import uuid
from collections.abc import Sequence
from pathlib import Path

from ..rawlog import RAW_DIR, Segment, mcap_files, write_restamped
from . import FrontendError, FrontendResult, frontend_dir, read_frontend_output

DEFAULT_IMAGE = "orchados-lio-point-lio:local"
IMAGE_ENV = "ORCHADOS_POINT_LIO_IMAGE"
RECIPE_DIR = "deploy/lidar-frontends/point-lio"
INPUT_DIR = "point_lio"  # under the work folder: segments.json, restamped copies
SESSION_MOUNT = "/in/session"
RESTAMP_MOUNT = "/in/restamped"
EXTRA_MOUNT = "/in/extra"
LOG_TAIL_LINES = 30


def _host(path: Path) -> Path:
    """Absolute path for a `docker run -v`, symlinks kept: the processing container
    mounts its work disk at the same path as the host (deploy/processing), so the
    path as given is the host's; resolving symlinks could leave that disk."""
    return Path(os.path.abspath(path))


def _within(path: Path, root: Path) -> Path | None:
    try:
        return path.resolve().relative_to(root.resolve())
    except ValueError:
        return None


class PointLioFrontend:
    method = "point_lio"

    def __init__(
        self,
        image: str | None = None,
        rate: float = 1.0,
        docker: str = "docker",
        *,
        blind_m: float = 0.6,
        keyframe_dist_m: float = 0.5,
        keyframe_angle_deg: float = 10.0,
        keyframe_dt_s: float = 1.0,
        docker_args: Sequence[str] = (),
        timeout_s: float | None = None,
    ):
        self.image = image or os.environ.get(IMAGE_ENV) or DEFAULT_IMAGE
        if not rate > 0:
            raise ValueError(f"rate must be > 0, got {rate}")
        self.rate = float(rate)
        self.docker = docker
        # Raw points closer than this to the LiDAR are dropped before deskewing
        # (Point-LIO's preprocess.blind): the kit's mast would otherwise be smeared
        # along the path in a moving keyframe and escape the registration's cone mask.
        self.blind_m = float(blind_m)
        self.keyframe = {
            "dist_m": float(keyframe_dist_m),
            "angle_deg": float(keyframe_angle_deg),
            "dt_s": float(keyframe_dt_s),
        }
        self.docker_args = list(docker_args)
        self.timeout_s = timeout_s
        self.method_version = ""  # set by run() from the image

    # -- image ------------------------------------------------------------------

    def _docker_exe(self) -> str:
        exe = shutil.which(self.docker)
        if exe is None:
            raise FrontendError(
                f"point_lio front end: {self.docker!r} not found; Docker is needed to run "
                f"the image {self.image} (or use --frontend fake on synthetic sessions)"
            )
        return exe

    def image_info(self) -> dict:
        """{'id': 'sha256:…', 'version': '<commit[:7]>-r<recipe>'} from docker image inspect."""
        exe = self._docker_exe()
        try:
            out = subprocess.run(
                [exe, "image", "inspect", "--format", "{{json .}}", self.image],
                capture_output=True,
                text=True,
                check=False,
                timeout=60,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise FrontendError(f"point_lio front end: docker image inspect: {exc}") from exc
        if out.returncode != 0:
            msg = (out.stderr or out.stdout).strip().splitlines()
            raise FrontendError(
                f"point_lio front end: image {self.image} not available "
                f"({msg[-1] if msg else f'exit {out.returncode}'}); build it with "
                f"`docker build -t {self.image} {RECIPE_DIR}`"
            )
        try:
            body = json.loads(out.stdout.strip().splitlines()[0])
            if isinstance(body, list):
                body = body[0]
            image_id = str(body["Id"])
            env = dict(e.split("=", 1) for e in (body.get("Config") or {}).get("Env") or [])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise FrontendError(
                f"point_lio front end: unexpected image inspect output: {exc}"
            ) from exc
        commit = env.get("POINT_LIO_COMMIT", "unknown")
        recipe = env.get("ORCHADOS_RECIPE_VERSION", "0")
        return {"id": image_id, "version": f"{commit[:7]}-r{recipe}"}

    @staticmethod
    def version_of(info: dict) -> str:
        digest = info["id"].split(":", 1)[-1]
        return f"{digest[:12]}-{info['version']}"

    # -- input ------------------------------------------------------------------

    def prepare(
        self, session_dir: Path, segments: list[Segment], work_dir: Path
    ) -> tuple[dict, list[tuple[Path, str]]]:
        """segments.json body and the extra read-only mounts (host dir, container dir)."""
        session_dir = Path(session_dir)
        input_dir = Path(work_dir) / INPUT_DIR
        raw = session_dir / RAW_DIR
        extra: dict[Path, str] = {}
        restamp_root = input_dir / "restamped"
        out_segments = []
        for seg in segments:
            if seg.skip_reason is not None:
                continue
            bags = [Path(b) for b in seg.bag_dirs]
            if seg.needs_restamp and all(_within(b, raw) is not None for b in bags):
                copy = write_restamped(seg, restamp_root / f"seg{seg.index}")
                bags = [copy.parent]
            paths = []
            for bag in bags:
                for f in mcap_files(bag):
                    if f.stat().st_size == 0:
                        continue
                    paths.append(self._container_path(f, session_dir, restamp_root, extra))
            out_segments.append(
                {
                    "index": seg.index,
                    "mcap": paths,
                    "start_gps_ns": int(seg.start_gps_ns),
                    "end_gps_ns": int(seg.end_gps_ns),
                }
            )
        spec = {
            "segments": out_segments,
            "rate": self.rate,
            "keyframe": self.keyframe,
            "blind_m": self.blind_m,
        }
        mounts = []
        if restamp_root.is_dir():
            mounts.append((restamp_root, RESTAMP_MOUNT))
        mounts += sorted(extra.items(), key=lambda kv: kv[1])
        return spec, mounts

    @staticmethod
    def _container_path(f: Path, session: Path, restamp_root: Path, extra: dict) -> str:
        rel = _within(f, session)
        if rel is not None:
            return rel.as_posix()
        rel = _within(f, restamp_root)
        if rel is not None:
            return f"{RESTAMP_MOUNT}/{rel.as_posix()}"
        parent = _host(f).parent
        if parent not in extra:
            extra[parent] = f"{EXTRA_MOUNT}/{len(extra)}"
        return f"{extra[parent]}/{f.name}"

    def command(
        self,
        session_dir: Path,
        segments_json: Path,
        out_dir: Path,
        mounts: list[tuple[Path, str]],
        docker: str | None = None,
        name: str | None = None,
    ) -> list[str]:
        cmd = [docker or self.docker, "run", "--rm", "--network", "none"]
        if hasattr(os, "getuid"):
            cmd += ["--user", f"{os.getuid()}:{os.getgid()}"]
        if name:
            cmd += ["--name", name]
        cmd += ["-v", f"{_host(session_dir)}:{SESSION_MOUNT}:ro"]
        cmd += ["-v", f"{_host(segments_json)}:/in/segments.json:ro"]
        for host, inside in mounts:
            cmd += ["-v", f"{_host(host)}:{inside}:ro"]
        cmd += ["-v", f"{_host(out_dir)}:/out"]
        cmd += self.docker_args
        cmd.append(self.image)
        return cmd

    # -- run --------------------------------------------------------------------

    def run(self, session_dir: Path, segments: list[Segment], work_dir: Path) -> FrontendResult:
        exe = self._docker_exe()
        info = self.image_info()
        self.method_version = self.version_of(info)
        work_dir = Path(work_dir)
        input_dir = work_dir / INPUT_DIR
        out_dir = frontend_dir(work_dir)
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True)
        input_dir.mkdir(parents=True, exist_ok=True)
        try:
            spec, mounts = self.prepare(session_dir, segments, work_dir)
            segments_json = input_dir / "segments.json"
            segments_json.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
            name = f"orchados-point-lio-{uuid.uuid4().hex[:8]}"
            cmd = self.command(session_dir, segments_json, out_dir, mounts, exe, name)
            log_path = input_dir / "docker.log"
            with open(log_path, "w", encoding="utf-8") as log:
                try:
                    proc = subprocess.run(
                        cmd,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                        check=False,
                        timeout=self.timeout_s,
                    )
                except subprocess.TimeoutExpired as exc:
                    subprocess.run([exe, "kill", name], capture_output=True, check=False)
                    raise FrontendError(
                        f"point_lio front end: no result within {self.timeout_s} s"
                    ) from exc
                except OSError as exc:
                    raise FrontendError(f"point_lio front end: docker run: {exc}") from exc
            if proc.returncode != 0:
                lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                tail = "\n".join(lines[-LOG_TAIL_LINES:])
                raise FrontendError(
                    f"point_lio front end: image {self.image} exited with {proc.returncode}; "
                    f"last output:\n{tail}"
                )
            self._stamp_version(out_dir, info)
            result = read_frontend_output(work_dir)
        finally:
            # Restamped copies are large and only the image needs them.
            shutil.rmtree(input_dir / "restamped", ignore_errors=True)
        if result.method != self.method:
            raise FrontendError(f"point_lio front end: output method {result.method!r}")
        return result

    def _stamp_version(self, out_dir: Path, info: dict) -> None:
        """frontend.json: method_version with the image id; the image's own version kept."""
        path = out_dir / "frontend.json"
        try:
            body = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise FrontendError(f"point_lio front end: {path}: {exc}") from exc
        if body.get("blind_m") is None:
            # Images before recipe 2 ignore blind_m: the mast would stay in the scans.
            raise FrontendError(
                f"point_lio front end: image {self.image} ({body.get('method_version')}) does "
                f"not apply blind_m; rebuild it with `docker build -t {self.image} {RECIPE_DIR}`"
            )
        own = body.get("method_version")
        body["image"] = {"name": self.image, "id": info["id"], "version": own}
        body["method_version"] = self.version_of(info)
        path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
