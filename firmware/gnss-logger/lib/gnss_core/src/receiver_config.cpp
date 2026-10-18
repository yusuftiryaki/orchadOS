#include "receiver_config.h"

#include "ubx.h"

namespace gl {

int waitValsetAck(ISerialPort& port, IClock& clock, uint32_t timeoutMs) {
  uint8_t payload[16];
  ubx::Parser parser(payload, sizeof(payload));
  uint8_t chunk[64];
  const uint32_t start = clock.millis();
  while (clock.millis() - start < timeoutMs) {
    const size_t n = port.read(chunk, sizeof(chunk));
    for (size_t i = 0; i < n; ++i) {
      if (parser.push(chunk[i]) != ubx::Parser::Result::kFrame) continue;
      const ubx::Frame& f = parser.frame();
      if (f.msgClass != ubx::kClassAck || f.length != 2) continue;
      if (f.payload[0] != ubx::kClassCfg || f.payload[1] != ubx::kIdCfgValset)
        continue;
      if (f.msgId == ubx::kIdAckAck) return 1;
      if (f.msgId == ubx::kIdAckNak) return -1;
    }
    if (n == 0) clock.delayMs(5);
  }
  return 0;
}

namespace {

void drain(ISerialPort& port) {
  uint8_t sink[64];
  while (port.read(sink, sizeof(sink)) > 0) {
  }
}

constexpr uint32_t kAckTimeoutMs = 600;

}  // namespace

ConfigResult configureReceiver(ISerialPort& port, IClock& clock,
                               const cfg::ReceiverSettings& s,
                               uint8_t rounds) {
  ConfigResult result;
  uint8_t loggingFrame[128];
  uint8_t baudFrame[32];
  const size_t loggingLen =
      cfg::buildLoggingFrame(s, loggingFrame, sizeof(loggingFrame));
  const size_t baudLen = cfg::buildBaudFrame(s, baudFrame, sizeof(baudFrame));
  if (loggingLen == 0 || baudLen == 0) {
    result.status = ConfigStatus::kFailedInvalid;
    return result;
  }

  for (uint8_t round = 0; round < rounds; ++round) {
    // Index -1 means "already at target baud".
    for (int i = -1; i < static_cast<int>(sizeof(kCandidateBauds) /
                                          sizeof(kCandidateBauds[0]));
         ++i) {
      const uint32_t baud = i < 0 ? s.baud : kCandidateBauds[i];
      if (i >= 0 && baud == s.baud) continue;
      ++result.attempts;
      if (i >= 0) {
        port.setBaud(baud);
        clock.delayMs(20);
        drain(port);
        port.write(baudFrame, baudLen);
        port.flushTx();
        // The receiver answers at the old baud and then switches.
        clock.delayMs(100);
      }
      port.setBaud(s.baud);
      clock.delayMs(20);
      drain(port);
      port.write(loggingFrame, loggingLen);
      port.flushTx();
      const int ack = waitValsetAck(port, clock, kAckTimeoutMs);
      if (ack > 0) {
        result.status = ConfigStatus::kOk;
        result.detectedBaud = baud;
        return result;
      }
      if (ack < 0) {
        result.status = ConfigStatus::kFailedNak;
        result.detectedBaud = baud;
        return result;
      }
    }
  }
  result.status = ConfigStatus::kFailedNoResponse;
  return result;
}

}  // namespace gl
