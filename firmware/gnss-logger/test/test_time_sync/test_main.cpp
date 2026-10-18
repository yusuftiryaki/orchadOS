#include <unity.h>

#include "time_sync.h"

using gl::NavPvt;
using gl::PpsState;
using gl::TimeSync;

namespace {

constexpr int64_t kS = 1000000;            // 1 s in us
constexpr int64_t kWeek2441Ns = 2441LL * 604800 * 1000000000LL;

// NAV-PVT at Sunday of GPS week 2441, `tow` seconds into the week.
NavPvt pvtAt(uint32_t towMs) {
  NavPvt v{};
  // UTC date/time is only used for the week; any time in the week works.
  v.year = 2026;
  v.month = 10;
  v.day = 18;
  v.hour = 9;
  v.validDate = v.validTime = v.fullyResolved = true;
  v.iTowMs = towMs;
  return v;
}

int64_t gpsAt(int64_t towS) { return kWeek2441Ns + towS * 1000000000LL; }

}  // namespace

void test_no_mapping_before_pps() {
  TimeSync t;
  int64_t g;
  t.onNavPvt(pvtAt(33320000), 1000);
  TEST_ASSERT_FALSE(t.toGpsNs(1000, &g));
  TEST_ASSERT_EQUAL(static_cast<int>(PpsState::kNeverSeen),
                    static_cast<int>(t.ppsState()));
}

void test_pps_paired_with_whole_second_pvt() {
  TimeSync t;
  const int64_t edge = 10 * kS + 123;
  t.onPps(edge);
  t.onNavPvt(pvtAt(33320000), edge + 80000);  // arrives 80 ms later
  TEST_ASSERT_EQUAL(static_cast<int>(TimeSync::Transition::kNone),
                    static_cast<int>(t.update(edge + 100000)));
  TEST_ASSERT_TRUE(t.anchor().valid);
  TEST_ASSERT_TRUE(t.anchor().ppsMicros == edge);
  TEST_ASSERT_TRUE(t.anchor().gpsNs == gpsAt(33320));
  int64_t g = 0;
  TEST_ASSERT_TRUE(t.toGpsNs(edge + 250000, &g));
  TEST_ASSERT_TRUE(g == gpsAt(33320) + 250000000LL);
  // Events slightly before the edge map backwards.
  TEST_ASSERT_TRUE(t.toGpsNs(edge - 1000, &g));
  TEST_ASSERT_TRUE(g == gpsAt(33320) - 1000000LL);
}

void test_fractional_pvt_does_not_anchor() {
  TimeSync t;
  t.onPps(5 * kS);
  t.onNavPvt(pvtAt(33320200), 5 * kS + 80000);
  t.update(5 * kS + 100000);
  TEST_ASSERT_FALSE(t.anchor().valid);
}

void test_late_pvt_outside_window_rejected() {
  TimeSync t;
  t.onPps(5 * kS);
  // PVT that arrives after the window cannot be trusted to match this edge.
  t.onNavPvt(pvtAt(33320000), 5 * kS + 960000);
  TEST_ASSERT_FALSE(t.anchor().valid);
}

void test_unresolved_time_rejected() {
  TimeSync t;
  t.onPps(5 * kS);
  NavPvt v = pvtAt(33320000);
  v.fullyResolved = false;
  t.onNavPvt(v, 5 * kS + 50000);
  TEST_ASSERT_FALSE(t.anchor().valid);
}

void test_anchor_carried_across_edges() {
  TimeSync t;
  t.onPps(10 * kS);
  t.onNavPvt(pvtAt(33320000), 10 * kS + 50000);
  // Next edges arrive with ~20 ppm drift; no PVT confirms them.
  t.onPps(11 * kS + 20);
  t.onPps(12 * kS + 40);
  t.update(12 * kS + 100);
  TEST_ASSERT_TRUE(t.anchor().valid);
  TEST_ASSERT_TRUE(t.anchor().ppsMicros == 12 * kS + 40);
  TEST_ASSERT_TRUE(t.anchor().gpsNs == gpsAt(33322));
  int64_t g = 0;
  TEST_ASSERT_TRUE(t.toGpsNs(12 * kS + 40 + 500, &g));
  TEST_ASSERT_TRUE(g == gpsAt(33322) + 500000);
}

void test_edge_skipping_one_second_keeps_count() {
  TimeSync t;
  t.onPps(10 * kS);
  t.onNavPvt(pvtAt(33320000), 10 * kS + 50000);
  t.onPps(12 * kS);  // one pulse missed, still a whole number of seconds
  TEST_ASSERT_TRUE(t.anchor().gpsNs == gpsAt(33322));
}

void test_misaligned_edge_drops_anchor() {
  TimeSync t;
  t.onPps(10 * kS);
  t.onNavPvt(pvtAt(33320000), 10 * kS + 50000);
  t.onPps(10 * kS + 400000);  // glitch
  TEST_ASSERT_FALSE(t.anchor().valid);
  // The next whole-second PVT re-anchors on the latest edge.
  t.onPps(11 * kS);
  t.onNavPvt(pvtAt(33321000), 11 * kS + 50000);
  TEST_ASSERT_TRUE(t.anchor().valid);
  TEST_ASSERT_TRUE(t.anchor().gpsNs == gpsAt(33321));
}

void test_anchor_expires_without_pvt_confirmation() {
  TimeSync t;
  t.onPps(10 * kS);
  t.onNavPvt(pvtAt(33320000), 10 * kS + 50000);
  for (int i = 1; i <= TimeSync::kMaxCarrySeconds; ++i) t.onPps((10 + i) * kS);
  TEST_ASSERT_TRUE(t.anchor().valid);
  t.onPps((11 + TimeSync::kMaxCarrySeconds) * kS);
  TEST_ASSERT_FALSE(t.anchor().valid);
}

void test_pps_lost_and_regained() {
  TimeSync t;
  t.onPps(10 * kS);
  t.onNavPvt(pvtAt(33320000), 10 * kS + 50000);
  TEST_ASSERT_EQUAL(static_cast<int>(TimeSync::Transition::kNone),
                    static_cast<int>(t.update(10 * kS + 100000)));
  TEST_ASSERT_EQUAL(static_cast<int>(PpsState::kLocked),
                    static_cast<int>(t.ppsState()));

  // No edge for more than 1.5 s.
  TEST_ASSERT_EQUAL(static_cast<int>(TimeSync::Transition::kLost),
                    static_cast<int>(t.update(11 * kS + 600000)));
  TEST_ASSERT_EQUAL(static_cast<int>(TimeSync::Transition::kNone),
                    static_cast<int>(t.update(12 * kS)));
  TEST_ASSERT_EQUAL(static_cast<int>(PpsState::kLost),
                    static_cast<int>(t.ppsState()));
  int64_t g;
  TEST_ASSERT_FALSE(t.toGpsNs(11 * kS, &g));
  // The anchor stays for reference in events.csv.
  TEST_ASSERT_TRUE(t.anchor().valid);

  // Pulses come back; the gap is a whole number of seconds so the anchor
  // carries over.
  t.onPps(15 * kS + 30);
  TEST_ASSERT_EQUAL(static_cast<int>(TimeSync::Transition::kRegained),
                    static_cast<int>(t.update(15 * kS + 1000)));
  TEST_ASSERT_TRUE(t.toGpsNs(15 * kS + 30, &g));
  TEST_ASSERT_TRUE(g == gpsAt(33325));
  TEST_ASSERT_EQUAL(2, t.edgeCount());
}

void test_extrapolation_limit() {
  TimeSync t;
  t.onPps(10 * kS);
  t.onNavPvt(pvtAt(33320000), 10 * kS + 50000);
  t.update(10 * kS + 60000);
  int64_t g;
  TEST_ASSERT_TRUE(t.toGpsNs(10 * kS + TimeSync::kMaxExtrapolationUs, &g));
  TEST_ASSERT_FALSE(
      t.toGpsNs(10 * kS + TimeSync::kMaxExtrapolationUs + 1, &g));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_no_mapping_before_pps);
  RUN_TEST(test_pps_paired_with_whole_second_pvt);
  RUN_TEST(test_fractional_pvt_does_not_anchor);
  RUN_TEST(test_late_pvt_outside_window_rejected);
  RUN_TEST(test_unresolved_time_rejected);
  RUN_TEST(test_anchor_carried_across_edges);
  RUN_TEST(test_edge_skipping_one_second_keeps_count);
  RUN_TEST(test_misaligned_edge_drops_anchor);
  RUN_TEST(test_anchor_expires_without_pvt_confirmation);
  RUN_TEST(test_pps_lost_and_regained);
  RUN_TEST(test_extrapolation_limit);
  return UNITY_END();
}
