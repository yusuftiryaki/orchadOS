// Recording session: folder layout, gnss.ubx, events.csv and session.json.
#pragma once

#include <cstdint>
#include <memory>
#include <string>

#include "ble_protocol.h"
#include "cfg_valset.h"
#include "event_log.h"
#include "hal.h"
#include "receiver_config.h"
#include "time_sync.h"

namespace gl {

struct TimePoint {
  int64_t espMicros = 0;
  bool hasGps = false;
  int64_t gpsNs = 0;
};

struct SessionMeta {
  std::string sessionId;
  std::string parcelId;
  std::string firmwareVersion;
  cfg::ReceiverSettings receiver;
  ConfigResult receiverConfig;
  TimePoint start;
  bool stopped = false;
  TimePoint stop;
  std::string stopReason;
  uint64_t bytesWritten = 0;
  uint64_t droppedBytes = 0;
};

// "2026-10-18T09:15:02.250Z" for a GPS time in ns (leap seconds applied).
std::string gpsNsToUtcIso(int64_t gpsNs);

std::string buildSessionJson(const SessionMeta& m);

std::string sessionDir(const std::string& sessionId);

class Recorder {
 public:
  struct Limits {
    uint64_t minFreeToStart = 256ull << 20;  // refuse to start below this
    uint64_t minFreeToRecord = 16ull << 20;  // stop the session below this
  };

  Recorder(IStorage& storage, const TimeSync& time);
  Recorder(IStorage& storage, const TimeSync& time, const Limits& limits);

  void setReceiverInfo(const cfg::ReceiverSettings& s, const ConfigResult& r);

  // Checks the card while idle: mounts it if needed and refreshes free space.
  // Free space is not queried while recording because it can be slow on large
  // FAT cards; it is estimated from the bytes written instead.
  void refreshCard();

  ble::ResultCode start(const std::string& sessionId,
                        const std::string& parcelId, int64_t nowUs);
  ble::ResultCode stop(int64_t nowUs, const std::string& reason);
  ble::ResultCode mark(EventType type, const std::string& payload,
                       int64_t nowUs);

  // Writes an event if a session is active; no-op otherwise.
  void logEvent(EventType type, const std::string& payload, int64_t nowUs);

  // Appends raw receiver bytes to gnss.ubx and flushes. On a write error or
  // when the card is nearly full the session is stopped and false returned.
  bool writeGnss(const uint8_t* data, size_t len, int64_t nowUs);

  void setDroppedBytes(uint64_t total) { meta_.droppedBytes = total; }

  bool recording() const { return recording_; }
  bool sdPresent() const { return sdPresent_; }
  bool sdError() const { return sdError_; }
  bool sdLowSpace() const { return freeBytes() < limits_.minFreeToStart; }
  uint64_t bytesWritten() const { return meta_.bytesWritten; }
  uint64_t freeBytes() const;
  const SessionMeta& meta() const { return meta_; }

 private:
  TimePoint timePoint(int64_t us) const;
  bool writeSessionJson();
  bool writeEventRow(EventType type, const std::string& payload, int64_t us);
  void fail(const std::string& what, int64_t nowUs);
  void closeFiles();

  IStorage& storage_;
  const TimeSync& time_;
  Limits limits_;
  cfg::ReceiverSettings receiver_;
  ConfigResult receiverConfig_;
  bool recording_ = false;
  bool sdPresent_ = false;
  bool sdError_ = false;
  uint64_t freeAtCheck_ = 0;
  SessionMeta meta_;
  std::unique_ptr<IFile> gnss_;
  std::unique_ptr<IFile> events_;
};

}  // namespace gl
