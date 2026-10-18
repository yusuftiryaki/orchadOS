// Maps ESP32 microseconds to GPS time using PPS edges and NAV-PVT.
//
// The receiver's time pulse rises at the top of every GPS second. Each edge
// is timestamped with esp_micros in the ISR. The NAV-PVT of the epoch at that
// whole second arrives some tens of milliseconds later and tells which GPS
// second the edge was. The pair (edge micros, GPS second) is the anchor; any
// event is converted as anchor_gps + (event_micros - anchor_micros).
#pragma once

#include <cstdint>

#include "nav_pvt.h"

namespace gl {

enum class PpsState : uint8_t { kNeverSeen = 0, kLocked = 1, kLost = 2 };

struct TimeAnchor {
  bool valid = false;
  int64_t ppsMicros = 0;  // esp_micros of the latest PPS edge
  int64_t gpsNs = 0;      // GPS time of that edge, ns since GPS epoch
};

class TimeSync {
 public:
  // An edge counts as lost when none was seen for this long.
  static constexpr int64_t kPpsTimeoutUs = 1500000;
  // NAV-PVT for a whole second must arrive within this window after the edge.
  static constexpr int64_t kPvtMatchWindowUs = 950000;
  // Edges must be this close to a whole number of seconds after the anchor
  // to carry it forward; otherwise the anchor is dropped as untrustworthy.
  static constexpr int64_t kEdgeToleranceUs = 50000;
  // Anchors are carried forward across edges for at most this many seconds
  // without a confirming NAV-PVT.
  static constexpr int64_t kMaxCarrySeconds = 10;
  // Events further than this from the anchor get no GPS time.
  static constexpr int64_t kMaxExtrapolationUs = 2000000;

  enum class Transition : uint8_t { kNone, kLost, kRegained };

  void onPps(int64_t edgeMicros);
  void onNavPvt(const NavPvt& pvt, int64_t rxMicros);

  // Updates the PPS state; returns a transition at most once per change.
  // NeverSeen -> Locked is not reported, Lost -> Locked is kRegained.
  Transition update(int64_t nowMicros);

  // GPS time for an esp_micros timestamp, if PPS is locked and the anchor is
  // fresh enough.
  bool toGpsNs(int64_t micros, int64_t* gpsNs) const;

  PpsState ppsState() const { return state_; }
  const TimeAnchor& anchor() const { return anchor_; }
  uint32_t edgeCount() const { return edgeCount_; }

 private:
  PpsState state_ = PpsState::kNeverSeen;
  bool haveEdge_ = false;
  int64_t lastEdge_ = 0;
  uint32_t edgeCount_ = 0;
  TimeAnchor anchor_;
  int64_t confirmedGpsNs_ = 0;  // anchor second last confirmed by NAV-PVT
};

}  // namespace gl
