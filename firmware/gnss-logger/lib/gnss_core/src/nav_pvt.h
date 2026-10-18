// UBX-NAV-PVT decoding and GPS time derivation.
#pragma once

#include <cstddef>
#include <cstdint>

namespace gl {

constexpr size_t kNavPvtLen = 92;

// GPS minus UTC in seconds. Constant since 2017-01-01; update the firmware if
// a new leap second is announced (IERS Bulletin C).
constexpr int kGpsUtcLeapSeconds = 18;

enum class CarrierSolution : uint8_t { kNone = 0, kFloat = 1, kFixed = 2 };

struct NavPvt {
  uint32_t iTowMs;
  uint16_t year;
  uint8_t month, day, hour, minute, second;
  bool validDate;
  bool validTime;
  bool fullyResolved;
  uint32_t tAccNs;
  int32_t nanoNs;
  uint8_t fixType;  // 0 none, 1 DR, 2 2D, 3 3D, 4 GNSS+DR, 5 time only
  bool gnssFixOk;
  bool diffSoln;
  CarrierSolution carrSoln;
  uint8_t numSv;
  int32_t lonE7;
  int32_t latE7;
  int32_t heightMm;
  int32_t hMslMm;
  uint32_t hAccMm;
  uint32_t vAccMm;
  int32_t gSpeedMmS;
  uint16_t pDopE2;
  bool invalidLlh;
};

// Decodes a NAV-PVT payload. Returns false if the length is wrong.
bool decodeNavPvt(const uint8_t* payload, size_t len, NavPvt* out);

// True when the UTC date/time is valid and fully resolved, which is what we
// need to derive the GPS week.
bool hasResolvedTime(const NavPvt& pvt);

// GPS time of the navigation epoch in nanoseconds since the GPS epoch
// (1980-01-06T00:00:00). iTOW gives the time of week; the week number is
// derived from the UTC date and the leap second constant, then reconciled
// with iTOW so that a wrong leap second count cannot shift the week.
// Returns false if the time is not resolved.
bool gpsTimeNs(const NavPvt& pvt, int64_t* out);

// Days since 1970-01-01 for a proleptic Gregorian date.
int64_t daysFromCivil(int year, unsigned month, unsigned day);

}  // namespace gl
