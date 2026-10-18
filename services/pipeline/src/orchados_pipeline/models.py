"""Data models passed between stages. Each stage writes one of these as JSON."""

from __future__ import annotations

import json
from enum import StrEnum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


def write_model(model: BaseModel, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(model.model_dump_json(indent=2, by_alias=True) + "\n", encoding="utf-8")
    return path


def read_model[T: BaseModel](cls: type[T], path: Path) -> T:
    return cls.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))


class Producer(Model):
    """Who made an output: pipeline name, version and parameter hash."""

    pipeline: str
    version: str
    params_hash: str
    stage: str


# --- session / ingest ------------------------------------------------------------


class SessionInfo(BaseModel):
    """session.json. Unknown keys written by the logger are kept."""

    model_config = ConfigDict(extra="allow")

    session_id: str
    parcel_id: str
    org_id: str | None = None
    camera_height_m: float = 2.0
    # Rig calibration: azimuth of the panorama centre relative to travel direction.
    camera_yaw_offset_deg: float | None = None


class FileRole(StrEnum):
    session_meta = "session_meta"
    gnss_raw = "gnss_raw"
    gnss_events = "gnss_events"
    video = "video"
    base_obs = "base_obs"
    base_nav = "base_nav"
    extra = "extra"


class VideoInfo(Model):
    width: int
    height: int
    fps: float
    frame_count: int
    duration_s: float


class ManifestFile(Model):
    path: str
    role: FileRole
    size: int
    sha256: str
    video: VideoInfo | None = None


class Manifest(Model):
    schema_: Literal["orchados.manifest/1"] = Field("orchados.manifest/1", alias="schema")
    producer: Producer
    session: SessionInfo
    files: list[ManifestFile]
    event_counts: dict[str, int]
    ubx_frame_counts: dict[str, int]
    warnings: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    def by_role(self, role: FileRole) -> list[ManifestFile]:
        return [f for f in self.files if f.role == role]


# --- position --------------------------------------------------------------------


class SolutionQuality(StrEnum):
    fix = "fix"
    float = "float"
    dgps = "dgps"
    sbas = "sbas"
    ppp = "ppp"
    single = "single"


class PpkStatus(StrEnum):
    ppk = "ppk"
    no_ppk = "no_ppk"  # no base data, NAV-PVT used
    ppk_failed = "ppk_failed"  # base data present but RTKLIB gave no solution


class TrajectoryPoint(Model):
    gps_time_ns: int
    lat: float
    lon: float
    height_m: float  # ellipsoidal (WGS84)
    quality: SolutionQuality
    sd_n_m: float
    sd_e_m: float
    sd_u_m: float
    num_sv: int | None = None


class Trajectory(Model):
    producer: Producer
    source: Literal["rtklib_pos", "nav_pvt"]
    ppk_status: PpkStatus
    crs: str = "EPSG:4979"
    points: list[TrajectoryPoint]
    notes: list[str] = Field(default_factory=list)


# --- sync ------------------------------------------------------------------------


class QrObservation(Model):
    video: str
    frame_index: int
    camera_s: float
    gps_time_ms: int
    session_tag: str | None
    gps_time_ns_est: int
    cluster: Literal["start", "end"]
    inlier: bool = True


class ClockModel(Model):
    """gps_ns = offset_ns + camera_s * 1e9 * (1 + drift_ppm * 1e-6)."""

    producer: Producer
    method: Literal["qr_linear", "qr_offset_only", "manual"]
    offset_ns: int
    drift_ppm: float
    residual_rms_ms: float | None
    n_start: int
    n_end: int
    # Usable scan window in camera time: after the start QR, before the end QR.
    scan_start_camera_s: float
    scan_end_camera_s: float
    observations: list[QrObservation] = Field(default_factory=list)
    qr_sync_events: int = 0
    warnings: list[str] = Field(default_factory=list)

    def camera_to_gps_ns(self, camera_s: float) -> int:
        return self.offset_ns + round(camera_s * 1e9 * (1.0 + self.drift_ppm * 1e-6))


# --- frames ----------------------------------------------------------------------


class FrameCandidate(Model):
    video: str
    frame_index: int
    camera_s: float
    gps_time_ns: int
    lat: float
    lon: float
    height_m: float
    heading_deg: float
    along_track_m: float
    position_quality: SolutionQuality
    sd_h_m: float
    sharpness: float
    eligible: bool = True
    slice_index: int
    selected: bool = False


class FrameSelection(Model):
    producer: Producer
    slice_m: float
    median_sharpness: float
    candidates: list[FrameCandidate]
    empty_slices: list[int] = Field(default_factory=list)

    def selected(self) -> list[FrameCandidate]:
        return [c for c in self.candidates if c.selected]


# --- panoramas / crops -------------------------------------------------------------


class FileRef(Model):
    path: str  # relative to the run directory
    sha256: str
    size: int
    media_type: str
    width: int | None = None
    height: int | None = None


class Pose(Model):
    lat: float
    lon: float
    height_m: float
    heading_deg: float
    crs: str = "EPSG:4979"
    sd_h_m: float
    quality: SolutionQuality


class PanoramaRecord(Model):
    schema_: Literal["orchados.panorama/1"] = Field("orchados.panorama/1", alias="schema")
    panorama_id: str
    session_id: str
    gps_time_ns: int
    utc: str
    pose: Pose
    quality_score: float
    sharpness: float
    source_video: str
    source_video_sha256: str
    frame_index: int
    camera_s: float
    image: FileRef
    preview: FileRef
    filters_applied: list[str] = Field(default_factory=list)
    producer: Producer

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PanoramaSet(Model):
    producer: Producer
    panoramas: list[PanoramaRecord]
    sidecars: list[FileRef]


class Tree(BaseModel):
    model_config = ConfigDict(extra="allow")

    tree_id: str
    slot_code: str
    lat: float
    lon: float


class CropRecord(Model):
    schema_: Literal["orchados.tree_crop/1"] = Field("orchados.tree_crop/1", alias="schema")
    tree_id: str
    slot_code: str
    direction: Literal["N", "E", "S", "W"]  # side of the tree the camera was on
    panorama_id: str
    panorama_sha256: str
    gps_time_ns: int
    distance_m: float
    azimuth_deg: float  # camera -> tree, from north, clockwise
    yaw_in_panorama_deg: float
    pitch_deg: float
    fov_deg: float
    score: float
    image: FileRef
    producer: Producer

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CropSet(Model):
    producer: Producer
    crops: list[CropRecord]
    sidecars: list[FileRef]
    trees_without_crops: list[str] = Field(default_factory=list)
