#include <unity.h>

#include <algorithm>
#include <vector>

#include "ubx.h"

using gl::ubx::Parser;

namespace {

std::vector<uint8_t> makeFrame(uint8_t cls, uint8_t id,
                               const std::vector<uint8_t>& payload) {
  std::vector<uint8_t> out(payload.size() + gl::ubx::kOverhead);
  const size_t n =
      gl::ubx::buildFrame(cls, id, payload.data(),
                          static_cast<uint16_t>(payload.size()), out.data(),
                          out.size());
  out.resize(n);
  return out;
}

struct Collected {
  int frames = 0;
  int checksumErrors = 0;
  int oversized = 0;
  int badLength = 0;
  std::vector<std::vector<uint8_t>> payloads;
  std::vector<uint8_t> ids;
};

void feed(Parser& p, const std::vector<uint8_t>& bytes, Collected* c) {
  for (uint8_t b : bytes) {
    switch (p.push(b)) {
      case Parser::Result::kFrame: {
        ++c->frames;
        const auto& f = p.frame();
        c->payloads.emplace_back(f.payload, f.payload + f.length);
        c->ids.push_back(f.msgId);
        break;
      }
      case Parser::Result::kChecksumError: ++c->checksumErrors; break;
      case Parser::Result::kOversized: ++c->oversized; break;
      case Parser::Result::kBadLength: ++c->badLength; break;
      case Parser::Result::kNone: break;
    }
  }
}

}  // namespace

void test_checksum_known_ack_frame() {
  // UBX-ACK-ACK for CFG-VALSET as sent by the receiver.
  const std::vector<uint8_t> expected = {0xB5, 0x62, 0x05, 0x01, 0x02,
                                         0x00, 0x06, 0x8A, 0x98, 0xC1};
  TEST_ASSERT_EQUAL_UINT8_ARRAY(expected.data(),
                                makeFrame(0x05, 0x01, {0x06, 0x8A}).data(),
                                expected.size());
}

void test_build_frame_rejects_small_buffer() {
  uint8_t out[10];
  const uint8_t payload[2] = {1, 2};
  TEST_ASSERT_EQUAL(0, gl::ubx::buildFrame(1, 2, payload, 2, out, 9));
  TEST_ASSERT_EQUAL(10, gl::ubx::buildFrame(1, 2, payload, 2, out, 10));
}

void test_parse_single_frame() {
  uint8_t buf[64];
  Parser p(buf, sizeof(buf));
  Collected c;
  feed(p, makeFrame(0x05, 0x01, {0x06, 0x8A}), &c);
  TEST_ASSERT_EQUAL(1, c.frames);
  TEST_ASSERT_EQUAL(0x01, c.ids[0]);
  TEST_ASSERT_EQUAL(2, c.payloads[0].size());
  TEST_ASSERT_EQUAL_HEX8(0x8A, c.payloads[0][1]);
}

void test_parse_fragmented_frames_with_noise() {
  uint8_t buf[64];
  Parser p(buf, sizeof(buf));
  Collected c;
  std::vector<uint8_t> stream = {'$', 'G', 'N', 0xB5, 0x00, 0xB5};
  const auto a = makeFrame(0x01, 0x07, {1, 2, 3, 4, 5});
  const auto b = makeFrame(0x02, 0x13, {});
  stream.insert(stream.end(), a.begin(), a.end());
  stream.push_back(0x55);
  stream.insert(stream.end(), b.begin(), b.end());
  // Feed in uneven fragments, as UART reads would deliver them.
  size_t pos = 0;
  const size_t sizes[] = {1, 4, 2, 7, 3, 100};
  for (size_t s : sizes) {
    if (pos >= stream.size()) break;
    const size_t n = std::min(s, stream.size() - pos);
    feed(p, std::vector<uint8_t>(stream.begin() + pos, stream.begin() + pos + n),
         &c);
    pos += n;
  }
  TEST_ASSERT_EQUAL(2, c.frames);
  TEST_ASSERT_EQUAL(0x07, c.ids[0]);
  TEST_ASSERT_EQUAL(5, c.payloads[0].size());
  TEST_ASSERT_EQUAL(5, c.payloads[0][4]);
  TEST_ASSERT_EQUAL(0x13, c.ids[1]);
  TEST_ASSERT_EQUAL(0, c.payloads[1].size());
}

void test_bad_checksum_is_dropped_and_parser_recovers() {
  uint8_t buf[64];
  Parser p(buf, sizeof(buf));
  Collected c;
  auto bad = makeFrame(0x01, 0x07, {9, 9, 9});
  bad[bad.size() - 1] ^= 0xFF;
  auto bad2 = makeFrame(0x01, 0x07, {9, 9, 9});
  bad2[7] ^= 0x01;  // corrupt payload, checksum no longer matches
  const auto good = makeFrame(0x05, 0x00, {0x06, 0x8A});
  feed(p, bad, &c);
  feed(p, bad2, &c);
  feed(p, good, &c);
  TEST_ASSERT_EQUAL(2, c.checksumErrors);
  TEST_ASSERT_EQUAL(1, c.frames);
  TEST_ASSERT_EQUAL(0x00, c.ids[0]);
  TEST_ASSERT_EQUAL(2, p.stats().checksumErrors);
}

void test_oversized_frame_is_verified_but_not_delivered() {
  uint8_t buf[8];
  Parser p(buf, sizeof(buf));
  Collected c;
  feed(p, makeFrame(0x02, 0x15, std::vector<uint8_t>(100, 0xAB)), &c);
  feed(p, makeFrame(0x05, 0x01, {0x06, 0x8A}), &c);
  TEST_ASSERT_EQUAL(1, c.oversized);
  TEST_ASSERT_EQUAL(1, c.frames);
}

void test_implausible_length_resyncs() {
  uint8_t buf[64];
  Parser p(buf, sizeof(buf));
  Collected c;
  std::vector<uint8_t> junk = {0xB5, 0x62, 0x01, 0x07, 0xFF, 0xFF};
  feed(p, junk, &c);
  feed(p, makeFrame(0x05, 0x01, {0x06, 0x8A}), &c);
  TEST_ASSERT_EQUAL(1, c.badLength);
  TEST_ASSERT_EQUAL(1, c.frames);
}

void test_repeated_sync1_before_sync2() {
  uint8_t buf[64];
  Parser p(buf, sizeof(buf));
  Collected c;
  std::vector<uint8_t> s = {0xB5, 0xB5};
  const auto f = makeFrame(0x05, 0x01, {0x06, 0x8A});
  s.insert(s.end(), f.begin() + 1, f.end());  // B5 B5 62 ...
  feed(p, s, &c);
  TEST_ASSERT_EQUAL(1, c.frames);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_checksum_known_ack_frame);
  RUN_TEST(test_build_frame_rejects_small_buffer);
  RUN_TEST(test_parse_single_frame);
  RUN_TEST(test_parse_fragmented_frames_with_noise);
  RUN_TEST(test_bad_checksum_is_dropped_and_parser_recovers);
  RUN_TEST(test_oversized_frame_is_verified_but_not_delivered);
  RUN_TEST(test_implausible_length_resyncs);
  RUN_TEST(test_repeated_sync1_before_sync2);
  return UNITY_END();
}
