"""BLE GATT server (BlueZ over D-Bus, via `bless`).

Same service as the ESP32 logger: status (read/notify, once a second and right
after every command) and command (write). bless is imported lazily: it is only
needed on the Pi and is not exercised in CI. Disconnecting does nothing to the
recording; the server keeps (or resumes) advertising so the phone can reconnect.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
import threading
import time
from collections.abc import Callable
from concurrent.futures import Executor, ThreadPoolExecutor

from .protocol import COMMAND_UUID, DEVICE_NAME_PREFIX, SERVICE_UUID, STATUS_UUID

log = logging.getLogger(__name__)

STATUS_INTERVAL_S = 1.0


def device_name(mac: str) -> str:
    """'2C:CF:67:12:1A:2B' -> 'orchados-gnss-1A2B' (last two bytes, upper-case hex)."""
    parts = mac.strip().split(":")
    return DEVICE_NAME_PREFIX + "".join(parts[-2:]).upper()


def adapter_mac(adapter: str = "hci0") -> str:
    """The Bluetooth adapter's address from BlueZ; zeros if it cannot be read."""
    try:
        out = subprocess.run(
            [
                "busctl",
                "get-property",
                "org.bluez",
                f"/org/bluez/{adapter}",
                "org.bluez.Adapter1",
                "Address",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        ).stdout  # 's "2C:CF:67:12:1A:2B"'
        return out.split('"')[1]
    except (OSError, subprocess.SubprocessError, IndexError) as exc:
        log.warning("cannot read the Bluetooth address: %s", exc)
        return "00:00:00:00:00:00"


class CommandRunner:
    """Runs BLE commands off the event loop.

    A start can take seconds (the LiDAR mode command, the SSD write test, ros2
    bag); run on the loop it would stall BLE and the phone's write would time
    out while the Pi records. Commands go to a one-thread executor (so they keep
    their order) and take the recorder's lock like the tick does; the status is
    published on the loop when the command is done. Reads never wait for the
    lock: while a command runs they get the last published status.
    """

    def __init__(
        self,
        recorder,
        lock: threading.Lock,
        loop: asyncio.AbstractEventLoop,
        executor: Executor,
        publish: Callable[[bytes], None],
    ) -> None:
        self.recorder = recorder
        self.lock = lock
        self.loop = loop
        self.executor = executor
        self._publish = publish
        self.last_status: bytes | None = None

    def submit(self, value: bytes) -> None:
        """Called by the BLE write handler; returns at once (any thread)."""
        self.loop.call_soon_threadsafe(self._submit, bytes(value))

    def _submit(self, value: bytes) -> None:
        fut = self.loop.run_in_executor(self.executor, self._run, value)
        fut.add_done_callback(self._done)

    def _run(self, value: bytes) -> bytes:
        with self.lock:
            self.recorder.handle_command(value)
            return self.recorder.status()

    def _done(self, fut: asyncio.Future) -> None:
        try:
            status = fut.result()
        except Exception:
            log.exception("BLE command failed")
            return
        self.publish(status)

    def publish(self, status: bytes) -> None:
        self.last_status = status
        self._publish(status)

    def cached_status(self, fallback: bytes) -> bytes:
        """The status now if the recorder is free, else the last one published."""
        if self.lock.acquire(blocking=False):
            try:
                return self.recorder.status()
            finally:
                self.lock.release()
        return self.last_status if self.last_status is not None else fallback


async def run_server(recorder, name: str, *, lock: threading.Lock | None = None) -> None:
    """Serve until cancelled; tick the recorder once a second and notify the status."""
    from bless import (  # imported here: only on the Pi
        BlessServer,
        GATTAttributePermissions,
        GATTCharacteristicProperties,
    )

    lock = lock or threading.Lock()
    loop = asyncio.get_running_loop()
    server = BlessServer(name=name, loop=loop)

    def notify(status: bytes) -> None:
        ch = server.get_characteristic(STATUS_UUID)
        if ch is None:
            return
        ch.value = bytearray(status)
        server.update_value(SERVICE_UUID, STATUS_UUID)

    commands = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ble-command")
    runner = CommandRunner(recorder, lock, loop, commands, notify)

    def on_read(characteristic, **_kwargs) -> bytearray:
        if str(characteristic.uuid).lower() == STATUS_UUID:
            return bytearray(runner.cached_status(bytes(characteristic.value or b"")))
        return bytearray(characteristic.value or b"")

    def on_write(characteristic, value, **_kwargs) -> None:
        if str(characteristic.uuid).lower() != COMMAND_UUID:
            return
        runner.submit(bytes(value))

    server.read_request_func = on_read
    server.write_request_func = on_write

    await server.add_new_service(SERVICE_UUID)
    with lock:
        initial = recorder.status()
    runner.last_status = initial
    await server.add_new_characteristic(
        SERVICE_UUID,
        STATUS_UUID,
        GATTCharacteristicProperties.read | GATTCharacteristicProperties.notify,
        bytearray(initial),
        GATTAttributePermissions.readable,
    )
    await server.add_new_characteristic(
        SERVICE_UUID,
        COMMAND_UUID,
        GATTCharacteristicProperties.write,
        None,
        GATTAttributePermissions.writeable,
    )
    await server.start()
    log.info("BLE: advertising as %s", name)

    def locked_tick() -> bytes:
        with lock:
            return recorder.tick()

    next_tick = time.monotonic()
    try:
        while True:
            status = await loop.run_in_executor(None, locked_tick)
            runner.publish(status)
            await _keep_advertising(server)
            next_tick += STATUS_INTERVAL_S
            await asyncio.sleep(max(0.0, next_tick - time.monotonic()))
    finally:
        commands.shutdown(wait=False, cancel_futures=True)
        await server.stop()


async def _keep_advertising(server) -> None:
    """After a disconnect BlueZ normally resumes advertising by itself; if it did
    not, register again. To be verified on the Pi (README, hardware trials)."""
    try:
        if await server.is_connected() or await server.is_advertising():
            return
        log.info("BLE: not advertising; starting again")
        await server.stop()
        await server.start()
    except Exception as exc:  # never let BLE trouble stop the recording
        log.warning("BLE: cannot restart advertising: %s", exc)
