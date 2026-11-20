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

Health sdHealth(GnssStatus s) => s.sdReady && kitCheckOk(s, KitCheck.ssd)
    ? (s.dataDropped ? Health.warn : Health.ok)
    : Health.bad;

String sdLabel(GnssStatus s) {
  if (!s.sdPresent) return 'Takılı değil';
  if (s.sdError) return 'Hata';
  final gb = (s.sdFreeMib / 1024).toStringAsFixed(1);
  if (s.sdLowSpace) {
    // On the kit the flag means less than 20 GiB left, not full.
    return s.isKit ? 'Yer az ($gb GB boş)' : 'Dolu (${s.sdFreeMib} MiB)';
  }
  // The kit refuses to start below 30 GiB or when its test write fails.
  if (!kitCheckOk(s, KitCheck.ssd)) return '$gb GB boş, kayda hazır değil';
  return s.dataDropped ? '$gb GB boş, veri atıldı' : '$gb GB boş';
}

/// Receiver configured and a valid 3D (or better) fix.
bool gnssReady(GnssStatus s) =>
    s.rxConfig == RxConfig.ok && s.gnssFixOk && s.fixType >= 3;

Health gnssHealth(GnssStatus s) {
  if (!gnssReady(s) || !kitCheckOk(s, KitCheck.gnss)) return Health.bad;
  return s.ppsState == PpsState.locked ? Health.ok : Health.warn;
}

String gnssLabel(GnssStatus s) {
  if (s.rxConfig != RxConfig.ok) return s.rxConfig.label;
  if (!kitCheckOk(s, KitCheck.gnss)) return 'Alıcıdan veri gelmiyor';
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

// --- Kit recorder (Raspberry Pi) -------------------------------------------

/// The battery item applies to the ESP32 only: the Pi does not measure the
/// kit battery and sends 0 V (docs/arayuzler.md).
bool batteryApplies(GnssStatus s) => !s.isKit;

/// Name of the recorder's storage: the kit records on an SSD.
String storageName(GnssStatus s) => s.isKit ? 'SSD' : 'SD kart';

/// Whether a kit pre-check item passes right now; true on the ESP32.
bool kitCheckOk(GnssStatus s, KitCheck c) =>
    !(s.kit?.precheckFail.contains(c) ?? false);

Health lidarHealth(GnssStatus s) {
  final k = s.kit;
  if (k == null || k.lidarState != LidarState.streaming) return Health.bad;
  if (k.alerts.contains(KitAlert.lidarSilent) ||
      k.alerts.contains(KitAlert.lidarNotWritten)) {
    return Health.bad;
  }
  return kitCheckOk(s, KitCheck.lidar) &&
          !k.alerts.contains(KitAlert.lidarRateLow)
      ? Health.ok
      : Health.warn;
}

/// "64 bin nokta/sn", "Veri yok" or "Kopuk".
String lidarLabel(GnssStatus s) {
  final k = s.kit;
  if (k == null) return '—';
  return switch (k.lidarState) {
    LidarState.neverSeen => 'Veri yok',
    LidarState.lost => 'Kopuk',
    LidarState.streaming =>
      '${(k.lidarPointsPerS / 1000).round()} bin nokta/sn',
  };
}

Health lidarModeHealth(GnssStatus s) => switch (s.kit?.lidarMode) {
  LidarMode.ok => Health.ok,
  LidarMode.unknown => Health.warn,
  _ => Health.bad,
};

String lidarModeLabel(GnssStatus s) => switch (s.kit?.lidarMode) {
  LidarMode.ok => 'Negatif açı açık',
  LidarMode.unknown => 'Doğrulanamıyor',
  LidarMode.wrong => 'Negatif açı kapalı',
  null => '—',
};

Health clockHealth(GnssStatus s) => switch (s.kit?.clock) {
  KitClock.pps || KitClock.usb => Health.ok,
  _ => Health.bad,
};

/// "GPS'e kilitli", "USB (PPS yok)" or "Kilitsiz".
String clockLabel(GnssStatus s) => switch (s.kit?.clock) {
  KitClock.pps => "GPS'e kilitli",
  KitClock.usb => 'USB (PPS yok)',
  KitClock.unlocked || null => 'Kilitsiz',
};

/// Health and value of a kit pre-check item.
({Health health, String value}) kitCheckLine(GnssStatus s, KitCheck c) =>
    switch (c) {
      KitCheck.lidar => (health: lidarHealth(s), value: lidarLabel(s)),
      KitCheck.lidarMode => (
        health: lidarModeHealth(s),
        value: lidarModeLabel(s),
      ),
      KitCheck.clock => (health: clockHealth(s), value: clockLabel(s)),
      KitCheck.ssd => (health: sdHealth(s), value: sdLabel(s)),
      KitCheck.gnss => (health: gnssHealth(s), value: gnssLabel(s)),
    };
