#include "time_sync.h"

namespace gl {

namespace {
constexpr int64_t kSecondUs = 1000000;
constexpr int64_t kSecondNs = 1000000000;
}  // namespace

void TimeSync::onPps(int64_t edge) {
  if (anchor_.valid) {
    const int64_t dt = edge - anchor_.ppsMicros;
    const int64_t k = (dt + kSecondUs / 2) / kSecondUs;  // nearest second
    const int64_t err = dt - k * kSecondUs;
    const int64_t newGps = anchor_.gpsNs + k * kSecondNs;
    const bool aligned = k >= 1 && err <= kEdgeToleranceUs &&
                         err >= -kEdgeToleranceUs;
    const bool fresh = newGps - confirmedGpsNs_ <= kMaxCarrySeconds * kSecondNs;
    if (aligned && fresh) {
      anchor_.ppsMicros = edge;
      anchor_.gpsNs = newGps;
    } else {
      anchor_.valid = false;
    }
  }
  lastEdge_ = edge;
  haveEdge_ = true;
  ++edgeCount_;
}

void TimeSync::onNavPvt(const NavPvt& pvt, int64_t rxMicros) {
  if (pvt.iTowMs % 1000 != 0) return;
  int64_t gps = 0;
  if (!gpsTimeNs(pvt, &gps)) return;
  if (!haveEdge_) return;
  const int64_t dt = rxMicros - lastEdge_;
  if (dt < 0 || dt >= kPvtMatchWindowUs) return;
  anchor_.valid = true;
  anchor_.ppsMicros = lastEdge_;
  anchor_.gpsNs = gps;
  confirmedGpsNs_ = gps;
}

TimeSync::Transition TimeSync::update(int64_t now) {
  const bool locked = haveEdge_ && now - lastEdge_ <= kPpsTimeoutUs;
  if (locked) {
    const PpsState prev = state_;
    state_ = PpsState::kLocked;
    return prev == PpsState::kLost ? Transition::kRegained : Transition::kNone;
  }
  if (state_ == PpsState::kLocked) {
    state_ = PpsState::kLost;
    return Transition::kLost;
  }
  return Transition::kNone;
}

bool TimeSync::toGpsNs(int64_t micros, int64_t* gpsNs) const {
  if (!anchor_.valid || state_ != PpsState::kLocked) return false;
  const int64_t d = micros - anchor_.ppsMicros;
  if (d > kMaxExtrapolationUs || d < -kMaxExtrapolationUs) return false;
  *gpsNs = anchor_.gpsNs + d * 1000;
  return true;
}

}  // namespace gl
