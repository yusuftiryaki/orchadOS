import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/core/sync/sync_rows.dart';
import 'package:orchados_field/features/boundary/boundary_corners.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/map/vector_map.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/summary/visit_summary_screen.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

void main() {
  final inventory = FakeTaskRepository.sampleTasks[1];
  const origin = GeoPoint(37.07, 37.39);
  final proj = LocalProjection(origin);

  testWidgets('corners: mark, reorder, delete last, describe, area', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness(photos: [SyntheticPhotoKind.sharp]);
    final controller = h.container.read(sessionControllerProvider.notifier)
      ..selectTask(inventory);
    h.logger.position = origin;
    await tester.runAsync(h.logger.connect);
    await tester.pumpWidget(h.wrap(const SessionScreen()));
    await settle(tester);

    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('session-start-qr')));
    await settle(tester);
    await tester.tap(find.text('Tamam'));
    await tester.pumpAndSettle();

    await tapVisible(tester, find.byKey(const Key('session-boundary')));
    await tester.pumpAndSettle();
    expect(find.text('RTK fixed · ±1,4 cm · 24 uydu'), findsOneWidget);
    expect(find.text('Alan için en az 3 konumlu köşe gerekir'), findsOneWidget);

    // Walk a 40 × 25 m rectangle, but press at the far corners in the
    // wrong order: (0,0), (40,0), (0,25), (40,25).
    Future<void> cornerAt(Enu at) async {
      h.logger.position = proj.toGeo(at);
      h.logger.tick();
      h.clock.advance(const Duration(seconds: 30));
      h.logger.tick();
      await settle(tester);
      await tapVisible(tester, find.byKey(const Key('boundary-corner')));
      await settle(tester);
    }

    for (final at in const [Enu(0, 0), Enu(40, 0), Enu(0, 25), Enu(40, 25)]) {
      await cornerAt(at);
    }
    expect(find.text('Köşe (4)'), findsOneWidget);
    final marks = h.logger.receivedCommands
        .whereType<MarkEvent>()
        .where((m) => m.type == MarkType.corner)
        .map((m) => m.payload);
    expect(marks, ['1', '2', '3', '4']);
    // Crossed polygon: the shoelace area is not the rectangle's.
    expect(find.text('Yaklaşık alan: 0 m² · 0,0 dönüm'), findsOneWidget);

    // Fix the order: corner 4 goes up one place → (0,0) (40,0) (40,25) (0,25).
    await tapVisible(tester, find.byKey(const Key('corner-up-3')));
    await settle(tester);
    expect(find.text('Yaklaşık alan: 1 000 m² · 1,0 dönüm'), findsOneWidget);
    final map = tester.widget<VectorMap>(find.byKey(const Key('boundary-map')));
    expect(map.draft, hasLength(4));
    expect(map.draft![2].lat, closeTo(proj.toGeo(const Enu(40, 25)).lat, 1e-7));

    // A fifth corner by mistake, then deleted.
    await cornerAt(const Enu(10, 10));
    expect(find.text('Köşe (5)'), findsOneWidget);
    await tapVisible(tester, find.byKey(const Key('boundary-delete-last')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('boundary-delete-confirm')));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.text('Köşe (4)'), findsOneWidget);
    expect(find.text('Yaklaşık alan: 1 000 m² · 1,0 dönüm'), findsOneWidget);

    // Corner 1: boundary stone and road, photo, note.
    await tapVisible(tester, find.byKey(const Key('corner-0')));
    await tester.pumpAndSettle();
    expect(find.text('Köşe 1'), findsWidgets);
    await tapVisible(tester, find.byKey(const Key('marker-stone')));
    await tapVisible(tester, find.byKey(const Key('marker-road')));
    await tester.pump();
    await tapVisible(tester, find.byKey(const Key('corner-photo')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('camera-shutter')));
    await settle(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('review-use')));
    await tester.pumpAndSettle();
    await settle(tester);
    expect(find.text('1 fotoğraf'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('corner-note')), 'Köşe taşı');
    await tapVisible(tester, find.byKey(const Key('corner-save')));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.text('Not: Köşe taşı'), findsOneWidget);
    expect(find.textContaining('Sınır taşı, Yol · 1 fotoğraf'), findsOneWidget);

    // Stored: five corner presses, edits as lists; the newest list wins.
    final state = h.container.read(sessionControllerProvider);
    final repo = h.container.read(fieldRepositoryProvider);
    final events = (await tester.runAsync(
      () => repo.events(state.sessionId!),
    ))!;
    final corners = events.where((e) => e.eventType == 'corner').toList();
    expect(corners, hasLength(5));
    final first = jsonDecode(corners.first.dataJson!) as Map;
    expect(first['corner_no'], 1);
    final pos = first['position'] as Map;
    expect(pos['lat'], closeTo(origin.lat, 1e-7));
    expect(pos['carr_soln'], 'fixed');
    expect(pos['h_acc_m'], 0.014);
    expect(corners.first.timeSource, 'gps');
    expect(
      events.where((e) => e.eventType == 'boundary_corners'),
      hasLength(3),
    );
    final rebuilt = BoundaryCorners.fromEvents(events);
    expect(rebuilt.corners.map((c) => c.cornerNo), [1, 2, 4, 3]);
    expect(rebuilt.corners.first.note, 'Köşe taşı');
    expect(rebuilt.corners.first.markers, [
      BoundaryMarker.stone,
      BoundaryMarker.road,
    ]);
    final photo = (await tester.runAsync(
      () => repo.captures(state.sessionId!),
    ))!.single;
    expect(photo.kind, 'boundary_photo');
    expect(photo.subjectType, 'corner');
    expect(photo.subjectId, rebuilt.corners.first.eventId);
    expect(rebuilt.corners.first.photos, [photo.sha256]);
    final row = captureRow(photo, orgId: 'org-1', parcelId: inventory.parcelId);
    expect(row.containsKey('tree_id'), isFalse);
    expect((row['metadata']! as Map)['corner_event_id'], photo.subjectId);

    // Summary: corner count and area.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Sınır (4 köşe)'), findsOneWidget);
    await tester.runAsync(() async {
      await controller.qrShown(
        QrMoment.end,
        'OQ1:1:x',
        h.container.read(gpsClockProvider).now(),
      );
      await controller.stop();
    });
    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.text('Sınır köşesi'), findsOneWidget);
    expect(find.text('1 000 m² · 1,0 dönüm'), findsOneWidget);
    await h.dispose(tester);
  });

  testWidgets('without a position block the corner still gets its time', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    final controller = h.container.read(sessionControllerProvider.notifier)
      ..selectTask(inventory);
    await tester.runAsync(() async {
      await h.logger.connect();
      expect(await controller.start(), isTrue);
      await controller.qrShown(
        QrMoment.start,
        'OQ1:1:x',
        h.container.read(gpsClockProvider).now(),
      );
      expect(await controller.markCorner(), isTrue);
    });
    final c = h.container
        .read(sessionControllerProvider)
        .boundary
        .corners
        .single;
    expect(c.fix, isNull);
    expect(c.timeSource, 'gps');
    await tester.pumpWidget(h.wrap(const SessionScreen()));
    await tapVisible(tester, find.byKey(const Key('session-boundary')));
    await tester.pumpAndSettle();
    expect(find.text('Kaydediciden konum yok'), findsOneWidget);
    expect(find.textContaining('konum yok'), findsWidgets);
    expect(
      find.text('1 köşenin konumu yok; ofiste GNSS kaydından bulunacak.'),
      findsOneWidget,
    );
    await h.dispose(tester);
  });
}
