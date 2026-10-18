#include "cfg_valset.h"

#include "ubx.h"

namespace gl {
namespace cfg {

size_t keyValueSize(uint32_t key) {
  switch ((key >> 28) & 0x07) {
    case 1: return 1;  // single bit, stored as one byte
    case 2: return 1;
    case 3: return 2;
    case 4: return 4;
    case 5: return 8;
    default: return 0;
  }
}

bool ValsetBuilder::add(uint32_t key, uint32_t value) {
  const size_t size = keyValueSize(key);
  if (size == 0 || size > 4) return false;  // 8-byte values are not needed
  if (keyCount_ >= kMaxKeys || len_ + 4 + size > kMaxPayload) return false;
  for (int i = 0; i < 4; ++i) {
    payload_[len_++] = static_cast<uint8_t>(key >> (8 * i));
  }
  for (size_t i = 0; i < size; ++i) {
    payload_[len_++] = static_cast<uint8_t>(value >> (8 * i));
  }
  ++keyCount_;
  return true;
}

size_t ValsetBuilder::build(uint8_t* out, size_t cap) const {
  uint8_t payload[kMaxPayload];
  for (size_t i = 0; i < len_; ++i) payload[i] = payload_[i];
  payload[0] = 0x00;  // message version
  payload[1] = layers_;
  payload[2] = 0x00;  // reserved
  payload[3] = 0x00;
  return ubx::buildFrame(ubx::kClassCfg, ubx::kIdCfgValset, payload,
                         static_cast<uint16_t>(len_), out, cap);
}

uint8_t epochDivider(uint16_t measPeriodMs, uint8_t rateHz) {
  if (measPeriodMs == 0 || rateHz == 0) return 0;
  const uint32_t epochsPerS = 1000u / measPeriodMs;
  if (1000u % measPeriodMs != 0 || epochsPerS % rateHz != 0) return 0;
  return static_cast<uint8_t>(epochsPerS / rateHz);
}

bool settingsValid(const ReceiverSettings& s) {
  return (s.receiverUart == 1 || s.receiverUart == 2) && s.baud > 0 &&
         epochDivider(s.measPeriodMs, s.rawRateHz) != 0 &&
         epochDivider(s.measPeriodMs, s.pvtRateHz) != 0;
}

uint32_t baudKey(uint8_t receiverUart) {
  return receiverUart == 2 ? kUart2Baudrate : kUart1Baudrate;
}

size_t buildBaudFrame(const ReceiverSettings& s, uint8_t* out, size_t cap) {
  if (!settingsValid(s)) return 0;
  ValsetBuilder b(kLayerRam);
  b.add(baudKey(s.receiverUart), s.baud);
  return b.build(out, cap);
}

size_t buildLoggingFrame(const ReceiverSettings& s, uint8_t* out, size_t cap) {
  if (!settingsValid(s)) return 0;
  const bool u2 = s.receiverUart == 2;
  const uint8_t rawDiv = epochDivider(s.measPeriodMs, s.rawRateHz);
  const uint8_t pvtDiv = epochDivider(s.measPeriodMs, s.pvtRateHz);
  ValsetBuilder b(kLayerRam);
  b.add(u2 ? kUart2InprotUbx : kUart1InprotUbx, 1);
  b.add(u2 ? kUart2OutprotUbx : kUart1OutprotUbx, 1);
  b.add(u2 ? kUart2OutprotNmea : kUart1OutprotNmea, 0);
  b.add(kRateMeas, s.measPeriodMs);
  b.add(kRateNav, 1);
  b.add(u2 ? kMsgoutRxmRawxUart2 : kMsgoutRxmRawxUart1, rawDiv);
  // SFRBX is emitted per decoded subframe, not per epoch: every one is needed
  // for ephemerides, so its rate is always 1.
  b.add(u2 ? kMsgoutRxmSfrbxUart2 : kMsgoutRxmSfrbxUart1, 1);
  b.add(u2 ? kMsgoutNavPvtUart2 : kMsgoutNavPvtUart1, pvtDiv);
  b.add(kTpTimegridTp1, 1);
  return b.build(out, cap);
}

}  // namespace cfg
}  // namespace gl
