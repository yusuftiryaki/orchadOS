"""Models shared by the LiDAR stages.

Every stage report carries a list of LidarMeasurement rows in the same shape, so
the upload step can turn any of them into public.measurement rows (source
algorithm) without knowing the stage.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import Field

from ..hashing import hash_object
from ..models import Model, Producer


class CloudMeta(Model):
    """<session>/lidar/cloud.json: how the registered cloud was made and where it is.

    Points in cloud.ply are metres in a local tangent plane: x east, y north,
    z up, relative to (origin_lat, origin_lon, origin_height_m). Heights are
    ellipsoidal (WGS84), like the trajectory.
    """

    schema_: Literal["orchados.lidar_cloud/1"] = Field("orchados.lidar_cloud/1", alias="schema")
    session_id: str
    parcel_id: str
    origin_lat: float
    origin_lon: float
    origin_height_m: float
    # GPS time span of the scan, integer ns since the GPS epoch (docs/arayuzler.md).
    gps_time_start_ns: int | None = None
    gps_time_end_ns: int | None = None
    # Registration that produced the cloud, e.g. "fast_lio2+ppk" / "synthetic".
    registration_method: str
    registration_version: str
    # 1-sigma point noise the registration reports (range noise + drift), metres.
    point_sigma_m: float = 0.03
    sensor: str | None = None  # e.g. "livox_mid360"
    calibration_id: str | None = None

    model_config = {"extra": "forbid", "populate_by_name": True}


class LidarMeasurement(Model):
    """One measured value of one metric for one tree.

    metric is a public.metric_definition code. Exactly one of value_numeric and
    value_category is set, matching the metric's value_type. uncertainty is in the
    metric's unit (1 sigma) and required for numeric values (docs/veri-modeli.md).
    """

    tree_id: str
    slot_code: str | None = None
    metric: str
    value_numeric: float | None = None
    value_category: str | None = None
    unit: str | None = None
    uncertainty: float | None = None
    confidence: float | None = Field(None, ge=0, le=1)
    method: str
    method_version: str


class TreeQuality(Model):
    """Why a tree's measurements can or cannot be trusted."""

    tree_id: str
    slot_code: str | None = None
    n_points: int
    # Share of 8 azimuth sectors (45 deg) around the trunk that hold points.
    sector_coverage: float
    status: Literal["ok", "too_few_points", "one_sided", "no_points"]
    notes: list[str] = Field(default_factory=list)


class LidarReport(Model):
    """Common header of crown.json / skeleton.json / pruning.json."""

    producer: Producer
    method: str
    method_version: str
    session_id: str
    parcel_id: str
    trees: list[TreeQuality] = Field(default_factory=list)
    measurements: list[LidarMeasurement] = Field(default_factory=list)


# --- registration (raw MCAP -> registered cloud) ------------------------------------


class RegistrationThresholds(Model):
    """Quality gate of a registration (spec 2026-11-18 §5.7; start values, tuned on pilot data).

    rejected_auto: coverage below reject_min_coverage, or (PPK) GNSS residual p95 above
    reject_gnss_p95_m, or trunk spread p95 above reject_trunk_spread_m, or no segment
    ran. accepted_auto: PPK and residual p95 <= accept_gnss_p95_m and trunk spread p95
    <= accept_trunk_spread_m over at least accept_min_trees trees and coverage >=
    accept_min_coverage. Anything else: review.
    """

    reject_min_coverage: float = 0.5
    reject_gnss_p95_m: float = 1.0
    reject_trunk_spread_m: float = 0.5
    accept_gnss_p95_m: float = 0.15
    accept_trunk_spread_m: float = 0.15
    accept_min_trees: int = 10
    accept_min_coverage: float = 0.9


class RegistrationParams(Model):
    """Parameters of lidar register. Their hash names the output folder."""

    # Front end (lidar/frontend): point_lio | fake.
    frontend: str = "point_lio"
    # Segments (§5.2): split at LiDAR gaps longer than gap_split_s and at each bag.N/,
    # drop segments shorter than min_segment_s.
    gap_split_s: float = 2.0
    min_segment_s: float = 20.0
    # Restamp a segment when |header.stamp - log_time| exceeds this or the stamp clock's
    # rate differs from the log clock's by more than restamp_max_slope_dev.
    restamp_max_offset_s: float = 0.05
    restamp_max_slope_dev: float = 1e-4
    # IMU rate expected from the L2 driver (measured on the bench after the driver fix);
    # a segment below min_imu_rate_ratio of it is skipped (imu_rate_low).
    expected_imu_hz: float = 250.0
    min_imu_rate_ratio: float = 0.5
    # Keyframe spacing the front end uses: whichever comes first.
    keyframe_dist_m: float = 0.5
    keyframe_angle_deg: float = 10.0
    keyframe_dt_s: float = 1.0
    # Pose graph (§5.5). Between factors: sigma grows with the distance between keyframes.
    between_sigma_m_per_m: float = 0.01
    between_sigma_deg_per_m: float = 0.1
    between_sigma_min_m: float = 0.003
    between_sigma_min_deg: float = 0.05
    # Prior on the roll and pitch of each segment's first keyframe (the front end's odometry
    # frame is gravity aligned); keeps a straight segment's roll about its line determined.
    level_prior_sigma_deg: float = 3.0
    # GNSS factors: sigma = max(trajectory sd, floor of the solution quality); Huber kernel.
    gnss_sigma_fix_m: float = 0.02
    gnss_sigma_float_m: float = 0.3
    gnss_sigma_other_m: float = 2.0
    gnss_huber_k: float = 1.345
    # A keyframe gets a GNSS factor only between two trajectory points at most this far
    # apart in time (no interpolation across trajectory gaps).
    gnss_max_gap_s: float = 1.0
    # LiDAR body frame -> antenna phase centre, metres (from calibration once measured).
    lever_arm_m: tuple[float, float, float] = (0.0, 0.0, 0.5)
    # Cloud (§5.6): self mask (points closer than self_mask_radius_m, and points in a cone
    # of self_mask_cone_deg around the lever arm direction closer than
    # self_mask_cone_range_m: the mast and the antenna), voxel dedupe.
    self_mask_radius_m: float = 0.4
    self_mask_cone_deg: float = 10.0
    self_mask_cone_range_m: float = 3.0
    voxel_m: float = 0.01
    # 1-sigma point noise of the front end's scans (added to the GNSS residual in cloud.json).
    frontend_point_sigma_m: float = 0.02
    sensor: str = "unitree_l2"
    # Trunk consistency (§5.7, §5.11): trunk candidates from the cloud.
    trunk_band_m: tuple[float, float] = (0.5, 1.5)
    trunk_cell_m: float = 0.3
    trunk_max_width_m: float = 0.9
    trunk_min_points: int = 15
    trunk_radius_m: float = 1.0
    trunk_pass_range_m: float = 10.0
    ground_cell_m: float = 1.0
    thresholds: RegistrationThresholds = Field(default_factory=RegistrationThresholds)

    def params_hash(self) -> str:
        return hash_object(self.model_dump(mode="json"))

    @classmethod
    def load(cls, path: Path | None = None) -> RegistrationParams:
        if path is None:
            return cls()
        return cls.model_validate(json.loads(Path(path).read_text(encoding="utf-8")))
