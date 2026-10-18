#include "session.h"

#include "text.h"
#include "version.h"

namespace gl {

namespace {

constexpr int64_t kGpsEpochUnix = 315964800;

// Inverse of daysFromCivil (Howard Hinnant's algorithm).
void civilFromDays(int64_t z, int* y, unsigned* m, unsigned* d) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  *d = doy - (153 * mp + 2) / 5 + 1;
  *m = mp < 10 ? mp + 3 : mp - 9;
  *y = static_cast<int>(static_cast<int64_t>(yoe) + era * 400 + (*m <= 2));
}

void appendPadded(std::string* out, unsigned v, int width) {
  std::string digits;
  appendUint(&digits, v);
  for (int i = static_cast<int>(digits.size()); i < width; ++i)
    out->push_back('0');
  out->append(digits);
}

void appendTimePoint(std::string* j, const TimePoint& t) {
  j->append("{\"esp_micros\":");
  appendInt(j, t.espMicros);
  j->append(",\"gps_time_ns\":");
  if (t.hasGps) {
    appendInt(j, t.gpsNs);
    j->append(",\"utc\":");
    appendJsonString(j, gpsNsToUtcIso(t.gpsNs));
  } else {
    j->append("null,\"utc\":null");
  }
  j->push_back('}');
}

const char* configStatusName(ConfigStatus s) {
  switch (s) {
    case ConfigStatus::kPending: return "pending";
    case ConfigStatus::kOk: return "ok";
    case ConfigStatus::kFailedNoResponse: return "no_response";
    case ConfigStatus::kFailedNak: return "nak";
    case ConfigStatus::kFailedInvalid: return "invalid_settings";
  }
  return "unknown";
}

}  // namespace

std::string gpsNsToUtcIso(int64_t gpsNs) {
  int64_t ms = gpsNs / 1000000;
  if (gpsNs % 1000000 < 0) --ms;
  int64_t unixMs = ms + (kGpsEpochUnix - kGpsUtcLeapSeconds) * 1000;
  int64_t days = unixMs / 86400000;
  int64_t rem = unixMs % 86400000;
  if (rem < 0) {
    rem += 86400000;
    --days;
  }
  int y;
  unsigned m, d;
  civilFromDays(days, &y, &m, &d);
  std::string s;
  appendPadded(&s, static_cast<unsigned>(y), 4);
  s.push_back('-');
  appendPadded(&s, m, 2);
  s.push_back('-');
  appendPadded(&s, d, 2);
  s.push_back('T');
  appendPadded(&s, static_cast<unsigned>(rem / 3600000), 2);
  s.push_back(':');
  appendPadded(&s, static_cast<unsigned>(rem / 60000 % 60), 2);
  s.push_back(':');
  appendPadded(&s, static_cast<unsigned>(rem / 1000 % 60), 2);
  s.push_back('.');
  appendPadded(&s, static_cast<unsigned>(rem % 1000), 3);
  s.push_back('Z');
  return s;
}

std::string buildSessionJson(const SessionMeta& m) {
  std::string j;
  j.reserve(768);
  j.append("{\n  \"format_version\": 1,\n  \"session_id\": ");
  appendJsonString(&j, m.sessionId);
  j.append(",\n  \"parcel_id\": ");
  appendJsonString(&j, m.parcelId);
  j.append(",\n  \"firmware_version\": ");
  appendJsonString(&j, m.firmwareVersion);
  j.append(",\n  \"receiver\": {\"model\": \"ZED-F9P\", \"port\": \"UART");
  appendUint(&j, m.receiver.receiverUart);
  j.append("\", \"baud\": ");
  appendUint(&j, m.receiver.baud);
  j.append(", \"meas_period_ms\": ");
  appendUint(&j, m.receiver.measPeriodMs);
  j.append(", \"rawx_rate_hz\": ");
  appendUint(&j, m.receiver.rawRateHz);
  j.append(", \"nav_pvt_rate_hz\": ");
  appendUint(&j, m.receiver.pvtRateHz);
  j.append(
      ", \"messages\": [\"RXM-RAWX\", \"RXM-SFRBX\", \"NAV-PVT\"], "
      "\"nmea\": false, \"timepulse_grid\": \"GPS\", \"config_status\": ");
  appendJsonString(&j, configStatusName(m.receiverConfig.status));
  j.append(", \"detected_baud\": ");
  appendUint(&j, m.receiverConfig.detectedBaud);
  j.append("},\n  \"gps_utc_leap_seconds\": ");
  appendInt(&j, kGpsUtcLeapSeconds);
  j.append(",\n  \"start\": ");
  appendTimePoint(&j, m.start);
  j.append(",\n  \"stop\": ");
  if (m.stopped) {
    appendTimePoint(&j, m.stop);
  } else {
    j.append("null");
  }
  j.append(",\n  \"stop_reason\": ");
  if (m.stopped) {
    appendJsonString(&j, m.stopReason);
  } else {
    j.append("null");
  }
  j.append(",\n  \"gnss_bytes\": ");
  appendUint(&j, m.bytesWritten);
  j.append(",\n  \"dropped_bytes\": ");
  appendUint(&j, m.droppedBytes);
  j.append("\n}\n");
  return j;
}

std::string sessionDir(const std::string& sessionId) {
  return "/sessions/" + sessionId;
}

Recorder::Recorder(IStorage& storage, const TimeSync& time)
    : Recorder(storage, time, Limits()) {}

Recorder::Recorder(IStorage& storage, const TimeSync& time,
                   const Limits& limits)
    : storage_(storage), time_(time), limits_(limits) {}

void Recorder::setReceiverInfo(const cfg::ReceiverSettings& s,
                               const ConfigResult& r) {
  receiver_ = s;
  receiverConfig_ = r;
}

void Recorder::refreshCard() {
  if (recording_) return;
  if (sdError_) {
    storage_.invalidate();
    sdError_ = false;
  }
  sdPresent_ = storage_.ensureMounted();
  freeAtCheck_ = sdPresent_ ? storage_.freeBytes() : 0;
}

uint64_t Recorder::freeBytes() const {
  if (!recording_) return freeAtCheck_;
  return meta_.bytesWritten >= freeAtCheck_ ? 0
                                            : freeAtCheck_ - meta_.bytesWritten;
}

TimePoint Recorder::timePoint(int64_t us) const {
  TimePoint t;
  t.espMicros = us;
  t.hasGps = time_.toGpsNs(us, &t.gpsNs);
  return t;
}

ble::ResultCode Recorder::start(const std::string& sessionId,
                                const std::string& parcelId, int64_t nowUs) {
  using ble::ResultCode;
  if (recording_) return ResultCode::kAlreadyRecording;
  if (!ble::validSessionId(sessionId) || !ble::validParcelId(parcelId))
    return ResultCode::kInvalidArgument;
  refreshCard();
  if (!sdPresent_) return ResultCode::kSdMissing;
  if (freeAtCheck_ < limits_.minFreeToStart) return ResultCode::kSdFull;

  const std::string dir = sessionDir(sessionId);
  if (storage_.exists(dir.c_str())) return ResultCode::kSessionExists;
  if (!storage_.exists("/sessions") && !storage_.mkdir("/sessions")) {
    sdError_ = true;
    return ResultCode::kSdError;
  }
  if (!storage_.mkdir(dir.c_str())) {
    sdError_ = true;
    return ResultCode::kSdError;
  }
  gnss_ = storage_.open((dir + "/gnss.ubx").c_str(), IStorage::Mode::kWrite);
  events_ =
      storage_.open((dir + "/events.csv").c_str(), IStorage::Mode::kWrite);
  if (!gnss_ || !events_) {
    closeFiles();
    sdError_ = true;
    return ResultCode::kSdError;
  }

  meta_ = SessionMeta();
  meta_.sessionId = sessionId;
  meta_.parcelId = parcelId;
  meta_.firmwareVersion = kFwVersion;
  meta_.receiver = receiver_;
  meta_.receiverConfig = receiverConfig_;
  meta_.start = timePoint(nowUs);

  const char* header = eventCsvHeader();
  std::string h(header);
  recording_ = true;
  if (events_->write(reinterpret_cast<const uint8_t*>(h.data()), h.size()) !=
          h.size() ||
      !writeSessionJson() ||
      !writeEventRow(EventType::kSessionStart, "parcel_id=" + parcelId,
                     nowUs)) {
    recording_ = false;
    closeFiles();
    sdError_ = true;
    return ResultCode::kSdError;
  }
  return ResultCode::kOk;
}

ble::ResultCode Recorder::stop(int64_t nowUs, const std::string& reason) {
  if (!recording_) return ble::ResultCode::kNotRecording;
  bool ok = true;
  if (gnss_) ok = gnss_->flush() && ok;
  ok = writeEventRow(EventType::kSessionStop, reason, nowUs) && ok;
  meta_.stopped = true;
  meta_.stop = timePoint(nowUs);
  meta_.stopReason = reason;
  ok = writeSessionJson() && ok;
  closeFiles();
  recording_ = false;
  if (!ok) sdError_ = true;
  return ok ? ble::ResultCode::kOk : ble::ResultCode::kSdError;
}

ble::ResultCode Recorder::mark(EventType type, const std::string& payload,
                               int64_t nowUs) {
  if (!recording_) return ble::ResultCode::kNotRecording;
  if (!ble::validPayload(payload)) return ble::ResultCode::kInvalidArgument;
  if (!writeEventRow(type, payload, nowUs)) {
    fail("events_write", nowUs);
    return ble::ResultCode::kSdError;
  }
  return ble::ResultCode::kOk;
}

void Recorder::logEvent(EventType type, const std::string& payload,
                        int64_t nowUs) {
  if (!recording_) return;
  if (!writeEventRow(type, payload, nowUs)) fail("events_write", nowUs);
}

bool Recorder::writeGnss(const uint8_t* data, size_t len, int64_t nowUs) {
  if (!recording_ || !gnss_) return false;
  const size_t n = gnss_->write(data, len);
  meta_.bytesWritten += n;
  if (n != len || !gnss_->flush()) {
    fail("gnss_write", nowUs);
    return false;
  }
  if (freeBytes() < limits_.minFreeToRecord) {
    writeEventRow(EventType::kSdError, "sd_full", nowUs);
    stop(nowUs, "sd_full");
    return false;
  }
  return true;
}

void Recorder::fail(const std::string& what, int64_t nowUs) {
  // Best effort: the card may still accept the event and metadata.
  writeEventRow(EventType::kSdError, what, nowUs);
  stop(nowUs, "sd_error");
  sdError_ = true;
}

bool Recorder::writeEventRow(EventType type, const std::string& payload,
                             int64_t us) {
  if (!events_) return false;
  const std::string row = formatEventRow({us, type, payload}, time_);
  const size_t n =
      events_->write(reinterpret_cast<const uint8_t*>(row.data()), row.size());
  return n == row.size() && events_->flush();
}

bool Recorder::writeSessionJson() {
  const std::string path = sessionDir(meta_.sessionId) + "/session.json";
  std::unique_ptr<IFile> f = storage_.open(path.c_str(), IStorage::Mode::kWrite);
  if (!f) return false;
  const std::string json = buildSessionJson(meta_);
  const bool ok =
      f->write(reinterpret_cast<const uint8_t*>(json.data()), json.size()) ==
          json.size() &&
      f->flush();
  f->close();
  return ok;
}

void Recorder::closeFiles() {
  if (gnss_) gnss_->close();
  if (events_) events_->close();
  gnss_.reset();
  events_.reset();
}

}  // namespace gl
