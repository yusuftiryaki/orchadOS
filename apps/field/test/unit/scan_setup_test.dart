import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/checklist/scan_setup.dart';

void main() {
  test('camera height: comma or dot, two decimals, 0,50–3,50 m', () {
    expect(parseCameraHeight('2,10'), 2.1);
    expect(parseCameraHeight(' 1.857 '), 1.86);
    expect(parseCameraHeight('0,5'), 0.5);
    expect(parseCameraHeight('3,50'), 3.5);
    expect(parseCameraHeight('3'), 3.0);
    expect(parseCameraHeight('0,49'), isNull);
    expect(parseCameraHeight('3,51'), isNull);
    expect(parseCameraHeight(''), isNull);
    expect(parseCameraHeight('2,1 m'), isNull);
    expect(parseCameraHeight('-1'), isNull);
    expect(parseCameraHeight('1e0'), isNull);
    expect(formatMetres(2.1), '2,10');
  });

  test('differences from the last scan', () {
    const last = ScanSetup(
      platform: ScanPlatform.robot,
      cameraHeightM: 2.1,
    );
    expect(last.label, 'Robotla, 2,10 m');
    expect(
      const ScanSetup(
        platform: ScanPlatform.robot,
        cameraHeightM: 1.85,
      ).differencesFrom(last),
      isEmpty,
    );
    expect(
      const ScanSetup(
        platform: ScanPlatform.walk,
        cameraHeightM: 1.84,
      ).differencesFrom(last),
      [
        'Platform son taramadan farklı (Robotla)',
        'Kamera yüksekliği son taramadan 0,26 m farklı (2,10 m)',
      ],
    );
    expect(ScanPlatform.fromCode('robot'), ScanPlatform.robot);
    expect(ScanPlatform.fromCode('atv'), ScanPlatform.atv);
    expect(ScanPlatform.atv.label, 'ATV ile');
    expect(ScanPlatform.walk.label, 'Yürüyerek (el arabası)');
    expect(ScanPlatform.fromCode('drone'), isNull);
    // No longer offered (owner, 2026-11-20); older rows read as unknown.
    expect(ScanPlatform.fromCode('motorcycle'), isNull);
  });
}
