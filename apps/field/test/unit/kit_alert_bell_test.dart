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

  test('a flickering alert rings at most every 10 s', () {
    final bell = KitAlertBell();
    // On every other second.
    final rings = run(
      bell,
      0,
      30,
      (s) => s.isEven ? [KitAlert.lidarRateLow] : const [],
    );
    expect(rings, [0, 10, 20, 30]);
  });

  test('an alert back after a quiet spell rings at once', () {
    final bell = KitAlertBell();
    expect(run(bell, 0, 2, (_) => [KitAlert.gnssSilent]), [0]);
    expect(run(bell, 3, 14, (_) => const []), isEmpty);
    expect(run(bell, 15, 15, (_) => [KitAlert.gnssSilent]), [15]);
  });

  test('a new alert type rings early, but not right after a ring', () {
    final bell = KitAlertBell();
    expect(run(bell, 0, 0, (_) => [KitAlert.lidarSilent]), [0]);
    // A new type 1 s later waits until 3 s after the last ring …
    final both = [KitAlert.lidarSilent, KitAlert.gnssSilent];
    expect(run(bell, 1, 12, (_) => both), [3]);
    // … then both repeat together, 10 s after that ring.
    expect(run(bell, 13, 13, (_) => both), [13]);
  });

  test('a type that already rang does not ring early again', () {
    final bell = KitAlertBell();
    expect(run(bell, 0, 0, (_) => [KitAlert.gnssSilent]), [0]);
    expect(run(bell, 4, 4, (_) => [KitAlert.gnssSilent, KitAlert.ssdLow]), [4]);
    // gnss_silent clears and comes back 5 s after the last ring: no sound.
    expect(run(bell, 5, 6, (_) => [KitAlert.ssdLow]), isEmpty);
    expect(
      run(bell, 7, 13, (_) => [KitAlert.gnssSilent, KitAlert.ssdLow]),
      isEmpty,
    );
    expect(run(bell, 14, 14, (_) => [KitAlert.gnssSilent, KitAlert.ssdLow]), [
      14,
    ]);
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
