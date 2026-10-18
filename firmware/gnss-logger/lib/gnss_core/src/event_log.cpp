#include "event_log.h"

#include "text.h"

namespace gl {

const char* eventTypeName(EventType t) {
  switch (t) {
    case EventType::kSessionStart: return "session_start";
    case EventType::kSessionStop: return "session_stop";
    case EventType::kCorner: return "corner";
    case EventType::kQrSync: return "qr_sync";
    case EventType::kPpsLost: return "pps_lost";
    case EventType::kPpsRegained: return "pps_regained";
    case EventType::kSdError: return "sd_error";
  }
  return "unknown";
}

const char* eventCsvHeader() {
  return "esp_micros,gps_time_ns,event_type,payload,pps_esp_micros,"
         "pps_gps_time_ns\n";
}

std::string formatEventRow(const EventRecord& e, const TimeSync& time) {
  std::string row;
  row.reserve(96 + e.payload.size());
  appendInt(&row, e.espMicros);
  row.push_back(',');
  int64_t gps = 0;
  if (time.toGpsNs(e.espMicros, &gps)) appendInt(&row, gps);
  row.push_back(',');
  row.append(eventTypeName(e.type));
  row.push_back(',');
  appendCsvField(&row, e.payload);
  row.push_back(',');
  const TimeAnchor& a = time.anchor();
  if (a.valid) {
    appendInt(&row, a.ppsMicros);
    row.push_back(',');
    appendInt(&row, a.gpsNs);
  } else {
    row.push_back(',');
  }
  row.push_back('\n');
  return row;
}

}  // namespace gl
