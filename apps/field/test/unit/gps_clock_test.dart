import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/core/time/gps_time.dart';

void main() {
  group('GPS time conversion', () {
    test('matches the logger session.json example', () {
      // firmware/gnss-logger/README.md: utc 2026-10-18T09:15:02.500Z,
      // gps_time_ns 1476350120500000000.
      final utc = DateTime.utc(2026, 10, 18, 9, 15, 2, 500);
      expect(utcToGpsMs(utc), 1476350120500);
      expect(gpsMsToUtc(1476350120500), utc);
    });

    test('GPS epoch is 18 s ahead of UTC today', () {
      expect(utcToGpsMs(DateTime.utc(1980, 1, 6)), 18000);
    });
  });

  group('GpsClock', () {
    late FakeClock phone;
    late GpsClock clock;
    final t0 = DateTime.utc(2026, 10, 18, 9, 15, 2, 500);

    setUp(() {
      phone = FakeClock(t0);
      clock = GpsClock(clock: phone);
    });

    int loggerNs(DateTime trueUtc) => utcToGpsUs(trueUtc) * 1000;

    test('without samples uses the phone clock and says so', () {
      final r = clock.now();
      expect(r.source, TimeSource.phone);
      expect(r.gpsTimeMs, utcToGpsMs(t0));
      expect(clock.offsetUs, isNull);
      expect(clock.phoneClockErrorMs, isNull);
    });

    test('corrects a phone clock that is 1.5 s behind', () {
      // True time is phone time + 1500 ms.
      clock.addSample(
        loggerGpsTimeNs: loggerNs(t0.add(const Duration(milliseconds: 1500))),
        phoneReceivedAt: t0,
      );
      phone.advance(const Duration(seconds: 30));
      final r = clock.now();
      expect(r.source, TimeSource.gps);
      expect(r.gpsTimeMs, utcToGpsMs(phone.now()) + 1500);
      expect(clock.phoneClockErrorMs, 1500);
    });

    test('median ignores a late notification', () {
      for (var i = 0; i < 5; i++) {
        final at = t0.add(Duration(seconds: i));
        // Normal samples arrive 20 ms after the logger stamped them.
        clock.addSample(
          loggerGpsTimeNs: loggerNs(
            at.subtract(const Duration(milliseconds: 20)),
          ),
          phoneReceivedAt: at,
        );
      }
      // One notification delayed by 800 ms.
      final late = t0.add(const Duration(seconds: 5));
      clock.addSample(
        loggerGpsTimeNs: loggerNs(
          late.subtract(const Duration(milliseconds: 800)),
        ),
        phoneReceivedAt: late,
      );
      expect(clock.phoneClockErrorMs, -20);
    });

    test('window keeps only the newest samples', () {
      final c = GpsClock(clock: phone, windowSize: 3);
      for (final err in [5000, 5000, 5000, 10, 10, 10]) {
        c.addSample(
          loggerGpsTimeNs: loggerNs(t0.add(Duration(milliseconds: err))),
          phoneReceivedAt: t0,
        );
      }
      expect(c.phoneClockErrorMs, 10);
    });

    test('falls back to the phone clock when samples are stale', () {
      clock.addSample(
        loggerGpsTimeNs: loggerNs(t0.add(const Duration(seconds: 2))),
        phoneReceivedAt: t0,
      );
      phone.advance(const Duration(minutes: 11));
      expect(clock.now().source, TimeSource.phone);
      clock.addSample(
        loggerGpsTimeNs: loggerNs(phone.now().add(const Duration(seconds: 2))),
        phoneReceivedAt: phone.now(),
      );
      expect(clock.now().source, TimeSource.gps);
      clock.reset();
      expect(clock.now().source, TimeSource.phone);
    });
  });
}
