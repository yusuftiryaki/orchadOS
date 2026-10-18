// Double buffer between the UART reader and the SD writer.
//
// The producer appends into the active buffer. When it fills up, or when its
// oldest byte is older than the flush interval, it is swapped with the standby
// buffer, which the consumer then writes to the card while the producer keeps
// filling the other one. If both are busy, incoming bytes are dropped and
// counted.
//
// Not thread-safe by itself: on the ESP32 every call is made under a short
// critical section. The consumer may write readyData() to the card outside
// the lock, because the producer never touches the standby buffer until
// release() is called.
#pragma once

#include <cstddef>
#include <cstdint>

namespace gl {

class DoubleBuffer {
 public:
  DoubleBuffer(uint8_t* a, uint8_t* b, size_t capacity);

  // Returns the number of bytes accepted; the rest is dropped.
  size_t append(const uint8_t* data, size_t len, uint32_t nowMs);

  // Swaps if the active buffer holds data older than `maxAgeMs`.
  bool swapIfDue(uint32_t nowMs, uint32_t maxAgeMs);
  // Swaps if the active buffer holds any data (used on session stop).
  bool swapNow();

  bool ready() const { return standbyReady_; }
  const uint8_t* readyData() const { return standby_; }
  size_t readySize() const { return standbyLen_; }
  void release();

  // Discards all buffered data (used on session start).
  void clear();

  size_t pending() const { return activeLen_; }
  uint64_t dropped() const { return dropped_; }
  size_t capacity() const { return capacity_; }

 private:
  bool swap();

  uint8_t* active_;
  uint8_t* standby_;
  size_t capacity_;
  size_t activeLen_ = 0;
  size_t standbyLen_ = 0;
  bool standbyReady_ = false;
  uint32_t activeSinceMs_ = 0;
  uint64_t dropped_ = 0;
};

}  // namespace gl
