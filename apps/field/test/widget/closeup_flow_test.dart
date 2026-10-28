import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/db/field_repository.dart';
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

  Future<void> answer(WidgetTester tester, String metric, String choice) async {
    await tapVisible(tester, find.byKey(Key('q-$metric-$choice')));
    await tester.pump();
  }

  FilledButton saveButton(WidgetTester tester) => tester.widget<FilledButton>(
    find.descendant(
      of: find.byKey(const Key('tree-save')),
      matching: find.byType(FilledButton),
    ),
  );

  Future<void> save(WidgetTester tester) async {
    await tapVisible(tester, find.byKey(const Key('tree-save')));
    await settle(tester);
    await tester.pump(const Duration(milliseconds: 500));
    await settle(tester);
  }

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
    // Every shot shows its "böyle çek" drawing; questions keep a slot.
    for (final s in protocol.shots) {
      expect(
        find.byKey(Key('reference-drawing:${s.referenceImage}')),
        findsOneWidget,
      );
    }
    expect(find.byType(SvgPicture), findsNWidgets(protocol.shots.length));
    expect(
      find.byKey(const Key('reference-placeholder')),
      findsNWidgets(protocol.questions.length),
    );
    // Every question offers "Göremedim".
    for (final q in protocol.questions) {
      expect(find.byKey(Key('q-${q.metricCode}-unseen')), findsOneWidget);
    }
    // No way to pick from the gallery.
    expect(find.textContaining('Galeri'), findsNothing);
    expect(find.byIcon(Icons.photo_library), findsNothing);

    // The crown drawing opens in full and closes.
    await tapVisible(
      tester,
      find.byKey(const Key('reference-drawing:assets/reference/T.svg')),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reference-full')), findsOneWidget);
    await tester.tap(find.byKey(const Key('reference-close')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reference-full')), findsNothing);

    // Answers: yes, a category, "Göremedim", no.
    await answer(tester, 'trunk_damage_present', 'true');
    await answer(tester, 'basal_sprout_level', 'dense');
    // A second tap on another category replaces the first.
    await answer(tester, 'basal_sprout_level', 'few');
    await answer(tester, 'fresh_cut_present', 'false');
    await answer(tester, 'dead_scaffold_present', 'false');
    await answer(tester, 'gum_present', 'unseen');
    // Answers alone are not enough: required photos are missing.
    expect(saveButton(tester).onPressed, isNull);

    await shootAndUse(tester, 'T');
    // Retake: the first photo is replaced and its file dropped.
    await shootAndUse(tester, 'T');
    expect(find.text('Yeniden çek'), findsOneWidget);
    await shootAndUse(tester, 'K2');
    expect(saveButton(tester).onPressed, isNull);
    await shootAndUse(tester, 'K3');
    expect(h.camera.count, 4);
    expect(h.media.files.length, 3);
    expect(saveButton(tester).onPressed, isNotNull);

    await save(tester);
    expect(find.byType(CloseupListScreen), findsOneWidget);
    expect(find.text('2 ağaç kaldı (3 ağaçtan)'), findsOneWidget);

    // Database: three captures with the hashes of the stored bytes, one
    // staff measurement per seen answer.
    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final captures = (await tester.runAsync(() => repo.captures(sessionId)))!;
    expect(captures.map((c) => c.shotCode), unorderedEquals(['T', 'K2', 'K3']));
    for (final c in captures) {
      expect(c.sha256, sha256Hex(h.media.files[c.localPath]!));
      expect(c.subjectId, 't-0512');
      expect(c.slotCode, 'S5-12');
      expect(c.qcVerdict, 'accept');
    }
    final measurements = (await tester.runAsync(
      () => repo.measurements(sessionId),
    ))!;
    expect(measurements, hasLength(protocol.questions.length - 1));
    expect(measurements.every((m) => m.source == 'staff'), isTrue);
    expect(measurements.every((m) => m.methodVersion == 'winter-v0.1'), isTrue);
    final byMetric = {for (final m in measurements) m.metricCode: m};
    expect(byMetric['trunk_damage_present']!.valueBoolean, isTrue);
    expect(byMetric['fresh_cut_present']!.valueBoolean, isFalse);
    expect(byMetric['basal_sprout_level']!.valueText, 'few');
    expect(byMetric['basal_sprout_level']!.valueBoolean, isNull);
    // "Göremedim" writes no measurement...
    expect(byMetric.containsKey('gum_present'), isFalse);
    expect(
      jsonDecode(byMetric['fresh_cut_present']!.evidenceJson),
      unorderedEquals(captures.map((c) => c.sha256)),
    );
    // ...but a session event that reaches the server.
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final unseen = events.singleWhere((e) => e.eventType == closeupUnseenEvent);
    expect(unseen.payload, 'S5-12');
    final data = jsonDecode(unseen.dataJson!) as Map;
    expect(data['tree_id'], 't-0512');
    expect(data['method_version'], 'winter-v0.1');
    expect(data['metric_codes'], ['gum_present']);
    expect(data['evidence'], unorderedEquals(captures.map((c) => c.sha256)));
    final queued = (await tester.runAsync(repo.outbox.pending))!;
    expect(
      queued.where((e) => e.entityType == OutboxEntity.capture),
      hasLength(3),
    );
    expect(
      queued.where((e) => e.entityType == OutboxEntity.measurement),
      hasLength(4),
    );
    expect(
      queued.where(
        (e) =>
            e.entityType == OutboxEntity.sessionEvent &&
            e.entityId == unseen.id,
      ),
      hasLength(1),
    );

    // Summary.
    await tapVisible(tester, find.byKey(const Key('closeup-finish')));
    await settle(tester);
    await tester.pump(const Duration(milliseconds: 500));
    await settle(tester);
    expect(find.byType(VisitSummaryScreen), findsOneWidget);
    expect(find.text('1 / 3'), findsOneWidget);
    // The oral notice answer comes first (H01).
    FilledButton finish() => tester.widget<FilledButton>(
      find.descendant(
        of: find.byKey(const Key('summary-finish')),
        matching: find.byType(FilledButton),
      ),
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('summary-finish')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(finish().onPressed, isNull);
    await tapVisible(tester, find.byKey(const Key('verbal-notice-nobody')));
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('verbal-notice-save')));
    await settle(tester);
    expect(find.byKey(const Key('verbal-notice-saved')), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('summary-finish')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(finish().onPressed, isNotNull);
    await tapVisible(tester, find.byKey(const Key('summary-finish')));
    await settle(tester);
    expect(h.container.read(completedTasksProvider), contains(task.id));
    final session = await tester.runAsync(() => repo.session(sessionId));
    expect(session!.status, 'closed');

    await h.dispose(tester);
  });

  testWidgets('winter dead check: opened, it is required; closed, dropped', (
    tester,
  ) async {
    final h = await stoppedSession(tester);
    await tester.pumpWidget(h.wrap(const CloseupListScreen()));
    await settle(tester);
    await tester.tap(find.byKey(const Key('tree-t-0703')));
    await tester.pumpAndSettle();

    // Everything "Göremedim" is a complete set of answers.
    for (final q in protocol.questions) {
      await answer(tester, q.metricCode, 'unseen');
    }
    for (final s in protocol.shots) {
      await shootAndUse(tester, s.code);
    }
    expect(saveButton(tester).onPressed, isNotNull);

    // The dead check is closed by default.
    expect(find.byKey(const Key('shot-K4_1')), findsNothing);
    await tapVisible(tester, find.byKey(const Key('extra-dead_check')));
    await tester.pumpAndSettle();
    final extra = protocol.extra!;
    for (final s in extra.shots) {
      expect(find.byKey(Key('shot-${s.code}')), findsOneWidget);
      expect(s.referenceImage, 'assets/reference/K4.svg');
    }
    expect(saveButton(tester).onPressed, isNull);
    await shootAndUse(tester, 'K4_1');
    await answer(tester, 'dead_test_no_buds', 'true');
    expect(h.media.files, hasLength(4));

    // Closing drops its photo and answer.
    await tapVisible(tester, find.byKey(const Key('extra-dead_check')));
    await tester.pumpAndSettle();
    await settle(tester);
    expect(h.media.files, hasLength(3));
    expect(saveButton(tester).onPressed, isNotNull);

    // Open again: all three branches and the three tests are needed.
    await tapVisible(tester, find.byKey(const Key('extra-dead_check')));
    await tester.pumpAndSettle();
    for (final s in extra.shots) {
      await shootAndUse(tester, s.code);
    }
    await answer(tester, 'dead_test_no_buds', 'true');
    await answer(tester, 'dead_test_snaps', 'true');
    expect(saveButton(tester).onPressed, isNull);
    await answer(tester, 'dead_test_brown_cambium', 'unseen');
    expect(saveButton(tester).onPressed, isNotNull);
    await save(tester);
    // A tree with only "Göremedim" seen answers still counts as done.
    expect(find.text('2 ağaç kaldı (3 ağaçtan)'), findsOneWidget);

    final repo = h.container.read(fieldRepositoryProvider);
    final sessionId = h.container.read(sessionControllerProvider).sessionId!;
    final captures = (await tester.runAsync(() => repo.captures(sessionId)))!;
    expect(
      captures.map((c) => c.shotCode),
      unorderedEquals(['T', 'K2', 'K3', 'K4_1', 'K4_2', 'K4_3']),
    );
    final measurements = (await tester.runAsync(
      () => repo.measurements(sessionId),
    ))!;
    expect(
      {for (final m in measurements) m.metricCode: m.valueBoolean},
      {'dead_test_no_buds': true, 'dead_test_snaps': true},
    );
    final events = (await tester.runAsync(() => repo.events(sessionId)))!;
    final unseen = events.singleWhere((e) => e.eventType == closeupUnseenEvent);
    expect((jsonDecode(unseen.dataJson!) as Map)['metric_codes'], [
      ...protocol.questions.map((q) => q.metricCode),
      'dead_test_brown_cambium',
    ]);
    await h.dispose(tester);
  });
}
