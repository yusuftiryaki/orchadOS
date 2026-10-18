/// GPS time helpers. The pipeline and the logger use GPS time as integer
/// nanoseconds (or milliseconds) since 1980-01-06T00:00:00, without leap
/// seconds (services/pipeline/README.md, "Zaman").
library;

/// GPS − UTC in seconds, valid since 2017-01-01. Must match the firmware's
/// `kGpsUtcLeapSeconds` and the pipeline.
const int gpsUtcLeapSeconds = 18;

final DateTime gpsEpoch = DateTime.utc(1980, 1, 6);

final int _gpsEpochUnixUs = gpsEpoch.microsecondsSinceEpoch;

/// GPS time in microseconds for a UTC instant.
int utcToGpsUs(DateTime utc) =>
    utc.toUtc().microsecondsSinceEpoch -
    _gpsEpochUnixUs +
    gpsUtcLeapSeconds * 1000000;

/// GPS time in milliseconds for a UTC instant.
int utcToGpsMs(DateTime utc) => utcToGpsUs(utc) ~/ 1000;

/// UTC instant for a GPS time in milliseconds (display only).
DateTime gpsMsToUtc(int gpsMs) => DateTime.fromMicrosecondsSinceEpoch(
  (gpsMs - gpsUtcLeapSeconds * 1000) * 1000 + _gpsEpochUnixUs,
  isUtc: true,
);
