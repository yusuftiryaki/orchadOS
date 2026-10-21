import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/features/map/vector_map.dart';
import 'package:orchados_field/features/route/grid_route.dart';
import 'package:orchados_field/features/route/route_store.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/summary/visit_summary_screen.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

void main() {
  // Sample parcel: 10 rows 8 m apart (west to east), 22 positions 7 m apart
  // (south to north), boundary 5 m out; numbering from the south-west.
  final periodic = FakeTaskRepository.sampleTasks[0];
  final inventory = FakeTaskRepository.sampleTasks[1];
  final proj = LocalProjection(sampleOrigin);

  Future<TestHarness> recording(
    WidgetTester tester,
    FieldTask task, {
    GeoPoint? at,
  }) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    h.container.read(sessionControllerProvider.notifier).selectTask(task);
    h.logger.position = at;
    await tester.runAsync(h.logger.connect);
    await tester.pumpWidget(h.wrap(const SessionScreen()));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    return h;
  }

  /// Walks from [a] to [b] at 1 m/s, one status message per second.
  Future<void> walk(WidgetTester tester, TestHarness h, Enu a, Enu b) async {
    final steps = (b - a).length.ceil();
    for (var k = 0; k <= steps; k++) {
      h.logger.position = proj.toGeo(a + (b - a) * (k / steps));
      h.logger.tick();
      h.clock.advance(const Duration(seconds: 1));
      if (k % 20 == 0) await tester.pump();
    }
    await settle(tester);
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data!;

  VectorMap map(WidgetTester tester) =>
      tester.widget<VectorMap>(find.byKey(const Key('coverage-map')));

  testWidgets('route on the map, next corridor, skip, back, summary', (
    tester,
  ) async {
    final h = await recording(
      tester,
      periodic,
      at: proj.toGeo(const Enu(4, -23.5)),
    );
    final route = h.container.read(sessionControllerProvider).route!.route!;
    // 9 corridors between the rows, 11 cross corridors, 4 edges.
    expect(route.count(CorridorKind.along), 9);
    expect(route.count(CorridorKind.cross), 11);
    expect(route.count(CorridorKind.edge), 4);
    final n = route.corridors.length;

    expect(find.byKey(const Key('route-card')), findsOneWidget);
    expect(text(tester, 'route-current'), '1. S1 ile S2 arası');
    expect(text(tester, 'route-progress'), '0 / $n koridor bitti');
    // 20 m south of the first corridor's start.
    expect(text(tester, 'route-to-start'), 'Koridorun başına 20 m, kuzeyde.');
    expect(text(tester, 'route-remaining'), startsWith('Kalan: $n koridor · '));
    // Every corridor on the map; the current one last and thickest.
    var lines = map(tester).lines;
    expect(lines, hasLength(n));
    expect(lines.last.width, 6);
    expect(lines.last.points.first, route.corridors.first.start);

    // Walk the first corridor (south to north).
    await walk(tester, h, const Enu(4, -23.5), const Enu(4, -3.5));
    expect(text(tester, 'route-walked'), contains('%0'));
    await walk(tester, h, const Enu(4, -3.5), const Enu(4, 152.5));
    expect(text(tester, 'route-progress'), '1 / $n koridor bitti');
    expect(text(tester, 'route-current'), '2. S2 ile S3 arası');
    expect(text(tester, 'route-to-start'), 'Koridorun başına 8 m, doğuda.');
    lines = map(tester).lines;
    expect(lines.first.color.a, closeTo(0.25, 0.01), reason: 'done: faded');
    expect(lines.last.points.first, route.corridors[1].start);

    // Into corridor 2, then off it by 9 m: warned.
    await walk(tester, h, const Enu(12, 150), const Enu(12, 130));
    expect(find.byKey(const Key('route-off')), findsNothing);
    await walk(tester, h, const Enu(12, 130), const Enu(21, 130));
    expect(
      text(tester, 'route-off').startsWith('Koridordan 9 m saptınız'),
      isTrue,
    );

    // Skip corridor 2, look at 3, go back to 2, skip it again.
    await tapVisible(tester, find.byKey(const Key('route-skip')));
    await tester.pump();
    expect(text(tester, 'route-progress'), '1 / $n koridor bitti · 1 atlandı');
    expect(text(tester, 'route-current'), '3. S3 ile S4 arası');
    expect(map(tester).lines.any((l) => l.dashed), isTrue);
    await tapVisible(tester, find.byKey(const Key('route-back')));
    await tester.pump();
    expect(text(tester, 'route-current'), '2. S2 ile S3 arası');
    expect(text(tester, 'route-progress'), '1 / $n koridor bitti');
    await tapVisible(tester, find.byKey(const Key('route-skip')));
    await tester.pump();

    // Stop: progress stored with the visit, skipped corridors in the summary.
    final controller = h.container.read(sessionControllerProvider.notifier);
    await tester.runAsync(() async {
      await controller.qrShown(
        QrMoment.start,
        'OQ1:1:x',
        h.container.read(gpsClockProvider).now(),
      );
      await controller.qrShown(
        QrMoment.end,
        'OQ1:2:x',
        h.container.read(gpsClockProvider).now(),
      );
      expect(await controller.stop(), isTrue);
    });
    final id = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(
      () => h.container.read(fieldRepositoryProvider).events(id),
    ))!;
    final progress = events.singleWhere((e) => e.eventType == 'route_progress');
    expect(progress.payload, '1/$n');
    final data = jsonDecode(progress.dataJson!) as Map;
    expect(data['done'], [1]);
    expect(data['skipped'], [2]);
    expect(data['skipped_labels'], ['S2 ile S3 arası']);
    expect(data['current'], 3);

    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.text('1 / $n koridor'), findsOneWidget);
    expect(
      text(tester, 'summary-route-skipped'),
      'Atlanan koridorlar: 2. S2 ile S3 arası.',
    );
    await h.dispose(tester);
  });

  testWidgets('dur-çek-yürü: a beep and "DUR" every 4 m, can be turned off', (
    tester,
  ) async {
    final h = await recording(
      tester,
      periodic,
      at: proj.toGeo(const Enu(4, 0)),
    );
    expect(find.byKey(const Key('route-stopgo-indicator')), findsNothing);
    await tapVisible(tester, find.byKey(const Key('route-stopgo')));
    await tester.pump();
    expect(text(tester, 'route-walk-now'), 'Yürü · sonraki bip 4,0 m · 0 bip');

    await walk(tester, h, const Enu(4, 0), const Enu(4, 3));
    expect(h.beeper.count, 0);
    expect(text(tester, 'route-walk-now'), contains('sonraki bip 1,0 m'));
    await walk(tester, h, const Enu(4, 3), const Enu(4, 4));
    expect(h.beeper.count, 1);
    expect(text(tester, 'route-stop-now'), 'DUR · 2 sn');

    // Standing still for 3 s: back to walking.
    for (var k = 0; k < 3; k++) {
      h.clock.advance(const Duration(seconds: 1));
      h.logger.tick();
    }
    await settle(tester);
    expect(text(tester, 'route-walk-now'), contains('1 bip'));

    await walk(tester, h, const Enu(4, 4), const Enu(4, 12.5));
    expect(h.beeper.count, 3);

    await tapVisible(tester, find.byKey(const Key('route-stopgo')));
    await tester.pump();
    expect(find.byKey(const Key('route-stopgo-indicator')), findsNothing);
    await walk(tester, h, const Enu(4, 12.5), const Enu(4, 30));
    expect(h.beeper.count, 3);
    await h.dispose(tester);
  });

  testWidgets('first inventory: route after the corners, direction by taps', (
    tester,
  ) async {
    const origin = GeoPoint(37.07, 37.39);
    final p = LocalProjection(origin);
    final h = await recording(tester, inventory, at: origin);
    expect(
      text(tester, 'route-missing'),
      startsWith('Rota için parselin sınırı gerekli'),
    );

    // Corners of a 60 m (east–west) × 40 m field.
    final controller = h.container.read(sessionControllerProvider.notifier);
    for (final at in const [Enu(0, 0), Enu(60, 0), Enu(60, 40), Enu(0, 40)]) {
      h.logger.position = p.toGeo(at);
      h.logger.tick();
      await settle(tester);
      await tester.runAsync(controller.markCorner);
      await settle(tester);
    }
    var view = h.container.read(sessionControllerProvider).route!;
    expect(view.committed, isFalse);
    expect(view.route!.azimuthSource, AzimuthSource.boundary);
    expect(view.route!.azimuthDeg, closeTo(90, 0.01));
    expect(
      text(tester, 'route-proposal'),
      'Sıra yönü sınırın en uzun kenarından tahmin edildi.',
    );
    expect(map(tester).lines.every((l) => l.dashed), isTrue);

    // The rows actually run north–south: tap both ends of one.
    await tapVisible(tester, find.byKey(const Key('route-direction')));
    await tester.pump();
    expect(text(tester, 'route-direction-hint'), contains('(1 / 2)'));
    await tester.ensureVisible(find.byKey(const Key('coverage-map')));
    await tester.pump();
    final c = tester.getCenter(find.byKey(const Key('coverage-map')));
    await tester.tapAt(c + const Offset(0, -60));
    await tester.pump();
    expect(text(tester, 'route-direction-hint'), contains('(2 / 2)'));
    await tester.tapAt(c + const Offset(0, 60));
    await tester.pump();
    view = h.container.read(sessionControllerProvider).route!;
    expect(view.route!.azimuthSource, AzimuthSource.crew);
    expect(view.route!.azimuthDeg, closeTo(0, 0.5));
    expect(
      text(tester, 'route-proposal'),
      'Sıra yönü sizin işaretlediğiniz gibi.',
    );

    await tapVisible(tester, find.byKey(const Key('route-use')));
    await tester.pump();
    view = h.container.read(sessionControllerProvider).route!;
    expect(view.committed, isTrue);
    expect(find.byKey(const Key('route-current')), findsOneWidget);
    // More corners no longer change the route in use.
    final hash = view.route!.contentHash;
    h.logger.position = p.toGeo(const Enu(-10, 20));
    h.logger.tick();
    await settle(tester);
    await tester.runAsync(controller.markCorner);
    await settle(tester);
    expect(
      h.container.read(sessionControllerProvider).route!.route!.contentHash,
      hash,
    );
    await h.dispose(tester);
  });

  /// [task] with [route] as the parcel's stored route.
  FieldTask withRoute(FieldTask task, StoredRoute route) =>
      FieldTask.fromJson({...task.toJson(), 'route': route.toJson()});

  Future<List<Map<String, Object?>>> routeEvents(
    WidgetTester tester,
    TestHarness h,
  ) async {
    final id = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(
      () => h.container.read(fieldRepositoryProvider).events(id),
    ))!;
    return [
      for (final e in events)
        if (e.eventType == 'route')
          (jsonDecode(e.dataJson!) as Map).cast<String, Object?>(),
    ];
  }

  testWidgets('the parcel\'s stored route is used as it is', (tester) async {
    // Stored from an earlier visit: laid out from the north-east corner.
    final earlier = generateGridRoute(
      RouteInput.forTask(
        FieldTask.fromJson({...periodic.toJson(), 'origin_corner': 'ne'}),
      ),
    ).route!;
    final stored = StoredRoute(
      id: routeId(periodic.parcelId, earlier.contentHash),
      parcelId: periodic.parcelId,
      version: 3,
      route: earlier,
    );
    final h = await recording(
      tester,
      withRoute(periodic, stored),
      at: proj.toGeo(const Enu(4, -23.5)),
    );
    expect(text(tester, 'route-current'), '1. S9 ile S10 arası');
    expect(text(tester, 'route-version'), 'Parselin rotası, sürüm 3');
    final events = await routeEvents(tester, h);
    expect(events.single['route_id'], stored.id);
    expect(events.single['route_version'], 3);
    expect(events.single['new_version'], isFalse);
    final local = await tester.runAsync(
      () => h.db.select(h.db.parcelRoutes).get(),
    );
    expect(local, isEmpty, reason: 'nothing new to store');
    await h.dispose(tester);
  });

  testWidgets(
    'a first route is stored; the next visit on the phone reuses it',
    (tester) async {
      final h = await recording(tester, periodic);
      final first = h.container.read(sessionControllerProvider).route!.stored!;
      expect(first.version, 1);
      expect(text(tester, 'route-version'), 'Parselin rotası, sürüm 1');
      expect((await routeEvents(tester, h)).single['new_version'], isTrue);
      final rows = (await tester.runAsync(
        () => h.db.select(h.db.parcelRoutes).get(),
      ))!;
      expect(rows.single.id, first.id);
      expect(rows.single.version, 1);
      expect(rows.single.synced, isFalse);

      // Back to the task list without finishing upload: a second visit of the
      // same parcel (another planned visit) gets the same route.
      final controller = h.container.read(sessionControllerProvider.notifier);
      await tester.runAsync(() async {
        await controller.qrShown(
          QrMoment.start,
          'OQ1:1:x',
          h.container.read(gpsClockProvider).now(),
        );
        await controller.qrShown(
          QrMoment.end,
          'OQ1:2:x',
          h.container.read(gpsClockProvider).now(),
        );
        await controller.stop();
        await controller.finish();
      });
      controller.selectTask(
        FieldTask.fromJson({...periodic.toJson(), 'id': 'task-1b'}),
      );
      await tester.pumpWidget(h.wrap(const SessionScreen()));
      await settle(tester);
      await tapVisible(tester, find.byKey(const Key('session-start')));
      await settle(tester);
      final second = h.container.read(sessionControllerProvider).route!.stored!;
      expect(second.id, first.id);
      expect(second.version, 1);
      expect((await routeEvents(tester, h)).single['new_version'], isFalse);
      expect(
        await tester.runAsync(() => h.db.select(h.db.parcelRoutes).get()),
        hasLength(1),
      );
      await h.dispose(tester);
    },
  );

  testWidgets('a route from before the inventory gives way to the rows', (
    tester,
  ) async {
    final before = generateGridRoute(
      RouteInput(boundary: periodic.boundary, parcelAzimuthDeg: 0),
    ).route!;
    expect(before.basis, RouteBasis.boundary);
    final stored = StoredRoute(
      id: routeId(periodic.parcelId, before.contentHash),
      parcelId: periodic.parcelId,
      version: 1,
      route: before,
    );
    final h = await recording(tester, withRoute(periodic, stored));
    final view = h.container.read(sessionControllerProvider).route!;
    expect(view.route!.basis, RouteBasis.inventory);
    expect(view.stored!.version, 2);
    expect(text(tester, 'route-current'), '1. S1 ile S2 arası');
    final e = (await routeEvents(tester, h)).single;
    expect(e['new_version'], isTrue);
    expect(e['basis'], 'inventory');
    await h.dispose(tester);
  });
}
