import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/qr_clock/qr_payload.dart';

void main() {
  test('matches the pipeline README example', () {
    expect(
      formatQrPayload(1476435618200, sessionId: 'synth-0001'),
      'OQ1:1476435618200:synth-00',
    );
  });

  test('label keeps only [A-Za-z0-9_-] and the first 8 characters', () {
    expect(qrSessionLabel('3f2a9c1e-7b4d-4e8a'), '3f2a9c1e');
    expect(qrSessionLabel('S 1/ğ:2'), 'S12');
    expect(qrSessionLabel('ab_c'), 'ab_c');
  });

  test('label is omitted without a usable session id', () {
    expect(formatQrPayload(42), 'OQ1:42');
    expect(formatQrPayload(42, sessionId: '::'), 'OQ1:42');
  });

  test('negative times are rejected', () {
    expect(() => formatQrPayload(-1), throwsArgumentError);
  });

  test('refreshes at least at 10 Hz', () {
    expect(qrRefreshInterval.inMilliseconds, lessThanOrEqualTo(100));
  });
}
