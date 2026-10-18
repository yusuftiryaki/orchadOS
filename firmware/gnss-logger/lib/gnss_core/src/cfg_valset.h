// UBX-CFG-VALSET message construction for u-blox F9 receivers.
#pragma once

#include <cstddef>
#include <cstdint>

namespace gl {
namespace cfg {

// Configuration key IDs (u-blox F9 HPG interface description).
// The value size is encoded in bits 28..30 of the key.
constexpr uint32_t kUart1Baudrate = 0x40520001;
constexpr uint32_t kUart2Baudrate = 0x40530001;
constexpr uint32_t kUart1InprotUbx = 0x10730001;
constexpr uint32_t kUart2InprotUbx = 0x10750001;
constexpr uint32_t kUart1OutprotUbx = 0x10740001;
constexpr uint32_t kUart1OutprotNmea = 0x10740002;
constexpr uint32_t kUart2OutprotUbx = 0x10760001;
constexpr uint32_t kUart2OutprotNmea = 0x10760002;
constexpr uint32_t kRateMeas = 0x30210001;  // U2, measurement period in ms
constexpr uint32_t kRateNav = 0x30210002;   // U2, measurements per nav solution
constexpr uint32_t kMsgoutRxmRawxUart1 = 0x209102a5;
constexpr uint32_t kMsgoutRxmRawxUart2 = 0x209102a6;
constexpr uint32_t kMsgoutRxmSfrbxUart1 = 0x20910232;
constexpr uint32_t kMsgoutRxmSfrbxUart2 = 0x20910233;
constexpr uint32_t kMsgoutNavPvtUart1 = 0x20910007;
constexpr uint32_t kMsgoutNavPvtUart2 = 0x20910008;
constexpr uint32_t kTpTimegridTp1 = 0x2005000c;  // E1: 0 UTC, 1 GPS

constexpr uint8_t kLayerRam = 0x01;
constexpr uint8_t kLayerBbr = 0x02;
constexpr uint8_t kLayerFlash = 0x04;

constexpr size_t kMaxKeys = 64;  // VALSET limit

// Value size in bytes for a key, or 0 if the size field is invalid.
size_t keyValueSize(uint32_t key);

class ValsetBuilder {
 public:
  explicit ValsetBuilder(uint8_t layers = kLayerRam) : layers_(layers) {}

  // Adds a key/value pair; the value is truncated to the key's size.
  // Returns false if the key is invalid or the message is full.
  bool add(uint32_t key, uint32_t value);

  size_t keyCount() const { return keyCount_; }

  // Writes the full UBX frame. Returns its length, or 0 if `cap` is too small.
  size_t build(uint8_t* out, size_t cap) const;

 private:
  static constexpr size_t kMaxPayload = 4 + kMaxKeys * 8;
  uint8_t layers_;
  uint8_t payload_[kMaxPayload] = {};
  size_t len_ = 4;
  size_t keyCount_ = 0;
};

// Settings applied to the receiver at boot.
struct ReceiverSettings {
  uint8_t receiverUart = 1;    // receiver port wired to the ESP32 (1 or 2)
  uint32_t baud = 460800;      // target baud on that port
  uint16_t measPeriodMs = 200;  // 5 Hz measurement / navigation rate
  uint8_t rawRateHz = 1;       // RXM-RAWX rate, divides 1000/meas
  uint8_t pvtRateHz = 5;       // NAV-PVT rate, divides 1000/meas
};

// Output rate of a message in navigation epochs for the requested rate, or 0
// if the rate is not reachable with the measurement period.
uint8_t epochDivider(uint16_t measPeriodMs, uint8_t rateHz);

bool settingsValid(const ReceiverSettings& s);

// The only key of the baud change message.
uint32_t baudKey(uint8_t receiverUart);

// Frame that changes the receiver port baud rate (RAM layer).
size_t buildBaudFrame(const ReceiverSettings& s, uint8_t* out, size_t cap);

// Frame with the full logging configuration: UBX in/out only (NMEA off) on
// the port, measurement rate, RAWX/SFRBX/PVT output rates and a GPS-aligned
// time pulse. RAM layer only, so it is reapplied on every boot.
size_t buildLoggingFrame(const ReceiverSettings& s, uint8_t* out, size_t cap);

}  // namespace cfg
}  // namespace gl
