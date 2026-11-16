import struct

import pytest

from orchados_recorder.clock import (
    ClockState,
    FakeClock,
    Tracking,
    chrony_sock_sample,
    classify_clock,
    parse_chronyc_tracking,
    parse_pps_assert,
    pps_anchor,
)
from orchados_recorder.gpstime import unix_ns_to_gps_ns
from orchados_recorder.session import Anchor

# A real-shaped `chronyc -c tracking` line (14 fields).
TRACKING_PPS = (
    "50505300,PPS,1,1700000000.123456789,-0.000012000,-0.000001000,0.000002000,"
    "-12.345,0.001,0.010,0.000000001,0.000010000,16.0,Normal"
)
TRACKING_UNSYNC = "00000000,,0,0.000000000,0.000000000,0.000000000,0.000000000,0.0,0.0,0.0,1.0,1.0,0.0,Not synchronised"  # noqa: E501


def test_parse_pps_assert():
    assert parse_pps_assert("1700000000.123456789#1234\n") == (1_700_000_000_123_456_789, 1234)
    assert parse_pps_assert("0.000000000#0\n") is None
    assert parse_pps_assert("") is None
    assert parse_pps_assert("garbage") is None


def test_parse_chronyc_tracking():
    assert parse_chronyc_tracking(TRACKING_PPS) == Tracking("PPS", -12, True)
    assert parse_chronyc_tracking(TRACKING_UNSYNC).leap_ok is False
    with pytest.raises(ValueError):
        parse_chronyc_tracking("50505300,PPS")


def test_classify_clock():
    assert classify_clock(Tracking("PPS", 800, True), 0.4) == ClockState.PPS
    assert classify_clock(Tracking("PPS", -800, True), 0.4) == ClockState.PPS
    assert classify_clock(Tracking("PPS", 1500, True), 0.4) == ClockState.UNLOCKED
    assert classify_clock(Tracking("GNSS", 20000, True), None) == ClockState.COARSE
    assert classify_clock(None, None) == ClockState.UNLOCKED
    assert classify_clock(Tracking("PPS", 800, True), 2.0) == ClockState.UNLOCKED
    assert classify_clock(Tracking("PPS", 800, False), 0.4) == ClockState.UNLOCKED
    assert classify_clock(Tracking("GNSS", 20000, False), None) == ClockState.UNLOCKED
    assert [s.code for s in ClockState] == [0, 1, 2]


def test_pps_anchor():
    a = pps_anchor(1_700_000_000_000_200_000, 1_700_000_000_300_000_000, 50_000_000)
    assert a == Anchor(49_700_200, unix_ns_to_gps_ns(1_700_000_000_000_000_000))
    # An edge read just before the full second rounds up to it.
    a = pps_anchor(1_699_999_999_999_900_000, 1_700_000_000_000_000_000, 50_000_000)
    assert a.gps_ns == unix_ns_to_gps_ns(1_700_000_000_000_000_000)


def test_chrony_sock_sample():
    sample = chrony_sock_sample(1_700_000_000_250_000_000, -0.002)
    assert len(sample) == 40
    assert sample[-4:] == (0x534F434B).to_bytes(4, "little")
    sec, usec, offset, pulse, leap, _pad, _magic = struct.unpack("<qqdiiii", sample)
    assert (sec, usec, offset, pulse, leap) == (1_700_000_000, 250_000, -0.002, 0, 0)


def test_fake_clock_advances_together():
    c = FakeClock(mono_us=1_000, unix_ns=1_700_000_000_000_000_000)
    c.advance_us(1_500_000)
    assert c.now_mono_us() == 1_501_000
    assert c.now_unix_ns() == 1_700_000_001_500_000_000
    # PPS: the last full second, while enabled
    assert c.pps_assert()[0] == 1_700_000_001_000_000_000
    c.pps_enabled = False
    assert c.pps_assert()[0] == 1_700_000_001_000_000_000  # the edge stays where it was
    c.advance_us(3_000_000)
    assert c.pps_assert()[0] == 1_700_000_001_000_000_000
