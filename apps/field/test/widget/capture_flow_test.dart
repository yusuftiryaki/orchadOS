import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/media/field_camera.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/core/quality/quality_config.dart';
import 'package:orchados_field/features/camera/capture_screen.dart';
import 'package:orchados_field/features/closeup/closeup_protocol.dart';
import 'package:orchados_field/features/closeup/tree_observation_screen.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

void main() {
  final task = FakeTaskRepository.sampleTasks[0];
  final tree = task.closeupTrees.first;
  final protocol = CloseupProtocol.forSeason(task.season);

  /// The tree form of a stopped session, with the fake camera scripted.
  Future<TestHarness> treeForm(
    WidgetTester tester, {
    List<SyntheticPhotoKind> photos = const [],
    CameraOpenResult open = CameraOpenResult.ready,
    bool gpsTime = true,
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness(
      photos: photos,
      cameraOpenResult: open,
      provideGpsTime: gpsTime,
    );
    final controller = h.container.read(sessionControllerProvider.notifier);
    controller.selectTask(task);
    await tester.runAsync(() async {
      await h.logger.connect();
      expect(await controller.start(), isTrue);
      expect(await controller.stop(), isTrue);
      // Let a few status messages feed the GPS clock.
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pumpWidget(h.wrap(TreeObservationScreen(tree: tree)));
    await settle(tester);
    return h;
  }

  Future<void> saveTree(WidgetTester tester) async {
    for (final q in protocol.questions) {
      await tapVisible(tester, find.byKey(Key('q-${q.metricCode}-false')));
      await tester.pump();
    }
    await tapVisible(tester, find.byKey(const Key('tree-save')));
    await settle(tester);
    await tester.pumpAndSettle();
  }

  testWidgets('camera screen: reference slot, hint, focus tap, flash-free', (
    tester,
  ) async {
    final h = await treeForm(tester);
    await tapVisible(tester, find.byKey(const Key('shot-trunk')));
    await tester.pumpAndSettle();

    expect(find.byType(CaptureScreen), findsOneWidget);
    expect(h.camera.isOpen, isTrue);
    expect(find.byKey(const Key('fake-camera-preview')), findsOneWidget);
    expect(find.byKey(const Key('reference-placeholder')), findsOneWidget);
    expect(
      find.text('Böyle çek: ${protocol.shots.first.hint}'),
      findsOneWidget,
    );
    // No gallery path on the camera screen either.
    expect(find.byIcon(Icons.photo_library), findsNothing);
    expect(find.textContaining('Galeri'), findsNothing);

    final preview = find.byKey(const Key('camera-preview'));
    final box = tester.getRect(preview);
    await tester.tapAt(box.topLeft + Offset(box.width / 4, box.height / 2));
    await tester.pump();
    expect(find.byKey(const Key('focus-indicator')), findsOneWidget);
    final p = h.camera.focusPoints.single;
    expect(p.dx, closeTo(0.25, 0.01));
    expect(p.dy, closeTo(0.5, 0.01));

    // Back without a photo: nothing taken, nothing stored, camera released.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(TreeObservationScreen), findsOneWidget);
    expect(h.camera.isOpen, isFalse);
    expect(h.media.files, isEmpty);
    await h.dispose(tester);
  });

  testWidgets('a rejected photo is not stored; retake, then accept', (
    tester,
  ) async {
    final h = await treeForm(
      tester,
      photos: [SyntheticPhotoKind.blurry, SyntheticPhotoKind.dark],
    );
    await shoot(tester, 'trunk');
    expect(find.byKey(const Key('review-verdict-reject')), findsOneWidget);
    expect(
      find.text('Fotoğraf bulanık. Telefonu sabit tutup tekrar çekin.'),
      findsOneWidget,
    );
    // Only "Yeniden çek" is offered.
    expect(find.byKey(const Key('review-use')), findsNothing);
    expect(h.media.files, isEmpty);

    await tester.tap(find.byKey(const Key('review-retake')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('camera-shutter')));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('review-verdict-reject')), findsOneWidget);
    expect(find.textContaining('karanlık'), findsOneWidget);
    expect(find.byKey(const Key('review-use')), findsNothing);

    await tester.tap(find.byKey(const Key('review-retake')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('camera-shutter')));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('review-verdict-accept')), findsOneWidget);
    expect(find.text('Fotoğraf iyi'), findsOneWidget);
    await tester.tap(find.byKey(const Key('review-use')));
    await tester.pumpAndSettle();
    await settle(tester);

    expect(find.byType(TreeObservationScreen), findsOneWidget);
    expect(h.camera.count, 3);
    // Only the accepted photo was written.
    expect(h.media.files, hasLength(1));
    expect(h.camera.isOpen, isFalse);
    await h.dispose(tester);
  });

  testWidgets('a warning can be accepted and is recorded', (tester) async {
    final h = await treeForm(
      tester,
      photos: [SyntheticPhotoKind.soft, SyntheticPhotoKind.dim],
      gpsTime: false,
    );
    await shoot(tester, 'trunk');
    expect(find.byKey(const Key('review-verdict-warn')), findsOneWidget);
    expect(find.textContaining('biraz bulanık'), findsOneWidget);
    await tester.tap(find.byKey(const Key('review-use')));
    await tester.pumpAndSettle();
    await settle(tester);
    expect(find.textContaining('Çekildi (uyarıyla)'), findsOneWidget);

    await shoot(tester, 'cuts');
    expect(find.byKey(const Key('review-verdict-warn')), findsOneWidget);
    expect(find.textContaining('biraz karanlık'), findsOneWidget);
    await tester.tap(find.byKey(const Key('review-use')));
    await tester.pumpAndSettle();
    await settle(tester);
    await saveTree(tester);

    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final captures = (await tester.runAsync(() => repo.captures(sessionId)))!;
    final byShot = {for (final c in captures) c.shotCode: c};
    final trunk = byShot['trunk']!;
    expect(trunk.qcVerdict, 'warn');
    expect(trunk.qcFindings, 'blurry:warn');
    expect(trunk.qcVersion, photoQualityCheckVersion);
    expect(trunk.qcSharpness, inExclusiveRange(60, 250));
    expect(trunk.qcBrightness, greaterThan(65));
    expect(trunk.sha256, sha256Hex(h.media.files[trunk.localPath]!));
    // No GPS time from the logger: the phone clock is used and marked.
    expect(trunk.timeSource, 'phone');
    expect(byShot['cuts']!.qcFindings, startsWith('tooDark:warn'));
    await h.dispose(tester);
  });

  testWidgets('capture time comes from the GPS clock', (tester) async {
    final h = await treeForm(tester);
    await shootAndUse(tester, 'trunk');
    await shootAndUse(tester, 'cuts');
    await saveTree(tester);
    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final captures = (await tester.runAsync(() => repo.captures(sessionId)))!;
    expect(captures, hasLength(2));
    for (final c in captures) {
      expect(c.timeSource, 'gps');
      expect(c.qcVerdict, 'accept');
      expect(c.qcFindings, '');
      expect(c.capturedAt, h.clock.now());
    }
    await h.dispose(tester);
  });

  testWidgets('permission denied, then granted on retry', (tester) async {
    final h = await treeForm(tester, open: CameraOpenResult.permissionDenied);
    await tapVisible(tester, find.byKey(const Key('shot-trunk')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('camera-unavailable')), findsOneWidget);
    expect(find.textContaining('kamera izni gerekli'), findsOneWidget);
    expect(find.byKey(const Key('camera-settings')), findsNothing);
    expect(find.byKey(const Key('camera-shutter')), findsNothing);

    h.camera.openResult = CameraOpenResult.ready;
    await tester.tap(find.byKey(const Key('camera-retry')));
    await tester.pumpAndSettle();
    expect(h.camera.openCount, 2);
    expect(find.byKey(const Key('camera-shutter')), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('permission blocked: directs to the settings', (tester) async {
    final h = await treeForm(tester, open: CameraOpenResult.permissionBlocked);
    await tapVisible(tester, find.byKey(const Key('shot-trunk')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Ayarlar → İzinler → Kamera'), findsOneWidget);
    await tester.tap(find.byKey(const Key('camera-settings')));
    await tester.pump();
    expect(h.camera.settingsOpened, 1);

    // Back from the settings with the permission granted.
    h.camera.openResult = CameraOpenResult.ready;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('camera-shutter')), findsOneWidget);

    // Going to the background releases the camera; returning reopens it.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    expect(h.camera.isOpen, isFalse);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(h.camera.isOpen, isTrue);
    expect(find.byKey(const Key('camera-shutter')), findsOneWidget);
    await h.dispose(tester);
  });
}
