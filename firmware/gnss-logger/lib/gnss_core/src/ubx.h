// UBX protocol framing: checksum, frame building and a streaming parser.
#pragma once

#include <cstddef>
#include <cstdint>

namespace gl {
namespace ubx {

constexpr uint8_t kSync1 = 0xB5;
constexpr uint8_t kSync2 = 0x62;
constexpr size_t kHeaderLen = 6;  // sync1, sync2, class, id, len(2)
constexpr size_t kOverhead = 8;   // header + 2 checksum bytes

constexpr uint8_t kClassNav = 0x01;
constexpr uint8_t kClassRxm = 0x02;
constexpr uint8_t kClassAck = 0x05;
constexpr uint8_t kClassCfg = 0x06;

constexpr uint8_t kIdNavPvt = 0x07;
constexpr uint8_t kIdRxmRawx = 0x15;
constexpr uint8_t kIdRxmSfrbx = 0x13;
constexpr uint8_t kIdAckNak = 0x00;
constexpr uint8_t kIdAckAck = 0x01;
constexpr uint8_t kIdCfgValset = 0x8A;

// Largest payload accepted as plausible. Anything bigger is treated as a
// corrupted length field so the parser does not swallow valid frames.
// RXM-RAWX with 255 measurements is 16 + 32 * 255 = 8176 bytes.
constexpr uint16_t kMaxPlausiblePayload = 8192;

// 8-bit Fletcher checksum over `data` (class, id, length and payload).
void checksum(const uint8_t* data, size_t len, uint8_t* ckA, uint8_t* ckB);

// Writes a complete frame into `out`. Returns the frame length, or 0 if
// `outCap` is too small.
size_t buildFrame(uint8_t msgClass, uint8_t msgId, const uint8_t* payload,
                  uint16_t payloadLen, uint8_t* out, size_t outCap);

struct Frame {
  uint8_t msgClass;
  uint8_t msgId;
  uint16_t length;
  const uint8_t* payload;  // valid until the next Parser::push call
};

class Parser {
 public:
  enum class Result : uint8_t {
    kNone,           // byte consumed, no frame finished
    kFrame,          // a valid frame is available via frame()
    kChecksumError,  // a frame finished with a bad checksum and was dropped
    kOversized,      // a valid frame was larger than the buffer and was dropped
    kBadLength,      // implausible length field, parser resynchronised
  };

  struct Stats {
    uint32_t frames = 0;
    uint32_t checksumErrors = 0;
    uint32_t oversized = 0;
    uint32_t badLength = 0;
  };

  // `buffer` holds the payload of the frame being parsed; frames with a
  // payload larger than `capacity` are verified but not delivered.
  Parser(uint8_t* buffer, size_t capacity);

  Result push(uint8_t byte);
  const Frame& frame() const { return frame_; }
  const Stats& stats() const { return stats_; }
  void reset();

 private:
  enum class State : uint8_t {
    kSync1, kSync2, kClass, kId, kLen1, kLen2, kPayload, kCkA, kCkB
  };

  void updateChecksum(uint8_t b) {
    ckA_ = static_cast<uint8_t>(ckA_ + b);
    ckB_ = static_cast<uint8_t>(ckB_ + ckA_);
  }

  uint8_t* buffer_;
  size_t capacity_;
  State state_ = State::kSync1;
  uint8_t class_ = 0;
  uint8_t id_ = 0;
  uint16_t length_ = 0;
  uint16_t index_ = 0;
  uint8_t ckA_ = 0;
  uint8_t ckB_ = 0;
  uint8_t rxCkA_ = 0;
  Frame frame_{};
  Stats stats_{};
};

// Little-endian field readers for payload decoding.
inline uint16_t readU2(const uint8_t* p) {
  return static_cast<uint16_t>(p[0] | (p[1] << 8));
}
inline uint32_t readU4(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) |
         (static_cast<uint32_t>(p[3]) << 24);
}
inline int32_t readI4(const uint8_t* p) {
  return static_cast<int32_t>(readU4(p));
}
inline int16_t readI2(const uint8_t* p) {
  return static_cast<int16_t>(readU2(p));
}

}  // namespace ubx
}  // namespace gl
