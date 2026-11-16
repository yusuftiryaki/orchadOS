import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/gnss_logger.dart';
import 'package:orchados_field/features/gnss/protocol/command_result.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';

void main() {
  late FakeGnssLogger logger;

  setUp(() => logger = FakeGnssLogger());
  tearDown(() => logger.dispose());

  test('commands need a connection', () async {
    expect(await logger.stopSession(), CommandResult.disconnected);
    expect(logger.receivedCommands, isEmpty);
  });

  test('session life cycle over encoded bytes', () async {
    await logger.connect();
    expect(logger.connection, GnssConnection.connected);
    expect(logger.lastStatus, isNotNull);

    expect(
      await logger.startSession(sessionId: 'S-1', parcelId: 'P-12'),
      CommandResult.ok,
    );
    expect(logger.lastStatus!.status.recording, isTrue);
    expect(
      await logger.startSession(sessionId: 'S-2', parcelId: 'P-12'),
      CommandResult.alreadyRecording,
    );
    expect(await logger.markEvent(MarkType.corner, '1'), CommandResult.ok);
    expect(await logger.stopSession(), CommandResult.ok);
    expect(await logger.stopSession(), CommandResult.notRecording);
    expect(
      await logger.startSession(sessionId: 'S-1', parcelId: 'P-12'),
      CommandResult.sessionExists,
    );

    final seqs = logger.receivedCommands.map((c) => c.seq).toList();
    expect(seqs, [1, 2, 3, 4, 5, 6]);
    expect(logger.receivedCommands[2], isA<MarkEvent>());
  });

  test('result comes from the matching sequence number', () async {
    await logger.connect();
    logger.nextResult = CommandResult.sdMissing;
    expect(
      await logger.startSession(sessionId: 'S-1', parcelId: 'P'),
      CommandResult.sdMissing,
    );
    expect(logger.lastStatus!.status.lastCmdSeq, 1);
  });

  test('missing SD card is reported by the logger', () async {
    await logger.connect();
    logger.status = FakeGnssLogger.healthyStatus.copyWith(
      flags: GnssStatus.flagTimeMapped | GnssStatus.flagGnssFixOk,
    );
    expect(
      await logger.startSession(sessionId: 'S-1', parcelId: 'P'),
      CommandResult.sdMissing,
    );
  });

  test('times out when the logger does not answer', () async {
    final slow = FakeGnssLogger(
      commandTimeout: const Duration(milliseconds: 50),
    );
    await slow.connect();
    slow.unresponsive = true;
    expect(await slow.stopSession(), CommandResult.timeout);
    await slow.dispose();
  });

  test('status carries GPS time only when the logger has it', () async {
    await logger.connect();
    expect(logger.lastStatus!.status.gpsTimeNs, isNotNull);
    logger.provideGpsTime = false;
    logger.tick();
    expect(logger.lastStatus!.status.gpsTimeNs, isNull);
  });

  test('malformed notifications are dropped', () async {
    await logger.connect();
    final before = logger.lastStatus;
    // ignore: invalid_use_of_protected_member
    logger.onStatusBytes([1, 2, 3], DateTime.now());
    expect(logger.lastStatus, same(before));
  });

  group('kit recorder', () {
    test('start_session sends override byte only to the kit', () async {
      // ESP32: the byte is never sent (the firmware would answer malformed).
      await logger.connect();
      expect(
        await logger.startSession(
          sessionId: 'S-1',
          parcelId: 'P',
          overrideMask: 0x01,
        ),
        CommandResult.ok,
      );
      final esp = logger.receivedCommands.single as StartSession;
      expect(esp.overrideMask, isNull);

      final kit = FakeGnssLogger(
        kit: const KitStatus(precheckFail: [KitCheck.clock]),
      );
      addTearDown(kit.dispose);
      await kit.connect();
      expect(kit.lastStatus!.status.isKit, isTrue);
      expect(
        await kit.startSession(
          sessionId: 'S-1',
          parcelId: 'P',
          overrideMask: 0x04,
        ),
        CommandResult.ok,
      );
      expect((kit.receivedCommands.single as StartSession).overrideMask, 0x04);
      expect(kit.lastStatus!.status.kit!.overrides, [KitCheck.clock]);
      expect(await kit.stopSession(), CommandResult.ok);
      expect(kit.lastStatus!.status.kit!.overrides, isEmpty);
    });

    test('the fake ESP32 rejects an override byte like the firmware', () async {
      await logger.connect();
      // ignore: invalid_use_of_protected_member
      await logger.writeCommand(
        const StartSession(
          seq: 9,
          sessionId: 'S-1',
          parcelId: 'P',
          overrideMask: 1,
        ).encode(),
      );
      await Future<void>.delayed(Duration.zero);
      expect(logger.lastStatus!.status.lastCmdResult, CommandResult.malformed);
      expect(logger.lastStatus!.status.recording, isFalse);
    });

    test('kit refuses start with failed pre-check unless overridden', () async {
      final kit = FakeGnssLogger(
        kit: const KitStatus(precheckFail: [KitCheck.lidar]),
      );
      addTearDown(kit.dispose);
      await kit.connect();
      // The kit reports no battery voltage.
      expect(kit.lastStatus!.status.batteryMv, 0);
      expect(
        await kit.startSession(sessionId: 'S-1', parcelId: 'P'),
        CommandResult.precheckFailed,
      );
      expect(
        await kit.startSession(
          sessionId: 'S-1',
          parcelId: 'P',
          overrideMask: 0x04,
        ),
        CommandResult.precheckFailed,
      );
      expect(
        await kit.startSession(
          sessionId: 'S-1',
          parcelId: 'P',
          overrideMask: 0x01,
        ),
        CommandResult.ok,
      );
    });

    test('a failed SSD or receiver cannot be overridden', () async {
      final kit = FakeGnssLogger(
        kit: const KitStatus(precheckFail: [KitCheck.ssd]),
      );
      addTearDown(kit.dispose);
      await kit.connect();
      expect(
        await kit.startSession(
          sessionId: 'S-1',
          parcelId: 'P',
          overrideMask: 0x07,
        ),
        CommandResult.precheckFailed,
      );
    });
  });
}
