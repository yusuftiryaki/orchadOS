#include <unity.h>

#include "../support/fakes.h"
#include "cfg_valset.h"
#include "receiver_config.h"

using namespace gl;

// Expected frames below were generated independently with Python struct.pack
// and a separate Fletcher checksum implementation.

void test_key_sizes() {
  TEST_ASSERT_EQUAL(1, cfg::keyValueSize(cfg::kUart1OutprotNmea));  // L
  TEST_ASSERT_EQUAL(1, cfg::keyValueSize(cfg::kMsgoutNavPvtUart1));  // U1
  TEST_ASSERT_EQUAL(2, cfg::keyValueSize(cfg::kRateMeas));           // U2
  TEST_ASSERT_EQUAL(4, cfg::keyValueSize(cfg::kUart2Baudrate));      // U4
  TEST_ASSERT_EQUAL(0, cfg::keyValueSize(0x00000001));
}

void test_single_key_frame_bytes() {
  const uint8_t expected[] = {0xB5, 0x62, 0x06, 0x8A, 0x0A, 0x00,
                              0x00, 0x01, 0x00, 0x00, 0x01, 0x00,
                              0x21, 0x30, 0xC8, 0x00, 0xB5, 0x81};
  cfg::ValsetBuilder b(cfg::kLayerRam);
  TEST_ASSERT_TRUE(b.add(cfg::kRateMeas, 200));
  uint8_t out[64];
  TEST_ASSERT_EQUAL(sizeof(expected), b.build(out, sizeof(out)));
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));
}

void test_baud_frame_bytes() {
  const uint8_t expected[] = {0xB5, 0x62, 0x06, 0x8A, 0x0C, 0x00, 0x00,
                              0x01, 0x00, 0x00, 0x01, 0x00, 0x52, 0x40,
                              0x00, 0x08, 0x07, 0x00, 0x3F, 0x83};
  cfg::ReceiverSettings s;  // UART1, 460800
  uint8_t out[64];
  TEST_ASSERT_EQUAL(sizeof(expected), cfg::buildBaudFrame(s, out, sizeof(out)));
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));
}

void test_logging_frame_bytes() {
  // UART1: UBX in/out on, NMEA out off, 200 ms measurement, nav ratio 1,
  // RAWX every 5th epoch (1 Hz), SFRBX every subframe, PVT every epoch
  // (5 Hz), time pulse aligned to GPS.
  const uint8_t expected[] = {
      0xB5, 0x62, 0x06, 0x8A, 0x33, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00,
      0x73, 0x10, 0x01, 0x01, 0x00, 0x74, 0x10, 0x01, 0x02, 0x00, 0x74, 0x10,
      0x00, 0x01, 0x00, 0x21, 0x30, 0xC8, 0x00, 0x02, 0x00, 0x21, 0x30, 0x01,
      0x00, 0xA5, 0x02, 0x91, 0x20, 0x05, 0x32, 0x02, 0x91, 0x20, 0x01, 0x07,
      0x00, 0x91, 0x20, 0x01, 0x0C, 0x00, 0x05, 0x20, 0x01, 0xF1, 0x7C};
  cfg::ReceiverSettings s;
  uint8_t out[128];
  TEST_ASSERT_EQUAL(sizeof(expected),
                    cfg::buildLoggingFrame(s, out, sizeof(out)));
  TEST_ASSERT_EQUAL_HEX8_ARRAY(expected, out, sizeof(expected));
}

void test_logging_frame_uart2_and_5hz_raw() {
  cfg::ReceiverSettings s;
  s.receiverUart = 2;
  s.rawRateHz = 5;
  uint8_t out[128];
  const size_t n = cfg::buildLoggingFrame(s, out, sizeof(out));
  TEST_ASSERT_EQUAL(59, n);
  // First key is CFG-UART2INPROT-UBX.
  TEST_ASSERT_EQUAL_HEX32(cfg::kUart2InprotUbx, ubx::readU4(out + 10));
  // RAWX key and value (every epoch).
  TEST_ASSERT_EQUAL_HEX32(cfg::kMsgoutRxmRawxUart2, ubx::readU4(out + 37));
  TEST_ASSERT_EQUAL(1, out[41]);
  uint8_t a, b;
  ubx::checksum(out + 2, n - 4, &a, &b);
  TEST_ASSERT_EQUAL_HEX8(a, out[n - 2]);
  TEST_ASSERT_EQUAL_HEX8(b, out[n - 1]);
}

void test_rate_validation() {
  TEST_ASSERT_EQUAL(5, cfg::epochDivider(200, 1));
  TEST_ASSERT_EQUAL(1, cfg::epochDivider(200, 5));
  TEST_ASSERT_EQUAL(0, cfg::epochDivider(200, 2));
  TEST_ASSERT_EQUAL(0, cfg::epochDivider(300, 1));
  cfg::ReceiverSettings s;
  s.rawRateHz = 3;
  uint8_t out[128];
  TEST_ASSERT_EQUAL(0, cfg::buildLoggingFrame(s, out, sizeof(out)));
  s.rawRateHz = 1;
  s.receiverUart = 3;
  TEST_ASSERT_FALSE(cfg::settingsValid(s));
}

void test_builder_limit() {
  cfg::ValsetBuilder b;
  for (size_t i = 0; i < cfg::kMaxKeys; ++i)
    TEST_ASSERT_TRUE(b.add(cfg::kRateMeas, 100));
  TEST_ASSERT_FALSE(b.add(cfg::kRateMeas, 100));
  TEST_ASSERT_FALSE(cfg::ValsetBuilder().add(0x00000001, 1));
}

void test_configure_receiver_already_at_target() {
  fake::Receiver rx(460800);
  fake::Clock clock;
  cfg::ReceiverSettings s;
  const ConfigResult r = configureReceiver(rx, clock, s);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigStatus::kOk),
                    static_cast<int>(r.status));
  TEST_ASSERT_EQUAL_UINT32(460800, r.detectedBaud);
  TEST_ASSERT_EQUAL(1, rx.valsets.size());
}

void test_configure_receiver_from_factory_baud() {
  fake::Receiver rx(38400);
  fake::Clock clock;
  cfg::ReceiverSettings s;
  const ConfigResult r = configureReceiver(rx, clock, s);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigStatus::kOk),
                    static_cast<int>(r.status));
  TEST_ASSERT_EQUAL_UINT32(38400, r.detectedBaud);
  TEST_ASSERT_EQUAL_UINT32(460800, rx.rxBaud);
  // Baud change, then the logging configuration.
  TEST_ASSERT_EQUAL(2, rx.valsets.size());
  TEST_ASSERT_EQUAL(51, rx.valsets[1].size());
}

void test_configure_receiver_no_response() {
  fake::Receiver rx(38400);
  rx.alive = false;
  fake::Clock clock;
  cfg::ReceiverSettings s;
  const ConfigResult r = configureReceiver(rx, clock, s, 2);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigStatus::kFailedNoResponse),
                    static_cast<int>(r.status));
  TEST_ASSERT_EQUAL(10, r.attempts);  // 2 rounds x (target + 4 candidates)
}

void test_configure_receiver_nak() {
  fake::Receiver rx(460800);
  rx.nak = true;
  fake::Clock clock;
  cfg::ReceiverSettings s;
  const ConfigResult r = configureReceiver(rx, clock, s);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigStatus::kFailedNak),
                    static_cast<int>(r.status));
}

void test_configure_receiver_invalid_settings() {
  fake::Receiver rx(460800);
  fake::Clock clock;
  cfg::ReceiverSettings s;
  s.pvtRateHz = 4;
  const ConfigResult r = configureReceiver(rx, clock, s);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigStatus::kFailedInvalid),
                    static_cast<int>(r.status));
  TEST_ASSERT_EQUAL(0, rx.valsets.size());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_key_sizes);
  RUN_TEST(test_single_key_frame_bytes);
  RUN_TEST(test_baud_frame_bytes);
  RUN_TEST(test_logging_frame_bytes);
  RUN_TEST(test_logging_frame_uart2_and_5hz_raw);
  RUN_TEST(test_rate_validation);
  RUN_TEST(test_builder_limit);
  RUN_TEST(test_configure_receiver_already_at_target);
  RUN_TEST(test_configure_receiver_from_factory_baud);
  RUN_TEST(test_configure_receiver_no_response);
  RUN_TEST(test_configure_receiver_nak);
  RUN_TEST(test_configure_receiver_invalid_settings);
  return UNITY_END();
}
