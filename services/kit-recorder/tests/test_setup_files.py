import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
SETUP = ROOT / "setup"


def test_setup_files_pin_contract_values():
    assert "dtoverlay=pps-gpio,gpiopin=18" in (SETUP / "config.txt.append").read_text()
    assert "usb_max_current_enable=1" in (SETUP / "config.txt.append").read_text()
    chrony = (SETUP / "chrony-orchados.conf").read_text()
    assert "refclock PPS /dev/pps0 lock GNSS" in chrony and "/run/chrony.gnss.sock" in chrony
    assert "refclock SOCK /run/chrony.gnss.sock refid GNSS" in chrony
    assert "makestep 1 -1" in chrony
    assert "/run/chrony.gnss.sock" in (ROOT / "config/recorder.toml").read_text()
    assert "Restart=always" in (SETUP / "orchados-recorder.service").read_text()


def test_recorder_unit_runs_the_cli_after_its_dependencies():
    unit = (SETUP / "orchados-recorder.service").read_text()
    assert "orchados-recorder run --config /etc/orchados/recorder.toml" in unit
    after = next(line for line in unit.splitlines() if line.startswith("After="))
    for dep in ("unilidar.service", "chrony.service", "bluetooth.service"):
        assert dep in after


def test_ssd_is_mounted_by_label_with_nofail():
    fstab = (SETUP / "fstab.append").read_text()
    assert "LABEL=ORCHADOS-SSD" in fstab and "/mnt/orchados-ssd" in fstab
    assert "nofail" in fstab


def test_install_script_is_strict_and_installs_the_pieces():
    script = (SETUP / "install.sh").read_text()
    assert script.startswith("#!/usr/bin/env bash")
    assert "set -euo pipefail" in script
    for piece in ("ros-jazzy-ros-base", "chrony", "pps-tools", "bluez", "build_unilidar"):
        assert piece in script
    assert "--system-site-packages" in script
    assert "SystemMaxUse=200M" in script


def test_ssd_hotplug_rule_mounts_by_label():
    rule = (SETUP / "99-orchados-ssd.rules").read_text()
    assert 'ENV{ID_FS_LABEL}=="ORCHADOS-SSD"' in rule
    assert "orchados-ssd-mount.service" in rule
    unit = (SETUP / "orchados-ssd-mount.service").read_text()
    assert "/mnt/orchados-ssd" in unit


def test_lidar_driver_unit_restarts_and_runs_with_ros():
    unit = (SETUP / "unilidar.service").read_text()
    assert "Restart=always" in unit
    assert "/usr/local/bin/orchados-ros-exec" in unit
    wrapper = (SETUP / "orchados-ros-exec").read_text()
    assert "/opt/ros/jazzy/setup.bash" in wrapper
    assert 'exec "$@"' in wrapper


def test_install_script_uses_every_setup_file():
    script = (SETUP / "install.sh").read_text()
    for f in SETUP.rglob("*"):
        name = f.relative_to(SETUP).as_posix()
        if f.is_file() and name != "install.sh":
            assert f'"$SETUP/{name}"' in script, f"install.sh does not install {name}"
    for name in re.findall(r'"\$SETUP/([^"]+)"', script):
        assert (SETUP / name).is_file(), f"install.sh refers to a missing setup/{name}"


@pytest.mark.skipif(shutil.which("bash") is None, reason="no bash")
@pytest.mark.parametrize("name", ["install.sh", "orchados-ros-exec"])
def test_shell_scripts_parse(name):
    subprocess.run(["bash", "-n", str(SETUP / name)], check=True)


def _shell_function(script: str, name: str) -> str:
    m = re.search(rf"^{name}\(\) \{{\n.*?^\}}\n", script, re.S | re.M)
    assert m, f"install.sh has no {name}()"
    return m.group(0)


def _run_put_block(target: Path, block: Path) -> int:
    script = (SETUP / "install.sh").read_text()
    prelude = "\n".join(
        line for line in script.splitlines() if line.startswith(("BLOCK_BEGIN=", "BLOCK_END="))
    )
    body = (
        "set -euo pipefail\n"
        f"{prelude}\n"
        "note() { :; }\n"
        f"{_shell_function(script, 'put_block')}"
        'put_block "$1" "$2"\n'
    )
    return subprocess.run(["bash", "-c", body, "put_block", str(target), str(block)]).returncode


@pytest.mark.skipif(shutil.which("bash") is None, reason="no bash")
def test_put_block_replaces_the_file_by_rename(tmp_path):
    # /boot/firmware/config.txt is on FAT: never rewrite it in place, so a power
    # cut leaves the old or the new file, not a truncated one.
    target = tmp_path / "config.txt"
    target.write_text("arm_64bit=1\n")
    block = tmp_path / "block"
    block.write_text("dtoverlay=pps-gpio,gpiopin=18\n")
    inode = target.stat().st_ino
    assert _run_put_block(target, block) == 0
    text = target.read_text()
    assert text.startswith("arm_64bit=1\n# >>> orchados kit-recorder >>>\n")
    assert "dtoverlay=pps-gpio,gpiopin=18\n# <<< orchados kit-recorder <<<\n" in text
    assert target.stat().st_ino != inode  # a new file renamed over the old one
    assert sorted(p.name for p in tmp_path.iterdir()) == ["block", "config.txt"]
    # Again: nothing changes.
    inode = target.stat().st_ino
    assert _run_put_block(target, block) == 1
    assert target.read_text() == text and target.stat().st_ino == inode
    assert sorted(p.name for p in tmp_path.iterdir()) == ["block", "config.txt"]
    # A new block replaces the old one.
    block.write_text("usb_max_current_enable=1\n")
    assert _run_put_block(target, block) == 0
    text = target.read_text()
    assert "pps-gpio" not in text and text.count("# >>> orchados kit-recorder >>>") == 1


def test_recorder_unit_is_ordered_after_the_ssd_mount_but_does_not_need_it():
    # Power-loss recovery looks at the SSD at start: wait for the boot-time mount
    # (or its 10 s device timeout), but keep running without the SSD.
    unit = (SETUP / "orchados-recorder.service").read_text()
    after = next(line for line in unit.splitlines() if line.startswith("After="))
    assert "mnt-orchados\\x2dssd.mount" in after.split("=", 1)[1].split()
    for key in ("RequiresMountsFor=", "BindsTo=", "Requires=", "PartOf="):
        assert not any(line.startswith(key) for line in unit.splitlines())


UNILIDAR_HEADER = "unitree_lidar_ros2/src/unitree_lidar_ros2/include/unitree_lidar_ros2.h"


def _unilidar_patches(script: str) -> list[Path]:
    names = re.findall(r'"\$SETUP/(patches/unilidar_sdk2-[^"]+\.patch)"', script)
    assert names, "install.sh lists no setup/patches/unilidar_sdk2-*.patch"
    return [SETUP / name for name in names]


def _hunk_sides(patch: Path) -> tuple[str, str]:
    # Pre- and post-image of the patch's hunks, in order, each hunk followed by a
    # filler line so hunks of different patches never share context.
    before, after = [], []
    in_hunk = False
    for line in patch.read_text().splitlines():
        if line.startswith("@@"):
            in_hunk = True
            continue
        if line.startswith("diff --git"):
            in_hunk = False
        if not in_hunk or line.startswith("\\"):
            continue
        tag, body = line[:1], line[1:]
        if tag in (" ", "-"):
            before.append(body)
        if tag in (" ", "+"):
            after.append(body)
    filler = "// -- orchados test filler --"
    return "\n".join([*before, filler, ""]), "\n".join([*after, filler, ""])


def test_unilidar_driver_is_pinned_and_patched_before_the_build():
    script = (SETUP / "install.sh").read_text()
    # One upstream commit: the patches are written against it.
    m = re.search(r"^UNILIDAR_COMMIT=([0-9a-f]{40})$", script, re.M)
    assert m
    commit = m.group(1)
    patches = _unilidar_patches(script)
    assert {p.name for p in (SETUP / "patches").glob("unilidar_sdk2-*.patch")} == {
        p.name for p in patches
    }
    for patch in patches:
        text = patch.read_text()
        assert f"a/{UNILIDAR_HEADER}" in text and f"b/{UNILIDAR_HEADER}" in text
        assert commit in text  # the patch header names the commit it was made on
    build = _shell_function(script, "build_unilidar")
    assert '"$UNILIDAR_COMMIT"' in build and "--depth 1" in build
    assert build.index("apply_patches") < build.index("colcon build")


def test_unilidar_patches_fix_the_imu_bugs():
    script = (SETUP / "install.sh").read_text()
    after = "".join(_hunk_sides(p)[1] for p in _unilidar_patches(script))
    # unilidar_sdk2 #33: the IMU packet is fetched once, in the if().
    assert after.count("lsdk_->getImuData(imu)") == 1
    assert "if (lsdk_->getImuData(imu))" in after
    # unilidar_sdk2 #14: the SDK's quaternion is w, x, y, z (as in the ROS 1 driver
    # and the node's own tf).
    for axis, i in (("w", 0), ("x", 1), ("y", 2), ("z", 3)):
        assert f"imuMsg.orientation.{axis} = imu.quaternion[{i}];" in after


@pytest.mark.skipif(shutil.which("git") is None, reason="no git")
def test_unilidar_patches_applied(tmp_path):
    # apply_patches on a checkout holding each patch's pre-image: applies once,
    # the second run changes nothing, a file that matches neither side fails.
    script = (SETUP / "install.sh").read_text()
    patches = _unilidar_patches(script)
    src = tmp_path / "unilidar_sdk2"
    header = src / UNILIDAR_HEADER
    header.parent.mkdir(parents=True)
    sides = [_hunk_sides(p) for p in patches]
    header.write_text("".join(before for before, _ in sides))
    subprocess.run(["git", "init", "-q", str(src)], check=True)
    body = (
        "set -euo pipefail\n"
        "note() { :; }\n"
        'warn() { echo "WARNING: $*" >&2; }\n'
        f"{_shell_function(script, 'apply_patches')}"
        'apply_patches "$@"\n'
    )

    def run() -> int:
        argv = ["bash", "-c", body, "apply_patches", str(src), *map(str, patches)]
        return subprocess.run(argv).returncode

    assert run() == 0
    patched = "".join(after for _, after in sides)
    assert header.read_text() == patched
    assert run() == 0
    assert header.read_text() == patched
    header.write_text("something else\n")
    assert run() != 0
