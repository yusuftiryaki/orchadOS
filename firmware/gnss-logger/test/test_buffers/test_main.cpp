#include <unity.h>

#include <cstring>
#include <string>
#include <vector>

#include "double_buffer.h"
#include "indicators.h"
#include "ring_buffer.h"

using gl::DoubleBuffer;
using gl::RingBuffer;

void test_ring_push_pop_wraparound() {
  RingBuffer<int, 4> r;  // holds 3
  TEST_ASSERT_EQUAL(3, r.capacity());
  for (int round = 0; round < 5; ++round) {
    TEST_ASSERT_TRUE(r.push(round * 10 + 1));
    TEST_ASSERT_TRUE(r.push(round * 10 + 2));
    TEST_ASSERT_EQUAL(2, r.size());
    int v = 0;
    TEST_ASSERT_TRUE(r.pop(&v));
    TEST_ASSERT_EQUAL(round * 10 + 1, v);
    TEST_ASSERT_TRUE(r.pop(&v));
    TEST_ASSERT_EQUAL(round * 10 + 2, v);
    TEST_ASSERT_FALSE(r.pop(&v));
  }
  TEST_ASSERT_TRUE(r.empty());
}

void test_ring_full_drops() {
  RingBuffer<int, 4> r;
  TEST_ASSERT_TRUE(r.push(1));
  TEST_ASSERT_TRUE(r.push(2));
  TEST_ASSERT_TRUE(r.push(3));
  TEST_ASSERT_FALSE(r.push(4));
  TEST_ASSERT_EQUAL(1, r.dropped());
  int v;
  r.pop(&v);
  TEST_ASSERT_EQUAL(1, v);
  TEST_ASSERT_TRUE(r.push(5));
}

void test_double_buffer_swaps_when_full() {
  uint8_t a[8], b[8];
  DoubleBuffer d(a, b, 8);
  const uint8_t data[12] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
  TEST_ASSERT_EQUAL(12, d.append(data, 12, 0));
  TEST_ASSERT_TRUE(d.ready());
  TEST_ASSERT_EQUAL(8, d.readySize());
  TEST_ASSERT_EQUAL_UINT8_ARRAY(data, d.readyData(), 8);
  TEST_ASSERT_EQUAL(4, d.pending());
  d.release();
  TEST_ASSERT_FALSE(d.ready());
  TEST_ASSERT_TRUE(d.swapNow());
  TEST_ASSERT_EQUAL_UINT8_ARRAY(data + 8, d.readyData(), 4);
}

void test_double_buffer_drops_when_both_busy() {
  uint8_t a[4], b[4];
  DoubleBuffer d(a, b, 4);
  const uint8_t data[10] = {};
  // 4 bytes fill the first buffer (swapped), 4 the second, 2 are dropped.
  TEST_ASSERT_EQUAL(8, d.append(data, 10, 0));
  TEST_ASSERT_TRUE(d.dropped() == 2);
  d.release();
  // The full active buffer swaps on the next append.
  TEST_ASSERT_EQUAL(1, d.append(data, 1, 0));
  TEST_ASSERT_TRUE(d.ready());
  TEST_ASSERT_EQUAL(4, d.readySize());
  TEST_ASSERT_EQUAL(1, d.pending());
}

void test_double_buffer_time_based_swap() {
  uint8_t a[64], b[64];
  DoubleBuffer d(a, b, 64);
  TEST_ASSERT_FALSE(d.swapIfDue(1000, 500));  // nothing buffered
  const uint8_t x = 0x42;
  d.append(&x, 1, 1000);
  d.append(&x, 1, 1300);
  TEST_ASSERT_FALSE(d.swapIfDue(1499, 500));
  TEST_ASSERT_TRUE(d.swapIfDue(1500, 500));  // age counts from first byte
  TEST_ASSERT_EQUAL(2, d.readySize());
  // Standby still busy: no swap even when due.
  d.append(&x, 1, 1600);
  TEST_ASSERT_FALSE(d.swapIfDue(2200, 500));
  d.release();
  TEST_ASSERT_TRUE(d.swapIfDue(2200, 500));
}

void test_double_buffer_preserves_stream_order() {
  uint8_t a[16], b[16];
  DoubleBuffer d(a, b, 16);
  std::string written;
  std::string expected;
  for (int i = 0; i < 200; ++i) {
    const std::string chunk(1 + i % 7, static_cast<char>('a' + i % 26));
    expected += chunk;
    d.append(reinterpret_cast<const uint8_t*>(chunk.data()), chunk.size(),
             static_cast<uint32_t>(i));
    if (d.ready()) {
      written.append(reinterpret_cast<const char*>(d.readyData()),
                     d.readySize());
      d.release();
    }
  }
  d.swapNow();
  if (d.ready()) {
    written.append(reinterpret_cast<const char*>(d.readyData()), d.readySize());
    d.release();
  }
  TEST_ASSERT_TRUE(d.dropped() == 0);
  TEST_ASSERT_TRUE(written == expected);
}

void test_battery_scaling() {
  // 220k / 33k divider: 2.5 V on the pin is 19.17 V on the battery.
  TEST_ASSERT_EQUAL(19166, gl::batteryMillivolts(2500, 220000, 33000));
  TEST_ASSERT_EQUAL(0, gl::batteryMillivolts(2500, 220000, 0));
  TEST_ASSERT_EQUAL(0xFFFF, gl::batteryMillivolts(3300, 1000000, 1000));
}

void test_led_patterns() {
  using gl::LedMode;
  TEST_ASSERT_TRUE(gl::selectLedMode(true, true, true) == LedMode::kBoot);
  TEST_ASSERT_TRUE(gl::selectLedMode(false, true, true) == LedMode::kError);
  TEST_ASSERT_TRUE(gl::selectLedMode(false, false, true) ==
                   LedMode::kRecording);
  TEST_ASSERT_TRUE(gl::selectLedMode(false, false, false) == LedMode::kIdle);
  TEST_ASSERT_TRUE(gl::ledLevel(LedMode::kIdle, 100));
  TEST_ASSERT_FALSE(gl::ledLevel(LedMode::kIdle, 600));
  TEST_ASSERT_FALSE(gl::ledLevel(LedMode::kRecording, 2050));
  TEST_ASSERT_TRUE(gl::ledLevel(LedMode::kRecording, 2150));
  TEST_ASSERT_TRUE(gl::ledLevel(LedMode::kError, 50));
  TEST_ASSERT_FALSE(gl::ledLevel(LedMode::kError, 150));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_ring_push_pop_wraparound);
  RUN_TEST(test_ring_full_drops);
  RUN_TEST(test_double_buffer_swaps_when_full);
  RUN_TEST(test_double_buffer_drops_when_both_busy);
  RUN_TEST(test_double_buffer_time_based_swap);
  RUN_TEST(test_double_buffer_preserves_stream_order);
  RUN_TEST(test_battery_scaling);
  RUN_TEST(test_led_patterns);
  return UNITY_END();
}
