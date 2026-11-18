import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/features/checklist/precheck_screen.dart';
import 'package:orchados_field/features/checklist/scan_setup.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';
import 'package:orchados_field/features/notice/field_records.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

final periodicTask = FakeTaskRepository.sampleTasks[0];
final inventoryTask = FakeTaskRepository.sampleTasks[1];

Future<TestHarness> openSession(
  WidgetTester tester, {
  bool provideGpsTime = true,
  int phoneClockErrorMs = 0,
  bool inventory = true,
  KitStatus? kit,
}) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final h = TestHarness(
    provideGpsTime: provideGpsTime,
    phoneClockErrorMs: phoneClockErrorMs,
    kit: kit,
  );
  h.container
      .read(sessionControllerProvider.notifier)
      .selectTask(inventory ? inventoryTask : periodicTask);
  await h.logger.connect();
  await tester.pumpWidget(h.wrap(const SessionScreen()));
  await tester.pump();
  return h;
}

/// Answers the sign and badge questions of the pre-check with yes.
Future<void> answerNotice(WidgetTester tester) async {
  await tapVisible(tester, find.byKey(const Key('check-notice-sign-yes')));
  await tapVisible(tester, find.byKey(const Key('check-notice-badge-yes')));
  await tester.pump();
}

/// Lets a status notification reach the screen (logger stream, then the
/// status provider).
Future<void> statusArrives(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
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
      tester.widget<FilledButton>(button('session-boundary')).onPressed,
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

    // Two corners on the boundary step.
    await tapVisible(tester, find.byKey(const Key('session-boundary')));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.byKey(const Key('boundary-corner')));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('boundary-corner')));
    await settle(tester);
    expect(find.text('Köşe (2)'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Sınır (2 köşe)'), findsOneWidget);
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
    expect(find.byKey(const Key('session-boundary')), findsNothing);

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
    // Tall enough for the whole list: every item stays built.
    tester.view.physicalSize = const Size(1080, 8000);
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
    // No earlier scan of the parcel: nothing prefilled.
    expect(find.byKey(const Key('scan-setup-previous')), findsNothing);
    await tapVisible(tester, find.byKey(const Key('check-platform-walk')));
    await tester.enterText(
      find.byKey(const Key('check-camera-height')),
      '1,85',
    );
    await tester.pump();
    expect(cont().onPressed, isNull, reason: 'spraying not confirmed');

    // Spraying: "none" and "waiting period passed" exclude each other;
    // either one lets the crew in once sign and badge are answered.
    await tapVisible(tester, find.byKey(const Key('check-spraying-none')));
    await tester.pump();
    expect(cont().onPressed, isNull, reason: 'sign and badge not answered');
    await tapVisible(tester, find.byKey(const Key('check-notice-sign-no')));
    await tapVisible(tester, find.byKey(const Key('check-notice-badge-yes')));
    await tester.pump();
    expect(cont().onPressed, isNull, reason: 'a "no" needs a reason');
    final reason = find.byKey(const Key('check-notice-reason'));
    await tester.enterText(reason, 'Ara 0532 123 45 67');
    await tester.pump();
    expect(find.text('Telefon numarası yazmayın'), findsOneWidget);
    expect(cont().onPressed, isNull);
    await tester.enterText(reason, 'Levha ikinci araçta kaldı');
    await tester.pump();
    expect(cont().onPressed, isNotNull);
    await tapVisible(
      tester,
      find.byKey(const Key('check-spraying-waiting_period_passed')),
    );
    await tester.pump();
    expect(cont().onPressed, isNotNull);
    await tapVisible(
      tester,
      find.byKey(const Key('check-spraying-waiting_period_passed')),
    );
    await tester.pump();
    expect(cont().onPressed, isNull, reason: 'answer taken back');
    await tapVisible(
      tester,
      find.byKey(const Key('check-spraying-waiting_period_passed')),
    );
    await tester.pump();

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

    // The spraying answer, platform and height go with the session start.
    final controller = h.container.read(sessionControllerProvider.notifier);
    expect(await tester.runAsync(controller.start), isTrue);
    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final start = events.firstWhere((e) => e.eventType == 'session_start');
    expect(jsonDecode(start.dataJson!), {
      'version': 1,
      'precheck': {
        'spraying': 'waiting_period_passed',
        'platform': 'walk',
        'camera_height_m': 1.85,
        // The sign and badge answers ride along, in case the app dies
        // before field_notice_sign is written.
        'notice': {
          'sign': false,
          'badge': true,
          'reason': 'Levha ikinci araçta kaldı',
        },
      },
    });
    final row = (await tester.runAsync(() => repo.session(sessionId)))!;
    expect(row.scanPlatform, 'walk');
    expect(row.cameraHeightM, 1.85);
    // Sign and badge: a phone-side event after the start, never sent to
    // the logger.
    final notice = events.singleWhere(
      (e) => e.eventType == 'field_notice_sign',
    );
    expect(notice.loggerResult, 'none');
    expect(jsonDecode(notice.payload), {
      'sign': false,
      'badge': true,
      'reason': 'Levha ikinci araçta kaldı',
    });
    expect(events.map((e) => e.eventType).take(2), [
      'session_start',
      'field_notice_sign',
    ]);
    expect(h.logger.receivedCommands.whereType<MarkEvent>(), isEmpty);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('pre-check: platform and camera height, prefilled from the '
      'last scan of the parcel, with a warning when they differ', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 8000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    final repo = h.container.read(fieldRepositoryProvider);
    final parcelId = periodicTask.parcelId;
    await tester.runAsync(() async {
      // Older scan, the newest one with a setup, a newer one recorded
      // before the pre-check asked, and another parcel.
      await repo.createSession(
        id: 'old',
        parcelId: parcelId,
        visitKind: 'periodic',
        startedAt: DateTime.utc(2026, 5, 1),
        scanPlatform: 'robot',
        cameraHeightM: 1.2,
      );
      await repo.createSession(
        id: 'last',
        parcelId: parcelId,
        visitKind: 'periodic',
        startedAt: DateTime.utc(2026, 9, 1),
        scanPlatform: 'motorcycle',
        cameraHeightM: 2.1,
      );
      await repo.createSession(
        id: 'unset',
        parcelId: parcelId,
        visitKind: 'periodic',
        startedAt: DateTime.utc(2026, 10, 1),
      );
      await repo.createSession(
        id: 'other',
        parcelId: 'other-parcel',
        visitKind: 'periodic',
        startedAt: DateTime.utc(2026, 11, 1),
        scanPlatform: 'walk',
        cameraHeightM: 1.5,
      );
    });
    h.container
        .read(sessionControllerProvider.notifier)
        .selectTask(periodicTask);
    await h.logger.connect();
    await tester.pumpWidget(h.wrap(const PrecheckScreen()));
    await settle(tester);

    FilledButton cont() => tester.widget<FilledButton>(
      find.descendant(
        of: find.byKey(const Key('precheck-continue')),
        matching: find.byType(FilledButton),
      ),
    );
    bool platformTicked(String code) => tester
        .widget<CheckboxListTile>(find.byKey(Key('check-platform-$code')))
        .value!;
    final height = find.byKey(const Key('check-camera-height'));
    final warning = find.byKey(const Key('scan-setup-warning'));
    Future<void> typeHeight(String text) async {
      await tester.enterText(height, text);
      await tester.pump();
    }

    // Prefilled from the newest scan of this parcel that has a setup.
    expect(
      find.text(
        'Bu parselde son tarama: Motosikletle, 2,10 m — aynı yükseklik '
        'karşılaştırmayı kolaylaştırır',
      ),
      findsOneWidget,
    );
    expect(platformTicked('motorcycle'), isTrue);
    expect(platformTicked('walk'), isFalse);
    expect(tester.widget<TextField>(height).controller!.text, '2,10');
    expect(
      find.text('Merceğin yerden yüksekliğini metreyle ölçüp yazın'),
      findsOneWidget,
    );
    expect(warning, findsNothing);

    await tapVisible(tester, find.byKey(const Key('check-lens')));
    await tapVisible(tester, find.byKey(const Key('check-camera')));
    await tapVisible(tester, find.byKey(const Key('check-spraying-none')));
    await answerNotice(tester);
    expect(cont().onPressed, isNotNull);

    // Up to 0,25 m from the last scan is comparable.
    await typeHeight('2,35');
    expect(warning, findsNothing);
    await typeHeight('1.85');
    expect(warning, findsNothing);
    // More is warned about, but does not block.
    await typeHeight('2,40');
    expect(warning, findsOneWidget);
    expect(
      find.textContaining('Kamera yüksekliği son taramadan 0,30 m farklı'),
      findsOneWidget,
    );
    expect(cont().onPressed, isNotNull);

    // Out of range or not a number: blocked, with the reason.
    for (final bad in ['3,6', '0,4', 'abc', '2,1,0']) {
      await typeHeight(bad);
      expect(cont().onPressed, isNull, reason: bad);
      expect(
        find.text('0,50 ile 3,50 m arasında bir sayı yazın'),
        findsOneWidget,
        reason: bad,
      );
      expect(warning, findsNothing);
    }
    await typeHeight('');
    expect(cont().onPressed, isNull, reason: 'height required');
    expect(find.text('0,50 ile 3,50 m arasında bir sayı yazın'), findsNothing);
    await typeHeight('3.50');
    expect(cont().onPressed, isNotNull);
    await typeHeight('2,1');

    // Another platform is warned about too.
    await tapVisible(tester, find.byKey(const Key('check-platform-robot')));
    await tester.pump();
    expect(platformTicked('robot'), isTrue);
    expect(platformTicked('motorcycle'), isFalse);
    expect(
      find.textContaining('Platform son taramadan farklı (Motosikletle)'),
      findsOneWidget,
    );
    expect(cont().onPressed, isNotNull);
    await tapVisible(tester, find.byKey(const Key('check-platform-robot')));
    await tester.pump();
    expect(cont().onPressed, isNull, reason: 'platform required');
    await tapVisible(tester, find.byKey(const Key('check-platform-walk')));
    await typeHeight('0,5');

    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    final controller = h.container.read(sessionControllerProvider.notifier);
    expect(await tester.runAsync(controller.start), isTrue);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final start = events.firstWhere((e) => e.eventType == 'session_start');
    expect((jsonDecode(start.dataJson!) as Map)['precheck'], {
      'spraying': 'none',
      'platform': 'walk',
      'camera_height_m': 0.5,
      'notice': {'sign': true, 'badge': true},
    });
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('a planned visit records under its server id, once', (
    tester,
  ) async {
    const visitId = 'e1900000-0000-4000-8000-000000000001';
    final task = FieldTask(
      id: visitId,
      visitId: visitId,
      parcelId: periodicTask.parcelId,
      parcelName: periodicTask.parcelName,
      village: periodicTask.village,
      kind: VisitKind.periodic,
      season: Season.winter,
      areaDecare: 20,
    );
    final h = TestHarness();
    await h.logger.connect();
    final controller = h.container.read(sessionControllerProvider.notifier);
    controller.selectTask(task);
    await tester.runAsync(controller.start);
    await settle(tester);

    final state = h.container.read(sessionControllerProvider);
    expect(state.sessionId, visitId);
    expect(
      h.logger.receivedCommands.whereType<StartSession>().single.sessionId,
      visitId,
    );
    final repo = h.container.read(fieldRepositoryProvider);
    final session = await tester.runAsync(() => repo.session(visitId));
    expect(session!.taskId, visitId);

    // Stopped and finished, the same visit cannot be recorded again on this
    // phone (the logger would answer session_exists).
    await tester.runAsync(controller.stop);
    await tester.runAsync(controller.finish);
    controller.selectTask(task);
    final again = await tester.runAsync(controller.start);
    expect(again, isFalse);
    expect(
      h.container.read(sessionControllerProvider).error,
      'Bu ziyaret bu telefonda zaten kaydedildi',
    );
    expect(h.logger.receivedCommands.whereType<StartSession>(), hasLength(1));

    await h.dispose(tester);
  });

  testWidgets('kit alert shows a banner and plays once, again after 10 s', (
    tester,
  ) async {
    final h = await openSession(
      tester,
      inventory: false,
      kit: const KitStatus(),
    );
    final banner = find.byKey(const Key('kit-alert-banner'));
    expect(h.wakelock.enabled, isFalse);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    expect(h.wakelock.enabled, isTrue, reason: 'screen on while recording');
    expect(banner, findsNothing);
    expect(h.alertSound.count, 0);

    h.logger.kit = const KitStatus(
      lidarState: LidarState.lost,
      alerts: [KitAlert.lidarSilent],
    );
    await statusArrives(tester);
    expect(banner, findsOneWidget);
    expect(find.text('LiDAR veri göndermiyor'), findsOneWidget);
    expect(h.alertSound.count, 1);

    // The same alert, every second: no new sound before 10 s.
    for (var i = 0; i < 9; i++) {
      h.clock.advance(const Duration(seconds: 1));
      h.logger.tick();
      await statusArrives(tester);
    }
    expect(h.alertSound.count, 1);
    h.clock.advance(const Duration(seconds: 1));
    h.logger.tick();
    await statusArrives(tester);
    expect(h.alertSound.count, 2);

    // A second alert sounds right away; the banner lists both.
    h.logger.kit = const KitStatus(
      lidarState: LidarState.lost,
      alerts: [KitAlert.lidarSilent, KitAlert.clockUnlocked],
    );
    await statusArrives(tester);
    expect(h.alertSound.count, 3);
    expect(
      find.text("LiDAR veri göndermiyor · Saat GPS'e kilitli değil"),
      findsOneWidget,
    );

    // Gone when the alerts clear.
    h.logger.kit = const KitStatus();
    await statusArrives(tester);
    expect(banner, findsNothing);
    h.clock.advance(const Duration(seconds: 20));
    h.logger.tick();
    await statusArrives(tester);
    expect(h.alertSound.count, 3);

    await showQr(tester, 'session-start-qr');
    await showQr(tester, 'session-end-qr');
    await tapVisible(tester, find.byKey(const Key('session-stop')));
    await settle(tester);
    expect(h.wakelock.enabled, isFalse, reason: 'released after the stop');
    // The summary keeps what was seen.
    expect(
      find.text("LiDAR veri göndermiyor, Saat GPS'e kilitli değil"),
      findsOneWidget,
    );
    await h.dispose(tester);
  });

  testWidgets('alert of an overridden item shows but does not sound', (
    tester,
  ) async {
    // The PPS wire is not connected: the crew started without the clock.
    final h = await openSession(
      tester,
      inventory: false,
      kit: const KitStatus(
        clock: KitClock.coarse,
        precheckFail: [KitCheck.clock],
        alerts: [KitAlert.clockUnlocked],
      ),
    );
    h.container
        .read(sessionControllerProvider.notifier)
        .confirmPrecheck(
          spraying: SprayingCheck.none,
          platform: ScanPlatform.walk,
          cameraHeightM: 1.8,
          notice: const NoticeSign(sign: true, badge: true),
          kitOverrides: {KitCheck.clock},
        );
    final banner = find.byKey(const Key('kit-alert-banner'));
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    expect(h.logger.lastStatus!.status.kit!.overrides, [KitCheck.clock]);
    for (var i = 0; i < 30; i++) {
      h.clock.advance(const Duration(seconds: 1));
      h.logger.tick();
      await statusArrives(tester);
    }
    expect(banner, findsOneWidget);
    expect(find.text("Saat GPS'e kilitli değil"), findsOneWidget);
    expect(h.alertSound.count, 0);

    // Any other alert still sounds.
    h.logger.kit = const KitStatus(
      clock: KitClock.coarse,
      alerts: [KitAlert.clockUnlocked, KitAlert.ssdLow],
    );
    await statusArrives(tester);
    expect(h.alertSound.count, 1);

    await showQr(tester, 'session-start-qr');
    await showQr(tester, 'session-end-qr');
    await tapVisible(tester, find.byKey(const Key('session-stop')));
    await settle(tester);
    // The summary keeps the silenced alert.
    expect(
      find.text("Saat GPS'e kilitli değil, SSD'de yer azaldı"),
      findsOneWidget,
    );
    await h.dispose(tester);
  });

  testWidgets('ESP32 session shows no LiDAR line and plays no alert', (
    tester,
  ) async {
    final h = await openSession(tester, inventory: false);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    expect(h.wakelock.enabled, isTrue);
    expect(find.text('LiDAR'), findsNothing);
    expect(find.text('Batarya'), findsOneWidget);
    await showQr(tester, 'session-start-qr');
    await showQr(tester, 'session-end-qr');
    await tapVisible(tester, find.byKey(const Key('session-stop')));
    await settle(tester);
    expect(h.container.read(sessionControllerProvider).kitAtStop, isNull);
    expect(find.byKey(const Key('kit-summary')), findsNothing);
    expect(find.text('LiDAR'), findsNothing);
    expect(h.alertSound.count, 0);
    expect(h.wakelock.enabled, isFalse);
    await h.dispose(tester);
  });

  testWidgets('leaving the screen releases the screen', (tester) async {
    final h = await openSession(tester, inventory: false);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    expect(h.wakelock.enabled, isTrue);
    await tester.pumpWidget(h.wrap(const SizedBox()));
    await tester.pump();
    expect(h.wakelock.enabled, isFalse);
    await h.dispose(tester);
  });
}
