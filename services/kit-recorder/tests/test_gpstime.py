from orchados_recorder.gpstime import (
    LEAP_SECONDS,
    gps_ns_to_unix_ns,
    gps_ns_to_utc_iso,
    unix_ns_to_gps_ns,
)


def test_gps_epoch_offset():
    # 2026-10-18T09:15:02.500Z (firmware README example) in Unix ns
    unix_ns = 1_792_314_902_500_000_000
    assert LEAP_SECONDS == 18
    assert unix_ns_to_gps_ns(unix_ns) == unix_ns - 315_964_800_000_000_000 + 18_000_000_000
    assert gps_ns_to_utc_iso(unix_ns_to_gps_ns(unix_ns)) == "2026-10-18T09:15:02.500Z"


def test_readme_session_start_time():
    # gnss/session.json example in the firmware README
    assert unix_ns_to_gps_ns(1_792_314_902_500_000_000) == 1476350120500000000


def test_round_trip_and_millisecond_floor():
    gps = 1476350120_999_999_999
    assert unix_ns_to_gps_ns(gps_ns_to_unix_ns(gps)) == gps
    assert gps_ns_to_utc_iso(gps) == "2026-10-18T09:15:02.999Z"
    assert gps_ns_to_utc_iso(0) == "1980-01-05T23:59:42.000Z"
