import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from orchados_recorder.ble import CommandRunner


class SlowRecorder:
    """handle_command blocks until released, like a start that waits on ros2 bag."""

    def __init__(self):
        self.release = threading.Event()
        self.commands = []

    def handle_command(self, data):
        if data == b"slow":
            self.release.wait(5)
        self.commands.append(data)

    def status(self):
        return b"S" + bytes([len(self.commands)])


def test_commands_run_off_the_event_loop_in_order():
    rec = SlowRecorder()
    lock = threading.Lock()
    published = []

    async def main():
        loop = asyncio.get_running_loop()
        executor = ThreadPoolExecutor(max_workers=1)
        runner = CommandRunner(rec, lock, loop, executor, published.append)
        t0 = time.monotonic()
        runner.submit(b"slow")
        runner.submit(b"fast")
        assert time.monotonic() - t0 < 0.5  # the BLE write returns at once
        await asyncio.sleep(0.05)  # the loop is free meanwhile
        assert published == [] and lock.locked()
        assert runner.cached_status(b"old") == b"old"  # reads do not wait for the lock
        rec.release.set()
        for _ in range(100):
            if len(published) == 2:
                break
            await asyncio.sleep(0.01)
        executor.shutdown()

    asyncio.run(main())
    assert rec.commands == [b"slow", b"fast"]
    assert published == [b"S\x01", b"S\x02"]


def test_a_failing_command_does_not_stop_the_runner():
    class Broken(SlowRecorder):
        def handle_command(self, data):
            if data == b"bad":
                raise RuntimeError("boom")
            super().handle_command(data)

    rec = Broken()
    published = []

    async def main():
        loop = asyncio.get_running_loop()
        executor = ThreadPoolExecutor(max_workers=1)
        runner = CommandRunner(rec, threading.Lock(), loop, executor, published.append)
        runner.submit(b"bad")
        runner.submit(b"ok")
        for _ in range(100):
            if published:
                break
            await asyncio.sleep(0.01)
        executor.shutdown()

    asyncio.run(main())
    assert rec.commands == [b"ok"] and published == [b"S\x01"]
