"""The GNSS receiver (u-blox ZED-F9P) over USB.

The recorder is the serial port's only owner (no gpsd). At start and after
every USB reconnect it writes the logging configuration to the receiver's RAM
layer with UBX-CFG-VALSET and waits for the ACK, as the ESP32 does over UART
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


class Transport(Protocol):
    """A byte pipe to the receiver.

    `read` returns b"" on timeout or while disconnected. A transport that can
    reconnect sets `reconnected = True` once afterwards; the receiver clears it.
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
        self._framer = Framer()

    def configure(self, attempts: int = 3, timeout_s: float = 1.0) -> str:
        """'ok' | 'nak' | 'no_response'. Bytes read meanwhile are not recorded."""
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
        self._framer.reset()
        if status != "ok":
            log.warning("receiver configuration: %s", status)
        return status

    def _await_ack(self, framer: Framer, timeout_s: float) -> bool | None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            data = self.transport.read(READ_CHUNK)
            if not data:
                time.sleep(0.001)
                continue
            self.last_rx_mono_us = self.clock.now_mono_us()
            for m in framer.feed(data):
                answer = is_ack(m, CLASS_CFG, ID_CFG_VALSET)
                if answer is not None:
                    return answer
        return None

    def poll(self) -> None:
        """Read once; pass every byte on and decode NAV-PVT."""
        if getattr(self.transport, "reconnected", False):
            # The receiver kept its settings in RAM only: it may have lost them.
            self.transport.reconnected = False
            log.info("receiver: USB reconnected, configuring again")
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
    If the USB link drops, `read` returns b"" and tries to reopen at most once
    a second; after a successful reopen `reconnected` is True.
    """

    REOPEN_INTERVAL_S = 1.0

    def __init__(self, port: str = "auto", timeout_s: float = 0.1) -> None:
        self.port = port
        self.timeout_s = timeout_s
        self.reconnected = False
        self._ser = None
        self._opened_once = False
        self._next_open = 0.0
        self._open()

    def _open(self) -> bool:
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
        if self._opened_once:
            self.reconnected = True
        self._opened_once = True
        log.info("receiver: opened %s", path)
        return True

    def _drop(self, exc: Exception) -> None:
        log.warning("receiver: USB link lost: %s", exc)
        try:
            self._ser.close()
        except Exception:  # closing a dead port
            pass
        self._ser = None
        self._opened_once = True

    def read(self, max_bytes: int) -> bytes:
        import serial

        if self._ser is None and not self._open():
            time.sleep(self.timeout_s)
            return b""
        try:
            n = max(1, min(max_bytes, self._ser.in_waiting))
            return self._ser.read(n)
        except (OSError, serial.SerialException) as exc:
            self._drop(exc)
            return b""

    def write(self, data: bytes) -> None:
        import serial

        if self._ser is None and not self._open():
            raise OSError("receiver not connected")
        try:
            self._ser.write(data)
        except (OSError, serial.SerialException) as exc:
            self._drop(exc)
            raise OSError(str(exc)) from exc


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
