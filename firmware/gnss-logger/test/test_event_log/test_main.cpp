#include <unity.h>

#include <cstdint>
#include <string>

#include "event_log.h"
#include "text.h"

using gl::EventType;
using gl::TimeSync;

namespace {

TimeSync lockedSync() {
  TimeSync t;
  gl::NavPvt v{};
  v.year = 2026;
  v.month = 10;
  v.day = 18;
  v.hour = 9;
  v.validDate = v.validTime = v.fullyResolved = true;
  v.iTowMs = 33320000;
  t.onPps(10000000);
  t.onNavPvt(v, 10050000);
  t.update(10100000);
  return t;
}

}  // namespace

void test_header() {
  TEST_ASSERT_EQUAL_STRING(
      "esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,"
      "pps_gps_time_ns\n",
      gl::eventCsvHeader());
}

void test_row_with_gps_time() {
  const TimeSync t = lockedSync();
  const std::string row =
      gl::formatEventRow({10250000, EventType::kCorner, "3"}, t);
  TEST_ASSERT_EQUAL_STRING(
      "10250000,1476350120250000000,corner,3,10000000,1476350120000000000\n",
      row.c_str());
}

void test_row_without_pps() {
  TimeSync t;
  const std::string row =
      gl::formatEventRow({42, EventType::kSessionStart, "parcel_id=P-1"}, t);
  TEST_ASSERT_EQUAL_STRING("42,,session_start,parcel_id=P-1,,\n", row.c_str());
}

void test_row_after_pps_lost_keeps_anchor() {
  TimeSync t = lockedSync();
  t.update(13000000);  // lost
  const std::string row = gl::formatEventRow({13000000, EventType::kPpsLost, ""}, t);
  TEST_ASSERT_EQUAL_STRING(
      "13000000,,pps_lost,,10000000,1476350120000000000\n", row.c_str());
}

void test_payload_escaping() {
  TimeSync t;
  const std::string row = gl::formatEventRow(
      {1, EventType::kQrSync, "2026-10-18T09:15:02.250Z,\"x\""}, t);
  TEST_ASSERT_EQUAL_STRING(
      "1,,qr_sync,\"2026-10-18T09:15:02.250Z,\"\"x\"\"\",,\n", row.c_str());
}

void test_event_type_names() {
  TEST_ASSERT_EQUAL_STRING("session_start",
                           gl::eventTypeName(EventType::kSessionStart));
  TEST_ASSERT_EQUAL_STRING("session_stop",
                           gl::eventTypeName(EventType::kSessionStop));
  TEST_ASSERT_EQUAL_STRING("corner", gl::eventTypeName(EventType::kCorner));
  TEST_ASSERT_EQUAL_STRING("qr_sync", gl::eventTypeName(EventType::kQrSync));
  TEST_ASSERT_EQUAL_STRING("pps_lost", gl::eventTypeName(EventType::kPpsLost));
  TEST_ASSERT_EQUAL_STRING("pps_regained",
                           gl::eventTypeName(EventType::kPpsRegained));
  TEST_ASSERT_EQUAL_STRING("sd_error", gl::eventTypeName(EventType::kSdError));
}

void test_int_formatting() {
  std::string s;
  gl::appendInt(&s, INT64_MIN);
  s.push_back(' ');
  gl::appendInt(&s, 0);
  s.push_back(' ');
  gl::appendUint(&s, UINT64_MAX);
  TEST_ASSERT_EQUAL_STRING("-9223372036854775808 0 18446744073709551615",
                           s.c_str());
}

void test_json_escaping() {
  std::string s;
  gl::appendJsonString(&s, std::string("a\"b\\c\n\x01"));
  TEST_ASSERT_EQUAL_STRING("\"a\\\"b\\\\c\\n\\u0001\"", s.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_header);
  RUN_TEST(test_row_with_gps_time);
  RUN_TEST(test_row_without_pps);
  RUN_TEST(test_row_after_pps_lost_keeps_anchor);
  RUN_TEST(test_payload_escaping);
  RUN_TEST(test_event_type_names);
  RUN_TEST(test_int_formatting);
  RUN_TEST(test_json_escaping);
  return UNITY_END();
}
