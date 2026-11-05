"""Models shared by the LiDAR stages.

Every stage report carries a list of LidarMeasurement rows in the same shape, so
the upload step can turn any of them into public.measurement rows (source
algorithm) without knowing the stage.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

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
