import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/gnss/protocol/command_result.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';

/// Parses "01 07 03 …" as written in firmware/gnss-logger/README.md.
Uint8List hex(String s) => Uint8List.fromList(
  s.trim().split(RegExp(r'\s+')).map((b) => int.parse(b, radix: 16)).toList(),
);

void main() {
  group('README command vectors', () {
    // firmware/gnss-logger/README.md, "Örnekler (onaltılık)".
    final startBytes = hex('01 07 03 53 2D 31 04 50 2D 31 32');
    final stopBytes = hex('02 08');
    final cornerBytes = hex('03 09 01 01 33');

    test('start_session("S-1", "P-12"), seq 7', () {
      const cmd = StartSession(seq: 7, sessionId: 'S-1', parcelId: 'P-12');
      expect(cmd.encode(), startBytes);
      final d = GnssCommand.decode(startBytes);
      expect(d.result, CommandResult.ok);
      final back = d.command! as StartSession;
      expect(back.seq, 7);
      expect(back.sessionId, 'S-1');
      expect(back.parcelId, 'P-12');
    });

    test('stop_session, seq 8', () {
      expect(const StopSession(seq: 8).encode(), stopBytes);
      final d = GnssCommand.decode(stopBytes);
      expect(d.command, isA<StopSession>());
      expect(d.command!.seq, 8);
    });

    test('mark_event(corner, "3"), seq 9', () {
      const cmd = MarkEvent(seq: 9, type: MarkType.corner, payload: '3');
      expect(cmd.encode(), cornerBytes);
      final back = GnssCommand.decode(cornerBytes).command! as MarkEvent;
      expect(back.type, MarkType.corner);
      expect(back.payload, '3');
    });
  });

  group('commands', () {
    test('qr_sync carries the QR text', () {
      const payload = 'OQ1:1476435618200:synth-00';
      final bytes = const MarkEvent(
        seq: 200,
        type: MarkType.qrSync,
        payload: payload,
      ).encode();
      expect(bytes.sublist(0, 4), [0x03, 200, 0x02, payload.length]);
      expect(String.fromCharCodes(bytes.sublist(4)), payload);
    });

    test('UUID session id and the longest command fit the limits', () {
      const uuid = '3f2a9c1e-7b4d-4e8a-9c1f-2b3d4e5f6a7b';
      final start = const StartSession(
        seq: 1,
        sessionId: uuid,
        parcelId: 'b2c4e6a8-0000-4000-8000-000000000012',
      ).encode();
      expect(start[2], 36);
      final longest = MarkEvent(
        seq: 1,
        type: MarkType.corner,
        payload: 'x' * 200,
      ).encode();
      expect(longest.length, 204);
    });

    test('UTF-8 payload is length-prefixed in bytes', () {
      final bytes = const MarkEvent(
        seq: 1,
        type: MarkType.corner,
        payload: 'köşe',
      ).encode();
      expect(bytes[3], 6);
      final back = GnssCommand.decode(bytes).command! as MarkEvent;
      expect(back.payload, 'köşe');
    });

    test('arguments the firmware would reject throw', () {
      expect(
        () => const StartSession(
          seq: 1,
          sessionId: 'a/b',
          parcelId: 'P',
        ).encode(),
        throwsArgumentError,
      );
      expect(
        () => StartSession(seq: 1, sessionId: 'a' * 37, parcelId: 'P').encode(),
        throwsArgumentError,
      );
      expect(
        () => const StartSession(seq: 1, sessionId: 'S', parcelId: '').encode(),
        throwsArgumentError,
      );
      expect(
        () => const StartSession(
          seq: 1,
          sessionId: 'S',
          parcelId: 'parsel ç',
        ).encode(),
        throwsArgumentError,
      );
      expect(
        () => MarkEvent(
          seq: 1,
          type: MarkType.corner,
          payload: 'x' * 201,
        ).encode(),
        throwsArgumentError,
      );
      expect(
        () => const MarkEvent(
          seq: 1,
          type: MarkType.corner,
          payload: 'a\nb',
        ).encode(),
        throwsArgumentError,
      );
      expect(() => const StopSession(seq: 256).encode(), throwsArgumentError);
    });

    test('decode reports firmware result codes', () {
      expect(GnssCommand.decode([0x02]).result, CommandResult.malformed);
      expect(
        GnssCommand.decode(hex('02 08 00')).result,
        CommandResult.malformed,
      );
      expect(
        GnssCommand.decode(hex('01 07 03 53 2D')).result,
        CommandResult.malformed,
      );
      final unknown = GnssCommand.decode(hex('09 05'));
      expect(unknown.result, CommandResult.unknownOpcode);
      expect(unknown.seq, 5);
      expect(
        GnssCommand.decode(hex('03 09 07 01 33')).result,
        CommandResult.invalidArgument,
      );
      expect(
        GnssCommand.decode(hex('01 07 01 2F 01 50')).result,
        CommandResult.invalidArgument,
      );
    });
  });

  group('status', () {
    // Same vector as test_status_encoding_bytes in
    // firmware/gnss-logger/test/test_ble_protocol.
    final vector = hex('''
      01 01 29 01 01 03 02 1B
      0E 00 00 00
      04 03 02 01
      30 75 00 00
      18 47
      00 01 00
      00 00 00 00
      07 00''');

    test('decodes the firmware vector', () {
      expect(vector.length, 31);
      final s = GnssStatus.decode(vector);
      expect(s.version, 1);
      expect(s.recording, isTrue);
      expect(s.sdPresent, isTrue);
      expect(s.timeMapped, isTrue);
      expect(s.gnssFixOk, isTrue);
      expect(s.sdLowSpace || s.sdError || s.dataDropped, isFalse);
      expect(s.rxConfig, RxConfig.ok);
      expect(s.ppsState, PpsState.locked);
      expect(s.fixType, 3);
      expect(s.carrierSolution, CarrierSolution.fixed);
      expect(s.numSv, 27);
      expect(s.hAccMm, 14);
      expect(s.bytesWritten, 0x01020304);
      expect(s.sdFreeMib, 30000);
      expect(s.batteryMv, 18200);
      expect(s.firmwareVersion, '0.1.0');
      expect(s.droppedBytes, 0);
      expect(s.lastCmdSeq, 7);
      expect(s.lastCmdResult, CommandResult.ok);
      expect(s.gpsTimeNs, isNull);
    });

    test('re-encodes to the same bytes', () {
      expect(GnssStatus.decode(vector).encode(), vector);
    });

    test('default status: unknown accuracy and no command yet', () {
      final bytes = Uint8List(31)..[0] = 1;
      bytes.setRange(8, 12, [0xFF, 0xFF, 0xFF, 0xFF]);
      bytes[30] = 0xFF;
      final s = GnssStatus.decode(bytes);
      expect(s.hAccMm, isNull);
      expect(s.lastCmdResult, CommandResult.none);
      expect(s.sdReady, isFalse);
    });

    test('rejects short messages and other versions', () {
      expect(
        () => GnssStatus.decode(vector.sublist(0, 30)),
        throwsFormatException,
      );
      final v2 = Uint8List.fromList(vector)..[0] = 2;
      expect(() => GnssStatus.decode(v2), throwsFormatException);
    });

    test('accepts fields appended in the same version', () {
      final longer = Uint8List.fromList([...vector, 0xAA]);
      expect(GnssStatus.decode(longer).numSv, 27);
    });

    test('reads the proposed trailing gps_time_ns', () {
      const t = 1476350122250000000;
      final s = GnssStatus.decode(vector).copyWith(gpsTimeNs: t);
      final bytes = s.encode(includeGpsTime: true);
      expect(bytes.length, 39);
      expect(GnssStatus.decode(bytes).gpsTimeNs, t);
      final zero = Uint8List.fromList([...vector, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(GnssStatus.decode(zero).gpsTimeNs, isNull);
    });
  });
}
