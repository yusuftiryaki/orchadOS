#include "nav_pvt.h"

#include "ubx.h"

namespace gl {

using ubx::readI4;
using ubx::readU2;
using ubx::readU4;

bool decodeNavPvt(const uint8_t* p, size_t len, NavPvt* out) {
  if (len != kNavPvtLen) return false;
  NavPvt v{};
  v.iTowMs = readU4(p + 0);
  v.year = readU2(p + 4);
  v.month = p[6];
  v.day = p[7];
  v.hour = p[8];
  v.minute = p[9];
  v.second = p[10];
  const uint8_t valid = p[11];
  v.validDate = valid & 0x01;
  v.validTime = valid & 0x02;
  v.fullyResolved = valid & 0x04;
  v.tAccNs = readU4(p + 12);
  v.nanoNs = readI4(p + 16);
  v.fixType = p[20];
  const uint8_t flags = p[21];
  v.gnssFixOk = flags & 0x01;
  v.diffSoln = flags & 0x02;
  v.carrSoln = static_cast<CarrierSolution>((flags >> 6) & 0x03);
  v.numSv = p[23];
  v.lonE7 = readI4(p + 24);
  v.latE7 = readI4(p + 28);
  v.heightMm = readI4(p + 32);
  v.hMslMm = readI4(p + 36);
  v.hAccMm = readU4(p + 40);
  v.vAccMm = readU4(p + 44);
  v.gSpeedMmS = readI4(p + 60);
  v.pDopE2 = readU2(p + 76);
  v.invalidLlh = p[78] & 0x01;
  *out = v;
  return true;
}

bool hasResolvedTime(const NavPvt& pvt) {
  return pvt.validDate && pvt.validTime && pvt.fullyResolved;
}

int64_t daysFromCivil(int y, unsigned m, unsigned d) {
  // Howard Hinnant's algorithm.
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

bool gpsTimeNs(const NavPvt& pvt, int64_t* out) {
  if (!hasResolvedTime(pvt)) return false;
  constexpr int64_t kGpsEpochUnix = 315964800;  // 1980-01-06 in Unix seconds
  constexpr int64_t kWeekS = 604800;
  const int64_t unixS = daysFromCivil(pvt.year, pvt.month, pvt.day) * 86400 +
                        pvt.hour * 3600 + pvt.minute * 60 + pvt.second;
  const int64_t gpsS = unixS - kGpsEpochUnix + kGpsUtcLeapSeconds;
  int64_t week = gpsS / kWeekS;
  const int64_t towS = pvt.iTowMs / 1000;
  const int64_t diff = week * kWeekS + towS - gpsS;
  if (diff > kWeekS / 2) --week;
  if (diff < -kWeekS / 2) ++week;
  *out = (week * kWeekS * 1000 + pvt.iTowMs) * 1000000LL;
  return true;
}

}  // namespace gl
