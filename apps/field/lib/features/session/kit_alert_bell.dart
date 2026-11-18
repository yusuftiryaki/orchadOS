import '../gnss/protocol/gnss_status.dart';

/// When the kit's recording alerts sound (docs/arayuzler.md, "Kayıt
/// sırasında"): once when a new alert appears, again every [repeat] while
/// any alert lasts. Driven by the status messages (one per second), so the
/// phone clock decides and tests can move it.
///
/// Alerts of a pre-check item the crew overrode do not sound: the kit keeps
/// them raised for the whole session ([silencedBy]). The banner and the
/// summary still show them.
class KitAlertBell {
  KitAlertBell({this.repeat = const Duration(seconds: 10)});

  final Duration repeat;

  int _mask = 0;
  DateTime? _lastRing;
  final Set<KitAlert> _seen = {};

  /// Alerts that are the expected result of an overridden item. A dead or
  /// slow LiDAR raises `lidar_silent` or `lidar_rate_low`; the clock without
  /// PPS raises `clock_unlocked`. `lidar_not_written` is not among them: the
  /// kit holds it back while the LiDAR is silent, so it means the bag writer
  /// itself failed. The LiDAR mode raises no alert.
  static Set<KitAlert> silencedBy(Iterable<KitCheck> overrides) => {
    for (final c in overrides)
      ...switch (c) {
        KitCheck.lidar => const [KitAlert.lidarSilent, KitAlert.lidarRateLow],
        KitCheck.clock => const [KitAlert.clockUnlocked],
        _ => const <KitAlert>[],
      },
  };

  /// Every alert seen during the recording, in [KitAlert] order (summary).
  List<KitAlert> get seen => [
    for (final a in KitAlert.values)
      if (_seen.contains(a)) a,
  ];

  /// Takes the alerts and the overridden items ([KitStatus.overrides]) of a
  /// status; true when the sound should play now.
  bool update(
    List<KitAlert> alerts,
    DateTime now, {
    Iterable<KitCheck> overrides = const [],
  }) {
    _seen.addAll(alerts);
    final mask =
        KitAlert.toMask(alerts) & ~KitAlert.toMask(silencedBy(overrides));
    final fresh = mask & ~_mask != 0;
    _mask = mask;
    if (mask == 0) {
      _lastRing = null;
      return false;
    }
    final last = _lastRing;
    if (fresh || last == null || !now.isBefore(last.add(repeat))) {
      _lastRing = now;
      return true;
    }
    return false;
  }
}
