import 'clock.dart';
import 'gps_time.dart';

/// Where a GPS timestamp came from.
enum TimeSource {
  /// Phone clock corrected with the logger's GPS time.
  gps('gps', 'GPS saati'),

  /// Phone clock alone (UTC + leap seconds); no logger GPS time available.
  phone('phone', 'Telefon saati');

  const TimeSource(this.code, this.label);

  /// Value stored in the database.
  final String code;
  final String label;
}

/// A GPS time estimate and its source.
class GpsTimeReading {
  const GpsTimeReading(this.gpsTimeMs, this.source);

  /// Milliseconds since the GPS epoch.
  final int gpsTimeMs;
  final TimeSource source;

  bool get isFromGps => source == TimeSource.gps;
}

/// Estimates GPS time on the phone from the logger's GPS time.
///
/// Each status message carrying a GPS time gives one sample of
/// `offset = logger_gps_time − phone_clock_at_receipt`. The estimate is the
/// median of the most recent samples, which rejects the occasional late BLE
/// notification. `gps_now = phone_now + offset`. Without fresh samples the
/// phone clock is converted directly (UTC + 18 s) and marked [TimeSource.phone].
class GpsClock {
  GpsClock({
    required this.clock,
    this.windowSize = 15,
    this.maxSampleAge = const Duration(minutes: 10),
  });

  final Clock clock;

  /// Number of recent samples the median is taken over.
  final int windowSize;

  /// The offset is used while the newest sample is younger than this. The
  /// phone clock drifts slowly, so a short BLE gap does not matter.
  final Duration maxSampleAge;

  final List<int> _offsetsUs = [];
  DateTime? _lastSampleAt;

  /// Adds a sample: [loggerGpsTimeNs] was received at [phoneReceivedAt].
  void addSample({
    required int loggerGpsTimeNs,
    required DateTime phoneReceivedAt,
  }) {
    final offset =
        loggerGpsTimeNs ~/ 1000 -
        phoneReceivedAt.toUtc().microsecondsSinceEpoch;
    _offsetsUs.add(offset);
    if (_offsetsUs.length > windowSize) _offsetsUs.removeAt(0);
    _lastSampleAt = phoneReceivedAt.toUtc();
  }

  /// Drops all samples (e.g. after connecting to another logger).
  void reset() {
    _offsetsUs.clear();
    _lastSampleAt = null;
  }

  /// Current offset in microseconds (GPS µs − phone Unix µs), or null when
  /// there is no fresh sample.
  int? get offsetUs {
    final last = _lastSampleAt;
    if (last == null || clock.now().difference(last) > maxSampleAge) {
      return null;
    }
    final sorted = [..._offsetsUs]..sort();
    final n = sorted.length;
    return n.isOdd
        ? sorted[n ~/ 2]
        : (sorted[n ~/ 2 - 1] + sorted[n ~/ 2]) ~/ 2;
  }

  /// Difference between the phone's own GPS estimate (UTC + 18 s) and the
  /// logger's GPS time, in ms. Positive means the phone clock is behind.
  int? get phoneClockErrorMs {
    final o = offsetUs;
    if (o == null) return null;
    final now = clock.now();
    return (now.microsecondsSinceEpoch + o - utcToGpsUs(now)) ~/ 1000;
  }

  GpsTimeReading now() {
    final now = clock.now();
    final o = offsetUs;
    if (o == null) return GpsTimeReading(utcToGpsMs(now), TimeSource.phone);
    return GpsTimeReading(
      (now.microsecondsSinceEpoch + o) ~/ 1000,
      TimeSource.gps,
    );
  }
}
