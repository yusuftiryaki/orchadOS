import pytest

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


def test_failed_configuration_is_retried_every_few_seconds():
    clock = FakeClock()
    t = FakeTransport(respond_to_valset=None)
    r = Receiver(t, nothing, nothing, clock=clock)
    assert r.configure(timeout_s=0.01) == "no_response"
    sent = len(t.written)
    t.respond_to_valset = "ack"
    r.retry_configure(timeout_s=0.01)
    assert len(t.written) == sent  # too soon
    clock.advance_us(5_000_000)
    r.retry_configure(timeout_s=0.01)
    assert r.config_status == "ok" and len(t.written) == sent + 1
    clock.advance_us(60_000_000)
    r.retry_configure(timeout_s=0.01)
    assert len(t.written) == sent + 1  # configured: nothing more


def test_bytes_read_while_configuring_are_counted_as_discarded():
    data = frame(0x02, 0x15, bytes(16))
    t = FakeTransport(script=[data], respond_to_valset="ack")
    r = Receiver(t, nothing, nothing)
    assert r.discarded_bytes == 0
    r.configure()
    assert r.discarded_bytes == len(data) + 10  # the RAWX and the ACK


def test_configure_clears_a_pending_reconnect():
    t = FakeTransport(respond_to_valset="ack")
    t.reconnected = True  # opened before the first configuration
    r = Receiver(t, nothing, nothing)
    r.configure()
    r.poll()
    assert len([w for w in t.written if w[2:4] == b"\x06\x8a"]) == 1


class FakeSerial:
    """pyserial's Serial on a fake port."""

    opened: list = []

    def __init__(self, path, **_kw):
        self.path = path
        self.closed = False
        self.chunks = [b"\xb5\x62"]
        FakeSerial.opened.append(self)

    @property
    def in_waiting(self):
        if self.closed:
            raise OSError("closed")
        return sum(len(c) for c in self.chunks)

    def read(self, n):
        if self.closed:
            raise OSError("closed")
        return self.chunks.pop(0) if self.chunks else b""

    def write(self, data):
        if self.closed:
            raise OSError("closed")

    def close(self):
        self.closed = True


@pytest.fixture
def fake_serial(monkeypatch):
    import serial

    from orchados_recorder import receiver

    ports: list[str] = []
    FakeSerial.opened = []
    monkeypatch.setattr(serial, "Serial", FakeSerial)
    monkeypatch.setattr(receiver, "find_receiver_port", lambda *a: ports[0] if ports else None)
    monkeypatch.setattr(receiver.SerialTransport, "REOPEN_INTERVAL_S", 0.0)
    return ports


def test_receiver_plugged_in_after_start_is_configured(fake_serial):
    from orchados_recorder.receiver import SerialTransport

    t = SerialTransport("auto", timeout_s=0.001)
    assert not t.reconnected and t.read(10) == b""
    r = Receiver(t, nothing, nothing)
    assert r.configure(timeout_s=0.01) == "no_response"  # not plugged in
    fake_serial.append("/dev/ttyACM0")
    assert t.read(10) == b"\xb5\x62"
    # The first open after a failed configuration needs one too.
    assert t.reconnected


def test_a_stale_drop_does_not_close_the_reopened_port(fake_serial):
    from orchados_recorder.receiver import SerialTransport

    fake_serial.append("/dev/ttyACM0")
    t = SerialTransport("auto", timeout_s=0.001)
    old = FakeSerial.opened[-1]
    t._drop(old, OSError("unplugged"))  # the writer saw the link go
    assert t.read(10) == b"\xb5\x62"  # the reader reopened it
    new = FakeSerial.opened[-1]
    assert new is not old
    t._drop(old, OSError("late"))  # the reader's own failure on the old port
    assert not new.closed and t.read(10) == b""


def test_queued_pvt_is_stamped_with_its_arrival_time():
    """The service reads through QueuedTransport and drains it every ~20 ms (or
    later, while tick() holds the lock). chrony's sample must carry the time the
    bytes arrived, as gnss-check measures the USB latency, not the drain time."""
    import time

    from orchados_recorder.receiver import QueuedTransport

    pvt_frame = frame(0x01, 0x07, PVT_PAYLOAD)
    inner = FakeTransport([pvt_frame[:40], pvt_frame[40:]])
    arrivals = iter([1_000, 2_000])
    q = QueuedTransport(inner, wall=lambda: next(arrivals))
    deadline = time.monotonic() + 2
    while inner.script and time.monotonic() < deadline:
        time.sleep(0.001)
    time.sleep(0.01)
    q.close()
    got = []
    clock = FakeClock()  # drained much later than the arrival
    rx = Receiver(q, on_bytes=nothing, on_pvt=lambda _p, t: got.append(t), clock=clock)
    rx.poll()
    # The frame completes in the second chunk: its arrival time, not the clock's now.
    assert got == [2_000]
