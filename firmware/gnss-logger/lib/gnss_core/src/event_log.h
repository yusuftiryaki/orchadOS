// events.csv row format.
#pragma once

#include <cstdint>
#include <string>

#include "time_sync.h"

namespace gl {

enum class EventType : uint8_t {
  kSessionStart = 0,
  kSessionStop = 1,
  kCorner = 2,
  kQrSync = 3,
  kPpsLost = 4,
  kPpsRegained = 5,
  kSdError = 6,
};

const char* eventTypeName(EventType t);

// Header line, including the trailing newline.
const char* eventCsvHeader();

struct EventRecord {
  int64_t espMicros;
  EventType type;
  std::string payload;
};

// One CSV line with trailing newline:
// esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,pps_gps_time_ns
// gps_time_ns is empty without a usable PPS mapping. The last two columns
// hold the anchor (latest PPS edge and its GPS time) whenever one exists, so
// the conversion can be checked or redone in post-processing.
std::string formatEventRow(const EventRecord& e, const TimeSync& time);

}  // namespace gl
