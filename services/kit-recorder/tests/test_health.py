from orchados_recorder.clock import ClockState
from orchados_recorder.health import LiveHealth, precheck_failures
from orchados_recorder.protocol import Alert, Check
from orchados_recorder.ssd import SsdStatus


def test_precheck_all_pass(healthy):
    assert precheck_failures(healthy(t=10_000_000)) == Check(0)


def test_precheck_lidar_rate_low(healthy):
    assert precheck_failures(healthy(lidar_pps=20_000)) == Check.LIDAR


def test_precheck_lidar_silent_or_never_seen(healthy):
    assert precheck_failures(healthy(t=10_000_000, lidar_last=6_000_000)) == Check.LIDAR
    assert precheck_failures(healthy(lidar_last_mono_us=None, lidar_pps=0)) == Check.LIDAR


def test_precheck_unknown_mode_passes(healthy):
    assert Check.LIDAR_MODE not in precheck_failures(healthy(lidar_mode="unknown"))
    assert precheck_failures(healthy(lidar_mode="wrong")) == Check.LIDAR_MODE


def test_precheck_clock_and_ssd(healthy):
    failures = precheck_failures(
        healthy(clock=ClockState.COARSE, ssd=SsdStatus(True, 10_000, False))
    )
    assert failures == Check.CLOCK | Check.SSD


def test_precheck_gnss(healthy):
    assert precheck_failures(healthy(rx_config="nak")) == Check.GNSS
    assert precheck_failures(healthy(t=10_000_000, gnss_last_mono_us=5_000_000)) == Check.GNSS
    assert precheck_failures(healthy(gnss_last_mono_us=None)) == Check.GNSS


def test_lidar_gap_opens_and_closes_once(healthy):
    h = LiveHealth(0)
    a, ev = h.update(healthy(t=1_000_000, lidar_last=1_000_000))
    assert a == Alert(0) and ev == []
    a, ev = h.update(healthy(t=5_000_000, lidar_last=1_000_000))
    assert Alert.LIDAR_SILENT in a and ev == [("lidar_lost", "")]
    a, ev = h.update(healthy(t=6_000_000, lidar_last=1_000_000))
    assert ev == []
    a, ev = h.update(healthy(t=7_000_000, lidar_last=7_000_000))
    assert ev == [("lidar_regained", "")] and h.gap_count == 1 and h.longest_gap_s == 6
    assert Alert.LIDAR_SILENT not in a
    assert h.gaps == [
        {
            "start_gps_ns": None,
            "end_gps_ns": None,
            "start_mono_us": 1_000_000,
            "end_mono_us": 7_000_000,
            "duration_s": 6.0,
        }
    ]
    assert h.alert_log == [{"type": "lidar_silent", "first_mono_us": 5_000_000, "count": 1}]


def test_gap_gps_times_with_locked_clock(healthy):
    h = LiveHealth(0)
    gps = 1_476_350_120_000_000_000
    h.update(healthy(t=1_000_000, lidar_last=1_000_000, gps_ns=gps))
    h.update(healthy(t=5_000_000, lidar_last=1_000_000, gps_ns=gps + 4 * 10**9))
    h.update(healthy(t=7_000_000, lidar_last=7_000_000, gps_ns=gps + 6 * 10**9))
    assert h.gaps[0]["start_gps_ns"] == gps and h.gaps[0]["end_gps_ns"] == gps + 6 * 10**9


def test_gap_open_at_stop_is_closed_by_finish(healthy):
    h = LiveHealth(0)
    h.update(healthy(t=1_000_000, lidar_last=1_000_000))
    h.update(healthy(t=9_000_000, lidar_last=1_000_000))
    h.finish(9_500_000, None)
    assert h.gap_count == 1 and h.gaps[0]["end_mono_us"] == 9_500_000


def test_alert_when_bag_bytes_stall_while_points_arrive(healthy):
    h = LiveHealth(0)
    for t in range(1, 25):  # seconds; bag_bytes frozen from t=5
        a, _ = h.update(
            healthy(t=t * 1_000_000, lidar_last=t * 1_000_000, bag_bytes=min(t, 5) * 10**6)
        )
        if t < 15:
            assert Alert.LIDAR_NOT_WRITTEN not in a
    assert Alert.LIDAR_NOT_WRITTEN in a and Alert.LIDAR_SILENT not in a


def test_no_stall_alert_in_the_first_seconds(healthy):
    h = LiveHealth(0)
    for t in range(1, 10):
        a, _ = h.update(healthy(t=t * 1_000_000, bag_bytes=0))
        assert Alert.LIDAR_NOT_WRITTEN not in a


def test_dead_bag_process_is_not_written(healthy):
    h = LiveHealth(0)
    a, ev = h.update(healthy(t=1_000_000, bag_alive=False))
    assert Alert.LIDAR_NOT_WRITTEN in a
    assert ev == [("sd_error", "lidar_write")]
    a, ev = h.update(healthy(t=2_000_000, bag_alive=False))
    assert ev == []


def test_gnss_lost_and_regained(healthy):
    h = LiveHealth(0)
    h.update(healthy(t=1_000_000))
    a, ev = h.update(healthy(t=5_000_000, gnss_last_mono_us=1_000_000))
    assert Alert.GNSS_SILENT in a and ev == [("gnss_lost", "")]
    a, ev = h.update(healthy(t=6_000_000))
    assert Alert.GNSS_SILENT not in a and ev == [("gnss_regained", "")]


def test_other_alerts(healthy):
    h = LiveHealth(0)
    a, _ = h.update(healthy(lidar_pps=10_000, clock=ClockState.COARSE))
    assert a == Alert.LIDAR_RATE_LOW | Alert.CLOCK_UNLOCKED
    a, _ = h.update(healthy(ssd=SsdStatus(True, 10 * 1024, False)))
    assert a == Alert.SSD_LOW
    a, _ = h.update(healthy(ssd=SsdStatus(True, 100 * 1024, True)))
    assert a == Alert.SSD_ERROR
    a, _ = h.update(healthy(clock=ClockState.COARSE))
    a, _ = h.update(healthy())
    a, _ = h.update(healthy(clock=ClockState.UNLOCKED))
    counts = {e["type"]: e["count"] for e in h.alert_log}
    assert counts["clock_unlocked"] == 3 and counts["ssd_low"] == 1


def test_every_bag_death_is_logged_and_a_restart_gets_a_grace_period(healthy):
    h = LiveHealth(0)
    s = 1_000_000
    _, ev = h.update(healthy(t=20 * s, bag_bytes=100))
    _, ev = h.update(healthy(t=21 * s, bag_bytes=100, bag_alive=False))
    assert ev == [("sd_error", "lidar_write")]
    _, ev = h.update(healthy(t=30 * s, bag_bytes=100, bag_alive=False))
    assert ev == []
    # Restarted: the new process has BAG_STALL_S to write its first chunk.
    a, ev = h.update(healthy(t=31 * s, bag_bytes=100))
    assert ev == [] and Alert.LIDAR_NOT_WRITTEN not in a
    a, _ = h.update(healthy(t=40 * s, bag_bytes=100))
    assert Alert.LIDAR_NOT_WRITTEN not in a
    a, _ = h.update(healthy(t=41 * s, bag_bytes=100))
    assert Alert.LIDAR_NOT_WRITTEN in a
    _, ev = h.update(healthy(t=42 * s, bag_bytes=100, bag_alive=False))
    assert ev == [("sd_error", "lidar_write")]  # died again
