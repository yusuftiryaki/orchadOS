#include "double_buffer.h"

#include <cstring>

namespace gl {

DoubleBuffer::DoubleBuffer(uint8_t* a, uint8_t* b, size_t capacity)
    : active_(a), standby_(b), capacity_(capacity) {}

size_t DoubleBuffer::append(const uint8_t* data, size_t len, uint32_t nowMs) {
  size_t accepted = 0;
  while (accepted < len) {
    if (activeLen_ == capacity_ && !swap()) break;
    if (activeLen_ == 0) activeSinceMs_ = nowMs;
    size_t n = capacity_ - activeLen_;
    if (n > len - accepted) n = len - accepted;
    std::memcpy(active_ + activeLen_, data + accepted, n);
    activeLen_ += n;
    accepted += n;
  }
  if (activeLen_ == capacity_) swap();
  dropped_ += len - accepted;
  return accepted;
}

bool DoubleBuffer::swapIfDue(uint32_t nowMs, uint32_t maxAgeMs) {
  if (activeLen_ == 0 || nowMs - activeSinceMs_ < maxAgeMs) return false;
  return swap();
}

bool DoubleBuffer::swapNow() { return activeLen_ > 0 && swap(); }

bool DoubleBuffer::swap() {
  if (standbyReady_) return false;
  uint8_t* t = standby_;
  standby_ = active_;
  standbyLen_ = activeLen_;
  standbyReady_ = true;
  active_ = t;
  activeLen_ = 0;
  return true;
}

void DoubleBuffer::release() {
  standbyReady_ = false;
  standbyLen_ = 0;
}

void DoubleBuffer::clear() {
  activeLen_ = 0;
  standbyLen_ = 0;
  standbyReady_ = false;
}

}  // namespace gl
