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
    for f in SETUP.iterdir():
        if f.name != "install.sh":
            assert f'"$SETUP/{f.name}"' in script, f"install.sh does not install {f.name}"
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
