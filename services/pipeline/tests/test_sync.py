import numpy as np
import pytest

from orchados_pipeline.models import FileRole
from orchados_pipeline.params import SyncParams
from orchados_pipeline.sync import (
    decode_qr_payload,
    encode_qr_payload,
    estimate_lag,
    fit_clock,
    scan_qr,
)
from orchados_pipeline.video import layout_parts, probe


def test_qr_payload_roundtrip():
    text = encode_qr_payload(1475000000123, "4f2a9c1e-7b2d-4e8f")
    assert text == "OQ1:1475000000123:4f2a9c1e"
    assert decode_qr_payload(text) == (1475000000123, "4f2a9c1e")
    assert decode_qr_payload("OQ1:42") == (42, None)
    assert decode_qr_payload("https://example.com") is None


def test_fit_clock_offset_and_drift():
    offset, drift_ppm = 1_475_000_000_000_000_000, 25.0
    cam = np.concatenate([np.linspace(0, 10, 100), np.linspace(3590, 3600, 100)])
    true = offset + np.round(cam * 1e9 * (1 + drift_ppm * 1e-6)).astype(np.int64)
    # Displayed values are floored to the 100 ms refresh; the estimate adds half of it.
    shown = (true // 100_000_000) * 100_000_000 + 50_000_000
    shown[5] += 3_000_000_000  # a misread QR
    fit = fit_clock(cam, shown, fit_drift=True)
    assert abs(fit.offset_ns - offset) < 10e6
    assert fit.drift_ppm == pytest.approx(drift_ppm, abs=3.0)
    assert not fit.inliers[5] and fit.inliers.sum() == 199
    assert fit.residual_rms_ms < 40


def test_fit_clock_offset_only():
    cam = np.linspace(0, 2, 20)
    gps = 10**18 + np.round(cam * 1e9).astype(np.int64) + 7_000_000
    fit = fit_clock(cam, gps, fit_drift=False)
    assert fit.drift_ppm == 0.0 and fit.offset_ns == 10**18 + 7_000_000


def test_qr_scan_on_synthetic_video(synthetic_session):
    session, truth = synthetic_session
    info = probe(session / "video" / "VID_0001.mp4")
    part = layout_parts(session, [("video/VID_0001.mp4", info)])[0]
    obs = scan_qr(part, 0, 40, 1, "start", SyncParams())
    assert {o.frame_index for o in obs} == {i for i in truth.qr_frames if i < 40}
    for o in obs:
        true_ns = truth.clock_offset_ns + o.camera_s * 1e9 * (1 + truth.clock_drift_ppm * 1e-6)
        assert 0 <= true_ns - o.gps_time_ms * 1e6 < 100e6  # shown value floors the true time
        assert o.session_tag == "synth-00"


def test_clock_from_synthetic_session(processed_run):
    ctx, _, truth = processed_run
    from orchados_pipeline.models import ClockModel, read_model

    clock = read_model(ClockModel, ctx.sync_path)
    assert clock.method == "qr_linear" and clock.n_start > 10 and clock.n_end > 10
    assert abs(clock.offset_ns - truth.clock_offset_ns) < 15e6
    # Scan window lies between the start and end QR segments.
    assert clock.scan_start_camera_s < 3.0 < clock.scan_end_camera_s
    assert clock.qr_sync_events == 2


@pytest.mark.parametrize("lag_s", [0.0, 0.137, -0.42, 1.25])
def test_estimate_lag_cross_correlation(lag_s):
    rng = np.random.default_rng(42)
    rate = 200.0
    n = 4000
    base = np.convolve(rng.normal(size=n + 400), np.hanning(25), "same")[200:-200]
    t = np.arange(n) / rate
    gyro = np.interp(t - lag_s, t, base) + rng.normal(scale=0.05, size=n)
    est = estimate_lag(base, gyro, rate, max_lag_s=2.0)
    assert est.lag_s == pytest.approx(lag_s, abs=1.5 / rate / 4)
    assert est.peak_correlation > 0.8


def test_estimate_lag_three_axis():
    rng = np.random.default_rng(1)
    rate, lag = 100.0, 0.33
    base = np.convolve(rng.normal(size=(3000, 3)).ravel(), np.ones(9) / 9, "same").reshape(3000, 3)
    t = np.arange(3000) / rate
    shifted = np.stack([np.interp(t - lag, t, base[:, k]) for k in range(3)], axis=1)
    est = estimate_lag(base, shifted, rate, max_lag_s=1.0)
    assert est.lag_s == pytest.approx(lag, abs=0.01)


def test_video_role_present(processed_run):
    ctx, _, _ = processed_run
    from orchados_pipeline.models import Manifest, read_model

    assert read_model(Manifest, ctx.manifest_path).by_role(FileRole.video)
