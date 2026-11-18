import os
import shutil
from collections import namedtuple

from orchados_recorder import ssd
from orchados_recorder.ssd import SsdStatus, probe_ssd, ssd_check_ok

Usage = namedtuple("Usage", "total used free")
GIB = 1 << 30


def test_not_a_mount_point_is_missing(tmp_path):
    assert probe_ssd(tmp_path) == SsdStatus(present=False, free_mib=0, error=False)


def test_mounted_with_little_space_fails_check(tmp_path, monkeypatch):
    monkeypatch.setattr(ssd.os.path, "ismount", lambda p: True)
    monkeypatch.setattr(ssd.shutil, "disk_usage", lambda p: Usage(512 * GIB, 502 * GIB, 10 * GIB))
    s = probe_ssd(tmp_path)
    assert s == SsdStatus(True, 10 * 1024, False)
    assert not ssd_check_ok(s)
    assert not (tmp_path / ".orchados-probe").exists()


def test_mounted_with_room_passes(tmp_path, monkeypatch):
    monkeypatch.setattr(ssd.os.path, "ismount", lambda p: True)
    monkeypatch.setattr(ssd.shutil, "disk_usage", lambda p: Usage(512 * GIB, 12 * GIB, 400 * GIB))
    assert ssd_check_ok(probe_ssd(tmp_path))


def test_write_failure_is_an_error(tmp_path, monkeypatch):
    monkeypatch.setattr(ssd.os.path, "ismount", lambda p: True)

    def refuse(*a, **k):
        raise PermissionError("read-only file system")

    monkeypatch.setattr(ssd, "open", refuse, raising=False)
    s = probe_ssd(tmp_path)
    assert s.present and s.error
    assert not ssd_check_ok(s)


def test_light_probe_does_not_write(tmp_path, monkeypatch):
    monkeypatch.setattr(ssd.os.path, "ismount", lambda p: True)

    def refuse(*a, **k):
        raise AssertionError("must not write")

    monkeypatch.setattr(ssd, "open", refuse, raising=False)
    s = probe_ssd(tmp_path, write_test=False)
    assert s.present and not s.error


def test_real_disk_usage(tmp_path, monkeypatch):
    monkeypatch.setattr(ssd.os.path, "ismount", lambda p: True)
    s = probe_ssd(tmp_path)
    assert s.free_mib == shutil.disk_usage(tmp_path).free >> 20
    assert os.listdir(tmp_path) == []
