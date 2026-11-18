import '../gnss/protocol/gnss_status.dart';

/// When the kit's recording alerts sound (docs/arayuzler.md, "Kayıt
/// sırasında"): once when an alert appears, again every [repeat] while any
/// alert lasts. Driven by the status messages (one per second), so the
/// phone clock decides and tests can move it.
///
/// The bell never rings more often than every [repeat], so a flickering
/// alert does not ring on every flicker. One exception: a type that has not
/// rung yet in this recording rings as soon as [newTypeGap] has passed since
/// the last ring.
///
/// Alerts of a pre-check item the crew overrode do not sound: the kit keeps
/// them raised for the whole session ([silencedBy]). The banner and the
/// summary still show them.
class KitAlertBell {
  KitAlertBell({
    this.repeat = const Duration(seconds: 10),
    this.newTypeGap = const Duration(seconds: 3),
  });

  final Duration repeat;
  final Duration newTypeGap;

  /// Types the bell has rung for in this recording (mask).
  int _rung = 0;
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
    if (mask == 0) return false;
    final last = _lastRing;
    final since = last == null ? null : now.difference(last);
    final newType = mask & ~_rung != 0;
    // A phone clock set back must not mute the bell.
    final ring =
        since == null ||
        since.isNegative ||
        since >= repeat ||
        (newType && since >= newTypeGap);
    if (!ring) return false;
    _lastRing = now;
    _rung |= mask;
    return true;
  }
}
