import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/features/checklist/precheck_screen.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

final periodicTask = FakeTaskRepository.sampleTasks[0];
final inventoryTask = FakeTaskRepository.sampleTasks[1];

Future<TestHarness> openSession(
  WidgetTester tester, {
  bool provideGpsTime = true,
  int phoneClockErrorMs = 0,
  bool inventory = true,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final h = TestHarness(
    provideGpsTime: provideGpsTime,
    phoneClockErrorMs: phoneClockErrorMs,
  );
  h.container
      .read(sessionControllerProvider.notifier)
      .selectTask(inventory ? inventoryTask : periodicTask);
  await h.logger.connect();
  await tester.pumpWidget(h.wrap(const SessionScreen()));
  await tester.pump();
  return h;
}

/// Opens the QR screen, lets the first frame trigger qr_sync, closes it.
Future<String> showQr(WidgetTester tester, String buttonKey) async {
  await tapVisible(tester, find.byKey(Key(buttonKey)));
  await settle(tester);
  final text = tester.widget<Text>(find.byKey(const Key('qr-text'))).data!;
  await tester.tap(find.text('Tamam'));
  await tester.pumpAndSettle();
  return text;
}

void main() {
  testWidgets('inventory session: start, QR, corners, end QR, stop', (
    tester,
  ) async {
    final h = await openSession(tester, phoneClockErrorMs: 1500);
    final logger = h.logger;

    expect(find.byKey(const Key('gnss-panel')), findsOneWidget);
    expect(find.text('3B, 24 uydu'), findsOneWidget);
    expect(find.text('GPS saati'), findsOneWidget);

    // Steps are locked until the previous one is done.
    Finder button(String key) => find.descendant(
      of: find.byKey(Key(key)),
      matching: find.byType(FilledButton),
    );
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    final start = logger.receivedCommands.single as StartSession;
    expect(start.parcelId, inventoryTask.parcelId);
    final state = h.container.read(sessionControllerProvider);
    expect(state.phase, SessionPhase.recording);
    expect(start.sessionId, state.sessionId);
    expect(
      tester.widget<FilledButton>(button('session-corner')).onPressed,
      isNull,
    );
    expect(
      tester.widget<FilledButton>(button('session-stop')).onPressed,
      isNull,
    );

    // Start QR: qr_sync is sent with exactly the first value shown.
    h.clock.advance(const Duration(seconds: 3));
    final qrText = await showQr(tester, 'session-start-qr');
    final sync = logger.receivedCommands.whereType<MarkEvent>().single;
    expect(sync.type, MarkType.qrSync);
    expect(sync.payload, startsWith('OQ1:'));
    expect(sync.payload, endsWith(':${state.sessionId!.substring(0, 8)}'));
    expect(qrText, sync.payload);
    // GPS time = phone clock + leap seconds + the phone's 1.5 s lag.
    final gpsMs = int.parse(sync.payload.split(':')[1]);
    final phoneGpsMs =
        h.clock.now().millisecondsSinceEpoch -
        DateTime.utc(1980, 1, 6).millisecondsSinceEpoch +
        18000;
    expect(gpsMs - phoneGpsMs, 1500);

    // Two corners.
    await tapVisible(tester, find.byKey(const Key('session-corner')));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('session-corner')));
    await settle(tester);
    expect(find.text('Köşe işaretle (2)'), findsOneWidget);
    final corners = logger.receivedCommands
        .whereType<MarkEvent>()
        .where((m) => m.type == MarkType.corner)
        .map((m) => m.payload);
    expect(corners, ['1', '2']);

    await showQr(tester, 'session-end-qr');
    await tapVisible(tester, find.byKey(const Key('session-stop')));
    await settle(tester);
    expect(logger.receivedCommands.last, isA<StopSession>());
    expect(
      h.container.read(sessionControllerProvider).phase,
      SessionPhase.stopped,
    );
    expect(find.byKey(const Key('session-next')), findsOneWidget);

    // Local records for sync.
    final repo = h.container.read(fieldRepositoryProvider);
    final events = (await tester.runAsync(
      () => repo.events(state.sessionId!),
    ))!;
    expect(events.map((e) => e.eventType), [
      'session_start',
      'qr_sync',
      'corner',
      'corner',
      'qr_sync',
      'session_stop',
    ]);
    expect(events.every((e) => e.timeSource == TimeSource.gps.code), isTrue);
    expect(events[1].payload, sync.payload);
    final session = await tester.runAsync(() => repo.session(state.sessionId!));
    expect(session!.status, 'stopped');
    expect(session.loggerName, 'orchados-gnss-FAKE');
    expect(
      await tester.runAsync(repo.outbox.pendingCount),
      greaterThanOrEqualTo(7),
    );

    await h.dispose(tester);
  });

  testWidgets('without logger GPS time the QR uses the phone clock, marked', (
    tester,
  ) async {
    final h = await openSession(
      tester,
      provideGpsTime: false,
      inventory: false,
    );
    expect(find.text('Telefon saati'), findsOneWidget);
    expect(find.byKey(const Key('session-corner')), findsNothing);

    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('session-start-qr')));
    await settle(tester);
    expect(find.byKey(const Key('qr-source-phone')), findsOneWidget);
    expect(find.textContaining('Telefon saati kullanılıyor'), findsOneWidget);
    expect(find.text('Kaydediciye işaret gönderildi'), findsOneWidget);
    await tester.tap(find.text('Tamam'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final id = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(
      () => h.container.read(fieldRepositoryProvider).events(id),
    ))!;
    final qr = events.singleWhere((e) => e.eventType == 'qr_sync');
    expect(qr.timeSource, TimeSource.phone.code);
    await h.dispose(tester);
  });

  testWidgets('start failure is shown and nothing is stored', (tester) async {
    final h = await openSession(tester);
    h.logger.status = FakeGnssLogger.healthyStatus.copyWith(
      flags: GnssStatus.flagTimeMapped | GnssStatus.flagGnssFixOk,
    );
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    expect(find.text('Kayıt başlamadı: SD kart takılı değil'), findsOneWidget);
    expect(
      h.container.read(sessionControllerProvider).phase,
      SessionPhase.idle,
    );
    expect(await tester.runAsync(h.db.select(h.db.sessions).get), isEmpty);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('pre-check needs the logger checks and both confirmations', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    h.container
        .read(sessionControllerProvider.notifier)
        .selectTask(periodicTask);
    await tester.pumpWidget(h.wrap(const PrecheckScreen()));
    await tester.pump();

    FilledButton cont() => tester.widget<FilledButton>(
      find.descendant(
        of: find.byKey(const Key('precheck-continue')),
        matching: find.byType(FilledButton),
      ),
    );
    expect(find.byKey(const Key('gnss-connect')), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('check-lens')));
    await tapVisible(tester, find.byKey(const Key('check-camera')));
    await tester.pump();
    expect(cont().onPressed, isNull, reason: 'logger not connected');

    await tapVisible(tester, find.byKey(const Key('gnss-connect')));
    await settle(tester);
    expect(cont().onPressed, isNotNull);

    // Low battery blocks the scan.
    h.logger.status = FakeGnssLogger.healthyStatus.copyWith(batteryMv: 15800);
    await tester.pump();
    expect(find.text('15.8 V'), findsOneWidget);
    expect(cont().onPressed, isNull);

    h.logger.status = FakeGnssLogger.healthyStatus;
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    expect(find.byType(SessionScreen), findsOneWidget);
    await h.dispose(tester);
  });
}
