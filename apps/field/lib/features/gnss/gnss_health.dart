import '../../core/ui/widgets.dart';
import 'protocol/gnss_status.dart';

/// Thresholds for the pre-check and the live panel.
abstract final class GnssThresholds {
  /// Kit battery is an 18 V tool battery (~21 V full); below this the crew
  /// should swap it before a 1–2 hour scan.
  static const int minBatteryMv = 16500;

  /// Horizontal accuracy shown green up to this value (before PPK).
  static const int goodHAccMm = 50;
}

Health batteryHealth(GnssStatus s) =>
    s.batteryMv >= GnssThresholds.minBatteryMv ? Health.ok : Health.bad;

Health sdHealth(GnssStatus s) =>
    s.sdReady ? (s.dataDropped ? Health.warn : Health.ok) : Health.bad;

String sdLabel(GnssStatus s) {
  if (!s.sdPresent) return 'Takılı değil';
  if (s.sdError) return 'Hata';
  if (s.sdLowSpace) return 'Dolu (${s.sdFreeMib} MiB)';
  final gb = (s.sdFreeMib / 1024).toStringAsFixed(1);
  return s.dataDropped ? '$gb GB boş, veri atıldı' : '$gb GB boş';
}

/// Receiver configured and a valid 3D (or better) fix.
bool gnssReady(GnssStatus s) =>
    s.rxConfig == RxConfig.ok && s.gnssFixOk && s.fixType >= 3;

Health gnssHealth(GnssStatus s) {
  if (!gnssReady(s)) return Health.bad;
  return s.ppsState == PpsState.locked ? Health.ok : Health.warn;
}

String gnssLabel(GnssStatus s) {
  if (s.rxConfig != RxConfig.ok) return s.rxConfig.label;
  if (!s.gnssFixOk || s.fixType < 3) return 'Konum yok (${s.numSv} uydu)';
  return '${s.fixLabel}, ${s.numSv} uydu';
}

Health ppsHealth(GnssStatus s) => switch (s.ppsState) {
  PpsState.locked => s.timeMapped ? Health.ok : Health.warn,
  PpsState.lost => Health.bad,
  _ => Health.warn,
};

Health accuracyHealth(GnssStatus s) {
  final h = s.hAccMm;
  if (h == null) return Health.bad;
  return h <= GnssThresholds.goodHAccMm ? Health.ok : Health.warn;
}

String accuracyLabel(GnssStatus s) {
  final h = s.hAccMm;
  if (h == null) return '—';
  return h < 1000
      ? '${(h / 10).toStringAsFixed(1)} cm'
      : '${(h / 1000).toStringAsFixed(1)} m';
}

String batteryLabel(GnssStatus s) =>
    '${(s.batteryMv / 1000).toStringAsFixed(1)} V';
