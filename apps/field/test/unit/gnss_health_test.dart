import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/gnss_health.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';
import 'package:orchados_field/core/ui/widgets.dart';

void main() {
  const healthy = FakeGnssLogger.healthyStatus;

  group('gnssHealth', () {
    test('ESP32 without PPS is a warning', () {
      expect(gnssHealth(healthy), Health.ok);
      expect(
        gnssHealth(healthy.copyWith(ppsState: PpsState.neverSeen)),
        Health.warn,
      );
    });

    test('kit without the PPS wire is healthy: its clock has its own row', () {
      final kit = healthy.copyWith(
        ppsState: PpsState.neverSeen,
        kit: const KitStatus(clock: KitClock.usb),
      );
      expect(gnssHealth(kit), Health.ok);
    });

    test('kit without a fix is still bad', () {
      final kit = healthy.copyWith(
        ppsState: PpsState.neverSeen,
        fixType: 0,
        kit: const KitStatus(clock: KitClock.usb),
      );
      expect(gnssHealth(kit), Health.bad);
    });
  });
}
