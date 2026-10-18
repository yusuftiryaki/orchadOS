// Boot-time receiver configuration with baud rate discovery.
#pragma once

#include <cstdint>

#include "cfg_valset.h"
#include "hal.h"

namespace gl {

enum class ConfigStatus : uint8_t {
  kPending = 0,
  kOk = 1,
  kFailedNoResponse = 2,  // no ACK at any baud rate
  kFailedNak = 3,         // receiver rejected the configuration
  kFailedInvalid = 4,     // settings cannot be expressed
};

struct ConfigResult {
  ConfigStatus status = ConfigStatus::kPending;
  uint32_t detectedBaud = 0;  // baud the receiver answered on before switching
  uint8_t attempts = 0;
};

// Baud rates tried when looking for the receiver, target first.
constexpr uint32_t kCandidateBauds[] = {38400, 9600, 115200, 230400};

// Waits for UBX-ACK-ACK/NAK for CFG-VALSET. Returns 1 for ACK, -1 for NAK,
// 0 on timeout.
int waitValsetAck(ISerialPort& port, IClock& clock, uint32_t timeoutMs);

// Sends the logging configuration. The receiver may still be at its factory
// baud (38400) or already at the target (it keeps RAM settings while powered
// even if the ESP32 resets), so the target is tried first, then each candidate
// baud with a baud change followed by the configuration at the target.
ConfigResult configureReceiver(ISerialPort& port, IClock& clock,
                               const cfg::ReceiverSettings& settings,
                               uint8_t rounds = 3);

}  // namespace gl
