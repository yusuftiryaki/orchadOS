#include <unity.h>

#include "nav_pvt.h"
#include "ubx.h"

namespace {

// Hand-made NAV-PVT frame (generated independently with Python struct.pack):
// 2026-10-18 09:15:02 UTC, iTOW 33320000 ms (GPS week 2441), valid 0x07,
// tAcc 25 ns, nano -1200, fixType 3, flags gnssFixOK|diffSoln|carrSoln=fixed,
// numSV 27, lon 37.3812345, lat 37.0654321, height 512.345 m, hMSL 498.765 m,
// hAcc 14 mm, vAcc 21 mm, gSpeed 1234 mm/s, pDOP 1.23.
const uint8_t kFrame[] = {
    0xB5, 0x62, 0x01, 0x07, 0x5C, 0x00, 0x40, 0x6C, 0xFC, 0x01, 0xEA, 0x07,
    0x0A, 0x12, 0x09, 0x0F, 0x02, 0x07, 0x19, 0x00, 0x00, 0x00, 0x50, 0xFB,
    0xFF, 0xFF, 0x03, 0x83, 0x00, 0x1B, 0x79, 0xEC, 0x47, 0x16, 0x71, 0xBC,
    0x17, 0x16, 0x59, 0xD1, 0x07, 0x00, 0x4D, 0x9C, 0x07, 0x00, 0x0E, 0x00,
    0x00, 0x00, 0x15, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x00, 0xEC, 0xFF,
    0xFF, 0xFF, 0x05, 0x00, 0x00, 0x00, 0xD2, 0x04, 0x00, 0x00, 0x20, 0xAA,
    0x44, 0x00, 0x2C, 0x01, 0x00, 0x00, 0x40, 0x42, 0x0F, 0x00, 0x7B, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xB3, 0x05};

bool parseFixture(gl::NavPvt* pvt) {
  uint8_t buf[128];
  gl::ubx::Parser p(buf, sizeof(buf));
  for (uint8_t b : kFrame) {
    if (p.push(b) == gl::ubx::Parser::Result::kFrame) {
      const auto& f = p.frame();
      if (f.msgClass != gl::ubx::kClassNav || f.msgId != gl::ubx::kIdNavPvt)
        return false;
      return gl::decodeNavPvt(f.payload, f.length, pvt);
    }
  }
  return false;
}

}  // namespace

void test_decode_fields() {
  gl::NavPvt v;
  TEST_ASSERT_TRUE(parseFixture(&v));
  TEST_ASSERT_EQUAL_UINT32(33320000, v.iTowMs);
  TEST_ASSERT_EQUAL(2026, v.year);
  TEST_ASSERT_EQUAL(10, v.month);
  TEST_ASSERT_EQUAL(18, v.day);
  TEST_ASSERT_EQUAL(9, v.hour);
  TEST_ASSERT_EQUAL(15, v.minute);
  TEST_ASSERT_EQUAL(2, v.second);
  TEST_ASSERT_TRUE(v.validDate);
  TEST_ASSERT_TRUE(v.validTime);
  TEST_ASSERT_TRUE(v.fullyResolved);
  TEST_ASSERT_EQUAL_UINT32(25, v.tAccNs);
  TEST_ASSERT_EQUAL_INT32(-1200, v.nanoNs);
  TEST_ASSERT_EQUAL(3, v.fixType);
  TEST_ASSERT_TRUE(v.gnssFixOk);
  TEST_ASSERT_TRUE(v.diffSoln);
  TEST_ASSERT_EQUAL(static_cast<int>(gl::CarrierSolution::kFixed),
                    static_cast<int>(v.carrSoln));
  TEST_ASSERT_EQUAL(27, v.numSv);
  TEST_ASSERT_EQUAL_INT32(373812345, v.lonE7);
  TEST_ASSERT_EQUAL_INT32(370654321, v.latE7);
  TEST_ASSERT_EQUAL_INT32(512345, v.heightMm);
  TEST_ASSERT_EQUAL_INT32(498765, v.hMslMm);
  TEST_ASSERT_EQUAL_UINT32(14, v.hAccMm);
  TEST_ASSERT_EQUAL_UINT32(21, v.vAccMm);
  TEST_ASSERT_EQUAL_INT32(1234, v.gSpeedMmS);
  TEST_ASSERT_EQUAL(123, v.pDopE2);
  TEST_ASSERT_FALSE(v.invalidLlh);
}

void test_wrong_length_rejected() {
  uint8_t payload[gl::kNavPvtLen] = {};
  gl::NavPvt v;
  TEST_ASSERT_FALSE(gl::decodeNavPvt(payload, gl::kNavPvtLen - 1, &v));
  TEST_ASSERT_TRUE(gl::decodeNavPvt(payload, gl::kNavPvtLen, &v));
}

void test_carrier_float() {
  uint8_t payload[gl::kNavPvtLen] = {};
  payload[21] = 1 << 6;
  gl::NavPvt v;
  gl::decodeNavPvt(payload, sizeof(payload), &v);
  TEST_ASSERT_EQUAL(1, static_cast<int>(v.carrSoln));
  TEST_ASSERT_FALSE(v.gnssFixOk);
}

void test_gps_time_from_fixture() {
  gl::NavPvt v;
  TEST_ASSERT_TRUE(parseFixture(&v));
  int64_t ns = 0;
  TEST_ASSERT_TRUE(gl::gpsTimeNs(v, &ns));
  // (2441 * 604800 + 33320) s
  TEST_ASSERT_TRUE(ns == 1476350120000000000LL);
}

void test_gps_time_requires_resolved_time() {
  gl::NavPvt v;
  TEST_ASSERT_TRUE(parseFixture(&v));
  v.fullyResolved = false;
  int64_t ns = 0;
  TEST_ASSERT_FALSE(gl::gpsTimeNs(v, &ns));
}

void test_gps_week_rollover_reconciled_with_itow() {
  // Saturday 2026-10-17 23:59:50 UTC is 00:00:08 Sunday GPS: the UTC date
  // still belongs to week 2440 but GPS time is already in week 2441.
  gl::NavPvt v{};
  v.year = 2026;
  v.month = 10;
  v.day = 17;
  v.hour = 23;
  v.minute = 59;
  v.second = 50;
  v.validDate = v.validTime = v.fullyResolved = true;
  v.iTowMs = 8000;
  int64_t ns = 0;
  TEST_ASSERT_TRUE(gl::gpsTimeNs(v, &ns));
  TEST_ASSERT_TRUE(ns == (2441LL * 604800 + 8) * 1000000000LL);

  // If the leap second constant were stale, the UTC-derived week could land
  // on the wrong side of the boundary; iTOW decides.
  v.day = 18;
  v.hour = 0;
  v.minute = 0;
  v.second = 0;               // UTC-derived GPS time: week 2441, tow 18 s
  v.iTowMs = 604795000;       // but the receiver says end of week 2440
  TEST_ASSERT_TRUE(gl::gpsTimeNs(v, &ns));
  TEST_ASSERT_TRUE(ns == (2440LL * 604800 + 604795) * 1000000000LL);
}

void test_days_from_civil() {
  TEST_ASSERT_TRUE(gl::daysFromCivil(1970, 1, 1) == 0);
  TEST_ASSERT_TRUE(gl::daysFromCivil(1980, 1, 6) == 3657);
  TEST_ASSERT_TRUE(gl::daysFromCivil(2000, 3, 1) == 11017);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_decode_fields);
  RUN_TEST(test_wrong_length_rejected);
  RUN_TEST(test_carrier_float);
  RUN_TEST(test_gps_time_from_fixture);
  RUN_TEST(test_gps_time_requires_resolved_time);
  RUN_TEST(test_gps_week_rollover_reconciled_with_itow);
  RUN_TEST(test_days_from_civil);
  return UNITY_END();
}
