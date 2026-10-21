#include "ble_protocol.h"

#include "ubx.h"

namespace gl {
namespace ble {

bool validSessionId(const std::string& s) {
  if (s.empty() || s.size() > kMaxSessionIdLen) return false;
  for (char c : s) {
    const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                    (c >= '0' && c <= '9') || c == '_' || c == '-';
    if (!ok) return false;
  }
  return true;
}

bool validParcelId(const std::string& s) {
  if (s.empty() || s.size() > kMaxParcelIdLen) return false;
  for (char c : s) {
    if (c < 0x20 || c > 0x7E) return false;
  }
  return true;
}

bool validPayload(const std::string& s) {
  if (s.size() > kMaxPayloadLen) return false;
  for (char c : s) {
    const unsigned char u = static_cast<unsigned char>(c);
    if (u < 0x20 || u == 0x7F) return false;
  }
  return true;
}

EventType markEventType(MarkType m) {
  return m == MarkType::kQrSync ? EventType::kQrSync : EventType::kCorner;
}

namespace {

// Reads a length-prefixed string at `*pos`.
bool readString(const uint8_t* data, size_t len, size_t* pos, std::string* s) {
  if (*pos >= len) return false;
  const size_t n = data[*pos];
  if (*pos + 1 + n > len) return false;
  s->assign(reinterpret_cast<const char*>(data + *pos + 1), n);
  *pos += 1 + n;
  return true;
}

bool writeString(const std::string& s, uint8_t* out, size_t cap, size_t* pos) {
  if (s.size() > 255 || *pos + 1 + s.size() > cap) return false;
  out[(*pos)++] = static_cast<uint8_t>(s.size());
  for (char c : s) out[(*pos)++] = static_cast<uint8_t>(c);
  return true;
}

}  // namespace

ResultCode decodeCommand(const uint8_t* data, size_t len, Command* out) {
  *out = Command{};
  if (len < 2) return ResultCode::kMalformed;
  out->seq = data[1];
  size_t pos = 2;
  switch (data[0]) {
    case static_cast<uint8_t>(Opcode::kStartSession):
      out->op = Opcode::kStartSession;
      if (!readString(data, len, &pos, &out->sessionId) ||
          !readString(data, len, &pos, &out->parcelId) || pos != len) {
        return ResultCode::kMalformed;
      }
      if (!validSessionId(out->sessionId) || !validParcelId(out->parcelId)) {
        return ResultCode::kInvalidArgument;
      }
      return ResultCode::kOk;

    case static_cast<uint8_t>(Opcode::kStopSession):
      out->op = Opcode::kStopSession;
      return len == 2 ? ResultCode::kOk : ResultCode::kMalformed;

    case static_cast<uint8_t>(Opcode::kMarkEvent): {
      out->op = Opcode::kMarkEvent;
      if (len < 3) return ResultCode::kMalformed;
      const uint8_t type = data[2];
      pos = 3;
      if (!readString(data, len, &pos, &out->payload) || pos != len) {
        return ResultCode::kMalformed;
      }
      if (type != static_cast<uint8_t>(MarkType::kCorner) &&
          type != static_cast<uint8_t>(MarkType::kQrSync)) {
        return ResultCode::kInvalidArgument;
      }
      out->mark = static_cast<MarkType>(type);
      if (!validPayload(out->payload)) return ResultCode::kInvalidArgument;
      return ResultCode::kOk;
    }

    default:
      return ResultCode::kUnknownOpcode;
  }
}

size_t encodeCommand(const Command& c, uint8_t* out, size_t cap) {
  if (cap < 2) return 0;
  out[0] = static_cast<uint8_t>(c.op);
  out[1] = c.seq;
  size_t pos = 2;
  switch (c.op) {
    case Opcode::kStartSession:
      if (!writeString(c.sessionId, out, cap, &pos) ||
          !writeString(c.parcelId, out, cap, &pos)) {
        return 0;
      }
      return pos;
    case Opcode::kStopSession:
      return pos;
    case Opcode::kMarkEvent:
      if (pos >= cap) return 0;
      out[pos++] = static_cast<uint8_t>(c.mark);
      if (!writeString(c.payload, out, cap, &pos)) return 0;
      return pos;
  }
  return 0;
}

namespace {
void putU2(uint8_t* p, uint16_t v) {
  p[0] = static_cast<uint8_t>(v);
  p[1] = static_cast<uint8_t>(v >> 8);
}
void putU4(uint8_t* p, uint32_t v) {
  for (int i = 0; i < 4; ++i) p[i] = static_cast<uint8_t>(v >> (8 * i));
}
void putU8(uint8_t* p, uint64_t v) {
  for (int i = 0; i < 8; ++i) p[i] = static_cast<uint8_t>(v >> (8 * i));
}
uint64_t readU8(const uint8_t* p) {
  uint64_t v = 0;
  for (int i = 7; i >= 0; --i) v = (v << 8) | p[i];
  return v;
}
}  // namespace

void encodeStatus(const Status& s, uint8_t* out) {
  out[0] = kProtocolVersion;
  out[1] = s.recording;
  out[2] = s.flags;
  out[3] = s.rxConfig;
  out[4] = s.ppsState;
  out[5] = s.fixType;
  out[6] = s.carrSoln;
  out[7] = s.numSv;
  putU4(out + 8, s.hAccMm);
  putU4(out + 12, s.bytesWritten);
  putU4(out + 16, s.sdFreeMib);
  putU2(out + 20, s.batteryMv);
  out[22] = s.fwMajor;
  out[23] = s.fwMinor;
  out[24] = s.fwPatch;
  putU4(out + 25, s.droppedBytes);
  out[29] = s.lastCmdSeq;
  out[30] = s.lastCmdResult;
  putU8(out + 31, s.gpsTimeNs);
  putU4(out + 39, static_cast<uint32_t>(s.latE7));
  putU4(out + 43, static_cast<uint32_t>(s.lonE7));
  putU4(out + 47, static_cast<uint32_t>(s.heightMm));
}

bool positionValid(const NavPvt& pvt) {
  return pvt.gnssFixOk && pvt.fixType >= 2 && pvt.fixType <= 4 &&
         !pvt.invalidLlh;
}

void setStatusPosition(const NavPvt* pvt, Status* s) {
  if (pvt != nullptr && positionValid(*pvt)) {
    s->latE7 = pvt->latE7;
    s->lonE7 = pvt->lonE7;
    s->heightMm = pvt->heightMm;
    s->flags |= flags::kPositionValid;
  } else {
    s->latE7 = s->lonE7 = s->heightMm = 0;
    s->flags &= static_cast<uint8_t>(~flags::kPositionValid);
  }
}

uint64_t statusGpsTimeNs(const TimeSync& time, int64_t nowMicros) {
  int64_t gpsNs = 0;
  if (!time.toGpsNs(nowMicros, &gpsNs) || gpsNs <= 0) return 0;
  return static_cast<uint64_t>(gpsNs);
}

bool decodeStatus(const uint8_t* d, size_t len, Status* out) {
  if (len < kStatusMinLen || d[0] != kProtocolVersion) return false;
  Status s;
  s.recording = d[1];
  s.flags = d[2];
  s.rxConfig = d[3];
  s.ppsState = d[4];
  s.fixType = d[5];
  s.carrSoln = d[6];
  s.numSv = d[7];
  s.hAccMm = ubx::readU4(d + 8);
  s.bytesWritten = ubx::readU4(d + 12);
  s.sdFreeMib = ubx::readU4(d + 16);
  s.batteryMv = ubx::readU2(d + 20);
  s.fwMajor = d[22];
  s.fwMinor = d[23];
  s.fwPatch = d[24];
  s.droppedBytes = ubx::readU4(d + 25);
  s.lastCmdSeq = d[29];
  s.lastCmdResult = d[30];
  if (len >= kStatusGpsTimeLen) s.gpsTimeNs = readU8(d + 31);
  if (len >= kStatusLen) {
    s.latE7 = ubx::readI4(d + 39);
    s.lonE7 = ubx::readI4(d + 43);
    s.heightMm = ubx::readI4(d + 47);
  } else {
    s.flags &= static_cast<uint8_t>(~flags::kPositionValid);
  }
  *out = s;
  return true;
}

}  // namespace ble
}  // namespace gl
