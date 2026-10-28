import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/features/boundary/boundary_screen.dart';
import 'package:orchados_field/features/checklist/precheck_screen.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/notice/field_records.dart';
import 'package:orchados_field/features/notice/notice_widgets.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/summary/visit_log.dart';
import 'package:orchados_field/features/summary/visit_summary_screen.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:orchados_field/features/tasks/today_screen.dart';

import '../support/test_app.dart';

void main() {
  final inventory = FakeTaskRepository.sampleTasks[1];

  void tallView(WidgetTester tester) {
    tester.view.physicalSize = const Size(1080, 10000);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
  }

  /// A recording inventory session on the session screen.
  Future<TestHarness> recording(WidgetTester tester) async {
    tallView(tester);
    final h = TestHarness();
    h.container.read(sessionControllerProvider.notifier).selectTask(inventory);
    await tester.runAsync(h.logger.connect);
    await tester.pumpWidget(h.wrap(const SessionScreen()));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    return h;
  }

  Future<List<Map<String, Object?>>> payloads(
    WidgetTester tester,
    TestHarness h,
    String type,
  ) async {
    final repo = h.container.read(fieldRepositoryProvider);
    final id = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(() => repo.events(id)))!;
    return [
      for (final e in events)
        if (e.eventType == type)
          (jsonDecode(e.payload) as Map).cast<String, Object?>(),
    ];
  }

  testWidgets('scan screen: field instruction and "Bir kişi itiraz etti"', (
    tester,
  ) async {
    final h = await recording(tester);
    expect(find.text(fieldInstruction), findsOneWidget);

    await tapVisible(tester, find.byKey(const Key('notice-objection')));
    await tester.pumpAndSettle();
    FilledButton save() =>
        tester.widget<FilledButton>(find.byKey(const Key('objection-save')));
    expect(save().onPressed, isNull, reason: 'a note is required');
    expect(find.text(noteHint), findsOneWidget);
    await tester.enterText(
      find.byKey(const Key('objection-note')),
      'Komşu 0532 123 45 67',
    );
    await tester.pump();
    expect(find.text('Telefon numarası yazmayın'), findsOneWidget);
    expect(save().onPressed, isNull);
    await tester.enterText(
      find.byKey(const Key('objection-note')),
      'Doğu kenarı, S1 sırası',
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('objection-save')));
    await settle(tester);
    await tester.pump();
    expect(find.textContaining('daha sonra taranacak'), findsOneWidget);
    expect(find.text('Bir kişi itiraz etti (1)'), findsOneWidget);

    expect(await payloads(tester, h, 'field_notice_objection'), [
      {'note': 'Doğu kenarı, S1 sırası'},
    ]);
    // Phone-side only: no logger command besides start.
    expect(h.logger.receivedCommands.whereType<MarkEvent>(), isEmpty);
    final queued = (await tester.runAsync(
      h.container.read(fieldRepositoryProvider).outbox.pending,
    ))!;
    expect(
      queued.where((e) => e.entityType == OutboxEntity.sessionEvent),
      hasLength(
        (await tester.runAsync(
          () => h.container
              .read(fieldRepositoryProvider)
              .events(h.container.read(sessionControllerProvider).sessionId!),
        ))!.length,
      ),
      reason: 'every event is queued',
    );
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('oral notice: "not given" needs a note; newest answer kept', (
    tester,
  ) async {
    final h = await recording(tester);
    await tester.pumpWidget(
      h.wrap(
        const Scaffold(body: SingleChildScrollView(child: VerbalNoticeCard())),
      ),
    );
    await settle(tester);
    expect(find.byKey(const Key('verbal-notice-save')), findsNothing);

    FilledButton save() => tester.widget<FilledButton>(
      find.byKey(const Key('verbal-notice-save')),
    );
    await tapVisible(tester, find.byKey(const Key('verbal-notice-not_given')));
    await tester.pump();
    expect(find.text('Neden verilemedi?'), findsOneWidget);
    expect(save().onPressed, isNull);
    await tester.enterText(
      find.byKey(const Key('verbal-notice-note')),
      'Bekçi konuşmak istemedi',
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('verbal-notice-save')));
    await settle(tester);
    expect(
      h.container.read(sessionControllerProvider).verbalNotice,
      VerbalNotice.notGiven,
    );

    await tapVisible(tester, find.byKey(const Key('verbal-notice-given')));
    await tester.enterText(find.byKey(const Key('verbal-notice-note')), '');
    await tester.pump();
    await tester.tap(find.byKey(const Key('verbal-notice-save')));
    await settle(tester);
    expect(
      find.text('Kaydedildi: ${VerbalNotice.given.label}'),
      findsOneWidget,
    );
    expect(await payloads(tester, h, 'field_notice_verbal'), [
      {'answer': 'not_given', 'note': 'Bekçi konuşmak istemedi'},
      {'answer': 'given'},
    ]);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('boundary: who shows it, with the oral notice script', (
    tester,
  ) async {
    final h = await recording(tester);
    await tester.pumpWidget(h.wrap(const BoundaryScreen()));
    await settle(tester);
    expect(find.textContaining(pointerNoticeScript), findsOneWidget);
    expect(find.text('Telefon numarasını yazmayın.'), findsOneWidget);

    FilledButton save() => tester.widget<FilledButton>(
      find.byKey(const Key('boundary-pointer-save')),
    );
    final name = find.byKey(const Key('boundary-pointer-name'));
    await tester.enterText(name, 'Mehmet 05321234567');
    await tapVisible(
      tester,
      find.byKey(const Key('boundary-pointer-role-worker')),
    );
    await tester.pump();
    expect(find.text('Telefon numarası yazmayın'), findsOneWidget);
    expect(save().onPressed, isNull);
    await tester.enterText(name, 'Mehmet Demir');
    await tester.pump();
    expect(save().onPressed, isNotNull);
    await tapVisible(tester, find.byKey(const Key('boundary-pointer-save')));
    await settle(tester);
    expect(
      find.text('Kaydedildi: Mehmet Demir · İşçi / bekçi'),
      findsOneWidget,
    );
    expect(save().onPressed, isNull, reason: 'nothing changed');

    expect(await payloads(tester, h, 'boundary_pointer'), [
      {'name': 'Mehmet Demir', 'role': 'worker'},
    ]);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('today: "Ziyaret yapılamadı" with reason, photo and note', (
    tester,
  ) async {
    tallView(tester);
    final h = TestHarness(
      photos: [SyntheticPhotoKind.sharp],
      tasks: (h) => CachedTaskRepository(
        source: _Source(),
        cache: TaskCacheStore(h.db),
        clock: h.clock,
        userId: () => 'field-user',
      ),
    );
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);
    await tester.pump();
    // Only planned scan visits: the tour has no blocked record here.
    expect(find.byKey(const Key('task-blocked-v-1')), findsOneWidget);
    expect(find.byKey(const Key('task-blocked-tour-1')), findsNothing);

    await tester.tap(find.byKey(const Key('task-blocked-v-1')));
    await tester.pumpAndSettle();
    final save = find.descendant(
      of: find.byKey(const Key('blocked-save')),
      matching: find.byType(FilledButton),
    );
    bool canSave() => tester.widget<FilledButton>(save).onPressed != null;
    expect(canSave(), isFalse);

    // Owner cause: a photo and a note are required.
    await tapVisible(tester, find.byKey(const Key('blocked-gate_closed')));
    await tester.pump();
    expect(find.byKey(const Key('blocked-evidence-hint')), findsOneWidget);
    expect(canSave(), isFalse);
    await tester.enterText(
      find.byKey(const Key('blocked-note')),
      'Kapı kilitli, iki kez seslendik',
    );
    await tester.pump();
    expect(canSave(), isFalse, reason: 'no photo yet');

    await tapVisible(tester, find.byKey(const Key('blocked-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('camera-shutter')));
    await settle(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('review-use')));
    await tester.pumpAndSettle();
    await settle(tester);
    expect(find.text('1 fotoğraf (zaman damgalı)'), findsOneWidget);
    expect(canSave(), isTrue);

    await tapVisible(tester, find.byKey(const Key('blocked-save')));
    await settle(tester);
    await tester.pumpAndSettle();
    await settle(tester);
    expect(find.byType(TodayScreen), findsOneWidget);
    expect(find.byKey(const Key('task-blocked')), findsOneWidget);

    final repo = h.container.read(fieldRepositoryProvider);
    final session = (await tester.runAsync(() => repo.session('v-1')))!;
    expect(session.status, blockedSessionStatus);
    final event = (await tester.runAsync(() => repo.events('v-1')))!.single;
    expect(event.eventType, 'visit_blocked');
    expect(jsonDecode(event.payload), {
      'reason': 'customer',
      'detail': 'gate_closed',
      'note': 'Kapı kilitli, iki kez seslendik',
      'photo_count': 1,
    });
    final captures = (await tester.runAsync(() => repo.captures('v-1')))!;
    expect(captures.single.kind, blockedVisitPhotoKind);
    expect(captures.single.subjectType, 'event');
    expect(captures.single.subjectId, event.id);
    final queued = (await tester.runAsync(repo.outbox.pending))!;
    expect(
      [for (final e in queued) e.entityType],
      [OutboxEntity.capture, OutboxEntity.sessionEvent],
    );

    // The obstacle is gone the same day (H15): the visit can still be
    // scanned through the pre-check and the controller's start.
    await tester.tap(find.byKey(const Key('task-v-1')));
    await tester.pumpAndSettle();
    expect(find.byType(PrecheckScreen), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('gnss-connect')));
    await settle(tester);
    h.logger.status = FakeGnssLogger.healthyStatus;
    await tapVisible(tester, find.byKey(const Key('check-lens')));
    await tapVisible(tester, find.byKey(const Key('check-camera')));
    await tapVisible(tester, find.byKey(const Key('check-platform-walk')));
    await tester.enterText(
      find.byKey(const Key('check-camera-height')),
      '1,85',
    );
    await tapVisible(tester, find.byKey(const Key('check-spraying-none')));
    await tapVisible(tester, find.byKey(const Key('check-notice-sign-yes')));
    await tapVisible(tester, find.byKey(const Key('check-notice-badge-yes')));
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('precheck-continue')));
    await tester.pumpAndSettle();
    expect(find.byType(SessionScreen), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    final state = h.container.read(sessionControllerProvider);
    expect(state.phase, SessionPhase.recording, reason: '${state.error}');
    expect(state.sessionId, 'v-1');
    final started = (await tester.runAsync(() => repo.session('v-1')))!;
    expect(started.status, 'recording');
    final types = [
      for (final e in (await tester.runAsync(() => repo.events('v-1')))!)
        e.eventType,
    ];
    expect(types, containsAll(['visit_blocked', 'session_start']));
    expect(types.where((t) => t == 'visit_blocked'), hasLength(1));
    // Back on the task list the visit counts as recorded, not blocked.
    tester
        .state<NavigatorState>(find.byType(Navigator))
        .popUntil((r) => r.isFirst);
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.byType(TodayScreen), findsOneWidget);
    expect(find.byKey(const Key('task-blocked')), findsNothing);
    expect(find.text('Tamamlandı'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('task-v-1')),
        matching: find.byIcon(Icons.check_circle),
      ),
      findsOneWidget,
    );
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('summary: an inventory needs the boundary pointer to finish', (
    tester,
  ) async {
    final h = await recording(tester);
    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    FilledButton finish() => tester.widget<FilledButton>(
      find.descendant(
        of: find.byKey(const Key('summary-finish')),
        matching: find.byType(FilledButton),
      ),
    );
    await tapVisible(tester, find.byKey(const Key('verbal-notice-nobody')));
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('verbal-notice-save')));
    await settle(tester);
    expect(finish().onPressed, isNull, reason: 'no boundary pointer yet');

    await tester.enterText(
      find.byKey(const Key('boundary-pointer-name')),
      'Ayşe Kaya',
    );
    await tapVisible(
      tester,
      find.byKey(const Key('boundary-pointer-role-owner')),
    );
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('boundary-pointer-save')));
    await settle(tester);
    expect(finish().onPressed, isNotNull);
    expect(await payloads(tester, h, 'boundary_pointer'), [
      {'name': 'Ayşe Kaya', 'role': 'owner'},
    ]);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });

  testWidgets('corner note and visit log refuse phone numbers', (tester) async {
    final h = await recording(tester);
    await tester.pumpWidget(h.wrap(const VisitLogScreen()));
    await settle(tester);
    FilledButton logSave() =>
        tester.widget<FilledButton>(find.byKey(const Key('visit-log-save')));
    expect(find.text(noteHint), findsOneWidget);
    final issues = find.byKey(const Key('visit-log-issues'));
    await tester.enterText(issues, 'Bekçi 0532/123/45/67 aradı');
    await tester.pump();
    expect(find.text('Telefon numarası yazmayın'), findsOneWidget);
    expect(logSave().onPressed, isNull);
    await tester.enterText(issues, '28.10.2026 09:30 yağmur başladı');
    await tester.pump();
    expect(find.text('Telefon numarası yazmayın'), findsNothing);
    expect(logSave().onPressed, isNotNull);
    await tester.pump(const Duration(seconds: 5));
    await h.dispose(tester);
  });
}

class _Source implements TaskSource {
  @override
  Future<List<FieldTask>> fetch({
    required String userId,
    required DateTime today,
  }) async => [
    FieldTask(
      id: 'v-1',
      visitId: 'v-1',
      orgId: 'org-1',
      parcelId: 'P-12',
      parcelName: 'Örnek P-1',
      village: 'Kızılburç',
      kind: VisitKind.periodic,
      season: Season.winter,
      areaDecare: 19.6,
      plannedDate: today,
    ),
    FieldTask(
      id: 'tour-1',
      visitId: 'tour-1',
      orgId: 'org-1',
      parcelId: 'P-12',
      parcelName: 'Örnek P-1',
      village: 'Kızılburç',
      kind: VisitKind.verification,
      season: Season.winter,
      areaDecare: 19.6,
      plannedDate: today,
    ),
  ];
}
