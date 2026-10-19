// Binary BLE protocol between the logger and the field app (İP6).
// All multi-byte fields are little-endian. See README.md for the spec.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

#include "event_log.h"
#include "time_sync.h"

namespace gl {
namespace ble {

constexpr uint8_t kProtocolVersion = 1;

constexpr char kServiceUuid[] = "cdee0001-a1bf-488e-8eda-a2c084827c6c";
constexpr char kStatusUuid[] = "cdee0002-a1bf-488e-8eda-a2c084827c6c";
constexpr char kCommandUuid[] = "cdee0003-a1bf-488e-8eda-a2c084827c6c";

enum class Opcode : uint8_t {
  kStartSession = 0x01,
  kStopSession = 0x02,
  kMarkEvent = 0x03,
};

// Wire codes of events the phone may mark.
enum class MarkType : uint8_t { kCorner = 0x01, kQrSync = 0x02 };

enum class ResultCode : uint8_t {
  kOk = 0,
  kMalformed = 1,
  kUnknownOpcode = 2,
  kInvalidArgument = 3,
  kAlreadyRecording = 4,
  kNotRecording = 5,
  kSdMissing = 6,
  kSdFull = 7,
  kSdError = 8,
  kSessionExists = 9,
  kNone = 0xFF,  // no command processed since boot
};

constexpr size_t kMaxSessionIdLen = 36;
constexpr size_t kMaxParcelIdLen = 64;
constexpr size_t kMaxPayloadLen = 200;
// Longest valid command: mark_event with a full payload (start_session is
// at most 2 + 1 + 36 + 1 + 64 = 104 bytes).
constexpr size_t kMaxCommandLen = 2 + 1 + 1 + kMaxPayloadLen;

struct Command {
  Opcode op = Opcode::kStopSession;
  uint8_t seq = 0;
  std::string sessionId;  // start_session
  std::string parcelId;   // start_session
  MarkType mark = MarkType::kCorner;  // mark_event
  std::string payload;                // mark_event
};

// [A-Za-z0-9_-], 1..36 characters: used as a directory name.
bool validSessionId(const std::string& s);
// Printable ASCII, 1..64 characters.
bool validParcelId(const std::string& s);
// 0..200 bytes, no control characters (UTF-8 allowed).
bool validPayload(const std::string& s);

EventType markEventType(MarkType m);

// Decodes and validates a command. On failure `out->seq` is still set when
// the frame was long enough to carry it.
ResultCode decodeCommand(const uint8_t* data, size_t len, Command* out);

// Encodes a command (used by tests and as a reference for the app).
// Returns the length, or 0 if it does not fit or is invalid.
size_t encodeCommand(const Command& c, uint8_t* out, size_t cap);

// Status length as sent by this firmware. Version 1 started at 31 bytes;
// fields are only ever appended, so decoders accept anything from
// kStatusMinLen on and read appended fields when present.
constexpr size_t kStatusLen = 39;
constexpr size_t kStatusMinLen = 31;

namespace flags {
constexpr uint8_t kSdPresent = 0x01;
constexpr uint8_t kSdLowSpace = 0x02;
constexpr uint8_t kSdError = 0x04;
constexpr uint8_t kTimeMapped = 0x08;
constexpr uint8_t kDataDropped = 0x10;
constexpr uint8_t kGnssFixOk = 0x20;
}  // namespace flags

struct Status {
  uint8_t recording = 0;  // 0 idle, 1 recording
  uint8_t flags = 0;
  uint8_t rxConfig = 0;   // ConfigStatus
  uint8_t ppsState = 0;   // PpsState
  uint8_t fixType = 0;
  uint8_t carrSoln = 0;
  uint8_t numSv = 0;
  uint32_t hAccMm = 0xFFFFFFFF;
  uint32_t bytesWritten = 0;
  uint32_t sdFreeMib = 0;
  uint16_t batteryMv = 0;
  uint8_t fwMajor = 0, fwMinor = 0, fwPatch = 0;
  uint32_t droppedBytes = 0;
  uint8_t lastCmdSeq = 0;
  uint8_t lastCmdResult = static_cast<uint8_t>(ResultCode::kNone);
  // GPS time (ns since GPS epoch) when the message was built; 0 = no mapping.
  uint64_t gpsTimeNs = 0;
};

// Status gpsTimeNs for a message built at `nowMicros`:
// anchor_gps + (now - anchor_micros) * 1000, or 0 without a PPS mapping.
uint64_t statusGpsTimeNs(const TimeSync& time, int64_t nowMicros);

// Writes kStatusLen bytes.
void encodeStatus(const Status& s, uint8_t* out);
// Accepts kStatusMinLen bytes or more; gpsTimeNs is 0 in a 31-byte message.
bool decodeStatus(const uint8_t* data, size_t len, Status* out);

}  // namespace ble
}  // namespace gl
