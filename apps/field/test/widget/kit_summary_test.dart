import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/checklist/scan_setup.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';
import 'package:orchados_field/features/notice/field_records.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/summary/kit_summary.dart';
import 'package:orchados_field/features/summary/visit_summary_screen.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

final periodicTask = FakeTaskRepository.sampleTasks[0];

/// Records a periodic visit on [h] up to the stop; [during] runs while
/// recording.
Future<void> recordAndStop(
  WidgetTester tester,
  TestHarness h, {
  required void Function() during,
  Set<KitCheck> overrides = const {},
}) async {
  final controller = h.container.read(sessionControllerProvider.notifier);
  controller.selectTask(periodicTask);
  if (overrides.isNotEmpty) {
    controller.confirmPrecheck(
      spraying: SprayingCheck.none,
      platform: ScanPlatform.walk,
      cameraHeightM: 1.8,
      notice: const NoticeSign(sign: true, badge: true),
      kitOverrides: overrides,
    );
  }
  await h.logger.connect();
  await tester.pumpWidget(h.wrap(const SessionScreen()));
  await tester.pump();
  expect(await tester.runAsync(controller.start), isTrue);
  await settle(tester);
  during();
  await tester.pump();
  for (final key in ['session-start-qr', 'session-end-qr']) {
    await tapVisible(tester, find.byKey(Key(key)));
    await settle(tester);
    await tester.tap(find.text('Tamam'));
    await tester.pumpAndSettle();
  }
  await tapVisible(tester, find.byKey(const Key('session-stop')));
  await settle(tester);
  expect(
    h.container.read(sessionControllerProvider).phase,
    SessionPhase.stopped,
  );
}

void main() {
  test('LiDAR summary text', () {
    expect(
      lidarSummaryLabel(
        const KitStatus(
          lidarGapCount: 2,
          lidarLongestGapS: 4,
          lidarWrittenMib: 900,
        ),
      ),
      'veri var, 2 boşluk (en uzun 4 sn), 900 MiB',
    );
    expect(
      lidarSummaryLabel(const KitStatus(lidarWrittenMib: 12)),
      'veri var, boşluk yok, 12 MiB',
    );
    expect(lidarSummaryLabel(const KitStatus()), 'veri yok');
  });

  testWidgets('summary shows LiDAR gaps', (tester) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness(kit: const KitStatus());
    await recordAndStop(
      tester,
      h,
      during: () => h.logger.kit = const KitStatus(
        lidarGapCount: 2,
        lidarLongestGapS: 4,
        lidarWrittenMib: 900,
      ),
    );
    const line = 'veri var, 2 boşluk (en uzun 4 sn), 900 MiB';
    // On the recording screen right after the stop …
    expect(find.text(line), findsOneWidget);
    // … and on the visit summary.
    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    expect(find.text('LiDAR'), findsOneWidget);
    expect(find.text(line), findsOneWidget);
    expect(find.text('Atlanan'), findsNothing);
    await h.dispose(tester);
  });

  testWidgets('summary names the skipped items', (tester) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness(
      kit: const KitStatus(
        lidarState: LidarState.neverSeen,
        lidarPointsPerS: 0,
        clock: KitClock.unlocked,
        precheckFail: [KitCheck.lidar, KitCheck.clock],
      ),
    );
    await recordAndStop(
      tester,
      h,
      during: () {},
      overrides: {KitCheck.lidar, KitCheck.clock},
    );
    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    expect(find.text('veri yok'), findsOneWidget);
    expect(find.text('LiDAR, Saat'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('ESP32 summary has no LiDAR line', (tester) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    await recordAndStop(tester, h, during: () {});
    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    expect(find.byKey(const Key('summary-card')), findsOneWidget);
    expect(find.text('LiDAR'), findsNothing);
    await h.dispose(tester);
  });
}
