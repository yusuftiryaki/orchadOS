import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';
import 'package:orchados_field/features/session/kit_alert_bell.dart';

void main() {
  final t0 = DateTime.utc(2026, 12, 3, 8, 30);
  DateTime at(int s) => t0.add(Duration(seconds: s));

  /// Feeds one status per second from [from] to [to] (inclusive) and returns
  /// the seconds at which the bell rang.
  List<int> run(
    KitAlertBell bell,
    int from,
    int to,
    List<KitAlert> Function(int s) alerts, {
    List<KitCheck> overrides = const [],
  }) => [
    for (var s = from; s <= to; s++)
      if (bell.update(alerts(s), at(s), overrides: overrides)) s,
  ];

  test('rings at once, then every 10 s while the alert lasts', () {
    final bell = KitAlertBell();
    expect(run(bell, 0, 25, (_) => [KitAlert.ssdLow]), [0, 10, 20]);
  });

  test('overridden items do not ring but are kept for the summary', () {
    final bell = KitAlertBell();
    const overrides = [KitCheck.lidar, KitCheck.clock];
    final muted = [
      KitAlert.lidarSilent,
      KitAlert.lidarRateLow,
      KitAlert.clockUnlocked,
    ];
    expect(run(bell, 0, 60, (_) => muted, overrides: overrides), isEmpty);
    expect(bell.seen, muted);
    // Other alerts still ring, lidar_not_written too (the bag writer, not
    // the sensor).
    expect(
      run(
        bell,
        61,
        61,
        (_) => [...muted, KitAlert.lidarNotWritten],
        overrides: overrides,
      ),
      [61],
    );
  });

  test('the LiDAR mode override silences nothing', () {
    final bell = KitAlertBell();
    expect(
      run(
        bell,
        0,
        0,
        (_) => [KitAlert.lidarSilent],
        overrides: const [KitCheck.lidarMode],
      ),
      [0],
    );
  });

  test('silenced alerts per overridden item', () {
    expect(KitAlertBell.silencedBy(const [KitCheck.lidar]), {
      KitAlert.lidarSilent,
      KitAlert.lidarRateLow,
    });
    expect(KitAlertBell.silencedBy(const [KitCheck.clock]), {
      KitAlert.clockUnlocked,
    });
    expect(KitAlertBell.silencedBy(const [KitCheck.lidarMode]), isEmpty);
    expect(KitAlertBell.silencedBy(const []), isEmpty);
  });
}
