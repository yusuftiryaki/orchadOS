import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:orchados_field/features/tasks/today_screen.dart';
import 'package:orchados_field/features/verification/verification_tour_screen.dart';

import '../support/fake_sync_server.dart';
import '../support/test_app.dart';

void main() {
  final tour = FakeTaskRepository.sampleTasks[2];

  Future<TestHarness> openTour(
    WidgetTester tester, {
    FakeSyncServer? server,
    List<SyntheticPhotoKind> photos = const [],
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness(server: server, photos: photos);
    await tester.pumpWidget(h.wrap(VerificationTourScreen(task: tour)));
    await settle(tester);
    return h;
  }

  Future<void> openItem(WidgetTester tester, String code) async {
    await tapVisible(tester, find.byKey(Key('tour-item-$code')));
    await tester.pumpAndSettle();
    expect(find.text('Yer $code'), findsOneWidget);
  }

  Future<void> save(WidgetTester tester) async {
    await tapVisible(tester, find.byKey(const Key('verify-save')));
    await settle(tester);
    await tester.pumpAndSettle();
    await settle(tester);
  }

  String textOf(WidgetTester tester, Key key) =>
      tester.widget<Text>(find.byKey(key)).data!;

  testWidgets('tree present with photo, tree absent, then the tour is done', (
    tester,
  ) async {
    final server = FakeSyncServer(parcels: {tour.parcelId: 'org-1'});
    final h = await openTour(
      tester,
      server: server,
      photos: [SyntheticPhotoKind.sharp],
    );

    expect(textOf(tester, const Key('tour-progress')), '0 / 3 kaleme bakıldı');
    expect(find.byKey(const Key('tour-no-position')), findsOneWidget);
    // Walking order: row 2 first, along the row.
    final cards = tester
        .widgetList<Card>(
          find.byWidgetPredicate((w) => w is Card && w.key is ValueKey<String>),
        )
        .map((c) => (c.key! as ValueKey<String>).value)
        .where((k) => k.startsWith('tour-item-'))
        .toList();
    expect(cards, ['tour-item-S2-4', 'tour-item-S2-9', 'tour-item-S5-12']);
    expect(find.text('S2 sırasında, güneyden 4. yer'), findsOneWidget);
    expect(find.text('Boş yer · Fidan olabilir'), findsOneWidget);
    expect(find.text('Not: Panoramada fidan seçilemedi'), findsOneWidget);

    // The logger sends a position 30 m south of S2-4: distance and direction.
    final proj = LocalProjection(sampleOrigin);
    h.logger.position = proj.toGeo(const Enu(8, 21 - 30));
    await tester.runAsync(h.logger.connect);
    await settle(tester);
    expect(find.byKey(const Key('tour-no-position')), findsNothing);
    expect(find.text('30 m kuzeyde'), findsOneWidget);

    // S2-4: tree present, close-up, note.
    await openItem(tester, 'S2-4');
    expect(
      textOf(tester, const Key('verify-route')),
      'S2 sırasında, güneyden 4. yer',
    );
    expect(textOf(tester, const Key('verify-distance')), '30 m kuzeyde');
    expect(find.text('Kayıtta bu yer boş.'), findsOneWidget);
    FilledButton saveButton() => tester.widget<FilledButton>(
      find.descendant(
        of: find.byKey(const Key('verify-save')),
        matching: find.byType(FilledButton),
      ),
    );
    expect(saveButton().onPressed, isNull);
    await tapVisible(tester, find.byKey(const Key('verify-present')));
    await tester.pump();
    expect(saveButton().onPressed, isNotNull);
    await tapVisible(tester, find.byKey(const Key('verify-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('camera-shutter')));
    await settle(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('review-use')));
    await tester.pumpAndSettle();
    await settle(tester);
    expect(find.byKey(const Key('verify-photo-taken')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('verify-note')), 'Fidan var');
    await save(tester);

    expect(textOf(tester, const Key('tour-progress')), '1 / 3 kaleme bakıldı');
    expect(find.text('Ağaç var · fotoğraflı · gönderildi'), findsOneWidget);
    final call = server.verificationResults.single;
    expect(call['p_item_id'], 'vi-1');
    expect(call['p_tree_present'], isTrue);
    expect(call['p_note'], 'Fidan var');
    final capture = server.table('capture').values.single;
    expect(call['p_closeup_capture_id'], capture['id']);
    expect(capture['session_id'], tour.visitId ?? tour.id);

    // S2-9: no tree, no photo.
    await openItem(tester, 'S2-9');
    expect(find.text('Kayıtta bu yerde ağaç var.'), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('verify-absent')));
    await tester.pump();
    await save(tester);
    expect(server.verificationResults.last['p_tree_present'], isFalse);
    expect(server.verificationResults.last['p_closeup_capture_id'], isNull);

    await openItem(tester, 'S5-12');
    await tapVisible(tester, find.byKey(const Key('verify-present')));
    await tester.pump();
    await save(tester);

    expect(textOf(tester, const Key('tour-progress')), '3 / 3 kaleme bakıldı');
    expect(find.byKey(const Key('tour-all-done')), findsOneWidget);
    expect(server.verificationResults, hasLength(3));
    // The tour's session row is never written by the app.
    expect(server.calls.where((c) => c.startsWith('visit')), isEmpty);

    await tapVisible(tester, find.byKey(const Key('tour-finish')));
    await settle(tester);
    expect(h.container.read(completedTasksProvider), contains(tour.id));
    await h.dispose(tester);
  });

  testWidgets('offline: results wait; a closed item shows a plain message', (
    tester,
  ) async {
    final server = FakeSyncServer(parcels: {tour.parcelId: 'org-1'})
      ..offline = true
      ..refuse = (table, row) =>
          table == 'record_verification_result' && row['p_item_id'] == 'vi-3'
          ? 'item_closed'
          : null;
    final h = await openTour(tester, server: server);

    await openItem(tester, 'S5-12');
    expect(find.text('Neden: Çok gövdeli olabilir'), findsOneWidget);
    expect(find.text('Ofisin notu: Dipte iki gövde mi?'), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('verify-absent')));
    await tester.pump();
    await save(tester);
    expect(find.text('Ağaç yok · gönderilecek'), findsOneWidget);
    expect(server.verificationResults, isEmpty);

    // Signal comes back: the office had closed the item meanwhile.
    server.offline = false;
    await tester.runAsync(
      () => h.container.read(syncWorkerProvider)!.syncNow(),
    );
    await settle(tester);
    expect(find.text('Gönderilemeyenler'), findsOneWidget);
    expect(
      textOf(tester, const Key('tour-item-error-S5-12')),
      'Ofis bu kalemi kapatmış; sonucunuz kaydedilmedi. '
      'Gerekirse ofise haber verin.',
    );
    await openItem(tester, 'S5-12');
    expect(find.textContaining('Ofis bu kalemi kapatmış'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await h.dispose(tester);
  });

  testWidgets('today screen: the tour is its own kind of task', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);
    expect(find.text('Doğrulama turu · Kış'), findsOneWidget);
    expect(find.text('Kızılburç · 0 / 3 kaleme bakıldı'), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('task-task-3')));
    await tester.pumpAndSettle();
    await settle(tester);
    // No pre-check and no recording: straight to the tour.
    expect(find.text('Doğrulama · Kızılburç P-12'), findsOneWidget);
    expect(find.byKey(const Key('tour-progress')), findsOneWidget);
    await h.dispose(tester);
  });
}
