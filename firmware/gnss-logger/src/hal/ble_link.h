// BLE GATT server: status notifications and the command characteristic.
#pragma once

#include <cstddef>
#include <cstdint>

#include "ble_protocol.h"
#include "ring_buffer.h"

namespace gl {

struct RawCommand {
  uint16_t len;
  bool oversized;  // longer than any valid command; only data[0..1] kept
  uint8_t data[ble::kMaxCommandLen];
};

class BleLink {
 public:
  // Commands written by the phone are queued here (producer: BLE host task,
  // consumer: logger task).
  using CommandQueue = RingBuffer<RawCommand, 8>;

  void begin(CommandQueue* queue);
  void publishStatus(const uint8_t* data, size_t len);
  bool connected() const;
};

}  // namespace gl
