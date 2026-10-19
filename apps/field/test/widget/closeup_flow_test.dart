import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/features/closeup/closeup_list_screen.dart';
import 'package:orchados_field/features/closeup/closeup_protocol.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/summary/visit_summary_screen.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

void main() {
  final task = FakeTaskRepository.sampleTasks[0];
  final protocol = CloseupProtocol.forSeason(task.season);

  /// A stopped session on the periodic task, ready for close-ups.
  Future<TestHarness> stoppedSession(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    final controller = h.container.read(sessionControllerProvider.notifier);
    controller.selectTask(task);
    await tester.runAsync(() async {
      await h.logger.connect();
      expect(await controller.start(), isTrue);
      expect(await controller.stop(), isTrue);
    });
    return h;
  }

  Future<void> answerAll(WidgetTester tester, {required bool value}) async {
    for (final q in protocol.questions) {
      await tapVisible(tester, find.byKey(Key('q-${q.metricCode}-$value')));
      await tester.pump();
    }
  }

  FilledButton saveButton(WidgetTester tester) => tester.widget<FilledButton>(
    find.descendant(
      of: find.byKey(const Key('tree-save')),
      matching: find.byType(FilledButton),
    ),
  );

  testWidgets('photos and answers for a tree, then the summary', (
    tester,
  ) async {
    final h = await stoppedSession(tester);
    await tester.pumpWidget(h.wrap(const CloseupListScreen()));
    await settle(tester);
    expect(find.text('3 ağaç kaldı (3 ağaçtan)'), findsOneWidget);

    await tester.tap(find.byKey(const Key('tree-t-0512')));
    await tester.pumpAndSettle();
    expect(find.text('Ağaç S5-12'), findsOneWidget);
    // Every shot and question has a reference picture slot.
    expect(
      find.byKey(const Key('reference-placeholder')),
      findsNWidgets(protocol.shots.length + protocol.questions.length),
    );
    // No way to pick from the gallery.
    expect(find.textContaining('Galeri'), findsNothing);
    expect(find.byIcon(Icons.photo_library), findsNothing);

    // Answers alone are not enough: required photos are missing.
    await answerAll(tester, value: false);
    expect(saveButton(tester).onPressed, isNull);

    await shootAndUse(tester, 'trunk');
    // Retake: the first photo is replaced and its file dropped.
    await shootAndUse(tester, 'trunk');
    expect(find.text('Yeniden çek'), findsOneWidget);
    expect(saveButton(tester).onPressed, isNull);
    await shootAndUse(tester, 'cuts');
    expect(h.camera.count, 3);
    expect(h.media.files.length, 2);

    // Change one answer to "yes".
    await tapVisible(
      tester,
      find.byKey(const Key('q-dead_branch_present-true')),
    );
    await tester.pump();
    expect(saveButton(tester).onPressed, isNotNull);

    await tapVisible(tester, find.byKey(const Key('tree-save')));
    await settle(tester);
    await tester.pump(const Duration(milliseconds: 500));
    await settle(tester);
    expect(find.byType(CloseupListScreen), findsOneWidget);
    expect(find.text('2 ağaç kaldı (3 ağaçtan)'), findsOneWidget);

    // Database: two captures with the hashes of the stored bytes, one
    // measurement per question with source "staff".
    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final captures = (await tester.runAsync(() => repo.captures(sessionId)))!;
    expect(captures.map((c) => c.shotCode), unorderedEquals(['trunk', 'cuts']));
    for (final c in captures) {
      expect(c.sha256, sha256Hex(h.media.files[c.localPath]!));
      expect(c.subjectId, 't-0512');
      expect(c.slotCode, 'S5-12');
      expect(c.qcVerdict, 'accept');
    }
    final measurements = (await tester.runAsync(
      () => repo.measurements(sessionId),
    ))!;
    expect(measurements, hasLength(protocol.questions.length));
    expect(measurements.every((m) => m.source == 'staff'), isTrue);
    final byMetric = {for (final m in measurements) m.metricCode: m};
    expect(byMetric['dead_branch_present']!.valueBool, isTrue);
    expect(byMetric['pruned']!.valueBool, isFalse);
    expect(
      jsonDecode(byMetric['pruned']!.evidenceJson),
      unorderedEquals(captures.map((c) => c.sha256)),
    );
    final queued = (await tester.runAsync(repo.outbox.pending))!;
    expect(
      queued.where((e) => e.entityType == OutboxEntity.capture),
      hasLength(2),
    );
    expect(
      queued.where((e) => e.entityType == OutboxEntity.measurement),
      hasLength(4),
    );

    // Summary.
    await tapVisible(tester, find.byKey(const Key('closeup-finish')));
    await settle(tester);
    await tester.pump(const Duration(milliseconds: 500));
    await settle(tester);
    expect(find.byType(VisitSummaryScreen), findsOneWidget);
    expect(find.text('1 / 3'), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('summary-finish')));
    await settle(tester);
    expect(h.container.read(completedTasksProvider), contains(task.id));
    final session = await tester.runAsync(() => repo.session(sessionId));
    expect(session!.status, 'closed');

    await h.dispose(tester);
  });
}
