import '../gnss/protocol/gnss_status.dart';

/// When the kit's recording alerts sound (docs/arayuzler.md, "Kayıt
/// sırasında"): once when a new alert appears, again every [repeat] while
/// any alert lasts. Driven by the status messages (one per second), so the
/// phone clock decides and tests can move it.
class KitAlertBell {
  KitAlertBell({this.repeat = const Duration(seconds: 10)});

  final Duration repeat;

  int _mask = 0;
  DateTime? _lastRing;
  final Set<KitAlert> _seen = {};

  /// Every alert seen during the recording, in [KitAlert] order (summary).
  List<KitAlert> get seen => [
    for (final a in KitAlert.values)
      if (_seen.contains(a)) a,
  ];

  /// Takes the alerts of a status; true when the sound should play now.
  bool update(List<KitAlert> alerts, DateTime now) {
    final mask = KitAlert.toMask(alerts);
    _seen.addAll(alerts);
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
