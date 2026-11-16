import pytest

from orchados_recorder.protocol import (
    COMMAND_UUID,
    OVERRIDABLE,
    PROTOCOL_VERSION,
    RECORDER_KIND_PI,
    SERVICE_UUID,
    STATUS_LEN,
    STATUS_UUID,
    Alert,
    Check,
    MarkEvent,
    Result,
    StartSession,
    Status,
    StopSession,
    check_names,
    decode_command,
    encode_status,
)

# Example status message of the firmware README (51 bytes).
README_STATUS = bytes.fromhex(
    "01 01 69 01 01 03 02 1B 0E 00 00 00 04 03 02 01 30 75 00 00 18 47 00 03 00"
    " 00 00 00 00 07 00 80 D6 D0 38 9D 0C 7D 14 70 DA 17 16 70 31 48 16 B4 9D 0D 00".replace(
        " ", ""
    )
)


def test_constants():
    assert SERVICE_UUID == "cdee0001-a1bf-488e-8eda-a2c084827c6c"
    assert STATUS_UUID == "cdee0002-a1bf-488e-8eda-a2c084827c6c"
    assert COMMAND_UUID == "cdee0003-a1bf-488e-8eda-a2c084827c6c"
    assert PROTOCOL_VERSION == 1 and STATUS_LEN == 77 and RECORDER_KIND_PI == 1
    assert OVERRIDABLE == 0x07
    assert Result.PRECHECK_FAILED == 10 and Result.NONE == 0xFF


def test_first_51_bytes_match_firmware_readme_example():
    s = Status(
        version=1,
        recording=True,
        flags=0x69,
        rx_config=1,
        pps_state=1,
        fix_type=3,
        carr_soln=2,
        num_sv=27,
        h_acc_mm=14,
        bytes_written=0x01020304,
        sd_free_mib=30000,
        battery_mv=18200,
        fw=(0, 3, 0),
        dropped_bytes=0,
        last_cmd_seq=7,
        last_cmd_result=0,
        gps_time_ns=1476350122250000000,
        lat_e7=370662000,
        lon_e7=373830000,
        height_mm=892340,
    )  # extension fields default to 0
    out = encode_status(s)
    assert len(out) == 77 and out[:51] == README_STATUS and out[51] == RECORDER_KIND_PI
    assert out[52:] == bytes(25)


def test_extension_offsets():
    out = encode_status(
        Status.idle(
            lidar_state=1,
            lidar_mode=2,
            clock_state=2,
            lidar_points_per_s=64000,
            imu_hz=200,
            lidar_gap_count=2,
            lidar_longest_gap_s=4,
            lidar_written_mib=900,
            clock_offset_us=-12,
            alerts=Alert.LIDAR_SILENT,
            precheck_fail=Check.CLOCK,
            overrides=Check.LIDAR,
        )
    )
    assert out[52] == 1 and out[53] == 2 and out[54] == 2
    assert int.from_bytes(out[59:63], "little") == 64000
    assert int.from_bytes(out[63:65], "little") == 200
    assert int.from_bytes(out[65:67], "little") == 2
    assert int.from_bytes(out[67:69], "little") == 4
    assert int.from_bytes(out[69:73], "little") == 900
    assert out[55] == 4 and out[56] == 1 and out[57] == 1 and out[58] == 0
    assert int.from_bytes(out[73:77], "little", signed=True) == -12


def test_idle_defaults():
    out = encode_status(Status.idle())
    assert out[0] == 1 and out[1] == 0
    assert int.from_bytes(out[8:12], "little") == 0xFFFFFFFF  # no NAV-PVT yet
    assert out[30] == 0xFF  # no command yet
    assert out[51] == RECORDER_KIND_PI


def test_fields_saturate():
    out = encode_status(
        Status.idle(
            bytes_written=1 << 40,
            lidar_longest_gap_s=100_000,
            imu_hz=70_000,
            clock_offset_us=-(1 << 40),
        )
    )
    assert out[12:16] == b"\xff\xff\xff\xff"
    assert out[67:69] == b"\xff\xff" and out[63:65] == b"\xff\xff"
    assert int.from_bytes(out[73:77], "little", signed=True) == -(1 << 31)


def test_readme_command_vectors():
    cmd, seq, res = decode_command(bytes.fromhex("010703532d3104502d3132"))
    assert res == Result.OK and seq == 7 and cmd == StartSession(7, "S-1", "P-12", 0)
    assert decode_command(bytes.fromhex("0208"))[0] == StopSession(8)
    assert decode_command(bytes.fromhex("0309010133"))[0] == MarkEvent(9, "corner", "3")
    qr = b"OQ1:1476350122230:S-1"
    cmd, _, res = decode_command(bytes([3, 10, 2, len(qr)]) + qr)
    assert res == Result.OK and cmd == MarkEvent(10, "qr_sync", qr.decode())


def test_start_session_override_byte():
    base = bytes.fromhex("010703532d3104502d3132")
    assert decode_command(base + b"\x05")[0].override_mask == 5
    assert decode_command(base + b"\x08")[2] == Result.INVALID_ARGUMENT  # SSD not overridable
    assert decode_command(base + b"\x10")[2] == Result.INVALID_ARGUMENT  # nor the receiver
    assert decode_command(base + b"\x01\x00")[2] == Result.MALFORMED


@pytest.mark.parametrize(
    ("data", "result"),
    [
        (b"", Result.MALFORMED),
        (b"\x01", Result.MALFORMED),
        (b"\x09\x01", Result.UNKNOWN_OPCODE),
        (b"\x02\x01\x00", Result.MALFORMED),
        (bytes.fromhex("010703532d31"), Result.MALFORMED),  # parcel missing
        (bytes.fromhex("0107035320310150"), Result.INVALID_ARGUMENT),  # space in id
        (bytes.fromhex("0107") + b"\x00" + bytes.fromhex("0150"), Result.INVALID_ARGUMENT),
        (bytes([1, 7, 37]) + b"a" * 37 + bytes.fromhex("0150"), Result.INVALID_ARGUMENT),
        (bytes([1, 7, 1]) + b"a" + bytes([65]) + b"p" * 65, Result.INVALID_ARGUMENT),
        (bytes.fromhex("03090301 33"), Result.INVALID_ARGUMENT),  # unknown mark type
        (bytes.fromhex("0309010133 00"), Result.MALFORMED),
        (bytes([3, 9, 1, 1, 0x0A]), Result.INVALID_ARGUMENT),  # control character
        (bytes([3, 9, 1, 201]) + b"x" * 201, Result.INVALID_ARGUMENT),
        (b"\x03\x09", Result.MALFORMED),
    ],
)
def test_command_constraints(data, result):
    cmd, seq, res = decode_command(data)
    assert res == result and cmd is None
    assert seq == (data[1] if len(data) >= 2 else None)


def test_check_names():
    assert check_names(Check.LIDAR | Check.CLOCK) == ["lidar", "clock"]
    assert check_names(Check(0)) == []
