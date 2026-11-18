"""orchados-recorder: the kit's recording service on the Raspberry Pi.

orchados-recorder run [--config PATH]      # the service (receiver, LiDAR, BLE); systemd
orchados-recorder fake-run SSD_DIR --session-id ID --parcel-id ID --seconds N [--lidar-gap S]
                                           # no hardware: one synthetic session on fakes
orchados-recorder version
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import signal
import sys
import threading
import time
from pathlib import Path

from . import __version__
from .config import DEFAULT_PATH, Config, load
from .protocol import (
    MarkEvent,
    Result,
    StartSession,
    StopSession,
    encode_command,
    valid_parcel_id,
    valid_session_id,
)

log = logging.getLogger("orchados_recorder")


def _qr_text(gps_ns: int, session_id: str) -> str:
    label = "".join(c for c in session_id if c.isascii() and (c.isalnum() or c in "_-"))[:8]
    return f"OQ1:{gps_ns // 1_000_000}:{label}"


def cmd_fake_run(args: argparse.Namespace) -> int:
    from .fakes import FakeRig
    from .gpstime import unix_ns_to_gps_ns

    if not valid_session_id(args.session_id) or not valid_parcel_id(args.parcel_id):
        print("invalid --session-id or --parcel-id (see docs/arayuzler.md)", file=sys.stderr)
        return 2
    if args.seconds < 1 or args.lidar_gap < 0 or args.lidar_gap >= args.seconds:
        print("--seconds must be >= 1 and longer than --lidar-gap", file=sys.stderr)
        return 2

    rig = FakeRig(Path(args.ssd_dir))
    rig.run(seconds=3)  # warm up: LiDAR, receiver and clock seen

    def send(cmd) -> bool:
        rig.command(encode_command(cmd))
        result = rig.status()[30]
        if result != Result.OK:
            print(f"{type(cmd).__name__}: {Result(result).name}", file=sys.stderr)
            return False
        return True

    def qr(seq: int) -> bool:
        gps = unix_ns_to_gps_ns(rig.clock.now_unix_ns())
        return send(MarkEvent(seq, "qr_sync", _qr_text(gps, args.session_id)))

    if not send(StartSession(1, args.session_id, args.parcel_id)) or not qr(2):
        return 1
    before = (args.seconds - args.lidar_gap) // 2
    rig.run(seconds=before)
    if args.lidar_gap:
        rig.lidar.silent = True
        rig.run(seconds=args.lidar_gap)
        rig.lidar.silent = False
    rig.run(seconds=args.seconds - before - args.lidar_gap)
    if not qr(3) or not send(StopSession(4)):
        return 1

    st = rig.status()
    session = Path(args.ssd_dir) / "sessions" / args.session_id
    print(
        json.dumps(
            {
                "session_dir": str(session),
                "gnss_bytes": int.from_bytes(st[12:16], "little"),
                "lidar_gap_count": int.from_bytes(st[65:67], "little"),
                "lidar_longest_gap_s": int.from_bytes(st[67:69], "little"),
            }
        )
    )
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    from .ble import adapter_mac, device_name, run_server
    from .clock import ChronySockFeed, SystemClock
    from .lidar import BagRecorder, NullLidarMonitor, RosLidarMonitor
    from .receiver import QueuedTransport, SerialTransport
    from .recorder import Deps, Recorder

    path = Path(args.config)
    if path.exists():
        config = load(path)
    else:
        log.warning("%s not found; using the defaults", path)
        config = Config()

    try:
        lidar = RosLidarMonitor(config.lidar)
    except RuntimeError as exc:
        log.error("%s; the LiDAR pre-check will fail (it can be overridden)", exc)
        lidar = NullLidarMonitor()
    transport = QueuedTransport(SerialTransport(config.receiver_port))
    feed = ChronySockFeed(config.chrony_sock)
    deps = Deps(
        clock=SystemClock(),
        transport=transport,
        lidar=lidar,
        bag=BagRecorder(config.lidar),
        ssd_mount=config.ssd_mount,
        pvt_sink=feed.send,
    )
    recorder = Recorder(deps)
    lock = threading.Lock()
    stop = threading.Event()

    def pump_loop() -> None:
        while not stop.is_set():
            with lock:
                recorder.pump()
            time.sleep(0.02)

    def on_sigterm(_signum, _frame) -> None:
        raise KeyboardInterrupt  # systemctl stop: close the session cleanly

    signal.signal(signal.SIGTERM, on_sigterm)
    threading.Thread(target=pump_loop, name="pump", daemon=True).start()
    name = device_name(adapter_mac())
    log.info("orchados-recorder %s; SSD %s; BLE name %s", __version__, config.ssd_mount, name)
    try:
        asyncio.run(run_server(recorder, name, lock=lock))
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        with lock:
            if recorder.recording:
                # A clean service stop (systemctl stop) closes the session.
                recorder.handle_command(encode_command(StopSession(0)))
        transport.close()
    return 0


def cmd_version(_args: argparse.Namespace) -> int:
    print(__version__)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="orchados-recorder", description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="run the service (receiver, LiDAR, BLE)")
    run.add_argument("--config", default=str(DEFAULT_PATH))
    run.set_defaults(func=cmd_run)

    fake = sub.add_parser("fake-run", help="write one synthetic session, no hardware")
    fake.add_argument("ssd_dir")
    fake.add_argument("--session-id", required=True)
    fake.add_argument("--parcel-id", required=True)
    fake.add_argument("--seconds", type=int, required=True)
    fake.add_argument("--lidar-gap", type=int, default=0, help="LiDAR silent this many seconds")
    fake.set_defaults(func=cmd_fake_run)

    version = sub.add_parser("version")
    version.set_defaults(func=cmd_version)
    return p


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
