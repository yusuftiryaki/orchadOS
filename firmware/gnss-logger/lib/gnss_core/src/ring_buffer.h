// Lock-free single-producer single-consumer ring buffer.
#pragma once

#include <atomic>
#include <cstddef>

namespace gl {

// Holds up to N - 1 items. N must be a power of two.
template <typename T, size_t N>
class RingBuffer {
  static_assert(N >= 2 && (N & (N - 1)) == 0, "N must be a power of two");

 public:
  bool push(const T& item) {
    const size_t head = head_.load(std::memory_order_relaxed);
    const size_t next = (head + 1) & (N - 1);
    if (next == tail_.load(std::memory_order_acquire)) {
      ++dropped_;
      return false;
    }
    items_[head] = item;
    head_.store(next, std::memory_order_release);
    return true;
  }

  bool pop(T* item) {
    const size_t tail = tail_.load(std::memory_order_relaxed);
    if (tail == head_.load(std::memory_order_acquire)) return false;
    *item = items_[tail];
    tail_.store((tail + 1) & (N - 1), std::memory_order_release);
    return true;
  }

  size_t size() const {
    const size_t head = head_.load(std::memory_order_acquire);
    const size_t tail = tail_.load(std::memory_order_acquire);
    return (head - tail) & (N - 1);
  }

  bool empty() const { return size() == 0; }
  static constexpr size_t capacity() { return N - 1; }
  // Written only by the producer.
  size_t dropped() const { return dropped_; }

 private:
  T items_[N];
  std::atomic<size_t> head_{0};
  std::atomic<size_t> tail_{0};
  size_t dropped_ = 0;
};

}  // namespace gl
