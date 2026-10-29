"""Stage 3 – sync: camera clock -> GPS time.

Coarse sync: QR codes shown by the field app at the start and end of the scan
carry GPS time; a linear fit gives the offset and the clock drift.
Fine sync: cross-correlation of the camera gyro with a reference angular rate
(the gyro file reader is not part of this version, see README).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

import cv2
import numpy as np

from .context import RunContext
from .events import GnssEvent, read_events
from .gpstime import utc_to_gps_ns
from .ingest import EVENTS_PATH
from .models import (
    ClockModel,
    FileRole,
    Manifest,
    QrObservation,
    QrSyncCheck,
    Trajectory,
    write_model,
)
from .video import VideoPart, iter_frames, layout_parts

# OQ1:<gps_time_ms>[:<session_tag>]
QR_RE = re.compile(r"^OQ1:(\d{1,16})(?::([A-Za-z0-9_-]{1,36}))?$")
SESSION_TAG_LEN = 8


class SyncError(RuntimeError):
    pass


def encode_qr_payload(gps_time_ms: int, session_id: str | None = None) -> str:
    text = f"OQ1:{gps_time_ms}"
    if session_id:
        text += ":" + session_tag(session_id)
    return text


def session_tag(session_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", session_id)[:SESSION_TAG_LEN]


def decode_qr_payload(text: str) -> tuple[int, str | None] | None:
    m = QR_RE.match(text.strip())
    if not m:
        return None
    return int(m.group(1)), m.group(2)


def decode_event_payload(text: str) -> tuple[int, str | None] | None:
    """GPS ms (and session tag) from a qr_sync event payload.

    The contract is the QR text itself (OQ1:...). An ISO-8601 UTC time, as in
    the İP2 README example, is accepted too and converted to GPS time.
    """
    decoded = decode_qr_payload(text)
    if decoded is not None:
        return decoded
    t = text.strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}T", t):
        return None
    try:
        utc = datetime.fromisoformat(t)
    except ValueError:
        return None
    if utc.tzinfo is None:
        return None
    return utc_to_gps_ns(utc) // 1_000_000, None


# --- QR scanning ---------------------------------------------------------------------


def scan_qr(
    part: VideoPart, first: int, last: int, stride: int, cluster: str, params
) -> list[QrObservation]:
    detectors = (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco())
    wanted = set(range(first, last, max(1, stride)))
    bias_ns = round((params.qr_refresh_ms / 2 + params.qr_display_latency_ms) * 1e6)
    obs: list[QrObservation] = []
    for idx, frame in iter_frames(part.path, wanted, start=first, stop=last):
        text = _detect(detectors, frame)
        decoded = decode_qr_payload(text) if text else None
        if decoded is None:
            continue
        ms, tag = decoded
        obs.append(
            QrObservation(
                video=part.rel,
                frame_index=idx,
                camera_s=part.camera_s(idx),
                gps_time_ms=ms,
                session_tag=tag,
                gps_time_ns_est=ms * 1_000_000 + bias_ns,
                cluster=cluster,
            )
        )
    return obs


def _detect(detectors, frame) -> str:
    """QR text of a frame, or "".

    The classic detector's finder-pattern search can fail to locate a perfectly
    sharp code when the surroundings are textured (foliage, soil, compression
    noise): whether it does depends on the background and the payload, not on
    the code's quality. On a miss the frame is retried binarised (Otsu), which
    removes the texture, and then with the ArUco-based detector, which locates
    the finder patterns differently. Each reading is still validated by the QR
    error correction and by QR_RE.
    """
    detector, fallback = detectors
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    images = [gray]
    if gray.shape[1] > 2000:  # large frames: retry at half size
        images.append(cv2.resize(gray, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
    for img in images:
        text, _, _ = detector.detectAndDecode(img)
        if text:
            return text
    for img in images:
        _, binary = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        text, _, _ = detector.detectAndDecode(binary)
        if text:
            return text
    for img in images:
        text, _, _ = fallback.detectAndDecode(img)
        if text:
            return text
    return ""


# --- clock fit -----------------------------------------------------------------------


@dataclass(frozen=True)
class ClockFit:
    offset_ns: int
    drift_ppm: float
    residual_rms_ms: float
    inliers: np.ndarray


def fit_clock(
    camera_s: np.ndarray, gps_ns: np.ndarray, fit_drift: bool, mad_k: float = 5.0
) -> ClockFit:
    """Least-squares gps = offset + camera_s * 1e9 * (1 + drift), with MAD outlier rejection."""
    camera_s = np.asarray(camera_s, dtype=float)
    gps_ns = np.asarray(gps_ns, dtype=np.int64)
    ref = int(gps_ns[0])
    # Work in seconds relative to the first observation to keep precision.
    y = (gps_ns - ref) / 1e9 - camera_s
    mask = np.ones(len(y), dtype=bool)
    for _ in range(3):
        if fit_drift:
            slope, intercept = np.polyfit(camera_s[mask], y[mask], 1)
        else:
            slope, intercept = 0.0, float(np.mean(y[mask]))
        resid = y - (intercept + slope * camera_s)
        mad = float(np.median(np.abs(resid[mask] - np.median(resid[mask]))))
        new_mask = np.abs(resid) <= max(mad_k * 1.4826 * mad, 1e-3)
        if new_mask.sum() < 2 or np.array_equal(new_mask, mask):
            break
        mask = new_mask
    resid = (y - (intercept + slope * camera_s))[mask]
    return ClockFit(
        offset_ns=ref + round(intercept * 1e9),
        drift_ppm=float(slope * 1e6),
        residual_rms_ms=float(np.sqrt(np.mean(resid**2)) * 1e3),
        inliers=mask,
    )


def compute_clock(ctx: RunContext, manifest: Manifest) -> ClockModel:
    p = ctx.params.sync
    files = [(f.path, f.video) for f in manifest.by_role(FileRole.video)]
    parts = layout_parts(ctx.session_dir, files)
    first, last = parts[0], parts[-1]
    total_end = last.end_camera_s
    producer = ctx.producer("sync")
    warnings: list[str] = []

    ev = ctx.session_dir / EVENTS_PATH
    qr_events = [e for e in read_events(ev) if e.event_type == "qr_sync"] if ev.is_file() else []

    n_first = min(first.info.frame_count, round(p.qr_search_s * first.info.fps))
    start_obs = scan_qr(first, 0, n_first, p.qr_frame_stride, "start", p)
    n_last = min(last.info.frame_count, round(p.qr_search_s * last.info.fps))
    end_first = last.info.frame_count - n_last
    if last is first:
        end_first = max(end_first, n_first)
    end_obs = scan_qr(last, end_first, last.info.frame_count, p.qr_frame_stride, "end", p)

    tag = session_tag(manifest.session.session_id)
    obs = []
    for o in start_obs + end_obs:
        if o.session_tag and o.session_tag != tag:
            warnings.append(f"QR from another session ignored ({o.video}#{o.frame_index})")
            continue
        obs.append(o)
    start_obs = [o for o in obs if o.cluster == "start"]
    end_obs = [o for o in obs if o.cluster == "end"]

    checks = check_qr_events(qr_events, obs, tag, p)
    warnings += [c.warning for c in checks if c.warning]

    scan_start = max((o.camera_s for o in start_obs), default=0.0)
    scan_end = min((o.camera_s for o in end_obs), default=total_end)

    if len(obs) < p.min_pairs:
        if p.manual_offset_ns is None:
            raise SyncError(
                f"only {len(obs)} readable QR time codes (need {p.min_pairs}); "
                "set sync.manual_offset_ns to process without them"
            )
        return ClockModel(
            producer=producer,
            method="manual",
            offset_ns=p.manual_offset_ns,
            drift_ppm=0.0,
            residual_rms_ms=None,
            n_start=len(start_obs),
            n_end=len(end_obs),
            scan_start_camera_s=scan_start,
            scan_end_camera_s=scan_end,
            observations=obs,
            qr_sync_events=len(qr_events),
            qr_sync_checks=checks,
            warnings=warnings + ["manual offset used"],
        )

    fit_drift = len(start_obs) >= 2 and len(end_obs) >= 2
    if not fit_drift:
        warnings.append("QR found only at one end of the recording: drift not estimated")
    fit = fit_clock(
        np.array([o.camera_s for o in obs]),
        np.array([o.gps_time_ns_est for o in obs]),
        fit_drift,
        p.outlier_mad_k,
    )
    for o, ok in zip(obs, fit.inliers, strict=True):
        o.inlier = bool(ok)
    if (~fit.inliers).any():
        warnings.append(f"{int((~fit.inliers).sum())} QR observations rejected as outliers")
    return ClockModel(
        producer=producer,
        method="qr_linear" if fit_drift else "qr_offset_only",
        offset_ns=fit.offset_ns,
        drift_ppm=fit.drift_ppm,
        residual_rms_ms=fit.residual_rms_ms,
        n_start=len(start_obs),
        n_end=len(end_obs),
        scan_start_camera_s=scan_start,
        scan_end_camera_s=scan_end,
        observations=obs,
        qr_sync_events=len(qr_events),
        qr_sync_checks=checks,
        warnings=warnings,
    )


def check_qr_events(
    events: list[GnssEvent], obs: list[QrObservation], tag: str, params
) -> list[QrSyncCheck]:
    """Compare each qr_sync event's QR value with its GPS time and with the video readings.

    Reported only; the clock fit uses the video readings alone.
    """
    video_ms = np.array([o.gps_time_ms for o in obs if o.inlier], dtype=np.int64)
    checks = []
    for e in events:
        decoded = decode_event_payload(e.payload)
        check = QrSyncCheck(
            line=e.line,
            payload=e.payload,
            qr_gps_time_ms=decoded[0] if decoded else None,
            event_gps_time_ns=e.gps_time_ns,
            gps_time_derived=e.gps_time_derived,
        )
        where = f"qr_sync event (events.csv line {e.line})"
        problems = []
        if decoded is None:
            problems.append(f"payload {e.payload!r} is not a QR time code")
        else:
            qr_ms, qr_tag = decoded
            if qr_tag and qr_tag != tag:
                problems.append(f"QR session tag {qr_tag!r} does not match {tag!r}")
            if e.gps_time_ns is None:
                problems.append("no GPS time (no PPS anchor)")
            else:
                diff = (e.gps_time_ns - qr_ms * 1_000_000) / 1e6
                check.event_minus_qr_ms = diff
                if abs(diff) > params.qr_event_max_diff_ms:
                    hint = (
                        " (phone shows UTC instead of GPS time?)"
                        if 17_000 < abs(diff) < 19_000
                        else ""
                    )
                    problems.append(
                        f"event GPS time differs from the QR value by {diff:.0f} ms{hint}"
                    )
            if len(video_ms):
                nearest = video_ms[np.argmin(np.abs(video_ms - qr_ms))]
                check.nearest_video_qr_ms = float(nearest - qr_ms)
                if abs(nearest - qr_ms) > params.qr_event_video_max_gap_s * 1000:
                    problems.append(
                        f"no QR read from the video within {params.qr_event_video_max_gap_s:g} s "
                        "of its value"
                    )
        if problems:
            check.warning = f"{where}: " + "; ".join(problems)
        checks.append(check)
    return checks


def run(ctx: RunContext, manifest: Manifest) -> ClockModel:
    clock = compute_clock(ctx, manifest)
    write_model(clock, ctx.sync_path)
    return clock


# --- fine sync -----------------------------------------------------------------------


@dataclass(frozen=True)
class LagEstimate:
    lag_s: float  # positive: `signal` lags behind `reference`
    peak_correlation: float


def _prepare(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    if x.ndim == 2:  # 3-axis rates: the norm does not depend on sensor orientation
        x = np.linalg.norm(x, axis=1)
    x = x - x.mean()
    sd = x.std()
    return x / sd if sd > 0 else x


def estimate_lag(
    reference: np.ndarray, signal: np.ndarray, rate_hz: float, max_lag_s: float | None = None
) -> LagEstimate:
    """Delay of `signal` relative to `reference` by normalised cross-correlation.

    Both are sampled at `rate_hz`; 1-D or N×3 angular rates. The peak is refined
    to sub-sample precision with a parabola through its neighbours.
    """
    a, b = _prepare(reference), _prepare(signal)
    n = len(a) + len(b) - 1
    nfft = 1 << (n - 1).bit_length()
    corr = np.fft.irfft(np.fft.rfft(b, nfft) * np.conj(np.fft.rfft(a, nfft)), nfft)
    # corr[k] = sum_t b[t + k] a[t]; lags -len(a)+1 .. len(b)-1
    lags = np.concatenate([np.arange(0, len(b)), np.arange(-len(a) + 1, 0)])
    corr = np.concatenate([corr[: len(b)], corr[nfft - len(a) + 1 :]])
    overlap = np.minimum(len(a), len(b) - lags) - np.maximum(0, -lags)
    corr = corr / np.clip(overlap, 1, None)
    valid = np.ones_like(lags, dtype=bool)
    if max_lag_s is not None:
        valid &= np.abs(lags) <= max_lag_s * rate_hz
    valid &= overlap >= max(8, min(len(a), len(b)) // 4)
    if not valid.any():
        raise ValueError("signals do not overlap enough")
    idx = np.flatnonzero(valid)[np.argmax(corr[valid])]
    k = float(lags[idx])
    # Parabolic refinement using neighbouring lags.
    pos = {int(lag): i for i, lag in enumerate(lags)}
    il, ir = pos.get(int(k) - 1), pos.get(int(k) + 1)
    if il is not None and ir is not None:
        y0, y1, y2 = corr[il], corr[idx], corr[ir]
        denom = y0 - 2 * y1 + y2
        if denom != 0:
            k += 0.5 * (y0 - y2) / denom
    return LagEstimate(lag_s=float(k / rate_hz), peak_correlation=float(corr[idx]))


def heading_rate_signal(traj: Trajectory, rate_hz: float) -> tuple[np.ndarray, np.ndarray]:
    """Yaw rate (deg/s) from the GNSS track, resampled at `rate_hz`.

    A reference for fine sync on the LiDAR-less kit, where no IMU is logged.
    Returns (gps_time_ns, yaw_rate).
    """
    from .position import TrajectoryInterpolator

    interp = TrajectoryInterpolator(traj, max_gap_s=1e9)
    step = int(1e9 / rate_hz)
    times = np.arange(int(interp.t[0]), int(interp.t[-1]), step, dtype=np.int64)
    e = np.interp(times, interp.t, interp.e)
    n = np.interp(times, interp.t, interp.n)
    heading = np.unwrap(np.arctan2(np.gradient(e), np.gradient(n)))
    return times, np.degrees(np.gradient(heading)) * rate_hz
