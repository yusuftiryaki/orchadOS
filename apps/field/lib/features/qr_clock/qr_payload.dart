/// QR time code read by the pipeline's `sync` stage
/// (services/pipeline/README.md, "QR zaman kodu biçimi"):
/// `OQ1:<gps_time_ms>[:<session_label>]`.
library;

const String qrPrefix = 'OQ1';

/// Refresh period of the QR code. The pipeline assumes `qr_refresh_ms`
/// (default 100 ms, at least 10 Hz) and adds half of it to each reading.
const Duration qrRefreshInterval = Duration(milliseconds: 100);

/// First 8 characters of [sessionId] after dropping everything except
/// letters, digits, `_` and `-`.
String qrSessionLabel(String sessionId) {
  final cleaned = sessionId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '');
  return cleaned.length <= 8 ? cleaned : cleaned.substring(0, 8);
}

/// Formats the QR text for the instant [gpsTimeMs] (GPS time, not UTC).
String formatQrPayload(int gpsTimeMs, {String? sessionId}) {
  if (gpsTimeMs < 0) {
    throw ArgumentError.value(gpsTimeMs, 'gpsTimeMs', 'must not be negative');
  }
  final label = sessionId == null ? '' : qrSessionLabel(sessionId);
  return label.isEmpty ? '$qrPrefix:$gpsTimeMs' : '$qrPrefix:$gpsTimeMs:$label';
}
