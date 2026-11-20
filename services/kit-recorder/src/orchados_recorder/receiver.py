"""The GNSS receiver (u-blox ZED-F9P) over USB.

The recorder is the serial port's only owner (no gpsd). At start, after every
open of the USB port and every CONFIG_RETRY_S while it has not succeeded, it
writes the logging configuration to the receiver's RAM layer with
UBX-CFG-VALSET and waits for the ACK, as the ESP32 does over UART
(firmware/gnss-logger/README.md, "Açılışta alıcı yapılandırması"). Afterwards
every byte read is handed on untouched (gnss.ubx) and NAV-PVT is decoded.
"""

from __future__ import annotations

import glob
import logging
import time
from collections import deque
from collections.abc import Callable
from typing import Protocol

from .clock import SystemClock
from .ubx import (
    CLASS_ACK,
    CLASS_CFG,
    CLASS_NAV,
    ID_ACK_ACK,
    ID_ACK_NAK,
    ID_CFG_VALSET,
    ID_NAV_PVT,
    NAV_PVT_LEN,
    Framer,
    NavPvt,
    cfg_valset_ram,
    frame,
    is_ack,
    parse_nav_pvt,
)

log = logging.getLogger(__name__)

MEAS_PERIOD_MS = 200
RAWX_RATE_HZ = 1
NAV_PVT_RATE_HZ = 5

# (key, value, value size in bytes); USB counterparts of the firmware's UART keys.
USB_CONFIG: list[tuple[int, int, int]] = [
    (0x10770001, 1, 1),  # CFG-USBINPROT-UBX
    (0x10780001, 1, 1),  # CFG-USBOUTPROT-UBX
    (0x10780002, 0, 1),  # CFG-USBOUTPROT-NMEA: off
    (0x30210001, MEAS_PERIOD_MS, 2),  # CFG-RATE-MEAS: 200 ms (5 Hz)
    (0x30210002, 1, 2),  # CFG-RATE-NAV
    (0x209102A7, 1000 // MEAS_PERIOD_MS // RAWX_RATE_HZ, 1),  # MSGOUT RXM-RAWX USB: 1 Hz
    # SFRBX comes per decoded subframe, not per epoch: every one is needed.
    (0x20910234, 1, 1),  # CFG-MSGOUT-UBX_RXM_SFRBX_USB
    (0x20910009, 1000 // MEAS_PERIOD_MS // NAV_PVT_RATE_HZ, 1),  # MSGOUT NAV-PVT USB: 5 Hz
    (0x2005000C, 1, 1),  # CFG-TP-TIMEGRID_TP1: PPS on the GPS second
]

# gnss/session.json "receiver"; config_status is added at run time.
RECEIVER_INFO: dict = {
    "model": "ZED-F9P",
    "port": "USB",
    "baud": None,
    "meas_period_ms": MEAS_PERIOD_MS,
    "rawx_rate_hz": RAWX_RATE_HZ,
    "nav_pvt_rate_hz": NAV_PVT_RATE_HZ,
    "messages": ["RXM-RAWX", "RXM-SFRBX", "NAV-PVT"],
    "nmea": False,
    "timepulse_grid": "GPS",
    "detected_baud": None,
}

READ_CHUNK = 4096
# While the configuration is not "ok" (receiver plugged in late, an ACK missed)
# it is sent again this often, one attempt at a time so BLE is not held up long.
CONFIG_RETRY_S = 5.0


class Transport(Protocol):
    """A byte pipe to the receiver.

    `read` returns b"" on timeout or while disconnected. A transport that can
    (re)open the port sets `reconnected = True` after every successful open; the
    receiver clears it when it configures the receiver.
    """

    reconnected: bool

    def read(self, max_bytes: int) -> bytes: ...

    def write(self, data: bytes) -> None: ...


class Receiver:
    def __init__(
        self,
        transport: Transport,
        on_bytes: Callable[[bytes], None],
        on_pvt: Callable[[NavPvt, int], None],
        *,
        clock=None,
    ) -> None:
        self.transport = transport
        self.on_bytes = on_bytes
        self.on_pvt = on_pvt
        self.clock = clock if clock is not None else SystemClock()
        self.config_status = "pending"
        self.last_rx_mono_us: int | None = None
        self.last_pvt: NavPvt | None = None
        # Bytes read while waiting for the ACK; they are not recorded.
        self.discarded_bytes = 0
        self._configured_us: int | None = None
        self._framer = Framer()

    def configure(self, attempts: int = 3, timeout_s: float = 1.0) -> str:
        """'ok' | 'nak' | 'no_response'. Bytes read meanwhile are not recorded
        (counted in `discarded_bytes`)."""
        # This configuration covers any (re)open before it.
        self._clear_reconnected()
        msg = cfg_valset_ram(USB_CONFIG)
        framer = Framer()
        status = "no_response"
        for _ in range(attempts):
            try:
                self.transport.write(msg)
            except OSError as exc:
                log.warning("receiver: write failed: %s", exc)
                time.sleep(min(timeout_s, 0.1))
                continue
            answer = self._await_ack(framer, timeout_s)
            if answer is not None:
                status = "ok" if answer else "nak"
                break
        self.config_status = status
        self._configured_us = self.clock.now_mono_us()
        self._framer.reset()
        if status == "ok":
            self._clear_reconnected()
        else:
            log.warning("receiver configuration: %s", status)
        return status

    def retry_configure(self, timeout_s: float = 1.0) -> None:
        """Called often: while the configuration is not "ok", one attempt every
        CONFIG_RETRY_S. Without this a receiver that was not ready at start (or
        missed the ACK window once) would stay unconfigured, and the gnss
        pre-check, which cannot be overridden, would block every session."""
        if self.config_status == "ok":
            return
        now = self.clock.now_mono_us()
        if self._configured_us is not None and now - self._configured_us < CONFIG_RETRY_S * 1e6:
            return
        log.info("receiver: configuration %s; trying again", self.config_status)
        self.configure(attempts=1, timeout_s=timeout_s)

    def _clear_reconnected(self) -> None:
        if getattr(self.transport, "reconnected", False):
            self.transport.reconnected = False

    def _await_ack(self, framer: Framer, timeout_s: float) -> bool | None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            data = self.transport.read(READ_CHUNK)
            if not data:
                time.sleep(0.001)
                continue
            self.last_rx_mono_us = self.clock.now_mono_us()
            self.discarded_bytes += len(data)
            for m in framer.feed(data):
                answer = is_ack(m, CLASS_CFG, ID_CFG_VALSET)
                if answer is not None:
                    return answer
        return None

    def poll(self) -> None:
        """Read once; pass every byte on and decode NAV-PVT."""
        if getattr(self.transport, "reconnected", False):
            # The receiver keeps its settings in RAM only: it may have lost them,
            # or (plugged in after start) never had them.
            log.info("receiver: USB (re)connected, configuring")
            self.configure()
        data = self.transport.read(READ_CHUNK)
        if not data:
            return
        self.last_rx_mono_us = self.clock.now_mono_us()
        self.on_bytes(data)
        for m in self._framer.feed(data):
            if m.cls == CLASS_NAV and m.msg_id == ID_NAV_PVT and len(m.payload) == NAV_PVT_LEN:
                pvt = parse_nav_pvt(m.payload)
                self.last_pvt = pvt
                self.on_pvt(pvt, self.clock.now_unix_ns())


def find_receiver_port(pattern: str = "/dev/serial/by-id/usb-u-blox*") -> str | None:
    ports = sorted(glob.glob(pattern))
    return ports[0] if ports else None


class SerialTransport:
    """pyserial on the receiver's USB CDC-ACM port.

    `port` is a device path or "auto" (the first /dev/serial/by-id/usb-u-blox*).
    If the port is missing or the USB link drops, `read` returns b"" and tries to
    (re)open it at most once a second; after every successful open `reconnected`
    is True, so the receiver configures it (also when it was plugged in after the
    service started).

    `read` runs in QueuedTransport's thread, `write` in the recorder's: opening
    and dropping the port happen under a lock, and a failure on a port that has
    since been replaced does not drop the new one.
    """

    REOPEN_INTERVAL_S = 1.0

    def __init__(self, port: str = "auto", timeout_s: float = 0.1) -> None:
        import threading

        self.port = port
        self.timeout_s = timeout_s
        self.reconnected = False
        self._ser = None
        self._next_open = 0.0
        self._lock = threading.Lock()
        with self._lock:
            self._open_locked()

    def _open_locked(self) -> bool:
        import serial  # pyserial

        now = time.monotonic()
        if now < self._next_open:
            return False
        self._next_open = now + self.REOPEN_INTERVAL_S
        path = find_receiver_port() if self.port == "auto" else self.port
        if path is None:
            return False
        try:
            self._ser = serial.Serial(path, timeout=self.timeout_s, write_timeout=1.0)
        except (OSError, serial.SerialException) as exc:
            log.debug("receiver: cannot open %s: %s", path, exc)
            self._ser = None
            return False
        self.reconnected = True
        log.info("receiver: opened %s", path)
        return True

    def _port(self):
        """The open port, opening it if it is time to try; None if not connected."""
        with self._lock:
            if self._ser is None:
                self._open_locked()
            return self._ser

    def _drop(self, ser, exc: Exception) -> None:
        with self._lock:
            if self._ser is not ser:
                return  # the other thread already dropped (and maybe reopened) it
            log.warning("receiver: USB link lost: %s", exc)
            try:
                ser.close()
            except Exception:  # closing a dead port
                pass
            self._ser = None

    def read(self, max_bytes: int) -> bytes:
        import serial

        ser = self._port()
        if ser is None:
            time.sleep(self.timeout_s)
            return b""
        try:
            n = max(1, min(max_bytes, ser.in_waiting))
            return ser.read(n)
        except (OSError, serial.SerialException) as exc:
            self._drop(ser, exc)
            return b""

    def write(self, data: bytes) -> None:
        import serial

        ser = self._port()
        if ser is None:
            raise OSError("receiver not connected")
        try:
            ser.write(data)
        except (OSError, serial.SerialException) as exc:
            self._drop(ser, exc)
            raise OSError(str(exc)) from exc

    def close(self) -> None:
        with self._lock:
            if self._ser is not None:
                self._ser.close()
                self._ser = None


class QueuedTransport:
    """Reads the inner transport in a background thread.

    `read` never blocks, so the recorder's lock is held only while bytes are
    processed and BLE commands (qr_sync) are stamped without waiting for a
    serial timeout. `write` and the `reconnected` flag go to the inner transport.
    """

    def __init__(self, inner: Transport) -> None:
        import threading

        self.inner = inner
        self._queue: deque[bytes] = deque()  # unbounded: never drop receiver bytes
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="receiver-read", daemon=True)
        self._thread.start()

    @property
    def reconnected(self) -> bool:
        return getattr(self.inner, "reconnected", False)

    @reconnected.setter
    def reconnected(self, value: bool) -> None:
        self.inner.reconnected = value

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                data = self.inner.read(READ_CHUNK)
            except Exception as exc:  # keep the reader alive whatever the port does
                log.warning("receiver read failed: %s", exc)
                time.sleep(0.1)
                continue
            if data:
                with self._lock:
                    self._queue.append(data)

    def read(self, max_bytes: int) -> bytes:
        with self._lock:
            if not self._queue:
                return b""
            chunks = []
            size = 0
            while self._queue and size < max_bytes:
                chunk = self._queue.popleft()
                chunks.append(chunk)
                size += len(chunk)
        return b"".join(chunks)

    def write(self, data: bytes) -> None:
        self.inner.write(data)

    def close(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1)


class FakeTransport:
    """Test transport: a script of reads; answers VALSET with ACK or NAK."""

    def __init__(
        self, script: list[bytes] | None = None, respond_to_valset: str | None = "ack"
    ) -> None:
        self.script: deque[bytes] = deque(script or [])
        self.respond_to_valset = respond_to_valset
        self.written: list[bytes] = []
        self.connected = True
        self.reconnected = False

    def feed(self, data: bytes) -> None:
        self.script.append(data)

    def read(self, max_bytes: int) -> bytes:
        if not self.connected or not self.script:
            return b""
        data = self.script.popleft()
        if len(data) > max_bytes:
            self.script.appendleft(data[max_bytes:])
            data = data[:max_bytes]
        return data

    def write(self, data: bytes) -> None:
        if not self.connected:
            raise OSError("receiver not connected")
        self.written.append(bytes(data))
        if data[2:4] == bytes([CLASS_CFG, ID_CFG_VALSET]) and self.respond_to_valset:
            ack_id = ID_ACK_ACK if self.respond_to_valset == "ack" else ID_ACK_NAK
            self.script.append(frame(CLASS_ACK, ack_id, bytes([CLASS_CFG, ID_CFG_VALSET])))

    def disconnect(self) -> None:
        self.connected = False
        self.script.clear()

    def reconnect(self) -> None:
        self.connected = True
        self.reconnected = True
