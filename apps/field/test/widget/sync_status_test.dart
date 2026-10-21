import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/db/outbox.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';
import 'package:orchados_field/core/sync/connectivity.dart';
import 'package:orchados_field/core/time/gps_clock.dart';
import 'package:orchados_field/features/sync/sync_status_card.dart';
import 'package:orchados_field/features/tasks/today_screen.dart';

import '../support/fake_sync_server.dart';
import '../support/test_app.dart';

const visitId = 'v-1';

/// A finished visit on the phone: 1 session, 1 event, 1 photo, 2 answers,
/// 2 session updates = 7 queued records.
Future<void> recordVisit(WidgetTester tester, TestHarness h) =>
    tester.runAsync(() async {
      final repo = h.container.read(fieldRepositoryProvider);
      final now = h.clock.now();
      await repo.createSession(
        id: visitId,
        parcelId: 'P-12',
        taskId: 'task-1',
        visitKind: 'periodic',
        startedAt: now,
        startGpsTimeMs: 1,
      );
      await repo.addEvent(
        sessionId: visitId,
        eventType: 'qr_sync',
        payload: 'OQ1:1:visit',
        time: const GpsTimeReading(1, TimeSource.gps),
        loggerResult: 'ok',
      );
      final bytes = Uint8List.fromList([1, 2, 3]);
      final hash = sha256Hex(bytes);
      final path = await h.media.put(bytes, sha256: hash);
      await repo.saveTreeObservation(
        sessionId: visitId,
        treeId: 't-1',
        slotCode: 'S1-1',
        shots: [
          PendingShot(
            shotCode: 'trunk',
            sha256: hash,
            localPath: path,
            mediaType: 'image/jpeg',
            byteSize: 3,
            capturedAt: now,
            gpsTimeMs: 2,
            timeSource: TimeSource.gps,
            quality: judge(
              const QualityScores(
                sharpness: 900,
                meanBrightness: 110,
                darkClippedRatio: 0,
                brightClippedRatio: 0,
                analysisWidth: 480,
                analysisHeight: 360,
              ),
              PhotoQualityConfig.defaults,
            ),
          ),
        ],
        answers: {'dead_branch_present': true, 'pruned': false},
        methodVersion: 'winter-v0',
      );
      await repo.stopSession(visitId, stoppedAt: now, stopGpsTimeMs: 3);
      await repo.closeSession(visitId);
    });

String count(WidgetTester tester, String key) {
  final texts = tester.widgetList<Text>(
    find.descendant(of: find.byKey(Key(key)), matching: find.byType(Text)),
  );
  return texts.first.data!;
}

String status(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('sync-status'))).data!;

void main() {
  testWidgets('offline at start, then "Şimdi gönder" sends everything', (
    tester,
  ) async {
    final server = FakeSyncServer(visits: {visitId: 'planned'})..offline = true;
    final h = TestHarness(server: server);
    await recordVisit(tester, h);

    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);
    await settle(tester);

    // The first pass ran when the screen opened and hit the network.
    expect(count(tester, 'sync-pending'), '7');
    expect(count(tester, 'sync-sent'), '0');
    expect(count(tester, 'sync-failed'), '0');
    expect(status(tester), contains('İnternet yok ya da zayıf'));
    expect(find.byKey(const Key('sync-failed-warning')), findsNothing);
    expect(h.media.files, hasLength(1));

    server.offline = false;
    await tester.tap(find.byKey(const Key('sync-now')));
    for (var i = 0; i < 4; i++) {
      await settle(tester);
    }

    expect(count(tester, 'sync-pending'), '0');
    expect(count(tester, 'sync-sent'), '7');
    expect(status(tester), 'Her şey gönderildi');
    expect(server.visits[visitId], 'captured');
    expect(server.table('measurement'), hasLength(2));
    // Sent and verified: the photo left the phone.
    expect(h.media.files, isEmpty);

    await h.dispose(tester);
  });

  testWidgets('a refused record shows a plain warning and its reason', (
    tester,
  ) async {
    final server = FakeSyncServer(visits: {visitId: 'planned'})
      ..refuse = (table, row) => table == 'measurement' ? 'forbidden' : null;
    final h = TestHarness(server: server);
    await recordVisit(tester, h);

    await tester.pumpWidget(h.wrap(const TodayScreen()));
    for (var i = 0; i < 4; i++) {
      await settle(tester);
    }

    expect(count(tester, 'sync-failed'), '2');
    expect(count(tester, 'sync-sent'), '5');
    expect(count(tester, 'sync-pending'), '0');
    expect(
      find.textContaining('2 kayıt sunucuya kabul edilmedi'),
      findsOneWidget,
    );

    await tapVisible(tester, find.byKey(const Key('sync-failed-details')));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.text('Cevap'), findsNWidgets(2));
    expect(find.textContaining('forbidden'), findsNWidgets(2));

    // The office fixed the cause: "Yeniden dene".
    server.refuse = null;
    await tester.tap(find.byKey(const Key('sync-retry-failed')));
    for (var i = 0; i < 4; i++) {
      await settle(tester);
    }
    await tester.pumpAndSettle();
    expect(count(tester, 'sync-failed'), '0');
    expect(count(tester, 'sync-sent'), '7');
    expect(find.byKey(const Key('sync-failed-warning')), findsNothing);

    await h.dispose(tester);
  });

  testWidgets('the network coming back starts a pass', (tester) async {
    final server = FakeSyncServer(visits: {visitId: 'planned'})..offline = true;
    final network = ManualConnectivityMonitor();
    final h = TestHarness(server: server, connectivity: network);
    await recordVisit(tester, h);
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);
    expect(count(tester, 'sync-pending'), '7');

    server.offline = false;
    network.set(true);
    for (var i = 0; i < 4; i++) {
      await settle(tester);
    }
    expect(count(tester, 'sync-sent'), '7');

    await h.dispose(tester);
    await network.dispose();
  });

  testWidgets('without a server the queue waits and the button is off', (
    tester,
  ) async {
    final h = TestHarness();
    await recordVisit(tester, h);
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);

    expect(count(tester, 'sync-pending'), '7');
    expect(status(tester), contains('Sunucu bağlantısı ayarlı değil'));
    final button = tester.widget<ButtonStyleButton>(
      find.byKey(const Key('sync-now')),
    );
    expect(button.onPressed, isNull);

    await h.dispose(tester);
  });

  testWidgets('visit card: "her şey gönderildi" for that visit only', (
    tester,
  ) async {
    final server = FakeSyncServer(visits: {visitId: 'planned'});
    final h = TestHarness(server: server);
    await recordVisit(tester, h);
    await tester.pumpWidget(
      h.wrap(const Scaffold(body: SyncStatusCard(sessionId: visitId))),
    );
    for (var i = 0; i < 4; i++) {
      await settle(tester);
    }
    expect(status(tester), 'Bu ziyaretin her şeyi gönderildi');
    expect(count(tester, 'sync-sent'), '7');

    // Another visit's record waiting does not change this visit's card.
    await tester.runAsync(
      () => h.container
          .read(fieldRepositoryProvider)
          .outbox
          .enqueue(OutboxEntity.session, 'other-visit'),
    );
    await settle(tester);
    expect(status(tester), 'Bu ziyaretin her şeyi gönderildi');

    await h.dispose(tester);
  });
}
