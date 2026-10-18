#include "ubx.h"

#include <cstring>

namespace gl {
namespace ubx {

void checksum(const uint8_t* data, size_t len, uint8_t* ckA, uint8_t* ckB) {
  uint8_t a = 0;
  uint8_t b = 0;
  for (size_t i = 0; i < len; ++i) {
    a = static_cast<uint8_t>(a + data[i]);
    b = static_cast<uint8_t>(b + a);
  }
  *ckA = a;
  *ckB = b;
}

size_t buildFrame(uint8_t msgClass, uint8_t msgId, const uint8_t* payload,
                  uint16_t payloadLen, uint8_t* out, size_t outCap) {
  const size_t total = kOverhead + payloadLen;
  if (outCap < total) return 0;
  out[0] = kSync1;
  out[1] = kSync2;
  out[2] = msgClass;
  out[3] = msgId;
  out[4] = static_cast<uint8_t>(payloadLen & 0xFF);
  out[5] = static_cast<uint8_t>(payloadLen >> 8);
  if (payloadLen > 0) std::memcpy(out + kHeaderLen, payload, payloadLen);
  checksum(out + 2, 4 + payloadLen, &out[total - 2], &out[total - 1]);
  return total;
}

Parser::Parser(uint8_t* buffer, size_t capacity)
    : buffer_(buffer), capacity_(capacity) {}

void Parser::reset() { state_ = State::kSync1; }

Parser::Result Parser::push(uint8_t b) {
  switch (state_) {
    case State::kSync1:
      if (b == kSync1) state_ = State::kSync2;
      return Result::kNone;

    case State::kSync2:
      if (b == kSync2) {
        state_ = State::kClass;
        ckA_ = 0;
        ckB_ = 0;
      } else if (b != kSync1) {
        state_ = State::kSync1;
      }
      return Result::kNone;

    case State::kClass:
      class_ = b;
      updateChecksum(b);
      state_ = State::kId;
      return Result::kNone;

    case State::kId:
      id_ = b;
      updateChecksum(b);
      state_ = State::kLen1;
      return Result::kNone;

    case State::kLen1:
      length_ = b;
      updateChecksum(b);
      state_ = State::kLen2;
      return Result::kNone;

    case State::kLen2:
      length_ = static_cast<uint16_t>(length_ | (b << 8));
      updateChecksum(b);
      if (length_ > kMaxPlausiblePayload) {
        ++stats_.badLength;
        state_ = State::kSync1;
        return Result::kBadLength;
      }
      index_ = 0;
      state_ = length_ == 0 ? State::kCkA : State::kPayload;
      return Result::kNone;

    case State::kPayload:
      if (index_ < capacity_) buffer_[index_] = b;
      ++index_;
      updateChecksum(b);
      if (index_ == length_) state_ = State::kCkA;
      return Result::kNone;

    case State::kCkA:
      rxCkA_ = b;
      state_ = State::kCkB;
      return Result::kNone;

    case State::kCkB:
      state_ = State::kSync1;
      if (rxCkA_ != ckA_ || b != ckB_) {
        ++stats_.checksumErrors;
        return Result::kChecksumError;
      }
      if (length_ > capacity_) {
        ++stats_.oversized;
        return Result::kOversized;
      }
      ++stats_.frames;
      frame_.msgClass = class_;
      frame_.msgId = id_;
      frame_.length = length_;
      frame_.payload = buffer_;
      return Result::kFrame;
  }
  return Result::kNone;
}

}  // namespace ubx
}  // namespace gl
