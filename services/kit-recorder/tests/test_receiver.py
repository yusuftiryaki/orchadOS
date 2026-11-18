from orchados_recorder.clock import FakeClock
from orchados_recorder.receiver import (
    RECEIVER_INFO,
    USB_CONFIG,
    FakeTransport,
    Receiver,
)
from orchados_recorder.ubx import NavPvt, build_nav_pvt, frame

PVT = NavPvt(
    i_tow_ms=33320000, year=2026, month=10, day=18, hour=9, minute=15, second=2,
    valid=0x07, fix_type=3, flags=0x81, num_sv=27,
    lon_e7=373830000, lat_e7=370662000, height_mm=892340, h_acc_mm=14,
)  # fmt: skip
PVT_PAYLOAD = build_nav_pvt(PVT)


def nothing(*_):
    return None


def test_usb_config_keys():
    keys = {k: (v, size) for k, v, size in USB_CONFIG}
    assert keys[0x10780002] == (0, 1)  # NMEA off on USB
    assert keys[0x30210001] == (200, 2)  # 5 Hz measurements
    assert keys[0x209102A7] == (5, 1)  # RAWX on USB, 1 Hz
    assert keys[0x20910234] == (1, 1)  # every SFRBX
    assert keys[0x20910009] == (1, 1)  # NAV-PVT, 5 Hz
    assert keys[0x2005000C] == (1, 1)  # PPS on the GPS grid


def test_receiver_info_for_session_json():
    assert RECEIVER_INFO["port"] == "USB"
    assert RECEIVER_INFO["baud"] is None and RECEIVER_INFO["detected_baud"] is None
    assert RECEIVER_INFO["messages"] == ["RXM-RAWX", "RXM-SFRBX", "NAV-PVT"]
    assert RECEIVER_INFO["meas_period_ms"] == 200 and RECEIVER_INFO["nav_pvt_rate_hz"] == 5


def test_configure_sends_usb_keys_and_waits_for_ack():
    t = FakeTransport(respond_to_valset="ack")
    r = Receiver(t, nothing, nothing)
    assert r.configure() == "ok"
    assert r.config_status == "ok"
    sent = t.written[0]
    assert (0x209102A7).to_bytes(4, "little") + b"\x05" in sent  # RAWX on USB, 1 Hz
    assert (0x10780002).to_bytes(4, "little") + b"\x00" in sent  # NMEA off on USB


def test_configure_reports_nak_and_no_response():
    assert Receiver(FakeTransport(respond_to_valset="nak"), nothing, nothing).configure() == "nak"
    t = FakeTransport(respond_to_valset=None)
    assert Receiver(t, nothing, nothing).configure(timeout_s=0.01) == "no_response"
    assert len(t.written) == 3  # three attempts


def test_configuration_bytes_are_not_recorded():
    got = []
    t = FakeTransport(script=[frame(0x02, 0x15, bytes(16))], respond_to_valset="ack")
    r = Receiver(t, got.append, nothing)
    assert r.configure() == "ok"
    r.poll()
    assert got == []


def test_reconfigures_after_usb_reconnect():
    t = FakeTransport(respond_to_valset="ack")
    r = Receiver(t, nothing, nothing)
    r.configure()
    t.disconnect()
    r.poll()
    t.reconnect()
    r.poll()
    valsets = [w for w in t.written if w[2:4] == b"\x06\x8a"]
    assert len(valsets) == 2
    assert r.config_status == "ok"


def test_poll_passes_raw_bytes_through_and_decodes_pvt():
    pvt = frame(0x01, 0x07, PVT_PAYLOAD)
    rawx = frame(0x02, 0x15, bytes(16))
    got, pvts = [], []
    clock = FakeClock()
    r = Receiver(
        FakeTransport(script=[rawx + pvt[:20], pvt[20:]]),
        got.append,
        lambda p, n: pvts.append((p, n)),
        clock=clock,
    )
    r.poll()
    r.poll()
    assert b"".join(got) == rawx + pvt and len(pvts) == 1
    assert pvts[0] == (PVT, clock.now_unix_ns())
    assert r.last_pvt == PVT
    assert r.last_rx_mono_us == clock.now_mono_us()


def test_no_data_keeps_last_rx_time():
    clock = FakeClock()
    r = Receiver(FakeTransport(script=[b"\xb5"]), nothing, nothing, clock=clock)
    assert r.last_rx_mono_us is None
    r.poll()
    first = r.last_rx_mono_us
    clock.advance_us(5_000_000)
    r.poll()
    assert r.last_rx_mono_us == first
