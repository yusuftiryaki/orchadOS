// Battery voltage scaling and status LED patterns.
#pragma once

#include <cstdint>

namespace gl {

// Battery voltage from the ADC pin voltage behind a divider
// (top resistor from battery to pin, bottom resistor from pin to ground).
inline uint16_t batteryMillivolts(uint32_t pinMv, uint32_t rTopOhm,
                                  uint32_t rBottomOhm) {
  if (rBottomOhm == 0) return 0;
  const uint64_t mv =
      static_cast<uint64_t>(pinMv) * (rTopOhm + rBottomOhm) / rBottomOhm;
  return mv > 0xFFFF ? 0xFFFF : static_cast<uint16_t>(mv);
}

enum class LedMode : uint8_t {
  kBoot,       // solid on while configuring
  kIdle,       // ready: 1 Hz, 50 % duty
  kRecording,  // on, with a 100 ms dark gap every second
  kError,      // 5 Hz fast blink: receiver config failed or SD unusable
};

inline LedMode selectLedMode(bool booting, bool error, bool recording) {
  if (booting) return LedMode::kBoot;
  if (error) return LedMode::kError;
  return recording ? LedMode::kRecording : LedMode::kIdle;
}

inline bool ledLevel(LedMode mode, uint32_t ms) {
  switch (mode) {
    case LedMode::kBoot: return true;
    case LedMode::kIdle: return ms % 1000 < 500;
    case LedMode::kRecording: return ms % 1000 >= 100;
    case LedMode::kError: return ms % 200 < 100;
  }
  return false;
}

}  // namespace gl
