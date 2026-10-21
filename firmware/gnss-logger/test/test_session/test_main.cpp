#include <unity.h>

#include <string>

#include "../support/fakes.h"
#include "session.h"

using gl::EventType;
using gl::Recorder;
using gl::TimeSync;
using gl::ble::ResultCode;

namespace {

int rc(ResultCode r) { return static_cast<int>(r); }

size_t countLines(const std::string& s) {
  size_t n = 0;
  for (char c : s) n += c == '\n';
  return n;
}

}  // namespace

void test_start_creates_session_files() {
  fake::Storage sd;
  TimeSync time;
  Recorder rec(sd, time);
  TEST_ASSERT_EQUAL(rc(ResultCode::kOk), rc(rec.start("S1", "P1", 1000)));
  TEST_ASSERT_TRUE(rec.recording());
  TEST_ASSERT_TRUE(sd.dirs.count("/sessions") == 1);
  TEST_ASSERT_TRUE(sd.dirs.count("/sessions/S1") == 1);
  TEST_ASSERT_TRUE(sd.files.count("/sessions/S1/gnss.ubx") == 1);
  const std::string& ev = sd.files["/sessions/S1/events.csv"];
  TEST_ASSERT_EQUAL_STRING(
      "esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,"
      "pps_gps_time_ns\n"
      "1000,,session_start,parcel_id=P1,,\n",
      ev.c_str());
  const std::string& js = sd.files["/sessions/S1/session.json"];
  TEST_ASSERT_TRUE(js.find("\"session_id\": \"S1\"") != std::string::npos);
  TEST_ASSERT_TRUE(js.find("\"parcel_id\": \"P1\"") != std::string::npos);
  TEST_ASSERT_TRUE(js.find("\"firmware_version\": \"0.3.0\"") !=
                   std::string::npos);
  TEST_ASSERT_TRUE(js.find("\"stop\": null") != std::string::npos);
}

void test_gnss_bytes_written_verbatim_and_flushed() {
  fake::Storage sd;
  TimeSync time;
  Recorder rec(sd, time);
  rec.start("S1", "P1", 0);
  const int flushesBefore = sd.flushes;
  const uint8_t data[] = {0xB5, 0x62, 0x01, 0x07, 0x00, 0x00, 0x08, 0x19};
  TEST_ASSERT_TRUE(rec.writeGnss(data, sizeof(data), 10));
  TEST_ASSERT_TRUE(rec.writeGnss(data, 3, 20));
  const std::string& f = sd.files["/sessions/S1/gnss.ubx"];
  TEST_ASSERT_EQUAL(11, f.size());
  TEST_ASSERT_EQUAL_HEX8(0x19, static_cast<uint8_t>(f[7]));
  TEST_ASSERT_EQUAL(2, sd.flushes - flushesBefore);
  TEST_ASSERT_TRUE(rec.bytesWritten() == 11);
}

void test_stop_writes_metadata() {
  fake::Storage sd;
  TimeSync time;
  Recorder rec(sd, time);
  rec.start("S1", "P1", 0);
  const uint8_t data[100] = {};
  rec.writeGnss(data, sizeof(data), 1);
  rec.setDroppedBytes(5);
  TEST_ASSERT_EQUAL(rc(ResultCode::kOk), rc(rec.stop(2000000, "command")));
  TEST_ASSERT_FALSE(rec.recording());
  const std::string& ev = sd.files["/sessions/S1/events.csv"];
  TEST_ASSERT_TRUE(ev.find("2000000,,session_stop,command,,\n") !=
                   std::string::npos);
  const std::string& js = sd.files["/sessions/S1/session.json"];
  TEST_ASSERT_TRUE(js.find("\"stop_reason\": \"command\"") != std::string::npos);
  TEST_ASSERT_TRUE(js.find("\"gnss_bytes\": 100") != std::string::npos);
  TEST_ASSERT_TRUE(js.find("\"dropped_bytes\": 5") != std::string::npos);
  TEST_ASSERT_TRUE(js.find("\"stop\": {\"esp_micros\":2000000") !=
                   std::string::npos);
  TEST_ASSERT_EQUAL(rc(ResultCode::kNotRecording), rc(rec.stop(3, "command")));
}

void test_refuses_without_card_or_space() {
  fake::Storage sd;
  sd.present = false;
  TimeSync time;
  Recorder rec(sd, time);
  TEST_ASSERT_EQUAL(rc(ResultCode::kSdMissing), rc(rec.start("S1", "P1", 0)));
  TEST_ASSERT_FALSE(rec.recording());
  TEST_ASSERT_FALSE(rec.sdPresent());

  sd.present = true;
  sd.free = 100ull << 20;  // below the 256 MiB start threshold
  TEST_ASSERT_EQUAL(rc(ResultCode::kSdFull), rc(rec.start("S1", "P1", 0)));
  TEST_ASSERT_TRUE(rec.sdLowSpace());
  TEST_ASSERT_TRUE(sd.dirs.empty());
}

void test_refuses_duplicate_and_double_start() {
  fake::Storage sd;
  TimeSync time;
  Recorder rec(sd, time);
  TEST_ASSERT_EQUAL(rc(ResultCode::kOk), rc(rec.start("S1", "P1", 0)));
  TEST_ASSERT_EQUAL(rc(ResultCode::kAlreadyRecording),
                    rc(rec.start("S2", "P1", 0)));
  rec.stop(1, "command");
  // Existing session folders are never overwritten.
  TEST_ASSERT_EQUAL(rc(ResultCode::kSessionExists),
                    rc(rec.start("S1", "P1", 2)));
  TEST_ASSERT_EQUAL(rc(ResultCode::kInvalidArgument),
                    rc(rec.start("a/b", "P1", 2)));
}

void test_mark_events() {
  fake::Storage sd;
  TimeSync time;
  Recorder rec(sd, time);
  TEST_ASSERT_EQUAL(rc(ResultCode::kNotRecording),
                    rc(rec.mark(EventType::kCorner, "1", 0)));
  rec.start("S1", "P1", 0);
  TEST_ASSERT_EQUAL(rc(ResultCode::kOk),
                    rc(rec.mark(EventType::kCorner, "1", 10)));
  TEST_ASSERT_EQUAL(rc(ResultCode::kOk),
                    rc(rec.mark(EventType::kQrSync, "2026-10-18T09:15:02Z", 20)));
  rec.logEvent(EventType::kPpsLost, "", 30);
  const std::string& ev = sd.files["/sessions/S1/events.csv"];
  TEST_ASSERT_EQUAL(5, countLines(ev));
  TEST_ASSERT_TRUE(ev.find("10,,corner,1,,\n") != std::string::npos);
  TEST_ASSERT_TRUE(ev.find("20,,qr_sync,2026-10-18T09:15:02Z,,\n") !=
                   std::string::npos);
  TEST_ASSERT_TRUE(ev.find("30,,pps_lost,,,\n") != std::string::npos);
}

void test_events_carry_gps_time_when_locked() {
  fake::Storage sd;
  TimeSync time;
  gl::NavPvt v{};
  v.year = 2026;
  v.month = 10;
  v.day = 18;
  v.hour = 9;
  v.validDate = v.validTime = v.fullyResolved = true;
  v.iTowMs = 33320000;
  time.onPps(10000000);
  time.onNavPvt(v, 10050000);
  time.update(10060000);
  Recorder rec(sd, time);
  rec.start("S1", "P1", 10500000);
  const std::string& js = sd.files["/sessions/S1/session.json"];
  TEST_ASSERT_TRUE(
      js.find("\"gps_time_ns\":1476350120500000000,\"utc\":"
              "\"2026-10-18T09:15:02.500Z\"") != std::string::npos);
}

void test_write_error_stops_session() {
  fake::Storage sd;
  TimeSync time;
  Recorder rec(sd, time);
  rec.start("S1", "P1", 0);
  sd.writeLimit = 4;
  const uint8_t data[10] = {};
  TEST_ASSERT_FALSE(rec.writeGnss(data, sizeof(data), 5));
  TEST_ASSERT_FALSE(rec.recording());
  TEST_ASSERT_TRUE(rec.sdError());
  // Card comes back: the next refresh clears the error.
  sd.writeLimit = -1;
  rec.refreshCard();
  TEST_ASSERT_FALSE(rec.sdError());
  TEST_ASSERT_EQUAL(1, sd.invalidations);
}

void test_card_full_during_recording_stops_session() {
  fake::Storage sd;
  sd.free = 300ull << 20;
  TimeSync time;
  Recorder::Limits limits;
  limits.minFreeToStart = 256ull << 20;
  limits.minFreeToRecord = 290ull << 20;
  Recorder rec(sd, time, limits);
  TEST_ASSERT_EQUAL(rc(ResultCode::kOk), rc(rec.start("S1", "P1", 0)));
  std::string chunk(4u << 20, '\0');
  TEST_ASSERT_TRUE(rec.writeGnss(reinterpret_cast<const uint8_t*>(chunk.data()),
                                 chunk.size(), 1));
  TEST_ASSERT_TRUE(rec.freeBytes() == (296ull << 20));
  chunk.assign(8u << 20, '\0');
  TEST_ASSERT_FALSE(rec.writeGnss(
      reinterpret_cast<const uint8_t*>(chunk.data()), chunk.size(), 2));
  TEST_ASSERT_FALSE(rec.recording());
  const std::string& ev = sd.files["/sessions/S1/events.csv"];
  TEST_ASSERT_TRUE(ev.find("2,,sd_error,sd_full,,\n") != std::string::npos);
  TEST_ASSERT_TRUE(ev.find("2,,session_stop,sd_full,,\n") != std::string::npos);
}

void test_utc_formatting() {
  TEST_ASSERT_EQUAL_STRING("2026-10-18T09:15:02.250Z",
                           gl::gpsNsToUtcIso(1476350120250000000LL).c_str());
  TEST_ASSERT_EQUAL_STRING("1980-01-05T23:59:42.000Z",
                           gl::gpsNsToUtcIso(0).c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_start_creates_session_files);
  RUN_TEST(test_gnss_bytes_written_verbatim_and_flushed);
  RUN_TEST(test_stop_writes_metadata);
  RUN_TEST(test_refuses_without_card_or_space);
  RUN_TEST(test_refuses_duplicate_and_double_start);
  RUN_TEST(test_mark_events);
  RUN_TEST(test_events_carry_gps_time_when_locked);
  RUN_TEST(test_write_error_stops_session);
  RUN_TEST(test_card_full_during_recording_stops_session);
  RUN_TEST(test_utc_formatting);
  return UNITY_END();
}
