/// How a scan is done and how high the camera sits. Both are measured on
/// every visit: the camera height is adjustable, and a scan is only easy to
/// compare with the previous one of the parcel when both stay the same.
/// Stored on the local session, on `session_start` (`data.precheck`) and on
/// the planned visit (`public.session.scan_platform`, `camera_height_m`).
/// Walking scans pull the kit on a hand cart; an ATV replaces the motorcycle
/// (owner, 2026-11-20): an older `motorcycle` row reads as unknown and
/// prefills nothing.
enum ScanPlatform {
  walk('walk', 'Yürüyerek (el arabası)'),
  atv('atv', 'ATV ile'),
  robot('robot', 'Robotla');

  const ScanPlatform(this.code, this.label);
  final String code;
  final String label;

  static ScanPlatform? fromCode(String? code) {
    for (final p in values) {
      if (p.code == code) return p;
    }
    return null;
  }
}

/// Allowed camera height, lens to ground (`numeric(4,2)` on the server).
const double minCameraHeightM = 0.5;
const double maxCameraHeightM = 3.5;

/// A height change above this (or another platform) makes the scan harder
/// to compare with the previous one: warned, not blocked.
const double cameraHeightToleranceM = 0.25;

/// Parses what the crew typed ("2,10" or "2.1") to metres with two
/// decimals; null when it is not a number in the allowed range.
double? parseCameraHeight(String text) {
  final t = text.trim().replaceAll(',', '.');
  if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(t)) return null;
  final v = double.tryParse(t);
  if (v == null) return null;
  final rounded = (v * 100).round() / 100;
  if (rounded < minCameraHeightM || rounded > maxCameraHeightM) return null;
  return rounded;
}

/// Metres as the crew reads them: "2,10".
String formatMetres(double m) => m.toStringAsFixed(2).replaceAll('.', ',');

/// Platform and camera height of one scan.
class ScanSetup {
  const ScanSetup({required this.platform, required this.cameraHeightM});

  final ScanPlatform platform;
  final double cameraHeightM;

  /// "Robotla, 2,10 m".
  String get label => '${platform.label}, ${formatMetres(cameraHeightM)} m';

  /// Differences from [previous] worth a warning; empty when comparable.
  List<String> differencesFrom(ScanSetup previous) {
    final diffCm = ((cameraHeightM - previous.cameraHeightM) * 100)
        .round()
        .abs();
    return [
      if (platform != previous.platform)
        'Platform son taramadan farklı (${previous.platform.label})',
      if (diffCm > (cameraHeightToleranceM * 100).round())
        'Kamera yüksekliği son taramadan ${formatMetres(diffCm / 100)} m '
            'farklı (${formatMetres(previous.cameraHeightM)} m)',
    ];
  }
}
