import dataclasses

import pytest

from orchados_recorder.ubx import (
    Framer,
    NavPvt,
    UbxMessage,
    build_nav_pvt,
    cfg_valset_ram,
    checksum,
    frame,
    is_ack,
    parse_nav_pvt,
)

# Hand-made NAV-PVT frame shared with the ESP32 firmware's tests
# (firmware/gnss-logger/test/test_nav_pvt): 2026-10-18 09:15:02 UTC,
# iTOW 33320000 ms (GPS week 2441), valid 0x07, tAcc 25 ns, nano -1200,
# fixType 3, flags gnssFixOK|diffSoln|carrSoln=fixed, numSV 27,
# lon 37.3812345, lat 37.0654321, height 512.345 m, hAcc 14 mm.
FIRMWARE_NAV_PVT_FRAME = bytes(
    [
        0xB5, 0x62, 0x01, 0x07, 0x5C, 0x00, 0x40, 0x6C, 0xFC, 0x01, 0xEA, 0x07,
        0x0A, 0x12, 0x09, 0x0F, 0x02, 0x07, 0x19, 0x00, 0x00, 0x00, 0x50, 0xFB,
        0xFF, 0xFF, 0x03, 0x83, 0x00, 0x1B, 0x79, 0xEC, 0x47, 0x16, 0x71, 0xBC,
        0x17, 0x16, 0x59, 0xD1, 0x07, 0x00, 0x4D, 0x9C, 0x07, 0x00, 0x0E, 0x00,
        0x00, 0x00, 0x15, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x00, 0xEC, 0xFF,
        0xFF, 0xFF, 0x05, 0x00, 0x00, 0x00, 0xD2, 0x04, 0x00, 0x00, 0x20, 0xAA,
        0x44, 0x00, 0x2C, 0x01, 0x00, 0x00, 0x40, 0x42, 0x0F, 0x00, 0x7B, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xB3, 0x05,
    ]
)  # fmt: skip


def test_framer_resyncs_and_drops_bad_checksum():
    good = frame(0x01, 0x07, bytes(92))
    bad = bytearray(frame(0x02, 0x15, b"\x00" * 16))
    bad[-1] ^= 0xFF
    msgs = Framer().feed(b"\x00\xb5garbage" + bytes(bad) + good[:10])
    assert msgs == []
    msgs = Framer().feed(b"\x00\xb5garbage" + bytes(bad) + good)
    assert [(m.cls, m.msg_id) for m in msgs] == [(0x01, 0x07)]


def test_framer_handles_split_feeds():
    f = Framer()
    data = frame(0x01, 0x07, bytes(92))
    assert f.feed(data[:5]) == []
    assert len(f.feed(data[5:])) == 1


def test_framer_byte_by_byte_and_back_to_back():
    f = Framer()
    data = frame(0x05, 0x01, b"\x06\x8a") + frame(0x02, 0x13, bytes(8))
    got = []
    for b in data:
        got += f.feed(bytes([b]))
    assert got == [UbxMessage(0x05, 0x01, b"\x06\x8a"), UbxMessage(0x02, 0x13, bytes(8))]


def test_framer_skips_implausible_length():
    f = Framer()
    junk = b"\xb5\x62\x02\x15\xff\xff"  # 65535-byte payload: not a real frame
    good = frame(0x01, 0x07, bytes(92))
    assert [(m.cls, m.msg_id) for m in f.feed(junk + good)] == [(0x01, 0x07)]


def test_checksum_matches_firmware_vector():
    assert checksum(FIRMWARE_NAV_PVT_FRAME[2:-2]) == (0xB3, 0x05)


def test_nav_pvt_fields_from_firmware_vector():
    (msg,) = Framer().feed(FIRMWARE_NAV_PVT_FRAME)
    pvt = parse_nav_pvt(msg.payload)
    assert (pvt.year, pvt.month, pvt.day, pvt.hour, pvt.minute, pvt.second) == (
        2026, 10, 18, 9, 15, 2,
    )  # fmt: skip
    assert pvt.i_tow_ms == 33320000 and pvt.nano == -1200 and pvt.t_acc_ns == 25
    assert pvt.fix_type == 3 and pvt.num_sv == 27 and pvt.h_acc_mm == 14
    assert (pvt.lat_e7, pvt.lon_e7, pvt.height_mm) == (370654321, 373812345, 512345)
    assert pvt.gnss_fix_ok and pvt.carr_soln == 2 and not pvt.invalid_llh
    assert pvt.gps_time_ns() == 1476350120000000000
    assert pvt.utc_unix_ns() == 1_792_314_902_000_000_000 - 1200


def test_nav_pvt_build_round_trip():
    pvt = NavPvt(
        i_tow_ms=33320000, year=2026, month=10, day=18, hour=9, minute=15, second=2,
        valid=0x07, t_acc_ns=25, nano=0, fix_type=3, flags=0x81, num_sv=27,
        lon_e7=373830000, lat_e7=370662000, height_mm=892340, h_acc_mm=14,
    )  # fmt: skip
    payload = build_nav_pvt(pvt)
    assert len(payload) == 92
    back = parse_nav_pvt(payload)
    assert (back.lat_e7, back.lon_e7, back.height_mm) == (370662000, 373830000, 892340)
    assert back.gnss_fix_ok and back.carr_soln == 2
    assert back == pvt
    assert parse_nav_pvt(build_nav_pvt(dataclasses.replace(pvt, flags3=1))).invalid_llh


def test_nav_pvt_unresolved_time_has_no_gps_time():
    pvt = parse_nav_pvt(bytes(92))
    assert pvt.gps_time_ns() is None and pvt.utc_unix_ns() is None
    with pytest.raises(ValueError):
        parse_nav_pvt(bytes(91))


def test_gps_week_rollover_reconciled_with_itow():
    # Firmware test: Saturday 2026-10-17 23:59:50 UTC is 00:00:08 Sunday GPS.
    pvt = NavPvt(i_tow_ms=8000, year=2026, month=10, day=17, hour=23, minute=59, second=50,
                 valid=0x07)  # fmt: skip
    assert pvt.gps_time_ns() == (2441 * 604800 + 8) * 10**9
    pvt = dataclasses.replace(pvt, day=18, hour=0, minute=0, second=0, i_tow_ms=604795000)
    assert pvt.gps_time_ns() == (2440 * 604800 + 604795) * 10**9


def test_valset_ram_layout():
    msg = cfg_valset_ram([(0x30210001, 200, 2)])
    assert msg[:4] == bytes([0xB5, 0x62, 0x06, 0x8A])
    assert msg[6:10] == bytes([0x00, 0x01, 0x00, 0x00])  # version 0, layer RAM, reserved
    assert msg[10:16] == (0x30210001).to_bytes(4, "little") + (200).to_bytes(2, "little")
    # Byte for byte the firmware's test vector
    assert msg == bytes.fromhex("b562068a0a0000010000010021 30c800b581".replace(" ", ""))


def test_is_ack():
    ack = UbxMessage(0x05, 0x01, b"\x06\x8a")
    nak = UbxMessage(0x05, 0x00, b"\x06\x8a")
    other = UbxMessage(0x05, 0x01, b"\x06\x01")
    assert is_ack(ack, 0x06, 0x8A) is True
    assert is_ack(nak, 0x06, 0x8A) is False
    assert is_ack(other, 0x06, 0x8A) is None
    assert is_ack(UbxMessage(0x01, 0x07, bytes(92)), 0x06, 0x8A) is None
