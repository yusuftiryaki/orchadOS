#include <unity.h>

#include <climits>
#include <string>
#include <vector>

#include "ble_protocol.h"
#include "time_sync.h"

using namespace gl::ble;

namespace {

ResultCode decode(const std::vector<uint8_t>& b, Command* c) {
  return decodeCommand(b.data(), b.size(), c);
}

}  // namespace

void test_decode_start_session_bytes() {
  // [01][seq 07][len 3]"S-1"[len 2]"P9"
  const std::vector<uint8_t> b = {0x01, 0x07, 0x03, 'S', '-', '1',
                                  0x02, 'P',  '9'};
  Command c;
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kOk),
                    static_cast<int>(decode(b, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(Opcode::kStartSession),
                    static_cast<int>(c.op));
  TEST_ASSERT_EQUAL(7, c.seq);
  TEST_ASSERT_EQUAL_STRING("S-1", c.sessionId.c_str());
  TEST_ASSERT_EQUAL_STRING("P9", c.parcelId.c_str());
}

void test_decode_stop_session_bytes() {
  Command c;
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kOk),
                    static_cast<int>(decode({0x02, 0x2A}, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(Opcode::kStopSession),
                    static_cast<int>(c.op));
  TEST_ASSERT_EQUAL(42, c.seq);
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kMalformed),
                    static_cast<int>(decode({0x02, 0x2A, 0x00}, &c)));
}

void test_decode_mark_event_bytes() {
  // [03][seq 01][type 02 qr_sync][len 4]"T123"
  Command c;
  TEST_ASSERT_EQUAL(
      static_cast<int>(ResultCode::kOk),
      static_cast<int>(decode({0x03, 0x01, 0x02, 0x04, 'T', '1', '2', '3'}, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(MarkType::kQrSync),
                    static_cast<int>(c.mark));
  TEST_ASSERT_EQUAL_STRING("T123", c.payload.c_str());
  TEST_ASSERT_EQUAL(static_cast<int>(gl::EventType::kQrSync),
                    static_cast<int>(markEventType(c.mark)));
  // Corner with empty payload.
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kOk),
                    static_cast<int>(decode({0x03, 0x02, 0x01, 0x00}, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(gl::EventType::kCorner),
                    static_cast<int>(markEventType(c.mark)));
}

void test_round_trip_commands() {
  Command in;
  in.op = Opcode::kStartSession;
  in.seq = 200;
  in.sessionId = "0f8c2a9e-1b7d-4c55-9a1e-6d2f3b4c5a6e";
  in.parcelId = "parcel:Gaziantep/12";
  uint8_t buf[kMaxCommandLen];
  const size_t n = encodeCommand(in, buf, sizeof(buf));
  TEST_ASSERT_EQUAL(2 + 1 + 36 + 1 + 19, n);
  Command out;
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kOk),
                    static_cast<int>(decodeCommand(buf, n, &out)));
  TEST_ASSERT_EQUAL_STRING(in.sessionId.c_str(), out.sessionId.c_str());
  TEST_ASSERT_EQUAL_STRING(in.parcelId.c_str(), out.parcelId.c_str());
  TEST_ASSERT_EQUAL(200, out.seq);

  Command mark;
  mark.op = Opcode::kMarkEvent;
  mark.seq = 3;
  mark.mark = MarkType::kCorner;
  mark.payload = "köşe 4";  // UTF-8 is allowed
  const size_t m = encodeCommand(mark, buf, sizeof(buf));
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kOk),
                    static_cast<int>(decodeCommand(buf, m, &out)));
  TEST_ASSERT_EQUAL_STRING("köşe 4", out.payload.c_str());
}

void test_malformed_commands() {
  Command c;
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kMalformed),
                    static_cast<int>(decode({}, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kMalformed),
                    static_cast<int>(decode({0x01}, &c)));
  // String length runs past the end.
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kMalformed),
                    static_cast<int>(decode({0x01, 0x05, 0x09, 'a'}, &c)));
  TEST_ASSERT_EQUAL(5, c.seq);  // seq still reported
  // Trailing bytes.
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kMalformed),
                    static_cast<int>(decode({0x01, 0x00, 0x01, 'a', 0x01, 'b', 0xFF}, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kMalformed),
                    static_cast<int>(decode({0x03, 0x00, 0x01}, &c)));
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kUnknownOpcode),
                    static_cast<int>(decode({0x09, 0x00}, &c)));
}

void test_invalid_arguments() {
  Command c;
  // Session id with a slash would escape the sessions folder.
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kInvalidArgument),
                    static_cast<int>(decode({0x01, 0x00, 0x04, '.', '.', '/', 'x', 0x01, 'p'}, &c)));
  // Empty parcel id.
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kInvalidArgument),
                    static_cast<int>(decode({0x01, 0x00, 0x01, 'a', 0x00}, &c)));
  // Unknown mark type (session_start cannot be marked by the phone).
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kInvalidArgument),
                    static_cast<int>(decode({0x03, 0x00, 0x05, 0x00}, &c)));
  // Newline in payload.
  TEST_ASSERT_EQUAL(static_cast<int>(ResultCode::kInvalidArgument),
                    static_cast<int>(decode({0x03, 0x00, 0x01, 0x02, 'a', '\n'}, &c)));
  TEST_ASSERT_FALSE(validSessionId(std::string(37, 'a')));
  TEST_ASSERT_TRUE(validSessionId(std::string(36, 'a')));
  TEST_ASSERT_FALSE(validPayload(std::string(201, 'a')));
}

// Same message as the example in README.md.
void test_status_encoding_bytes() {
  Status s;
  s.recording = 1;
  s.flags = flags::kSdPresent | flags::kTimeMapped | flags::kGnssFixOk;
  s.rxConfig = 1;
  s.ppsState = 1;
  s.fixType = 3;
  s.carrSoln = 2;
  s.numSv = 27;
  s.hAccMm = 14;
  s.bytesWritten = 0x01020304;
  s.sdFreeMib = 30000;
  s.batteryMv = 18200;
  s.fwMajor = 0;
  s.fwMinor = 3;
  s.fwPatch = 0;
  s.droppedBytes = 0;
  s.lastCmdSeq = 7;
  s.lastCmdResult = 0;
  s.gpsTimeNs = 1476350122250000000ULL;
  s.flags |= flags::kPositionValid;
  s.latE7 = 370662000;    // 37.0662000 N
  s.lonE7 = 373830000;    // 37.3830000 E
  s.heightMm = 892340;    // 892.340 m
  uint8_t out[kStatusLen];
  encodeStatus(s, out);
  TEST_ASSERT_EQUAL(51, kStatusLen);
  const uint8_t expected[kStatusLen] = {
      0x01, 0x01, 0x69, 0x01, 0x01, 0x03, 0x02, 0x1B,  // header bytes
      0x0E, 0x00, 0x00, 0x00,                          // hAcc
      0x04, 0x03, 0x02, 0x01,                          // bytes written
      0x30, 0x75, 0x00, 0x00,                          // SD free MiB
      0x18, 0x47,                                      // battery mV
      0x00, 0x03, 0x00,                                // firmware
      0x00, 0x00, 0x00, 0x00,                          // dropped
      0x07, 0x00,                                      // last command
      0x80, 0xD6, 0xD0, 0x38, 0x9D, 0x0C, 0x7D, 0x14,  // gps_time_ns
      0x70, 0xDA, 0x17, 0x16,                          // lat_e7
      0x70, 0x31, 0x48, 0x16,                          // lon_e7
      0xB4, 0x9D, 0x0D, 0x00};                         // height_mm
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, kStatusLen);

  Status back;
  TEST_ASSERT_TRUE(decodeStatus(out, sizeof(out), &back));
  TEST_ASSERT_EQUAL_UINT32(0x01020304, back.bytesWritten);
  TEST_ASSERT_EQUAL(18200, back.batteryMv);
  TEST_ASSERT_EQUAL(27, back.numSv);
  TEST_ASSERT_TRUE(back.gpsTimeNs == 1476350122250000000ULL);
  TEST_ASSERT_EQUAL_INT32(370662000, back.latE7);
  TEST_ASSERT_EQUAL_INT32(373830000, back.lonE7);
  TEST_ASSERT_EQUAL_INT32(892340, back.heightMm);
  TEST_ASSERT_TRUE(back.flags & flags::kPositionValid);
  TEST_ASSERT_FALSE(decodeStatus(out, kStatusMinLen - 1, &back));
}

namespace {

gl::NavPvt fixedPvt() {
  gl::NavPvt pvt{};
  pvt.gnssFixOk = true;
  pvt.fixType = 3;
  pvt.latE7 = 370662000;
  pvt.lonE7 = 373830000;
  pvt.heightMm = 892340;
  return pvt;
}

}  // namespace

void test_status_position_offsets_and_limits() {
  Status s;
  s.flags = flags::kPositionValid;
  s.latE7 = -900000000;              // south pole
  s.lonE7 = 1800000000;              // antimeridian
  s.heightMm = INT32_MIN;            // most negative height
  uint8_t out[kStatusLen];
  encodeStatus(s, out);
  const uint8_t lat[4] = {0x00, 0x17, 0x5B, 0xCA};  // -900000000
  const uint8_t lon[4] = {0x00, 0xD2, 0x49, 0x6B};  // 1800000000
  const uint8_t height[4] = {0x00, 0x00, 0x00, 0x80};
  TEST_ASSERT_EQUAL_HEX8_ARRAY(lat, out + 39, 4);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(lon, out + 43, 4);
  TEST_ASSERT_EQUAL_HEX8_ARRAY(height, out + 47, 4);
  Status back;
  TEST_ASSERT_TRUE(decodeStatus(out, sizeof(out), &back));
  TEST_ASSERT_EQUAL_INT32(-900000000, back.latE7);
  TEST_ASSERT_EQUAL_INT32(1800000000, back.lonE7);
  TEST_ASSERT_EQUAL_INT32(INT32_MIN, back.heightMm);

  s.latE7 = 900000000;
  s.lonE7 = -1800000000;
  s.heightMm = INT32_MAX;
  encodeStatus(s, out);
  TEST_ASSERT_TRUE(decodeStatus(out, sizeof(out), &back));
  TEST_ASSERT_EQUAL_INT32(900000000, back.latE7);
  TEST_ASSERT_EQUAL_INT32(-1800000000, back.lonE7);
  TEST_ASSERT_EQUAL_INT32(INT32_MAX, back.heightMm);
}

void test_status_position_from_nav_pvt() {
  Status s;
  s.flags = flags::kGnssFixOk;
  gl::NavPvt pvt = fixedPvt();
  setStatusPosition(&pvt, &s);
  TEST_ASSERT_TRUE(s.flags & flags::kPositionValid);
  TEST_ASSERT_TRUE(s.flags & flags::kGnssFixOk);  // other bits kept
  TEST_ASSERT_EQUAL_INT32(370662000, s.latE7);
  TEST_ASSERT_EQUAL_INT32(373830000, s.lonE7);
  TEST_ASSERT_EQUAL_INT32(892340, s.heightMm);
  // 2D and GNSS+DR fixes count as positions.
  pvt.fixType = 2;
  TEST_ASSERT_TRUE(positionValid(pvt));
  pvt.fixType = 4;
  TEST_ASSERT_TRUE(positionValid(pvt));
}

void test_status_position_without_fix() {
  // Every invalid case leaves the block zero and the bit cleared, even when
  // a previous message carried a position.
  const uint8_t badFixTypes[] = {0, 1, 5};
  for (uint8_t fix : badFixTypes) {
    Status s;
    s.flags = flags::kPositionValid;
    s.latE7 = s.lonE7 = s.heightMm = 1;
    gl::NavPvt pvt = fixedPvt();
    pvt.fixType = fix;
    setStatusPosition(&pvt, &s);
    TEST_ASSERT_FALSE(s.flags & flags::kPositionValid);
    TEST_ASSERT_EQUAL_INT32(0, s.latE7);
    TEST_ASSERT_EQUAL_INT32(0, s.lonE7);
    TEST_ASSERT_EQUAL_INT32(0, s.heightMm);
  }
  gl::NavPvt noFixOk = fixedPvt();
  noFixOk.gnssFixOk = false;
  TEST_ASSERT_FALSE(positionValid(noFixOk));
  gl::NavPvt invalidLlh = fixedPvt();
  invalidLlh.invalidLlh = true;
  TEST_ASSERT_FALSE(positionValid(invalidLlh));

  // No NAV-PVT yet.
  Status s;
  s.flags = flags::kPositionValid | flags::kSdPresent;
  s.latE7 = 5;
  setStatusPosition(nullptr, &s);
  TEST_ASSERT_EQUAL_HEX8(flags::kSdPresent, s.flags);
  uint8_t out[kStatusLen];
  encodeStatus(s, out);
  for (size_t i = 39; i < kStatusLen; ++i) TEST_ASSERT_EQUAL_HEX8(0x00, out[i]);
}

void test_status_39_byte_message_has_no_position() {
  // A 0.2.0 message: the position is unknown even if bit6 happened to be set.
  Status s;
  s.flags = flags::kPositionValid;
  s.gpsTimeNs = 42;
  s.latE7 = 370662000;
  uint8_t out[kStatusLen];
  encodeStatus(s, out);
  Status back;
  TEST_ASSERT_TRUE(decodeStatus(out, kStatusGpsTimeLen, &back));
  TEST_ASSERT_TRUE(back.gpsTimeNs == 42);
  TEST_ASSERT_EQUAL_INT32(0, back.latE7);
  TEST_ASSERT_FALSE(back.flags & flags::kPositionValid);
  // 50 bytes: still without the full block.
  TEST_ASSERT_TRUE(decodeStatus(out, kStatusLen - 1, &back));
  TEST_ASSERT_EQUAL_INT32(0, back.latE7);
}

void test_status_gps_time_offset_and_legacy_length() {
  Status s;
  s.gpsTimeNs = 0x0102030405060708ULL;
  uint8_t out[kStatusLen];
  encodeStatus(s, out);
  // Offset 31, u64 little-endian, after last_cmd_result.
  const uint8_t expected[8] = {0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01};
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out + 31, 8);

  // A 31-byte message (before gps_time_ns was appended) still decodes.
  Status back;
  TEST_ASSERT_TRUE(decodeStatus(out, kStatusMinLen, &back));
  TEST_ASSERT_TRUE(back.gpsTimeNs == 0);
  // Longer messages (fields appended later) decode too.
  uint8_t longer[kStatusLen + 4] = {};
  encodeStatus(s, longer);
  TEST_ASSERT_TRUE(decodeStatus(longer, sizeof(longer), &back));
  TEST_ASSERT_TRUE(back.gpsTimeNs == 0x0102030405060708ULL);
}

void test_status_gps_time_from_anchor() {
  constexpr int64_t kS = 1000000;
  constexpr int64_t kWeek2441Ns = 2441LL * 604800 * 1000000000LL;
  gl::NavPvt pvt{};
  pvt.year = 2026;
  pvt.month = 10;
  pvt.day = 18;
  pvt.hour = 9;
  pvt.validDate = pvt.validTime = pvt.fullyResolved = true;
  pvt.iTowMs = 33320000;
  const int64_t anchorGps = kWeek2441Ns + 33320LL * 1000000000LL;

  gl::TimeSync t;
  const int64_t edge = 10 * kS + 20;
  // No PPS mapping yet: 0.
  TEST_ASSERT_TRUE(statusGpsTimeNs(t, edge) == 0);

  t.onPps(edge);
  t.onNavPvt(pvt, edge + 80000);
  t.update(edge + 100000);
  // anchor_gps + (now - anchor_micros) * 1000
  const int64_t now = edge + 412345;
  TEST_ASSERT_TRUE(statusGpsTimeNs(t, now) ==
                   static_cast<uint64_t>(anchorGps + 412345LL * 1000));

  // Too far from the anchor: no mapping, 0.
  TEST_ASSERT_TRUE(statusGpsTimeNs(t, edge + gl::TimeSync::kMaxExtrapolationUs +
                                          1) == 0);
  // PPS lost: 0.
  t.update(edge + 2 * kS);
  TEST_ASSERT_TRUE(statusGpsTimeNs(t, edge + 2 * kS) == 0);
}

void test_default_status() {
  Status s;
  uint8_t out[kStatusLen];
  encodeStatus(s, out);
  TEST_ASSERT_EQUAL_HEX8(0xFF, out[8]);  // unknown hAcc
  TEST_ASSERT_EQUAL_HEX8(0xFF, out[30]);  // no command yet
  for (size_t i = 31; i < kStatusLen; ++i) {
    TEST_ASSERT_EQUAL_HEX8(0x00, out[i]);  // no GPS time mapping
  }
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_decode_start_session_bytes);
  RUN_TEST(test_decode_stop_session_bytes);
  RUN_TEST(test_decode_mark_event_bytes);
  RUN_TEST(test_round_trip_commands);
  RUN_TEST(test_malformed_commands);
  RUN_TEST(test_invalid_arguments);
  RUN_TEST(test_status_encoding_bytes);
  RUN_TEST(test_status_gps_time_offset_and_legacy_length);
  RUN_TEST(test_status_position_offsets_and_limits);
  RUN_TEST(test_status_position_from_nav_pvt);
  RUN_TEST(test_status_position_without_fix);
  RUN_TEST(test_status_39_byte_message_has_no_position);
  RUN_TEST(test_status_gps_time_from_anchor);
  RUN_TEST(test_default_status);
  return UNITY_END();
}
