"""Pipeline parameters. Every output carries the hash of these parameters."""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from .hashing import hash_object


class _Section(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PositionParams(_Section):
    # Elevation mask and frequencies handed to rnx2rtkp.
    elevation_mask_deg: float = 15.0
    frequencies: str = "l1+l2"
    navsys: list[str] = Field(default_factory=lambda: ["gps", "glo", "gal", "bds"])
    ar_mode: str = "fix-and-hold"
    rinex_version: str = "3.04"
    # When PPK fails (no solutions), fall back to NAV-PVT instead of aborting.
    ppk_fallback: bool = True


class SyncParams(_Section):
    qr_search_s: float = 20.0
    qr_frame_stride: int = 1
    # The phone refreshes the QR every qr_refresh_ms; the shown value is the
    # start of that interval, so half of it is added as the expected time.
    qr_refresh_ms: float = 100.0
    qr_display_latency_ms: float = 0.0
    min_pairs: int = 3
    outlier_mad_k: float = 5.0
    # Escape hatch when no QR is readable: camera_s -> gps_ns = offset + camera_s * 1e9.
    manual_offset_ns: int | None = None


class FrameParams(_Section):
    candidate_fps: float = 5.0
    slice_m: float = 3.5
    # Candidates sharper than this fraction of the median are eligible.
    min_relative_sharpness: float = 0.35
    # Sharpness is measured on a central horizontal band (sky and the pole are masked).
    band_top: float = 0.30
    band_bottom: float = 0.75
    sharpness_width: int = 1920
    heading_window_s: float = 1.0
    min_heading_baseline_m: float = 0.3
    max_trajectory_gap_s: float = 2.0
    # Azimuth of the equirectangular centre column relative to the direction of travel.
    camera_yaw_offset_deg: float = 0.0


class PanoramaParams(_Section):
    full_size: tuple[int, int] = (3840, 1920)
    preview_size: tuple[int, int] = (1920, 960)
    full_quality: int = 85
    preview_quality: int = 80


class CropParams(_Section):
    size: int = 1024
    jpeg_quality: int = 90
    max_distance_m: float = 12.0
    min_distance_m: float = 1.0
    ideal_distance_m: float = 4.0
    distance_sigma_m: float = 3.0
    target_height_m: float = 1.5
    crown_width_m: float = 5.0
    min_fov_deg: float = 50.0
    max_fov_deg: float = 110.0


class PipelineParams(_Section):
    position: PositionParams = Field(default_factory=PositionParams)
    sync: SyncParams = Field(default_factory=SyncParams)
    frames: FrameParams = Field(default_factory=FrameParams)
    panoramas: PanoramaParams = Field(default_factory=PanoramaParams)
    crops: CropParams = Field(default_factory=CropParams)

    def params_hash(self) -> str:
        return hash_object(self.model_dump(mode="json"))

    @classmethod
    def load(cls, path: Path | None) -> PipelineParams:
        if path is None:
            return cls()
        return cls.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
