import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/features/checklist/precheck_screen.dart';
import 'package:orchados_field/features/checklist/scan_setup.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';
import 'package:orchados_field/features/notice/field_records.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

final periodicTask = FakeTaskRepository.sampleTasks[0];

/// Opens the pre-check with a connected logger and answers every item the
/// crew answers, so that only the logger items decide.
Future<TestHarness> openPrecheck(WidgetTester tester, {KitStatus? kit}) async {
  // Tall enough for the whole list: every item stays built.
  tester.view.physicalSize = const Size(1080, 9000);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
  final h = TestHarness(kit: kit);
  h.container.read(sessionControllerProvider.notifier).selectTask(periodicTask);
  await h.logger.connect();
  await tester.pumpWidget(h.wrap(const PrecheckScreen()));
  await settle(tester);
  await tapVisible(tester, find.byKey(const Key('check-lens')));
  await tapVisible(tester, find.byKey(const Key('check-camera')));
  await tapVisible(tester, find.byKey(const Key('check-spraying-none')));
  await tapVisible(tester, find.byKey(const Key('check-platform-walk')));
  await tester.enterText(find.byKey(const Key('check-camera-height')), '1,85');
  await tapVisible(tester, find.byKey(const Key('check-notice-sign-yes')));
  await tapVisible(tester, find.byKey(const Key('check-notice-badge-yes')));
  await tester.pump();
  return h;
}

FilledButton continueButton(WidgetTester tester) => tester.widget<FilledButton>(
  find.descendant(
    of: find.byKey(const Key('precheck-continue')),
    matching: find.byType(FilledButton),
  ),
);

bool switchOn(WidgetTester tester, KitCheck c) => tester
    .widget<SwitchListTile>(find.byKey(Key('kit-override-${c.code}')))
    .value;

void main() {
  testWidgets('ESP32: no kit section, the battery item stays', (tester) async {
    final h = await openPrecheck(tester);
    expect(find.byKey(const Key('check-battery')), findsOneWidget);
    expect(find.byKey(const Key('check-kit-lidar')), findsNothing);
    expect(find.text('SD kart'), findsOneWidget);
    expect(continueButton(tester).onPressed, isNotNull);
    await h.dispose(tester);
  });

  testWidgets('kit with failed clock shows the override switch and blocks '
      'start until confirmed', (tester) async {
    final h = await openPrecheck(
      tester,
      kit: const KitStatus(
        clock: KitClock.coarse,
        precheckFail: [KitCheck.clock],
      ),
    );
    expect(find.byKey(const Key('check-kit-lidar')), findsOneWidget);
    expect(find.byKey(const Key('check-kit-lidar_mode')), findsOneWidget);
    expect(find.byKey(const Key('check-kit-clock')), findsOneWidget);
    expect(find.text('64 bin nokta/sn'), findsOneWidget);
    expect(find.text('Kaba (PPS yok)'), findsOneWidget);
    expect(find.text('SSD'), findsOneWidget);
    // Only the failed item can be overridden.
    expect(find.byKey(const Key('kit-override-clock')), findsOneWidget);
    expect(find.byKey(const Key('kit-override-lidar')), findsNothing);
    expect(continueButton(tester).onPressed, isNull);

    // "Vazgeç" leaves it off.
    await tapVisible(tester, find.byKey(const Key('kit-override-clock')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        "Saat GPS'e kilitli değil. Zaman eşlemesi kaba olacak. "
        'Yine de başlatılsın mı?',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Vazgeç'));
    await tester.pumpAndSettle();
    expect(switchOn(tester, KitCheck.clock), isFalse);
    expect(continueButton(tester).onPressed, isNull);

    await tapVisible(tester, find.byKey(const Key('kit-override-clock')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('kit-override-confirm')));
    await tester.pumpAndSettle();
    expect(switchOn(tester, KitCheck.clock), isTrue);
    expect(continueButton(tester).onPressed, isNotNull);

    // Switching it off again needs no confirmation.
    await tapVisible(tester, find.byKey(const Key('kit-override-clock')));
    await tester.pumpAndSettle();
    expect(switchOn(tester, KitCheck.clock), isFalse);
    expect(continueButton(tester).onPressed, isNull);
    await h.dispose(tester);
  });

  testWidgets('every overridable item has its own question', (tester) async {
    final h = await openPrecheck(
      tester,
      kit: const KitStatus(
        lidarState: LidarState.neverSeen,
        lidarPointsPerS: 0,
        lidarMode: LidarMode.wrong,
        precheckFail: [KitCheck.lidar, KitCheck.lidarMode],
      ),
    );
    expect(find.text('Veri yok'), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('kit-override-lidar')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'LiDAR kaydı olmadan başlatılsın mı? Bu taramada nokta bulutu '
        'olmayacak.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('kit-override-confirm')));
    await tester.pumpAndSettle();
    expect(continueButton(tester).onPressed, isNull, reason: 'mode left');
    await tapVisible(tester, find.byKey(const Key('kit-override-lidar_mode')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'LiDAR kipi doğrulanamadı. Gövdenin alt kısmı kaydedilmeyebilir. '
        'Yine de başlatılsın mı?',
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('kit-override-confirm')));
    await tester.pumpAndSettle();
    expect(continueButton(tester).onPressed, isNotNull);
    await h.dispose(tester);
  });

  testWidgets('failed SSD has no override', (tester) async {
    final h = await openPrecheck(
      tester,
      kit: const KitStatus(precheckFail: [KitCheck.ssd]),
    );
    expect(find.text('Yine de başlat'), findsNothing);
    expect(continueButton(tester).onPressed, isNull);

    // Neither has the receiver.
    h.logger.kit = const KitStatus(precheckFail: [KitCheck.gnss]);
    await tester.pump();
    await tester.pump();
    expect(find.text('Alıcıdan veri gelmiyor'), findsOneWidget);
    expect(find.text('Yine de başlat'), findsNothing);
    expect(continueButton(tester).onPressed, isNull);

    h.logger.kit = const KitStatus();
    await tester.pump();
    expect(continueButton(tester).onPressed, isNotNull);
    await h.dispose(tester);
  });

  testWidgets('kit skips the battery item', (tester) async {
    final h = await openPrecheck(tester, kit: const KitStatus());
    expect(h.logger.status.batteryMv, 0);
    expect(find.byKey(const Key('check-battery')), findsNothing);
    expect(continueButton(tester).onPressed, isNotNull);

    // The same 0 V from an ESP32 blocks the scan.
    h.logger.kit = null;
    await tester.pump();
    expect(find.byKey(const Key('check-battery')), findsOneWidget);
    expect(continueButton(tester).onPressed, isNull);
    await h.dispose(tester);
  });

  testWidgets('override goes to the logger and the start event', (
    tester,
  ) async {
    final h = await openPrecheck(
      tester,
      kit: const KitStatus(
        clock: KitClock.unlocked,
        precheckFail: [KitCheck.clock],
      ),
    );
    await tapVisible(tester, find.byKey(const Key('kit-override-clock')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('kit-override-confirm')));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    expect(find.byType(SessionScreen), findsOneWidget);

    final controller = h.container.read(sessionControllerProvider.notifier);
    expect(await tester.runAsync(controller.start), isTrue);
    final start = h.logger.receivedCommands.single as StartSession;
    expect(start.overrideMask, 0x04);
    expect(start.encode().last, 0x04);
    expect(h.logger.lastStatus!.status.kit!.overrides, [KitCheck.clock]);
    // The skipped item stays on the recording screen.
    await settle(tester);
    expect(find.byKey(const Key('gnss-panel-overrides')), findsOneWidget);
    expect(find.text('Saat (PPS)'), findsOneWidget);
    expect(find.text('Batarya'), findsNothing);
    expect(find.text('SSD'), findsOneWidget);

    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final event = events.firstWhere((e) => e.eventType == 'session_start');
    // The payload stays the parcel id; the pipeline checks it.
    expect(event.payload, 'parcel_id=${periodicTask.parcelId}');
    final precheck = (jsonDecode(event.dataJson!) as Map)['precheck'] as Map;
    expect(precheck['kit_overrides'], ['clock']);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  /// Overrides the clock on the pre-check, then the clock locks before the
  /// start.
  Future<TestHarness> overrideClockThenLock(WidgetTester tester) async {
    final h = await openPrecheck(
      tester,
      kit: const KitStatus(
        clock: KitClock.unlocked,
        precheckFail: [KitCheck.clock],
      ),
    );
    await tapVisible(tester, find.byKey(const Key('kit-override-clock')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('kit-override-confirm')));
    await tester.pumpAndSettle();
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    h.logger.kit = const KitStatus();
    await tester.pump();
    expect(h.logger.lastStatus!.status.kit!.precheckFail, isEmpty);
    return h;
  }

  Future<Map<String, Object?>?> startPrecheck(
    WidgetTester tester,
    TestHarness h,
  ) async {
    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final event = events.firstWhere((e) => e.eventType == 'session_start');
    return (jsonDecode(event.dataJson!) as Map)['precheck']
        as Map<String, Object?>?;
  }

  testWidgets('a confirmed override goes even if the item passes now', (
    tester,
  ) async {
    final h = await overrideClockThenLock(tester);
    // The kit evaluates afresh at the start: the clock has lost PPS again.
    h.logger.kitAtStart = const KitStatus(
      clock: KitClock.coarse,
      precheckFail: [KitCheck.clock],
    );
    final controller = h.container.read(sessionControllerProvider.notifier);
    expect(await tester.runAsync(controller.start), isTrue);
    final start = h.logger.receivedCommands.single as StartSession;
    expect(start.overrideMask, 0x04);
    expect(h.logger.lastStatus!.status.kit!.overrides, [KitCheck.clock]);
    expect((await startPrecheck(tester, h))!['kit_overrides'], ['clock']);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('an override the kit does not need is not recorded', (
    tester,
  ) async {
    final h = await overrideClockThenLock(tester);
    final controller = h.container.read(sessionControllerProvider.notifier);
    expect(await tester.runAsync(controller.start), isTrue);
    final start = h.logger.receivedCommands.single as StartSession;
    expect(start.overrideMask, 0x04);
    // The kit applies only failing items.
    expect(h.logger.lastStatus!.status.kit!.overrides, isEmpty);
    final precheck = (await startPrecheck(tester, h))!;
    expect(precheck.containsKey('kit_overrides'), isFalse);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('ESP32 start sends no override byte', (tester) async {
    final h = await openPrecheck(tester);
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    final controller = h.container.read(sessionControllerProvider.notifier);
    // Even with an override left from a kit pre-check.
    controller.confirmPrecheck(
      spraying: SprayingCheck.none,
      platform: ScanPlatform.walk,
      cameraHeightM: 1.8,
      notice: const NoticeSign(sign: true, badge: true),
      kitOverrides: {KitCheck.clock},
    );
    expect(await tester.runAsync(controller.start), isTrue);
    final start = h.logger.receivedCommands.single as StartSession;
    // The ESP32 would answer malformed to the extra byte.
    expect(start.overrideMask, isNull);
    final precheck = (await startPrecheck(tester, h))!;
    expect(precheck.containsKey('kit_overrides'), isFalse);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('no kit_overrides without an override', (tester) async {
    final h = await openPrecheck(tester, kit: const KitStatus());
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    final controller = h.container.read(sessionControllerProvider.notifier);
    expect(await tester.runAsync(controller.start), isTrue);
    final start = h.logger.receivedCommands.single as StartSession;
    expect(start.overrideMask, isNull);
    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final event = events.firstWhere((e) => e.eventType == 'session_start');
    final precheck = (jsonDecode(event.dataJson!) as Map)['precheck'] as Map;
    expect(precheck.containsKey('kit_overrides'), isFalse);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('a pre-check failing after the check names the item', (
    tester,
  ) async {
    final h = await openPrecheck(tester, kit: const KitStatus());
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    h.logger.kit = const KitStatus(
      lidarState: LidarState.lost,
      precheckFail: [KitCheck.lidar],
    );
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    expect(
      find.text('Kayıt başlamadı: Ön kontrol geçmedi (LiDAR)'),
      findsOneWidget,
    );
    expect(
      h.container.read(sessionControllerProvider).phase,
      SessionPhase.idle,
    );
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  test('fake kit logger keeps healthy defaults', () {
    final logger = FakeGnssLogger(kit: const KitStatus());
    expect(logger.status.batteryMv, 0);
    expect(logger.kit!.precheckFail, isEmpty);
  });
}
