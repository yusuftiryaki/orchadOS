"""Chip access against a fake w1 sysfs tree (no DS2431 on the development machine)."""

import json
from pathlib import Path

import pytest

from orchados_kit import chip
from orchados_kit.cli import main
from orchados_kit.manifest import decode, to_dict

VECTOR = json.loads((Path(__file__).parent / "vectors" / "kit_manifest_v1.json").read_text())[0]


def fake_bus(tmp_path: Path, *chips: str) -> str:
    for name in chips:
        d = tmp_path / "devices" / name
        d.mkdir(parents=True)
        (d / "eeprom").write_bytes(b"\xff" * 128)
    return str(tmp_path / "devices" / "2d-*" / "eeprom")


def manifest_file(tmp_path: Path) -> str:
    p = tmp_path / "manifest.json"
    p.write_text(json.dumps(VECTOR["manifest"]))
    return str(p)


def test_write_reads_back_and_verifies(tmp_path):
    glob = fake_bus(tmp_path, "2d-00000a1b2c3d")
    assert main(["--sysfs-glob", glob, "write", manifest_file(tmp_path)]) == 0
    image = (tmp_path / "devices" / "2d-00000a1b2c3d" / "eeprom").read_bytes()
    assert image.hex() == VECTOR["image_hex"]
    _, back = chip.read_manifest(glob)
    assert to_dict(back)["serial"] == "K001"


@pytest.mark.parametrize("chips, why", [((), "no DS2431"), (("2d-01", "2d-02"), "exactly one")])
def test_refuses_unless_exactly_one_chip(tmp_path, chips, why, capsys):
    glob = fake_bus(tmp_path, *chips)
    assert main(["--sysfs-glob", glob, "write", manifest_file(tmp_path)]) == 1
    assert why in capsys.readouterr().err
    for name in chips:
        assert (tmp_path / "devices" / name / "eeprom").read_bytes() == b"\xff" * 128


def test_read_back_mismatch_is_an_error(tmp_path, monkeypatch):
    glob = fake_bus(tmp_path, "2d-01")
    real_read = chip.read_image
    monkeypatch.setattr(chip, "read_image", lambda p: b"\x00" + real_read(p)[1:])
    with pytest.raises(chip.ChipError, match="read-back differs"):
        chip.write_manifest(decode(bytes.fromhex(VECTOR["image_hex"])), glob)


def test_out_writes_the_image_file_only(tmp_path, capsys):
    glob = fake_bus(tmp_path, "2d-01")
    out = tmp_path / "kit.bin"
    assert main(["--sysfs-glob", glob, "write", manifest_file(tmp_path), "--out", str(out)]) == 0
    assert out.read_bytes().hex() == VECTOR["image_hex"]
    assert (tmp_path / "devices" / "2d-01" / "eeprom").read_bytes() == b"\xff" * 128
    assert main(["read", "--image", str(out)]) == 0
    assert '"calib_id": 20261025' in capsys.readouterr().out


def test_invalid_manifest_touches_nothing(tmp_path, capsys):
    glob = fake_bus(tmp_path, "2d-01")
    bad = dict(VECTOR["manifest"], gnss_link="none")
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(bad))
    assert main(["--sysfs-glob", glob, "write", str(p)]) == 1
    assert "gnss_link is 'none'" in capsys.readouterr().err
    assert (tmp_path / "devices" / "2d-01" / "eeprom").read_bytes() == b"\xff" * 128


def test_read_a_blank_chip_says_so(tmp_path, capsys):
    glob = fake_bus(tmp_path, "2d-01")
    assert main(["--sysfs-glob", glob, "read"]) == 1
    assert "blank" in capsys.readouterr().err
